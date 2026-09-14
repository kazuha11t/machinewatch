#pragma once

// Copy this file to secrets.h (git-ignored) and fill in your values.

#define WIFI_SSID "your-wifi"
#define WIFI_PASSWORD "your-password"

// IP of the computer running the backend (embedded broker) or Mosquitto.
#define MQTT_HOST "192.168.1.100"
#define MQTT_PORT 1883
#define MQTT_USERNAME "" // leave empty if the broker allows anonymous clients
#define MQTT_PASSWORD ""

// Letters, digits, '-' and '_' only.
#define DEVICE_ID "esp32-press-01"
#define DEVICE_NAME "Hydraulic Press"
#define DEVICE_TYPE "press"
#define DEVICE_LOCATION "Workshop"
