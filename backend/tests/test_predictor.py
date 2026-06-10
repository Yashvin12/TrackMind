"""
test_predictor.py — Tests for Module E: ML Prediction Engine.

Tests:
  1. DelayPredictor.predict() — numeric output, valid ranges
  2. DelayPredictor SHAP values — dict with feature names
  3. Analytic fallback — when XGBoost not available
  4. ConflictPredictor — 0..1 probability range
  5. Predictor facade — processes all active trains from snapshot
  6. Completed trains excluded from predictions
  7. Feature extraction edge cases
  8. PredictionResult.to_dict() completeness
  9. API endpoint: GET /kpi/predictions
"""
from __future__ import annotations

import pytest

from app.services.predictor import (
    DelayPredictor,
    ConflictPredictor,
    Predictor,
    PredictionResult,
    FEATURE_NAMES,
)
from tests.conftest import make_train_dict


class FakeSnapshot:
    def __init__(self, trains, block_occupancy=None):
        self.trains = trains
        self.block_occupancy = block_occupancy or {}


# ── Unit: DelayPredictor ──────────────────────────────────────────────────────

class TestDelayPredictor:
    def test_predict_returns_float_delay(self):
        predictor = DelayPredictor()
        train = make_train_dict("T001", delay=5.0, speed=80.0)
        delay, shap = predictor.predict(train, section_load=0.3, hour_of_day=10)
        assert isinstance(delay, float)
        assert delay >= 0.0
        assert delay <= 120.0  # sanity upper bound

    def test_predict_returns_shap_dict(self):
        predictor = DelayPredictor()
        train = make_train_dict("T001", delay=3.0)
        _, shap = predictor.predict(train, section_load=0.5, hour_of_day=14)
        assert isinstance(shap, dict)
        assert len(shap) > 0

    def test_shap_values_are_numeric(self):
        predictor = DelayPredictor()
        train = make_train_dict("T001")
        _, shap = predictor.predict(train)
        for k, v in shap.items():
            assert isinstance(v, float), f"SHAP value for {k} must be float, got {type(v)}"

    def test_high_delay_predicts_higher(self):
        """Train with higher existing delay should predict higher future delay."""
        predictor = DelayPredictor()
        train_low  = make_train_dict("LOW",  delay=0.0, speed=100.0)
        train_high = make_train_dict("HIGH", delay=30.0, speed=50.0)
        delay_low,  _ = predictor.predict(train_low,  section_load=0.1)
        delay_high, _ = predictor.predict(train_high, section_load=0.9)
        assert delay_high > delay_low

    def test_predict_clamps_negative_to_zero(self):
        """Negative delay predictions should be clamped to 0."""
        predictor = DelayPredictor()
        train = make_train_dict("FAST", delay=0.0, speed=120.0)
        delay, _ = predictor.predict(train, section_load=0.0)
        assert delay >= 0.0

    def test_analytic_fallback_when_no_xgboost(self, monkeypatch):
        """Predictor must work without xgboost via analytic fallback."""
        predictor = DelayPredictor()
        predictor._trained = False
        predictor._model = None

        # Prevent actual training
        def fake_train(self):
            self._trained = True
            self._model = None  # force analytic path

        monkeypatch.setattr(DelayPredictor, "_train_synthetic", fake_train)
        train = make_train_dict("T001", delay=4.0)
        delay, shap = predictor.predict(train, section_load=0.4)
        assert isinstance(delay, float)
        assert delay >= 0.0


# ── Unit: Feature Extraction ──────────────────────────────────────────────────

class TestFeatureExtraction:
    def test_feature_count_matches(self):
        train = make_train_dict("T001", delay=5.0, speed=80.0)
        features = DelayPredictor._extract_features(train, section_load=0.3, hour_of_day=12)
        assert len(features) == len(FEATURE_NAMES)

    def test_feature_speed_ratio_clamped_to_one(self):
        """Speed ratio should not exceed 1.0 even if speed > max_speed."""
        train = {**make_train_dict("T001"), "speed_kmh": 200.0, "max_speed_kmh": 100.0}
        features = DelayPredictor._extract_features(train, section_load=0.0, hour_of_day=0)
        speed_ratio_idx = FEATURE_NAMES.index("speed_ratio")
        assert features[speed_ratio_idx] <= 1.0

    def test_path_remaining_is_fraction(self):
        train = {**make_train_dict("T001"), "scheduled_path": ["A", "B", "C", "D"], "path_index": 1}
        features = DelayPredictor._extract_features(train, section_load=0.0, hour_of_day=8)
        path_rem_idx = FEATURE_NAMES.index("path_remaining")
        assert 0.0 <= features[path_rem_idx] <= 1.0

    def test_empty_path_does_not_crash(self):
        train = {**make_train_dict("T001"), "scheduled_path": [], "path_index": 0}
        features = DelayPredictor._extract_features(train, 0.0, 0)
        assert len(features) == len(FEATURE_NAMES)


# ── Unit: ConflictPredictor ───────────────────────────────────────────────────

class TestConflictPredictor:
    def test_probability_range(self):
        predictor = ConflictPredictor()
        prob = predictor.predict_probability(
            section_load=0.8, n_trains_in_block=2,
            avg_delay=10.0, speed_variance=20.0,
            hour=14, load_norm=0.5,
        )
        assert 0.0 <= prob <= 1.0

    def test_high_load_higher_probability(self):
        predictor = ConflictPredictor()
        low_prob  = predictor.predict_probability(0.1, 1, 0.0, 0.0, 12, 0.1)
        high_prob = predictor.predict_probability(0.9, 3, 15.0, 30.0, 8, 0.9)
        assert high_prob >= low_prob

    def test_analytic_fallback_returns_valid(self, monkeypatch):
        predictor = ConflictPredictor()
        predictor._trained = True
        predictor._model = None  # force analytic
        prob = predictor.predict_probability(0.7, 2, 10.0, 0.0, 8, 0.5)
        assert 0.0 <= prob <= 1.0


# ── Unit: Predictor Facade ────────────────────────────────────────────────────

class TestPredictorFacade:
    def test_predict_all_active_trains(self):
        predictor = Predictor()
        trains = {
            "T001": make_train_dict("T001", status="running", delay=3.0, block="BLK_MUM_KLD"),
            "T002": make_train_dict("T002", status="running", delay=7.0, block="BLK_KLD_LNL"),
        }
        snap = FakeSnapshot(trains)
        results = predictor.predict(snap)
        assert len(results) == 2

    def test_completed_trains_excluded(self):
        predictor = Predictor()
        trains = {
            "ACTIVE":    make_train_dict("ACTIVE",    status="running"),
            "COMPLETED": make_train_dict("COMPLETED", status="completed"),
        }
        snap = FakeSnapshot(trains)
        results = predictor.predict(snap)
        train_ids = [r.train_id for r in results]
        assert "ACTIVE" in train_ids
        assert "COMPLETED" not in train_ids

    def test_prediction_result_fields_valid(self):
        predictor = Predictor()
        trains = {"T001": make_train_dict("T001", status="running", delay=4.0)}
        snap = FakeSnapshot(trains)
        results = predictor.predict(snap)
        assert len(results) == 1
        r = results[0]
        assert r.train_id == "T001"
        assert r.future_delay_min >= 0.0
        assert 0.0 <= r.conflict_probability <= 1.0
        assert 0.0 <= r.congestion_level <= 1.0
        assert 0.0 <= r.confidence <= 1.0
        assert isinstance(r.shap_values, dict)

    def test_prediction_result_to_dict(self):
        predictor = Predictor()
        trains = {"T001": make_train_dict("T001", status="running", delay=2.0)}
        snap = FakeSnapshot(trains)
        result = predictor.predict(snap)[0]
        d = result.to_dict()
        assert "train_id" in d
        assert "future_delay_min" in d
        assert "conflict_probability" in d
        assert "congestion_level" in d
        assert "confidence" in d
        assert "shap_values" in d

    def test_empty_snapshot_returns_empty_list(self):
        predictor = Predictor()
        snap = FakeSnapshot({})
        results = predictor.predict(snap)
        assert results == []

    def test_block_occupancy_affects_congestion(self):
        predictor = Predictor()
        block_id = "BLK_MUM_KLD"
        trains_congested = {"T001": make_train_dict("T001", block=block_id)}
        trains_clear     = {"T001": make_train_dict("T001", block=None)}

        snap_congested = FakeSnapshot(trains_congested, {block_id: ["T001", "T002"]})
        snap_clear     = FakeSnapshot(trains_clear,     {})

        results_c = predictor.predict(snap_congested)
        results_l = predictor.predict(snap_clear)
        if results_c and results_l:
            assert results_c[0].congestion_level >= results_l[0].congestion_level


# ── API Endpoint Tests ────────────────────────────────────────────────────────

class TestPredictorAPI:
    @pytest.mark.asyncio
    async def test_kpi_predictions_endpoint_with_simulation(self, client):
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.get("/api/v1/kpi/predictions")
        assert resp.status_code == 200
        body = resp.json()
        assert "predictions" in body
        assert isinstance(body["predictions"], list)

    @pytest.mark.asyncio
    async def test_kpi_predictions_without_simulation_returns_empty(self, client):
        await client.post("/api/v1/simulate/reset")
        resp = await client.get("/api/v1/kpi/predictions")
        assert resp.status_code == 200
        assert resp.json()["predictions"] == []

    @pytest.mark.asyncio
    async def test_prediction_entries_have_valid_structure(self, client):
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.get("/api/v1/kpi/predictions")
        body = resp.json()
        for entry in body["predictions"]:
            assert "train_id" in entry
            assert "future_delay_min" in entry
            assert "conflict_probability" in entry
            assert "shap_values" in entry
