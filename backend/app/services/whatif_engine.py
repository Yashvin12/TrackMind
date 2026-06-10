"""
MODULE D — What-If Engine
===========================
Fast-forward scenario comparison engine.
Runs a lightweight simulation clone to project 60-minute outcome
under a hypothetical disruption vs the current baseline.
"""
from __future__ import annotations

import copy
import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class KPISnapshot:
    avg_delay_min: float
    total_weighted_delay: float
    throughput_pct: float
    active_conflicts: int
    trains_on_time: int
    trains_delayed: int
    block_utilization_pct: float


@dataclass
class WhatIfResult:
    disruption_type: str
    disruption_params: dict
    before: KPISnapshot
    after: KPISnapshot
    delta: dict
    affected_trains: List[str]
    narrative: str
    execution_time_ms: float


class WhatIfEngine:
    """
    Tests hypothetical disruptions against the current state.
    Produces a before/after KPI comparison without modifying the live engine.
    """

    # Fast-forward steps (each step = 5 simulated minutes)
    FF_STEPS = 12          # 60 minutes lookahead
    FF_DT_MIN = 5.0

    def simulate_scenario(
        self,
        snapshot: Any,
        disruption_type: str,
        disruption_params: dict,
        network: Optional[Any] = None,
    ) -> WhatIfResult:
        t0 = time.monotonic()

        trains = snapshot.trains if hasattr(snapshot, "trains") else snapshot.get("trains", {})
        block_occ = (
            snapshot.block_occupancy
            if hasattr(snapshot, "block_occupancy")
            else snapshot.get("block_occupancy", {})
        )
        station_state = (
            snapshot.station_state
            if hasattr(snapshot, "station_state")
            else snapshot.get("station_state", {})
        )

        # Baseline KPI
        before = self._compute_kpi(trains, block_occ, snapshot)

        # Deep-copy state for "what if" simulation
        wif_trains = copy.deepcopy(trains)
        wif_blocks = copy.deepcopy(block_occ)
        affected_trains: List[str] = []

        # Apply disruption to cloned state
        affected_trains = self._apply_disruption(
            disruption_type, disruption_params, wif_trains, wif_blocks, station_state
        )

        # Fast-forward cloned state
        for _ in range(self.FF_STEPS):
            self._ff_tick(wif_trains, wif_blocks, self.FF_DT_MIN)

        # After KPI
        after = self._compute_kpi(wif_trains, wif_blocks, None)

        delta = {
            "avg_delay_min": round(after.avg_delay_min - before.avg_delay_min, 2),
            "total_weighted_delay": round(after.total_weighted_delay - before.total_weighted_delay, 2),
            "throughput_pct": round(after.throughput_pct - before.throughput_pct, 1),
            "active_conflicts": after.active_conflicts - before.active_conflicts,
            "trains_delayed": after.trains_delayed - before.trains_delayed,
        }

        narrative = self._generate_narrative(
            disruption_type, disruption_params, before, after, delta, affected_trains
        )

        elapsed_ms = (time.monotonic() - t0) * 1000

        return WhatIfResult(
            disruption_type=disruption_type,
            disruption_params=disruption_params,
            before=before,
            after=after,
            delta=delta,
            affected_trains=affected_trains,
            narrative=narrative,
            execution_time_ms=round(elapsed_ms, 1),
        )

    def _apply_disruption(
        self,
        disruption_type: str,
        params: dict,
        trains: dict,
        block_occ: dict,
        station_state: dict,
    ) -> List[str]:
        """Apply disruption to cloned state and return affected train IDs."""
        affected = []

        if disruption_type == "add_delay":
            train_id = params.get("train_id")
            delay_min = float(params.get("delay_min", 10))
            if train_id and train_id in trains:
                td = trains[train_id]
                if isinstance(td, dict):
                    td["current_delay_min"] = td.get("current_delay_min", 0) + delay_min
                    td["speed_kmh"] = max(20.0, td.get("speed_kmh", 80) * 0.7)
                affected.append(train_id)

        elif disruption_type == "close_platform":
            station_id = params.get("station_id", "")
            # Add delay to all trains heading to this station
            for tid, td in trains.items():
                path = td.get("scheduled_path", []) if isinstance(td, dict) else []
                if station_id in path:
                    td["current_delay_min"] = td.get("current_delay_min", 0) + 6
                    affected.append(tid)

        elif disruption_type == "signal_failure":
            block_id = params.get("block_id", "")
            for tid, td in trains.items():
                if isinstance(td, dict) and td.get("current_block") == block_id:
                    td["current_delay_min"] = td.get("current_delay_min", 0) + 8
                    td["speed_kmh"] = 0
                    affected.append(tid)

        elif disruption_type == "block_track":
            block_id = params.get("block_id", "")
            for tid, td in trains.items():
                blk = td.get("current_block") if isinstance(td, dict) else None
                if blk == block_id:
                    td["current_delay_min"] = td.get("current_delay_min", 0) + 15
                    td["speed_kmh"] = 0
                    affected.append(tid)

        elif disruption_type == "weather_event":
            speed_factor = float(params.get("speed_factor", 0.6))
            delay_add = float(params.get("delay_add", 5))
            for tid, td in trains.items():
                if isinstance(td, dict):
                    td["speed_kmh"] = td.get("speed_kmh", 80) * speed_factor
                    td["current_delay_min"] = td.get("current_delay_min", 0) + delay_add
                    affected.append(tid)

        elif disruption_type == "add_train":
            # Add a ghost train to the network
            new_id = f"EXTRA_{len(trains) + 1}"
            trains[new_id] = {
                "id": new_id,
                "type": params.get("train_type", "passenger"),
                "priority_class": 2,
                "current_delay_min": 0,
                "speed_kmh": 80,
                "status": "running",
                "scheduled_path": params.get("path", ["MUM", "PNE"]),
                "current_block": params.get("initial_block", "BLK_MUM_KLD"),
                "progress_pct": 0.0,
                "path_index": 0,
            }
            affected.append(new_id)

        return affected

    def _ff_tick(self, trains: dict, block_occ: dict, dt_min: float) -> None:
        """Fast-forward simulation: advance all trains by dt_min minutes."""
        for tid, td in trains.items():
            if not isinstance(td, dict):
                continue
            if td.get("status") == "completed":
                continue
            spd = td.get("speed_kmh", 80)
            blk_id = td.get("current_block")
            if blk_id and spd > 0:
                dist_km = spd * (dt_min / 60)
                prog = td.get("progress_pct", 0)
                blk_len = 60  # assume 60km average
                td["progress_pct"] = min(1.0, prog + dist_km / blk_len)
                if td["progress_pct"] >= 1.0:
                    td["progress_pct"] = 0.0
                    td["status"] = "completed" if td.get("path_index", 0) >= len(td.get("scheduled_path", [])) - 2 else "running"

    def _compute_kpi(
        self,
        trains: dict,
        block_occ: dict,
        snapshot: Any,
    ) -> KPISnapshot:
        active = [td for td in trains.values() if (td.get("status") if isinstance(td, dict) else getattr(td, "status", "")) != "completed"]
        delays = [
            (td.get("current_delay_min", 0) if isinstance(td, dict) else getattr(td, "current_delay_min", 0))
            for td in active
        ]
        avg_delay = sum(delays) / len(delays) if delays else 0.0
        trains_delayed = sum(1 for d in delays if d > 0)
        trains_on_time = len(delays) - trains_delayed

        # Weighted delay
        twd = 0.0
        for td in active:
            delay = td.get("current_delay_min", 0) if isinstance(td, dict) else getattr(td, "current_delay_min", 0)
            pc = td.get("priority_class", 2) if isinstance(td, dict) else getattr(td, "priority_class", 2)
            from app.services.optimizer import PRIORITY_WEIGHTS
            twd += PRIORITY_WEIGHTS.get(pc, 1) * delay

        total = len(trains)
        completed = sum(1 for td in trains.values() if (td.get("status") if isinstance(td, dict) else getattr(td, "status", "")) == "completed")
        throughput = completed / max(total, 1) * 100

        occupied = sum(1 for occ in block_occ.values() if occ)
        utilization = occupied / max(len(block_occ), 1) * 100

        # Rough conflict count
        conflicts = 0
        if snapshot and hasattr(snapshot, "active_conflicts"):
            conflicts = len(snapshot.active_conflicts)
        elif delays and avg_delay > 10:
            conflicts = max(1, int(avg_delay / 5))

        return KPISnapshot(
            avg_delay_min=round(avg_delay, 2),
            total_weighted_delay=round(twd, 2),
            throughput_pct=round(throughput, 1),
            active_conflicts=conflicts,
            trains_on_time=trains_on_time,
            trains_delayed=trains_delayed,
            block_utilization_pct=round(utilization, 1),
        )

    def _generate_narrative(
        self,
        disruption_type: str,
        params: dict,
        before: KPISnapshot,
        after: KPISnapshot,
        delta: dict,
        affected: List[str],
    ) -> str:
        type_labels = {
            "add_delay": "train delay injection",
            "close_platform": "platform closure",
            "signal_failure": "signal failure",
            "block_track": "track block",
            "weather_event": "weather event",
            "add_train": "additional train insertion",
        }
        label = type_labels.get(disruption_type, disruption_type)
        direction = "increases" if delta["avg_delay_min"] > 0 else "decreases"
        change = abs(delta["avg_delay_min"])

        return (
            f"What-If: {label.title()} — "
            f"Average network delay {direction} by {change:.1f} min "
            f"(before: {before.avg_delay_min:.1f} → after: {after.avg_delay_min:.1f} min). "
            f"Trains affected: {', '.join(affected) if affected else 'none'}. "
            f"Throughput change: {delta['throughput_pct']:+.1f}%. "
            f"Active conflicts change: {delta['active_conflicts']:+d}."
        )
