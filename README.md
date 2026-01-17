# 📊 Smart Recycle Bin - Dashboard

Real-time monitoring and control dashboard for IoT smart bins with live data visualization and remote command capabilities.

**Live URL:** https://smart-bin-cpc357.netlify.app

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account

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

# Backend Port
PORT=4000

# Frontend API URL
VITE_API_URL=http://localhost:4000/api

# Google Maps API (Optional)
VITE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_KEY
```

### 3. Start Application
```bash
# Start both frontend and backend
npm start

# Or run separately:
npm run server:dev  # Backend on port 4000
npm run dev         # Frontend on port 5173
```

## 📁 Project Structure
```
dashboard/CPC357-Assignment2/
├── server/               # Express API + webhooks
│   ├── db.ts
│   └── index.ts
├── src/                  # React frontend
│   ├── App.tsx           # Main dashboard
│   ├── BinMap.tsx        # Map component
│   ├── api.ts            # API client
│   └── main.tsx
├── .env.local
└── package.json
```

## 🎯 Features

### Real-time Monitoring
- Live sensor data updates (every 5 seconds)
- Fill levels for 3 compartments (Paper, Plastic, Aluminium)
- Temperature, humidity, smoke levels
- Fire alert notifications
- Bin activity status (active/idle)

### Data Visualization
- Recent detections (last 24 hours)
- Category breakdown charts
- Top items detected
- Bin location on map
- Historical data analysis

### Remote Control
- Reset fire alarm
- Mark bin as emptied
- Test servo motors (Paper, Plastic, Aluminium)
- Maintenance mode toggle

## 🌐 API Endpoints

### Dashboard APIs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/detections?limit=200` | Recent detections |
| GET | `/api/bins` | All bins metadata |
| GET | `/api/bins/:binId` | Single bin data |
| POST | `/api/commands` | Queue command for bin |
| PATCH | `/api/bins/:binId` | Update bin data |

### Webhook APIs (IoT Integration)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhook/detection` | Camera detection payload |
| POST | `/api/webhook/bin-update` | Sensor data update |

## 🛠️ Development

```bash
# Install dependencies
npm install

# Start development (frontend + backend)
npm start

# Frontend only
npm run dev

# Backend only
npm run server:dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## ☁️ Netlify Deployment

### Build Settings
- **Base directory:** `dashboard/CPC357-Assignment2`
- **Build command:** `npm run build`
- **Publish directory:** `dist`

### Environment Variables
Add in Netlify dashboard:
```
VITE_API_URL=https://your-backend-url/api
VITE_MAPS_API_KEY=your-google-maps-key
```

After adding variables, trigger: **Deploys → Clear cache and deploy site**

### Backend Deployment
Deploy Express server (`server/`) to Google Cloud Run/App Engine/VM.

Configure CORS in `server/index.ts`:
```typescript
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://your-domain-name.netlify.app'
  ]
}));
```

## 📊 Technology Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Backend | Express.js + TypeScript |
| Database | MongoDB Atlas |
| Styling | Tailwind CSS v3 |
| Maps | Google Maps API |
| HTTP Client | Axios |
| Build Tool | Vite |

## 🔧 Configuration

### Change Polling Intervals
Edit `src/App.tsx`:
```typescript
// Poll for detections every 10 seconds
const interval = setInterval(loadDetections, 10000)

// Poll for bins every 5 seconds
const interval = setInterval(loadBins, 5000)
```

### Customize Dashboard Layout
Edit `src/App.tsx` to modify:
- Chart colors
- Card layouts
- Display limits
- Filter options
