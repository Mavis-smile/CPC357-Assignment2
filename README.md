# 🔧 Smart Recycle Bin - Hardware Module

ESP32-S3 based IoT hardware system with automated sorting, environmental monitoring, fire detection, and HTTP communication.

## 🧠 System Overview

### Key Features
- **Automated Sorting:** Paper, Plastic, Aluminium (3 compartments)
- **Fill Level Monitoring:** 3 independent IR sensors
- **Fire Safety:** MQ-2 smoke sensor + DHT11 + 10-min cooldown
- **Environmental Monitoring:** Temperature & humidity tracking
- **Motion Detection:** PIR sensor for active/idle mode
- **Remote Control:** Dashboard commands via HTTP polling
- **Real-time Sync:** HTTP webhooks to MongoDB

## 📊 System Architecture

```
┌─────────────────────┐
│  Smartphone Camera  │
│  (React Web App)    │
│  - TensorFlow.js    │
│  - GPS Location     │
└──────────┬──────────┘
           │ WiFi/4G
           ▼
┌─────────────────────┐
│   GCP VM Server     │
│  ┌───────────────┐  │
│  │ Express API   │  │──► MongoDB Atlas
│  │ Port: 4000    │  │
│  └───────────────┘  │
│  ┌───────────────┐  │
│  │ Python Webhook│  │
│  │ Port: 5000    │  │
│  └───────────────┘  │
└──────────┬──────────┘
           │ WiFi
           ▼
┌─────────────────────┐
│   ESP32-S3 MCU      │
│  ┌───────────────┐  │
│  │ 3x IR Sensors │  │
│  │ PIR Sensor    │  │
│  │ MQ-2 Sensor   │  │
│  │ DHT11         │  │
│  │ 2x Servos     │  │
│  │ 2x LEDs       │  │
│  │ Push Button   │  │
│  │ Buzzer        │  │
│  └───────────────┘  │
└─────────────────────┘
```

## 🔌 Hardware Components

| Component | Quantity | Purpose | Pin |
|-----------|----------|---------|-----|
| AIoT Maker Feather S3 | 1 | Main MCU | - |
| IR Sensor | 3 | Fill level detection | GPIO 6, 4, 7 |
| PIR Sensor | 1 | Motion detection | GPIO 15 |
| MQ-2 Gas Sensor | 1 | Smoke/fire detection | GPIO 10 (A0) |
| DHT11 | 1 | Temperature & humidity | GPIO 21 |
| SG90 Servo | 2 | Rotation + lid control | GPIO 39, 5 |
| Red LED | 1 | Bin full indicator | GPIO 17 |
| Green LED | 1 | Bin available indicator | GPIO 8 |
| Push Button | 1 | Manual alarm reset | GPIO 14 |
| Buzzer | 1 | Fire alert sound | GPIO 12 |

## 🚀 Quick Start

### 1. Install Arduino IDE
Download from: https://www.arduino.cc/en/software

### 2. Add ESP32 Board Support
1. File → Preferences
2. Additional Board Manager URLs:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Tools → Board → Boards Manager
4. Search and install: `esp32 by Espressif Systems` (v2.0.0+)

### 3. Install Required Libraries
Tools → Manage Libraries, search and install:
- `DHT sensor library` (v1.4+)
- `Adafruit Unified Sensor`
- `ESP32Servo` (v3.0+)
- `ArduinoJson` (v6.21+)

### 4. Configure WiFi & Hardware
Edit `assignment2/assignment2.ino`:
```cpp
// WiFi Configuration
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Backend URL
const char* HTTP_ENDPOINT_BASE = "https://your-domain-name.duckdns.org/api/bins";

// Bin ID
String binId = "BIN001";
```

### 5. Upload to ESP32
1. Connect ESP32 via USB
2. Tools → Board → **Cytron Maker Feather AIoT S3**
3. Tools → Port → (select COM port)
4. Click Upload (→)

### 6. Verify Operation
Open Serial Monitor (115200 baud):
```
=== Smart Recycle Bin Starting ===
✅ Servos initialized
Connecting to WiFi: YOUR_WIFI_NAME
✅ WiFi connected!
ESP32 IP: 192.168.x.x
HTTP server started on port 80
📡 Registering ESP32 with backend...
=== System Ready ===
```

## 📡 Communication Flow

### Flow 1: Camera → Hardware (Item Detection)
```
1. Camera detects item (e.g., "plastic bottle")
2. POST /api/detections → Backend saves to MongoDB
3. Backend → POST /api/bins/BIN001/command
4. ESP32 polls GET /api/bins/BIN001/command
5. ESP32 receives: {"category":"plastic"}
6. Servo rotates to plastic slot (0°)
7. Lid opens and closes
8. Item sorted ✅
```

### Flow 2: Hardware → Dashboard (Sensor Data)
```
1. ESP32 reads sensors every 5 seconds
2. PATCH /api/bins/BIN001
   {
     "fillLevels": [30, 75, 20],
     "temperature": 28.5,
     "humidity": 65,
     "smokeLevel": 150,
     "isActive": true
   }
3. MongoDB updates bin document
4. Dashboard polls and displays data ✅
```

### Flow 3: Dashboard → Hardware (Remote Commands)
```
1. User clicks "Reset Alarm" on dashboard
2. POST /api/commands {"binId":"BIN001","action":"reset-alarm"}
3. Backend stores command in MongoDB
4. Backend → POST /api/bins/BIN001/command
5. ESP32 polls and receives command
6. ESP32 executes: stops buzzer, starts cooldown
7. Status updated ✅
```

## 🎮 Remote Control Commands

| Command | Action | Description |
|---------|--------|-------------|
| `reset-alarm` | Fire alarm | Stop buzzer, start 10-min cooldown |
| `mark-emptied` | Fill levels | Reset all sensors to 0% |
| `test-servo-paper` | Paper slot | Rotate right 90° + lid test |
| `test-servo-plastic` | Plastic slot | Rotate left 90° + lid test |
| `test-servo-aluminium` | Aluminium slot | Neutral position + lid test |
| `maintenance-mode` | System | Disable alerts and detections |

## 🔧 HTTP Endpoints (ESP32)

### ESP32 Calls (Outbound)
```cpp
// Register ESP32 IP
POST /api/bins/BIN001/register
{"localIP": "192.168.1.100"}

// Update sensor data
PATCH /api/bins/BIN001
{"fillLevels": [30,75,20], "temperature": 28.5, ...}

// Poll for commands (every 2 seconds)
GET /api/bins/BIN001/command
Response: {"hasCommand": true, "category": "plastic"}
```

### ESP32 Receives (Inbound - Local Server)
```cpp
// Camera sends detection to ESP32 directly
POST http://192.168.1.100/detection
{"binId":"BIN001","category":"plastic","itemClass":"bottle"}

// Test servo endpoint
GET http://192.168.1.100/test/servo?category=plastic
```

## 🔥 Fire Alert System

### Trigger Conditions
- Smoke level > 1300 (MQ-2 sensor)
- Temperature > 55°C (DHT11)

### Alert Sequence
1. Red LED blinks
2. Buzzer sounds at 2000Hz
3. Fire alert sent to backend
4. Dashboard shows notification

### Reset Methods
- **Manual:** Press push button on hardware
- **Remote:** Dashboard "Reset Alarm" command

### Cooldown Period
- 10 minutes after reset
- Sensors paused during cooldown
- Prevents false alarms

## 🛠️ Troubleshooting

### WiFi Connection Failed
```cpp
// Check credentials
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Ensure 2.4GHz WiFi (ESP32 doesn't support 5GHz)
```

### Servo Not Moving
```cpp
// Check pin connections
#define SERVO_ROTATE_PIN  39  // Container rotation
#define SERVO_LID_PIN     5   // Lid control

// Test in Serial Monitor - should see movement
```

### No Commands Received
```cpp
// Verify backend URL
const char* HTTP_ENDPOINT_BASE = "https://your-domain-name.duckdns.org/api/bins";

// Check polling function is running
// Serial Monitor should show: "[COMMAND] Polling: ..."
```

### Fire Alert Won't Reset
```cpp
// Check button connection (GPIO 14)
// Or send reset-alarm command from dashboard
// Verify cooldown status in Serial Monitor
```

## 📊 Servo Positions

### Container Rotation Servo
```
Left (Plastic):    0° (SERVO_ROTATE_LEFT_90)
Neutral (Aluminium): 90° (SERVO_ROTATE_NEUTRAL)
Right (Paper):     180° (SERVO_ROTATE_RIGHT_90)
```

### Lid Servo
```
Closed: 0° (SERVO_LID_CLOSED)
Open:   180° (SERVO_LID_OPEN)
```

## 🔧 Configuration

### Adjust Sensor Thresholds
```cpp
const int IR_THRESHOLD = 500;      // Fill level threshold
const int SMOKE_THRESHOLD = 1300;  // Fire detection threshold
const float TEMP_THRESHOLD = 55.0; // Temperature alert
```

### Change Timing Intervals
```cpp
const unsigned long SENSOR_READ_INTERVAL = 5000;   // Read sensors
const unsigned long HTTP_PUBLISH_INTERVAL = 10000; // Publish data
const unsigned long PIR_IDLE_TIMEOUT = 60000;      // Idle timeout
const unsigned long FIRE_COOLDOWN_PERIOD = 600000; // 10-min cooldown
```

### Modify Buzzer Patterns
```cpp
const int BUZZER_FREQ_NON_RECYCLABLE = 1000; // Non-recyclable beep
const int BUZZER_FREQ_FIRE_ALERT = 2000;     // Fire alert siren
```

## 📚 Technology Stack

| Component | Technology |
|-----------|-----------|
| MCU | ESP32-S3 (Maker Feather AIoT S3) |
| Programming | Arduino C++ |
| Communication | HTTP/HTTPS (WiFiClientSecure) |
| Data Format | JSON (ArduinoJson) |
| Libraries | ESP32Servo, DHT, HTTPClient |
