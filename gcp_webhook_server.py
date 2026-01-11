"""
GCP Hardware Webhook Server
Deploy this on your GCP VM to receive detection events and forward to ESP32 hardware
"""

from flask import Flask, request, jsonify
from datetime import datetime
import requests
import os

app = Flask(__name__)

# Backend API URL to query for ESP32 IPs
BACKEND_API = os.getenv('BACKEND_API', 'http://localhost:4000/api')

@app.route('/', methods=['GET'])
def home():
    return "GCP Hardware Webhook Server is running", 200

# Category to servo position mapping (adjust based on your hardware setup)
SERVO_POSITIONS = {
    'paper': 0,      # 0 degrees
    'plastic': 90,   # 90 degrees  
    'aluminium': 180 # 180 degrees
}

@app.route('/detection', methods=['POST'])
@app.route('/webhook/detection', methods=['POST'])
def receive_detection():
    try:
        data = request.get_json(silent=True)
        if not data:
            return jsonify({
                'status': 'error',
                'message': 'Invalid or missing JSON payload'
            }), 400

                
        # Extract detection data
        bin_id = data.get('binId')
        category = (data.get('category') or 'unknown').lower()
        item_class = data.get('itemClass')
        confidence = data.get('confidence')
        timestamp = data.get('timestamp')
        
        print(f"\n{'='*60}")
        print(f"🗑️  DETECTION RECEIVED at {datetime.now()}")
        print(f"{'='*60}")
        print(f"Bin ID:     {bin_id}")
        print(f"Category:   {category.upper()}")
        print(f"Item:       {item_class}")
        print(f"Confidence: {confidence}%")
        print(f"Timestamp:  {timestamp}")
        print(f"{'='*60}\n")
        
        # Query backend for ESP32 IP dynamically
        try:
            bin_url = f"{BACKEND_API}/bins/{bin_id}"
            print(f"🔍 Fetching ESP32 IP from {bin_url}")
            
            bin_response = requests.get(bin_url, timeout=3)
            if bin_response.status_code != 200:
                print(f"⚠️  Could not fetch bin info: {bin_response.status_code}")
                return jsonify({
                    'status': 'warning',
                    'message': f'Bin {bin_id} not found in database'
                }), 200
            
            bin_data = bin_response.json()
            esp32_ip = bin_data.get('localIP')
            
            if not esp32_ip:
                print(f"⚠️  No ESP32 IP registered for {bin_id}")
                return jsonify({
                    'status': 'warning',
                    'message': f'ESP32 not registered for {bin_id}. Please start the hardware.'
                }), 200
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Failed to query backend: {e}")
            return jsonify({
                'status': 'error',
                'message': 'Backend unreachable'
            }), 500
        
        # Send detection to ESP32's /detection endpoint
        try:
            esp32_url = f"http://{esp32_ip}/detection"
            print(f"📡 Forwarding to ESP32 at {esp32_url}")
            
            response = requests.post(
                esp32_url,
                json=data,
                timeout=5
            )
            
            if response.status_code == 200:
                print(f"✅ ESP32 responded: {response.text}")
            else:
                print(f"⚠️  ESP32 responded with status {response.status_code}")
                
        except requests.exceptions.RequestException as e:
            print(f"❌ Failed to reach ESP32: {e}")
            # Don't fail the webhook if ESP32 is unreachable
        
        return jsonify({
            'status': 'success',
            'message': f'Detection forwarded to {bin_id}',
            'category': category,
            'esp32_ip': esp32_ip
        }), 200
        
    except Exception as e:
        print(f"❌ Error processing detection: {e}")
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'message': 'GCP Hardware Webhook Server is running',
        'timestamp': datetime.now().isoformat()
    }), 200

if __name__ == '__main__':
    print("🚀 Starting GCP Hardware Webhook Server")
    print(f"📍 Listening on http://<GCP_EXTERNAL_IP_ADDRESS>:5000")
    print(f"🔗 Webhook endpoint: http://<GCP_EXTERNAL_IP_ADDRESS>:5000/webhook/detection")
    print(f"💚 Health check: http://<GCP_EXTERNAL_IP_ADDRESS>:5000/health\n")
    
    # Run on all interfaces so it's accessible from external IP
    app.run(host='0.0.0.0', port=5000)
