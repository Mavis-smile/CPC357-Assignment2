# THIS BRANCH IS FOR CAMERA ONLY 🗑️

Real-time waste detection system using AI-powered camera vision to identify and classify trash items. Built for Smart Recycle Bin IoT System deployments with GPS tracking and cloud storage.

## 🚀 Setup and Installation

### Prerequisites
- Node.js (v16 or higher)
- npm (comes with Node.js)
- Git

### Step 1: Clone the Repository
```bash
git clone <repository-url>
cd Project-CPC357_cam
```

If you already have the repository:
```bash
git pull origin main
```

### Step 2: Install Dependencies
```bash
npm install
```

### Step 3: Configure Environment Variables
Create a `.env.local` file in the project root directory:
```bash
# For Windows PowerShell
New-Item .env.local

# For macOS/Linux
touch .env.local
```

Add the following environment variables to `.env.local`:

```env
# MQTT Broker (WebSocket URL)
# Replace with your GCP VM external IP
VITE_MQTT_BROKER_URL=ws://<YOUR_GCP_VM_IP>:9001

# MQTT Broker Secure (WebSocket Secure URL for HTTPS hosting)
# Set this after configuring WSS on your broker
VITE_MQTT_BROKER_URL_SECURE=wss://<YOUR_DOMAIN>

# Firebase Configuration
# Get these values from Firebase Console > Project Settings > General > Your apps
VITE_FIREBASE_API_KEY=<YOUR_FIREBASE_API_KEY>
VITE_FIREBASE_AUTH_DOMAIN=<YOUR_PROJECT_ID>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<YOUR_PROJECT_ID>
VITE_FIREBASE_STORAGE_BUCKET=<YOUR_PROJECT_ID>.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<YOUR_SENDER_ID>
VITE_FIREBASE_APP_ID=<YOUR_APP_ID>
VITE_FIREBASE_MEASUREMENT_ID=<YOUR_MEASUREMENT_ID>
```

#### Required Keys (refer to project report for actual values):
- **VITE_MQTT_BROKER_URL**: WebSocket URL for MQTT broker (e.g., `ws://34.63.50.190:9001`)
- **VITE_MQTT_BROKER_URL_SECURE**: Secure WebSocket URL for production (e.g., `wss://cpc357.chickenkiller.com`)
- **VITE_FIREBASE_API_KEY**: Firebase API key from project settings
- **VITE_FIREBASE_AUTH_DOMAIN**: Firebase authentication domain
- **VITE_FIREBASE_PROJECT_ID**: Your Firebase project ID
- **VITE_FIREBASE_STORAGE_BUCKET**: Firebase storage bucket URL
- **VITE_FIREBASE_MESSAGING_SENDER_ID**: Firebase messaging sender ID
- **VITE_FIREBASE_APP_ID**: Firebase app ID
- **VITE_FIREBASE_MEASUREMENT_ID**: Firebase Analytics measurement ID

> **Important:** All configuration values (IP addresses, domains, and Firebase credentials) are provided in the project report. Copy them exactly as shown.

### Step 4: Run the Development Server
```bash
npm run dev
```

The application will start at `http://localhost:5173` (or another available port).

### Step 5: Grant Permissions
When you open the app in your browser, grant the following permissions when prompted:
- **Camera access** - Required for waste detection
- **Location access** - Required for GPS tracking of bin location

---

## 🧠 Technology Stack

| Category | Technology |
|----------|-----------|
| **Framework** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS v3 |
| **AI Model** | TensorFlow.js COCO-SSD (MobileNet v2) |
| **Camera** | react-webcam with HTML5 Canvas |
| **Database** | Firebase Firestore |
| **Geolocation** | Browser Geolocation API |

### Detection Model Details
- **Model:** COCO-SSD pre-trained on 80 object classes
- **Performance:** Real-time detection at ~2 FPS
- **Smart Filtering:** Automatically suppresses hand/person detections when waste items are present
- **Categories:** Recyclable, Organic, Paper, General waste

---

## 📊 Firestore Database Structure

### Collection: `detections`
Stores every detected waste item event:
```javascript
{
  documentId: "BIN001_2025-11-26T10-30-45_bottle",  // Custom ID
  binId: "BIN001",
  itemClass: "bottle",
  category: "recyclable",
  confidence: 87,                    // 0-100
  timestamp: ServerTimestamp,        // Firestore server time
  detectedAt: Date                   // Client capture time
}
```

### Collection: `bins`
One document per physical bin with metadata and location:
```javascript
{
  binId: "BIN001",                  // Document ID
  latitude: 40.7128,
  longitude: -74.0060,
  accuracy: 12,                      // GPS accuracy in meters
  method: "single",                  // "single" or "watch"
  address: "350 5th Ave, New York",  // Optional (needs Maps API key)
  updatedAt: ServerTimestamp
}
```

---

## 📁 Project Structure

```
Project-CPC357/
├── src/
│   ├── App.tsx              # Root component
│   ├── TrashDetection.tsx   # Main detection UI & logic
│   ├── binLocation.ts       # Geolocation utilities
│   ├── firebase.ts          # Firebase configuration
│   ├── main.tsx             # React entry point
│   └── index.css            # Global styles + Tailwind
├── public/
│   └── vite.svg
├── .env.local               # Environment variables (create manually)
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

---

## ⚙️ Configuration & Customization

### Change Bin ID
Edit `src/TrashDetection.tsx`:
```typescript
const [binId] = useState('BIN001');  // Change to BIN002, BIN003, etc.
```

### Adjust Detection Sensitivity
Modify confidence threshold in `src/TrashDetection.tsx`:
```typescript
if (!isSaving && highestConfidence.score > 0.7) {  // Change 0.7 (70%) as needed
  saveDetectionToFirebase(newDetection);
}
```

### Add Continuous Location Tracking
Implement `watchPosition` in `src/binLocation.ts` for real-time bin movement tracking.

---

## 🔐 Security Recommendations

Currently, Firestore writes are unauthenticated for kiosk deployment. For production:

```javascript
// Firestore Security Rules (example)
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /detections/{document} {
      allow write: if true;              // Kiosk write access
      allow read: if request.auth != null;  // Authenticated read
    }
    match /bins/{binId} {
      allow write: if true;
      allow read: if request.auth != null;
    }
  }
}
```

---

## 🚢 Deployment

Build for production:
```bash
npm run build
```

Output will be in `dist/` folder. Deploy to:
- **Vercel** / **Netlify** (recommended for static hosting)
- **Firebase Hosting**
- Any CDN or static web server

**Requirements:**
- HTTPS is required for camera and geolocation permissions
- Configure Firebase project credentials in `src/firebase.ts`

---

## 🛠️ Development Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---
