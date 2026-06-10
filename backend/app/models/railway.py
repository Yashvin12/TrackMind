"""Railway domain ORM models."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.db.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uuid() -> str:
    return str(uuid.uuid4())


# ── Station ──────────────────────────────────────────────────────────────────

class StationModel(Base):
    __tablename__ = "stations"

    id = Column(String(64), primary_key=True, default=_uuid)
    name = Column(String(128), nullable=False)
    code = Column(String(8), nullable=False, unique=True)
    num_platforms = Column(Integer, default=2)
    num_loops = Column(Integer, default=1)
    avg_dwell_sec = Column(Integer, default=120)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (Index("ix_stations_code", "code"),)


# ── Track Section ─────────────────────────────────────────────────────────────

class TrackSectionModel(Base):
    __tablename__ = "track_sections"

    id = Column(String(64), primary_key=True, default=_uuid)
    name = Column(String(128), nullable=False)
    from_station_id = Column(String(64), ForeignKey("stations.id"), nullable=False)
    to_station_id = Column(String(64), ForeignKey("stations.id"), nullable=False)
    length_km = Column(Float, nullable=False)
    max_speed_kmh = Column(Float, default=110.0)
    track_type = Column(String(16), default="single")  # single | double | junction
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_track_sections_from", "from_station_id"),
        Index("ix_track_sections_to", "to_station_id"),
    )


# ── Train ─────────────────────────────────────────────────────────────────────

class TrainModel(Base):
    __tablename__ = "trains"

    id = Column(String(64), primary_key=True, default=_uuid)
    number = Column(String(16), nullable=False, unique=True)
    name = Column(String(128), nullable=True)
    train_type = Column(String(24), nullable=False)  # rajdhani|express|passenger|freight|departmental
    priority_class = Column(Integer, default=2)       # 5|3|2|1|0
    load_tonnes = Column(Float, default=500.0)
    loco_power_kw = Column(Float, default=4500.0)
    max_speed_kmh = Column(Float, default=110.0)
    scheduled_path = Column(JSON, default=list)       # list of station codes
    scheduled_departure = Column(DateTime(timezone=True), nullable=True)
    scheduled_arrival = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    events = relationship("SimulationEventModel", back_populates="train", lazy="dynamic")


# ── Simulation Event ──────────────────────────────────────────────────────────

class SimulationEventModel(Base):
    __tablename__ = "simulation_events"

    id = Column(String(64), primary_key=True, default=_uuid)
    session_id = Column(String(64), nullable=False, index=True)
    sim_time = Column(Float, nullable=False)          # seconds since epoch
    real_time = Column(DateTime(timezone=True), default=_now)
    train_id = Column(String(64), ForeignKey("trains.id"), nullable=True)
    event_type = Column(String(32), nullable=False)   # block_enter|occupy|leave|hold|depart|arrive
    block_section = Column(String(64), nullable=True)
    station_code = Column(String(8), nullable=True)
    speed_kmh = Column(Float, nullable=True)
    delay_min = Column(Float, default=0.0)
    metadata = Column(JSON, default=dict)

    train = relationship("TrainModel", back_populates="events")

    __table_args__ = (
        Index("ix_sim_events_session", "session_id"),
        Index("ix_sim_events_type", "event_type"),
    )


# ── Conflict ──────────────────────────────────────────────────────────────────

class ConflictModel(Base):
    __tablename__ = "conflicts"

    id = Column(String(64), primary_key=True, default=_uuid)
    session_id = Column(String(64), nullable=False, index=True)
    detected_time = Column(DateTime(timezone=True), default=_now)
    conflict_type = Column(String(32), nullable=False)
    severity = Column(Float, nullable=False)
    trains_involved = Column(JSON, default=list)
    block_section = Column(String(64), nullable=True)
    time_to_conflict_min = Column(Float, nullable=False)
    predicted_delay_min = Column(Float, default=0.0)
    resolution_options = Column(JSON, default=list)
    resolved = Column(Boolean, default=False)
    resolution_action = Column(Text, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_conflicts_session", "session_id"),
        Index("ix_conflicts_resolved", "resolved"),
    )


# ── Recommendation ────────────────────────────────────────────────────────────

class RecommendationModel(Base):
    __tablename__ = "recommendations"

    id = Column(String(64), primary_key=True, default=_uuid)
    conflict_id = Column(String(64), ForeignKey("conflicts.id"), nullable=False, index=True)
    session_id = Column(String(64), nullable=False, index=True)
    generated_time = Column(DateTime(timezone=True), default=_now)
    generated_by = Column(String(32), default="cp_sat")
    options = Column(JSON, default=list)               # list[RecommendationOption]
    selected_option_rank = Column(Integer, nullable=True)
    status = Column(String(16), default="pending")     # pending|accepted|overridden|expired

    __table_args__ = (
        Index("ix_recommendations_conflict", "conflict_id"),
        Index("ix_recommendations_status", "status"),
    )


# ── Audit Log ─────────────────────────────────────────────────────────────────

class AuditLogModel(Base):
    __tablename__ = "audit_logs"

    id = Column(String(64), primary_key=True, default=_uuid)
    timestamp = Column(DateTime(timezone=True), default=_now, index=True)
    session_id = Column(String(64), nullable=False, index=True)
    event_type = Column(String(32), nullable=False)    # recommendation_generated|accepted|overridden|disruption
    train_ids = Column(JSON, default=list)
    conflict_id = Column(String(64), nullable=True)
    recommendation_id = Column(String(64), nullable=True)
    recommended_action = Column(Text, nullable=True)
    predicted_delay_min = Column(Float, nullable=True)
    controller_decision = Column(String(32), nullable=True)
    controller_override_reason = Column(Text, nullable=True)
    actual_delay_min = Column(Float, nullable=True)
    outcome_deviation = Column(Float, nullable=True)
    section_id = Column(String(64), nullable=False, default="demo_5stn")
    controller_id = Column(String(64), nullable=False, default="controller_1")
    system_version = Column(String(16), default="1.0.0")
    input_snapshot = Column(JSON, nullable=True)       # compressed snapshot at decision time
    output_decision = Column(JSON, nullable=True)

    __table_args__ = (
        Index("ix_audit_session", "session_id"),
        Index("ix_audit_event_type", "event_type"),
    )


# ── Metric Snapshot ───────────────────────────────────────────────────────────

class MetricSnapshotModel(Base):
    __tablename__ = "metric_snapshots"

    id = Column(String(64), primary_key=True, default=_uuid)
    session_id = Column(String(64), nullable=False, index=True)
    recorded_at = Column(DateTime(timezone=True), default=_now, index=True)
    total_trains = Column(Integer, default=0)
    active_conflicts = Column(Integer, default=0)
    avg_delay_min = Column(Float, default=0.0)
    throughput_pct = Column(Float, default=100.0)
    recommendations_accepted = Column(Integer, default=0)
    recommendations_overridden = Column(Integer, default=0)
    delay_reduction_pct = Column(Float, default=0.0)
    block_utilization_pct = Column(Float, default=0.0)
    extra = Column(JSON, default=dict)
