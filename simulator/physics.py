"""Machine physics for the simulated fleet, kept free of MQTT so it can be replayed in tests.

Faults
    ``bearing_wear`` and ``overheating`` machines are healthy until ``fault_start_s`` (scaled by the
    profile's ``fault_delay_factor``), then the fault severity rises linearly from 0 to 1 over
    ``fault_ramp_s``. ``spikes`` machines stay healthy apart from rare isolated vibration knocks.

Maintenance cycle (``cycle_s``, off by default)
    Without a cycle a fault reaches full severity and stays there forever, which is what a single demo
    run wants. With ``cycle_s`` set, the fault clock is the elapsed time modulo the cycle: every
    ``cycle_s`` simulated seconds the machine is "repaired" and the fault develops again from scratch.
    ``cycle_s`` must be at least ``fault_start_s * fault_delay_factor + fault_ramp_s`` for every faulty
    machine (see ``min_cycle_s``), so each cycle shows the whole fault developing.

    Phase offset: each machine's cycle clock starts ``cycle_offset_fraction * cycle_s`` simulated seconds
    late (``max(elapsed - offset, 0) % cycle_s``). Before its offset has passed, a machine is simply
    healthy, so every machine still starts clean and the AI baseline learned from the first readings stays
    valid across cycles. Afterwards the machines degrade out of step: motor-01 is offset by half a cycle
    relative to compressor-02, so while one is being repaired the other is usually degrading.

Relay auto-restart (``auto_restart_s``, off by default)
    Measured in real wall-clock seconds, not simulated time: a machine switched off by a relay command
    turns itself back on ``auto_restart_s`` seconds after it stopped. ``set_relay`` and
    ``auto_restart`` take the current monotonic time as ``now`` so the timing is testable without MQTT.
"""

from __future__ import annotations

import math
import random
from collections.abc import Iterable
from dataclasses import dataclass

AMBIENT_C = 28.0
THERMAL_TIME_CONSTANT_S = 25.0
#: Faults that develop over ``fault_ramp_s`` and therefore follow the maintenance cycle.
PROGRESSIVE_FAULTS = ("bearing_wear", "overheating")


@dataclass(frozen=True)
class MachineProfile:
    device_id: str
    name: str
    type: str
    location: str
    temperature: float
    vibration: float
    current: float
    fault: str | None = None  # "bearing_wear" | "overheating" | "spikes"
    fault_delay_factor: float = 1.0
    #: Share of the maintenance cycle this machine's fault clock lags behind (only used with a cycle).
    cycle_offset_fraction: float = 0.0


FLEET = [
    MachineProfile("compressor-01", "Air Compressor #1", "compressor", "Line A", 68.0, 2.3, 15.5),
    MachineProfile("compressor-02", "Air Compressor #2", "compressor", "Line A", 66.0, 2.1, 15.0, fault="bearing_wear"),
    MachineProfile("pump-01", "Cooling Water Pump", "pump", "Utility Room", 45.0, 1.4, 7.2, fault="spikes"),
    MachineProfile(
        "motor-01", "Conveyor Motor", "motor", "Line B", 58.0, 1.8, 11.0,
        fault="overheating", fault_delay_factor=1.6, cycle_offset_fraction=0.5,
    ),
]


def min_cycle_s(profiles: Iterable[MachineProfile], fault_start_s: float, fault_ramp_s: float) -> float:
    """Shortest maintenance cycle that still lets every progressive fault in ``profiles`` fully develop."""
    return max(
        (fault_start_s * p.fault_delay_factor + fault_ramp_s for p in profiles if p.fault in PROGRESSIVE_FAULTS),
        default=0.0,
    )


class SimulatedMachine:
    def __init__(
        self,
        profile: MachineProfile,
        fault_start_s: float,
        fault_ramp_s: float,
        rng: random.Random,
        cycle_s: float | None = None,
        auto_restart_s: float | None = None,
    ) -> None:
        self.profile = profile
        self.fault_start_s = fault_start_s * profile.fault_delay_factor
        self.fault_ramp_s = fault_ramp_s
        self.rng = rng
        self.cycle_s = cycle_s
        self.cycle_offset_s = 0.0 if cycle_s is None else profile.cycle_offset_fraction * cycle_s
        self.auto_restart_s = auto_restart_s
        self.running = True
        self.stopped_at: float | None = None
        self.elapsed_s = 0.0
        self.temperature = profile.temperature

    def fault_clock_s(self) -> float:
        """Simulated seconds into the current fault cycle: plain elapsed time unless a cycle is set."""
        if self.cycle_s is None:
            return self.elapsed_s
        return max(self.elapsed_s - self.cycle_offset_s, 0.0) % self.cycle_s

    def fault_severity(self) -> float:
        """0 before the fault starts, rising to 1 over the ramp (and back to 0 at each cycle wrap)."""
        if self.profile.fault not in PROGRESSIVE_FAULTS:
            return 0.0
        return min(max((self.fault_clock_s() - self.fault_start_s) / self.fault_ramp_s, 0.0), 1.0)

    def set_relay(self, on: bool, now: float) -> None:
        """Applies a relay command received at monotonic time ``now`` (real seconds)."""
        if not on and self.running:
            self.stopped_at = now  # a repeated "off" does not extend the auto-restart countdown
        elif on:
            self.stopped_at = None
        self.running = on

    def auto_restart(self, now: float) -> bool:
        """Turns a relay-stopped machine back on once ``auto_restart_s`` real seconds have passed.

        Returns True only on the call that restarted it, so the caller knows to publish the new state.
        """
        if self.auto_restart_s is None or self.running or self.stopped_at is None:
            return False
        if now - self.stopped_at < self.auto_restart_s:
            return False
        self.running = True
        self.stopped_at = None
        return True

    def step(self, dt_s: float) -> dict[str, float | bool]:
        self.elapsed_s += dt_s
        p, gauss = self.profile, self.rng.gauss
        load = math.sin(2 * math.pi * self.elapsed_s / 120.0)  # slow duty cycle
        severity = self.fault_severity()

        if self.running:
            target_temperature = p.temperature + 1.5 * load
            current = p.current * (1 + 0.04 * load) + gauss(0, 0.25)
            vibration = p.vibration * (1 + 0.05 * load) + gauss(0, 0.12)
            if p.fault == "bearing_wear":
                vibration += 6.5 * severity**1.5
                target_temperature += 12.0 * severity
                current += 1.5 * severity
            elif p.fault == "overheating":
                target_temperature += 32.0 * severity
                current += 3.0 * severity
            elif p.fault == "spikes" and self.rng.random() < 0.01:
                vibration *= 2.5  # isolated knock: should not raise an AI alert on its own
        else:
            target_temperature = AMBIENT_C
            current = abs(gauss(0.05, 0.02))
            vibration = abs(gauss(0.05, 0.02))

        # First-order thermal lag: machines heat up and cool down gradually.
        self.temperature += (target_temperature - self.temperature) * min(1.0, dt_s / THERMAL_TIME_CONSTANT_S)
        return {
            "temperature": round(self.temperature + gauss(0, 0.3), 2),
            "vibration": round(max(vibration, 0.0), 3),
            "current": round(max(current, 0.0), 2),
            "humidity": round(48 + 4 * math.sin(self.elapsed_s / 900) + gauss(0, 0.5), 1),
            "running": self.running,
        }
