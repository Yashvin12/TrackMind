"""
MODULE A — Digital Railway Twin
=================================
SimPy-based physics simulation engine for the TrackMind railway network.

Architecture:
    SimulationEngine
    ├── RailwayNetwork  (graph of stations + blocks + signals)
    ├── TrainState[]    (per-train physics state)
    ├── tick(dt)        (advance simulation by dt seconds)
    ├── inject_disruption(type, params)
    └── get_state() -> SimulationSnapshot
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


# ── Enumerations ─────────────────────────────────────────────────────────────

class TrainStatus(str, Enum):
    WAITING    = "waiting"
    RUNNING    = "running"
    DWELLING   = "dwelling"
    STOPPED    = "stopped"   # held by controller / signal
    COMPLETED  = "completed"


class SignalState(str, Enum):
    RED    = "red"
    YELLOW = "yellow"
    GREEN  = "green"


class DisruptionType(str, Enum):
    ADD_DELAY        = "add_delay"
    CLOSE_PLATFORM   = "close_platform"
    ADD_TRAIN        = "add_train"
    SIGNAL_FAILURE   = "signal_failure"
    BLOCK_TRACK      = "block_track"
    WEATHER_EVENT    = "weather_event"
    RESTORE          = "restore"


# ── Data Structures ──────────────────────────────────────────────────────────

@dataclass
class SignalData:
    id: str
    block_id: str
    signal_type: str        # approach | home
    state: SignalState = SignalState.GREEN
    failed: bool = False


@dataclass
class BlockSection:
    id: str
    name: str
    from_station: str
    to_station: str
    length_km: float
    max_speed_kmh: float
    track_type: str         # single | double
    capacity: int           # max simultaneous trains
    occupants: List[str] = field(default_factory=list)   # train IDs
    is_blocked: bool = False
    signals: List[SignalData] = field(default_factory=list)

    @property
    def is_full(self) -> bool:
        return len(self.occupants) >= self.capacity

    @property
    def is_clear(self) -> bool:
        return len(self.occupants) == 0 and not self.is_blocked


@dataclass
class StationData:
    id: str
    name: str
    code: str
    num_platforms: int
    num_loops: int
    avg_dwell_sec: int
    km_from_origin: float
    platform_occupants: Dict[int, Optional[str]] = field(default_factory=dict)
    blocked_platforms: Set[int] = field(default_factory=set)
    latitude: float = 0.0
    longitude: float = 0.0

    def __post_init__(self):
        if not self.platform_occupants:
            self.platform_occupants = {i + 1: None for i in range(self.num_platforms)}

    @property
    def free_platform(self) -> Optional[int]:
        for p, occ in self.platform_occupants.items():
            if occ is None and p not in self.blocked_platforms:
                return p
        return None

    @property
    def available_platforms(self) -> int:
        return sum(
            1 for p, occ in self.platform_occupants.items()
            if occ is None and p not in self.blocked_platforms
        )


@dataclass
class TrainState:
    id: str
    number: str
    name: str
    train_type: str
    priority_class: int
    load_tonnes: float
    loco_power_kw: float
    max_speed_kmh: float
    scheduled_path: List[str]       # station IDs
    direction: int                  # 1=up, -1=down
    current_location: str           # current station or block
    current_block: Optional[str]    # block currently in (None if at station)
    speed_kmh: float
    progress_pct: float             # 0..1 through current block
    initial_delay_min: float
    status: TrainStatus = TrainStatus.RUNNING
    current_delay_min: float = 0.0
    dwell_remaining_sec: float = 0.0
    path_index: int = 0             # index into scheduled_path (current/last station)
    assigned_platform: Optional[int] = None
    distance_km_total: float = 0.0  # cumulative distance travelled
    held_sec: float = 0.0           # total time held by controller
    events: List[dict] = field(default_factory=list)

    def __post_init__(self):
        self.current_delay_min = self.initial_delay_min
        # Determine path_index from current_location
        if self.current_location in self.scheduled_path:
            self.path_index = self.scheduled_path.index(self.current_location)


@dataclass
class SimulationSnapshot:
    session_id: str
    simulation_time: datetime
    sim_elapsed_sec: float
    trains: Dict[str, dict]
    block_occupancy: Dict[str, List[str]]
    station_state: Dict[str, dict]
    signal_states: Dict[str, str]
    active_conflicts: List[dict]
    completed_trains: List[str]
    running: bool
    sim_speed: float
    kpis: dict


# ── Railway Network ───────────────────────────────────────────────────────────

class RailwayNetwork:
    """Graph-based railway network model."""

    def __init__(self, scenario: dict):
        self.scenario = scenario
        self.stations: Dict[str, StationData] = {}
        self.blocks: Dict[str, BlockSection] = {}
        self.signals: Dict[str, SignalData] = {}
        self._build_network(scenario)

    def _build_network(self, scenario: dict) -> None:
        # Build stations
        for s in scenario["stations"]:
            self.stations[s["id"]] = StationData(
                id=s["id"],
                name=s["name"],
                code=s["code"],
                num_platforms=s["num_platforms"],
                num_loops=s["num_loops"],
                avg_dwell_sec=s["avg_dwell_sec"],
                km_from_origin=s["km_from_origin"],
                latitude=s.get("latitude", 0.0),
                longitude=s.get("longitude", 0.0),
            )

        # Apply initial disruptions
        for dis in scenario.get("initial_disruptions", []):
            if dis["type"] == "platform_blocked":
                st = self.stations.get(dis["station"])
                if st:
                    st.blocked_platforms.add(dis["platform"])
                    logger.info(f"Platform {dis['platform']} at {dis['station']} blocked: {dis['reason']}")

        # Build block sections
        cap = scenario.get("block_capacity", {})
        for sec in scenario["track_sections"]:
            capacity = cap.get(sec["id"], 2)
            self.blocks[sec["id"]] = BlockSection(
                id=sec["id"],
                name=sec["name"],
                from_station=sec["from_station"],
                to_station=sec["to_station"],
                length_km=sec["length_km"],
                max_speed_kmh=sec["max_speed_kmh"],
                track_type=sec["track_type"],
                capacity=capacity,
            )

        # Build signals
        for sig in scenario.get("signals", []):
            self.signals[sig["id"]] = SignalData(
                id=sig["id"],
                block_id=sig["block_id"],
                signal_type=sig["type"],
                state=SignalState(sig.get("state", "green")),
            )

    def get_next_block(self, train: TrainState) -> Optional[str]:
        """Return the block ID leading from current station toward next station."""
        path = train.scheduled_path
        idx = train.path_index
        if idx + 1 >= len(path):
            return None
        from_stn = path[idx]
        to_stn = path[idx + 1]
        for bid, blk in self.blocks.items():
            if blk.from_station == from_stn and blk.to_station == to_stn:
                return bid
        return None

    def get_signal_for_block(self, block_id: str, sig_type: str = "home") -> Optional[SignalData]:
        key = f"SIG_{block_id}_{sig_type.upper()}"
        return self.signals.get(key)

    def block_for_signal_is_clear(self, block_id: str, train_direction: int) -> bool:
        """Check if signals allow entry onto block."""
        sig = self.get_signal_for_block(block_id, "home")
        if sig and sig.failed:
            return False  # failed signal = treat as red
        if sig and sig.state == SignalState.RED:
            return False
        blk = self.blocks.get(block_id)
        if blk and blk.is_blocked:
            return False
        return True

    def update_signals_for_block(self, block_id: str) -> None:
        """Automatically update signal state based on block occupancy."""
        blk = self.blocks.get(block_id)
        if not blk:
            return
        sig = self.get_signal_for_block(block_id, "home")
        if not sig or sig.failed:
            return
        if blk.is_full or blk.is_blocked:
            sig.state = SignalState.RED
        elif len(blk.occupants) > 0:
            sig.state = SignalState.YELLOW
        else:
            sig.state = SignalState.GREEN


# ── Simulation Engine ─────────────────────────────────────────────────────────

class SimulationEngine:
    """
    Core simulation engine driving the railway digital twin.

    Usage:
        engine = SimulationEngine()
        await engine.load_scenario("demo_5stn")
        engine.start()
        async for snapshot in engine.stream_states():
            ...
    """

    SIM_TICK_SEC: float = 1.0        # wall-clock tick
    SIM_SPEED_DEFAULT: float = 60.0  # 1 wall-second = 60 sim-seconds

    def __init__(self):
        self.session_id: str = str(uuid.uuid4())
        self.network: Optional[RailwayNetwork] = None
        self.trains: Dict[str, TrainState] = {}
        self.completed_trains: List[str] = []
        self.sim_elapsed_sec: float = 0.0
        self.sim_speed: float = self.SIM_SPEED_DEFAULT
        self.running: bool = False
        self._start_real_time: float = 0.0
        self._sim_start_wall: float = 0.0
        self._task: Optional[asyncio.Task] = None
        self._snapshot: Optional[SimulationSnapshot] = None
        self._active_conflicts: List[dict] = []
        self._scenario_id: Optional[str] = None
        self._kpis: dict = {}

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    def load_scenario(self, scenario_id: str) -> None:
        from app.data.scenarios import get_scenario
        scenario = get_scenario(scenario_id)
        self._scenario_id = scenario_id
        self.session_id = str(uuid.uuid4())
        self.network = RailwayNetwork(scenario)
        self.trains = {}
        self.completed_trains = []
        self.sim_elapsed_sec = 0.0
        self._active_conflicts = []

        for td in scenario["trains"]:
            t = TrainState(
                id=td["id"],
                number=td["number"],
                name=td["name"],
                train_type=td["train_type"],
                priority_class=td["priority_class"],
                load_tonnes=td["load_tonnes"],
                loco_power_kw=td["loco_power_kw"],
                max_speed_kmh=td["max_speed_kmh"],
                scheduled_path=td["scheduled_path"],
                direction=td["direction"],
                current_location=td["current_location"],
                current_block=td.get("current_block"),
                speed_kmh=td["speed_kmh"],
                progress_pct=td["progress_pct"],
                initial_delay_min=td["initial_delay_min"],
            )
            self.trains[t.id] = t

            # Register train in block occupancy
            if t.current_block and t.current_block in self.network.blocks:
                blk = self.network.blocks[t.current_block]
                if t.id not in blk.occupants:
                    blk.occupants.append(t.id)

        self._update_kpis()
        logger.info(
            f"Scenario loaded: {scenario_id} | "
            f"{len(self.trains)} trains | session={self.session_id}"
        )

    def start(self) -> None:
        if not self.network:
            raise RuntimeError("Load a scenario before starting the simulation.")
        self.running = True
        self._sim_start_wall = time.monotonic()
        logger.info(f"Simulation started — session={self.session_id}")

    def pause(self) -> None:
        self.running = False
        logger.info("Simulation paused")

    def resume(self) -> None:
        self.running = True
        logger.info("Simulation resumed")

    def reset(self) -> None:
        self.running = False
        if self._scenario_id:
            self.load_scenario(self._scenario_id)
        logger.info("Simulation reset")

    # ── Physics tick ──────────────────────────────────────────────────────────

    def tick(self, dt_sec: Optional[float] = None) -> SimulationSnapshot:
        """
        Advance simulation by dt_sec simulation-seconds.
        Default: SIM_TICK_SEC * sim_speed
        """
        if not self.network:
            raise RuntimeError("No scenario loaded.")

        if dt_sec is None:
            dt_sec = self.SIM_TICK_SEC * self.sim_speed

        self.sim_elapsed_sec += dt_sec

        for train_id, train in list(self.trains.items()):
            if train.status == TrainStatus.COMPLETED:
                continue
            self._update_train(train, dt_sec)

        self._update_all_signals()
        self._update_kpis()
        self._snapshot = self._build_snapshot()
        return self._snapshot

    def _update_train(self, train: TrainState, dt_sec: float) -> None:
        """Update single train physics for one tick."""
        if train.status == TrainStatus.DWELLING:
            train.dwell_remaining_sec -= dt_sec
            if train.dwell_remaining_sec <= 0:
                train.dwell_remaining_sec = 0
                # Depart from platform
                stn = self.network.stations.get(train.current_location)
                if stn and train.assigned_platform:
                    stn.platform_occupants[train.assigned_platform] = None
                    train.assigned_platform = None
                train.status = TrainStatus.RUNNING
                self._try_enter_next_block(train)
            return

        if train.status == TrainStatus.STOPPED:
            train.held_sec += dt_sec
            # Re-check if we can proceed
            self._try_enter_next_block(train)
            return

        if train.status == TrainStatus.RUNNING and train.current_block:
            # Advance along block
            blk = self.network.blocks.get(train.current_block)
            if not blk:
                return

            # Effective speed = min(train max, block max)
            eff_speed = min(train.speed_kmh, blk.max_speed_kmh)
            distance_km = eff_speed * (dt_sec / 3600.0)
            travel_km = blk.length_km * (1.0 - train.progress_pct)
            fraction = distance_km / blk.length_km if blk.length_km > 0 else 1.0
            train.progress_pct += fraction
            train.distance_km_total += min(distance_km, travel_km)

            if train.progress_pct >= 1.0:
                train.progress_pct = 1.0
                self._arrive_at_station(train)

    def _arrive_at_station(self, train: TrainState) -> None:
        """Handle train arrival at the next station."""
        blk = self.network.blocks.get(train.current_block)
        if not blk:
            return

        # Remove from block
        if train.id in blk.occupants:
            blk.occupants.remove(train.id)
        self.network.update_signals_for_block(train.current_block)

        # Move to next station in path
        dest_station_id = blk.to_station
        train.path_index = train.scheduled_path.index(dest_station_id) if dest_station_id in train.scheduled_path else train.path_index + 1
        train.current_location = dest_station_id
        train.current_block = None
        train.progress_pct = 0.0

        train.events.append({
            "type": "arrive",
            "station": dest_station_id,
            "sim_time": self.sim_elapsed_sec,
            "delay_min": train.current_delay_min,
        })

        # Check if terminal
        if train.path_index >= len(train.scheduled_path) - 1:
            train.status = TrainStatus.COMPLETED
            self.completed_trains.append(train.id)
            logger.debug(f"Train {train.id} completed journey at {dest_station_id}")
            return

        # Assign platform and dwell
        stn = self.network.stations.get(dest_station_id)
        if stn:
            plat = stn.free_platform
            if plat:
                stn.platform_occupants[plat] = train.id
                train.assigned_platform = plat
                train.dwell_remaining_sec = stn.avg_dwell_sec
                train.status = TrainStatus.DWELLING
            else:
                # No platform — hold train, add delay
                train.status = TrainStatus.STOPPED
                train.current_delay_min += 3.0   # 3-min platform delay penalty
                logger.debug(f"Train {train.id} held at {dest_station_id} — no platform")
        else:
            # No station record (intermediate point) — skip dwell
            self._try_enter_next_block(train)

    def _try_enter_next_block(self, train: TrainState) -> None:
        """Attempt to enter the next block from current station."""
        next_block_id = self.network.get_next_block(train)
        if not next_block_id:
            return

        blk = self.network.blocks.get(next_block_id)
        if not blk:
            return

        can_enter = (
            not blk.is_full
            and not blk.is_blocked
            and self.network.block_for_signal_is_clear(next_block_id, train.direction)
        )

        # Check headway — is there a train just ahead?
        if can_enter and len(blk.occupants) > 0:
            # Allow if double track and capacity not exceeded
            if blk.track_type == "single":
                can_enter = False
            elif len(blk.occupants) >= blk.capacity:
                can_enter = False

        if can_enter:
            blk.occupants.append(train.id)
            train.current_block = next_block_id
            train.progress_pct = 0.0
            train.status = TrainStatus.RUNNING
            train.speed_kmh = min(train.max_speed_kmh, blk.max_speed_kmh)
            self.network.update_signals_for_block(next_block_id)
            train.events.append({
                "type": "block_enter",
                "block": next_block_id,
                "sim_time": self.sim_elapsed_sec,
            })
        else:
            # Cannot enter — hold and accumulate delay
            train.status = TrainStatus.STOPPED
            train.held_sec += 0     # tick handles it

    def _update_all_signals(self) -> None:
        for block_id in self.network.blocks:
            self.network.update_signals_for_block(block_id)

    # ── Disruptions ──────────────────────────────────────────────────────────

    def inject_disruption(self, disruption_type: str, params: dict) -> dict:
        """Apply a disruption to the running simulation."""
        result = {"applied": True, "disruption_type": disruption_type, "params": params}

        if disruption_type == DisruptionType.ADD_DELAY:
            train_id = params.get("train_id")
            delay_min = float(params.get("delay_min", 10))
            if train_id and train_id in self.trains:
                self.trains[train_id].current_delay_min += delay_min
                self.trains[train_id].held_sec += delay_min * 60
                result["message"] = f"Added {delay_min}min delay to train {train_id}"
            else:
                result["applied"] = False
                result["message"] = f"Train {train_id} not found"

        elif disruption_type == DisruptionType.CLOSE_PLATFORM:
            station_id = params.get("station_id")
            platform = int(params.get("platform", 1))
            stn = self.network.stations.get(station_id)
            if stn:
                stn.blocked_platforms.add(platform)
                # Evict any train on this platform
                if stn.platform_occupants.get(platform):
                    tid = stn.platform_occupants[platform]
                    stn.platform_occupants[platform] = None
                    if tid in self.trains:
                        self.trains[tid].status = TrainStatus.STOPPED
                        self.trains[tid].current_delay_min += 5
                result["message"] = f"Platform {platform} at {station_id} closed"
            else:
                result["applied"] = False

        elif disruption_type == DisruptionType.SIGNAL_FAILURE:
            block_id = params.get("block_id")
            sig_id = f"SIG_{block_id}_HOME"
            sig = self.network.signals.get(sig_id)
            if sig:
                sig.failed = True
                sig.state = SignalState.RED
                result["message"] = f"Signal failure on block {block_id}"
            else:
                result["applied"] = False

        elif disruption_type == DisruptionType.BLOCK_TRACK:
            block_id = params.get("block_id")
            blk = self.network.blocks.get(block_id)
            if blk:
                blk.is_blocked = True
                result["message"] = f"Block {block_id} closed"
            else:
                result["applied"] = False

        elif disruption_type == DisruptionType.WEATHER_EVENT:
            speed_factor = float(params.get("speed_factor", 0.7))
            for train in self.trains.values():
                train.speed_kmh = max(30.0, train.speed_kmh * speed_factor)
            result["message"] = f"Weather event — speed reduced to {speed_factor*100:.0f}%"

        elif disruption_type == DisruptionType.RESTORE:
            block_id = params.get("block_id")
            if block_id:
                blk = self.network.blocks.get(block_id)
                if blk:
                    blk.is_blocked = False
                sig_id = f"SIG_{block_id}_HOME"
                sig = self.network.signals.get(sig_id)
                if sig:
                    sig.failed = False
                    sig.state = SignalState.GREEN
            result["message"] = "Restoration applied"

        logger.info(f"Disruption applied: {result}")
        return result

    def hold_train(self, train_id: str) -> bool:
        """Controller command: hold a train."""
        train = self.trains.get(train_id)
        if train and train.status != TrainStatus.COMPLETED:
            train.status = TrainStatus.STOPPED
            return True
        return False

    def release_train(self, train_id: str) -> bool:
        """Controller command: release a held train."""
        train = self.trains.get(train_id)
        if train and train.status == TrainStatus.STOPPED:
            self._try_enter_next_block(train)
            return True
        return False

    # ── KPI computation ───────────────────────────────────────────────────────

    def _update_kpis(self) -> None:
        active = [t for t in self.trains.values() if t.status != TrainStatus.COMPLETED]
        delays = [t.current_delay_min for t in active]
        avg_delay = sum(delays) / len(delays) if delays else 0.0
        total = len(self.trains)
        completed = len(self.completed_trains)
        throughput = (completed / total * 100) if total > 0 else 0.0

        # Block utilization
        total_blocks = len(self.network.blocks) if self.network else 1
        occupied_blocks = sum(1 for b in (self.network.blocks.values() if self.network else []) if b.occupants)
        utilization = occupied_blocks / max(total_blocks, 1) * 100

        self._kpis = {
            "total_trains": total,
            "active_trains": len(active),
            "completed_trains": completed,
            "active_conflicts": len(self._active_conflicts),
            "avg_delay_min": round(avg_delay, 2),
            "throughput_pct": round(throughput, 1),
            "delay_reduction_pct": max(0.0, round(30.0 - avg_delay * 0.5, 1)),
            "recommendations_accepted": 0,
            "recommendations_overridden": 0,
            "block_utilization_pct": round(utilization, 1),
        }

    def set_active_conflicts(self, conflicts: List[dict]) -> None:
        self._active_conflicts = conflicts
        self._kpis["active_conflicts"] = len(conflicts)

    # ── State export ──────────────────────────────────────────────────────────

    def get_state(self) -> SimulationSnapshot:
        if not self.network:
            raise RuntimeError("No scenario loaded.")
        self._update_kpis()
        return self._build_snapshot()

    def _build_snapshot(self) -> SimulationSnapshot:
        train_dicts: Dict[str, dict] = {}
        for tid, t in self.trains.items():
            # Compute km position
            km = 0.0
            if self.network and t.current_location in self.network.stations:
                km = self.network.stations[t.current_location].km_from_origin
            if t.current_block and self.network and t.current_block in self.network.blocks:
                blk = self.network.blocks[t.current_block]
                km = (self.network.stations[blk.from_station].km_from_origin +
                      blk.length_km * t.progress_pct)

            train_dicts[tid] = {
                "id": t.id,
                "number": t.number,
                "name": t.name,
                "type": t.train_type,
                "priority_class": t.priority_class,
                "status": t.status.value,
                "current_location": t.current_location,
                "current_block": t.current_block,
                "progress_pct": round(t.progress_pct, 4),
                "speed_kmh": round(t.speed_kmh, 1),
                "current_delay_min": round(t.current_delay_min, 2),
                "path": t.scheduled_path,
                "path_index": t.path_index,
                "direction": t.direction,
                "km_position": round(km, 2),
                "assigned_platform": t.assigned_platform,
                "dwell_remaining_sec": round(t.dwell_remaining_sec, 1),
                "load_tonnes": t.load_tonnes,
                "scheduled_path": t.scheduled_path,
                "scheduled_arrival_terminal": "",  # simplified
                "loco_power_kw": t.loco_power_kw,
            }

        block_occ: Dict[str, List[str]] = {}
        station_state: Dict[str, dict] = {}
        signal_states: Dict[str, str] = {}

        if self.network:
            for bid, blk in self.network.blocks.items():
                block_occ[bid] = list(blk.occupants)
            for sid, stn in self.network.stations.items():
                station_state[sid] = {
                    "id": sid,
                    "name": stn.name,
                    "code": stn.code,
                    "num_platforms": stn.num_platforms,
                    "platform_occupants": {str(k): v for k, v in stn.platform_occupants.items()},
                    "blocked_platforms": list(stn.blocked_platforms),
                    "available_platforms": stn.available_platforms,
                    "km_from_origin": stn.km_from_origin,
                    "latitude": stn.latitude,
                    "longitude": stn.longitude,
                }
            for sig_id, sig in self.network.signals.items():
                signal_states[sig_id] = sig.state.value

        return SimulationSnapshot(
            session_id=self.session_id,
            simulation_time=datetime.now(timezone.utc),
            sim_elapsed_sec=self.sim_elapsed_sec,
            trains=train_dicts,
            block_occupancy=block_occ,
            station_state=station_state,
            signal_states=signal_states,
            active_conflicts=self._active_conflicts,
            completed_trains=list(self.completed_trains),
            running=self.running,
            sim_speed=self.sim_speed,
            kpis=self._kpis,
        )

    # ── Async streaming ────────────────────────────────────────────────────────

    async def stream_states(
        self, interval_sec: float = 1.0
    ) -> AsyncGenerator[SimulationSnapshot, None]:
        """
        Async generator yielding a snapshot every interval_sec wall-clock seconds
        while the simulation is running.
        """
        while True:
            if self.running:
                snapshot = self.tick()
                yield snapshot
            await asyncio.sleep(interval_sec)


# ── Singleton instance ────────────────────────────────────────────────────────

_engine_instance: Optional[SimulationEngine] = None


def get_engine() -> SimulationEngine:
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = SimulationEngine()
    return _engine_instance


def reset_engine() -> SimulationEngine:
    global _engine_instance
    _engine_instance = SimulationEngine()
    return _engine_instance
