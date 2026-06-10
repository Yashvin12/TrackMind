"""
MODULE H — Audit Service
==========================
Append-only audit logger for every recommendation, approval, and override.
Every decision made by the system or controller is persisted and explainable.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.models.railway import AuditLogModel

logger = logging.getLogger(__name__)


class AuditService:
    """
    Append-only audit system.
    All writes are non-blocking. Read is paginated.
    """

    async def log_event(
        self,
        db: AsyncSession,
        event_type: str,
        session_id: str,
        train_ids: List[str],
        conflict_id: Optional[str] = None,
        recommendation_id: Optional[str] = None,
        recommended_action: Optional[str] = None,
        predicted_delay_min: Optional[float] = None,
        controller_decision: Optional[str] = None,
        controller_override_reason: Optional[str] = None,
        actual_delay_min: Optional[float] = None,
        outcome_deviation: Optional[float] = None,
        section_id: str = "demo_5stn",
        controller_id: str = "controller_1",
        input_snapshot: Optional[dict] = None,
        output_decision: Optional[dict] = None,
    ) -> AuditLogModel:
        """
        Create and persist an audit log entry.
        Returns the created AuditLogModel instance.
        """
        log = AuditLogModel(
            id=str(uuid.uuid4()),
            timestamp=datetime.now(timezone.utc),
            session_id=session_id,
            event_type=event_type,
            train_ids=train_ids,
            conflict_id=conflict_id,
            recommendation_id=recommendation_id,
            recommended_action=recommended_action,
            predicted_delay_min=predicted_delay_min,
            controller_decision=controller_decision,
            controller_override_reason=controller_override_reason,
            actual_delay_min=actual_delay_min,
            outcome_deviation=outcome_deviation,
            section_id=section_id,
            controller_id=controller_id,
            system_version="1.0.0",
            input_snapshot=input_snapshot,
            output_decision=output_decision,
        )
        db.add(log)
        await db.commit()
        await db.refresh(log)
        logger.info(
            f"AuditLog [{event_type}] id={log.id} trains={train_ids} "
            f"conflict={conflict_id} recommendation={recommendation_id}"
        )
        return log

    async def get_logs(
        self,
        db: AsyncSession,
        session_id: Optional[str] = None,
        event_type: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> tuple[List[AuditLogModel], int]:
        """
        Retrieve paginated audit logs, newest first.
        Returns (logs, total_count).
        """
        query = select(AuditLogModel).order_by(desc(AuditLogModel.timestamp))
        count_query = select(AuditLogModel)

        if session_id:
            query = query.where(AuditLogModel.session_id == session_id)
            count_query = count_query.where(AuditLogModel.session_id == session_id)

        if event_type:
            query = query.where(AuditLogModel.event_type == event_type)
            count_query = count_query.where(AuditLogModel.event_type == event_type)

        total_result = await db.execute(count_query)
        total = len(total_result.scalars().all())

        result = await db.execute(query.offset(offset).limit(limit))
        logs = result.scalars().all()

        return list(logs), total

    def audit_log_to_dict(self, log: AuditLogModel) -> dict:
        return {
            "id": log.id,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            "session_id": log.session_id,
            "event_type": log.event_type,
            "train_ids": log.train_ids or [],
            "conflict_id": log.conflict_id,
            "recommendation_id": log.recommendation_id,
            "recommended_action": log.recommended_action,
            "predicted_delay_min": log.predicted_delay_min,
            "controller_decision": log.controller_decision,
            "controller_override_reason": log.controller_override_reason,
            "actual_delay_min": log.actual_delay_min,
            "outcome_deviation": log.outcome_deviation,
            "section_id": log.section_id,
            "controller_id": log.controller_id,
            "system_version": log.system_version,
        }
