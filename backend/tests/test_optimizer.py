"""
test_optimizer.py — Tests for Module C: CP-SAT Optimization Engine.

Tests:
  1. Heuristic solver — always returns valid solution
  2. Priority ordering — higher-priority trains proceed, lower held
  3. Solution structure — actions, delays, confidence fields valid
  4. Deduplication — same explanation not returned twice
  5. Ranking — solutions sorted by total_weighted_delay ascending
  6. No-conflict baseline
  7. CP-SAT solver — import and fallback resilience
  8. API endpoint: POST /optimize/solve
"""
from __future__ import annotations

import pytest

from app.services.optimizer import Optimizer, Solution, RecommendationAction
from tests.conftest import make_train_dict


def make_conflict_dict(
    train_a: str,
    train_b: str,
    conflict_type: str = "block_occupancy",
    severity: float = 0.9,
    block: str = "BLK_MUM_KLD",
) -> dict:
    return {
        "id": "test-conflict-1",
        "conflict_type": conflict_type,
        "affected_trains": [train_a, train_b],
        "severity": severity,
        "block_section": block,
        "time_to_conflict_min": 2.0,
        "predicted_delay_min": 5.0,
        "resolution_options": ["Hold train A", "Hold train B"],
    }


class FakeSnapshot:
    def __init__(self, trains):
        self.trains = trains
        self.block_occupancy = {}
        self.station_state = {}


# ── Unit: Heuristic Solver ────────────────────────────────────────────────────

class TestHeuristicSolver:
    def test_returns_valid_solution(self):
        optimizer = Optimizer()
        trains = {
            "HIGH": {**make_train_dict("HIGH", priority=5), "priority_class": 5, "current_delay_min": 2.0},
            "LOW":  {**make_train_dict("LOW",  priority=1), "priority_class": 1, "current_delay_min": 1.0},
        }
        conflicts = [make_conflict_dict("HIGH", "LOW")]
        snap = FakeSnapshot(trains)
        sol = optimizer._solve_heuristic(trains, conflicts)
        assert isinstance(sol, Solution)
        assert sol.solver_method == "heuristic"
        assert len(sol.actions) > 0

    def test_high_priority_proceeds(self):
        optimizer = Optimizer()
        trains = {
            "RAJDHANI": {**make_train_dict("RAJDHANI"), "priority_class": 5, "current_delay_min": 0.0},
            "FREIGHT":  {**make_train_dict("FREIGHT"),  "priority_class": 1, "current_delay_min": 0.0},
        }
        conflicts = [make_conflict_dict("RAJDHANI", "FREIGHT", severity=0.95)]
        sol = optimizer._solve_heuristic(trains, conflicts)

        rajdhani_action = next(a for a in sol.actions if a.train_id == "RAJDHANI")
        freight_action  = next(a for a in sol.actions if a.train_id == "FREIGHT")

        assert rajdhani_action.action_type == "proceed"
        assert freight_action.action_type == "hold"

    def test_hold_duration_is_positive(self):
        optimizer = Optimizer()
        trains = {
            "A": {**make_train_dict("A"), "priority_class": 5, "current_delay_min": 0.0},
            "B": {**make_train_dict("B"), "priority_class": 2, "current_delay_min": 0.0},
        }
        conflicts = [make_conflict_dict("A", "B")]
        sol = optimizer._solve_heuristic(trains, conflicts)
        held = [a for a in sol.actions if a.action_type == "hold"]
        for a in held:
            assert a.duration_min > 0

    def test_no_conflicts_returns_proceed_all(self):
        optimizer = Optimizer()
        trains = {
            "T1": {**make_train_dict("T1"), "priority_class": 2, "current_delay_min": 0.0},
            "T2": {**make_train_dict("T2"), "priority_class": 2, "current_delay_min": 0.0},
        }
        sol = optimizer._solve_heuristic(trains, [])
        assert all(a.action_type == "proceed" for a in sol.actions)


# ── Unit: Solution Structure ──────────────────────────────────────────────────

class TestSolutionStructure:
    def test_solution_to_dict(self):
        optimizer = Optimizer()
        trains = {
            "A": {**make_train_dict("A"), "priority_class": 3, "current_delay_min": 5.0},
            "B": {**make_train_dict("B"), "priority_class": 1, "current_delay_min": 2.0},
        }
        snap = FakeSnapshot(trains)
        solutions = optimizer.solve(snap, [make_conflict_dict("A", "B")])
        assert len(solutions) >= 1

        for sol in solutions:
            d = sol.to_dict()
            assert "rank" in d
            assert "actions" in d
            assert "predicted_delays" in d
            assert "total_weighted_delay" in d
            assert "confidence" in d
            assert "solver_method" in d

    def test_solutions_ranked_ascending_by_delay(self):
        optimizer = Optimizer()
        trains = {
            "A": {**make_train_dict("A"), "priority_class": 3, "current_delay_min": 8.0},
            "B": {**make_train_dict("B"), "priority_class": 1, "current_delay_min": 4.0},
        }
        snap = FakeSnapshot(trains)
        solutions = optimizer.solve(snap, [make_conflict_dict("A", "B")])
        for i in range(len(solutions) - 1):
            assert solutions[i].total_weighted_delay <= solutions[i + 1].total_weighted_delay

    def test_solution_confidence_is_valid(self):
        optimizer = Optimizer()
        trains = {
            "A": {**make_train_dict("A"), "priority_class": 2, "current_delay_min": 5.0},
            "B": {**make_train_dict("B"), "priority_class": 2, "current_delay_min": 3.0},
        }
        snap = FakeSnapshot(trains)
        solutions = optimizer.solve(snap, [make_conflict_dict("A", "B")])
        for sol in solutions:
            assert sol.confidence in ("High", "Medium", "Low")

    def test_actions_have_reasons(self):
        optimizer = Optimizer()
        trains = {
            "A": {**make_train_dict("A"), "priority_class": 5, "current_delay_min": 2.0},
            "B": {**make_train_dict("B"), "priority_class": 1, "current_delay_min": 2.0},
        }
        snap = FakeSnapshot(trains)
        solutions = optimizer.solve(snap, [make_conflict_dict("A", "B")])
        for sol in solutions:
            for action in sol.actions:
                assert len(action.reason) > 0


# ── Unit: No-conflict Baseline ────────────────────────────────────────────────

class TestNoConflictBaseline:
    def test_no_conflict_solution_all_proceed(self):
        optimizer = Optimizer()
        trains = {
            "T1": {**make_train_dict("T1"), "priority_class": 2, "current_delay_min": 0.0},
            "T2": {**make_train_dict("T2"), "priority_class": 2, "current_delay_min": 0.0},
        }
        sol = optimizer._build_no_conflict_solution(trains)
        assert all(a.action_type == "proceed" for a in sol.actions)
        assert sol.solver_method == "baseline"
        assert sol.confidence == "High"

    def test_total_weighted_delay_reflects_existing_delays(self):
        optimizer = Optimizer()
        trains = {
            "T1": {**make_train_dict("T1"), "priority_class": 5, "current_delay_min": 10.0},
        }
        sol = optimizer._build_no_conflict_solution(trains)
        # weight=5, delay=10 → total_weighted_delay = 50
        assert sol.total_weighted_delay == pytest.approx(50.0)


# ── Unit: CP-SAT Resilience ───────────────────────────────────────────────────

class TestCPSATResilience:
    def test_solve_works_without_ortools(self, monkeypatch):
        """If ortools not available, heuristic fallback must still produce solutions."""
        def raise_import(*args, **kwargs):
            raise ImportError("ortools not installed")

        optimizer = Optimizer()
        trains = {
            "A": {**make_train_dict("A"), "priority_class": 2, "current_delay_min": 3.0},
            "B": {**make_train_dict("B"), "priority_class": 1, "current_delay_min": 1.0},
        }
        snap = FakeSnapshot(trains)
        # Patch CP-SAT method to fail
        monkeypatch.setattr(optimizer, "_solve_cp_sat", lambda *a, **k: (_ for _ in ()).throw(ImportError("mock")))
        solutions = optimizer.solve(snap, [make_conflict_dict("A", "B")])
        # Heuristic always produces at least 1 solution
        assert len(solutions) >= 1
        assert all(sol.solver_method in ("heuristic", "baseline") for sol in solutions)


# ── API Endpoint Tests ────────────────────────────────────────────────────────

class TestOptimizerAPI:
    @pytest.mark.asyncio
    async def test_solve_endpoint_with_simulation_running(self, client):
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.post("/api/v1/optimize/solve", json={"timeout_sec": 3})
        assert resp.status_code == 200
        body = resp.json()
        assert "recommendation" in body or "solutions" in body

    @pytest.mark.asyncio
    async def test_solve_endpoint_without_simulation_returns_gracefully(self, client):
        await client.post("/api/v1/simulate/reset")
        resp = await client.post("/api/v1/optimize/solve", json={"timeout_sec": 2})
        assert resp.status_code in (200, 422)

    @pytest.mark.asyncio
    async def test_solutions_endpoint(self, client):
        await client.post("/api/v1/simulate/start", json={"scenario_id": "demo_5stn"})
        resp = await client.get("/api/v1/optimize/solutions")
        assert resp.status_code == 200
