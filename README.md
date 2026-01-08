# THIS BRANCH IS FOR HARDWARE ONLY 🔧

Smart Recycle Bin IoT hardware system with automated sorting, environmental monitoring, fire detection, and remote control capabilities. Built using Maker Feather AIoT S3 microcontroller with MQTT communication.

## 🧠 System Overview

### Key Features

| Feature | Details |
|---------|---------|
| **Object Detection** | TensorFlow.js model on smartphone camera |
| **Bin Sorting** | Paper, Plastic, Aluminium |
| **Fill Level Monitoring** | 3 independent IR sensors (one per bin compartment) |
| **Fire Safety** | MQ-2 smoke sensor + DHT11 sensor + 10-min cooldown |
| **Remote Control** | Dashboard commands through MQTT |
| **Real-time Sync** | Firebase Firestore with MQTT bridge |
| **GPS Tracking** | Location-based detection history |

---

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SMARTPHONE (Camera Device)                     │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Camera Web UI (React App - Project-CPC357_cam)                │ │
│  │  - Object Detection Model (TensorFlow.js/YOLO)                 │ │
│  │  - GPS Location Capture                                        │ │
│  │  - MQTT Client (publishes to: smartbin/item)                   │ │
│  └────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ WiFi/4G
                                ▼
                ┌───────────────────────────────┐
                │   GCP VM Instance (Cloud)     │
                │  ┌─────────────────────────┐  │
                │  │  Mosquitto MQTT Broker  │  │
                │  │  Port: 1883, 9001(WS)   │  │
                │  └─────────────────────────┘  │
                │  ┌─────────────────────────┐  │
                │  │  MQTT-Firebase Bridge   │  │
                │  │  (Node.js Script)       │  │
                │  └─────────────────────────┘  │
                └───┬───────────────────┬───────┘
                    │                   │
        ┌───────────┘                   └──────────┐
        │ WiFi                                WiFi │
        ▼                                          ▼
┌──────────────────┐                    ┌──────────────────────┐
│  ESP32-S3 MCU    │                    │   Firebase Cloud     │
│  (Hardware)      │                    │   ┌──────────────┐   │
│  - 3x IR Sensors │◄───────────────────┤   │  Firestore   │   │
│  - PIR Sensor    │     Real-time      │   │  Database    │   │
│  - MQ-2 Sensor   │     Sync           │   └──────────────┘   │
│  - DHT11         │                    │   ┌──────────────┐   │
│  - 2x Servos     │                    │   │  Collections │   │
│  - 2x LEDs       │                    │   │  - bins      │   │
│  - Push Button   │                    │   │  - detections│   │
│  - Buzzer        │                    │   │  - commands  │   │
└──────────────────┘                    │   │  - alerts    │   │
                                        └──────┬───────────────┘
                                               │ WiFi/Internet
                                               ▼
                                    ┌───────────────────────────┐
                                    │  Dashboard Web UI         │
                                    │  (React - Vite)           │
                                    │  Project-CPC357_dashboard │
                                    │  - Real-time monitor      │
                                    │  - Remote control         │
                                    │  - Alerts & analytics     │
                                    └───────────────────────────┘
```

---

## Prerequisites & Hardware

### Software Prerequisites

- ✅ **Node.js** 14+ (for bridge script)
- ✅ **Arduino IDE** 2.x (for uploading to ESP32)
- ✅ **GCP Account** with free tier eligible
- ✅ **Firebase Project** (Firestore database)
- ✅ **Git** (for version control)

### Hardware Components

| Component | Quantity | Purpose |
|-----------|----------|---------|
| **AIoT Maker Feather S3** (ESP32) | 1 | Main microcontroller |
| **IR Sensor** | 3 | Detect trash fill level (Paper, Plastic, Aluminium) |
| **PIR Sensor** | 1 | Motion detection (bin activity) |
| **MQ-2 Gas Sensor** | 1 | Smoke/fire detection |
| **DHT11** | 1 | Temperature & humidity |
| **SG90 Servo** | 2 | Container rotation + lid control |
| **Red LED** | 1 | Bin full indicator |
| **Green LED** | 1 | Bin available indicator |
| **Push Button** | 1 | Manual fire alarm reset |
| **Buzzer** | 1 | Fire alert sound (built-in inside mcu) |
| **USB-C Cable** | 1 | Arduino programming |


### Network Requirements

- WiFi 2.4GHz (ESP32 compatible, NOT 5GHz)
- Internet connectivity for Firebase/GCP
- Port 1883 (MQTT TCP) open on GCP VM
- Port 9001 (MQTT WebSocket) open on GCP VM

---

## Complete Setup Guide

### Phase 1: Cloud Infrastructure

#### Step 1: GCP VM Setup

**Create VM Instance:**
```bash
# Using Google Cloud Console:
1. Compute Engine > VM instances > CREATE INSTANCE
2. Name: smart-bin-mqtt
3. Region: (use default region)
4. Machine type: e2-medium
5. Boot disk: Ubuntu 24.04 LTS Minimal (x86/64, amd64 noble minimal image built on 2025-12-17), 10GB
6. Click CREATE
```

**Configure Firewall Rules:**
```bash
# Using Google Cloud Console:
1. Go to VPC Network > Firewall
2. Click CREATE FIREWALL RULE

# Rule 1: Allow MQTT (TCP 1883) for ESP32
3. Name: allow-mqtt
4. Direction of traffic: Ingress
5. Action on match: Allow
6. Targets: All instances in the network
7. Source IP ranges: 0.0.0.0/0
8. Protocols and ports: ✅ Specified protocols and ports
   - tcp: 1883
9. Click CREATE

# Rule 2: Allow WebSocket (TCP 9001) for camera browser app
10. Click CREATE FIREWALL RULE again
11. Name: allow-mqtt-ws
12. Direction of traffic: Ingress
13. Action on match: Allow
14. Targets: All instances in the network
15. Source IP ranges: 0.0.0.0/0
16. Protocols and ports: ✅ Specified protocols and ports
    - tcp: 9001
17. Click CREATE
```

**SSH into VM and Install Mosquitto:**
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Mosquitto MQTT broker
sudo apt install mosquitto mosquitto-clients -y

# Edit Mosquitto configuration
sudo apt install nano
sudo nano /etc/mosquitto/mosquitto.conf
```

Add this to the config:
```conf
# MQTT for ESP32 (raw TCP)
listener 1883
protocol mqtt

# MQTT WebSocket for browser apps
listener 9001
protocol websockets
allow_anonymous true
```

**Start Mosquitto:**
```bash
sudo systemctl enable mosquitto
sudo systemctl restart mosquitto
sudo systemctl status mosquitto
# Expected: "active (running)"
```

**Test MQTT Connection:**
```bash
# Terminal 1: Subscribe
mosquitto_sub -h localhost -t "test" -v

# Terminal 2: Publish
mosquitto_pub -h localhost -t "test" -m "Hello MQTT"

# Terminal 1 should display: test Hello MQTT
```

#### Step 2: Install Node.js

```bash
# Add Node.js 20 repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version  # v20.x.x
npm --version   # 10.x.x or higher
```

#### Step 3: Create MQTT-Firebase Bridge

**Create project directory:**
```bash
cd ~
mkdir mqtt-firebase-bridge
cd mqtt-firebase-bridge
```

**Initialize Node.js project:**
```bash
npm init -y
npm install mqtt firebase-admin
```

**Upload files to VM:**
```bash
1. Go to the CPC357 Firebase project and click Project Settings.
2. Click into Service Accounts and click "Generate new private key".
3. Rename the file to "serviceAccountKey.json".
4. Back to the GCP VM SSH.
5. Click the "Upload file" button at the top and upload the bridge.js file.
6. Click the "Upload file" button again and upload the serviceAccountKey.json file.
7. Move both files to the mqtt-firebase-bridge directory:
   cd ../
   mv bridge.js mqtt-firebase-bridge/
   mv serviceAccountKey.json mqtt-firebase-bridge/
   cd mqtt-firebase-bridge
```

**Test bridge manually:**
```bash
cd ~/mqtt-firebase-bridge
node bridge.js
```

**Expected output:**
```
============================================================
🌉 MQTT-to-Firebase Bridge
============================================================
📡 MQTT Broker: localhost:1883
🔥 Firebase Project: your-project-id
============================================================

⏳ Connecting to MQTT broker...

✅ Connected to MQTT broker (localhost:1883)
📡 Subscribing to MQTT topics...
   ✓ smartbin/sensors
   ✓ smartbin/alerts
   ✓ smartbin/item
✅ MQTT-Firebase bridge running...
💡 Waiting for MQTT messages and Firebase commands...
```

**Run as System Service:**
```bash
sudo nano /etc/systemd/system/mqtt-bridge.service
```

Paste this content (change username):
```ini
[Unit]
Description=MQTT to Firebase Bridge
After=network.target

[Service]
Type=simple
User=your-username
WorkingDirectory=/home/your-username/mqtt-firebase-bridge
ExecStart=/usr/bin/node /home/your-username/mqtt-firebase-bridge/bridge.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable mqtt-bridge
sudo systemctl start mqtt-bridge
sudo systemctl status mqtt-bridge  # Should show "active (running)"
```

**Monitor Bridge in Real-time:**
```bash
# Terminal 1: Watch bridge logs (shows MQTT messages being processed)
sudo journalctl -u mqtt-bridge -f

# Terminal 2: Monitor all MQTT topics (shows raw MQTT messages)
mosquitto_sub -h localhost -t "smartbin/#" -v
```

Expected output in Terminal 1:
```
Jan 08 10:30:15 smart-bin-mqtt node[1234]: ✅ Connected to MQTT broker
Jan 08 10:30:15 smart-bin-mqtt node[1234]: 📡 Subscribed to smartbin/sensors
Jan 08 10:30:25 smart-bin-mqtt node[1234]: 📊 Sensor data received from BIN001
```

---

### Phase 2: Hardware Setup

#### Step 1: Arduino IDE & ESP32 Board

**Install Arduino IDE:**
- Download: [arduino.cc/software](https://www.arduino.cc/en/software)
- Install and launch

**Add ESP32 Board Support:**
1. File > Preferences
2. Additional Board Manager URLs:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. Click OK
4. Tools > Board > Boards Manager
5. Search: `esp32`
6. Install: `esp32 by Espressif Systems` (v2.0.0 or latest)

**Install Required Libraries:**
Tools > Manage Libraries > Search and install:
- `PubSubClient` (v2.8+) - MQTT client
- `DHT sensor library` (v1.4+) - DHT11 sensor
- `Adafruit Unified Sensor` - Sensor framework
- `ESP32Servo` (v3.0+) - Servo control
- `ArduinoJson` (v6.21+) - JSON parsing

#### Step 2: Configure & Upload project.ino

**Open .ino in Arduino IDE**

Open the .ino file at:

Project-CPC357_hardware/project/project.ino

**Edit WiFi and MQTT Settings:**
```cpp
const char* WIFI_SSID = "YOUR_WIFI_NAME";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_SERVER = "YOUR_GCP_VM_EXTERNAL_IP";  // Get from GCP console
const int MQTT_PORT = 1883;
String binId = "BIN001";  // Unique identifier for this bin
```

**Connect ESP32 via USB cable**

**Configure Upload Settings:**
1. Tools > Board > Cytron Maker Feather AIoT S3
2. Tools > Port > (select your COM port)
3. Tools > Upload Speed > 921600

**Upload:**
- Click Upload button (→) or Ctrl+U
- Wait for "Hard resetting via RTS pin..."
- Should see "✓ Success"

**Verify in Serial Monitor:**
1. Tools > Serial Monitor
2. Set baud rate: 9600
3. Should see output like:
```
=== System Initializing ===
Pins configured...
Sensors initialized...
WiFi connecting to: YOUR_WIFI_NAME
✓ WiFi connected!
MQTT connecting to: 192.168.x.x
✓ MQTT connected!
=== System Ready ===
[Sensor readings every 10 seconds...]
```

---

## Communication Architecture

### Detailed Communication Flows

#### Flow 1: Camera → Hardware (Item Detection)

**What Happens:**
1. User throw the item into the trash container with camera at above
2. TensorFlow.js model detects: "plastic - xx% confidenc"
3. Camera captures GPS coordinates from phone
4. MQTT publishes to `smartbin/item` topic
5. ESP32 receives message via Mosquitto
6. Servo rotates to plastic bin (90°)
7. Lid servo opens and closes
8. Item drops into correct bin ✅

**Code Flow:**
```typescript
// Camera app (mqttClient.ts)
publishItemDetection({
  binId: 'BIN001',
  category: 'plastic',
  itemClass: 'bottle',
  confidence: 95,
  latitude: 5.3547,
  longitude: 100.3018
});
// Publishes JSON to: smartbin/item
```

```cpp
// Hardware (project.ino - callback)
void handleItemDetection(String message) {
  StaticJsonDocument<256> doc;
  deserializeJson(doc, message);
  
  String category = doc["category"];
  
  if (category == "plastic") {
    rotateServo.write(SERVO_ROTATE_LEFT_90);  // 0° - left 90°
    Serial.println("Servo → Plastic bin (left hole)");
    delay(1000);
  } 
  else if (category == "aluminium") {
    // Middle hole - no rotation needed, already at neutral (90°)
    Serial.println("Servo → Aluminium bin (middle hole) - No rotation");
  } 
  else if (category == "paper") {
    rotateServo.write(SERVO_ROTATE_RIGHT_90);  // 180° - right 90°
    Serial.println("Servo → Paper bin (right hole)");
    delay(1000);
  } 
  else {
    // Non-recyclable item
    playNonRecyclableBuzzer();
    return;  // Don't open lid
  }
  
  // Open bottom lid
  lidServo.write(SERVO_LID_OPEN);   // 180°
  delay(2000);
  
  // Close lid
  lidServo.write(SERVO_LID_CLOSED); // 0°
  delay(500);
  
  // Return to neutral
  rotateServo.write(SERVO_ROTATE_NEUTRAL);  // 90°
}
```

#### Flow 2: Hardware → Cloud (Sensor Data)

**What Happens:**
1. ESP32 reads all sensors every 5 seconds
2. Publishes JSON to `smartbin/sensors` topic
3. MQTT bridge receives and writes to Firebase
4. Data stored in Firestore for monitoring ✅

**MQTT Message:**
```json
{
  "binId": "BIN001",
  "fillLevels": [30, 75, 20],
  "temperature": 28.5,
  "humidity": 65.0,
  "smokeLevel": 150,
  "isActive": true,
  "fireAlert": false,
  "inFireCooldown": false,
  "timestamp": 1640000000000
}
```

**Firebase Result:**
```
Collection: bins
Document: BIN001
{
  binId: "BIN001"
  fillLevels: [30, 75, 20]
  temperature: 28.5
  humidity: 65.0
  smokeLevel: 150
  isActive: true
  fireAlert: false
  inFireCooldown: false
  updatedAt: Dec 20, 2024 10:30 AM
}
```

#### Flow 3: Cloud → Hardware (Remote Commands)

**What Happens:**
1. Remote command written to Firebase `commands` collection
2. Bridge script detects new command
3. Bridge publishes to `smartbin/commands` via MQTT
4. ESP32 receives and executes command
5. Action completed ✅

**Command Document in Firebase:**
```json
{
  "binId": "BIN001",
  "action": "reset-alarm",
  "issuedAt": "2024-12-20T10:30:00Z",
  "status": "pending"
}
```

**MQTT Message:**
```json
{
  "binId": "BIN001",
  "action": "reset-alarm",
  "timestamp": 1640000000000
}
```

**Hardware Response:**
```cpp
void handleCommand(String message) {
  StaticJsonDocument<256> doc;
  deserializeJson(doc, message);
  
  String action = doc["action"];
  
  if (action == "reset-alarm") {
    fireAlertActive = false;
    inFireCooldown = true;
    fireCooldownStart = millis();
    noTone(BUZZER_PIN);
    digitalWrite(LED_RED_PIN, LOW);
    
    Serial.println("✅ Fire alarm reset - 10-min cooldown");
  }
}
```

### MQTT Topics Reference

| Topic | Direction | Source | Payload | Purpose |
|-------|-----------|--------|---------|---------|
| `smartbin/item` | → ESP32 | Camera | {category, confidence, GPS} | Item detection → servo control |
| `smartbin/sensors` | → Firebase | ESP32 | {fillLevels, temp, humidity, smoke} | Sensor data → dashboard |
| `smartbin/alerts` | → Firebase | ESP32 | {temperature, smokeLevel} | Fire alert → Firebase |
| `smartbin/commands` | → ESP32 | Bridge | {action, binId} | Dashboard command → hardware |
| `bridge/status` | INFO | Bridge | {online/offline} | Bridge connection status |

---

## Remote Control System

### How Remote Control Works

#### Available Actions

| Button | Action | What it does | MQTT Payload |
|--------|--------|-------------|---|
| **Reset Alarm** | `reset-alarm` | Stops buzzer, starts 10-min cooldown | `{"action":"reset-alarm"}` |
| **Mark Emptied** | `mark-emptied` | Resets all fill level sensors to 0% | `{"action":"mark-emptied"}` |
| **Test Paper Slot** | `test-servo-paper` | Tests right hole rotation (180°) + lid open/close | `{"action":"test-servo-paper"}` |
| **Test Plastic Slot** | `test-servo-plastic` | Tests left hole rotation (0°) + lid open/close | `{"action":"test-servo-plastic"}` |
| **Test Aluminium Slot** | `test-servo-aluminium` | Tests middle hole (neutral 90°) + lid open/close | `{"action":"test-servo-aluminium"}` |
| **Maintenance** | `maintenance-mode` | Disables sensor alerts and detections | `{"action":"maintenance-mode"}` |

#### Complete Control Flow

```
Remote Command Initiated
    ↓
Command written to Firebase
Collection: commands
Document: {
  binId: "BIN001",
  action: "test-servo-paper",
  status: "pending",
  issuedAt: timestamp
}
    ↓
Bridge.js onSnapshot listener
    ↓ Detects new pending command
Bridge publishes to MQTT topic: smartbin/commands
Payload: {
  "binId": "BIN001",
  "action": "test-servo-paper",
  "timestamp": 1640000000000
}
    ↓
ESP32 mqttCallback receives message
    ↓ Parses JSON
if (action == "test-servo-paper") {
  rotateServo.write(SERVO_ROTATE_RIGHT_90);  // 180°
  delay(1000);
  lidServo.write(SERVO_LID_OPEN);            // 180°
  delay(1000);
  lidServo.write(SERVO_LID_CLOSED);          // 0°
  delay(500);
  rotateServo.write(SERVO_ROTATE_NEUTRAL);   // 90°
  Serial.println("Paper test done");
}
    ↓
Hardware executes
    ↓ Servos rotate visibly
Serial Monitor shows confirmation
✅ System working!
```

#### Hardware Integration (project.ino):
```cpp
void handleCommand(String message) {
  StaticJsonDocument<256> doc;
  deserializeJson(doc, message);
  
  String receivedBinId = doc["binId"];
  String action = doc["action"];
  
  if (receivedBinId != binId) return;
  
  if (action == "reset-alarm") {
    fireAlertActive = false;
    inFireCooldown = true;
    fireCooldownStart = millis();
    noTone(BUZZER_PIN);
    digitalWrite(LED_RED_PIN, LOW);
  }
  else if (action == "mark-emptied") {
    fillLevels[0] = 0;
    fillLevels[1] = 0;
    fillLevels[2] = 0;
    publishSensorData();
  }
  else if (action == "test-servo-paper") {
    rotateServo.write(SERVO_ROTATE_RIGHT_90);
    delay(1000);
    lidServo.write(SERVO_LID_OPEN);
    delay(1000);
    lidServo.write(SERVO_LID_CLOSED);
    delay(500);
    rotateServo.write(SERVO_ROTATE_NEUTRAL);
  }
  else if (action == "test-servo-plastic") {
    rotateServo.write(SERVO_ROTATE_LEFT_90);
    delay(1000);
    lidServo.write(SERVO_LID_OPEN);
    delay(1000);
    lidServo.write(SERVO_LID_CLOSED);
    delay(500);
    rotateServo.write(SERVO_ROTATE_NEUTRAL);
  }
  else if (action == "test-servo-aluminium") {
    lidServo.write(SERVO_LID_OPEN);
    delay(1000);
    lidServo.write(SERVO_LID_CLOSED);
  }
  else if (action == "maintenance-mode") {
    isMaintenanceMode = !isMaintenanceMode;
    if (isMaintenanceMode) {
      fireAlertActive = false;
      noTone(BUZZER_PIN);
    }
  }
}
```

---

## Testing & Verification

### Test 1: Bridge Connectivity

**Run bridge manually:**
```bash
cd ~/mqtt-firebase-bridge
node bridge.js
```

**Expected:**
```
✅ Connected to MQTT broker (localhost:1883)
📡 Subscribing to MQTT topics...
   ✓ smartbin/sensors
   ✓ smartbin/alerts
   ✓ smartbin/item
✅ MQTT-Firebase bridge running...
```

### Test 2: Sensor Data Flow

**Publish test sensor data:**
```bash
mosquitto_pub -h localhost -t "smartbin/sensors" -m '{
  "binId": "BIN001",
  "fillLevels": [50, 75, 30],
  "temperature": 28.5,
  "humidity": 65,
  "smokeLevel": 150,
  "isActive": true,
  "fireAlert": false,
  "inFireCooldown": false
}'
```

**Check Firebase:**
- Console > Firestore > Collections > bins
- Should see document: BIN001
- Fields should match published data

### Test 3: Hardware to Dashboard

**On ESP32 Serial Monitor:**
- Should see sensor readings every 5 seconds
- Example: `Paper fill: 50%, Plastic fill: 75%, Aluminium fill: 30%`

**On Dashboard:**
- Select "BIN001" from dropdown
- Should see live sensor values updating
- Temperature, humidity, smoke level, fill percentages

### Test 4: Remote Command Execution

**Via Firebase Console:**
1. Firestore > Collections > commands
2. Click Add Document
3. Enter:
   ```
   binId: BIN001
   action: test-servo-paper
   status: pending
   issuedAt: (auto timestamp)
   ```
4. Click Save

**Check results:**
1. Bridge logs: Should show "Command published to ESP32"
2. ESP32 Serial Monitor: Should show "Testing paper slot (right hole - R90° + lid)..."
3. Physically: Rotation servo moves to 180°, lid opens/closes, returns to neutral
4. Firebase: Command status changed to "processed"

### Test 5: Complete Fire Alert System

**Trigger fire alert:**
1. Light match or incense near MQ-2 sensor
2. Wait 30 seconds for sensor to stabilize

**Hardware response (should see):**
- Buzzer beeping
- LEDs blinking
- Serial Monitor: "🔥 FIRE DETECTED!"

**Reset alarm:**
1. Press push button on hardware OR send reset command via Firebase
2. Hardware stops buzzer, LEDs off
3. System enters 10-minute cooldown
4. Serial Monitor: "Fire alarm reset - 10-min cooldown"

---


## Architecture Summary

### Component Overview

| Component | Technology | Role | Communication |
|-----------|-----------|------|-----------------|
| **Camera App** | React + TypeScript | Item detection + GPS | MQTT WebSocket |
| **Dashboard** | React + Vite + Tailwind | Monitoring + control | Firebase |
| **Hardware** | ESP32-S3 + Arduino | Sensor reading + servo control | MQTT TCP |
| **MQTT Broker** | Mosquitto | Message routing | TCP 1883 + WebSocket 9001 |
| **Database** | Firebase Firestore | Data storage + sync | REST/SDK |
| **Bridge** | Node.js | MQTT ↔ Firebase sync | Both |

### Data Lifecycle

```
1. SENSOR COLLECTION (ESP32)
   ↓ Every 5 seconds
2. PUBLISH TO MQTT (smartbin/sensors)
   ↓ Every 10 seconds over WiFi
3. BRIDGE RECEIVES (bridge.js)
   ↓ Parses JSON
4. WRITE TO FIREBASE (bins collection)
   ↓ Updates Firestore
5. REAL-TIME LISTENER (Dashboard)
   ↓ Receives update
6. UI RENDERS (React)
   ↓ Shows to user
✅ User sees live data!
```

### Security Notes
1. **Service Account Key**: Never commit to git
   ```bash
   echo "serviceAccountKey.json" >> .gitignore
   ```

2. **Firestore Rules**: Restrict access
   ```json
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /bins/{document=**} {
         allow read: if request.auth != null;
         allow write: if false;  // Bridge only
       }
       match /commands/{document=**} {
         allow write: if request.auth != null;
       }
     }
   }
   ```

3. **MQTT Authentication**: Add password
   ```bash
   sudo mosquitto_passwd -c /etc/mosquitto/passwd username
   # Then add to /etc/mosquitto/mosquitto.conf:
   # password_file /etc/mosquitto/passwd
   ```

---
