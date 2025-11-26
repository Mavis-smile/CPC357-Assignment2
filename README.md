# Smart Bin Vision 🗑️

Real-time waste detection system using AI-powered camera vision to identify and classify trash items. Built for IoT smart bin deployments with GPS tracking and cloud storage.

## 🚀 Quick Start

**Step 1:** Install dependencies
```bash
npm install
```

**Step 2:** Configure environment variables  
Create `.env.local` in the project root:
```env
VITE_MAPS_API_KEY=your_google_maps_api_key_here
```
> **Note:** Google Maps API key is optional—only needed for reverse geocoding addresses from GPS coordinates.

**Step 3:** Run the development server
```bash
npm run dev
```

**Step 4:** Open the app in your browser and grant camera + location permissions when prompted.

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
  documentId: "BIN-001_2025-11-26T10-30-45_bottle",  // Custom ID
  binId: "BIN-001",
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
  binId: "BIN-001",                  // Document ID
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
const [binId] = useState('BIN-001');  // Change to BIN-002, BIN-003, etc.
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

## 📝 License

See `LICENSE` file for details.
