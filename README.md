# Dashboard (React + Express + MongoDB)

Web dashboard for real-time monitoring and analytics of IoT smart bins. Displays bin locations, fill levels, recent detections, and supports simple control actions.

Live URL (Netlify): https://smart-bin-cpc357.netlify.app/

## 🚀 Setup (Local Development)

### Prerequisites
- Node.js 18+
- npm
- MongoDB Atlas account (or reachable MongoDB instance)

### 1) Clone and install
```bash
git clone -b dashboard https://github.com/Mavis-smile/CPC357-Assignment2.git
cd CPC357-Assignment2/dashboard/CPC357-Assignment2
npm install
```

### 2) Environment variables (.env.local)
Create a `.env.local` file in this folder with:
```env
# Backend (Express)
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/
MONGODB_DB_NAME=smartbin
PORT=3001

# Frontend (Vite)
VITE_API_URL=http://localhost:3001/api
VITE_MAPS_API_KEY=<YOUR_GOOGLE_MAPS_API_KEY>
```

### 3) Run locally
```bash
# Start both frontend (Vite) and backend (Express)


# Or run separately
npm run server:dev  # backend on http://localhost:3001
npm run dev         # frontend on http://localhost:5173
```

---

## 🧰 Project Structure

```
dashboard/CPC357-Assignment2/
├── public/
├── server/               # Express API + webhooks for IoT updates
│   ├── db.ts
│   └── index.ts
├── src/                  # React + Vite frontend
│   ├── App.tsx
│   ├── BinMap.tsx
│   ├── api.ts
│   └── main.tsx
├── .env.local            # Local env (not committed)
├── netlify.toml          # Netlify build config
├── package.json
├── tailwind.config.js
├── tsconfig.json
└── vite.config.ts
```

---

## 🌐 Deployment (Netlify + GCP Backend)

The frontend is deployed on Netlify. Environment variables must be set in Netlify because `.env.local` is not used during build.

### Netlify build settings
- Base directory: `dashboard/CPC357-Assignment2`
- Build command: `npm run build`
- Publish directory: `dist`

### Netlify environment variables
- `VITE_MAPS_API_KEY` = your Google Maps API key
- `VITE_API_URL` = your backend API URL (e.g., `https://<your-cloud-run-url>/api`)

After adding env vars, trigger: Deploys → “Clear cache and deploy site”.

### Backend deployment (GCP recommended)
Deploy the Express API (in `server/`) to Google Cloud Run/App Engine/VM. Make sure CORS allows your Netlify domain.

Example CORS in `server/index.ts`:
```ts
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://smart-bin-cpc357.netlify.app'
  ]
}));
```

---

## 🧠 Technology Stack

| Category | Technology |
|----------|------------|
| Frontend | React 18, TypeScript, Vite |
| Backend  | Express.js (TypeScript) |
| Database | MongoDB Atlas |
| Styling  | Tailwind CSS |
| Maps     | Google Maps API |
| HTTP     | Axios |

---

## 🔌 API Overview (server)

- `GET /api/health` – health check
- `GET /api/detections?limit=200` – recent detections
- `GET /api/bins` – all bins
- `GET /api/bins/:binId` – single bin
- `POST /api/commands` – queue command for bin
- `PATCH /api/bins/:binId` – update bin
- Webhooks for IoT:
  - `POST /api/webhook/detection` – camera detection payload
  - `POST /api/webhook/bin-update` – sensor data/update

---

## 🛠️ Useful Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm start` | Start frontend + backend concurrently |
| `npm run dev` | Frontend dev server (Vite) |
| `npm run server:dev` | Backend dev server (nodemon + tsx) |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview built frontend locally |
