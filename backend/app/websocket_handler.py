"""
WebSocket connection manager + live state broadcaster.
Broadcasts simulation state every second to all connected clients.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, Set

from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Thread-safe WebSocket connection pool."""

    def __init__(self):
        self._active: Dict[str, WebSocket] = {}

    async def connect(self, ws: WebSocket, client_id: str) -> None:
        await ws.accept()
        self._active[client_id] = ws
        logger.info(f"WS connected: {client_id} (total={len(self._active)})")

    def disconnect(self, client_id: str) -> None:
        self._active.pop(client_id, None)
        logger.info(f"WS disconnected: {client_id} (total={len(self._active)})")

    async def broadcast(self, message: dict) -> None:
        """Send message to all connected clients."""
        dead: list = []
        data = json.dumps(message, default=str)
        for cid, ws in list(self._active.items()):
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(cid)
        for cid in dead:
            self.disconnect(cid)

    async def send_to(self, client_id: str, message: dict) -> None:
        ws = self._active.get(client_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message, default=str))
            except Exception:
                self.disconnect(client_id)

    @property
    def client_count(self) -> int:
        return len(self._active)


# Singleton manager
manager = ConnectionManager()


async def live_broadcast_loop(interval_sec: float = 1.0) -> None:
    """
    Background task that ticks the simulation and broadcasts state.
    Runs forever — cancel via task.cancel().
    """
    from app.services.simulator import get_engine
    from app.services.conflict_detector import ConflictDetector

    detector = ConflictDetector()
    logger.info("LiveBroadcastLoop started")

    while True:
        try:
            engine = get_engine()
            if engine.running and manager.client_count > 0:
                snapshot = engine.tick()

                # Run conflict detection on every tick
                try:
                    conflicts = detector.detect(snapshot, network=engine.network)
                    conflict_dicts = [c.to_dict() for c in conflicts]
                    engine.set_active_conflicts(conflict_dicts)
                    snapshot = engine.get_state()  # refresh with updated conflicts
                except Exception as e:
                    logger.warning(f"Conflict detection error: {e}")
                    conflict_dicts = []

                # Build broadcast payload
                payload = {
                    "type": "state_update",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "payload": {
                        "session_id": snapshot.session_id,
                        "simulation_time": snapshot.simulation_time.isoformat(),
                        "sim_elapsed_sec": snapshot.sim_elapsed_sec,
                        "trains": snapshot.trains,
                        "block_occupancy": snapshot.block_occupancy,
                        "station_state": snapshot.station_state,
                        "signal_states": snapshot.signal_states,
                        "conflicts": conflict_dicts,
                        "completed_trains": snapshot.completed_trains,
                        "running": snapshot.running,
                        "kpis": snapshot.kpis,
                    },
                }
                await manager.broadcast(payload)

        except Exception as e:
            logger.error(f"Broadcast loop error: {e}", exc_info=True)

        await asyncio.sleep(interval_sec)


async def websocket_endpoint(websocket: WebSocket, client_id: str) -> None:
    """Handle a single WebSocket connection lifecycle."""
    await manager.connect(websocket, client_id)

    # Send current state immediately on connect
    try:
        from app.services.simulator import get_engine
        engine = get_engine()
        if engine.network:
            snap = engine.get_state()
            await manager.send_to(client_id, {
                "type": "state_update",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "payload": {
                    "session_id": snap.session_id,
                    "trains": snap.trains,
                    "block_occupancy": snap.block_occupancy,
                    "station_state": snap.station_state,
                    "signal_states": snap.signal_states,
                    "conflicts": snap.active_conflicts,
                    "kpis": snap.kpis,
                    "running": snap.running,
                },
            })
    except Exception:
        pass

    try:
        while True:
            # Keep connection alive; client can send pings or commands
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                await _handle_client_message(client_id, msg)
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        manager.disconnect(client_id)


async def _handle_client_message(client_id: str, msg: dict) -> None:
    """Handle messages received from connected clients."""
    msg_type = msg.get("type", "")
    if msg_type == "ping":
        await manager.send_to(client_id, {"type": "pong"})
    elif msg_type == "hold_train":
        from app.services.simulator import get_engine
        get_engine().hold_train(msg.get("train_id", ""))
    elif msg_type == "release_train":
        from app.services.simulator import get_engine
        get_engine().release_train(msg.get("train_id", ""))
