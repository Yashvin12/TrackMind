"""
test_health.py — Health endpoint & app startup tests.
"""
from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_health_returns_ok(client):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert "simulation" in body


@pytest.mark.asyncio
async def test_health_simulation_section(client):
    body = (await client.get("/api/v1/health")).json()
    sim = body["simulation"]
    assert "running" in sim
    assert "trains" in sim
    assert "ws_clients" in sim


@pytest.mark.asyncio
async def test_root_endpoint(client):
    resp = await client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert "TrackMind" in body["message"]
    assert "/docs" in body["docs"]


@pytest.mark.asyncio
async def test_health_has_timestamp(client):
    body = (await client.get("/api/v1/health")).json()
    assert "timestamp" in body
    # Should be an ISO 8601 string
    ts = body["timestamp"]
    assert "T" in ts and "Z" in ts or "+" in ts
