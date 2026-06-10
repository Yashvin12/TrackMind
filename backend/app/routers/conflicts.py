"""Conflict detection router."""
from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, Query

from app.services.conflict_detector import ConflictDetector
from app.services.simulator import get_engine

router = APIRouter(prefix="/conflicts", tags=["Conflicts"])
detector = ConflictDetector()


@router.post("/detect")
async def detect_conflicts(lookahead_min: float = 60.0):
    """Run conflict detection on the current simulation state."""
    engine = get_engine()
    if not engine.network:
        return {"conflicts": [], "count": 0, "execution_time_ms": 0}

    t0 = time.monotonic()
    snap = engine.get_state()
    conflicts = detector.detect(snap, lookahead_min=lookahead_min, network=engine.network)
    conflict_dicts = [c.to_dict() for c in conflicts]
    engine.set_active_conflicts(conflict_dicts)
    elapsed_ms = (time.monotonic() - t0) * 1000

    return {
        "conflicts": conflict_dicts,
        "count": len(conflict_dicts),
        "execution_time_ms": round(elapsed_ms, 2),
        "lookahead_min": lookahead_min,
    }


@router.get("/")
async def list_conflicts():
    """Return current active conflicts."""
    engine = get_engine()
    if not engine.network:
        return {"conflicts": [], "count": 0}
    snap = engine.get_state()
    return {"conflicts": snap.active_conflicts, "count": len(snap.active_conflicts)}
