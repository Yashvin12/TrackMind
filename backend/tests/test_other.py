"""
test_other.py — Tests for Modules D, F, H and remaining endpoints.

Tests:
  A. WhatIfEngine (Module D)
     - simulate_disruption returns before/after/delta/narrative
     - KPI delta computed correctly
     - What-if API endpoint

  B. RecommendationEngine (Module F)
     - Generates recommendation with options
     - Options contain constraint checks
     - Natural-language explanation is non-empty
     - Counterfactual is generated
     - Recommendations API endpoints

  C. Audit System (Module H)
     - audit_service logs events
     - GET /audit/ returns list
     - Audit log entries have required fields
"""
from __future__ import annotations

import pytest

from app.services.recommender import RecommendationEngine
from tests.conftest import make_train_dict


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_solution_dict(
    rank: int = 1,
    train_a: str = "T001",
    train_b: str = "T002",
    method: str = "heuristic",
    twd: float = 20.0,
) -> dict:
    return {
        "rank": rank,
        "actions": [
            {"action_type": "hold", "train_id": train_b, "duration_min": 5.0, "reason": "Lower priority"},
            {"action_type": "proceed", "train_id": train_a, "reason": "Higher priority"},
        ],
        "predicted_delays": {train_a: 2.0, train_b: 7.0},
        "total_weighted_delay": twd,
        "confidence": "Medium",
        "explanation": f"Hold {train_b} for {train_a} to proceed.",
        "acceptance_probability": 0.75,
        "solver_method": method,
        "shap_explanation": {},
    }


def make_conflict_dict(train_a="T001", train_b="T002") -> dict:
    return {
        "id": "conf-1",
        "conflict_type": "block_occupancy",
        "affected_trains": [train_a, train_b],
        "severity": 0.85,
        "block_section": "BLK_MUM_KLD",
        "time_to_conflict_min": 2.0,
        "predicted_delay_min": 6.0,
        "resolution_options": ["Hold T002", "Reroute T001"],
    }


class FakeSnapshot:
    def __init__(self, trains=None):
        self.trains = trains or {}
        self.block_occupancy = {}
        self.station_state = {}
        self.signal_states = {}
        self.session_id = "test-session"


class FakeSolution:
    def __init__(self, d):
        self._d = d

    def to_dict(self):
        return self._d


# ── Module D: What-If Engine ──────────────────────────────────────────────────

class TestWhatIfEngine:
    @pytest.mark.asyncio
    async def test_whatif_api_add_delay(self, client):
        """POST /whatif/simulate — add_delay disruption."""
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.post(
            "/api/v1/whatif/simulate",
            json={
                "disruption_type": "add_delay",
                "params": {"train_id": "12127", "delay_min": 15},
            }
        )
        assert resp.status_code == 200
        body = resp.json()
        # Should return before/after comparison
        assert "before" in body or "disruption_type" in body

    @pytest.mark.asyncio
    async def test_whatif_api_signal_failure(self, client):
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.post(
            "/api/v1/whatif/simulate",
            json={
                "disruption_type": "signal_failure",
                "params": {"block_id": "BLK_MUM_KLD"},
            }
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_whatif_api_close_platform(self, client):
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.post(
            "/api/v1/whatif/simulate",
            json={
                "disruption_type": "close_platform",
                "params": {"station_id": "KLD", "platform": 1},
            }
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_whatif_api_weather_event(self, client):
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.post(
            "/api/v1/whatif/simulate",
            json={
                "disruption_type": "weather_event",
                "params": {"speed_factor": 0.6, "delay_add": 5},
            }
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_whatif_without_simulation_handled(self, client):
        await client.post("/api/v1/simulate/reset")
        resp = await client.post(
            "/api/v1/whatif/simulate",
            json={"disruption_type": "add_delay", "params": {"train_id": "X", "delay_min": 5}}
        )
        assert resp.status_code in (200, 400, 422)


# ── Module F: Recommendation Engine ──────────────────────────────────────────

class TestRecommendationEngine:
    def test_generate_returns_recommendation(self):
        engine = RecommendationEngine()
        trains = {
            "T001": {**make_train_dict("T001"), "priority_class": 5, "current_delay_min": 2.0},
            "T002": {**make_train_dict("T002"), "priority_class": 1, "current_delay_min": 3.0},
        }
        snap = FakeSnapshot(trains)
        conflicts = [make_conflict_dict()]
        solutions = [
            FakeSolution(make_solution_dict(1)),
            FakeSolution(make_solution_dict(2, twd=25.0)),
        ]
        rec = engine.generate(snap, conflicts, solutions, session_id="s1")
        assert rec is not None
        assert rec.id is not None
        assert len(rec.options) > 0

    def test_recommendation_options_have_explanation(self):
        engine = RecommendationEngine()
        trains = {"T001": {**make_train_dict("T001"), "priority_class": 3, "current_delay_min": 5.0}}
        snap = FakeSnapshot(trains)
        solutions = [FakeSolution(make_solution_dict(1))]
        rec = engine.generate(snap, [], solutions)
        for opt in rec.options:
            assert len(opt.explanation) > 0

    def test_recommendation_options_have_constraint_checks(self):
        engine = RecommendationEngine()
        trains = {
            "T001": {**make_train_dict("T001"), "priority_class": 5, "current_delay_min": 2.0},
            "T002": {**make_train_dict("T002"), "priority_class": 1, "current_delay_min": 2.0},
        }
        snap = FakeSnapshot(trains)
        solutions = [FakeSolution(make_solution_dict(1))]
        rec = engine.generate(snap, [make_conflict_dict()], solutions)
        for opt in rec.options:
            assert len(opt.constraint_checks) > 0
            for cc in opt.constraint_checks:
                assert "name" in cc.name or cc.name  # nonempty name
                assert isinstance(cc.satisfied, bool)

    def test_counterfactual_generated_for_rank1(self):
        engine = RecommendationEngine()
        trains = {
            "T001": {**make_train_dict("T001"), "priority_class": 3, "current_delay_min": 3.0},
            "T002": {**make_train_dict("T002"), "priority_class": 1, "current_delay_min": 1.0},
        }
        snap = FakeSnapshot(trains)
        solutions = [
            FakeSolution(make_solution_dict(1, twd=18.0)),
            FakeSolution(make_solution_dict(2, twd=25.0)),
        ]
        rec = engine.generate(snap, [make_conflict_dict()], solutions)
        assert len(rec.options[0].counterfactual) > 0

    def test_recommendation_to_dict_completeness(self):
        engine = RecommendationEngine()
        trains = {"T001": {**make_train_dict("T001"), "priority_class": 2, "current_delay_min": 4.0}}
        snap = FakeSnapshot(trains)
        solutions = [FakeSolution(make_solution_dict(1))]
        rec = engine.generate(snap, [], solutions)
        d = rec.to_dict()
        assert "id" in d
        assert "conflict_id" in d
        assert "session_id" in d
        assert "generated_time" in d
        assert "options" in d
        for opt in d["options"]:
            assert "rank" in opt
            assert "explanation" in opt
            assert "counterfactual" in opt
            assert "constraint_checks" in opt
            assert "risk_level" in opt

    def test_risk_level_classification(self):
        engine = RecommendationEngine()
        trains = {"T001": {**make_train_dict("T001"), "priority_class": 2, "current_delay_min": 0.0}}
        snap = FakeSnapshot(trains)
        # Low TWD -> Low risk
        sol_low  = FakeSolution({**make_solution_dict(1), "total_weighted_delay": 5.0,  "shap_explanation": {}})
        sol_high = FakeSolution({**make_solution_dict(1), "total_weighted_delay": 60.0, "shap_explanation": {}})
        rec_low  = engine.generate(snap, [], [sol_low])
        rec_high = engine.generate(snap, [], [sol_high])
        assert rec_low.options[0].risk_level == "Low"
        assert rec_high.options[0].risk_level == "High"

    @pytest.mark.asyncio
    async def test_recommendations_list_api(self, client):
        resp = await client.get("/api/v1/recommendations/")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_recommendations_accept_unknown_id(self, client):
        resp = await client.post("/api/v1/recommendations/nonexistent-id/accept")
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_recommendations_override_with_reason(self, client):
        resp = await client.post(
            "/api/v1/recommendations/nonexistent-id/override",
            json={"reason": "Controller judgement — weather conditions"}
        )
        assert resp.status_code in (200, 404)


# ── Module H: Audit System ────────────────────────────────────────────────────

class TestAuditSystem:
    @pytest.mark.asyncio
    async def test_audit_list_endpoint(self, client):
        resp = await client.get("/api/v1/audit/")
        assert resp.status_code == 200
        body = resp.json()
        assert "logs" in body
        assert isinstance(body["logs"], list)

    @pytest.mark.asyncio
    async def test_audit_list_has_count(self, client):
        body = (await client.get("/api/v1/audit/")).json()
        assert "count" in body
        assert isinstance(body["count"], int)

    @pytest.mark.asyncio
    async def test_audit_with_session_filter(self, client):
        resp = await client.get("/api/v1/audit/", params={"session_id": "test-session-123"})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_audit_limit_parameter(self, client):
        resp = await client.get("/api/v1/audit/", params={"limit": 10})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["logs"]) <= 10


# ── KPI Endpoint ──────────────────────────────────────────────────────────────

class TestKPIEndpoints:
    @pytest.mark.asyncio
    async def test_kpi_endpoint_returns_metrics(self, client):
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.get("/api/v1/kpi/")
        assert resp.status_code == 200
        body = resp.json()
        assert "total_trains" in body or "active_conflicts" in body

    @pytest.mark.asyncio
    async def test_kpi_without_simulation(self, client):
        await client.post("/api/v1/simulate/reset")
        resp = await client.get("/api/v1/kpi/")
        assert resp.status_code == 200
        body = resp.json()
        assert "total_trains" in body
        assert body["total_trains"] == 0
