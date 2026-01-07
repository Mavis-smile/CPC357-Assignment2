# THIS BRANCH IS FOR DASHBOARD ONLY 🗑️

Web dashboard for real-time monitoring, analytics, and remote control of IoT smart bins. Visualizes bin locations, fill levels, recent detections, and allows officers to send remote commands (e.g., close lid, mark emptied).

## 🚀 Setup and Installation

### Prerequisites
- Node.js (v16 or higher)
- npm (comes with Node.js)
- Git

### Step 1: Clone the Repository
```bash
git clone -b dashboard https://github.com/andy-clos/Project-CPC357.git
cd Project-CPC357
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
# Google Maps API Key (Required for map display and address lookup)
VITE_MAPS_API_KEY=<YOUR_GOOGLE_MAPS_API_KEY>

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
- **VITE_MAPS_API_KEY**: Google Maps API key for map display and geocoding
- **VITE_FIREBASE_API_KEY**: Firebase API key from project settings
- **VITE_FIREBASE_AUTH_DOMAIN**: Firebase authentication domain
- **VITE_FIREBASE_PROJECT_ID**: Your Firebase project ID
- **VITE_FIREBASE_STORAGE_BUCKET**: Firebase storage bucket URL
- **VITE_FIREBASE_MESSAGING_SENDER_ID**: Firebase messaging sender ID
- **VITE_FIREBASE_APP_ID**: Firebase app ID
- **VITE_FIREBASE_MEASUREMENT_ID**: Firebase Analytics measurement ID

> **Important:** All configuration values (Google Maps API key and Firebase credentials) are provided in the project report. Copy them exactly as shown.

### Step 4: Run the Development Server
```bash
npm run dev
```

The application will start at `http://localhost:5173` (or another available port).

### Step 5: Access the Dashboard
Open the app in your browser. No camera or location permissions are needed for dashboard use.

---

## 🧠 Technology Stack

| Category | Technology |
|----------|-----------|
| **Framework** | React 18 + TypeScript + Vite |
| **Styling** | Tailwind CSS v3 |
| **Database** | Firebase Firestore |
| **Map** | Google Maps API |


### Dashboard Features
- Real-time bin status and fill level monitoring
- Interactive map showing selected bin location
- Analytics: 24h detection counts, waste category breakdown, top bins
- Remote control: Close/open lid, mark emptied, flag overflow
- Mobile-friendly, responsive UI

---

## 📊 Firestore Database Structure


### Collection: `detections`
Stores every detected waste item event (pushed by camera system):
```
{
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
```
{
  binId: "BIN001",                  // Document ID
  latitude: 3.139,
  longitude: 101.6869,
  address: "Somewhere, KL",           // Optional (needs Maps API key)
  fillLevel: 75,                      // Estimated fill %
  updatedAt: ServerTimestamp
}
```

---


## 📁 Project Structure (Dashboard Only)

```
Project-CPC357_dashboard/
├── src/
│   ├── App.tsx            # Dashboard root component
│   ├── BinMap.tsx         # Map visualization for selected bin
│   ├── firebase.ts        # Firebase configuration
│   ├── main.tsx           # React entry point
│   └── index.css          # Global styles + Tailwind
├── public/
├── .env.local             # Environment variables (create manually)
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```
---

## 🛠️ Development Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run dev` | Start development server |

---
