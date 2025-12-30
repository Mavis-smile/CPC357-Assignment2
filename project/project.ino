/*
 * Smart Recycle Bin - IoT Project
 * AIoT Maker Feather S3 MCU (Built-in Buzzer)
 * 
 * Components:
 * - 4x Infrared Sensors (Waste level detection - bin full/not full)
 * - 1x PIR Motion Sensor (User presence detection - power on/off)
 * - 1x MQ-2 Smoke Sensor (Smoke/flammable gas detection)
 * - 1x DHT11 (Temperature & Humidity monitoring)
 * - 2x SG90 Micro Servo (Rotate container & open bottom lid)
 * - 4x Red LEDs (Bin full indicators)
 * - 4x Green LEDs (Bin available indicators)
 * - 1x Push Button (Manual reset/alarm acknowledge)
 * - Smartphone (Camera web UI for object detection & GPS location)
 * 
 * Communication Flow:
 * Camera Web (Smartphone) → MQTT → MCU (item detection for servo)
 * MCU → MQTT → GCP VM → Firebase (sensor data + GPS from phone)
 * Dashboard Web → Firebase → MQTT → MCU (remote commands)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ESP32Servo.h>
#include <ArduinoJson.h>

// ==================== PIN DEFINITIONS ====================
// Infrared Sensors (Waste level detection)
#define IR_PAPER_PIN      6   // GPIO6 (IR1)
#define IR_PLASTIC_PIN    4   // GPIO4 (IR2)
#define IR_ALUMINIUM_PIN  48  // GPIO42 (IR3)
#define IR_GLASS_PIN      7   // GPIO7 (IR4)

// PIR Motion Sensor (Digital)
#define PIR_PIN           15  // GPIO15

// MQ-2 Smoke Sensor (Analog) - A0
#define SMOKE_PIN         10  // GPIO10 (A0/D10)

// DHT11 Sensor (Digital)
#define DHT_PIN           21  // GPIO21
#define DHT_TYPE          DHT11

// Servo Motors (PWM)
#define SERVO_ROTATE_PIN  5  // GPIO5 - Container rotation servo
#define SERVO_LID_PIN     39  // GPIO39 - Bottom lid opening servo

// Red LEDs (Bin full indicators) - Digital outputs
#define LED_RED_PAPER_PIN     18  // GPIO18 (SCK)
#define LED_RED_PLASTIC_PIN   8   // GPIO8
#define LED_RED_ALUMINIUM_PIN 9   // GPIO9
#define LED_RED_GLASS_PIN     11  // GPIO11

// Green LEDs (Bin available indicators) - Digital outputs
#define LED_GREEN_PAPER_PIN     MOSI  // MOSI pin
#define LED_GREEN_PLASTIC_PIN   16    // GPIO16
#define LED_GREEN_ALUMINIUM_PIN 17    // GPIO17
#define LED_GREEN_GLASS_PIN     1     // GPIO1

// Push Button (Digital input with pull-up)
#define BUTTON_PIN        14  // GPIO14

// Buzzer (Built-in PWM) - No external pin needed, using internal
#define BUZZER_PIN        12  // Built-in buzzer on Maker Feather AIoT S3

// ==================== WIFI & MQTT CONFIGURATION ====================
const char* WIFI_SSID = "YOUR-WIFI-SSID";           // Replace with your WiFi SSID
const char* WIFI_PASSWORD = "YOUR-WIFI-PASSWORD";   // Replace with your WiFi password
const char* MQTT_SERVER = "YOUR-MQTT-SERVER";         // Replace with your GCP VM IP
const int MQTT_PORT = 1883;
const char* MQTT_CLIENT_ID = "SmartRecycleBin_ESP32";

// MQTT Topics
const char* MQTT_TOPIC_SENSOR_DATA = "smartbin/sensors";     // Publish sensor data
const char* MQTT_TOPIC_ITEM_DETECTED = "smartbin/item";      // Subscribe to camera detections
const char* MQTT_TOPIC_COMMANDS = "smartbin/commands";       // Subscribe to dashboard commands
const char* MQTT_TOPIC_ALERTS = "smartbin/alerts";           // Publish fire/smoke alerts

// ==================== GLOBAL OBJECTS ====================
WiFiClient espClient;
PubSubClient mqttClient(espClient);
DHT dht(DHT_PIN, DHT_TYPE);
Servo rotateServo;  // Container rotation
Servo lidServo;     // Bottom lid control

// ==================== CONFIGURATION CONSTANTS ====================
// Circular bin with 4 compartments (square layout)
// Neutral position: 90° (straight up)
// Layout:
//        TOP (90°)
//   TL       TR
// 135°   90°   45°
//        
// L(180°)     R(0°)
//
// BL       BR
// 135°   90°   45°
//        BOT

// Servo angles for container rotation (4 compartments - square layout)
const int SERVO_ROTATE_NEUTRAL = 90;      // Center/straight up
const int SERVO_ROTATE_TOP_RIGHT = 45;    // Paper - top right (45° right)
const int SERVO_ROTATE_BOTTOM_RIGHT = 0;  // Plastic - bottom right (90° right)
const int SERVO_ROTATE_BOTTOM_LEFT = 180; // Aluminium - bottom left (90° left)
const int SERVO_ROTATE_TOP_LEFT = 135;    // Glass - top left (45° left)

// Servo angles for lid control
const int SERVO_LID_OPEN = 90;    // Open bottom to release waste
const int SERVO_LID_CLOSED = 0;   // Close bottom lid

// IR sensor thresholds (adjust based on your sensor calibration)
const int IR_THRESHOLD = 500;  // If analog value > threshold, bin is getting full

// MQ-2 Smoke sensor threshold (adjust after 2-3 min warm-up)
const int SMOKE_THRESHOLD = 300;  // Typical range: 200-400 for smoke detection

// Temperature threshold (°C)
const float TEMP_THRESHOLD = 50.0;

// Buzzer patterns (in Hz)
const int BUZZER_FREQ_NON_RECYCLABLE = 1000;
const int BUZZER_FREQ_FIRE_ALERT = 2000;

// Timing intervals (milliseconds)
const unsigned long SENSOR_READ_INTERVAL = 5000;      // Read sensors every 5 seconds
const unsigned long MQTT_PUBLISH_INTERVAL = 10000;    // Publish to MQTT every 10 seconds
const unsigned long PIR_IDLE_TIMEOUT = 60000;         // 1 minute no motion = idle mode
const unsigned long FIRE_COOLDOWN_PERIOD = 600000;    // 10 minutes cooldown after fire reset

// ==================== STATE VARIABLES ====================
String binId = "BIN001";  // Unique bin identifier
bool isActive = false;     // Bin operating state (PIR activated)
bool isMaintenanceMode = false;
bool fireAlertActive = false;
bool inFireCooldown = false;  // Cooldown mode after fire reset
int fillLevels[4] = {0, 0, 0, 0};  // Fill levels for [Paper, Plastic, Aluminium, Glass]

unsigned long lastSensorRead = 0;
unsigned long lastMqttPublish = 0;
unsigned long lastPirDetection = 0;
unsigned long lastFireAlert = 0;
unsigned long fireCooldownStart = 0;  // When fire cooldown started
unsigned long lastButtonPress = 0;     // Debounce for button

float currentTemp = 0;
float currentHumidity = 0;
int smokeLevel = 0;
int lastButtonState = HIGH;  // Button state (pulled up)

// ==================== SETUP ====================
void setup() {
  Serial.begin(115200);
  Serial.println("\n\n=== Smart Recycle Bin Starting ===");
  
  // Initialize pins
  setupPins();
  
  // Initialize DHT sensor
  dht.begin();
  
  // Initialize Servos
  rotateServo.attach(SERVO_ROTATE_PIN);
  lidServo.attach(SERVO_LID_PIN);
  rotateServo.write(SERVO_ROTATE_NEUTRAL);
  lidServo.write(SERVO_LID_CLOSED);
  
  // Connect to WiFi
  setupWiFi();
  
  // Setup MQTT
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);  // Increase buffer for JSON messages
  
  // Connect to MQTT
  reconnectMQTT();
  
  // Startup indicator
  playStartupTone();
  blinkAllLeds(3);
  
  Serial.println("=== System Ready ===\n");
}

// ==================== MAIN LOOP ====================
void loop() {
  // Maintain MQTT connection
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();
  
  unsigned long currentMillis = millis();
  
  // Check push button for manual reset
  checkPushButton(currentMillis);
  
  // Read PIR sensor for presence detection
  checkPirSensor(currentMillis);
  
  // Only process sensors if bin is active or in maintenance mode
  if (isActive || isMaintenanceMode) {
    // Read sensors periodically
    if (currentMillis - lastSensorRead >= SENSOR_READ_INTERVAL) {
      readAllSensors();
      lastSensorRead = currentMillis;
    }
    
    // Publish sensor data to MQTT
    if (currentMillis - lastMqttPublish >= MQTT_PUBLISH_INTERVAL) {
      publishSensorData();
      lastMqttPublish = currentMillis;
    }
    
    // Check for fire/smoke conditions
    checkFireConditions(currentMillis);
  }
  
  // Update LED indicators based on fill levels
  updateLedIndicators();
  
  delay(100);  // Small delay to prevent CPU overload
}

// ==================== PIN SETUP ====================
void setupPins() {
  // IR sensors as INPUT
  pinMode(IR_PAPER_PIN, INPUT);
  pinMode(IR_PLASTIC_PIN, INPUT);
  pinMode(IR_ALUMINIUM_PIN, INPUT);
  pinMode(IR_GLASS_PIN, INPUT);
  
  // PIR sensor as INPUT
  pinMode(PIR_PIN, INPUT);
  
  // Smoke sensor as INPUT
  pinMode(SMOKE_PIN, INPUT);
  
  // Push button as INPUT_PULLUP
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  
  // Red LEDs as OUTPUT
  pinMode(LED_RED_PAPER_PIN, OUTPUT);
  pinMode(LED_RED_PLASTIC_PIN, OUTPUT);
  pinMode(LED_RED_ALUMINIUM_PIN, OUTPUT);
  pinMode(LED_RED_GLASS_PIN, OUTPUT);
  
  // Green LEDs as OUTPUT
  pinMode(LED_GREEN_PAPER_PIN, OUTPUT);
  pinMode(LED_GREEN_PLASTIC_PIN, OUTPUT);
  pinMode(LED_GREEN_ALUMINIUM_PIN, OUTPUT);
  pinMode(LED_GREEN_GLASS_PIN, OUTPUT);
  
  // Buzzer as OUTPUT
  pinMode(BUZZER_PIN, OUTPUT);
  
  // Set all LEDs to initial state
  digitalWrite(LED_RED_PAPER_PIN, LOW);
  digitalWrite(LED_RED_PLASTIC_PIN, LOW);
  digitalWrite(LED_RED_ALUMINIUM_PIN, LOW);
  digitalWrite(LED_RED_GLASS_PIN, LOW);
  
  digitalWrite(LED_GREEN_PAPER_PIN, HIGH);  // Green on initially
  digitalWrite(LED_GREEN_PLASTIC_PIN, HIGH);
  digitalWrite(LED_GREEN_ALUMINIUM_PIN, HIGH);
  digitalWrite(LED_GREEN_GLASS_PIN, HIGH);
}

// ==================== WIFI CONNECTION ====================
void setupWiFi() {
  delay(10);
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nWiFi connection failed!");
  }
}

// ==================== MQTT CONNECTION ====================
void reconnectMQTT() {
  int attempts = 0;
  while (!mqttClient.connected() && attempts < 5) {
    Serial.print("Attempting MQTT connection...");
    
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println("Connected to MQTT!");
      
      // Subscribe to topics
      mqttClient.subscribe(MQTT_TOPIC_ITEM_DETECTED);
      mqttClient.subscribe(MQTT_TOPIC_COMMANDS);
      
      Serial.println("Subscribed to topics:");
      Serial.println("  - " + String(MQTT_TOPIC_ITEM_DETECTED));
      Serial.println("  - " + String(MQTT_TOPIC_COMMANDS));
      
    } else {
      Serial.print("Failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" Retrying in 5 seconds...");
      delay(5000);
      attempts++;
    }
  }
}

// ==================== MQTT CALLBACK ====================
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.println("Message received on topic: " + String(topic));
  Serial.println("Message: " + message);
  
  // Handle item detection from camera
  if (strcmp(topic, MQTT_TOPIC_ITEM_DETECTED) == 0) {
    handleItemDetection(message);
  }
  
  // Handle dashboard commands
  if (strcmp(topic, MQTT_TOPIC_COMMANDS) == 0) {
    handleCommand(message);
  }
}

// ==================== ITEM DETECTION HANDLER ====================
void handleItemDetection(String message) {
  // Parse JSON: {"binId":"BIN001","category":"plastic","itemClass":"bottle","confidence":95}
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.println("Failed to parse item detection JSON");
    return;
  }
  
  String receivedBinId = doc["binId"] | "";
  String category = doc["category"] | "unknown";
  
  // Only process if message is for this bin
  if (receivedBinId != binId) {
    return;
  }
  
  Serial.println("Item detected: " + category);
  
  // Move rotation servo based on category
  if (category == "paper") {
    rotateServo.write(SERVO_ROTATE_TOP_RIGHT);
    Serial.println("Servo → Paper bin - Top Right (45°)");
  } 
  else if (category == "plastic") {
    rotateServo.write(SERVO_ROTATE_BOTTOM_RIGHT);
    Serial.println("Servo → Plastic bin - Bottom Right (0°)");
  } 
  else if (category == "aluminium") {
    rotateServo.write(SERVO_ROTATE_BOTTOM_LEFT);
    Serial.println("Servo → Aluminium bin - Bottom Left (180°)");
  } 
  else if (category == "glass") {
    rotateServo.write(SERVO_ROTATE_TOP_LEFT);
    Serial.println("Servo → Glass bin - Top Left (135°)");
  } 
  else {
    // Non-recyclable item
    Serial.println("Non-recyclable item detected!");
    playNonRecyclableBuzzer();
    return;  // Don't open lid for non-recyclable
  }
  
  // Wait for rotation to complete
  delay(1000);
  
  // Open bottom lid to release waste
  lidServo.write(SERVO_LID_OPEN);
  Serial.println("Bottom lid opened");
  delay(2000);  // Keep open for 2 seconds
  
  // Close lid
  lidServo.write(SERVO_LID_CLOSED);
  Serial.println("Bottom lid closed");
  
  // Return to neutral position
  delay(500);
  rotateServo.write(SERVO_ROTATE_NEUTRAL);
}

// ==================== COMMAND HANDLER ====================
void handleCommand(String message) {
  // Parse JSON: {"binId":"BIN001","action":"reset-alarm"}
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, message);
  
  if (error) {
    Serial.println("Failed to parse command JSON");
    return;
  }
  
  String receivedBinId = doc["binId"] | "";
  String action = doc["action"] | "";
  
  // Only process if command is for this bin
  if (receivedBinId != binId) {
    return;
  }
  
  Serial.println("Command received: " + action);
  
  if (action == "reset-alarm") {
    // Stop fire alert and start cooldown period
    fireAlertActive = false;
    inFireCooldown = true;
    fireCooldownStart = millis();
    noTone(BUZZER_PIN);
    
    // Turn off all red LEDs during cooldown
    digitalWrite(LED_RED_PAPER_PIN, LOW);
    digitalWrite(LED_RED_PLASTIC_PIN, LOW);
    digitalWrite(LED_RED_ALUMINIUM_PIN, LOW);
    digitalWrite(LED_RED_GLASS_PIN, LOW);
    
    Serial.println("Fire alarm reset - Starting 10-minute cooldown");
    Serial.println("Sensors paused to allow smoke to dissipate");
  }
  else if (action == "mark-emptied") {
    // Reset all fill levels
    fillLevels[0] = 0;
    fillLevels[1] = 0;
    fillLevels[2] = 0;
    fillLevels[3] = 0;
    Serial.println("Bin marked as emptied - all fill levels reset to 0%");
    publishSensorData();  // Immediately publish updated data
  }
  else if (action == "test-servo") {
    // Cycle through all 4 compartments (square layout)
    Serial.println("Testing servos - cycling through 4 compartments...");
    
    // Top Right (Paper) - 45°
    rotateServo.write(SERVO_ROTATE_TOP_RIGHT);
    Serial.println("→ Top Right (45°)");
    delay(1000);
    
    // Bottom Right (Plastic) - 0°
    rotateServo.write(SERVO_ROTATE_BOTTOM_RIGHT);
    Serial.println("→ Bottom Right (0°)");
    delay(1000);
    
    // Bottom Left (Aluminium) - 180°
    rotateServo.write(SERVO_ROTATE_BOTTOM_LEFT);
    Serial.println("→ Bottom Left (180°)");
    delay(1000);
    
    // Top Left (Glass) - 135°
    rotateServo.write(SERVO_ROTATE_TOP_LEFT);
    Serial.println("→ Top Left (135°)");
    delay(1000);
    
    // Return to neutral
    rotateServo.write(SERVO_ROTATE_NEUTRAL);
    Serial.println("→ Neutral (90°)");
    delay(500);
    
    // Test lid servo
    Serial.println("Testing lid servo...");
    lidServo.write(SERVO_LID_OPEN);
    delay(1000);
    lidServo.write(SERVO_LID_CLOSED);
    Serial.println("Servo test complete");
  }
  else if (action == "maintenance-mode") {
    // Toggle maintenance mode
    isMaintenanceMode = !isMaintenanceMode;
    Serial.println("Maintenance mode: " + String(isMaintenanceMode ? "ON" : "OFF"));
    
    if (isMaintenanceMode) {
      // Disable alerts
      fireAlertActive = false;
      noTone(BUZZER_PIN);
    }
  }
}

// ==================== PUSH BUTTON CHECK ====================
void checkPushButton(unsigned long currentMillis) {
  int buttonState = digitalRead(BUTTON_PIN);
  
  // Button pressed (LOW due to INPUT_PULLUP) with debounce
  if (buttonState == LOW && lastButtonState == HIGH && 
      (currentMillis - lastButtonPress > 500)) {
    
    lastButtonPress = currentMillis;
    
    if (fireAlertActive) {
      // Manual reset of fire alarm
      fireAlertActive = false;
      inFireCooldown = true;
      fireCooldownStart = currentMillis;
      noTone(BUZZER_PIN);
      
      // Turn off all red LEDs
      digitalWrite(LED_RED_PAPER_PIN, LOW);
      digitalWrite(LED_RED_PLASTIC_PIN, LOW);
      digitalWrite(LED_RED_ALUMINIUM_PIN, LOW);
      digitalWrite(LED_RED_GLASS_PIN, LOW);
      
      Serial.println("[BUTTON] Fire alarm manually reset - 10-min cooldown started");
    } else {
      Serial.println("[BUTTON] Button pressed - No active alarm");
    }
  }
  
  lastButtonState = buttonState;
}

// ==================== PIR SENSOR CHECK ====================
void checkPirSensor(unsigned long currentMillis) {
  if (isMaintenanceMode) {
    return;  // Skip PIR when in maintenance mode
  }
  
  int pirState = digitalRead(PIR_PIN);
  
  if (pirState == HIGH) {
    // Motion detected
    if (!isActive) {
      Serial.println("Motion detected - Bin ACTIVE");
      isActive = true;
    }
    lastPirDetection = currentMillis;
  } else {
    // No motion - check if idle timeout reached
    if (isActive && (currentMillis - lastPirDetection > PIR_IDLE_TIMEOUT)) {
      Serial.println("No motion detected - Bin IDLE");
      isActive = false;
    }
  }
}

// ==================== READ ALL SENSORS ====================
void readAllSensors() {
  // Read IR sensors (trash fill levels)
  // Converting analog reading to percentage (0-100%)
  int irPaper = analogRead(IR_PAPER_PIN);
  int irPlastic = analogRead(IR_PLASTIC_PIN);
  int irAluminium = analogRead(IR_ALUMINIUM_PIN);
  int irGlass = analogRead(IR_GLASS_PIN);
  
  // Convert to percentage (inverted: higher reading = fuller bin)
  // Adjust this formula based on your sensor calibration
  fillLevels[0] = map(irPaper, 0, 4095, 0, 100);
  fillLevels[1] = map(irPlastic, 0, 4095, 0, 100);
  fillLevels[2] = map(irAluminium, 0, 4095, 0, 100);
  fillLevels[3] = map(irGlass, 0, 4095, 0, 100);
  
  // Constrain values
  fillLevels[0] = constrain(fillLevels[0], 0, 100);
  fillLevels[1] = constrain(fillLevels[1], 0, 100);
  fillLevels[2] = constrain(fillLevels[2], 0, 100);
  fillLevels[3] = constrain(fillLevels[3], 0, 100);
  
  // Read DHT11
  currentTemp = dht.readTemperature();
  currentHumidity = dht.readHumidity();
  
  // Read smoke sensor
  smokeLevel = analogRead(SMOKE_PIN);
  
  // Debug output
  Serial.println("--- Sensor Readings ---");
  Serial.println("Paper fill: " + String(fillLevels[0]) + "%");
  Serial.println("Plastic fill: " + String(fillLevels[1]) + "%");
  Serial.println("Aluminium fill: " + String(fillLevels[2]) + "%");
  Serial.println("Glass fill: " + String(fillLevels[3]) + "%");
  Serial.println("Temperature: " + String(currentTemp) + "°C");
  Serial.println("Humidity: " + String(currentHumidity) + "%");
  Serial.println("Smoke level: " + String(smokeLevel));
  Serial.println("Bin status: " + String(isActive ? "ACTIVE" : "IDLE"));
  Serial.println("-----------------------");
}

// ==================== FIRE CONDITION CHECK ====================
void checkFireConditions(unsigned long currentMillis) {
  if (isMaintenanceMode) {
    return;  // Skip alerts in maintenance mode
  }
  
  // Check if in cooldown period
  if (inFireCooldown) {
    if (currentMillis - fireCooldownStart >= FIRE_COOLDOWN_PERIOD) {
      // Cooldown period ended
      inFireCooldown = false;
      Serial.println("Fire cooldown period ended - Sensors reactivated");
    } else {
      // Still in cooldown - skip fire detection
      return;
    }
  }
  
  bool smokeDetected = smokeLevel > SMOKE_THRESHOLD;
  bool heatDetected = currentTemp > TEMP_THRESHOLD;
  
  if (smokeDetected || heatDetected) {
    if (!fireAlertActive) {
      fireAlertActive = true;
      Serial.println("!!! FIRE ALERT TRIGGERED !!!");
      
      // Publish alert to MQTT immediately
      publishFireAlert();
    }
    
    // Blink all red LEDs and sound buzzer
    if ((currentMillis / 500) % 2 == 0) {  // Toggle every 500ms
      digitalWrite(LED_RED_PAPER_PIN, HIGH);
      digitalWrite(LED_RED_PLASTIC_PIN, HIGH);
      digitalWrite(LED_RED_ALUMINIUM_PIN, HIGH);
      digitalWrite(LED_RED_GLASS_PIN, HIGH);
      digitalWrite(LED_GREEN_PAPER_PIN, LOW);
      digitalWrite(LED_GREEN_PLASTIC_PIN, LOW);
      digitalWrite(LED_GREEN_ALUMINIUM_PIN, LOW);
      digitalWrite(LED_GREEN_GLASS_PIN, LOW);
      tone(BUZZER_PIN, BUZZER_FREQ_FIRE_ALERT);
    } else {
      digitalWrite(LED_RED_PAPER_PIN, LOW);
      digitalWrite(LED_RED_PLASTIC_PIN, LOW);
      digitalWrite(LED_RED_ALUMINIUM_PIN, LOW);
      digitalWrite(LED_RED_GLASS_PIN, LOW);
      digitalWrite(LED_GREEN_PAPER_PIN, HIGH);
      digitalWrite(LED_GREEN_PLASTIC_PIN, HIGH);
      digitalWrite(LED_GREEN_ALUMINIUM_PIN, HIGH);
      digitalWrite(LED_GREEN_GLASS_PIN, HIGH);
      noTone(BUZZER_PIN);
    }
  } else {
    if (fireAlertActive) {
      fireAlertActive = false;
      noTone(BUZZER_PIN);
      Serial.println("Fire alert cleared");
    }
  }
}

// ==================== UPDATE LED INDICATORS ====================
void updateLedIndicators() {
  if (fireAlertActive || inFireCooldown) {
    return;  // LEDs controlled by fire alert or cooldown
  }
  
  // Red ON + Green OFF if >= 50% (bin full)
  // Red OFF + Green ON if < 50% (bin available)
  
  // Paper bin
  digitalWrite(LED_RED_PAPER_PIN, fillLevels[0] >= 50 ? HIGH : LOW);
  digitalWrite(LED_GREEN_PAPER_PIN, fillLevels[0] < 50 ? HIGH : LOW);
  
  // Plastic bin
  digitalWrite(LED_RED_PLASTIC_PIN, fillLevels[1] >= 50 ? HIGH : LOW);
  digitalWrite(LED_GREEN_PLASTIC_PIN, fillLevels[1] < 50 ? HIGH : LOW);
  
  // Aluminium bin
  digitalWrite(LED_RED_ALUMINIUM_PIN, fillLevels[2] >= 50 ? HIGH : LOW);
  digitalWrite(LED_GREEN_ALUMINIUM_PIN, fillLevels[2] < 50 ? HIGH : LOW);
  
  // Glass bin
  digitalWrite(LED_RED_GLASS_PIN, fillLevels[3] >= 50 ? HIGH : LOW);
  digitalWrite(LED_GREEN_GLASS_PIN, fillLevels[3] < 50 ? HIGH : LOW);
}

// ==================== PUBLISH SENSOR DATA ====================
void publishSensorData() {
  StaticJsonDocument<512> doc;
  
  doc["binId"] = binId;
  doc["timestamp"] = millis();
  doc["isActive"] = isActive;
  doc["temperature"] = currentTemp;
  doc["humidity"] = currentHumidity;
  doc["smokeLevel"] = smokeLevel;
  
  JsonArray fills = doc.createNestedArray("fillLevels");
  fills.add(fillLevels[0]);
  fills.add(fillLevels[1]);
  fills.add(fillLevels[2]);
  fills.add(fillLevels[3]);
  
  char buffer[512];
  serializeJson(doc, buffer);
  
  if (mqttClient.publish(MQTT_TOPIC_SENSOR_DATA, buffer)) {
    Serial.println("Sensor data published to MQTT");
  } else {
    Serial.println("Failed to publish sensor data");
  }
}

// ==================== PUBLISH FIRE ALERT ====================
void publishFireAlert() {
  StaticJsonDocument<256> doc;
  
  doc["binId"] = binId;
  doc["alertType"] = "FIRE";
  doc["temperature"] = currentTemp;
  doc["smokeLevel"] = smokeLevel;
  doc["timestamp"] = millis();
  
  char buffer[256];
  serializeJson(doc, buffer);
  
  if (mqttClient.publish(MQTT_TOPIC_ALERTS, buffer)) {
    Serial.println("Fire alert published to MQTT");
  } else {
    Serial.println("Failed to publish fire alert");
  }
}

// ==================== BUZZER PATTERNS ====================
void playNonRecyclableBuzzer() {
  // Three short beeps for non-recyclable items
  for (int i = 0; i < 3; i++) {
    tone(BUZZER_PIN, BUZZER_FREQ_NON_RECYCLABLE);
    delay(200);
    noTone(BUZZER_PIN);
    delay(100);
  }
}

void playStartupTone() {
  tone(BUZZER_PIN, 1000);
  delay(100);
  tone(BUZZER_PIN, 1500);
  delay(100);
  tone(BUZZER_PIN, 2000);
  delay(100);
  noTone(BUZZER_PIN);
}

// ==================== LED HELPERS ====================
void blinkAllLeds(int times) {
  for (int i = 0; i < times; i++) {
    // Red LEDs on, Green LEDs off
    digitalWrite(LED_RED_PAPER_PIN, HIGH);
    digitalWrite(LED_RED_PLASTIC_PIN, HIGH);
    digitalWrite(LED_RED_ALUMINIUM_PIN, HIGH);
    digitalWrite(LED_RED_GLASS_PIN, HIGH);
    digitalWrite(LED_GREEN_PAPER_PIN, LOW);
    digitalWrite(LED_GREEN_PLASTIC_PIN, LOW);
    digitalWrite(LED_GREEN_ALUMINIUM_PIN, LOW);
    digitalWrite(LED_GREEN_GLASS_PIN, LOW);
    delay(200);
    
    // Red LEDs off, Green LEDs on
    digitalWrite(LED_RED_PAPER_PIN, LOW);
    digitalWrite(LED_RED_PLASTIC_PIN, LOW);
    digitalWrite(LED_RED_ALUMINIUM_PIN, LOW);
    digitalWrite(LED_RED_GLASS_PIN, LOW);
    digitalWrite(LED_GREEN_PAPER_PIN, HIGH);
    digitalWrite(LED_GREEN_PLASTIC_PIN, HIGH);
    digitalWrite(LED_GREEN_ALUMINIUM_PIN, HIGH);
    digitalWrite(LED_GREEN_GLASS_PIN, HIGH);
    delay(200);
  }
}
