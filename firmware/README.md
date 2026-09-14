# MachineWatch ESP32 firmware

Arduino/PlatformIO firmware that turns an ESP32 into a MachineWatch sensor node. It streams
telemetry over MQTT, reconnects on its own, reports online/offline status with an MQTT last
will, and drives a relay when the dashboard sends a start or stop command.

## Hardware

| Part | Purpose | ESP32 pin |
| --- | --- | --- |
| DHT22 (AM2302) | Temperature + humidity | `GPIO 4` (10 kΩ pull-up to 3V3) |
| MPU6050 | Vibration (accelerometer) | `SDA GPIO 21`, `SCL GPIO 22` |
| ACS712 (5/20/30 A) | Motor current | `GPIO 34` through a 10 kΩ / 20 kΩ divider |
| Relay module | Machine power / contactor | `GPIO 26` |
| On-board LED | MQTT connected | `GPIO 2` |

> ACS712 boards output up to 5 V. Always use the divider: ESP32 ADC pins tolerate 3.3 V at most.
> Only use ADC1 pins (GPIO 32–39): ADC2 does not work while Wi-Fi is active.

Missing a sensor? Set its `USE_*` flag to `0` in [`include/config.h`](include/config.h). That field is left out of
telemetry, and the AI service trains only on the sensors the device actually reports.

## Setup

```bash
cp include/secrets.example.h include/secrets.h   # then edit Wi-Fi, broker IP and device name
pio run -t upload
pio device monitor
```

`MQTT_HOST` must be the LAN IP of the computer running the backend (with `EMBEDDED_BROKER=true`) or Mosquitto,
not `localhost`. The device shows up on the dashboard automatically on its first message.

To test a bare board with no sensors wired, flash the simulated environment:

```bash
pio run -e esp32dev-simulated -t upload
```

## MQTT contract

| Topic | Direction | Payload |
| --- | --- | --- |
| `machinewatch/{id}/telemetry` | device → cloud | `{"temperature":48.2,"humidity":51.0,"vibration":2.114,"current":9.7,"running":true,"ts":1760000000000}` |
| `machinewatch/{id}/status` | device → cloud, retained | `online` / `offline` (last will) |
| `machinewatch/{id}/meta` | device → cloud, retained | `{"name":"Hydraulic Press","type":"press","location":"Workshop","firmware":"1.0.0","ip":"192.168.1.42"}` |
| `machinewatch/{id}/state` | device → cloud, retained | `{"relay":true}` |
| `machinewatch/{id}/cmd` | cloud → device | `{"relay":false}` |

## How vibration is measured

The MPU6050 is sampled at about 1 kHz. Gravity is tracked with a slow low-pass filter and subtracted, and the
remaining dynamic acceleration is reduced to an RMS value once per second. ISO 10816 limits are expressed as
**velocity** (mm/s RMS), so acceleration is converted using `v = a / (2πf)` at the dominant frequency
`VIBRATION_DOMINANT_HZ` (the shaft speed, e.g. 1500 RPM = 25 Hz). This is an approximation suited to condition
monitoring trends, not a replacement for a calibrated velocity sensor.

## Build size

Verified with PlatformIO on `esp32dev`: RAM 14% (45.8 kB), Flash 62% (814 kB).
