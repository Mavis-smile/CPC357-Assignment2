🗑️ Smart Recycle Bin – Camera-Only Branch

Real-time waste detection system using AI-powered camera vision. Built for Smart Recycle Bin IoT deployments with GPS tracking, REST API, and optional GCP hardware control. Firebase has been removed from this branch.

🚀 Prerequisites

- Node.js v16+ (includes npm)
- Git
- MongoDB (local or Atlas)

1️⃣ Clone the Repository
git clone https://github.com/Mavis-smile/CPC357-Assignment2.git
cd CPC357-Assignment2

If you already have it:

git pull origin main

2️⃣ Install Dependencies
npm install

3️⃣ Configure Environment Variables

Create .env.local in the project root:

# Windows PowerShell
New-Item .env.local
# macOS/Linux
touch .env.local

Paste below code into your .env.local and change the required credential accordingly
# backend
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/
DB_NAME=smartbin
PORT=4000
GCP_HARDWARE_WEBHOOK_URL=http://YOUR_GCP_VM_IP:5000/webhook/detection
# Frontend
VITE_API_BASE_URL=http://localhost:4000/api


Notes:
Never commit .env.local to Git
MONGO_URI can be MongoDB Atlas or local

4️⃣ Start the Backend
npm run server         # regular
npm run server:dev     # auto-reload (Node 18+)

Test API health:
curl http://localhost:4000/api/health

5️⃣ Start the Frontend using command below
npm run dev

App runs at http://localhost:5173
Grant permissions in-browser:
Camera for waste detection
Location for GPS tracking

6️⃣ Technology Stack
Category	Technology
Framework	React 18 + TypeScript + Vite
Styling	Tailwind CSS v3
AI Model	TensorFlow.js COCO-SSD (MobileNet v2)
Camera	react-webcam + HTML5 Canvas
Data pipeline	REST API + optional GCP Webhook
Geolocation	Browser Geolocation API

Detection: Paper, Aluminium, Plastic

Real-time ~2 FPS

Smart filtering to exclude people/hands

7️⃣ Project Structure
Project-CPC357/
├── src/
│   ├── App.tsx
│   ├── TrashDetection.tsx
│   ├── binLocation.ts
│   ├── apiClient.ts
│   ├── mqttClient.ts  # deprecated
│   ├── main.tsx
│   └── index.css
├── public/
├── server.js
├── .env.local
├── gcp_webhook_server.py
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── README.md

8️⃣ Backend API Endpoints

## Health Check
GET /api/health – Server + DB status

## Detections
POST /api/detections – Create detection
GET /api/detections?binId=BIN001&category=plastic&limit=100 – Retrieve

## Bins
PUT /api/bins/:binId/location – Update location
GET /api/bins – All bins
GET /api/bins/:binId – Specific bin

9️⃣ MongoDB Structure

detections:
  {
    "_id": "BIN001_2026-01-08T10-30-45_bottle",
    "binId": "BIN001",
    "itemClass": "bottle",
    "category": "aluminium",
    "confidence": 87,
    "detectedAt": "2026-01-08T10:30:45.000Z",
    "address": "123 Main St",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "createdAt": "2026-01-08T10:30:45.123Z"
  }


bins:
  {
    "binId": "BIN001",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 12,
    "method": "single",
    "address": "123 Main St",
    "createdAt": "2026-01-08T10:00:00.000Z",
    "updatedAt": "2026-01-08T10:30:45.000Z"
  }

🔧 Configuration & Customization
Change Bin ID: src/TrashDetection.tsx → const [binId] = useState('BIN001')
Continuous location tracking: use watchPosition in src/binLocation.ts

🛠️ Development Commands
Command	Description
npm install	Install dependencies
npm run dev	Start frontend
npm run build	Build frontend
npm run server	Start backend
npm run server:dev	Backend with auto-reload

🔧 Run GCP Hardware Webhook
Prerequisites
- GCP VM with external IP (e.g., 34.63.218.151)
- Python 3 installed
- Port 5000 open in firewall

Step 1: Deploy Webhook Server
- SSH via browser or CLI
- Install Python & Flask:

sudo apt update
sudo apt install python3 python3-pip -y
pip3 install flask

Upload gcp_webhook_server.py to VM home folder
Run:
cd ~
python3 gcp_webhook_server.py
# or background
nohup python3 gcp_webhook_server.py > webhook.log 2>&1 &


- Open firewall port 5000 (UI or CLI)

Step 2: Configure Backend

- Update .env.local:
GCP_HARDWARE_WEBHOOK_URL=http://YOUR_GCP_VM_IP:5000/webhook/detection

Step 3: Test Webhook
- Health check:
curl http://YOUR_GCP_VM_IP:5000/health


- Test detection endpoint:
curl -X POST http://YOUR_GCP_VM_IP:5000/webhook/detection \
  -H "Content-Type: application/json" \
  -d '{
    "binId": "BIN001",
    "category": "plastic",
    "itemClass": "bottle",
    "confidence": 85,
    "timestamp": 1704672000000
  }'


Optional: HTTPS (Production)

Use Certbot + domain

Update Flask SSL context

Update GCP_HARDWARE_WEBHOOK_URL to https://yourdomain.com/webhook/detection