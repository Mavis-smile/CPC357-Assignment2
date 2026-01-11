import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function normalizeArray<T = any>(data: any, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && Array.isArray(data[key])) return data[key] as T[];
  return [];
}

export interface Detection {
  _id?: string;
  id?: string;
  binId: string;
  itemClass: string;
  category: string;
  confidence: number;
  timestamp: Date | string;
  address?: string | null;
}

export interface Bin {
  _id?: string;
  id?: string;
  binId: string;
  latitude?: number;
  longitude?: number;
  fillLevels?: number[];
  address?: string | null;
  updatedAt?: Date | string | null;
  temperature?: number;
  humidity?: number;
  smokeLevel?: number;
  fireAlert?: boolean;
  inFireCooldown?: boolean;
  isActive?: boolean;
}

export interface Command {
  binId: string;
  action: string;
}

// Fetch all detections
export async function fetchDetections(limit = 200): Promise<Detection[]> {
  try {
    const response = await axios.get(`${API_BASE_URL}/detections?limit=${limit}`);
    const list = normalizeArray(response.data, 'detections');
    return list.map((d: any) => ({
      ...d,
      id: d._id?.toString() || d.id,
      timestamp: d.timestamp ? new Date(d.timestamp) : null,
    }));
  } catch (error) {
    console.error('Error fetching detections:', error);
    throw error;
  }
}

// Fetch all bins
export async function fetchBins(): Promise<Bin[]> {
  try {
    const response = await axios.get(`${API_BASE_URL}/bins`);
    const list = normalizeArray(response.data, 'bins');
    return list.map((b: any) => ({
      ...b,
      id: b._id?.toString() || b.id,
      updatedAt: b.updatedAt ? new Date(b.updatedAt) : null,
    }));
  } catch (error) {
    console.error('Error fetching bins:', error);
    throw error;
  }
}

// Send a command
export async function sendCommand(command: Command): Promise<void> {
  try {
    await axios.post(`${API_BASE_URL}/commands`, command);
  } catch (error) {
    console.error('Error sending command:', error);
    throw error;
  }
}

// Update bin data
export async function updateBin(binId: string, updates: Partial<Bin>): Promise<void> {
  try {
    await axios.patch(`${API_BASE_URL}/bins/${binId}`, updates);
  } catch (error) {
    console.error('Error updating bin:', error);
    throw error;
  }
}
