# 🚆 TrackMind — AI-Powered Railway Network Control Centre

> **FAR AWAY 2026 Hackathon Submission — Railways Theme**
> *Transforming legacy railway operations with proactive AI, real-time simulation, and explainable decision support.*

---

## 🎬 Demo

| | |
|---|---|
| **📹 Video Demo** | [Watch on Google Drive](https://drive.google.com/file/d/1_SguffRtEOrF5GoHnen-Cdmc4hOICsyT/view?usp=sharing) |

---

## ⚠️ The Problem: Legacy Operations & Cognitive Overload

In India's 68,000+ km railway network, section controllers manage dozens of simultaneous train movements across massive corridors — using **decades-old SCADA systems and paper-based train registers**.

| Pain Point | Impact |
|---|---|
| **Reactive Decision-Making** | Controllers only act *after* delays compound, causing cascading failures |
| **Cognitive Overload** | Cluttered legacy COA systems force manual cross-referencing across multiple screens |
| **Manual Conflict Resolution** | Human-calculated speed, distance and clearance checks create safety risks |
| **Black-Box Automation** | Automated tools that cannot explain *why* they recommend actions destroy controller trust |

---

## 💡 The Solution: TrackMind

TrackMind is a next-generation **AI-assisted, proactive** command interface — a co-pilot for the section controller that sees conflicts before they happen and explains every recommendation in plain language.

```
┌─────────────────────────────────────────────────────────────┐
│  Section Controller's Decision Loop — Powered by TrackMind  │
│                                                             │
│  Real-Time Telemetry (2Hz)                                  │
│        │                                                    │
│        ▼                                                    │
│  ┌─────────────────┐    Conflict     ┌──────────────────┐   |
│  │  Digital Twin   │───Detected──▶  │ AI Action Queue  │    │
│  │  (SimPy engine) │                │  + SHAP explain  │    │
│  └─────────────────┘                └──────────────────┘    │
│        │                                    │               │
│        ▼                                    ▼               │
│  ┌──────────────┐               ┌─────────────────────┐     │
│  │  Network Map │               │ Controller 1-Click  │     │
│  │  (Live 70%)  │               │ Accept / Override   │     │
│  └──────────────┘               └─────────────────────┘     │
│                                         │                   │
│                                         ▼                   │
│                                  Immutable Audit Log        │
└─────────────────────────────────────────────────────────────┘
```

---

## ✨ Key Features

### 🗺️ Real-Time Network Occupancy Map (70% Viewport)
Live canvas showing block occupancy, **3-light signal states** (🔴🟡🟢), and animated train positions updating at 2Hz via WebSocket. Supports both **Dark Mode** (dimly-lit control room) and Light Mode.

### ⚡ Proactive Conflict Detection (T-Minus Warnings)
Deterministic sub-100ms engine detects **8 conflict types** before they occur:

| # | Conflict Type | Severity |
|---|---|---|
| 1 | Block Collision — two trains in same single-track block | 🔴 Critical (0.95) |
| 2 | Opposing Deadlock — head-on on single track, no loop | 🔴 Critical (0.99) |
| 3 | Signal Violation — train projected to cross red signal | 🔴 High (0.90) |
| 4 | Platform Contention — station fully occupied | 🟠 High (0.85) |
| 5 | Loop Saturation — loop at capacity, train approaching | 🟠 Major (0.75) |
| 6 | Headway Violation — inter-train gap < 5 minutes | 🟡 Major (0.80) |
| 7 | Overtaking Conflict — faster train closing on slower | 🟡 Minor (0.65) |
| 8 | Capacity Overflow — more trains than station can handle | 🟡 Minor (0.50) |

### 🤖 AI-Driven Action Queue with CP-SAT Optimization
Google OR-Tools **CP-SAT solver** generates the mathematically optimal schedule modification — minimising total weighted delay (Rajdhani=5, Express=3, Passenger=2, Freight=1). A greedy heuristic fallback always guarantees a valid solution.

### 🧠 Explainable AI (SHAP Values)
Every recommendation shows controllers **exactly why** it was generated — which features (section load, delay, priority class, speed ratio) contributed most to the decision. Builds human trust in automated systems.

### 🔬 "What-If" Scenario Lab
Controllers can inject disruptions and see ripple effects *before* committing:
- ➕ Add train delay (minutes)
- 🚫 Close platform at any station
- 🚨 Signal failure on any block
- 🛤️ Block a track section
- 🌧️ Weather event (speed reduction)

### 📊 ML Delay Forecast (XGBoost + SHAP)
Per-train delay predictions using XGBoost trained on 2,000 synthetic samples. Features include section load, speed ratio, priority class, hour of day, and path progress. Self-trains on startup — no external data required.

### 🕐 Time-Space Diagram
Interactive train trajectory visualization to spot crossing points and headway violations at a glance.

### 📋 Immutable Audit Log
Every controller decision (accept, override) is recorded with timestamps, reasoning, and outcome — essential for post-incident review and regulatory compliance.

### 📈 KPI Dashboard Strip
Inline header tracking: **Active Trains**, **Conflicts**, **Avg Network Delay**, **Block Utilization %**, **Throughput %**.

---

## 🏗️ Architecture & Tech Stack

```
┌──────────────────────────────────────────────────────────────────┐
│                          FRONTEND                                │
│  React 18 + Vite + TypeScript                                    │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────────┐   │
│  │  NetworkMap  │  │ ConflictAlert│ │ TimeSpaceDiagram       │   │
│  │  (Canvas)    │  │ + AI Queue  │  │ (Plotly.js)            │   │
│  └──────────────┘  └─────────────┘  └────────────────────────┘   │
│  Zustand (state) · React Query (server cache) · WebSocket (2Hz)  │
└──────────────────────────┬───────────────────────────────────────┘
                           │ REST /api/v1 + WebSocket /ws/live
┌──────────────────────────▼───────────────────────────────────────┐
│                          BACKEND                                 │
│  FastAPI + Uvicorn (Python 3.11)                                 │
│                                                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐    │
│  │ SimPy Digital  │  │ Conflict       │  │ OR-Tools CP-SAT  │    │
│  │ Twin Engine    │  │ Detector       │  │ Optimizer        │    │
│  │ (Module A)     │  │ (Module B)     │  │ (Module C)       │    │
│  └────────────────┘  └────────────────┘  └──────────────────┘    │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────────┐    │
│  │ Recommender    │  │ XGBoost/SHAP   │  │ What-If Engine   │    │
│  │ (Module D)     │  │ Predictor(E)   │  │ (Module F)       │    │
│  └────────────────┘  └────────────────┘  └──────────────────┘    │
│                                                                  │
│  PostgreSQL (SQLAlchemy async) · Redis (pub/sub) · Prometheus    │
└──────────────────────────────────────────────────────────────────┘
```

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18 + Vite 5 |
| Language | TypeScript 5 (strict mode) |
| State | Zustand (global) + TanStack Query (server cache) |
| Real-Time | WebSocket — 2Hz simulation telemetry stream |
| Charts | Plotly.js (Time-Space Diagram) |
| Animation | Framer Motion |
| Styling | Custom CSS design system (WCAG 4.5:1, JetBrains Mono) |
| Build | Multi-stage Docker → Nginx Alpine |

### Backend
| Layer | Technology |
|---|---|
| API Framework | FastAPI 0.111 + Uvicorn |
| Language | Python 3.11 |
| Simulation | SimPy 4 — discrete-event digital twin |
| Optimization | Google OR-Tools CP-SAT (constraint programming) |
| ML / Predictions | XGBoost + SHAP (self-trains on synthetic data) |
| Graph / Routing | NetworkX |
| Database | PostgreSQL 15 (async via SQLAlchemy + asyncpg) |
| Cache / Pub-Sub | Redis 7 |
| Monitoring | Prometheus + FastAPI Instrumentator |
| Containerization | Docker + Docker Compose |

---

## 🚀 Getting Started

### Prerequisites
- **Docker** & **Docker Compose** (for full-stack)
- **Node.js v18+** (for frontend-only dev)
- **Python 3.11+** (for backend-only dev)

### Option A — Full Stack (Recommended)
Spin up everything (Frontend · Backend · PostgreSQL · Redis · Prometheus) with one command:
```bash
git clone https://github.com/your-username/TrackMind.git
cd TrackMind
docker-compose up -d --build
```
| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Prometheus Metrics | http://localhost:9090 |

### Option B — Frontend Dev Only
Run the React frontend against an already-running backend:
```bash
cd frontend
npm install
npm run dev
```
Opens at `http://localhost:5173`

### Option C — Backend Dev Only
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Environment Variables

**Backend** (`.env.local` in `/backend`):
```env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/trackmind
REDIS_URL=redis://localhost:6379/0
DEBUG=true
CORS_ORIGINS=["http://localhost:5173"]
```

**Frontend** (`.env.local` in `/frontend` — only needed when not using Docker Nginx proxy):
```env
VITE_API_URL=http://localhost:8000/api/v1
VITE_WS_URL=ws://localhost:8000
```

---

## 📡 API Reference

Full interactive API documentation available at `/docs` (Swagger UI) once the backend is running.

### Key Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | System health check (DB, Redis, simulation status) |
| `POST` | `/api/v1/simulate/start` | Load scenario and start simulation |
| `POST` | `/api/v1/simulate/pause` | Pause simulation |
| `POST` | `/api/v1/simulate/reset` | Reset to initial scenario state |
| `GET` | `/api/v1/simulate/state` | Current simulation snapshot |
| `POST` | `/api/v1/conflicts/detect` | Run conflict detection (configurable lookahead) |
| `GET` | `/api/v1/conflicts/` | List all active conflicts |
| `POST` | `/api/v1/optimize/solve` | Run CP-SAT optimization |
| `GET` | `/api/v1/recommendations/{id}` | Get AI recommendation for a conflict |
| `POST` | `/api/v1/recommendations/{id}/accept` | Accept recommendation (logged to audit) |
| `POST` | `/api/v1/recommendations/{id}/override` | Override with custom action (logged) |
| `POST` | `/api/v1/whatif/simulate` | Run a what-if disruption scenario |
| `GET` | `/api/v1/kpi/` | Current KPIs |
| `GET` | `/api/v1/kpi/predictions` | ML delay predictions per train |
| `GET` | `/api/v1/audit/` | Audit log of controller decisions |
| `WS` | `/ws/live` | Real-time simulation state stream (2Hz) |

---

---

## 🎨 Design Philosophy

TrackMind's UI is purpose-built for **24/7 control rooms**, not dashboards.

- **Function Over Form** — No decorative animations. Color semantics strictly enforced: 🔴 Red = Danger, 🟠 Amber = Warning, 🟢 Green/Blue = Safe
- **High Information Density** — JetBrains Mono for all numeric data to prevent layout shift. Maximum data in minimum screen space
- **Dark Mode Native** — Essential for dimly-lit control rooms, reduces eye strain during 12-hour shifts
- **WCAG 4.5:1 Contrast** — All text meets accessibility contrast standards
- **70/30 Split Layout** — 70% Network Map (primary operational view) + 30% Action Queue (controller workflow)

---

## 📁 Project Structure

```
TrackMind/
├── frontend/                    # React + Vite application
│   ├── src/
│   │   ├── components/          # 13 UI components
│   │   │   ├── NetworkMap.tsx        # Live railway map canvas
│   │   │   ├── ConflictAlert.tsx     # AI action queue + alerts
│   │   │   ├── TimeSpaceDiagram.tsx  # Train trajectory chart
│   │   │   ├── KPIDashboard.tsx      # KPI header strip
│   │   │   ├── WhatIfPanel.tsx       # Disruption lab
│   │   │   ├── PredictionPanel.tsx   # ML delay forecasts
│   │   │   ├── AIInspectorPanel.tsx  # SHAP explanation panel
│   │   │   ├── AuditLog.tsx          # Decision history
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── api.ts           # Axios REST client
│   │   │   └── websocket.ts     # WebSocket client (auto-reconnect)
│   │   ├── store/               # Zustand global state
│   │   ├── types/               # TypeScript type definitions
│   │   └── App.tsx              # Root component + layout
│   ├── nginx.conf               # Production Nginx (SPA + WS proxy)
│   └── Dockerfile               # Multi-stage: Node build → Nginx serve
│
├── backend/                     # FastAPI Python application
│   ├── app/
│   │   ├── main.py              # FastAPI app, CORS, WebSocket, lifespan
│   │   ├── core/
│   │   │   ├── config.py        # Pydantic settings (env-aware)
│   │   │   ├── logging.py       # Structured logging
│   │   │   └── middleware.py    # Request ID middleware
│   │   ├── services/
│   │   │   ├── simulator.py     # Module A: SimPy digital twin engine
│   │   │   ├── conflict_detector.py  # Module B: 8-type conflict detection
│   │   │   ├── optimizer.py     # Module C: CP-SAT + heuristic solver
│   │   │   ├── recommender.py   # Module D: Action recommendation engine
│   │   │   ├── predictor.py     # Module E: XGBoost + SHAP predictor
│   │   │   ├── whatif_engine.py # Module F: What-if scenario analysis
│   │   │   └── audit_service.py # Immutable decision audit log
│   │   ├── routers/             # FastAPI route handlers (7 routers)
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── db/                  # DB + Redis connection management
│   │   └── data/                # Railway scenario definitions (JSON)
│   ├── tests/                   # Pytest async test suite
│   ├── requirements.txt         # Python dependencies
│   └── Dockerfile               # Production Python container
│
├── docker-compose.yml           # Full-stack orchestration
├── prometheus.yml               # Metrics scrape config
└── docs/                        # Extended documentation
    ├── API.md
    └── ARCHITECTURE.md
```

---

## 🧪 Testing

```bash
# Backend unit + integration tests
cd backend
pytest tests/ -v --cov=app --cov-report=term-missing

# Frontend (Vitest)
cd frontend
npm test
```

---

## 🔮 Future Scope

- **Multi-Corridor Support** — Scale from a single section to a full national railway network graph
- **GTFS Integration** — Import real Indian Railways timetable data for production scenarios
- **Federated Learning** — Collaborative model training across control centres without sharing raw data
- **Natural Language Interface** — "What happens if the Deccan Queen is delayed by 20 minutes at Pune?"
- **Mobile Command View** — Responsive tablet layout for field supervisors
- **Digital Twin Validation** — Calibrate against real SCADA telemetry feeds

---

## 👥 Team

| Member | Role |
|---|---|
| *Yashvin Mehra*   | Full-Stack + AI/ML Engineering |
| *Akanksha Shirke* | Full-Stack + AI/ML Engineering |

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Built for <strong>FAR AWAY 2026</strong> · Railways Theme · India's Biggest International Hackathon
</div>
