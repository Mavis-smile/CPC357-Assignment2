# 🚮 Smart Recycle Bin System - Complete Documentation

> **All-in-one setup, architecture, and troubleshooting guide for the AI-powered IoT Smart Recycle Bin with automated sorting, fire detection, and remote monitoring.**

---

## 📑 Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Prerequisites & Hardware](#prerequisites--hardware)
4. [Complete Setup Guide](#complete-setup-guide)
5. [Communication Architecture](#communication-architecture)
6. [Remote Control System](#remote-control-system)
7. [Testing & Verification](#testing--verification)
8. [Troubleshooting](#troubleshooting)

---

## Overview

### What is This System?

A complete IoT solution for intelligent waste management that:
- 🎥 **Detects** recyclable items using AI (TensorFlow.js YOLO/COCO-SSD)
- 🤖 **Sorts** items automatically using servo-controlled bins
- 🔥 **Monitors** environmental conditions (temperature, humidity, smoke)
- 🚨 **Alerts** on fire detection with 10-minute safety cooldown
- 📊 **Tracks** GPS location and detection history
- 📱 **Controls** hardware remotely from web dashboard
- ⚡ **Syncs** real-time data across all devices

### Key Features

| Feature | Details |
|---------|---------|
| **Object Detection** | TensorFlow.js model on smartphone camera |
| **4-Bin Sorting** | Paper, Plastic, Aluminium, Glass |
| **Fill Level Monitoring** | 4 independent IR sensors per bin |
| **Fire Safety** | MQ-2 smoke sensor + 10-min cooldown |
| **Environmental Monitoring** | DHT11 (temperature/humidity) |
| **Remote Control** | 4 action buttons from dashboard |
| **Real-time Sync** | Firebase Firestore with MQTT bridge |
| **GPS Tracking** | Location-based detection history |

---

## System Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SMARTPHONE (Camera Device)                      │
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
│  - 4x IR Sensors │◄───────────────────┤   │  Firestore   │   │
│  - PIR Sensor    │     Real-time      │   │  Database    │   │
│  - MQ-2 Sensor   │     Sync           │   └──────────────┘   │
│  - DHT11         │                    │   ┌──────────────┐   │
│  - 2x Servos     │                    │   │  Collections │   │
│  - 8x LEDs       │                    │   │  - bins      │   │
│  - Relay         │                    │   │  - detections│   │
│  - Push Button   │                    │   │  - commands  │   │
│  - Buzzer        │                    │   │  - alerts    │   │
└──────────────────┘                    └──────┬───────────────┘
                                               │ WiFi/Internet
                                               ▼
                                    ┌────────────────────────┐
                                    │  Dashboard Web UI      │
                                    │  (React - Vite)        │
                                    │  Project-CPC357_dashboard │
                                    │  - Real-time monitor   │
                                    │  - Remote control      │
                                    │  - Alerts & analytics  │
                                    └────────────────────────┘
```

### Data Flow Diagram

```
📱 Camera App          🎛️ ESP32 Hardware      📊 Dashboard          🔥 Firebase
    │                        │                      │                   │
    │──[WiFi]──────→ MQTT Broker ←────────────────[WiFi]─────────────────┤
    │                        │                      │                   │
    └─[WebSocket 9001]──────[TCP 1883]──────────────┘                   │
         Publish:              │                                         │
         smartbin/item         │                  Subscribe:             │
         (95% plastic)         │                  bins collection        │
                              │                  with fillLevels        │
                              │                                         │
                        Subscribe:                                      │
                        smartbin/commands         ┌───────────────→ Write
                        smartbin/item             │  Publish:
                                                  │  smartbin/sensors
                              │                   │  (temp, humidity, etc)
                              │                   │
                    Publish:   │                   ↓
                    smartbin/sensors              MQTT-Firebase
                    smartbin/alerts               Bridge Script
                              │                       │
                              └───[MQTT]──→[Node.js]──┘
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
| **IR Sensor** | 4 | Detect trash fill level per bin |
| **PIR Sensor** | 1 | Motion detection (bin activity) |
| **MQ-2 Gas Sensor** | 1 | Smoke/fire detection |
| **DHT11** | 1 | Temperature & humidity |
| **SG90 Servo** | 2 | Rotation + lid control |
| **LED** | 8 | Status indicators (4 red, 4 green) |
| **Relay Module** | 1 | Fire suppression trigger |
| **Push Button** | 1 | Manual fire alarm reset |
| **Buzzer** | 1 | Fire alert sound |
| **USB-C Cable** | 1 | Arduino programming |
| **5V Power Supply** | 2 | For servos & hardware |

### Network Requirements

- WiFi 2.4GHz (ESP32 compatible, NOT 5GHz)
- Internet connectivity for Firebase/GCP
- Port 1883 (MQTT TCP) open on GCP VM
- Port 9001 (MQTT WebSocket) open on GCP VM

---

## Complete Setup Guide

### Phase 1: Cloud Infrastructure (45 minutes)

#### Step 1️⃣: Firebase Setup (5 min)

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **Add project** → Enter name: `Smart-Recycle-Bin`
3. Disable Google Analytics → **Create project**
4. **Create Firestore Database:**
   - Click **Create database**
   - Start in **production mode**
   - Choose nearest region → **Enable**
5. **Get Firebase Config:**
   - Project Settings > General > Your apps
   - Click Web app icon `</>`
   - Register app: `smart-bin-camera`
   - Copy the entire `firebaseConfig` object
   - Save it for later (needed in `.env.local` files)
6. **Create Service Account Key:**
   - Project Settings > Service accounts
   - Click **Generate new private key**
   - Download as JSON
   - Rename to `serviceAccountKey.json`

#### Step 2️⃣: GCP VM Setup (10 min)

**Create VM Instance:**
```bash
# Via Google Cloud Console:
1. Compute Engine > VM instances > CREATE INSTANCE
2. Name: smart-bin-mqtt
3. Region: us-central1 (or nearest to you)
4. Machine type: e2-micro (free tier eligible)
5. Boot disk: Ubuntu 22.04 LTS, 10GB
6. Firewall: ✅ Allow HTTP, ✅ Allow HTTPS
7. Click CREATE
```

**Configure Firewall Rules:**
```bash
# Allow MQTT (TCP 1883) for ESP32
gcloud compute firewall-rules create allow-mqtt \
  --allow tcp:1883 \
  --description "MQTT for ESP32"

# Allow WebSocket (TCP 9001) for camera browser app
gcloud compute firewall-rules create allow-mqtt-ws \
  --allow tcp:9001 \
  --description "MQTT WebSocket for camera app"
```

**SSH into VM and Install Mosquitto:**
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Mosquitto MQTT broker
sudo apt install mosquitto mosquitto-clients -y

# Edit Mosquitto configuration
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

#### Step 3️⃣: Install Node.js (5 min)

```bash
# Add Node.js 18 repository
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version  # v18.x.x
npm --version   # 9.x.x or higher
```

#### Step 4️⃣: Create MQTT-Firebase Bridge (15 min)

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
# From your computer, upload bridge.js
scp bridge.js username@YOUR_GCP_VM_EXTERNAL_IP:~/mqtt-firebase-bridge/

# Upload Firebase service account key
scp serviceAccountKey.json username@YOUR_GCP_VM_EXTERNAL_IP:~/mqtt-firebase-bridge/
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

Paste this content:
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

---

### Phase 2: Hardware Setup (20 minutes)

#### Step 5️⃣: Arduino IDE & ESP32 Board

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

#### Step 6️⃣: Configure & Upload project.ino

**Open firmware in Arduino IDE**

Open the firmware file at:

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
1. Tools > Board > ESP32S3 Dev Module
2. Tools > Port > (select your COM port)
3. Tools > Upload Speed > 921600

**Upload:**
- Click Upload button (→) or Ctrl+U
- Wait for "Hard resetting via RTS pin..."
- Should see "✓ Success"

**Verify in Serial Monitor:**
1. Tools > Serial Monitor
2. Set baud rate: 115200
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

### Phase 3: Web Applications (15 minutes)

#### Step 7️⃣: Camera App Setup

```bash
cd Project-CPC357_cam

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

**Edit `.env.local` with your Firebase config:**
```env
VITE_MQTT_BROKER_URL=ws://YOUR_GCP_VM_EXTERNAL_IP:9001

# Firebase configuration from step 1
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef...
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

Note: The camera app uses `BIN001` as the standardized bin identifier to match the hardware firmware and bridge.

**Run locally:**
```bash
npm run dev
# Access from phone: http://YOUR_COMPUTER_IP:5173
```

**Or deploy to Firebase Hosting:**
```bash
npm install -g firebase-tools
firebase login
npm run build
firebase deploy
# Access from: https://your-project.web.app
```

#### Step 8️⃣: Dashboard Setup

```bash
cd Project-CPC357_dashboard

# Install dependencies
npm install

# Verify .env.local exists with Firebase config
# (Same Firebase config as camera app)
```

**Add Google Maps API key to `.env.local`:**
```env
VITE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```

**Run locally:**
```bash
npm run dev
# Open browser: http://localhost:5173
```

---

## Communication Architecture

### Detailed Communication Flows

#### Flow 1: Camera → Hardware (Item Detection)

**What Happens:**
1. User holds item near camera
2. TensorFlow.js model detects: "plastic bottle - 95% confidence"
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
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, MQTT_TOPIC_ITEM_DETECTED) == 0) {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, payload);
    
    String category = doc["category"];  // "plastic"
    
    if (category == "plastic") {
      rotateServo.write(90);   // Move to plastic bin
      lidServo.write(90);      // Open lid
      delay(2000);
      lidServo.write(0);       // Close lid
    }
  }
}
```

#### Flow 2: Hardware → Dashboard (Sensor Data)

**What Happens:**
1. ESP32 reads all sensors every 10 seconds
2. Publishes JSON to `smartbin/sensors` topic
3. MQTT bridge receives and writes to Firebase
4. Dashboard listens to Firebase Firestore
5. UI updates in real-time with new values ✅

**MQTT Message:**
```json
{
  "binId": "BIN001",
  "fillLevels": [30, 75, 20, 60],
  "temperature": 28.5,
  "humidity": 65.0,
  "smokeLevel": 150,
  "isActive": true,
  "timestamp": 1640000000000
}
```

**Firebase Result:**
```
Collection: bins
Document: BIN001
{
  binId: "BIN001"
  fillLevels: [30, 75, 20, 60]
  temperature: 28.5
  humidity: 65.0
  smokeLevel: 150
  isActive: true
  updatedAt: Dec 20, 2024 10:30 AM
}
```

#### Flow 3: Dashboard → Hardware (Remote Commands)

**What Happens:**
1. User clicks "Reset Alarm" button
2. Dashboard writes to Firebase `commands` collection
3. Bridge script detects new command
4. Bridge publishes to `smartbin/commands` via MQTT
5. ESP32 receives and executes command
6. Buzzer stops, fire cooldown starts ✅

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
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, MQTT_TOPIC_COMMANDS) == 0) {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, payload);
    
    String action = doc["action"];
    
    if (action == "reset-alarm") {
      fireAlertActive = false;
      inFireCooldown = true;
      fireCooldownStart = millis();
      noTone(BUZZER_PIN);
      digitalWrite(RELAY_PIN, LOW);
      
      Serial.println("✅ Fire alarm reset - 10-min cooldown");
    }
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
| **Test Servo** | `test-servo` | Rotates both servos through full range | `{"action":"test-servo"}` |
| **Maintenance** | `maintenance-mode` | Disables sensor alerts and detections | `{"action":"maintenance-mode"}` |

#### Complete Control Flow

```
User Action: Click "Test Servo"
    ↓
Dashboard.sendCommand('test-servo')
    ↓ Writes to Firebase
Collection: commands
Document: {
  binId: "BIN001",
  action: "test-servo",
  status: "pending",
  issuedAt: timestamp
}
    ↓
Bridge.js onSnapshot listener
    ↓ Detects new pending command
Bridge publishes to MQTT topic: smartbin/commands
Payload: {
  "binId": "BIN001",
  "action": "test-servo",
  "timestamp": 1640000000000
}
    ↓
ESP32 mqttCallback receives message
    ↓ Parses JSON
if (action == "test-servo") {
  // Move rotation servo: 0° → 90° → 180° → 0°
  // Move lid servo: 0° → 90° → 0°
  Serial.println("Servo test complete");
}
    ↓
Hardware executes
    ↓ Servos rotate visibly
User sees result + Serial Monitor confirmation
✅ System working!
```

#### Integration Points

**Dashboard (App.tsx):**
```typescript
// Lines 220-240
const sendCommand = async (action: string) => {
  if (!selectedBin) return
  setIsSendingCmd(true)
  
  try {
    await addDoc(collection(db, 'commands'), {
      binId: selectedBin,
      action: action,
      issuedAt: serverTimestamp(),
      status: 'pending'
    })
    
    setActionMessage(`${action} command sent to ${selectedBin}`)
  } catch (err) {
    setActionMessage('Failed to send command')
  } finally {
    setIsSendingCmd(false)
  }
}
```

**Bridge Script (bridge.js):**
```javascript
// Listens to Firebase commands collection
db.collection('commands')
  .where('status', '==', 'pending')
  .onSnapshot(snapshot => {
    snapshot.docChanges().forEach(async change => {
      if (change.type === 'added') {
        const { binId, action } = change.doc.data()
        
        // Publish to MQTT
        mqttClient.publish('smartbin/commands', JSON.stringify({
          binId, action, timestamp: Date.now()
        }))
        
        // Mark processed
        await change.doc.ref.update({ status: 'processed' })
      }
    })
  })
```

**Hardware (project.ino):**
```cpp
// Lines ~350
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  if (strcmp(topic, MQTT_TOPIC_COMMANDS) == 0) {
    StaticJsonDocument<256> doc;
    deserializeJson(doc, payload);
    
    String action = doc["action"];
    
    if (action == "reset-alarm") {
      handleResetAlarm();
    }
    else if (action == "mark-emptied") {
      handleMarkEmptied();
    }
    else if (action == "test-servo") {
      handleTestServo();
    }
    else if (action == "maintenance-mode") {
      handleMaintenanceMode();
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
  "fillLevels": [50, 75, 30, 60],
  "temperature": 28.5,
  "humidity": 65,
  "smokeLevel": 150,
  "isActive": true
}'
```

**Check Firebase:**
- Console > Firestore > Collections > bins
- Should see document: BIN001
- Fields should match published data

### Test 3: Hardware to Dashboard

**On ESP32 Serial Monitor:**
- Should see sensor readings every 10 seconds
- Example: `[Sensors] T=28.5°C, H=65%, Fill=[50,75,30,60]`

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
   action: test-servo
   status: pending
   issuedAt: (auto timestamp)
   ```
4. Click Save

**Check results:**
1. Bridge logs: Should show "Command published to ESP32"
2. ESP32 Serial Monitor: Should show servo movement
3. Physically: Servos should rotate
4. Firebase: Command status changed to "processed"

### Test 5: Complete Fire Alert System

**Trigger fire alert:**
1. Light match or incense near MQ-2 sensor
2. Wait 30 seconds for sensor to stabilize

**Hardware response (should see):**
- Buzzer beeping
- All LEDs blinking
- Relay clicking on
- Serial Monitor: "🔥 FIRE DETECTED!"

**Dashboard response:**
- Red pulsing banner: "FIRE ALERT DETECTED!"
- Shows temperature and smoke level
- "Reset Alarm" button available

**Reset alarm:**
1. Click "Reset Alarm" button OR press push button
2. Hardware stops buzzer, LEDs off
3. System enters 10-minute cooldown
4. Dashboard banner disappears
5. Serial Monitor: "Fire alarm reset - 10-min cooldown"

### System Status Checklist

- [ ] GCP VM running and accessible
- [ ] Mosquitto MQTT broker active (ports 1883, 9001)
- [ ] MQTT-Firebase bridge service running
- [ ] ESP32 connected to WiFi
- [ ] ESP32 connected to MQTT
- [ ] Camera app shows "Hardware Connected" (green)
- [ ] Dashboard displays bin data
- [ ] Servo responds to item detection
- [ ] Fire alert triggers correctly
- [ ] Remote commands execute properly

---

## Troubleshooting

### General Debugging

**Check bridge logs in real-time:**
```bash
sudo journalctl -u mqtt-bridge -f
```

**Monitor all MQTT topics:**
```bash
mosquitto_sub -h localhost -t "smartbin/#" -v
```

**Test MQTT connectivity:**
```bash
mosquitto_pub -h localhost -t "smartbin/test" -m "hello"
# If no error, MQTT is working
```

### Common Issues & Solutions

#### Issue: "serviceAccountKey.json not found"

**Solution:**
```bash
# Verify file exists
ls -la ~/mqtt-firebase-bridge/serviceAccountKey.json

# If missing, upload it
scp serviceAccountKey.json username@YOUR_VM_IP:~/mqtt-firebase-bridge/

# Check permissions
sudo chown $USER:$USER ~/mqtt-firebase-bridge/serviceAccountKey.json
```

#### Issue: "Cannot connect to MQTT broker"

**Solution:**
```bash
# Check Mosquitto is running
sudo systemctl status mosquitto

# Restart if needed
sudo systemctl restart mosquitto

# Test basic connectivity
mosquitto_sub -h localhost -t "test"
```

#### Issue: "Firebase authentication failed"

**Solution:**
```bash
# Verify service account key is valid
cat ~/mqtt-firebase-bridge/serviceAccountKey.json
# Should contain: "type": "service_account", "project_id", "private_key"

# Check Firebase project ID in config matches
```

#### Issue: "Dashboard not showing data"

**Debug steps:**
1. Check Firebase Firestore rules allow read access
   - Go to Firestore > Rules
   - Should allow `allow read, write: if true;` for testing
2. Check browser console for errors (F12)
3. Verify bins collection exists in Firestore
4. Check bridge is updating Firebase (look at timestamps)

#### Issue: "ESP32 won't connect to WiFi"

**Solution:**
```cpp
// In project.ino, check:
1. WiFi SSID is 2.4GHz (NOT 5GHz)
2. Password is correct
3. Ensure quotes around SSID/password strings
4. Try moving closer to router
5. Restart ESP32 (press EN button)
```

**Serial output to verify:**
```
WiFi connecting to: YOUR_SSID
Attempt 1... 
✓ WiFi connected!
IP: 192.168.x.x
```

#### Issue: "Hardware doesn't respond to remote commands"

**Debug flow:**
```bash
# Terminal 1: Watch bridge logs
sudo journalctl -u mqtt-bridge -f

# Terminal 2: Watch MQTT commands topic
mosquitto_sub -h localhost -t "smartbin/commands" -v

# Terminal 3 (Firebase Console): Add test command
# If all show activity, problem is on ESP32 side
# Check: Is ESP32 subscribed to smartbin/commands?
```

#### Issue: "Servo not moving"

**Check:**
1. External 5V power supply connected to servo?
2. Servo signal pins correct (GPIO 13, 14)?
3. Servo library installed? (ESP32Servo v3.0+)
4. Test with "Test Servo" command from dashboard

**Verify in code:**
```cpp
// Check servo initialization
rotateServo.attach(ROTATION_SERVO_PIN);  // GPIO 13
lidServo.attach(LID_SERVO_PIN);          // GPIO 14

// Both should print: "Servo attached"
```

### Monitoring Commands

**Watch ESP32 Serial Output:**
```
Arduino IDE > Tools > Serial Monitor (115200 baud)
```

**Watch Bridge Service:**
```bash
sudo journalctl -u mqtt-bridge -f -n 50
```

**Check Firebase Activity:**
- Console > Firestore > click on document
- Check "Last modified" timestamp
- Should update when data published

**Check MQTT Message Flow:**
```bash
# Subscribe to all smartbin topics with timestamps
mosquitto_sub -h localhost -t "smartbin/#" -v
```

### Performance Optimization

**If dashboard slow:**
```javascript
// In bridge.js, add batching
// Only update Firebase every 10 seconds instead of every publish
```

**If ESP32 running out of memory:**
```cpp
// Reduce JSON document size
// Use StaticJsonDocument<128> instead of <256>
```

**If MQTT losing messages:**
```bash
# In Mosquitto config, add persistence
# persistence true
# persistence_location /var/lib/mosquitto/
```

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
   ↓ Every 10 seconds
2. PUBLISH TO MQTT (smartbin/sensors)
   ↓ Over WiFi
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

⚠️ **For Production:**

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

## Quick Reference

### File Locations

**Your Computer:**
```
Project/
├── Project-CPC357_cam/          (Camera app)
│   └── src/
│       ├── mqttClient.ts        (MQTT WebSocket)
│       └── TrashDetection.tsx   (Detection logic)
├── Project-CPC357_dashboard/    (Dashboard app)
│   └── src/App.tsx              (Remote control)
└── project.ino                  (Hardware firmware)
```

**GCP VM:**
```
/home/username/
└── mqtt-firebase-bridge/
    ├── bridge.js
    ├── package.json
    ├── serviceAccountKey.json
    └── node_modules/
```

### Important URLs/IPs

- **Firebase Console**: https://console.firebase.google.com/
- **GCP Console**: https://console.cloud.google.com/
- **Camera App**: http://YOUR_COMPUTER_IP:5173
- **Dashboard**: http://localhost:5173
- **MQTT Broker**: YOUR_GCP_VM_EXTERNAL_IP:1883
- **MQTT WebSocket**: ws://YOUR_GCP_VM_EXTERNAL_IP:9001

### Essential Commands

```bash
# Check bridge service
sudo systemctl status mqtt-bridge

# Restart bridge
sudo systemctl restart mqtt-bridge

# View bridge logs
sudo journalctl -u mqtt-bridge -f

# Test MQTT
mosquitto_pub -h localhost -t "smartbin/test" -m "hello"
mosquitto_sub -h localhost -t "smartbin/#" -v

# Build apps
cd Project-CPC357_cam && npm run build
cd Project-CPC357_dashboard && npm run build
```

---

## Support & Next Steps

### You've Successfully Set Up:

✅ Cloud infrastructure (GCP VM + Mosquitto)
✅ Real-time database (Firebase Firestore)
✅ Hardware controller (ESP32 with all sensors)
✅ Camera application (Object detection + MQTT)
✅ Dashboard (Monitoring + remote control)
✅ MQTT-Firebase bridge (Data synchronization)

### Next Steps:

1. **Calibrate sensors** for your specific environment
2. **Train detection model** with more item examples
3. **Deploy apps** to Firebase Hosting for production
4. **Set up monitoring** for system health
5. **Add features**: Email alerts, analytics, scheduling

### Performance Metrics

After setup, monitor:
- **MQTT latency**: Should be <200ms
- **Firebase sync time**: Should be <1s
- **Servo response time**: Should be <2s
- **Camera detection**: Should be >90% accuracy

---

## 🎉 Congratulations!

Your Smart Recycle Bin system is now **fully operational**! 

You can now:
- 📱 Detect items with camera on smartphone
- 🤖 Automatically sort into correct bins
- 🔥 Monitor fire alerts in real-time
- 📊 View dashboard from any browser
- 🎮 Control hardware remotely
- 📍 Track GPS location of detections
- 💾 Store data in Firebase for analysis

**Happy recycling!** ♻️🌍🚮

---

**Last Updated:** December 29, 2024
**Version:** 1.0
**Status:** Production Ready ✅
