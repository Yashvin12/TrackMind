"""
conftest.py — Shared pytest fixtures for all TrackMind backend tests.

Uses:
  - In-memory SQLite (aiosqlite) — no Postgres required
  - AsyncClient from httpx for FastAPI endpoint testing
  - Isolated SimulationEngine per test (via reset_engine)
"""
from __future__ import annotations

import asyncio
import os
import pytest
import pytest_asyncio

# ── Force SQLite for tests before any import of app ──────────────────────────
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/99")  # will fail gracefully

from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from app.main import app
from app.db.database import Base


# ── Event loop ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop_policy():
    return asyncio.DefaultEventLoopPolicy()


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ── In-memory database ───────────────────────────────────────────────────────

TEST_DB_URL = "sqlite+aiosqlite:///:memory:"

@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(TEST_DB_URL, echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(test_engine):
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session
        await session.rollback()


# ── FastAPI async HTTP client ─────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def client():
    """HTTP client wired to the FastAPI test application."""
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as ac:
        yield ac


# ── Simulation engine fixture (isolated per test) ────────────────────────────

@pytest.fixture(scope="function")
def sim_engine():
    """Fresh SimulationEngine with demo_5stn scenario loaded."""
    from app.services.simulator import reset_engine
    engine = reset_engine()
    engine.load_scenario("demo_5stn")
    yield engine
    # cleanup — reset global singleton
    reset_engine()


# ── Minimal train dict factory ────────────────────────────────────────────────

def make_train_dict(
    train_id: str = "T001",
    status: str = "running",
    delay: float = 0.0,
    speed: float = 80.0,
    block: str | None = "BLK_MUM_KLD",
    direction: int = 1,
    progress: float = 0.5,
    priority: int = 2,
    path: list | None = None,
) -> dict:
    return {
        "id": train_id,
        "status": status,
        "current_delay_min": delay,
        "speed_kmh": speed,
        "max_speed_kmh": 110.0,
        "current_block": block,
        "direction": direction,
        "progress_pct": progress,
        "priority_class": priority,
        "scheduled_path": path or ["MUM", "KLD", "LNL"],
        "path_index": 0,
        "current_location": "MUM",
        "load_tonnes": 500.0,
        "dwell_remaining_sec": 0.0,
    }
