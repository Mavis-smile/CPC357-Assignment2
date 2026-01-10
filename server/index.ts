import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectToDatabase, getDatabase } from './db';

// Load .env.local file
dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Smart Bin API Server',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      detections: '/api/detections?limit=200',
      bins: '/api/bins',
      singleBin: '/api/bins/:binId',
      commands: 'POST /api/commands',
      updateBin: 'PATCH /api/bins/:binId'
    },
    documentation: 'See README.md for full API documentation'
  });
});

// API info endpoint
app.get('/api', (req: Request, res: Response) => {
  res.json({
    message: 'Smart Bin API',
    status: 'running',
    endpoints: [
      { method: 'GET', path: '/api/health', description: 'Health check' },
      { method: 'GET', path: '/api/detections', description: 'Get recent detections', params: '?limit=200' },
      { method: 'GET', path: '/api/bins', description: 'Get all bins' },
      { method: 'GET', path: '/api/bins/:binId', description: 'Get single bin by ID' },
      { method: 'POST', path: '/api/commands', description: 'Send command to bin', body: { binId: 'string', action: 'string' } },
      { method: 'PATCH', path: '/api/bins/:binId', description: 'Update bin data' }
    ]
  });
});

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Get all detections
app.get('/api/detections', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const limit = parseInt(req.query.limit as string) || 200;
    
    const detections = await db
      .collection('detections')
      .find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .toArray();
    
    res.json(detections);
  } catch (error) {
    console.error('Error fetching detections:', error);
    res.status(500).json({ error: 'Failed to fetch detections' });
  }
});

// Get all bins
app.get('/api/bins', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    
    const bins = await db
      .collection('bins')
      .find()
      .sort({ binId: 1 })
      .toArray();
    
    res.json(bins);
  } catch (error) {
    console.error('Error fetching bins:', error);
    res.status(500).json({ error: 'Failed to fetch bins' });
  }
});

// Get single bin by ID
app.get('/api/bins/:binId', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { binId } = req.params;
    
    const bin = await db.collection('bins').findOne({ binId });
    
    if (!bin) {
      return res.status(404).json({ error: 'Bin not found' });
    }
    
    res.json(bin);
  } catch (error) {
    console.error('Error fetching bin:', error);
    res.status(500).json({ error: 'Failed to fetch bin' });
  }
});

// Create a new command
app.post('/api/commands', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { binId, action } = req.body;
    
    if (!binId || !action) {
      return res.status(400).json({ error: 'binId and action are required' });
    }
    
    const command = {
      binId,
      action,
      issuedAt: new Date(),
      status: 'pending',
      createdAt: new Date()
    };
    
    const result = await db.collection('commands').insertOne(command);
    
    res.status(201).json({ 
      success: true, 
      commandId: result.insertedId,
      message: `${action} command queued for ${binId}` 
    });
  } catch (error) {
    console.error('Error creating command:', error);
    res.status(500).json({ error: 'Failed to create command' });
  }
});

// Update bin (for direct UI updates like reset-alarm)
app.patch('/api/bins/:binId', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { binId } = req.params;
    const updates = req.body;
    
    const result = await db.collection('bins').updateOne(
      { binId },
      { 
        $set: { 
          ...updates,
          updatedAt: new Date() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Bin not found' });
    }
    
    res.json({ success: true, message: 'Bin updated successfully' });
  } catch (error) {
    console.error('Error updating bin:', error);
    res.status(500).json({ error: 'Failed to update bin' });
  }
});

// ============================================
// WEBHOOK ENDPOINTS FOR HARDWARE
// ============================================

// Webhook: Receive detection data from hardware (camera system on GCP)
app.post('/api/webhook/detection', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const detection = req.body;

    // Validate required fields
    if (!detection.binId || !detection.itemClass) {
      return res.status(400).json({ 
        error: 'Missing required fields: binId, itemClass' 
      });
    }

    // Add timestamp if not provided
    const detectionData = {
      binId: detection.binId,
      itemClass: detection.itemClass,
      category: detection.category || 'general',
      confidence: detection.confidence || 0,
      timestamp: detection.timestamp ? new Date(detection.timestamp) : new Date(),
      address: detection.address || null,
      receivedAt: new Date()
    };

    const result = await db.collection('detections').insertOne(detectionData);

    console.log(`✅ Detection received from ${detection.binId}: ${detection.itemClass}`);

    res.status(201).json({
      success: true,
      detectionId: result.insertedId,
      message: `Detection recorded for ${detection.binId}`
    });
  } catch (error) {
    console.error('❌ Error receiving detection:', error);
    res.status(500).json({ error: 'Failed to process detection' });
  }
});

// Webhook: Receive bin sensor data from hardware (temperature, humidity, fill levels)
app.post('/api/webhook/bin-update', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const { binId, ...sensorData } = req.body;

    // Validate binId
    if (!binId) {
      return res.status(400).json({ error: 'Missing required field: binId' });
    }

    // Prepare update data
    const updateData = {
      ...sensorData,
      updatedAt: new Date()
    };

    // Update or create bin document
    const result = await db.collection('bins').updateOne(
      { binId },
      { $set: updateData },
      { upsert: true } // Create if doesn't exist
    );

    console.log(`✅ Bin ${binId} updated with sensor data`);

    res.status(200).json({
      success: true,
      message: `Bin ${binId} updated successfully`,
      upserted: result.upsertedId ? true : false
    });
  } catch (error) {
    console.error('❌ Error updating bin:', error);
    res.status(500).json({ error: 'Failed to update bin' });
  }
});

// Webhook: Health check from hardware
app.post('/api/webhook/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    message: 'Hardware webhook endpoint is healthy'
  });
});

// Start server
async function startServer() {
  try {
    await connectToDatabase();
    console.log('✅ Database connected');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 API endpoints available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  process.exit(0);
});
