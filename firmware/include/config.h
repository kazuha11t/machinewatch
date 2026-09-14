#pragma once

// ---------------------------------------------------------------------------
// Hardware configuration. Set a USE_* flag to 0 if that sensor is not wired;
// its value is then omitted from telemetry and the AI model ignores it.
// ---------------------------------------------------------------------------

#ifndef SIMULATE_SENSORS
#define SIMULATE_SENSORS 0
#endif

// DHT22 (AM2302): temperature + humidity
#define USE_DHT22 1
#define DHT_PIN 4

// MPU6050 accelerometer over I2C: vibration
#define USE_MPU6050 1
#define I2C_SDA_PIN 21
#define I2C_SCL_PIN 22
// Acceleration is converted to vibration velocity (mm/s RMS, as used by ISO 10816)
// assuming the dominant frequency is the shaft speed: 1500 RPM = 25 Hz.
#define VIBRATION_DOMINANT_HZ 25.0f

// ACS712 hall-effect current sensor on an ADC1 pin (ADC2 is unavailable while Wi-Fi is on).
// The ACS712 outputs 0-5 V: use a divider (e.g. 10k/20k) so the ESP32 pin stays below 3.3 V.
#define USE_ACS712 1
#define ACS712_PIN 34
#define ACS712_MV_PER_AMP 100.0f   // 5A: 185, 20A: 100, 30A: 66
#define ACS712_DIVIDER_RATIO 0.667f // Vout at the ESP32 pin / Vout of the sensor
#define ACS712_ZERO_MV 2500.0f      // sensor output at 0 A, before the divider

// Relay that powers the machine (or a contactor coil driver).
#define RELAY_PIN 26
#define RELAY_ACTIVE_HIGH true
#define STATUS_LED_PIN 2

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
#define TELEMETRY_INTERVAL_MS 1000
#define SENSOR_SAMPLE_INTERVAL_MS 1 // vibration + current sampling (~1 kHz)
#define DHT_READ_INTERVAL_MS 2000   // DHT22 cannot be read faster than every 2 s

// ---------------------------------------------------------------------------
// MQTT topics: {TOPIC_PREFIX}/{DEVICE_ID}/{telemetry|status|state|meta|cmd}
// ---------------------------------------------------------------------------
#define TOPIC_PREFIX "machinewatch"
#define MQTT_KEEPALIVE_S 15
#define MQTT_BUFFER_SIZE 512
