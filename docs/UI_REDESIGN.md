# UI Redesign — Tactical Telemetry, Phase 1

## Design Read

Overhaul of an industrial/tactical telemetry dashboard for a fleet of monitored machines. Audience is
plant technicians and maintenance leads scanning under time pressure. Leaning into the archetype already
established in `index.css` (Tactical Telemetry & CRT Terminal): `#0a0a0a` substrate, JetBrains Mono,
Archivo Black, single red accent `#ff2a2a`, amber warning, green reserved for the live indicator, scanline
+ noise overlay — pushed further into HUD territory with layered framing devices and motion that is driven
by the realtime data itself, not decoration.

Dials: `DESIGN_VARIANCE: 6`, `MOTION_INTENSITY: 7`, `VISUAL_DENSITY: 6`.

- Variance is spent on the **macro** zones (headers, hero KPI, column ratios) — never on dense data zones
  (rule tables, alert lists), which stay grid-locked for fast scanning.
- Motion is only ever a response to a state change (a new alert, a value tick, a critical status) —
  no decorative infinite loops. Everything is hard-edge (opacity / border-width / transform), never a soft
  glow or gradient, and collapses under `prefers-reduced-motion`.
- Density stays where it already was; this pass does not add padding.

## Audit of the pre-redesign state

- **Keep:** CRT substrate, font stack, one-accent-color rule, hairline-grid technique (`gap-px` on
  `--color-line`), `label`/`font-display` micro/macro typography, `[ Telemetry ]`-style bracket headers.
- **Retire:** fully symmetric `max-w-7xl` centered grids on every page, four equal KPI boxes, flat panel
  borders with no framing device, static AI summary text with no visual weight, zero motion anywhere.

## Shared primitives added

- `Bracket` / `FramedPanel` (`components/ui.tsx`) — corner-bracket framing in place of flat borders on
  primary "hero" panels. Hard-edge, no border-radius, no shadow.
- `CountUp` — realtime KPI numerals animate from their previous value instead of snapping.
- `Marquee` — single scrolling ticker row, capped to one per page, shown only while a critical condition
  exists.
- CSS keyframes: `hard-pulse` (critical state, two beats then holds), `scan-sweep` (hover sweep on
  interactive cards), `draw-in` (SVG stroke reveal), `rise-in` (staggered mount). All gated behind
  `prefers-reduced-motion`.

## Wireframes

### Login
60/40 split (was 50/50). Corner-bracket frame around the headline block. The three highlight lines render
as a boot-sequence list with dotted leaders; the live-telemetry dot pulses once on load.

```
┌─────────────────────────────────────────┬──────────────────────┐
│ [■] MACHINEWATCH              UNIT-CTRL/01│                      │
│ ┌ headline, corner-bracket framed ┐       │      SIGN IN         │
│ │ CATCH MACHINE FAILURES          │       │  Email  [_________]  │
│ │ HOURS BEFORE THEY STOP YOUR LINE│       │  Pass   [_________]  │
│ └──────────────────────────────────┘      │  [ SIGN IN >>> ]     │
│  ●LIVE TELEMETRY    ................     │  demo@machinewatch.io│
│   AI ANOMALY DETECT ................     │  / demo1234           │
│   REMOTE CONTROL    ................     │                      │
└─────────────────────────────────────────┴──────────────────────┘
```

### Overview
Average health becomes an oversized bleeding numeral (was one of four equal KPI boxes); the other three
KPIs sit smaller beside it. A critical marquee appears above the fold only when a critical alert is open.
Device cards get corner-bracket framing, a hover scanline sweep, and a hard-edge pulse border while
critical. The Factory Floor 3D block (Phase 2) sits directly under the header, above the KPI row.

```
// FLEET STATUS OVERVIEW                              14:32:07 SYS TIME
OVERVIEW
▓▓ CRITICAL · PRESS-04 vibration 8.2mm/s ▓▓   (marquee, critical-only)
[ FACTORY FLOOR 3D ]
┌─────────────────┬────────┬────────┬────────┐
│   87 (huge)      │ ONLINE │ ALERTS │ AI RDY │
├─────────────────┴────────┴────────┴────────┤
│ DEVICE GRID (2 col, corner-bracket cards)    │ OPEN ALERTS (rail)
```

### Device detail
Health-ring rail becomes a sticky left column spanning the chart section (layered depth via `position:
sticky`). Vibration chart is the "hero" chart (taller — it drives the hours-to-limit forecast); the other
three charts are smaller beside it.

### Alerts
A vertical severity-count rail (open / critical / warning) sits left of the log — the one asymmetric
element; the log itself stays a single grid-locked column. Unacknowledged critical rows get a hard-edge
pulsing left border on arrival.

### Rules
Header gains a compact right-aligned readout (`RULES ACTIVE: n  ALL: n`) instead of a plain title; the
rule table itself is unchanged (dense data, must stay predictable). The whole table panel gets a
corner-bracket frame.

## Status

Applied to Overview, Device, Alerts, Rules, Login in this phase. Factory Floor 3D (Phase 2) and the
JS-motion-library layer — page transitions, stagger, 3D card tilt, alert layout animation — (Phase 3) are
separate phases layered on top of this structural pass.
