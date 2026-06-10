"""
TrackMind FastAPI Application — Production Entry Point
=======================================================
Registers all routers, lifespan events (DB init, Redis, ML warm-up),
WebSocket endpoint, Prometheus metrics, and health check.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.logging import setup_logging
from app.core.middleware import RequestIDMiddleware
from app.db.database import init_db, close_db
from app.routers import simulate, conflicts, optimize, recommendations, whatif, audit, kpi
from app.websocket_handler import manager, live_broadcast_loop, websocket_endpoint

setup_logging(debug=settings.DEBUG)
logger = logging.getLogger(__name__)

# ── Broadcast task reference ──────────────────────────────────────────────────
_broadcast_task: asyncio.Task | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup → serve → shutdown."""
    global _broadcast_task

    # ── Startup ──────────────────────────────────────────────────────────────
    logger.info(f"TrackMind v{settings.APP_VERSION} starting up…")

    # Database
    try:
        await init_db()
        logger.info("Database ready")
    except Exception as e:
        logger.warning(f"Database init failed (non-fatal in dev): {e}")

    # Redis (optional — graceful degradation)
    try:
        from app.db.redis_client import init_redis
        await init_redis()
        logger.info("Redis ready")
    except Exception as e:
        logger.warning(f"Redis unavailable (non-fatal): {e}")

    # Warm up ML predictor
    try:
        from app.services.predictor import Predictor
        p = Predictor()
        logger.info("ML predictor warmed up")
    except Exception as e:
        logger.warning(f"Predictor warm-up failed: {e}")

    # Start WebSocket broadcast loop
    _broadcast_task = asyncio.create_task(live_broadcast_loop(interval_sec=1.0))
    logger.info("Live broadcast loop started")

    yield  # ── Application serves here ──────────────────────────────────────

    # ── Shutdown ─────────────────────────────────────────────────────────────
    if _broadcast_task:
        _broadcast_task.cancel()
        try:
            await _broadcast_task
        except asyncio.CancelledError:
            pass

    try:
        await close_db()
    except Exception:
        pass

    try:
        from app.db.redis_client import close_redis
        await close_redis()
    except Exception:
        pass

    logger.info("TrackMind shutdown complete")


# ── FastAPI Application ───────────────────────────────────────────────────────

app = FastAPI(
    title="TrackMind API",
    description=(
        "Intelligent Railway Traffic Decision Support & Optimization Platform. "
        "Provides real-time simulation, conflict detection, CP-SAT optimization, "
        "ML predictions, what-if analysis, and full audit trail."
    ),
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],      # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RequestIDMiddleware)

# ── Prometheus metrics ────────────────────────────────────────────────────────

try:
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator().instrument(app).expose(app, endpoint="/metrics")
    logger.info("Prometheus metrics enabled at /metrics")
except Exception:
    logger.warning("Prometheus instrumentation not available")

# ── API Routers ───────────────────────────────────────────────────────────────

API_PREFIX = "/api/v1"

app.include_router(simulate.router,         prefix=API_PREFIX)
app.include_router(conflicts.router,        prefix=API_PREFIX)
app.include_router(optimize.router,         prefix=API_PREFIX)
app.include_router(recommendations.router,  prefix=API_PREFIX)
app.include_router(whatif.router,           prefix=API_PREFIX)
app.include_router(audit.router,            prefix=API_PREFIX)
app.include_router(kpi.router,              prefix=API_PREFIX)

# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    """Live simulation state WebSocket."""
    client_id = str(uuid.uuid4())
    await websocket_endpoint(websocket, client_id)


@app.websocket("/ws/live/{client_id}")
async def ws_live_with_id(websocket: WebSocket, client_id: str):
    """Live simulation state WebSocket with explicit client ID."""
    await websocket_endpoint(websocket, client_id)

# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/v1/health", tags=["Health"])
async def health():
    """System health check."""
    db_ok = "unknown"
    redis_ok = "unknown"

    try:
        from app.db.database import engine
        async with engine.connect() as conn:
            await conn.execute(__import__("sqlalchemy").text("SELECT 1"))
        db_ok = "ok"
    except Exception:
        db_ok = "unavailable"

    try:
        from app.db.redis_client import get_redis
        await get_redis().ping()
        redis_ok = "ok"
    except Exception:
        redis_ok = "unavailable"

    from app.services.simulator import get_engine
    engine_inst = get_engine()

    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "app": settings.APP_NAME,
        "db": db_ok,
        "redis": redis_ok,
        "simulation": {
            "running": engine_inst.running,
            "session_id": engine_inst.session_id,
            "trains": len(engine_inst.trains),
            "ws_clients": manager.client_count,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/", tags=["Root"])
async def root():
    return {
        "message": "TrackMind API v1 — Railway Traffic Decision Support System",
        "docs": "/docs",
        "health": "/api/v1/health",
        "websocket": "ws://localhost:8000/ws/live",
    }
