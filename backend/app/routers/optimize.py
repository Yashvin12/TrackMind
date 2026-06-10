"""Optimization router — solve and solutions."""
from __future__ import annotations

import time
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.simulator import get_engine
from app.services.conflict_detector import ConflictDetector
from app.services.optimizer import Optimizer
from app.services.recommender import RecommendationEngine

router = APIRouter(prefix="/optimize", tags=["Optimization"])

_optimizer = Optimizer()
_detector = ConflictDetector()
_recommender = RecommendationEngine()


class SolveRequest(BaseModel):
    timeout_sec: int = 5


@router.post("/solve")
async def solve(req: SolveRequest):
    """Run optimizer on current state and generate recommendations."""
    t0 = time.monotonic()
    engine = get_engine()
    if not engine.network:
        raise HTTPException(status_code=400, detail="No simulation running.")

    snap = engine.get_state()

    # Detect conflicts
    conflicts = _detector.detect(snap, network=engine.network)
    engine.set_active_conflicts([c.to_dict() for c in conflicts])

    # Optimize
    solutions = _optimizer.solve(snap, conflicts, timeout_sec=req.timeout_sec)

    # Generate recommendations
    rec = _recommender.generate(snap, conflicts, solutions, session_id=engine.session_id)

    elapsed_ms = (time.monotonic() - t0) * 1000

    return {
        "recommendation": rec.to_dict(),
        "solutions": [s.to_dict() for s in solutions],
        "conflicts": [c.to_dict() for c in conflicts],
        "execution_time_ms": round(elapsed_ms, 2),
    }


@router.get("/solutions")
async def get_solutions():
    """Run optimizer and return current solutions without creating a recommendation."""
    engine = get_engine()
    if not engine.network:
        return {"solutions": [], "conflicts": []}

    snap = engine.get_state()
    conflicts = _detector.detect(snap, network=engine.network)
    solutions = _optimizer.solve(snap, conflicts)
    return {
        "solutions": [s.to_dict() for s in solutions],
        "conflicts": [c.to_dict() for c in conflicts],
    }
