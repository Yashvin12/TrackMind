"""
MODULE E — Prediction Engine
===============================
ML-based prediction with XGBoost and SHAP explanations.

Models:
  - DelayPredictor: predicts delay at next station
  - ConflictPredictor: probability of conflict in next N minutes
  - CongestionPredictor: block utilization forecast

Self-training on synthetic data at first call — no external data required.
"""
from __future__ import annotations

import logging
import numpy as np
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Feature names (must match _extract_features order)
FEATURE_NAMES = [
    "current_delay_min",
    "priority_class",
    "speed_ratio",            # speed / max_speed
    "section_load",           # trains in current block / capacity
    "progress_pct",
    "hour_of_day",
    "dwell_remaining_sec",
    "load_tonnes_norm",       # load / 5000
    "direction",
    "path_remaining",         # stations remaining / total
]


@dataclass
class PredictionResult:
    train_id: str
    future_delay_min: float
    conflict_probability: float
    congestion_level: float       # 0..1
    confidence: float             # 0..1
    shap_values: Dict[str, float]
    model_version: str = "1.0.0"

    def to_dict(self) -> dict:
        return {
            "train_id": self.train_id,
            "future_delay_min": round(self.future_delay_min, 2),
            "conflict_probability": round(self.conflict_probability, 3),
            "congestion_level": round(self.congestion_level, 3),
            "confidence": round(self.confidence, 3),
            "shap_values": {k: round(v, 4) for k, v in self.shap_values.items()},
            "model_version": self.model_version,
        }


class DelayPredictor:
    """XGBoost-based delay prediction model."""

    N_TRAIN_SAMPLES = 2000

    def __init__(self):
        self._model = None
        self._explainer = None
        self._trained = False

    def _ensure_trained(self) -> None:
        if self._trained:
            return
        self._train_synthetic()

    def _train_synthetic(self) -> None:
        """Generate synthetic training data and train model."""
        try:
            import xgboost as xgb
            import shap

            np.random.seed(42)
            n = self.N_TRAIN_SAMPLES

            # Feature matrix
            X = np.column_stack([
                np.random.exponential(4, n),        # current_delay_min
                np.random.choice([0, 1, 2, 3, 5], n),  # priority_class
                np.random.uniform(0.4, 1.0, n),     # speed_ratio
                np.random.uniform(0.0, 1.0, n),     # section_load
                np.random.uniform(0.0, 1.0, n),     # progress_pct
                np.random.randint(0, 24, n).astype(float),  # hour_of_day
                np.random.uniform(0, 300, n),       # dwell_remaining_sec
                np.random.uniform(0.04, 1.0, n),    # load_tonnes_norm
                np.random.choice([-1, 1], n).astype(float),  # direction
                np.random.uniform(0.1, 1.0, n),     # path_remaining
            ])

            # Target: future delay (minutes)
            # Higher section_load and lower speed_ratio increase delay
            base = X[:, 0]  # start from current delay
            y = (
                base
                + X[:, 3] * 8      # section_load contribution
                + (1 - X[:, 2]) * 5  # slow speed contribution
                + (X[:, 4] < 0.3).astype(float) * 3  # early in block
                - X[:, 1] * 0.5    # higher priority = less delay (priority handling)
                + np.random.normal(0, 1.5, n)
            ).clip(0, 60)

            self._model = xgb.XGBRegressor(
                n_estimators=100,
                max_depth=4,
                learning_rate=0.1,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                verbosity=0,
            )
            self._model.fit(X, y)

            # SHAP explainer
            self._explainer = shap.TreeExplainer(self._model)
            self._trained = True
            logger.info("DelayPredictor trained on synthetic data")

        except ImportError as e:
            logger.warning(f"XGBoost/SHAP not available ({e}), using analytic fallback")
            self._model = None
            self._trained = True

    def predict(
        self,
        train: dict,
        section_load: float = 0.5,
        hour_of_day: int = 12,
    ) -> tuple[float, Dict[str, float]]:
        """
        Returns (predicted_delay_min, shap_values_dict).
        """
        self._ensure_trained()

        features = self._extract_features(train, section_load, hour_of_day)

        if self._model is not None:
            import numpy as np
            X = np.array(features).reshape(1, -1)
            pred = float(self._model.predict(X)[0])
            shap_raw = self._explainer.shap_values(X)[0]
            shap_dict = {FEATURE_NAMES[i]: float(shap_raw[i]) for i in range(len(FEATURE_NAMES))}
        else:
            # Analytic fallback
            delay = train.get("current_delay_min", 0)
            load = features[3]
            speed_r = features[2]
            pred = delay + load * 6 + (1 - speed_r) * 4
            shap_dict = {
                "current_delay_min": delay * 0.6,
                "section_load": load * 0.25,
                "speed_ratio": (1 - speed_r) * 0.15,
            }

        return max(0.0, pred), shap_dict

    @staticmethod
    def _extract_features(
        train: dict, section_load: float, hour_of_day: int
    ) -> List[float]:
        delay = float(train.get("current_delay_min", 0))
        pc = float(train.get("priority_class", 2))
        spd = float(train.get("speed_kmh", 80))
        max_spd = float(train.get("max_speed_kmh", 110)) or 110.0
        speed_ratio = min(1.0, spd / max_spd)
        progress = float(train.get("progress_pct", 0.5))
        dwell = float(train.get("dwell_remaining_sec", 0))
        load = float(train.get("load_tonnes", 500)) / 5000.0
        direction = float(train.get("direction", 1))
        path = train.get("scheduled_path", []) or []
        path_idx = int(train.get("path_index", 0))
        path_rem = (len(path) - path_idx) / max(len(path), 1)
        return [delay, pc, speed_ratio, section_load, progress,
                float(hour_of_day), dwell, load, direction, path_rem]


class ConflictPredictor:
    """Binary classifier for conflict probability."""

    def __init__(self):
        self._model = None
        self._trained = False

    def _ensure_trained(self) -> None:
        if self._trained:
            return
        try:
            import xgboost as xgb
            np.random.seed(99)
            n = 2000
            X = np.random.rand(n, 6)  # [section_load, n_trains, avg_delay, speed_var, hour, load_norm]
            # Conflict likely when section_load > 0.7 and n_trains > 1
            y = ((X[:, 0] > 0.65) & (X[:, 1] > 0.4)).astype(int)
            self._model = xgb.XGBClassifier(
                n_estimators=80, max_depth=3, random_state=42, verbosity=0, eval_metric="logloss"
            )
            self._model.fit(X, y)
            self._trained = True
        except Exception as e:
            logger.warning(f"ConflictPredictor fallback: {e}")
            self._model = None
            self._trained = True

    def predict_probability(
        self,
        section_load: float,
        n_trains_in_block: int,
        avg_delay: float,
        speed_variance: float,
        hour: int,
        load_norm: float,
    ) -> float:
        self._ensure_trained()
        if self._model is not None:
            import numpy as np
            X = np.array([[section_load, n_trains_in_block / 4, avg_delay / 20,
                           speed_variance / 50, hour / 24, load_norm]]).clip(0, 1)
            return float(self._model.predict_proba(X)[0][1])
        # Analytic fallback
        return min(1.0, section_load * 0.6 + (avg_delay / 30) * 0.4)


class Predictor:
    """Facade combining all prediction models."""

    def __init__(self):
        self._delay_model = DelayPredictor()
        self._conflict_model = ConflictPredictor()
        # Warm up models
        try:
            self._delay_model._ensure_trained()
            self._conflict_model._ensure_trained()
        except Exception:
            pass

    def predict(
        self,
        snapshot: Any,
        network: Optional[Any] = None,
    ) -> List[PredictionResult]:
        """Run prediction for all active trains in snapshot."""
        import datetime
        hour = datetime.datetime.now().hour

        trains = snapshot.trains if hasattr(snapshot, "trains") else snapshot.get("trains", {})
        block_occ = (
            snapshot.block_occupancy
            if hasattr(snapshot, "block_occupancy")
            else snapshot.get("block_occupancy", {})
        )

        results = []
        for tid, td in trains.items():
            if isinstance(td, dict):
                status = td.get("status", "")
            else:
                status = getattr(td, "status", "")
            if status == "completed":
                continue

            td_dict = td if isinstance(td, dict) else self._train_to_dict(td)

            # Section load
            blk_id = td_dict.get("current_block")
            occupants = len(block_occ.get(blk_id, [])) if blk_id else 0
            section_load = min(1.0, occupants / 2.0)

            # Delay prediction
            future_delay, shap_vals = self._delay_model.predict(td_dict, section_load, hour)

            # Conflict probability
            avg_delay = float(td_dict.get("current_delay_min", 0))
            speed_var = max(0, float(td_dict.get("max_speed_kmh", 110)) - float(td_dict.get("speed_kmh", 80)))
            load_norm = float(td_dict.get("load_tonnes", 500)) / 5000.0
            conflict_prob = self._conflict_model.predict_probability(
                section_load, occupants, avg_delay, speed_var, hour, load_norm
            )

            # Congestion level (block utilization)
            congestion = section_load

            # Confidence
            confidence = max(0.4, 1.0 - abs(future_delay - avg_delay) / max(future_delay + 1, 1))

            results.append(PredictionResult(
                train_id=tid,
                future_delay_min=round(future_delay, 2),
                conflict_probability=round(conflict_prob, 3),
                congestion_level=round(congestion, 3),
                confidence=round(confidence, 3),
                shap_values=shap_vals,
            ))

        return results

    @staticmethod
    def _train_to_dict(td: Any) -> dict:
        return {
            "id": getattr(td, "id", ""),
            "current_delay_min": getattr(td, "current_delay_min", 0),
            "priority_class": getattr(td, "priority_class", 2),
            "speed_kmh": getattr(td, "speed_kmh", 80),
            "max_speed_kmh": getattr(td, "max_speed_kmh", 110),
            "progress_pct": getattr(td, "progress_pct", 0),
            "dwell_remaining_sec": getattr(td, "dwell_remaining_sec", 0),
            "load_tonnes": getattr(td, "load_tonnes", 500),
            "direction": getattr(td, "direction", 1),
            "scheduled_path": getattr(td, "scheduled_path", []),
            "path_index": getattr(td, "path_index", 0),
            "current_block": getattr(td, "current_block", None),
        }
