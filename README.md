# 🗑️ Smart Recycle Bin - Camera Module

AI-powered real-time waste detection using TensorFlow.js COCO-SSD model with GPS tracking and MongoDB storage.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Create `.env.local`:
```env
# MongoDB
MONGODB_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/
MONGODB_DB_NAME=smartbin

# Backend
PORT=4000

# Hardware Webhook (Optional)
GCP_HARDWARE_WEBHOOK_URL=https://your-domain-name.duckdns.org/webhook/detection

# Frontend
VITE_API_BASE_URL=http://localhost:4000/api
```

### 3. Start Application
```bash
# Start backend
npm run server

# Start frontend (separate terminal)
npm run dev
```

Access at: `http://localhost:5173`

## 📁 Project Structure
```
camera/CPC357-Assignment2/
├── src/
│   ├── TrashDetection.tsx    # Main detection component
│   ├── binLocation.ts         # GPS tracking
│   ├── apiClient.ts           # MongoDB API calls
│   ├── App.tsx
│   └── main.tsx
├── server.js                  # Express backend + MongoDB
├── gcp_webhook_server.py      # Hardware webhook (optional)
└── .env.local                 # Environment variables
```

## 🎯 Features

### AI Detection
- Real-time object detection (~2 FPS)
- Detects: Paper, Plastic, Aluminium
- Filters out people/hands automatically
- 8-second cooldown between detections

### GPS Tracking
- Browser geolocation API
- Reverse geocoding for addresses
- Stores coordinates with each detection

### Data Storage
- MongoDB collections: `detections`, `bins`
- Custom document IDs: `BIN001_2026-01-17T10-30-45_bottle`
- Automatic timestamp tracking

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/detections` | Create detection |
| GET | `/api/detections` | Get detections (query: limit, binId, category) |
| GET | `/api/bins` | Get all bins |
| GET | `/api/bins/:binId` | Get specific bin |
| PUT | `/api/bins/:binId/location` | Update bin location |
| POST | `/api/bins/:binId/register` | Register ESP32 device |
| GET | `/api/bins/:binId/command` | Poll for commands (ESP32) |
| POST | `/api/bins/:binId/command` | Store command |
| PATCH | `/api/bins/:binId` | Update bin sensors |

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start frontend only
npm run dev

# Start backend only
npm run server

# Build for production
npm run build
```

## ☁️ GCP Deployment (Optional)

### Deploy Backend
```bash
# SSH into GCP VM
cd ~
git clone <repo-url>
cd camera/CPC357-Assignment2

# Create .env.local with production values
nano .env.local

# Install and run
npm install
pm2 start server.js --name camera-backend
pm2 save
```

### Deploy Webhook (Python)
```bash
pip3 install flask
nohup python3 gcp_webhook_server.py > webhook.log 2>&1 &
```

## 🔧 Configuration

### Change Bin ID
Edit `src/TrashDetection.tsx`:
```typescript
const [binId] = useState('BIN001'); // Change here
```

### Adjust Detection Categories
Edit `src/TrashDetection.tsx`:
```typescript
const trashCategories = {
  paper: ['airplane', 'surfboard', 'keyboard', ...],
  plastic: ['tape', 'bucket', ...],
  aluminium: ['book', 'medicine', 'bottle', ...]
};
```

## 📊 Technology Stack

| Component | Technology |
|-----------|-----------|
| Framework | React 18 + TypeScript + Vite |
| AI Model | TensorFlow.js COCO-SSD |
| Backend | Express.js + MongoDB |
| Styling | Tailwind CSS v3 |
| Camera | react-webcam |
| Maps | Browser Geolocation API |
