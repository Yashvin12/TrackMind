# TrackMind — API Reference

Base URL (local): `http://localhost:8000`

Interactive Swagger UI: `{base_url}/docs`
ReDoc: `{base_url}/redoc`

---

## Authentication

No authentication is required in the current version (designed for internal control centre use). Production deployments should add API key or JWT middleware.

---

## Health

### `GET /api/v1/health`

System health check. Returns status of the API, database, Redis, and current simulation state.

**Response `200`:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "app": "TrackMind",
  "db": "ok",
  "redis": "ok",
  "simulation": {
    "running": true,
    "session_id": "550e8400-e29b-41d4-a716-446655440000",
    "trains": 8,
    "ws_clients": 1
  },
  "timestamp": "2026-06-13T12:00:00Z"
}
```

---

## Simulation

### `POST /api/v1/simulate/start`

Load a scenario and start the simulation engine.

**Request body:**
```json
{ "scenario_id": "demo_5stn" }
```

**Response `200`:**
```json
{ "status": "started", "session_id": "550e8400..." }
```

---

### `POST /api/v1/simulate/pause`

Pause the running simulation (state is preserved).

**Response `200`:**
```json
{ "status": "paused" }
```

---

### `POST /api/v1/simulate/resume`

Resume a paused simulation.

**Response `200`:**
```json
{ "status": "running" }
```

---

### `POST /api/v1/simulate/reset`

Reset the simulation to the initial scenario state.

**Response `200`:**
```json
{ "status": "reset" }
```

---

### `GET /api/v1/simulate/state`

Returns the current simulation snapshot.

**Response `200`:**
```json
{
  "session_id": "550e8400...",
  "simulation_time": "2026-06-13T12:00:00Z",
  "sim_elapsed_sec": 3600.0,
  "running": true,
  "trains": {
    "TRAIN_001": {
      "id": "TRAIN_001",
      "number": "12124",
      "name": "Deccan Queen",
      "type": "express",
      "priority_class": 3,
      "status": "running",
      "current_location": "PUNE",
      "current_block": "BLK_PUNE_LNVL",
      "progress_pct": 0.4532,
      "speed_kmh": 95.0,
      "current_delay_min": 3.5,
      "km_position": 178.2,
      "path": ["PUNE", "LNVL", "KJT", "CSMT"],
      "path_index": 0,
      "direction": 1,
      "assigned_platform": null,
      "dwell_remaining_sec": 0.0
    }
  },
  "block_occupancy": {
    "BLK_PUNE_LNVL": ["TRAIN_001"]
  },
  "signal_states": {
    "SIG_BLK_PUNE_LNVL_HOME": "green"
  },
  "active_conflicts": [],
  "kpis": {
    "total_trains": 8,
    "active_trains": 7,
    "completed_trains": 1,
    "active_conflicts": 0,
    "avg_delay_min": 3.2,
    "throughput_pct": 12.5,
    "block_utilization_pct": 44.4
  }
}
```

---

### `POST /api/v1/simulate/disruption`

Inject a real-time disruption into the simulation.

**Request body:**
```json
{
  "disruption_type": "add_delay",
  "params": {
    "train_id": "TRAIN_001",
    "delay_min": 15
  }
}
```

**Disruption types:**

| `disruption_type` | Required `params` |
|---|---|
| `add_delay` | `train_id`, `delay_min` |
| `close_platform` | `station_id`, `platform` (int) |
| `signal_failure` | `block_id` |
| `block_track` | `block_id` |
| `weather_event` | `speed_factor` (e.g. `0.7` = 70% speed) |
| `restore` | `block_id` |

**Response `200`:**
```json
{ "applied": true, "message": "Added 15min delay to train TRAIN_001" }
```

---

### `POST /api/v1/simulate/hold`

Controller command: hold a specific train in place.

**Request body:**
```json
{ "train_id": "TRAIN_001" }
```

---

### `POST /api/v1/simulate/release`

Release a previously held train.

**Request body:**
```json
{ "train_id": "TRAIN_001" }
```

---

## Conflict Detection

### `POST /api/v1/conflicts/detect`

Run the full conflict detection sweep on the current simulation state.

**Query params:**
- `lookahead_min` (optional, default `60`) — how far ahead to simulate (minutes)

**Response `200`:**
```json
{
  "conflicts": [
    {
      "id": "550e8400...",
      "severity": 0.95,
      "conflict_type": "block_occupancy",
      "affected_trains": ["TRAIN_001", "TRAIN_002"],
      "block_section": "BLK_KJT_LNVL",
      "time_to_conflict_min": 2.5,
      "predicted_delay_min": 12.0,
      "resolution_options": [
        "Hold TRAIN_002 at previous station",
        "Route via alternate block if available"
      ],
      "detected_time": "2026-06-13T12:00:00Z",
      "resolved": false
    }
  ],
  "count": 1,
  "lookahead_min": 60
}
```

---

### `GET /api/v1/conflicts/`

List all currently active (unresolved) conflicts.

---

## Optimization

### `POST /api/v1/optimize/solve`

Run the CP-SAT optimizer against current conflicts. Returns up to 3 ranked solutions.

**Request body:**
```json
{ "timeout_sec": 5 }
```

**Response `200`:**
```json
{
  "solutions": [
    {
      "rank": 1,
      "solver_method": "cp_sat",
      "confidence": "High",
      "total_weighted_delay": 14.5,
      "acceptance_probability": 0.92,
      "explanation": "Hold TRAIN_002 (2min) to resolve block contention. CP-SAT verified optimal.",
      "actions": [
        {
          "action_type": "hold",
          "train_id": "TRAIN_002",
          "duration_min": 2.0,
          "reason": "CP-SAT optimal hold: reduces network delay by 6 weighted-minutes"
        }
      ],
      "predicted_delays": { "TRAIN_001": 3.5, "TRAIN_002": 5.5 },
      "shap_explanation": { "TRAIN_001": 0.241, "TRAIN_002": 0.378 }
    }
  ],
  "conflicts_resolved": 1
}
```

---

### `GET /api/v1/optimize/solutions`

Retrieve the most recent optimization solutions.

---

## Recommendations

### `GET /api/v1/recommendations/`

List all active AI recommendations.

---

### `GET /api/v1/recommendations/{conflict_id}`

Get the AI recommendation for a specific conflict ID.

---

### `POST /api/v1/recommendations/{id}/accept`

Accept a recommendation. Records decision to immutable audit log.

**Response `200`:**
```json
{ "status": "accepted", "audit_log_id": "550e8400..." }
```

---

### `POST /api/v1/recommendations/{id}/override`

Override the AI recommendation with a custom action. Records reasoning in audit log.

**Request body:**
```json
{ "reason": "Platform unavailable at Lonavla — routing via Karjat instead" }
```

---

## KPI

### `GET /api/v1/kpi/`

Current network KPIs.

**Response `200`:**
```json
{
  "total_trains": 8,
  "active_trains": 7,
  "completed_trains": 1,
  "active_conflicts": 2,
  "avg_delay_min": 4.2,
  "throughput_pct": 12.5,
  "delay_reduction_pct": 27.9,
  "recommendations_accepted": 3,
  "recommendations_overridden": 1,
  "block_utilization_pct": 44.4
}
```

---

### `GET /api/v1/kpi/predictions`

XGBoost delay predictions per active train with SHAP feature attributions.

**Response `200`:**
```json
{
  "predictions": [
    {
      "train_id": "TRAIN_001",
      "future_delay_min": 5.2,
      "conflict_probability": 0.312,
      "congestion_level": 0.5,
      "confidence": 0.78,
      "shap_values": {
        "current_delay_min": 1.2,
        "section_load": 0.8,
        "speed_ratio": -0.3
      },
      "model_version": "1.0.0"
    }
  ]
}
```

---

## What-If Analysis

### `POST /api/v1/whatif/simulate`

Simulate a disruption on a **copy** of the current state and return the predicted impact. Does not affect the live simulation.

**Request body:**
```json
{
  "disruption_type": "signal_failure",
  "params": { "block_id": "BLK_KJT_PUNE" }
}
```

**Response `200`:**
```json
{
  "applied": true,
  "impact": {
    "new_conflicts": 2,
    "avg_delay_increase_min": 8.5,
    "affected_trains": ["TRAIN_001", "TRAIN_005"],
    "cascade_risk": "High"
  }
}
```

---

## Audit Log

### `GET /api/v1/audit/`

Retrieve the controller decision audit log. All entries are immutable once written.

**Query params:**
- `session_id` (optional) — filter by simulation session
- `limit` (optional, default `100`) — max results

**Response `200`:**
```json
{
  "logs": [
    {
      "id": "550e8400...",
      "session_id": "...",
      "action_type": "accept",
      "conflict_id": "...",
      "recommendation_id": "...",
      "controller_note": null,
      "outcome_delay_min": 2.0,
      "created_at": "2026-06-13T12:05:00Z"
    }
  ],
  "count": 1,
  "total": 15
}
```

---

## WebSocket

### `WS /ws/live`

Real-time simulation state broadcast at 2Hz (every 500ms wall-clock).

**Connect:** `ws://localhost:8000/ws/live`

**Message types received:**

| `type` | Description |
|---|---|
| `state_update` | Full simulation snapshot (trains, signals, blocks, KPIs) |
| `conflict_alert` | New conflict detected |
| `recommendation_ready` | AI recommendation generated |
| `ping` | Keepalive |

**Example message:**
```json
{
  "type": "state_update",
  "payload": { ... SimulationSnapshot ... },
  "timestamp": "2026-06-13T12:00:00.500Z"
}
```

The client auto-reconnects with a 2-second backoff on any disconnect.
