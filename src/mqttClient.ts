/**
 * MQTT Client for Camera App
 * Publishes item detections directly to ESP32 MCU via MQTT broker
 */

import mqtt from 'mqtt';

// MQTT Configuration
const MQTT_BROKER_URL = import.meta.env.VITE_MQTT_BROKER_URL || 'ws://localhost:9001';
const MQTT_TOPIC_ITEM_DETECTED = 'smartbin/item';

// MQTT Client
let client: mqtt.MqttClient | null = null;
let isConnected = false;

/**
 * Initialize MQTT connection
 */
export const initializeMQTT = () => {
  if (client) {
    console.log('MQTT client already initialized');
    return client;
  }

  console.log('Connecting to MQTT broker:', MQTT_BROKER_URL);
  
  client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `camera_${Math.random().toString(16).substring(2, 8)}`,
    clean: true,
    reconnectPeriod: 5000,
  });

  client.on('connect', () => {
    isConnected = true;
    console.log('✅ Connected to MQTT broker');
  });

  client.on('error', (error) => {
    console.error('❌ MQTT connection error:', error);
    isConnected = false;
  });

  client.on('disconnect', () => {
    isConnected = false;
    console.log('⚠️ Disconnected from MQTT broker');
  });

  client.on('reconnect', () => {
    console.log('🔄 Reconnecting to MQTT broker...');
  });

  return client;
};

/**
 * Publish item detection to MQTT for immediate servo control
 */
export interface ItemDetection {
  binId: string;
  category: string;
  itemClass: string;
  confidence: number;
  latitude?: number;
  longitude?: number;
}

export const publishItemDetection = (detection: ItemDetection): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    if (!client || !isConnected) {
      console.warn('⚠️ MQTT not connected, trying to reconnect...');
      initializeMQTT();
      
      // Wait for connection
      setTimeout(() => {
        if (!isConnected) {
          console.error('❌ MQTT still not connected after retry');
          reject(new Error('MQTT not connected'));
          return;
        }
        publishMessage(detection, resolve, reject);
      }, 1000);
      return;
    }

    publishMessage(detection, resolve, reject);
  });
};

const publishMessage = (
  detection: ItemDetection,
  resolve: (value: boolean) => void,
  reject: (reason?: any) => void
) => {
  const payload = JSON.stringify({
    binId: detection.binId,
    category: detection.category,
    itemClass: detection.itemClass,
    confidence: detection.confidence,
    latitude: detection.latitude || 0,
    longitude: detection.longitude || 0,
    timestamp: Date.now()
  });

  client!.publish(MQTT_TOPIC_ITEM_DETECTED, payload, { qos: 1 }, (error) => {
    if (error) {
      console.error('❌ Failed to publish item detection:', error);
      reject(error);
    } else {
      console.log('📤 Item detection published to MQTT:', {
        binId: detection.binId,
        category: detection.category,
        itemClass: detection.itemClass,
        confidence: detection.confidence
      });
      resolve(true);
    }
  });
};

/**
 * Check MQTT connection status
 */
export const isMQTTConnected = (): boolean => {
  return isConnected;
};

/**
 * Disconnect MQTT client
 */
export const disconnectMQTT = () => {
  if (client) {
    client.end();
    client = null;
    isConnected = false;
    console.log('MQTT client disconnected');
  }
};

// Auto-initialize on module load
initializeMQTT();
