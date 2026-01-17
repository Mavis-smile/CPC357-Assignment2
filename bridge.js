/**
 * Hardware-to-MongoDB Bridge (GCP + HTTP)
 * 
 * Purpose: Receives sensor data from ESP32 via serial/HTTP and forwards to MongoDB via HTTP webhooks
 * Runs on: GCP VM with Node.js
 * 
 * Data Flow:
 * 1. ESP32 → Serial/HTTP → Bridge → GCP Webhook (HTTP) → MongoDB
 * 2. Dashboard → MongoDB → Bridge polls commands → Sends to ESP32
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// ============================================================================
// ENV LOADING (reads dashboard .env.local)
// ============================================================================

function loadEnvFrom(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️  Env file not found: ${filePath}`);
      return;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    content
      .split(/\r?\n/)
      .filter(line => line && !line.trim().startsWith('#'))
      .forEach(line => {
        const idx = line.indexOf('=');
        if (idx === -1) return;
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim();
        if (key) process.env[key] = val;
      });
    console.log(`✅ Loaded env from: ${filePath}`);
  } catch (err) {
    console.error('❌ Error loading env from', filePath, err.message);
  }
}

// Load dashboard environment variables
const dashboardEnv = path.resolve(__dirname, '..', '..', 'dashboard', 'CPC357-Assignment2', '.env.local');
loadEnvFrom(dashboardEnv);

// Configuration from environment
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'smartbin';
const GCP_DETECTION_URL = process.env.GCP_HARDWARE_WEBHOOK_URL || 'http://34.55.213.223:5000/webhook/detection';
const API_BASE = (process.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api$/, '');
const BIN_UPDATE_URL = `${API_BASE}/api/webhook/bin-update`;

// ============================================================================
// HTTP HELPER
// ============================================================================

async function postJSON(url, data) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    return await res.json().catch(() => ({}));
  } catch (err) {
    console.error(`❌ POST ${url} failed:`, err.message);
    throw err;
  }
}

// ============================================================================
// MONGODB CONNECTION
// ============================================================================

let mongoClient;
let db;

async function connectToDatabase() {
  try {
    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    db = mongoClient.db(MONGODB_DB_NAME);
    console.log(`✅ Connected to MongoDB: ${MONGODB_DB_NAME}`);
    return db;
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    throw err;
  }
}

// ============================================================================
// DATA PROCESSING FUNCTIONS
// ============================================================================

/**
 * Process sensor data from ESP32 and send to MongoDB via HTTP
 */
async function processSensorData(data) {
  const { binId, fillLevels, temperature, humidity, smokeLevel, isActive, fireAlert, inFireCooldown } = data;
  
  if (!binId) {
    console.warn('⚠️  Sensor data missing binId');
    return;
  }
  
  console.log(`📊 Sensor data for ${binId}`);
  console.log(`   Fill: ${fillLevels}, Temp: ${temperature}°C, Humidity: ${humidity}%, Smoke: ${smokeLevel}`);
  
  try {
    const payload = {
      binId,
      fillLevels,
      temperature,
      humidity,
      smokeLevel,
      isActive,
      fireAlert,
      inFireCooldown,
      timestamp: new Date().toISOString()
    };
    
    await postJSON(BIN_UPDATE_URL, payload);
    console.log(`✅ Sensor data sent to ${BIN_UPDATE_URL}`);
  } catch (err) {
    console.error(`❌ Failed to send sensor data for ${binId}`);
  }
}

/**
 * Process item detection from camera and send to GCP webhook
 */
async function processDetection(data) {
  const { binId, category, itemClass, confidence, latitude, longitude } = data;
  
  if (!binId) {
    console.warn('⚠️  Detection missing binId');
    return;
  }
  
  console.log(`📦 Detection: ${itemClass} (${category}) - ${confidence}% confidence`);
  
  try {
    const payload = {
      binId,
      itemClass: itemClass || 'unknown',
      category: category || 'general',
      confidence: confidence || 0,
      latitude: latitude || null,
      longitude: longitude || null,
      timestamp: new Date().toISOString()
    };
    
    await postJSON(GCP_DETECTION_URL, payload);
    console.log(`✅ Detection sent to ${GCP_DETECTION_URL}`);
  } catch (err) {
    console.error(`❌ Failed to send detection for ${binId}`);
  }
}

// ============================================================================
// COMMAND POLLING (MongoDB → ESP32)
// ============================================================================

/**
 * Poll MongoDB for pending commands and process them
 */
async function pollCommands() {
  try {
    const commands = await db.collection('commands')
      .find({ status: 'pending' })
      .toArray();
    
    for (const cmd of commands) {
      const { binId, action } = cmd;
      
      if (!binId || !action) {
        console.warn('⚠️  Invalid command: missing binId or action');
        continue;
      }
      
      console.log(`📤 Command for ${binId}: ${action}`);
      
      // TODO: Send command to ESP32 via serial/HTTP
      // For now, just mark as processed
      
      await db.collection('commands').updateOne(
        { _id: cmd._id },
        { 
          $set: { 
            status: 'processed',
            processedAt: new Date()
          }
        }
      );
      
      console.log(`   ✓ Command marked as processed`);
    }
  } catch (err) {
    console.error('❌ Error polling commands:', err.message);
  }
}

// ============================================================================
// MAIN LOOP
// ============================================================================

async function startBridge() {
  console.log('\n' + '='.repeat(60));
  console.log('🌉 Hardware-to-MongoDB Bridge (GCP + HTTP)');
  console.log('='.repeat(60));
  console.log('🗄️  MongoDB:', MONGODB_URI.replace(/\/\/.*@/, '//***@'));
  console.log('📦 Database:', MONGODB_DB_NAME);
  console.log('🌐 Detection webhook:', GCP_DETECTION_URL);
  console.log('🌐 Bin update webhook:', BIN_UPDATE_URL);
  console.log('='.repeat(60));
  console.log();
  
  // Connect to MongoDB
  await connectToDatabase();
  
  // Poll for commands every 5 seconds
  setInterval(pollCommands, 5000);
  
  console.log('✅ Bridge running');
  console.log('💡 Polling MongoDB for commands every 5 seconds...');
  console.log('💡 Send sensor data via processSensorData()');
  console.log('💡 Send detections via processDetection()\n');
}

// ============================================================================
// EXAMPLE: Simulate incoming data from ESP32
// ============================================================================

// Uncomment to test:
// setTimeout(() => {
//   processSensorData({
//     binId: 'BIN001',
//     fillLevels: [10, 20, 30],
//     temperature: 26,
//     humidity: 55,
//     smokeLevel: 0,
//     isActive: true,
//     fireAlert: false,
//     inFireCooldown: false
//   });
// }, 3000);

// setTimeout(() => {
//   processDetection({
//     binId: 'BIN001',
//     category: 'recyclable',
//     itemClass: 'bottle',
//     confidence: 87,
//     latitude: 3.139,
//     longitude: 101.6869
//   });
// }, 5000);

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  
  if (mongoClient) {
    await mongoClient.close();
    console.log('✅ MongoDB disconnected');
  }
  
  process.exit(0);
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

// Start the bridge
startBridge().catch(err => {
  console.error('❌ Failed to start bridge:', err);
  process.exit(1);
});


