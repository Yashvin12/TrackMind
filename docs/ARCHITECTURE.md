# TrackMind — Architecture Deep Dive

## System Overview

TrackMind is a multi-service application designed for real-time, low-latency railway traffic management. It is composed of six decoupled backend modules, a React frontend, and infrastructure services (PostgreSQL, Redis, Prometheus).

---

## Backend Modules

The backend is split into six clearly separated service modules, each with a single responsibility:

### Module A — Digital Railway Twin (`simulator.py`)

The core physics engine built on **SimPy 4** (discrete-event simulation).

**Key classes:**
- `RailwayNetwork` — Graph of `StationData`, `BlockSection`, and `SignalData` nodes, built from a JSON scenario definition.
- `TrainState` — Per-train physics state: position (km), speed, block occupancy, platform assignment, dwell timer, delay accumulation.
- `SimulationEngine` — Advances wall-clock time via `tick(dt)`, applies physics, detects arrivals, manages block occupancy, and exports a `SimulationSnapshot`.

**Simulation loop:**
```
wall-clock tick (1s) → sim_speed multiplier (default 60x) → dt_sec
     └──▶ _update_train() × N trains
              ├── TrainStatus.DWELLING  → decrement dwell timer → depart
              ├── TrainStatus.STOPPED   → try_enter_next_block
              └── TrainStatus.RUNNING   → advance progress_pct
                                          → progress ≥ 1.0 → _arrive_at_station
```

**Disruptions (injectable at runtime):**

| Type | Effect |
|---|---|
| `add_delay` | Add N minutes to a specific train |
| `close_platform` | Block a platform at a station |
| `signal_failure` | Set signal to RED + mark as failed |
| `block_track` | Mark a block as `is_blocked=True` |
| `weather_event` | Apply speed reduction factor to all trains |
| `restore` | Clear block or signal failure |

---

### Module B — Conflict Detection Engine (`conflict_detector.py`)

Deterministic, stateless detector. Accepts a `SimulationSnapshot` and returns a ranked list of `Conflict` objects in **< 100ms**.

**8 Conflict types detected:**

| Type | Detection Method |
|---|---|
| Block Collision | Block occupants > block capacity |
| Opposing Deadlock | Trains on reverse-pair blocks (from/to swapped) |
| Headway Violation | Estimated gap < MIN_HEADWAY_SEC (5 min) |
| Platform Contention | Available platforms = 0, trains incoming |
| Overtaking Conflict | Closing rate > 10 km/h, time-to-catch < 15 min |
| Loop Saturation | Total platform + loop capacity exceeded, more trains incoming |
| Signal Violation | Train on block with RED signal at > 0% progress |

**Performance guarantee:** Early exit per conflict type, pure Python — no I/O in detection path.

---

### Module C — Optimization Engine (`optimizer.py`)

**Primary:** Google OR-Tools CP-SAT constraint solver.

**Decision variables:**
- `hold[train_id] ∈ {0, 1, 2, 3, 4, 5}` — hold duration in 60-second units

**Constraints:**
- For each conflict `(t1, t2)`: `max(hold[t1], hold[t2]) ≥ 1`

**Objective:**
```
minimize Σ (priority_weight[t] × (base_delay[t] + hold[t]))
```

Where `priority_weight = {Rajdhani: 5, Express: 3, Passenger: 2, Freight: 1, DPT: 0}`.

**Fallback:** Greedy heuristic — sort conflicts by severity, let highest-priority train proceed, hold all others. Always produces a feasible solution.

**Output:** Top 3 `Solution` objects ranked by `total_weighted_delay`, each with SHAP contribution breakdown.

---

### Module D — Recommender (`recommender.py`)

Translates raw `Solution` actions from the optimizer into human-readable `Recommendation` cards with:
- Natural language explanation
- Confidence level (High / Medium / Low)
- Acceptance probability score
- SHAP feature contributions

---

### Module E — Prediction Engine (`predictor.py`)

**Models:**
- `DelayPredictor` — XGBoost regressor predicting delay at next station
- `ConflictPredictor` — XGBoost classifier predicting conflict probability in next 60 minutes

**Features (DelayPredictor):**
```
[current_delay_min, priority_class, speed_ratio, section_load,
 progress_pct, hour_of_day, dwell_remaining_sec, load_tonnes_norm,
 direction, path_remaining]
```

**Training:** 2,000 synthetic samples generated at startup using known railway physics relationships (section_load × 8, (1 - speed_ratio) × 5 contribute most to delay). No external dataset required.

**Explainability:** SHAP TreeExplainer generates per-feature attribution values, displayed in the AI Inspector Panel.

---

### Module F — What-If Engine (`whatif_engine.py`)

Accepts a disruption specification, applies it to a **deep copy** of the current simulation state, runs N ticks forward, computes impact delta (delay increase, new conflicts, throughput change), and returns the result **without mutating the live simulation**.

---

## Data Flow

```
HTTP POST /api/v1/simulate/start
         │
         ▼
SimulationEngine.load_scenario()
         │
         ▼
WebSocket broadcast loop (every 1s wall-clock)
         │
         ├── engine.tick() → SimulationSnapshot
         ├── conflict_detector.detect(snapshot) → [Conflict]
         ├── engine.set_active_conflicts(conflicts)
         └── manager.broadcast(snapshot as JSON)
                   │
                   ▼
         Frontend WebSocket client
                   │
                   ▼
         Zustand store update → React re-render
```

---

## Database Schema

| Table | Purpose |
|---|---|
| `audit_logs` | Immutable record of every controller action |
| `recommendations` | Stored AI recommendations with outcomes |
| `simulation_sessions` | Session metadata and KPI snapshots |

The database layer uses **SQLAlchemy 2.0 async** with `asyncpg` for PostgreSQL. SQLite (via `aiosqlite`) is used as a fallback for local development.

---

## WebSocket Protocol

**Endpoint:** `ws://{host}/ws/live`

**Message format (Server → Client):**
```json
{
  "type": "state_update",
  "payload": {
    "session_id": "uuid",
    "trains": { "TRAIN_001": { "speed_kmh": 95.0, ... } },
    "block_occupancy": { "BLK_CSMT_KRJ": ["TRAIN_001"] },
    "signal_states": { "SIG_BLK_CSMT_KRJ_HOME": "green" },
    "active_conflicts": [...],
    "kpis": { "avg_delay_min": 4.2, "throughput_pct": 73.0 }
  },
  "timestamp": "2026-01-01T10:00:00Z"
}
```

**Reconnection:** Client auto-reconnects with 2-second backoff on disconnect.

---

## Infrastructure

```
┌─────────────┐      ┌────────────────┐     ┌────────────────┐
│  PostgreSQL  │◀────│    FastAPI      │────▶│     Redis      │
│  (state/    │      │   Backend       │     │  (pub/sub +    │
│   audit)    │      │   (8000)        │     │   session)     │
└─────────────┘      └───────┬────────┘     └────────────────┘
                             │
                    ┌────────▼────────┐
                    │    Prometheus   │
                    │    (metrics)    │
                    └─────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Nginx (5173)   │
                    │  React SPA +    │
                    │  /api → :8000   │
                    │  /ws  → :8000   │
                    └─────────────────┘
```