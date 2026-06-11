# TrackMind - AI-Powered Network Control Centre

TrackMind is a next-generation railway operations control center designed to revolutionize how section controllers manage train movements. Built for international hackathon standards, it demonstrates how AI, real-time data, and high-density UI/UX can solve critical bottlenecks in legacy railway traffic management systems.

## ⚠️ The Problem: Legacy Operations & Cognitive Overload

In major railway networks (like Indian Railways), section controllers manage the movement of dozens of trains across massive corridors simultaneously. The current reality of this job involves:

1. **Reactive Decision Making:** Controllers often only act *after* a conflict has occurred or a delay has compounded, leading to cascading delays across the network.
2. **Cognitive Overload:** Legacy SCADA systems and Control Office Applications (COA) are cluttered, outdated, and require manual cross-referencing between separate screens, train registers, and paper charts.
3. **Manual Conflict Resolution:** When a faster train needs to overtake a slower one, or two trains contend for the same platform, the controller must manually calculate speeds, distances, and clearances. Human error here leads to safety risks and massive throughput loss.
4. **Lack of Explainability:** Even when automated scheduling tools exist, they function as "black boxes." Controllers don't trust systems that tell them what to do without explaining *why*.

## 💡 The Solution: TrackMind

TrackMind solves these problems by providing an **AI-assisted, proactive, and highly legible** command interface that acts as a co-pilot for the section controller.

### How We Solve It

- **Proactive Conflict Detection (T-Minus Warnings):** Instead of waiting for a delay to happen, TrackMind simulates future states and warns controllers of impending conflicts (e.g., "T-Minus 5 mins to overtaking conflict").
- **AI-Driven Action Queue:** Conflicts are ranked by severity (Critical, Major, Minor). The AI proposes exact, executable solutions (e.g., "Loop passenger train at KLD to allow Express to pass") complete with confidence scores and estimated delay savings.
- **Explainable AI (SHAP):** Controllers are shown exactly *why* a recommendation was made and the cascade risk if ignored, building trust between human operators and the AI.
- **"What-If" Scenario Lab:** Controllers can test disruptions (e.g., "What if a signal fails at Pune?") and see the ripple effect across the network before making a decision.
- **Operational Clarity:** The UI is stripped of generic dashboard "fluff" (no oversized cards, no meaningless charts). It uses a 70/30 layout prioritizing the real-time Network Occupancy Map, using established safety colors and dense, monospaced data tables for maximum scannability.

## ✨ Key Features for Hackathon Judges

*   **Real-Time Network Map (70% viewport):** A dense canvas showing live block occupancy, 3-light signal states, and train positions. Switchable between Light and Dark modes.
*   **Integrated Action Queue (30% viewport):** The controller's primary workflow. Lists active conflicts, integrates AI recommendations with 1-click "Accept" or manual overrides, and tracks history.
*   **Slide-over Analytical Drawers:**
    *   **Time-Space Diagram:** Visualizes train trajectories to spot crossing points and headway violations.
    *   **Delay Forecast:** ML-predicted delays with risk scores.
    *   **Audit Log:** Immutable ledger of controller decisions for post-incident review.
*   **KPI Dashboard Strip:** Inline header tracking active trains, current conflicts, average network delay, and throughput percentage.

## 🏗 Architecture & Tech Stack

TrackMind uses a modern, performant architecture designed for real-time telemetry.

### Frontend (UI/UX)
- **Framework:** React 18 + Vite for rapid, unbundled development.
- **Language:** TypeScript for strict type safety in complex data structures.
- **State Management:** Zustand for lightweight global state; React Query for caching server data.
- **Real-Time Data:** WebSockets consuming a 2Hz telemetry stream to animate train movements seamlessly.
- **Styling:** Custom CSS design system adhering strictly to professional UI/UX rules (WCAG 4.5:1 contrast, 44px touch targets, semantic tokens).

### Backend & Infrastructure
- The backend handles simulation states, pathfinding algorithms for conflict resolution, and WebSocket broadcasting.
- **Deployment:** Containerized with Docker and orchestrated via `docker-compose.yml`.
- **Monitoring:** Prometheus integration for backend metrics.

## 🚀 Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js (v18+)

### Run the Full Stack
Spin up the backend simulation, AI engine, frontend, and monitoring with one command:
```bash
docker-compose up -d
```

### Run Frontend Locally (Dev Mode)
To run just the frontend against an existing backend:
```bash
cd frontend
npm install
npm run dev
```
Access the application at `http://localhost:5173`.

## 🎨 Design Philosophy
*   **Function Over Form:** Built for operators. No glassmorphism, no distracting animations. Focuses on spatial continuity and color semantics (Red = Danger, Amber = Warning, Green/Blue = Safe).
*   **High Information Density:** Uses monospaced fonts (`JetBrains Mono`) for numbers to prevent layout shift. Compact spacing allows massive amounts of data without scrolling.
*   **Dark Mode Native:** Essential for dimly lit, 24/7 control rooms to reduce eye strain.

## 📄 License
MIT License
