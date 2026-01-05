import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface BinLocationData {
  binId: string;
  latitude: number;
  longitude: number;
  accuracy: number; // meters
  method: 'single' | 'watch' | 'ip';
  address?: string | null;
  updatedAt?: any; // serverTimestamp()
}

// Attempt a quick permission probe so we can fail fast on blocked geolocation in production
const ensurePermission = async () => {
  if (!('geolocation' in navigator)) {
    throw new Error('Geolocation not supported in this browser');
  }

  // Not all browsers support Permissions API; ignore failures gracefully
  try {
    const status = await (navigator as any).permissions?.query?.({ name: 'geolocation' as PermissionName });
    if (status?.state === 'denied') {
      throw new Error('Location permission denied. Please enable location access for this site.');
    }
  } catch (err) {
    console.warn('Permission probe skipped:', err);
  }
};

// Get a single high-accuracy position reading with a hard timeout
export const getBrowserLocation = async (): Promise<GeolocationPosition> => {
  await ensurePermission();

  const singleReading = new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  });

  // Fallback to watchPosition if getCurrentPosition hangs (seen on some mobile/hosted contexts)
  const watchReading = new Promise<GeolocationPosition>((resolve, reject) => {
    const watchId = navigator.geolocation.watchPosition(
      position => {
        navigator.geolocation.clearWatch(watchId);
        resolve(position);
      },
      error => {
        navigator.geolocation.clearWatch(watchId);
        reject(error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000
      }
    );
  });

  // Race both to avoid infinite "Locating" states
  return Promise.race([singleReading, watchReading]);
};

// Fallback: coarse IP-based location when GPS is blocked
const ipFallback = async (binId: string): Promise<BinLocationData | null> => {
  try {
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.latitude || !data?.longitude) return null;
    return {
      binId,
      latitude: Number(data.latitude),
      longitude: Number(data.longitude),
      accuracy: 50000, // very coarse
      method: 'ip',
      address: data.city ? `${data.city}, ${data.region}, ${data.country_name}` : null
    };
  } catch (err) {
    console.warn('IP fallback failed:', err);
    return null;
  }
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
    console.warn('Location capture failed, trying IP fallback:', e);
    const ipLoc = await ipFallback(binId);
    if (ipLoc) {
      await saveBinLocation(ipLoc);
      return ipLoc;
    }
    return null;
  }
};
