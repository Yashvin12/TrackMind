"""Simulation router — start, reset, disruption, state."""
from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.simulator import get_engine, reset_engine

router = APIRouter(prefix="/simulate", tags=["Simulation"])


class StartRequest(BaseModel):
    scenario_id: str = "demo_5stn"


class DisruptionRequest(BaseModel):
    disruption_type: str
    params: Dict[str, Any] = {}


class HoldReleaseRequest(BaseModel):
    train_id: str


@router.post("/start")
async def start_simulation(req: StartRequest):
    try:
        engine = get_engine()
        engine.load_scenario(req.scenario_id)
        engine.start()
        snap = engine.get_state()
        return {
            "status": "started",
            "scenario_id": req.scenario_id,
            "session_id": snap.session_id,
            "trains": len(snap.trains),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reset")
async def reset_simulation():
    engine = reset_engine()
    return {"status": "reset", "session_id": engine.session_id}


@router.post("/pause")
async def pause_simulation():
    get_engine().pause()
    return {"status": "paused"}


@router.post("/resume")
async def resume_simulation():
    get_engine().resume()
    return {"status": "resumed"}


@router.post("/disruption")
async def inject_disruption(req: DisruptionRequest):
    engine = get_engine()
    if not engine.network:
        raise HTTPException(status_code=400, detail="No simulation running. Start a simulation first.")
    result = engine.inject_disruption(req.disruption_type, req.params)
    return result


@router.post("/hold")
async def hold_train(req: HoldReleaseRequest):
    ok = get_engine().hold_train(req.train_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Train {req.train_id} not found or already completed")
    return {"status": "held", "train_id": req.train_id}


@router.post("/release")
async def release_train(req: HoldReleaseRequest):
    ok = get_engine().release_train(req.train_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"Train {req.train_id} not found or not held")
    return {"status": "released", "train_id": req.train_id}


@router.get("/state")
async def get_state():
    engine = get_engine()
    if not engine.network:
        return {
            "running": False,
            "trains": {},
            "block_occupancy": {},
            "station_state": {},
            "signal_states": {},
            "active_conflicts": [],
            "completed_trains": [],
            "kpis": {},
        }
    snap = engine.get_state()
    return {
        "session_id": snap.session_id,
        "simulation_time": snap.simulation_time.isoformat(),
        "sim_elapsed_sec": snap.sim_elapsed_sec,
        "running": snap.running,
        "trains": snap.trains,
        "block_occupancy": snap.block_occupancy,
        "station_state": snap.station_state,
        "signal_states": snap.signal_states,
        "active_conflicts": snap.active_conflicts,
        "completed_trains": snap.completed_trains,
        "kpis": snap.kpis,
        "sim_speed": snap.sim_speed,
    }
