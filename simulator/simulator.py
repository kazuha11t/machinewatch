"""Simulates a small fleet of industrial machines publishing telemetry over MQTT.

Each machine behaves like the ESP32 firmware in ``firmware/``: it announces itself on
``meta``, keeps a retained ``status`` with an MQTT last will, publishes ``telemetry``
periodically, and obeys relay commands on ``cmd``. Some machines develop faults over
time so the AI service has something to find. The machine physics lives in ``physics.py``.

    python simulator.py                          # 1 reading per second, like real hardware
    python simulator.py --interval 0.2 --speed 5 # 5x faster demo: same physics, less waiting

Unattended 24/7 demo (both options are off by default, so a plain run behaves as above):

    python simulator.py --cycle 1800 --auto-restart-s 90

  --cycle 1800         Every 1800 simulated seconds each faulty machine is "repaired" and its fault
                       develops again. AI models are not retrained: the healthy baseline stays valid,
                       so health recovers on its own. motor-01 runs half a cycle behind compressor-02,
                       so one of them is usually degrading. The cycle must fit the slowest fault
                       (default timing: motor-01 needs 420 x 1.6 + 900 = 1572 simulated seconds).
  --auto-restart-s 90  A machine stopped by a relay command turns itself back on after 90 real
                       seconds and publishes its retained ``state``.

    python simulator.py --interval 0.2 --speed 5 --cycle 1800 --auto-restart-s 10
                                                 # same, 5x faster: a cycle takes 6 real minutes
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import signal
import threading
import time

import paho.mqtt.client as mqtt

from physics import FLEET, PROGRESSIVE_FAULTS, MachineProfile, SimulatedMachine, min_cycle_s

log = logging.getLogger("simulator")


class DeviceConnection:
    """One MQTT session per machine, like physical devices on a factory network."""

    def __init__(self, machine: SimulatedMachine, host: str, port: int, prefix: str, username: str | None, password: str | None) -> None:
        self.machine = machine
        # Relay commands arrive on paho's network thread; auto-restart runs on the main loop.
        self._relay_lock = threading.Lock()
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
        # "simulated" makes the dashboards label this unit, so demo data is never mistaken for real hardware.
        meta = {"name": p.name, "type": p.type, "location": p.location, "simulated": True}
        client.publish(self.topic("meta"), json.dumps(meta), qos=1, retain=True)
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
            with self._relay_lock:
                self.machine.set_relay(command["relay"], time.monotonic())
                log.info("%s: relay %s", self.machine.profile.device_id, "ON" if self.machine.running else "OFF")
                self._publish_state()

    def _publish_state(self) -> None:
        self.client.publish(self.topic("state"), json.dumps({"relay": self.machine.running}), qos=1, retain=True)

    def restart_if_due(self, now: float) -> None:
        with self._relay_lock:
            if self.machine.auto_restart(now):
                log.info("%s: relay ON (auto-restart after %gs)", self.machine.profile.device_id, self.machine.auto_restart_s)
                self._publish_state()

    def publish_telemetry(self, dt_s: float) -> None:
        cycling = self.machine.cycle_s is not None
        was_faulty = cycling and self.machine.fault_severity() > 0
        reading = self.machine.step(dt_s)
        if cycling and (self.machine.fault_severity() > 0) != was_faulty:
            p = self.machine.profile
            if was_faulty:
                log.info("%s: maintenance done, %s cleared (cycle wrap)", p.device_id, p.fault)
            else:
                log.info("%s: %s developing", p.device_id, p.fault)
        if self.client.is_connected():
            self.client.publish(self.topic("telemetry"), json.dumps(reading), qos=0)

    def close(self) -> None:
        self.client.publish(self.topic("status"), "offline", qos=1, retain=True).wait_for_publish(timeout=2)
        self.client.disconnect()
        self.client.loop_stop()


def positive_float(text: str) -> float:
    value = float(text)
    if not value > 0:
        raise argparse.ArgumentTypeError(f"must be a positive number of seconds, got {text}")
    return value


def select_profiles(devices: str | None) -> list[MachineProfile]:
    wanted = set(devices.split(",")) if devices else None
    return [p for p in FLEET if wanted is None or p.device_id in wanted]


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
    parser.add_argument(
        "--cycle", type=positive_float, metavar="SECONDS",
        help="simulated seconds per maintenance cycle: faults clear and develop again every SECONDS, "
        "with motor-01 half a cycle behind compressor-02 (default: off, faults develop once and stay)",
    )
    parser.add_argument(
        "--auto-restart-s", type=positive_float, metavar="SECONDS",
        help="real seconds after which a machine stopped by a relay command turns itself back on (default: off)",
    )
    parser.add_argument("--devices", help="comma-separated subset of device ids to simulate")
    parser.add_argument("--seed", type=int)
    args = parser.parse_args()

    if args.cycle is not None:
        profiles = [p for p in select_profiles(args.devices) if p.fault in PROGRESSIVE_FAULTS]
        needed = min_cycle_s(profiles, args.fault_start, args.fault_ramp)
        if args.cycle < needed:
            slowest = max(profiles, key=lambda p: min_cycle_s([p], args.fault_start, args.fault_ramp))
            parser.error(
                f"--cycle {args.cycle:g} is too short: {slowest.device_id} needs at least {needed:g} simulated seconds "
                f"for its fault to fully develop (--fault-start {args.fault_start:g} x delay {slowest.fault_delay_factor:g} "
                f"+ --fault-ramp {args.fault_ramp:g}). Use a longer --cycle or a shorter --fault-start/--fault-ramp."
            )
    return args


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    args = parse_args()
    rng = random.Random(args.seed)

    profiles = select_profiles(args.devices)
    if not profiles:
        raise SystemExit(f"No matching devices. Available: {', '.join(p.device_id for p in FLEET)}")

    connections = [
        DeviceConnection(
            SimulatedMachine(p, args.fault_start, args.fault_ramp, rng, cycle_s=args.cycle, auto_restart_s=args.auto_restart_s),
            args.host, args.port, args.prefix, args.username, args.password,
        )
        for p in profiles
    ]
    log.info(
        "simulating %d machines against mqtt://%s:%d (interval %.2fs, speed x%.1f, faults start after %.0f simulated s)",
        len(connections), args.host, args.port, args.interval, args.speed, args.fault_start,
    )
    if args.cycle is not None:
        log.info("maintenance cycle every %g simulated s; offsets: %s", args.cycle, ", ".join(
            f"{c.machine.profile.device_id} +{c.machine.cycle_offset_s:g}s" for c in connections if c.machine.profile.fault in PROGRESSIVE_FAULTS
        ) or "none")
    if args.auto_restart_s is not None:
        log.info("relay-stopped machines restart after %g real s", args.auto_restart_s)

    stop = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    signal.signal(signal.SIGTERM, lambda *_: stop.set())

    dt_s = args.interval * args.speed
    next_tick = time.monotonic()
    while not stop.is_set():
        if args.auto_restart_s is not None:
            now = time.monotonic()
            for connection in connections:
                connection.restart_if_due(now)
        for connection in connections:
            connection.publish_telemetry(dt_s)
        next_tick += args.interval
        stop.wait(max(0.0, next_tick - time.monotonic()))

    log.info("stopping, publishing offline status")
    for connection in connections:
        connection.close()


if __name__ == "__main__":
    main()
