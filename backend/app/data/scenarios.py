"""
Demo scenario: demo_5stn
Five-station single-line corridor with 10 trains, 2 pre-delayed, 1 blocked platform.

Network topology (real Indian railway corridor: Mumbai–Solapur section):
    MUM ──── PNE ──── LNL ──── KLD ──── SRT

Stations: Mumbai CST | Pune Jn | Lonavala | Karjat | Solapur Rd
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# ── Station definitions ───────────────────────────────────────────────────────

STATIONS: list[dict[str, Any]] = [
    {
        "id": "MUM",
        "name": "Mumbai CST",
        "code": "MUM",
        "num_platforms": 4,
        "num_loops": 2,
        "avg_dwell_sec": 300,
        "km_from_origin": 0.0,
        "latitude": 18.9398,
        "longitude": 72.8354,
    },
    {
        "id": "KLD",
        "name": "Karjat",
        "code": "KLD",
        "num_platforms": 2,
        "num_loops": 2,
        "avg_dwell_sec": 120,
        "km_from_origin": 60.0,
        "latitude": 18.9154,
        "longitude": 73.3344,
    },
    {
        "id": "LNL",
        "name": "Lonavala",
        "code": "LNL",
        "num_platforms": 2,  # platform 2 is BLOCKED in this demo
        "num_loops": 1,
        "avg_dwell_sec": 90,
        "km_from_origin": 96.0,
        "latitude": 18.7479,
        "longitude": 73.4056,
    },
    {
        "id": "PNE",
        "name": "Pune Jn",
        "code": "PNE",
        "num_platforms": 4,
        "num_loops": 2,
        "avg_dwell_sec": 240,
        "km_from_origin": 192.0,
        "latitude": 18.5286,
        "longitude": 73.8745,
    },
    {
        "id": "SRT",
        "name": "Solapur Rd",
        "code": "SRT",
        "num_platforms": 2,
        "num_loops": 1,
        "avg_dwell_sec": 120,
        "km_from_origin": 450.0,
        "latitude": 17.6805,
        "longitude": 75.9064,
    },
]

# ── Track sections ────────────────────────────────────────────────────────────

TRACK_SECTIONS: list[dict[str, Any]] = [
    {
        "id": "BLK_MUM_KLD",
        "name": "Mumbai–Karjat",
        "from_station": "MUM",
        "to_station": "KLD",
        "length_km": 60.0,
        "max_speed_kmh": 100.0,
        "track_type": "double",
    },
    {
        "id": "BLK_KLD_LNL",
        "name": "Karjat–Lonavala",
        "from_station": "KLD",
        "to_station": "LNL",
        "length_km": 36.0,
        "max_speed_kmh": 75.0,    # ghat section — speed restricted
        "track_type": "single",
    },
    {
        "id": "BLK_LNL_PNE",
        "name": "Lonavala–Pune",
        "from_station": "LNL",
        "to_station": "PNE",
        "length_km": 96.0,
        "max_speed_kmh": 110.0,
        "track_type": "double",
    },
    {
        "id": "BLK_PNE_SRT",
        "name": "Pune–Solapur",
        "from_station": "PNE",
        "to_station": "SRT",
        "length_km": 258.0,
        "max_speed_kmh": 120.0,
        "track_type": "double",
    },
    # Reverse direction (for opposing trains)
    {
        "id": "BLK_KLD_MUM",
        "name": "Karjat–Mumbai",
        "from_station": "KLD",
        "to_station": "MUM",
        "length_km": 60.0,
        "max_speed_kmh": 100.0,
        "track_type": "double",
    },
    {
        "id": "BLK_LNL_KLD",
        "name": "Lonavala–Karjat",
        "from_station": "LNL",
        "to_station": "KLD",
        "length_km": 36.0,
        "max_speed_kmh": 75.0,
        "track_type": "single",
    },
    {
        "id": "BLK_PNE_LNL",
        "name": "Pune–Lonavala",
        "from_station": "PNE",
        "to_station": "LNL",
        "length_km": 96.0,
        "max_speed_kmh": 110.0,
        "track_type": "double",
    },
    {
        "id": "BLK_SRT_PNE",
        "name": "Solapur–Pune",
        "from_station": "SRT",
        "to_station": "PNE",
        "length_km": 258.0,
        "max_speed_kmh": 120.0,
        "track_type": "double",
    },
]

# Station order for km calculation
STATION_KM: dict[str, float] = {s["id"]: s["km_from_origin"] for s in STATIONS}

# ── Train definitions ─────────────────────────────────────────────────────────
# priority_class: 5=Rajdhani, 3=Express, 2=Passenger, 1=Freight, 0=Departmental
# direction: 1 = up (MUM→SRT), -1 = down (SRT→MUM)

TRAINS: list[dict[str, Any]] = [
    # Up trains (Mumbai → Solapur)
    {
        "id": "12127",
        "number": "12127",
        "name": "Mumbai Rajdhani",
        "train_type": "rajdhani",
        "priority_class": 5,
        "load_tonnes": 550,
        "loco_power_kw": 6000,
        "max_speed_kmh": 130,
        "scheduled_path": ["MUM", "KLD", "LNL", "PNE", "SRT"],
        "direction": 1,
        "current_location": "MUM",
        "current_block": "BLK_MUM_KLD",
        "speed_kmh": 95.0,
        "progress_pct": 0.15,        # 15% through current block
        "initial_delay_min": 0,
    },
    {
        "id": "11301",
        "number": "11301",
        "name": "Udyan Express",
        "train_type": "express",
        "priority_class": 3,
        "load_tonnes": 650,
        "loco_power_kw": 4500,
        "max_speed_kmh": 110,
        "scheduled_path": ["MUM", "KLD", "LNL", "PNE", "SRT"],
        "direction": 1,
        "current_location": "MUM",
        "current_block": "BLK_MUM_KLD",
        "speed_kmh": 85.0,
        "progress_pct": 0.05,
        "initial_delay_min": 8,      # PRE-DELAYED
    },
    {
        "id": "51421",
        "number": "51421",
        "name": "Mumbai–Pune Passenger",
        "train_type": "passenger",
        "priority_class": 2,
        "load_tonnes": 400,
        "loco_power_kw": 2800,
        "max_speed_kmh": 80,
        "scheduled_path": ["MUM", "KLD", "LNL", "PNE"],
        "direction": 1,
        "current_location": "KLD",
        "current_block": "BLK_KLD_LNL",
        "speed_kmh": 65.0,
        "progress_pct": 0.40,
        "initial_delay_min": 0,
    },
    {
        "id": "77605",
        "number": "77605",
        "name": "Deccan Queen",
        "train_type": "express",
        "priority_class": 3,
        "load_tonnes": 580,
        "loco_power_kw": 4500,
        "max_speed_kmh": 110,
        "scheduled_path": ["MUM", "KLD", "LNL", "PNE"],
        "direction": 1,
        "current_location": "KLD",
        "current_block": "BLK_KLD_LNL",
        "speed_kmh": 80.0,
        "progress_pct": 0.70,
        "initial_delay_min": 12,     # PRE-DELAYED
    },
    {
        "id": "13401",
        "number": "13401",
        "name": "Pune–Solapur Freight",
        "train_type": "freight",
        "priority_class": 1,
        "load_tonnes": 3200,
        "loco_power_kw": 4500,
        "max_speed_kmh": 65,
        "scheduled_path": ["MUM", "PNE", "SRT"],
        "direction": 1,
        "current_location": "MUM",
        "current_block": "BLK_MUM_KLD",
        "speed_kmh": 55.0,
        "progress_pct": 0.02,
        "initial_delay_min": 0,
    },
    # Down trains (Solapur → Mumbai)
    {
        "id": "12128",
        "number": "12128",
        "name": "Solapur Rajdhani",
        "train_type": "rajdhani",
        "priority_class": 5,
        "load_tonnes": 550,
        "loco_power_kw": 6000,
        "max_speed_kmh": 130,
        "scheduled_path": ["SRT", "PNE", "LNL", "KLD", "MUM"],
        "direction": -1,
        "current_location": "PNE",
        "current_block": "BLK_PNE_LNL",
        "speed_kmh": 105.0,
        "progress_pct": 0.30,
        "initial_delay_min": 0,
    },
    {
        "id": "11302",
        "number": "11302",
        "name": "Udyan Express (Ret)",
        "train_type": "express",
        "priority_class": 3,
        "load_tonnes": 650,
        "loco_power_kw": 4500,
        "max_speed_kmh": 110,
        "scheduled_path": ["SRT", "PNE", "LNL", "KLD", "MUM"],
        "direction": -1,
        "current_location": "LNL",
        "current_block": "BLK_LNL_KLD",
        "speed_kmh": 70.0,
        "progress_pct": 0.20,
        "initial_delay_min": 5,
    },
    {
        "id": "51422",
        "number": "51422",
        "name": "Pune–Mumbai Passenger",
        "train_type": "passenger",
        "priority_class": 2,
        "load_tonnes": 400,
        "loco_power_kw": 2800,
        "max_speed_kmh": 80,
        "scheduled_path": ["PNE", "LNL", "KLD", "MUM"],
        "direction": -1,
        "current_location": "LNL",
        "current_block": "BLK_LNL_KLD",
        "speed_kmh": 60.0,
        "progress_pct": 0.55,
        "initial_delay_min": 0,
    },
    {
        "id": "59661",
        "number": "59661",
        "name": "Intercity Express",
        "train_type": "express",
        "priority_class": 3,
        "load_tonnes": 520,
        "loco_power_kw": 4000,
        "max_speed_kmh": 100,
        "scheduled_path": ["SRT", "PNE", "KLD", "MUM"],
        "direction": -1,
        "current_location": "PNE",
        "current_block": "BLK_PNE_LNL",
        "speed_kmh": 90.0,
        "progress_pct": 0.10,
        "initial_delay_min": 0,
    },
    {
        "id": "92501",
        "number": "92501",
        "name": "DPT Special",
        "train_type": "departmental",
        "priority_class": 0,
        "load_tonnes": 200,
        "loco_power_kw": 2000,
        "max_speed_kmh": 50,
        "scheduled_path": ["PNE", "LNL"],
        "direction": -1,
        "current_location": "PNE",
        "current_block": "BLK_PNE_LNL",
        "speed_kmh": 40.0,
        "progress_pct": 0.60,
        "initial_delay_min": 0,
    },
]

# ── Disruptions active at scenario start ──────────────────────────────────────

INITIAL_DISRUPTIONS: list[dict[str, Any]] = [
    {
        "type": "platform_blocked",
        "station": "LNL",
        "platform": 2,
        "reason": "Engineering maintenance — platform 2 at Lonavala blocked",
    },
]

# ── Signal positions ──────────────────────────────────────────────────────────
# Each block has approach signal and home signal
SIGNALS: list[dict[str, Any]] = [
    {"id": f"SIG_{sec['id']}_APP", "block_id": sec["id"], "type": "approach", "state": "green"}
    for sec in TRACK_SECTIONS
] + [
    {"id": f"SIG_{sec['id']}_HOME", "block_id": sec["id"], "type": "home", "state": "green"}
    for sec in TRACK_SECTIONS
]

# Minimum headway between consecutive trains on same block (seconds)
MIN_HEADWAY_SEC: int = 300  # 5 minutes

# Block capacity (max trains simultaneously)
BLOCK_CAPACITY: dict[str, int] = {
    "BLK_KLD_LNL": 1,   # single line — one train at a time
    "BLK_LNL_KLD": 1,
    "BLK_MUM_KLD": 2,
    "BLK_KLD_MUM": 2,
    "BLK_LNL_PNE": 2,
    "BLK_PNE_LNL": 2,
    "BLK_PNE_SRT": 2,
    "BLK_SRT_PNE": 2,
}


def get_scenario(scenario_id: str) -> dict[str, Any]:
    """Return scenario configuration by ID."""
    if scenario_id != "demo_5stn":
        raise ValueError(f"Unknown scenario: {scenario_id}. Available: ['demo_5stn']")
    return {
        "id": "demo_5stn",
        "name": "Mumbai–Solapur Corridor Demo",
        "description": "5-station corridor with 10 trains, 2 pre-delayed, 1 platform blocked",
        "stations": STATIONS,
        "track_sections": TRACK_SECTIONS,
        "trains": TRAINS,
        "signals": SIGNALS,
        "initial_disruptions": INITIAL_DISRUPTIONS,
        "block_capacity": BLOCK_CAPACITY,
        "min_headway_sec": MIN_HEADWAY_SEC,
        "station_km": STATION_KM,
    }
