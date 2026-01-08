import express from 'express';
import cors from 'cors';
import { MongoClient, ServerApiVersion } from 'mongodb';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/';
const DB_NAME = process.env.DB_NAME || 'smartbin';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Client
const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;

// Connect to MongoDB
async function connectDB() {
  try {
    await client.connect();
    db = client.db(DB_NAME);
    console.log(`✅ Connected to MongoDB database: ${DB_NAME}`);
    
    // Test connection
    await db.command({ ping: 1 });
    console.log('✅ MongoDB ping successful');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    database: db ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// POST /api/detections - Create new detection
app.post('/api/detections', async (req, res) => {
  try {
    const { documentId, binId, itemClass, category, confidence, detectedAt, address, latitude, longitude } = req.body;

    // Validate required fields
    if (!documentId || !binId || !itemClass || !category || confidence === undefined || !detectedAt) {
      return res.status(400).json({ 
        error: 'Missing required fields: documentId, binId, itemClass, category, confidence, detectedAt' 
      });
    }

    const detection = {
      _id: documentId, // Use custom documentId as _id
      binId,
      itemClass,
      category,
      confidence,
      detectedAt: new Date(detectedAt),
      address: address || null,
      latitude: latitude || null,
      longitude: longitude || null,
      createdAt: new Date()
    };

    const result = await db.collection('detections').insertOne(detection);
    
    // After saving detection, send to GCP hardware via HTTPS webhook
    try {
      const hardwareWebhook = process.env.GCP_HARDWARE_WEBHOOK_URL;
      if (hardwareWebhook) {
        const hardwarePayload = {
          binId,
          category,
          itemClass,
          confidence,
          latitude: latitude || 0,
          longitude: longitude || 0,
          timestamp: Date.now()
        };
        
        const webhookResponse = await fetch(hardwareWebhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(hardwarePayload)
        });
        
        if (webhookResponse.ok) {
          console.log(`✅ Hardware notified via HTTPS webhook for ${category}`);
        } else {
          console.warn(`⚠️ Hardware webhook failed: ${webhookResponse.status}`);
        }
      } else {
        console.log('ℹ️ No hardware webhook configured (GCP_HARDWARE_WEBHOOK_URL not set)');
      }
    } catch (webhookError) {
      console.error('⚠️ Hardware webhook error (detection still saved):', webhookError.message);
      // Don't fail the request if webhook fails - detection is already saved
    }
    
    res.status(201).json({ 
      success: true, 
      id: result.insertedId,
      message: 'Detection saved successfully' 
    });
  } catch (error) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({ 
        error: 'Detection with this ID already exists',
        documentId: req.body.documentId 
      });
    }
    
    console.error('Error saving detection:', error);
    res.status(500).json({ 
      error: 'Failed to save detection',
      message: error.message 
    });
  }
});

// GET /api/detections - Get all detections (with optional filters)
app.get('/api/detections', async (req, res) => {
  try {
    const { binId, category, limit = 100 } = req.query;
    
    const filter = {};
    if (binId) filter.binId = binId;
    if (category) filter.category = category;

    const detections = await db.collection('detections')
      .find(filter)
      .sort({ detectedAt: -1 })
      .limit(parseInt(limit))
      .toArray();

    res.json({ 
      success: true, 
      count: detections.length,
      detections 
    });
  } catch (error) {
    console.error('Error fetching detections:', error);
    res.status(500).json({ 
      error: 'Failed to fetch detections',
      message: error.message 
    });
  }
});

// PUT /api/bins/:binId/location - Update or create bin location
app.put('/api/bins/:binId/location', async (req, res) => {
  try {
    const { binId } = req.params;
    const { latitude, longitude, accuracy, method, address } = req.body;

    // Validate required fields
    if (!latitude || !longitude || !accuracy || !method) {
      return res.status(400).json({ 
        error: 'Missing required fields: latitude, longitude, accuracy, method' 
      });
    }

    const binLocation = {
      binId,
      latitude,
      longitude,
      accuracy,
      method,
      address: address || null,
      updatedAt: new Date()
    };

    // Upsert: update if exists, insert if not
    const result = await db.collection('bins').updateOne(
      { binId },
      { 
        $set: binLocation,
        $setOnInsert: { createdAt: new Date() }
      },
      { upsert: true }
    );

    res.json({ 
      success: true, 
      binId,
      upserted: result.upsertedCount > 0,
      modified: result.modifiedCount > 0,
      message: result.upsertedCount > 0 ? 'Bin location created' : 'Bin location updated'
    });
  } catch (error) {
    console.error('Error upserting bin location:', error);
    res.status(500).json({ 
      error: 'Failed to update bin location',
      message: error.message 
    });
  }
});

// GET /api/bins - Get all bins
app.get('/api/bins', async (req, res) => {
  try {
    const bins = await db.collection('bins')
      .find({})
      .sort({ updatedAt: -1 })
      .toArray();

    res.json({ 
      success: true, 
      count: bins.length,
      bins 
    });
  } catch (error) {
    console.error('Error fetching bins:', error);
    res.status(500).json({ 
      error: 'Failed to fetch bins',
      message: error.message 
    });
  }
});

// GET /api/bins/:binId - Get specific bin
app.get('/api/bins/:binId', async (req, res) => {
  try {
    const { binId } = req.params;
    const bin = await db.collection('bins').findOne({ binId });

    if (!bin) {
      return res.status(404).json({ 
        error: 'Bin not found',
        binId 
      });
    }

    res.json({ 
      success: true, 
      bin 
    });
  } catch (error) {
    console.error('Error fetching bin:', error);
    res.status(500).json({ 
      error: 'Failed to fetch bin',
      message: error.message 
    });
  }
});

// Start server
async function startServer() {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 API endpoints:`);
    console.log(`   GET  /api/health`);
    console.log(`   POST /api/detections (forwards to GCP hardware via HTTPS)`);
    console.log(`   GET  /api/detections`);
    console.log(`   PUT  /api/bins/:binId/location`);
    console.log(`   GET  /api/bins`);
    console.log(`   GET  /api/bins/:binId`);
    console.log(`\n🔧 Hardware webhook: ${process.env.GCP_HARDWARE_WEBHOOK_URL || 'Not configured'}`);
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await client.close();
  console.log('✅ MongoDB connection closed');
  process.exit(0);
});

startServer();
