"""
GCP Hardware Webhook Server
Deploy this on your GCP VM at your external ip address to receive detection events via HTTP
"""

from flask import Flask, request, jsonify
from datetime import datetime

app = Flask(__name__)

@app.route('/', methods=['GET'])
def home():
    return "GCP Hardware Webhook Server is running", 200

# Category to servo position mapping (adjust based on your hardware setup)
SERVO_POSITIONS = {
    'paper': 0,      # 0 degrees
    'plastic': 90,   # 90 degrees  
    'aluminium': 180 # 180 degrees
}

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
        
        # Get servo position for this category
        servo_position = SERVO_POSITIONS.get(category, 90)
        
        # TODO: Add your servo motor control code here
        # Example: control_servo(servo_position)
        print(f"🎯 Moving servo to {servo_position}° for {category}")
        
        # Example: If using GPIO/serial to control hardware
        # import RPi.GPIO as GPIO  # For Raspberry Pi
        # or
        # import serial  # For Arduino/ESP32 via serial
        # Send command to hardware here
        
        return jsonify({
            'status': 'success',
            'message': f'Servo moved to {servo_position}° for {category}',
            'servo_position': servo_position,
            'category': category
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
