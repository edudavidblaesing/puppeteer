import { Event } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://pptr.davidblaesing.com';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'your-secure-api-key-here';

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY,
};

export async function fetchEvents(params?: {
  city?: string;
  limit?: number;
  offset?: number;
  from?: string;
  to?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.limit) searchParams.set('limit', params.limit.toString());
  if (params?.offset) searchParams.set('offset', params.offset.toString());
  if (params?.from) searchParams.set('from', params.from);
  if (params?.to) searchParams.set('to', params.to);

  const response = await fetch(`${API_URL}/db/events?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch events');
  return response.json();
}

export async function fetchEvent(id: string) {
  const response = await fetch(`${API_URL}/db/events/${id}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch event');
  return response.json();
}

export async function updateEvent(id: string, data: Partial<Event>) {
  const response = await fetch(`${API_URL}/db/events/${id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update event');
  return response.json();
}

export async function deleteEvent(id: string) {
  const response = await fetch(`${API_URL}/db/events/${id}`, {
    method: 'DELETE',
    headers,
  });
  if (!response.ok) throw new Error('Failed to delete event');
  return response.json();
}

export async function publishEvents(ids: string[], publish: boolean) {
  const response = await fetch(`${API_URL}/db/events/publish`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids, publish }),
  });
  if (!response.ok) throw new Error('Failed to update publish status');
  return response.json();
}

export async function syncEvents(city: string, limit: number = 100) {
  const response = await fetch(`${API_URL}/db/sync`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ city, limit }),
  });
  if (!response.ok) throw new Error('Failed to sync events');
  return response.json();
}

export async function fetchStats() {
  const response = await fetch(`${API_URL}/db/stats`, { headers });
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

export async function fetchVenues(params?: { city?: string; limit?: number }) {
  const searchParams = new URLSearchParams();
  if (params?.city) searchParams.set('city', params.city);
  if (params?.limit) searchParams.set('limit', params.limit.toString());

  const response = await fetch(`${API_URL}/db/venues?${searchParams}`, { headers });
  if (!response.ok) throw new Error('Failed to fetch venues');
  return response.json();
}

export async function fetchEnrichStats() {
  const response = await fetch(`${API_URL}/db/enrich/stats`, { headers });
  if (!response.ok) throw new Error('Failed to fetch enrich stats');
  return response.json();
}

export async function enrichVenues(limit: number = 50) {
  const response = await fetch(`${API_URL}/db/venues/enrich`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ limit }),
  });
  if (!response.ok) throw new Error('Failed to enrich venues');
  return response.json();
}

export async function enrichArtists(limit: number = 100) {
  const response = await fetch(`${API_URL}/db/artists/enrich`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ limit }),
  });
  if (!response.ok) throw new Error('Failed to enrich artists');
  return response.json();
}
