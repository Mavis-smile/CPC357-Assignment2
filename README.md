# THIS BRANCH IS FOR DASHBOARD ONLY 🗑️

Web dashboard for real-time monitoring, analytics, and remote control of IoT smart bins. Visualizes bin locations, fill levels, recent detections, and allows officers to send remote commands (e.g., close lid, mark emptied).

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
> **Note:** Google Maps API key is required for map display and address lookup.

**Step 3:** Run the development server
```bash
npm run dev
```

**Step 4:** Open the app in your browser. No camera or location permissions are needed for dashboard use.

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
```
{
  binId: "BIN-001",                  // Document ID
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

## ⚙️ Configuration & Customization


### Change Default Bin Selection
Edit the dashboard code to set a default bin if desired (see `src/App.tsx`).

---

## 🔐 Security Recommendations


Currently, Firestore writes are unauthenticated for IoT/camera deployment. For production:

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
- HTTPS is required for secure access
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