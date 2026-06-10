# TrackMind UI Redesign Skill

## Goal
Transform the current TrackMind dashboard into a premium operational command center. The redesign must preserve the existing architecture and routes without rebuilding functionality.

## Design Language

### Theme & Mood
- **Theme**: Railway Operations + Intelligence
- **Mood**: Calm, precise, technical, elite
- **Style**: Dark-only, professional, infrastructure-grade, modern, minimal, high information density.
- **Visual References**: Linear, Vercel, Palantir, Stripe Dashboard, Bloomberg Terminal, Rail control systems, Mission control interfaces.
- **Avoid**: Generic SaaS templates, glassmorphism, huge rounded cards, overused gradients, cyberpunk gimmicks, dashboard boilerplate.

### Color System (Dark Only, No Pure Black)
- **Background**: `#050816`, `#071120`, `#0B1328`
- **Surface**: `#10192E`, `#131E37`
- **Accent**: `#4E7CFF`
- **Success**: `#20D97C`
- **Warning**: `#FFB547`
- **Danger**: `#FF5757`
- **Secondary**: `#8FA7D9`

### Typography
- **Headings**: `Space Grotesk`
- **Body**: `Inter`
- **Data**: `IBM Plex Mono`

#### Hierarchy
- **H1**: 44px
- **H2**: 28px
- **H3**: 18px
- **Body**: 14px
- **Labels**: 12px
*Rules: Use strong contrast and increase spacing.*

### Microinteractions & Motion Specs
- **Hover**: `120ms`
- **Panel**: `180ms`
- **Transitions**: `250ms`
*Rules: No bounce, no flashy effects. Use soft borders, subtle elevation, context menus, sticky panels, density controls, command palette, and keyboard shortcuts.*

## Layout Architecture

1. **Top (Persistent Command Bar)**
   - Logo, live indicator, simulation state, search, controller profile.
2. **Middle (Adaptive Grid)**
   - **Left**: Network visualization
   - **Center**: Recommendations
   - **Right**: Scenario controls
3. **Bottom (Insights)**
   *Rule: No full-width empty areas.*

## Features & Screens

### Network Map
- **Redesign**: Animated rails, train markers, moving trains, track occupancy glow, signals, block states, direction arrows, zoom, pan, timeline scrub, hover analytics, station cards, station utilization, conflict heat.
- **Rules**: Add subtle motion, do NOT make it game-like.

### Timeline
- **Replaces**: Empty graph.
- **Build**: Time-space diagram, actual trajectories, crossing points, conflict markers, predicted paths, ghost schedules, delay propagation, before vs after.

### Recommendations
- **Replaces**: Generic cards.
- **Build**: Stacked decision panel.
- **Each Recommendation**: Action, impact, confidence, ETA, delay saved, why, risk, constraints satisfied.
- **Buttons**: Simulate, apply, compare, expand details.

### What If (Scenario Lab)
- **Replaces**: Form inputs.
- **Build**: Scenario Lab.
- **Preset Cards**: Loco Failure, Platform Block, Weather Delay, Extra Train, Signal Failure.
- **Interactive**: Sliders resulting in animated comparison.

### Predictions (Forecast Panel)
- **Show**: Delay Forecast, Throughput Forecast, Risk Score, Confidence Bands, Trend curves.

### Skills View (New Route: `/skills`)
- **Purpose**: Show engineering capability.
- **Sections**: System Architecture, Simulation Engine, Optimization, ML Models, Infrastructure, Testing, Performance.
- **Visualize As**: Interactive capability matrix (not badges, not progress bars).
- **Each Skill Expands**: What was built, where it's used, technical depth, files involved.

## Folder Structure
```text
frontend/
├── src/
│   ├── assets/
│   │   └── fonts/ (Space Grotesk, Inter, IBM Plex Mono)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── CommandBar.tsx
│   │   │   └── AdaptiveGrid.tsx
│   │   ├── network/
│   │   │   ├── NetworkMap.tsx
│   │   │   └── TimelineScrub.tsx
│   │   ├── timeline/
│   │   │   └── TimeSpaceDiagram.tsx
│   │   ├── recommendations/
│   │   │   └── DecisionPanel.tsx
│   │   ├── scenarios/
│   │   │   └── ScenarioLab.tsx
│   │   ├── predictions/
│   │   │   └── ForecastPanel.tsx
│   │   └── ui/ (Tokens, Base Components)
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   └── Skills.tsx
│   ├── styles/
│   │   └── theme.css (Design System Tokens)
```

## Implementation Code (Design System Tokens)
Update `tailwind.config.js` or CSS variables:

```css
/* src/styles/theme.css */
:root {
  --bg-base: #050816;
  --bg-surface: #071120;
  --bg-elevated: #0B1328;
  
  --surface-1: #10192E;
  --surface-2: #131E37;
  
  --accent: #4E7CFF;
  --success: #20D97C;
  --warning: #FFB547;
  --danger: #FF5757;
  --secondary: #8FA7D9;

  --font-heading: 'Space Grotesk', sans-serif;
  --font-body: 'Inter', sans-serif;
  --font-mono: 'IBM Plex Mono', monospace;

  --transition-hover: 120ms ease;
  --transition-panel: 180ms ease;
  --transition-page: 250ms ease;
}
```

## Final Goal Reminder
Make judges think: “This looks like software used in a real control room.”
Not: “This is another React dashboard.”
