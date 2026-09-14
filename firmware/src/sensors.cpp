#include "sensors.h"

#include "config.h"

#if USE_DHT22 && !SIMULATE_SENSORS
#include <DHT.h>
static DHT dht(DHT_PIN, DHT22);
#endif

#if USE_MPU6050 && !SIMULATE_SENSORS
#include <Adafruit_MPU6050.h>
#include <Wire.h>
static Adafruit_MPU6050 mpu;
#endif

namespace {
// Low-pass factor used to track gravity so only the dynamic (vibration) part is measured.
constexpr float GRAVITY_TRACKING = 0.002f;
}  // namespace

void Sensors::begin() {
#if SIMULATE_SENSORS
  randomSeed(esp_random());
  Serial.println("[sensors] SIMULATE_SENSORS enabled: publishing synthetic data");
  return;
#endif

#if USE_DHT22
  dht.begin();
  dhtOk_ = true;
#endif

#if USE_MPU6050
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  mpuOk_ = mpu.begin();
  if (mpuOk_) {
    mpu.setAccelerometerRange(MPU6050_RANGE_4_G);
    mpu.setFilterBandwidth(MPU6050_BAND_184_HZ);
    sensors_event_t accel, gyro, temp;
    mpu.getEvent(&accel, &gyro, &temp);
    gravity_[0] = accel.acceleration.x;
    gravity_[1] = accel.acceleration.y;
    gravity_[2] = accel.acceleration.z;
  } else {
    Serial.println("[sensors] MPU6050 not found: vibration disabled");
  }
#endif

#if USE_ACS712
  analogReadResolution(12);
  analogSetPinAttenuation(ACS712_PIN, ADC_11db);
#endif
}

void Sensors::update(unsigned long nowMs) {
#if SIMULATE_SENSORS
  (void)nowMs;
  return;
#endif
  sampleDht(nowMs);
  if (nowMs - lastSampleMs_ < SENSOR_SAMPLE_INTERVAL_MS) return;
  lastSampleMs_ = nowMs;
  sampleAccelerometer();
  sampleCurrent();
}

void Sensors::sampleDht(unsigned long nowMs) {
#if USE_DHT22
  if (!dhtOk_ || nowMs - lastDhtMs_ < DHT_READ_INTERVAL_MS) return;
  lastDhtMs_ = nowMs;
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  // A failed read returns NaN: keep the last good value rather than publishing garbage.
  if (!isnan(t)) temperature_ = t;
  if (!isnan(h)) humidity_ = h;
#else
  (void)nowMs;
#endif
}

void Sensors::sampleAccelerometer() {
#if USE_MPU6050
  if (!mpuOk_) return;
  sensors_event_t accel, gyro, temp;
  mpu.getEvent(&accel, &gyro, &temp);
  const float raw[3] = {accel.acceleration.x, accel.acceleration.y, accel.acceleration.z};
  float magnitudeSquared = 0;
  for (int axis = 0; axis < 3; axis++) {
    gravity_[axis] += (raw[axis] - gravity_[axis]) * GRAVITY_TRACKING;
    const float dynamic = raw[axis] - gravity_[axis];
    magnitudeSquared += dynamic * dynamic;
  }
  accelSquaredSum_ += magnitudeSquared;
  accelSamples_++;
#endif
}

void Sensors::sampleCurrent() {
#if USE_ACS712
  const float sensorMv = analogReadMilliVolts(ACS712_PIN) / ACS712_DIVIDER_RATIO;
  const float amps = (sensorMv - ACS712_ZERO_MV) / ACS712_MV_PER_AMP;
  currentSquaredSum_ += amps * amps;
  currentSamples_++;
#endif
}

SensorReading Sensors::read(bool machineRunning) {
  SensorReading reading;

#if SIMULATE_SENSORS
  const float noise = (random(-100, 101) / 100.0f);
  reading.hasTemperature = true;
  reading.temperature = machineRunning ? 55.0f + noise * 0.4f : 30.0f;
  reading.hasHumidity = true;
  reading.humidity = 50.0f + noise;
  reading.hasVibration = true;
  reading.vibration = machineRunning ? 2.0f + noise * 0.15f : 0.05f;
  reading.hasCurrent = true;
  reading.current = machineRunning ? 9.5f + noise * 0.3f : 0.02f;
  return reading;
#endif

  (void)machineRunning;
  if (!isnan(temperature_)) {
    reading.hasTemperature = true;
    reading.temperature = temperature_;
  }
  if (!isnan(humidity_)) {
    reading.hasHumidity = true;
    reading.humidity = humidity_;
  }

  if (accelSamples_ > 0) {
    const float accelRms = sqrt(accelSquaredSum_ / accelSamples_);  // m/s²
    // For a sinusoid v = a / (2πf); scaled to mm/s.
    reading.hasVibration = true;
    reading.vibration = accelRms / (2.0f * PI * VIBRATION_DOMINANT_HZ) * 1000.0f;
    accelSquaredSum_ = 0;
    accelSamples_ = 0;
  }

  if (currentSamples_ > 0) {
    reading.hasCurrent = true;
    reading.current = sqrt(currentSquaredSum_ / currentSamples_);
    currentSquaredSum_ = 0;
    currentSamples_ = 0;
  }
  return reading;
}
