#pragma once

#include <Arduino.h>

struct SensorReading {
  bool hasTemperature = false;
  float temperature = 0; // °C
  bool hasHumidity = false;
  float humidity = 0; // %RH
  bool hasVibration = false;
  float vibration = 0; // mm/s RMS
  bool hasCurrent = false;
  float current = 0; // A RMS
};

class Sensors {
 public:
  void begin();
  /** Call from loop() as often as possible: samples fast signals (vibration, current). */
  void update(unsigned long nowMs);
  /** Returns aggregates since the previous call and starts a new window. */
  SensorReading read(bool machineRunning);

 private:
  unsigned long lastSampleMs_ = 0;
  unsigned long lastDhtMs_ = 0;

  bool dhtOk_ = false;
  float temperature_ = NAN;
  float humidity_ = NAN;

  bool mpuOk_ = false;
  float gravity_[3] = {0, 0, 0};
  double accelSquaredSum_ = 0;
  uint32_t accelSamples_ = 0;

  double currentSquaredSum_ = 0;
  uint32_t currentSamples_ = 0;

  void sampleDht(unsigned long nowMs);
  void sampleAccelerometer();
  void sampleCurrent();
};
