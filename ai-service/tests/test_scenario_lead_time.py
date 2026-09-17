"""Measures how much earlier the AI warns than the fixed threshold rules, on the simulator's own physics.

The README claims the AI flags a developing fault before the default rules fire. This test backs that with numbers:

* Machines come from ``simulator/physics.py`` and are stepped exactly like ``simulator.py`` does: the whole fleet,
  one shared RNG per seed, one reading per simulated second (``--interval 1 --speed 1``, as in docker-compose) and the
  default ``--fault-start 420 --fault-ramp 900``.
* Each machine's readings go to its own ``DeviceModel`` the way ``backend/src/ingest.ts`` drives the AI service:
  batches of 5 (``AI_BATCH_SIZE``), a 300-reading baseline (``BASELINE_SIZE``), server-side millisecond timestamps.
  A batch's health status counts from the time of its last reading.
* Rule triggers mirror the backend's default rules (``backend/src/db.ts``): vibration > 4.5 mm/s, temperature > 85 °C.

It is an in-memory replay, not an end-to-end run: no MQTT broker, backend or HTTP is involved, and the AI service is
assumed to answer each batch before the next reading arrives. To keep it fast, a machine stops being scored once
everything measured from its scores has been seen; the rule trigger time depends only on the physics after that.

    pytest tests/test_scenario_lead_time.py -s    # prints the measured lead times
"""

from __future__ import annotations

import itertools
import random
import sys
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest

from app.detector import DeviceModel, Reading, ScoreResult

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "simulator"))
import physics  # noqa: E402  (lives in simulator/, which is not a package)

SEEDS = (1, 2, 3)
FAULT_START_S = 420.0  # simulator.py --fault-start default
FAULT_RAMP_S = 900.0  # simulator.py --fault-ramp default
DT_S = 1  # simulated seconds between readings
BATCH_SIZE = 5  # backend AI_BATCH_SIZE default
BASELINE_SIZE = 300  # ai-service BASELINE_SIZE default
START_MS = 1_760_000_000_000
#: Longest replay before giving up, in simulated seconds; the events measured here happen within about 25 minutes.
MAX_REPLAY_S = 3600
DEMO_CYCLE_S = 1800.0  # the --cycle value documented in simulator.py
DEGRADED = ("warning", "critical")

Telemetry = dict[str, float | bool]
RULES: dict[str, tuple[str, Callable[[Telemetry], bool]]] = {
    "compressor-02": ("vibration > 4.5 mm/s", lambda reading: reading["vibration"] > 4.5),
    "motor-01": ("temperature > 85 C", lambda reading: reading["temperature"] > 85),
}


def fleet_readings(seed: int, cycle_s: float | None = None) -> Iterator[tuple[int, str, Telemetry]]:
    """Yields ``(simulated second, device id, telemetry)`` for the whole fleet, in the order simulator.py publishes."""
    rng = random.Random(seed)
    machines = [physics.SimulatedMachine(p, FAULT_START_S, FAULT_RAMP_S, rng, cycle_s=cycle_s) for p in physics.FLEET]
    for second in itertools.count(DT_S, DT_S):
        for machine in machines:
            yield second, machine.profile.device_id, machine.step(DT_S)


class BackendScoring:
    """Queues one device's readings and scores full batches, like the backend's per-device queue."""

    def __init__(self, device_id: str) -> None:
        self.model = DeviceModel(device_id, baseline_size=BASELINE_SIZE)
        self._batch: list[Reading] = []

    def add(self, second: int, telemetry: Telemetry) -> ScoreResult | None:
        assert telemetry["running"], "replay only covers running machines; the backend never scores stopped ones"
        self._batch.append(
            Reading(
                ts=START_MS + second * 1000,
                temperature=float(telemetry["temperature"]),
                vibration=float(telemetry["vibration"]),
                current=float(telemetry["current"]),
            )
        )
        if len(self._batch) < BATCH_SIZE:
            return None
        batch, self._batch = self._batch, []
        return self.model.process(batch)


@dataclass
class Timeline:
    """Simulated seconds at which things first happened on one machine."""

    ai_warning_s: int | None = None
    forecast_s: int | None = None
    rule_s: int | None = None

    @property
    def lead_s(self) -> int:
        assert self.ai_warning_s is not None and self.rule_s is not None
        return self.rule_s - self.ai_warning_s


def measure(seed: int) -> dict[str, Timeline]:
    timelines = {device_id: Timeline() for device_id in RULES}
    scoring = {device_id: BackendScoring(device_id) for device_id in RULES}

    for second, device_id, telemetry in fleet_readings(seed):
        if all(t.ai_warning_s is not None and t.rule_s is not None for t in timelines.values()):
            break
        if second > MAX_REPLAY_S:
            pytest.fail(f"seed {seed}: events not all seen within {MAX_REPLAY_S} simulated s: {timelines}")
        if device_id not in RULES:
            continue
        timeline = timelines[device_id]
        if timeline.rule_s is None and RULES[device_id][1](telemetry):
            timeline.rule_s = second

        # The forecast is only reported, so stop waiting for it once the rule has fired.
        want_forecast = device_id == "compressor-02" and timeline.forecast_s is None and timeline.rule_s is None
        if timeline.ai_warning_s is not None and not want_forecast:
            continue
        result = scoring[device_id].add(second, telemetry)
        if result is None:
            continue
        if timeline.ai_warning_s is None and result.health_status in DEGRADED:
            timeline.ai_warning_s = second
        if timeline.forecast_s is None and result.hours_to_limit is not None:
            timeline.forecast_s = second
    return timelines


@pytest.fixture(scope="module")
def timelines() -> dict[int, dict[str, Timeline]]:
    measured = {seed: measure(seed) for seed in SEEDS}
    for device_id, (rule, _) in RULES.items():
        for seed, per_device in measured.items():
            t = per_device[device_id]
            print(
                f"{device_id} seed {seed}: AI warning at {t.ai_warning_s} s, "
                f"forecast {'at %s s' % t.forecast_s if t.forecast_s is not None else 'not shown'}, "
                f"{rule} at {t.rule_s} s -> lead {t.lead_s} s"
            )
    return measured


def lead_times(timelines: dict[int, dict[str, Timeline]], device_id: str) -> dict[int, int]:
    return {seed: per_device[device_id].lead_s for seed, per_device in timelines.items()}


def test_ai_warns_about_bearing_wear_well_before_the_vibration_rule(timelines):
    leads = lead_times(timelines, "compressor-02")
    assert min(leads.values()) >= 150, f"compressor-02 lead over vibration > 4.5 by seed: {leads}"


def test_ai_warns_about_overheating_well_before_the_temperature_rule(timelines):
    leads = lead_times(timelines, "motor-01")
    assert min(leads.values()) >= 400, f"motor-01 lead over temperature > 85 by seed: {leads}"


def test_health_recovers_after_the_maintenance_cycle_wraps():
    seed = SEEDS[0]  # one seed keeps the file well under a minute; each replay here costs 10-13 s
    device_id = "compressor-02"
    profile = next(p for p in physics.FLEET if p.device_id == device_id)
    wrap_s = profile.cycle_offset_fraction * DEMO_CYCLE_S + DEMO_CYCLE_S
    scoring = BackendScoring(device_id)
    status_before_wrap = None
    recovered_s = None

    for second, reading_device, telemetry in fleet_readings(seed, cycle_s=DEMO_CYCLE_S):
        if reading_device != device_id:
            continue
        if second > wrap_s + DEMO_CYCLE_S:
            break
        result = scoring.add(second, telemetry)
        if result is None or result.status != "ready":
            continue
        if second < wrap_s:
            status_before_wrap = result.health_status
        elif result.health_status == "healthy":
            recovered_s = second
            break

    print(f"{device_id} seed {seed}, --cycle {DEMO_CYCLE_S:g}: {status_before_wrap} before the wrap at {wrap_s:g} s, "
          f"healthy again at {recovered_s} s")
    assert status_before_wrap in DEGRADED, "the fault should have degraded health before maintenance"
    assert recovered_s is not None, f"health did not return to healthy within one cycle ({DEMO_CYCLE_S:g} s) of the wrap"
