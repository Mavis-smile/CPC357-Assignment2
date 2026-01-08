export interface BinLocationPayload {
  binId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  method: 'single' | 'watch' | 'ip';
  address?: string | null;
}

export interface DetectionPayload {
  documentId: string;
  binId: string;
  itemClass: string;
  category: string;
  confidence: number;
  detectedAt: string;
  address?: string | null;
  latitude?: number;
  longitude?: number;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000/api';

const normalizeBase = (base: string) => base.replace(/\/$/, '');

const request = async (path: string, body: unknown, method: 'POST' | 'PUT' = 'POST'): Promise<void> => {
  const url = `${normalizeBase(API_BASE)}${path}`;
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${method} ${path} failed with ${res.status}: ${text}`);
  }
};

export const upsertBinLocation = async (payload: BinLocationPayload): Promise<void> => {
  await request(`/bins/${encodeURIComponent(payload.binId)}/location`, payload, 'PUT');
};

export const postDetection = async (payload: DetectionPayload): Promise<void> => {
  await request('/detections', payload, 'POST');
};
