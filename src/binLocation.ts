import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface BinLocationData {
  binId: string;
  latitude: number;
  longitude: number;
  accuracy: number; // meters
  method: 'single' | 'watch';
  address?: string | null;
  updatedAt?: any; // serverTimestamp()
}

// Get a single high-accuracy position reading
export const getBrowserLocation = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Geolocation not supported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  });
};

// Optional reverse geocode using Google Maps API (if key present)
export const reverseGeocode = async (lat: number, lng: number): Promise<string | null> => {
  const apiKey = import.meta.env.VITE_MAPS_API_KEY;
  if (!apiKey) return null;
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) return null;
    return data.results[0].formatted_address || null;
  } catch (e) {
    console.warn('Reverse geocoding failed:', e);
    return null;
  }
};

// Save or update bin metadata/location document keyed by binId in `bins` collection
export const saveBinLocation = async (location: BinLocationData): Promise<void> => {
  const ref = doc(db, 'bins', location.binId);
  await setDoc(ref, {
    binId: location.binId,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    method: location.method,
    address: location.address || null,
    updatedAt: serverTimestamp()
  }, { merge: true });
};

// Convenience: capture & persist once (optionally reverse geocode)
export const captureAndStoreLocation = async (binId: string): Promise<BinLocationData | null> => {
  try {
    const pos = await getBrowserLocation();
    const { latitude, longitude, accuracy } = pos.coords;
    const address = await reverseGeocode(latitude, longitude);
    const data: BinLocationData = {
      binId,
      latitude,
      longitude,
      accuracy,
      method: 'single',
      address
    };
    await saveBinLocation(data);
    return data;
  } catch (e) {
    console.warn('Location capture failed:', e);
    return null;
  }
};
