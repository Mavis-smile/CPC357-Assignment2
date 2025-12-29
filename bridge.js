/**
 * MQTT-to-Firebase Bridge
 * 
 * Purpose: Synchronizes data between MQTT broker and Firebase Firestore
 * Runs on: GCP VM with Node.js
 * 
 * Data Flow:
 * 1. ESP32 → MQTT → Bridge → Firebase (sensors, alerts)
 * 2. Dashboard → Firebase → Bridge → MQTT → ESP32 (commands)
 */

const mqtt = require('mqtt');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// ============================================================================
// INITIALIZATION
// ============================================================================

// Load service account key
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ serviceAccountKey.json not found!');
  console.error('   Place your Firebase service account key in:', serviceAccountPath);
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: serviceAccount.project_id
});

const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;
const FieldValue = admin.firestore.FieldValue;

// Connect to local MQTT broker
const mqttClient = mqtt.connect('mqtt://localhost:1883', {
  clientId: 'firebase-bridge-' + Date.now(),
  clean: true,
  reconnectPeriod: 5000,
  will: {
    topic: 'bridge/status',
    payload: JSON.stringify({ status: 'offline', timestamp: Date.now() }),
    retain: true
  }
});

// ============================================================================
// MQTT EVENT HANDLERS
// ============================================================================

mqttClient.on('connect', () => {
  console.log('✅ Connected to MQTT broker (localhost:1883)');
  
  // Publish online status
  mqttClient.publish('bridge/status', JSON.stringify({
    status: 'online',
    timestamp: Date.now()
  }), { retain: true });
  
  // Subscribe to sensor and alert topics from ESP32
  console.log('📡 Subscribing to MQTT topics...');
  mqttClient.subscribe('smartbin/sensors', err => {
    if (!err) console.log('   ✓ smartbin/sensors');
  });
  
  mqttClient.subscribe('smartbin/alerts', err => {
    if (!err) console.log('   ✓ smartbin/alerts');
  });
  
  mqttClient.subscribe('smartbin/item', err => {
    if (!err) console.log('   ✓ smartbin/item');
  });
});

mqttClient.on('error', (err) => {
  console.error('❌ MQTT Error:', err);
});

mqttClient.on('reconnect', () => {
  console.log('🔄 Reconnecting to MQTT broker...');
});

mqttClient.on('disconnect', () => {
  console.log('⚠️  Disconnected from MQTT broker');
});

// Handle incoming MQTT messages from ESP32
mqttClient.on('message', async (topic, message) => {
  try {
    const payload = JSON.parse(message.toString());
    
    // ========== SENSOR DATA (from ESP32) ==========
    if (topic === 'smartbin/sensors') {
      const { binId, fillLevels, temperature, humidity, smokeLevel, isActive } = payload;
      
      if (!binId) {
        console.warn('⚠️  Sensor message missing binId');
        return;
      }
      
      // Update bin document in Firestore
      await db.collection('bins').doc(binId).set({
        binId: binId,
        fillLevels: fillLevels || [0, 0, 0, 0],
        temperature: temperature || 0,
        humidity: humidity || 0,
        smokeLevel: smokeLevel || 0,
        isActive: isActive || false,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      
      console.log(`✅ Sensor data updated for ${binId}`);
      console.log(`   Fill: ${fillLevels}, Temp: ${temperature}°C, Smoke: ${smokeLevel}`);
    }
    
    // ========== FIRE ALERT (from ESP32) ==========
    else if (topic === 'smartbin/alerts') {
      const { binId, alertType, temperature, smokeLevel } = payload;
      
      if (!binId) {
        console.warn('⚠️  Alert message missing binId');
        return;
      }
      
      // Update fire alert flag in bin document
      await db.collection('bins').doc(binId).update({
        fireAlert: true,
        temperature: temperature,
        smokeLevel: smokeLevel,
        updatedAt: FieldValue.serverTimestamp()
      });
      
      // Log alert to alerts collection
      await db.collection('alerts').add({
        binId: binId,
        alertType: alertType || 'FIRE',
        temperature: temperature,
        smokeLevel: smokeLevel,
        timestamp: FieldValue.serverTimestamp()
      });
      
      console.log(`🔥 Fire alert for ${binId}`);
      console.log(`   Temperature: ${temperature}°C, Smoke: ${smokeLevel}`);
    }
    
    // ========== ITEM DETECTION (from Camera via ESP32) ==========
    else if (topic === 'smartbin/item') {
      const { binId, category, itemClass, confidence, latitude, longitude } = payload;
      
      if (!binId) {
        console.warn('⚠️  Item detection missing binId');
        return;
      }
      
      // Log detection to Firestore
      await db.collection('detections').add({
        binId: binId,
        itemClass: itemClass || 'unknown',
        category: category || 'general',
        confidence: confidence || 0,
        latitude: latitude || null,
        longitude: longitude || null,
        timestamp: FieldValue.serverTimestamp()
      });
      
      console.log(`📦 Item detected: ${category} (${confidence}%)`);
    }
    
  } catch (err) {
    console.error('❌ Error processing MQTT message:', err.message);
  }
});

// ============================================================================
// FIREBASE COMMAND LISTENER
// ============================================================================

/**
 * Listen to Firebase 'commands' collection for new commands
 * When dashboard sends a command, this bridge relays it to ESP32 via MQTT
 */
db.collection('commands')
  .where('status', '==', 'pending')
  .onSnapshot(
    snapshot => {
      snapshot.docChanges().forEach(async change => {
        if (change.type === 'added') {
          const cmdDoc = change.doc;
          const cmdData = cmdDoc.data();
          const { binId, action, issuedAt } = cmdData;
          
          if (!binId || !action) {
            console.warn('⚠️  Invalid command: missing binId or action');
            return;
          }
          
          try {
            // Publish command to MQTT for ESP32
            const mqttPayload = JSON.stringify({
              binId: binId,
              action: action,
              timestamp: Date.now(),
              issuedAt: issuedAt
            });
            
            mqttClient.publish('smartbin/commands', mqttPayload);
            
            console.log(`📤 Command published to ESP32:`);
            console.log(`   BinID: ${binId}, Action: ${action}`);
            
            // Mark command as processed in Firebase
            await cmdDoc.ref.update({
              status: 'processed',
              processedAt: FieldValue.serverTimestamp()
            });
            
            console.log(`   ✓ Marked as processed`);
            
          } catch (err) {
            console.error('❌ Error processing command:', err.message);
            
            // Mark as failed
            try {
              await cmdDoc.ref.update({
                status: 'failed',
                error: err.message,
                failedAt: FieldValue.serverTimestamp()
              });
            } catch (updateErr) {
              console.error('❌ Error updating command status:', updateErr.message);
            }
          }
        }
      });
    },
    err => {
      console.error('❌ Firebase listener error:', err.message);
    }
  );

// ============================================================================
// STARTUP MESSAGE
// ============================================================================

console.log('\n' + '='.repeat(60));
console.log('🌉 MQTT-to-Firebase Bridge');
console.log('='.repeat(60));
console.log('📡 MQTT Broker: localhost:1883');
console.log('🔥 Firebase Project:', serviceAccount.project_id);
console.log('='.repeat(60));
console.log('\n⏳ Connecting to MQTT broker...\n');

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  
  mqttClient.publish('bridge/status', JSON.stringify({
    status: 'offline',
    timestamp: Date.now()
  }));
  
  mqttClient.end(false, () => {
    console.log('✅ MQTT disconnected');
    process.exit(0);
  });
  
  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown');
    process.exit(1);
  }, 5000);
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Keep process alive
console.log('✅ MQTT-Firebase bridge running...');
console.log('💡 Waiting for MQTT messages and Firebase commands...\n');
