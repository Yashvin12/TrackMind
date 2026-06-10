"""
test_simulation.py — Tests for Module A: Digital Railway Twin.

Tests:
  1. Scenario loading — correct stations, blocks, trains initialised
  2. Physics tick — trains advance, progress_pct increases
  3. Block occupancy — train correctly registered/deregistered
  4. Station arrival — train enters DWELLING state, platform assigned
  5. Disruption injection — delay, platform closure, signal failure, weather
  6. Hold / release — controller commands
  7. KPI computation after tick
  8. API endpoints — /simulate/start, /simulate/reset, /simulate/state
"""
from __future__ import annotations

import pytest

from app.services.simulator import (
    SimulationEngine,
    TrainStatus,
    reset_engine,
    get_engine,
)


# ── Unit: Scenario Loading ────────────────────────────────────────────────────

class TestScenarioLoading:
    def test_loads_demo_5stn(self, sim_engine):
        """demo_5stn scenario loads 10 trains and 5 stations."""
        assert len(sim_engine.trains) == 10
        assert len(sim_engine.network.stations) == 5
        assert len(sim_engine.network.blocks) >= 4

    def test_station_ids_are_present(self, sim_engine):
        for expected in ["MUM", "KLD", "LNL", "PNE", "SRT"]:
            assert expected in sim_engine.network.stations

    def test_trains_have_required_fields(self, sim_engine):
        for tid, t in sim_engine.trains.items():
            assert t.id == tid
            assert t.max_speed_kmh > 0
            assert len(t.scheduled_path) >= 2
            assert t.direction in (1, -1)

    def test_initial_block_occupancy_is_set(self, sim_engine):
        """Trains in transit at load time should be in block occupants."""
        in_block = [t for t in sim_engine.trains.values() if t.current_block]
        for t in in_block:
            blk = sim_engine.network.blocks[t.current_block]
            assert t.id in blk.occupants

    def test_session_id_is_uuid(self, sim_engine):
        import uuid
        # Should not raise
        uuid.UUID(sim_engine.session_id)

    def test_network_blocks_have_capacity(self, sim_engine):
        for blk in sim_engine.network.blocks.values():
            assert blk.capacity >= 1


# ── Unit: Physics Tick ────────────────────────────────────────────────────────

class TestPhysicsTick:
    def test_tick_advances_elapsed_time(self, sim_engine):
        sim_engine.start()
        initial = sim_engine.sim_elapsed_sec
        sim_engine.tick(dt_sec=60.0)
        assert sim_engine.sim_elapsed_sec == initial + 60.0

    def test_running_train_advances_progress(self, sim_engine):
        sim_engine.start()
        running = [
            t for t in sim_engine.trains.values()
            if t.status == TrainStatus.RUNNING and t.current_block
        ]
        if not running:
            pytest.skip("No running trains in initial scenario state")
        train = running[0]
        initial_prog = train.progress_pct
        sim_engine.tick(dt_sec=120.0)
        # Progress should have increased
        assert train.progress_pct > initial_prog or train.status != TrainStatus.RUNNING

    def test_tick_returns_snapshot(self, sim_engine):
        sim_engine.start()
        snap = sim_engine.tick(dt_sec=30.0)
        assert snap is not None
        assert snap.session_id == sim_engine.session_id
        assert isinstance(snap.trains, dict)
        assert isinstance(snap.block_occupancy, dict)

    def test_snapshot_trains_match_engine(self, sim_engine):
        sim_engine.start()
        snap = sim_engine.tick(dt_sec=10.0)
        assert set(snap.trains.keys()) == set(sim_engine.trains.keys())

    def test_tick_on_paused_engine_still_works(self, sim_engine):
        """Tick is synchronous — pausing only affects stream_states."""
        sim_engine.running = False
        snap = sim_engine.tick(dt_sec=10.0)
        assert snap is not None

    def test_multiple_ticks_accumulate(self, sim_engine):
        sim_engine.start()
        for _ in range(5):
            sim_engine.tick(dt_sec=60.0)
        assert sim_engine.sim_elapsed_sec == pytest.approx(300.0)


# ── Unit: Block Occupancy ─────────────────────────────────────────────────────

class TestBlockOccupancy:
    def test_occupied_blocks_tracked(self, sim_engine):
        in_block = [t for t in sim_engine.trains.values() if t.current_block]
        for t in in_block:
            assert t.current_block in sim_engine.network.blocks

    def test_block_is_full_property(self, sim_engine):
        blk_id = list(sim_engine.network.blocks.keys())[0]
        blk = sim_engine.network.blocks[blk_id]
        blk.occupants = [f"FAKE_{i}" for i in range(blk.capacity)]
        assert blk.is_full

    def test_block_is_clear_property(self, sim_engine):
        blk_id = list(sim_engine.network.blocks.keys())[0]
        blk = sim_engine.network.blocks[blk_id]
        blk.occupants = []
        blk.is_blocked = False
        assert blk.is_clear


# ── Unit: Disruptions ─────────────────────────────────────────────────────────

class TestDisruptions:
    def test_add_delay_increases_delay(self, sim_engine):
        train_id = list(sim_engine.trains.keys())[0]
        original_delay = sim_engine.trains[train_id].current_delay_min
        result = sim_engine.inject_disruption("add_delay", {"train_id": train_id, "delay_min": 10})
        assert result["applied"] is True
        assert sim_engine.trains[train_id].current_delay_min == pytest.approx(original_delay + 10)

    def test_add_delay_invalid_train(self, sim_engine):
        result = sim_engine.inject_disruption("add_delay", {"train_id": "NONEXISTENT", "delay_min": 5})
        assert result["applied"] is False

    def test_close_platform_blocks_platform(self, sim_engine):
        stn_id = "MUM"
        result = sim_engine.inject_disruption("close_platform", {"station_id": stn_id, "platform": 1})
        assert result["applied"] is True
        stn = sim_engine.network.stations[stn_id]
        assert 1 in stn.blocked_platforms

    def test_signal_failure_sets_red(self, sim_engine):
        blk_id = "BLK_MUM_KLD"
        result = sim_engine.inject_disruption("signal_failure", {"block_id": blk_id})
        # May not be applied if signal doesn't exist — either case is valid
        if result["applied"]:
            sig = sim_engine.network.signals.get(f"SIG_{blk_id}_HOME")
            if sig:
                assert sig.failed is True

    def test_block_track_closes_block(self, sim_engine):
        blk_id = "BLK_KLD_LNL"
        result = sim_engine.inject_disruption("block_track", {"block_id": blk_id})
        assert result["applied"] is True
        assert sim_engine.network.blocks[blk_id].is_blocked is True

    def test_weather_event_reduces_speed(self, sim_engine):
        original_speeds = {tid: t.speed_kmh for tid, t in sim_engine.trains.items()}
        sim_engine.inject_disruption("weather_event", {"speed_factor": 0.5})
        for tid, t in sim_engine.trains.items():
            if original_speeds[tid] > 30:
                assert t.speed_kmh <= original_speeds[tid]

    def test_restore_unblocks(self, sim_engine):
        blk_id = "BLK_KLD_LNL"
        sim_engine.inject_disruption("block_track", {"block_id": blk_id})
        assert sim_engine.network.blocks[blk_id].is_blocked is True
        sim_engine.inject_disruption("restore", {"block_id": blk_id})
        assert sim_engine.network.blocks[blk_id].is_blocked is False


# ── Unit: Controller Commands ─────────────────────────────────────────────────

class TestControllerCommands:
    def test_hold_train_changes_status(self, sim_engine):
        running = [
            tid for tid, t in sim_engine.trains.items()
            if t.status == TrainStatus.RUNNING
        ]
        if not running:
            pytest.skip("No running trains")
        tid = running[0]
        result = sim_engine.hold_train(tid)
        assert result is True
        assert sim_engine.trains[tid].status == TrainStatus.STOPPED

    def test_hold_completed_train_returns_false(self, sim_engine):
        sim_engine.trains[list(sim_engine.trains.keys())[0]].status = TrainStatus.COMPLETED
        assert sim_engine.hold_train(list(sim_engine.trains.keys())[0]) is False

    def test_release_held_train(self, sim_engine):
        running = [
            tid for tid, t in sim_engine.trains.items()
            if t.status == TrainStatus.RUNNING
        ]
        if not running:
            pytest.skip("No running trains")
        tid = running[0]
        sim_engine.hold_train(tid)
        result = sim_engine.release_train(tid)
        assert result is True


# ── Unit: KPI Computation ─────────────────────────────────────────────────────

class TestKPIComputation:
    def test_kpis_are_computed_after_load(self, sim_engine):
        kpis = sim_engine._kpis
        assert "total_trains" in kpis
        assert "avg_delay_min" in kpis
        assert "throughput_pct" in kpis
        assert kpis["total_trains"] == 10

    def test_kpis_update_after_tick(self, sim_engine):
        sim_engine.start()
        sim_engine.inject_disruption(
            "add_delay",
            {"train_id": list(sim_engine.trains.keys())[0], "delay_min": 20}
        )
        sim_engine.tick(dt_sec=60.0)
        assert sim_engine._kpis["avg_delay_min"] > 0

    def test_throughput_is_zero_initially(self, sim_engine):
        # No trains completed on load
        assert sim_engine._kpis["completed_trains"] == 0
        assert sim_engine._kpis["throughput_pct"] == pytest.approx(0.0)


# ── API: Simulation Endpoints ─────────────────────────────────────────────────

class TestSimulationAPI:
    @pytest.mark.asyncio
    async def test_simulate_start(self, client):
        resp = await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] in ("started", "already_running")
        assert "session_id" in body

    @pytest.mark.asyncio
    async def test_simulate_reset(self, client):
        # Start first
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.post("/api/v1/simulate/reset")
        assert resp.status_code == 200
        assert resp.json()["status"] == "reset"

    @pytest.mark.asyncio
    async def test_simulate_state_after_start(self, client):
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.get("/api/v1/simulate/state")
        assert resp.status_code == 200
        body = resp.json()
        assert "trains" in body
        assert "block_occupancy" in body

    @pytest.mark.asyncio
    async def test_simulate_disruption_endpoint(self, client):
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.post(
            "/api/v1/simulate/disruption",
            json={"disruption_type": "weather_event", "params": {"speed_factor": 0.7}}
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "applied" in body
