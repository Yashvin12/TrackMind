"""KPI router — current network metrics."""
from __future__ import annotations

from fastapi import APIRouter

from app.services.simulator import get_engine
from app.services.predictor import Predictor

router = APIRouter(prefix="/kpi", tags=["KPI"])
_predictor = Predictor()


@router.get("/")
async def get_kpis():
    """Return current KPI snapshot."""
    engine = get_engine()
    if not engine.network:
        return {
            "total_trains": 0,
            "active_trains": 0,
            "completed_trains": 0,
            "active_conflicts": 0,
            "avg_delay_min": 0.0,
            "throughput_pct": 0.0,
            "delay_reduction_pct": 0.0,
            "recommendations_accepted": 0,
            "recommendations_overridden": 0,
            "block_utilization_pct": 0.0,
        }
    return engine._kpis


@router.get("/predictions")
async def get_predictions():
    """Return ML predictions for all active trains."""
    engine = get_engine()
    if not engine.network:
        return {"predictions": []}

    snap = engine.get_state()
    predictions = _predictor.predict(snap, network=engine.network)
    return {"predictions": [p.to_dict() for p in predictions]}
