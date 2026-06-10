"""Audit log router."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.services.audit_service import AuditService

router = APIRouter(prefix="/audit", tags=["Audit"])
_audit = AuditService()


@router.get("/")
async def list_audit_logs(
    session_id: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Return paginated audit logs."""
    logs, total = await _audit.get_logs(
        db=db,
        session_id=session_id,
        event_type=event_type,
        limit=limit,
        offset=offset,
    )
    return {
        "logs": [_audit.audit_log_to_dict(l) for l in logs],
        "count": len(logs),
        "total": total,
        "limit": limit,
        "offset": offset,
    }
