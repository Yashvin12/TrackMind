"""What-If scenario router."""
from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.whatif_engine import WhatIfEngine
from app.services.simulator import get_engine

router = APIRouter(prefix="/whatif", tags=["What-If"])
_whatif = WhatIfEngine()


class WhatIfRequest(BaseModel):
    disruption_type: str
    params: Dict[str, Any] = {}


@router.post("/simulate")
async def simulate_whatif(req: WhatIfRequest):
    """Run a what-if scenario against the current simulation state."""
    engine = get_engine()
    if not engine.network:
        raise HTTPException(status_code=400, detail="No simulation running.")

    snap = engine.get_state()
    result = _whatif.simulate_scenario(
        snapshot=snap,
        disruption_type=req.disruption_type,
        disruption_params=req.params,
        network=engine.network,
    )

    return {
        "disruption_type": result.disruption_type,
        "disruption_params": result.disruption_params,
        "before": {
            "avg_delay_min": result.before.avg_delay_min,
            "total_weighted_delay": result.before.total_weighted_delay,
            "throughput_pct": result.before.throughput_pct,
            "active_conflicts": result.before.active_conflicts,
            "trains_on_time": result.before.trains_on_time,
            "trains_delayed": result.before.trains_delayed,
            "block_utilization_pct": result.before.block_utilization_pct,
        },
        "after": {
            "avg_delay_min": result.after.avg_delay_min,
            "total_weighted_delay": result.after.total_weighted_delay,
            "throughput_pct": result.after.throughput_pct,
            "active_conflicts": result.after.active_conflicts,
            "trains_on_time": result.after.trains_on_time,
            "trains_delayed": result.after.trains_delayed,
            "block_utilization_pct": result.after.block_utilization_pct,
        },
        "delta": result.delta,
        "affected_trains": result.affected_trains,
        "narrative": result.narrative,
        "execution_time_ms": result.execution_time_ms,
    }
