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
GCP_HARDWARE_WEBHOOK_URL=https://smart-bin.duckdns.org/webhook/detection
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

🔧 GCP Deployment Guide

This section explains how to deploy both the Node.js backend and Python webhook server on Google Cloud Platform (GCP).

## Architecture Overview

```
Frontend (Local/Vercel)  →  Backend (GCP VM)  →  MongoDB Atlas
                                    ↓
                            Webhook (GCP VM)  →  Hardware Control
```

## Prerequisites

- GCP Account with billing enabled
- GCP VM instance (e.g., e2-medium, Ubuntu 20.04+)
- External static IP address assigned to VM
- MongoDB Atlas account (or MongoDB URI)
- Firewall rules configured (ports 4000 and 5000)

---

## Part 1: Deploy Node.js Backend to GCP

### Step 1: Create GCP VM Instance

### Step 2: Configure Firewall Rules to allow port 4000 and 5000 via GCP Console: **VPC Network > Firewall > Create Firewall Rule**
- Name: `allow-backend`
- Targets: All instances in the network
- Source IP ranges: `0.0.0.0/0`
- Protocols and ports: `tcp:4000,5000`

### Step 3: SSH into VM and Install Dependencies

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js v18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v18.x or higher
npm --version

# Step 4: Upload Backend Files to GCP VM

**Option A: Using Git**
```bash
# On GCP VM
cd ~
git clone https://github.com/Mavis-smile/CPC357-Assignment2.git
cd CPC357-Assignment2
git checkout camera

### Step 5: Configure Environment Variables on GCP VM

```bash
# On GCP VM, navigate to project folder
cd ~/CPC357-Assignment2

# Create .env.local file
nano .env.local
```


# Paste the following (replace with your actual credentials):
```
# Backend Configuration
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/
DB_NAME=smartbin
PORT=4000
GCP_HARDWARE_WEBHOOK_URL=http://localhost:5000/webhook/detection
```
Save and exit (Ctrl+X, then Y, then Enter)

### Step 6: Install Node Dependencies and Start Backend

```bash
# Install dependencies
npm install

# Test backend locally first
npm run server

# You should see:
# ✅ Connected to MongoDB database: smartbin
# ✅ MongoDB ping successful
# 🚀 Server running on port 4000
```

Press Ctrl+C to stop, then run in background:

```bash
# Run backend in background with PM2 (for production)
sudo npm install -g pm2
pm2 start server.js --name smartbin-backend
pm2 save
pm2 startup  # Follow the command it outputs

# Or use nohup (for running in background)
nohup npm run server > backend.log 2>&1 &

# Check if running
curl http://localhost:4000/api/health
```

### Step 7: Test Backend from External IP

```bash
# Get your VM's external IP
gcloud compute instances describe smartbin-server --zone=us-central1-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)'

# From your local machine
curl http://YOUR_GCP_EXTERNAL_IP:4000/api/health
```

Expected response:
```json
{"status":"ok","database":"connected","timestamp":"2026-01-09T..."}
```

---

## Part 2: Deploy Python Webhook Server on GCP

### Step 1: Install Python and Flask (on same VM)

```bash
# SSH into your GCP VM
cd ~

# Install Python 3 and pip
sudo apt update
sudo apt install python3 python3-pip -y

# Install Flask
pip3 install flask

# Verify installation
python3 --version
pip3 list | grep Flask
```

### Step 2: Check Webhook Server File

If you used git clone earlier, the file is already there:
```bash
cd ~/CPC357-Assignment2
ls -la gcp_webhook_server.py  # Should exist
```

### Step 3: Run Webhook Server

```bash
# Test run first
cd ~/CPC357-Assignment2  # Or cd ~ if file is in home directory
python3 gcp_webhook_server.py

# You should see:
# 🚀 Starting GCP Hardware Webhook Server
# 📍 Listening on http://<GCP_EXTERNAL_IP_ADDRESS>:5000
```

Press Ctrl+C to stop, then run in background:

```bash
# Run in background
nohup python3 gcp_webhook_server.py > webhook.log 2>&1 &

# Check process
ps aux | grep gcp_webhook_server.py

# View logs
tail -f webhook.log
```

### Step 4: Test Webhook Server

```bash
# Health check from local machine
curl http://YOUR_GCP_VM_IP:5000/health

# Test detection endpoint
curl -X POST http://YOUR_GCP_VM_IP:5000/webhook/detection \
  -H "Content-Type: application/json" \
  -d '{
    "binId": "BIN001",
    "category": "plastic",
    "itemClass": "bottle",
    "confidence": 85,
    "timestamp": 1704672000000
  }'
```

Expected response:
```json
{
  "status": "success",
  "message": "Servo moved to 90° for plastic",
  "servo_position": 90,
  "category": "plastic"
}
```

---

## Part 3: Connect Frontend to GCP Backend

### Option A: Local Frontend Development

Update your local `.env.local`:
```env
VITE_API_BASE_URL=http://YOUR_GCP_VM_IP:4000/api
```

Restart frontend:
```bash
npm run dev
```

### Option B: Deploy Frontend to Vercel

1. Push code to GitHub
2. Go to [Vercel](https://vercel.com) → Import Project
3. Add environment variable in Vercel dashboard:
   - Key: `VITE_API_BASE_URL`
   - Value: `http://YOUR_GCP_VM_IP:4000/api`
4. Deploy

**Note:** For production, use HTTPS with a domain and SSL certificate (e.g., via Let's Encrypt + Nginx reverse proxy)

---

## GCP Deployment Monitoring & Management

### Check Backend Status
```bash
# If using PM2
pm2 status
pm2 logs smartbin-backend
pm2 restart smartbin-backend

# If using nohup
ps aux | grep "node.*server.js"
tail -f backend.log
pkill -f "node.*server.js"  # To stop
```

### Check Webhook Status
```bash
ps aux | grep gcp_webhook_server.py
tail -f webhook.log
pkill -f gcp_webhook_server.py  # To stop
```

### View Real-Time Logs
```bash
# Backend logs (PM2)
pm2 logs smartbin-backend --lines 100

# Webhook logs
tail -f webhook.log

# System logs
sudo journalctl -u smartbin-backend -f
```

### Restart Services After VM Reboot
```bash
# If using PM2 (auto-restarts on reboot if you ran pm2 startup)
pm2 resurrect

# Otherwise, manually restart:
cd ~/CPC357-Assignment2
nohup npm run server > backend.log 2>&1 &
nohup python3 gcp_webhook_server.py > webhook.log 2>&1 &
```

---

1. **Use HTTPS with SSL Certificate**
   - Set up Nginx reverse proxy
   - Get SSL cert from Let's Encrypt: `sudo certbot --nginx`

2. **Use Domain Name**
   - Register domain (e.g., `api.smartbin.com`)
   - Point A record to GCP VM IP
   - Update `.env.local` to use domain instead of IP

3. **Enable Automatic Backups**
   - MongoDB Atlas: Enable automated backups
   - GCP VM: Create snapshots regularly

4. **Monitor Resource Usage**
   - GCP Console: Monitoring > Metrics Explorer
   - Set up alerts for high CPU/memory usage

5. **Secure Environment Variables**
   - Never commit `.env.local` to Git
   - Use GCP Secret Manager for sensitive data

6. **Set Up Logging**
   - Use GCP Cloud Logging for centralized logs
   - Configure log rotation: `sudo logrotate -f /etc/logrotate.conf`

## 1. Frontend (Vercel)

Your React + Vite frontend runs on Vercel (hosted online).

Frontend calls your backend API via the VITE_API_BASE_URL environment variable.

Example:

VITE_API_BASE_URL=https://34.61.86.159:4000/api   # or HTTPS if using domain + SSL


Frontend doesn’t need Node backend locally—it just sends HTTP requests to your GCP VM.

## 2. Backend (Node.js on GCP VM)

Node backend (server.js) handles:

MongoDB reads/writes

/api/detections → saves detection

/api/bins → bin data

Frontend talks to backend through the public IP (or your domain if using HTTPS).

## 3. Webhook (Python/Flask on GCP VM)

Backend automatically calls your hardware webhook after saving a detection:

POST http://34.61.86.159:5000/webhook/detection


Webhook server controls servo motors or other hardware actions.

It can run on the same VM as backend or separate, just make sure the backend URL points to it.

## 4. Flow of data

User opens frontend (Vercel) → uses camera or input.

Frontend sends detection to GCP backend API.

Backend saves to MongoDB and triggers webhook.

Webhook handles hardware actions.

Backend responds → frontend updates UI.

## What Gets Deployed to GCP:
1. Node.js Backend (server.js) - Port 4000
Handles all API requests from frontend
Saves detections to MongoDB Atlas
Manages bin location data
## Automatically triggers webhook after each detection
2. Python Webhook Server (gcp_webhook_server.py) - Port 5000
Receives detection events from backend
Controls hardware (servo motors) based on waste category
Maps categories to servo positions (paper=0°, plastic=90°, aluminium=180°)
