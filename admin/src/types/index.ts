export interface Event {
  id: string;
  source_code: string;
  source_id: string | null;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  content_url: string | null;
  flyer_front: string | null;
  description: string | null;
  venue_id: string | null;
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_country: string | null;
  artists: string | null;
  listing_date: string | null;
  is_published: boolean;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  content_url: string | null;
}

export interface Artist {
  id: string;
  name: string;
  country: string | null;
  content_url: string | null;
}

export interface ApiResponse<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Stats {
  total_events: string;
  cities: string;
  venues: string;
  earliest_event: string;
  latest_event: string;
  events_by_city: { venue_city: string; count: string }[];
}

export interface City {
  id?: number;
  name: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone?: string | null;
  ra_area_id?: number | null;
  is_active?: boolean;
  event_count: number;
  venue_count: number;
}
