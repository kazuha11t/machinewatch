"""Simulates a small fleet of industrial machines publishing telemetry over MQTT.

Each machine behaves like the ESP32 firmware in ``firmware/``: it announces itself on
``meta``, keeps a retained ``status`` with an MQTT last will, publishes ``telemetry``
periodically, and obeys relay commands on ``cmd``. Some machines develop faults over
time so the AI service has something to find.

    python simulator.py                          # 1 reading per second, like real hardware
    python simulator.py --interval 0.2 --speed 5 # 5x faster demo: same physics, less waiting
"""

from __future__ import annotations

import argparse
import json
import logging
import math
import random
import signal
import threading
import time
from dataclasses import dataclass

import paho.mqtt.client as mqtt

log = logging.getLogger("simulator")

AMBIENT_C = 28.0
THERMAL_TIME_CONSTANT_S = 25.0


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


FLEET = [
    MachineProfile("compressor-01", "Air Compressor #1", "compressor", "Line A", 68.0, 2.3, 15.5),
    MachineProfile("compressor-02", "Air Compressor #2", "compressor", "Line A", 66.0, 2.1, 15.0, fault="bearing_wear"),
    MachineProfile("pump-01", "Cooling Water Pump", "pump", "Utility Room", 45.0, 1.4, 7.2, fault="spikes"),
    MachineProfile("motor-01", "Conveyor Motor", "motor", "Line B", 58.0, 1.8, 11.0, fault="overheating", fault_delay_factor=1.6),
]


class SimulatedMachine:
    def __init__(self, profile: MachineProfile, fault_start_s: float, fault_ramp_s: float, rng: random.Random) -> None:
        self.profile = profile
        self.fault_start_s = fault_start_s * profile.fault_delay_factor
        self.fault_ramp_s = fault_ramp_s
        self.rng = rng
        self.running = True
        self.elapsed_s = 0.0
        self.temperature = profile.temperature

    def fault_severity(self) -> float:
        """0 before the fault starts, rising to 1 over the ramp."""
        if self.profile.fault not in ("bearing_wear", "overheating"):
            return 0.0
        return min(max((self.elapsed_s - self.fault_start_s) / self.fault_ramp_s, 0.0), 1.0)

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


class DeviceConnection:
    """One MQTT session per machine, like physical devices on a factory network."""

    def __init__(self, machine: SimulatedMachine, host: str, port: int, prefix: str, username: str | None, password: str | None) -> None:
        self.machine = machine
        device_id = machine.profile.device_id
        self.topic = lambda channel: f"{prefix}/{device_id}/{channel}"
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"sim-{device_id}-{random.randrange(16**6):06x}")
        if username:
            self.client.username_pw_set(username, password)
        self.client.will_set(self.topic("status"), "offline", qos=1, retain=True)
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message
        self.client.reconnect_delay_set(min_delay=1, max_delay=10)
        self.client.connect_async(host, port, keepalive=15)
        self.client.loop_start()

    def _on_connect(self, client: mqtt.Client, _userdata, _flags, reason_code, _properties) -> None:
        if reason_code.is_failure:
            log.error("%s: connection refused (%s)", self.machine.profile.device_id, reason_code)
            return
        p = self.machine.profile
        client.subscribe(self.topic("cmd"), qos=1)
        client.publish(self.topic("meta"), json.dumps({"name": p.name, "type": p.type, "location": p.location}), qos=1, retain=True)
        client.publish(self.topic("status"), "online", qos=1, retain=True)
        self._publish_state()
        log.info("%s connected", p.device_id)

    def _on_message(self, _client: mqtt.Client, _userdata, message: mqtt.MQTTMessage) -> None:
        try:
            command = json.loads(message.payload)
        except ValueError:
            log.warning("%s: ignored invalid command %r", self.machine.profile.device_id, message.payload)
            return
        if isinstance(command, dict) and isinstance(command.get("relay"), bool):
            self.machine.running = command["relay"]
            log.info("%s: relay %s", self.machine.profile.device_id, "ON" if self.machine.running else "OFF")
            self._publish_state()

    def _publish_state(self) -> None:
        self.client.publish(self.topic("state"), json.dumps({"relay": self.machine.running}), qos=1, retain=True)

    def publish_telemetry(self, dt_s: float) -> None:
        reading = self.machine.step(dt_s)
        if self.client.is_connected():
            self.client.publish(self.topic("telemetry"), json.dumps(reading), qos=0)

    def close(self) -> None:
        self.client.publish(self.topic("status"), "offline", qos=1, retain=True).wait_for_publish(timeout=2)
        self.client.disconnect()
        self.client.loop_stop()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--username")
    parser.add_argument("--password")
    parser.add_argument("--prefix", default="machinewatch", help="MQTT topic prefix")
    parser.add_argument("--interval", type=float, default=1.0, help="real seconds between readings")
    parser.add_argument("--speed", type=float, default=1.0, help="simulated seconds per real second")
    parser.add_argument("--fault-start", type=float, default=420.0, help="simulated seconds before faults begin")
    parser.add_argument("--fault-ramp", type=float, default=900.0, help="simulated seconds for a fault to fully develop")
    parser.add_argument("--devices", help="comma-separated subset of device ids to simulate")
    parser.add_argument("--seed", type=int)
    return parser.parse_args()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = parse_args()
    rng = random.Random(args.seed)

    wanted = set(args.devices.split(",")) if args.devices else None
    profiles = [p for p in FLEET if wanted is None or p.device_id in wanted]
    if not profiles:
        raise SystemExit(f"No matching devices. Available: {', '.join(p.device_id for p in FLEET)}")

    connections = [
        DeviceConnection(SimulatedMachine(p, args.fault_start, args.fault_ramp, rng), args.host, args.port, args.prefix, args.username, args.password)
        for p in profiles
    ]
    log.info(
        "simulating %d machines against mqtt://%s:%d (interval %.2fs, speed x%.1f, faults start after %.0f simulated s)",
        len(connections), args.host, args.port, args.interval, args.speed, args.fault_start,
    )

    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())

    dt_s = args.interval * args.speed
    next_tick = time.monotonic()
    while not stop.is_set():
        for connection in connections:
            connection.publish_telemetry(dt_s)
        next_tick += args.interval
        stop.wait(max(0.0, next_tick - time.monotonic()))

    log.info("stopping, publishing offline status")
    for connection in connections:
        connection.close()


if __name__ == "__main__":
    main()
