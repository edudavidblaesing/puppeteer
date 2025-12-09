// Publish status: pending (needs review), approved (published), rejected (hidden)
export type PublishStatus = 'pending' | 'approved' | 'rejected';

// Event timing category for display
export type EventTiming = 'upcoming' | 'ongoing' | 'recent' | 'expired';

// Event type classification
export type EventType = 'event' | 'club' | 'concert' | 'festival' | 'exhibition' | 'workshop' | 'party' | 'performance' | 'rave' | 'listening';

// Event type display config
export const EVENT_TYPES: { value: EventType; label: string; icon: string; color: string }[] = [
  { value: 'event', label: 'Event', icon: '📅', color: 'gray' },
  { value: 'club', label: 'Club Night', icon: '🎧', color: 'purple' },
  { value: 'concert', label: 'Concert', icon: '🎸', color: 'red' },
  { value: 'festival', label: 'Festival', icon: '🎪', color: 'orange' },
  { value: 'exhibition', label: 'Exhibition', icon: '🎨', color: 'pink' },
  { value: 'workshop', label: 'Workshop', icon: '🛠️', color: 'blue' },
  { value: 'party', label: 'Party', icon: '🎉', color: 'yellow' },
  { value: 'performance', label: 'Performance', icon: '🎭', color: 'indigo' },
  { value: 'rave', label: 'Rave', icon: '⚡', color: 'green' },
  { value: 'listening', label: 'Listening', icon: '🎵', color: 'cyan' },
];

// Source reference from scraped events
export interface SourceReference {
  id: string;
  source_code: string;
  title: string;
  confidence?: number;
}

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
  publish_status: PublishStatus;
  is_published: boolean; // kept for backwards compatibility
  event_type: EventType;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  source_references?: SourceReference[];
  organizers_list?: { id: string; name: string }[];
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
  venue_type?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface Artist {
  id: string;
  name: string;
  country: string | null;
  content_url: string | null;
  image_url?: string | null;
  genres?: string[] | null;
  bio?: string | null;
}

export interface Organizer {
  id: string;
  name: string;
  description?: string | null;
  website_url?: string | null;
  image_url?: string | null;
  event_count?: number;
  created_at?: string;
  updated_at?: string;
}

// Event-Artist relationship
export interface EventArtist {
  id: number;
  event_id: string;
  artist_id: string;
  role: 'performer' | 'headliner' | 'support' | 'dj' | 'host';
  billing_order: number;
  start_time?: string | null;
  end_time?: string | null;
  // Joined from artists table
  name?: string;
  image_url?: string;
  country?: string;
  genres?: string[];
}

// Country for dropdown
export interface Country {
  id?: number;
  name: string;
  code?: string;
  continent?: string;
  is_active?: boolean;
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

export interface DashboardStats {
  totals: {
    events: number;
    artists: number;
    venues: number;
    cities: number;
    published_events: number;
    unpublished_events: number;
  };
  upcoming_events: number;
  events_this_week: number;
  recent_events: Event[];
}

// Helper function to parse time from either "HH:mm:ss" or ISO timestamp format
function parseTime(timeStr: string | null | undefined): [number, number] {
  if (!timeStr) return [0, 0];

  // Check if it's an ISO timestamp (contains 'T')
  if (timeStr.includes('T')) {
    const date = new Date(timeStr);
    return [date.getHours(), date.getMinutes()];
  }

  // Otherwise treat as "HH:mm" or "HH:mm:ss" format
  const parts = timeStr.split(':').map(Number);
  return [parts[0] || 0, parts[1] || 0];
}

// Helper function to determine event timing category
export function getEventTiming(event: Event): EventTiming {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const eventDate = new Date(event.date);
  const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

  // Parse start and end times if available
  const startTime = parseTime(event.start_time);
  const endTime = event.end_time ? parseTime(event.end_time) : [23, 59] as [number, number];

  const eventStart = new Date(eventDateOnly);
  eventStart.setHours(startTime[0], startTime[1]);

  const eventEnd = new Date(eventDateOnly);
  eventEnd.setHours(endTime[0], endTime[1]);
  // If end time is before start time, event ends next day
  if (endTime[0] < startTime[0]) {
    eventEnd.setDate(eventEnd.getDate() + 1);
  }

  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  if (now >= eventStart && now <= eventEnd) {
    return 'ongoing';
  } else if (eventDateOnly > today) {
    return 'upcoming';
  } else if (eventDateOnly >= threeDaysAgo) {
    return 'recent'; // expired within last 3 days
  } else {
    return 'expired';
  }
}

// Sort events: approved first, then by timing (upcoming -> ongoing -> recent -> expired)
export function sortEventsSmart(events: Event[]): Event[] {
  const timingOrder: Record<EventTiming, number> = {
    'ongoing': 0,
    'upcoming': 1,
    'recent': 2,
    'expired': 3
  };

  const statusOrder: Record<PublishStatus, number> = {
    'approved': 0,
    'pending': 1,
    'rejected': 2
  };

  return [...events].sort((a, b) => {
    // First sort by timing
    const timingA = timingOrder[getEventTiming(a)];
    const timingB = timingOrder[getEventTiming(b)];
    if (timingA !== timingB) return timingA - timingB;

    // Then by publish status
    const statusA = statusOrder[a.publish_status || 'pending'];
    const statusB = statusOrder[b.publish_status || 'pending'];
    if (statusA !== statusB) return statusA - statusB;

    // Finally by date (ascending for upcoming, descending for past)
    const dateA = new Date(a.date).getTime();
    const dateB = new Date(b.date).getTime();
    if (timingA <= 1) { // upcoming or ongoing
      return dateA - dateB; // soonest first
    } else {
      return dateB - dateA; // most recent first
    }
  });
}
