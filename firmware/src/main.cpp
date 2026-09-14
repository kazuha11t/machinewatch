// MachineWatch ESP32 sensor node
//
// Publishes sensor telemetry over MQTT and obeys relay commands from the dashboard.
// Topics follow {prefix}/{deviceId}/{channel}; see backend/src/mqtt.ts for the contract.

#include <Arduino.h>
#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <time.h>

#include "config.h"
#include "sensors.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#warning "include/secrets.h not found: using secrets.example.h placeholders"
#include "secrets.example.h"
#endif

namespace {

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
Sensors sensors;

bool relayOn = true;
bool wifiWasConnected = false;
unsigned long lastTelemetryMs = 0;
unsigned long lastMqttAttemptMs = 0;
unsigned long mqttRetryDelayMs = 1000;
constexpr unsigned long MQTT_MAX_RETRY_DELAY_MS = 30000;
constexpr time_t VALID_EPOCH = 1700000000;  // anything earlier means NTP has not synced yet

String topic(const char* channel) {
  return String(TOPIC_PREFIX) + "/" + DEVICE_ID + "/" + channel;
}

const char* optional(const char* value) {
  return value[0] == '\0' ? nullptr : value;
}

void applyRelay(bool on) {
  relayOn = on;
  digitalWrite(RELAY_PIN, on == RELAY_ACTIVE_HIGH ? HIGH : LOW);
}

void publishJson(const String& topicName, const JsonDocument& doc, bool retained) {
  char buffer[MQTT_BUFFER_SIZE];
  const size_t length = serializeJson(doc, buffer, sizeof(buffer));
  mqtt.publish(topicName.c_str(), reinterpret_cast<const uint8_t*>(buffer), length, retained);
}

void publishState() {
  JsonDocument doc;
  doc["relay"] = relayOn;
  publishJson(topic("state"), doc, true);
}

void publishMeta() {
  JsonDocument doc;
  doc["name"] = DEVICE_NAME;
  doc["type"] = DEVICE_TYPE;
  doc["location"] = DEVICE_LOCATION;
  doc["firmware"] = "1.0.0";
  doc["ip"] = WiFi.localIP().toString();
  publishJson(topic("meta"), doc, true);
}

void onMqttMessage(char* topicName, byte* payload, unsigned int length) {
  JsonDocument doc;
  if (deserializeJson(doc, payload, length)) {
    Serial.printf("[mqtt] ignored malformed message on %s\n", topicName);
    return;
  }
  if (doc["relay"].is<bool>()) {
    applyRelay(doc["relay"].as<bool>());
    Serial.printf("[relay] %s\n", relayOn ? "ON" : "OFF");
    publishState();
  }
}

void startWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(DEVICE_ID);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.printf("[wifi] connecting to %s\n", WIFI_SSID);
}

void maintainWifi() {
  const bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wifiWasConnected) {
    Serial.printf("[wifi] connected, IP %s\n", WiFi.localIP().toString().c_str());
    configTime(0, 0, "pool.ntp.org", "time.google.com");
  } else if (!connected && wifiWasConnected) {
    Serial.println("[wifi] connection lost");
  }
  wifiWasConnected = connected;
}

void maintainMqtt(unsigned long nowMs) {
  if (mqtt.connected() || WiFi.status() != WL_CONNECTED) return;
  if (nowMs - lastMqttAttemptMs < mqttRetryDelayMs) return;
  lastMqttAttemptMs = nowMs;

  const String clientId = String(DEVICE_ID) + "-" + String(static_cast<uint32_t>(ESP.getEfuseMac()), HEX);
  const String statusTopic = topic("status");
  Serial.printf("[mqtt] connecting to %s:%d\n", MQTT_HOST, MQTT_PORT);

  // The broker publishes the retained last will "offline" if this node drops off unexpectedly.
  if (mqtt.connect(clientId.c_str(), optional(MQTT_USERNAME), optional(MQTT_PASSWORD), statusTopic.c_str(), 1, true, "offline")) {
    Serial.println("[mqtt] connected");
    mqttRetryDelayMs = 1000;
    mqtt.subscribe(topic("cmd").c_str(), 1);
    publishMeta();
    mqtt.publish(statusTopic.c_str(), "online", true);
    publishState();
  } else {
    Serial.printf("[mqtt] failed (state %d), retrying in %lus\n", mqtt.state(), mqttRetryDelayMs / 1000);
    mqttRetryDelayMs = min(mqttRetryDelayMs * 2, MQTT_MAX_RETRY_DELAY_MS);
  }
}

void publishTelemetry() {
  const SensorReading reading = sensors.read(relayOn);
  JsonDocument doc;
  if (reading.hasTemperature) doc["temperature"] = round(reading.temperature * 100) / 100.0;
  if (reading.hasHumidity) doc["humidity"] = round(reading.humidity * 10) / 10.0;
  if (reading.hasVibration) doc["vibration"] = round(reading.vibration * 1000) / 1000.0;
  if (reading.hasCurrent) doc["current"] = round(reading.current * 100) / 100.0;
  doc["running"] = relayOn;

  const time_t now = time(nullptr);
  if (now > VALID_EPOCH) doc["ts"] = static_cast<uint64_t>(now) * 1000ULL;

  publishJson(topic("telemetry"), doc, false);
}

}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.printf("\nMachineWatch node %s\n", DEVICE_ID);

  pinMode(RELAY_PIN, OUTPUT);
  pinMode(STATUS_LED_PIN, OUTPUT);
  applyRelay(true);

  sensors.begin();

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setKeepAlive(MQTT_KEEPALIVE_S);
  mqtt.setBufferSize(MQTT_BUFFER_SIZE);
  mqtt.setCallback(onMqttMessage);

  startWifi();
}

void loop() {
  const unsigned long nowMs = millis();

  maintainWifi();
  maintainMqtt(nowMs);
  mqtt.loop();
  sensors.update(nowMs);

  digitalWrite(STATUS_LED_PIN, mqtt.connected() ? HIGH : LOW);

  if (nowMs - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = nowMs;
    if (mqtt.connected()) publishTelemetry();
  }
}
