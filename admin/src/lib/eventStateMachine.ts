
export const EVENT_STATES = {
    SCRAPED_DRAFT: 'SCRAPED_DRAFT',
    MANUAL_DRAFT: 'MANUAL_DRAFT',
    REJECTED: 'REJECTED',
    APPROVED_PENDING_DETAILS: 'APPROVED_PENDING_DETAILS',
    READY_TO_PUBLISH: 'READY_TO_PUBLISH',
    PUBLISHED: 'PUBLISHED',
    CANCELED: 'CANCELED'
} as const;

export type EventStatusState = typeof EVENT_STATES[keyof typeof EVENT_STATES];

export const ALLOWED_TRANSITIONS: Record<EventStatusState, EventStatusState[]> = {
    [EVENT_STATES.SCRAPED_DRAFT]: [EVENT_STATES.APPROVED_PENDING_DETAILS, EVENT_STATES.READY_TO_PUBLISH, EVENT_STATES.REJECTED],
    [EVENT_STATES.MANUAL_DRAFT]: [EVENT_STATES.APPROVED_PENDING_DETAILS, EVENT_STATES.READY_TO_PUBLISH, EVENT_STATES.REJECTED],
    [EVENT_STATES.APPROVED_PENDING_DETAILS]: [EVENT_STATES.READY_TO_PUBLISH, EVENT_STATES.CANCELED, EVENT_STATES.REJECTED],
    [EVENT_STATES.READY_TO_PUBLISH]: [EVENT_STATES.PUBLISHED, EVENT_STATES.CANCELED, EVENT_STATES.APPROVED_PENDING_DETAILS],
    [EVENT_STATES.PUBLISHED]: [EVENT_STATES.CANCELED],
    [EVENT_STATES.CANCELED]: [EVENT_STATES.APPROVED_PENDING_DETAILS],
    [EVENT_STATES.REJECTED]: [EVENT_STATES.APPROVED_PENDING_DETAILS]
};

export const REQUIRED_FIELDS = [
    'title',
    'date',
    'start_time',
    'venue_name',
    'venue_city'
];

export function canTransition(currentState: EventStatusState, newState: EventStatusState): boolean {
    if (currentState === newState) return true;
    const allowed = ALLOWED_TRANSITIONS[currentState];
    return allowed ? allowed.includes(newState) : false;
}

export function validateEventForPublish(event: any): { isValid: boolean, missingFields: string[] } {
    const missing: string[] = [];
    for (const field of REQUIRED_FIELDS) {
        if (!event[field]) {
            missing.push(field);
        }
    }

    // Frontend specific validation if needed
    if (!event.artists || (Array.isArray(event.artists) && event.artists.length === 0)) {
        // missing.push('artists'); // Uncomment if artists are strictly required
    }

    return {
        isValid: missing.length === 0,
        missingFields: missing
    };
}
