"""Recommendations router — accept and override."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.simulator import get_engine
from app.services.conflict_detector import ConflictDetector
from app.services.optimizer import Optimizer
from app.services.recommender import RecommendationEngine
from app.services.audit_service import AuditService

router = APIRouter(prefix="/recommendations", tags=["Recommendations"])

_detector = ConflictDetector()
_optimizer = Optimizer()
_recommender = RecommendationEngine()
_audit = AuditService()

# In-memory recommendation store (per session)
_recommendation_cache: dict = {}


class OverrideRequest(BaseModel):
    reason: str


@router.get("/{conflict_id}")
async def get_recommendation(conflict_id: str):
    """Generate and return recommendation for a given conflict."""
    engine = get_engine()
    if not engine.network:
        raise HTTPException(status_code=404, detail="No simulation running.")

    snap = engine.get_state()
    conflicts = _detector.detect(snap, network=engine.network)

    # Find the specific conflict or use all
    target_conflicts = [c for c in conflicts if c.id == conflict_id] or conflicts

    solutions = _optimizer.solve(snap, target_conflicts)
    rec = _recommender.generate(snap, target_conflicts, solutions, session_id=engine.session_id)
    _recommendation_cache[rec.id] = rec
    return rec.to_dict()


@router.post("/{recommendation_id}/accept")
async def accept_recommendation(
    recommendation_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Accept a recommendation and apply the top-ranked solution."""
    engine = get_engine()
    rec = _recommendation_cache.get(recommendation_id)

    # Apply top-ranked actions
    if rec and rec.options:
        top_option = rec.options[0]
        affected_trains = []
        for action in top_option.actions:
            action_dict = action if isinstance(action, dict) else action
            tid = action_dict.get("train_id", "")
            action_type = action_dict.get("action_type", "proceed")
            affected_trains.append(tid)
            if action_type == "hold" and engine.network:
                engine.hold_train(tid)
            elif action_type == "proceed" and engine.network:
                engine.release_train(tid)

        # Audit
        log = await _audit.log_event(
            db=db,
            event_type="accepted",
            session_id=engine.session_id,
            train_ids=affected_trains,
            conflict_id=rec.conflict_id,
            recommendation_id=recommendation_id,
            recommended_action=top_option.explanation[:500],
            predicted_delay_min=top_option.total_weighted_delay,
            controller_decision="accepted",
        )
        engine._kpis["recommendations_accepted"] = engine._kpis.get("recommendations_accepted", 0) + 1
        return {"status": "accepted", "audit_log_id": log.id, "actions_applied": len(affected_trains)}

    raise HTTPException(status_code=404, detail="Recommendation not found.")


@router.post("/{recommendation_id}/override")
async def override_recommendation(
    recommendation_id: str,
    req: OverrideRequest,
    db: AsyncSession = Depends(get_db),
):
    """Override a recommendation with controller's manual decision."""
    engine = get_engine()
    rec = _recommendation_cache.get(recommendation_id)

    # Audit the override
    log = await _audit.log_event(
        db=db,
        event_type="overridden",
        session_id=engine.session_id,
        train_ids=[],
        conflict_id=rec.conflict_id if rec else None,
        recommendation_id=recommendation_id,
        controller_decision="overridden",
        controller_override_reason=req.reason,
    )
    if engine.network:
        engine._kpis["recommendations_overridden"] = engine._kpis.get("recommendations_overridden", 0) + 1

    return {"status": "overridden", "audit_log_id": log.id, "reason": req.reason}


@router.get("/")
async def list_recommendations():
    """Return all cached recommendations for this session."""
    engine = get_engine()
    recs = [r.to_dict() for r in _recommendation_cache.values()
            if r.session_id == engine.session_id]
    return {"recommendations": recs, "count": len(recs)}
