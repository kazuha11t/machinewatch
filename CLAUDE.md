# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MachineWatch is an IoT monitoring system: ESP32 nodes publish sensor telemetry over MQTT, a Node.js backend
ingests it, runs threshold + AI anomaly detection, and pushes live updates over WebSocket to a React web
dashboard and an Expo/React Native mobile app. See `README.md` for the architecture diagram, full API
surface, and product-level explanation of the AI (baseline learning, health score, vibration forecast).
This file covers what the README doesn't: per-package dev commands and cross-file architecture.

It's a five-package monorepo, each with its own toolchain — there is no root `package.json`. Always `cd` into
the relevant package before running its scripts.

## Commands

**backend** (Node 24, TypeScript, runs `.ts` files directly via `node --watch`/`node`, no build step)
```bash
cd backend
npm run dev                                  # EMBEDDED_BROKER=true npm run dev  to skip installing Mosquitto
npm test                                     # node --test "test/**/*.test.ts"
node --test test/ingest.test.ts              # single file
node --test test/ingest.test.ts --test-name-pattern "offline"   # single test by name
npm run typecheck                            # tsc --noEmit — CI treats type errors as failures, there is no separate lint step
```

**ai-service** (Python 3.11, FastAPI)
```bash
cd ai-service
pip install -r requirements-dev.txt
python -m uvicorn app.main:app --port 8000 --reload   # bare `uvicorn` can 404/"not recognized" if venv Scripts isn't on PATH
pytest                                       # all tests
pytest tests/test_detector.py::test_health_score_penalizes_drift   # single test
```

**web** (React 19 + Vite + Tailwind 4)
```bash
cd web
npm run dev
npm run build                                # tsc --noEmit && vite build — this is also the web CI check, there is no separate test suite
npm run typecheck
```

**mobile** (Expo SDK 57 / React Native)
```bash
cd mobile
npx expo start                               # backend must be reachable at the Metro host on port 4000 in dev
npm run typecheck
```

**firmware** (PlatformIO / ESP32, C++)
```bash
cd firmware
pio run                                      # build only, what CI runs
pio run -t upload && pio device monitor      # flash a real device; needs include/secrets.h, see firmware/README.md
```

**simulator** — physics-based fleet simulator used for local demos/testing without hardware:
```bash
cd simulator && python simulator.py --interval 0.2 --speed 5   # faster fault development for manual testing
```

GitHub Actions (`.github/workflows/ci.yml`) runs the backend, web, ai-service and firmware jobs above
independently, each scoped to its own directory.

## Architecture

### Backend request/data flow (`backend/src/`)

`server.ts` is the composition root: it wires `Store` (SQLite), `MqttGateway`, `AiClient`, `IngestService`,
`BroadcastHub`, and the Express app together, then starts the HTTP server and (if `EMBEDDED_BROKER=true`) an
in-process Aedes MQTT broker for dev (`broker.ts`) — production always uses external Mosquitto.

The ingestion pipeline, in order:
1. `mqtt.ts` (`MqttGateway`) subscribes to `{prefix}/+/{telemetry,status,state,meta}` and routes each message
   by topic to a handler. It also owns `publishCommand` for the reverse direction (`{prefix}/{id}/cmd`).
   The topic layout and payload shapes are documented in the file header there.
2. `ingest.ts` (`IngestService`) is where most business logic lives: it parses/validates raw payloads
   (`telemetry.ts`), persists readings, evaluates threshold rules (`alerts.ts`), and batches readings per
   device before sending them to the AI service. Batching exists because the AI service scores a batch, not
   a single reading — `#pending`/`#scoring` maps in `IngestService` implement a simple per-device queue with
   a bound (`MAX_PENDING_BATCHES`) so a slow/down AI service can't grow memory unboundedly. A device that's
   deliberately stopped (`reading.running === false`) skips both rule checks and AI scoring.
3. Anomaly alerts require *both* a degraded smoothed health status and most of the current batch being
   anomalous (see the comment in `IngestService#applyScores`) — a single noisy reading never pages anyone.
   Threshold alerts and anomaly alerts each have independent cooldown logic (`db.ts` `lastAlertAt`).
4. `broadcast.ts` fans events out to any registered `Broadcaster` (currently just `realtime.ts`'s
   `SocketBroadcaster`); `notifier.ts` separately turns alerts into Expo push notifications.

`ai-client.ts` is the HTTP client for the Python service (`/score`, `/models/:id` DELETE for retrain,
`/health` for the ping used by `GET /api/health`). If the AI call fails or times out, `IngestService` just
skips that batch's scores rather than failing ingestion.

Routes (`routes/*.ts`) are thin — they call into `Store` (`db.ts`) or `CommandPublisher`/`Scorer` and
translate to HTTP. `Store` also owns SQLite schema/migrations and is the only place raw SQL lives.

Config (`config.ts`) reads everything from `process.env` with defaults suitable for local dev (e.g.
`JWT_SECRET` defaults to a fixed dev value but the module throws at import time if `NODE_ENV=production`
and that default wasn't overridden).

### AI service (`ai-service/app/`)

`main.py` is just the FastAPI HTTP layer; all the modeling logic is in `detector.py`:
- `DeviceModel` — one Isolation Forest per device (a pump at 45°C and a compressor at 70°C are both
  "normal", so baselines aren't shared). It learns from the first `baseline_size` readings, only on
  whichever of `temperature`/`vibration`/`current` that device actually reports (columns with <90% coverage
  in the baseline are dropped, not imputed-and-trusted).
- Health score blends the Isolation Forest anomaly rate with a separate "drift" measure (distance from
  baseline mean in baseline std-devs) because the anomaly rate alone saturates as soon as readings leave the
  baseline — drift lets "slightly unusual" and "badly failing" read differently. See the docstring on
  `health_score()` for the exact weighting.
- `estimate_hours_to_limit()` only returns a forecast when a linear fit to recent vibration has R² ≥ 0.5, so
  the "limit in ~3.5h" style forecast never appears on noise.
- `ModelRegistry` persists each trained model to `{MODEL_DIR}/{device_id}.joblib` and reloads lazily on
  first request; `STATE_VERSION` gates old on-disk model files so a schema change just triggers a retrain
  instead of an error.

### Cross-service coupling to know about

- The device ID pattern (`^[A-Za-z0-9_-]{1,64}$`) and the three telemetry fields (`temperature`, `vibration`,
  `current`) are each defined independently in `backend/src/mqtt.ts`, `ai-service/app/main.py`, and the
  frontends' type files — there's no shared schema package, so a change to either needs to be made in every
  location by hand.
- The backend and web/mobile clients agree on WebSocket event names (`telemetry`, `scores`, `device`,
  `device:removed`, `alert`, `alert:updated`, `alerts:changed`) only by convention — check `realtime.ts` /
  `broadcast.ts` against `web/src/lib/live.tsx` and `mobile/src/live.tsx` when changing any event's payload
  shape.
- `backend/test/helpers.ts` has in-memory fakes (`RecordingBroadcaster`, `FakeScorer`, `FakeCommands`,
  `RecordingNotifier`) used across the backend test suite instead of mocking libraries; `Store` itself is
  exercised against a real `:memory:` SQLite DB, not faked.
