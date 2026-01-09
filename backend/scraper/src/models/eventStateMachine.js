
const { pool } = require('@social-events/shared').db;

const EVENT_STATES = {
    SCRAPED_DRAFT: 'SCRAPED_DRAFT',
    MANUAL_DRAFT: 'MANUAL_DRAFT',
    REJECTED: 'REJECTED',
    APPROVED_PENDING_DETAILS: 'APPROVED_PENDING_DETAILS',
    READY_TO_PUBLISH: 'READY_TO_PUBLISH',
    PUBLISHED: 'PUBLISHED',
    CANCELED: 'CANCELED'
};

const ALLOWED_TRANSITIONS = {
    [EVENT_STATES.SCRAPED_DRAFT]: [EVENT_STATES.APPROVED_PENDING_DETAILS, EVENT_STATES.REJECTED],
    [EVENT_STATES.MANUAL_DRAFT]: [EVENT_STATES.APPROVED_PENDING_DETAILS, EVENT_STATES.REJECTED],
    [EVENT_STATES.APPROVED_PENDING_DETAILS]: [EVENT_STATES.READY_TO_PUBLISH, EVENT_STATES.CANCELED, EVENT_STATES.REJECTED],
    [EVENT_STATES.READY_TO_PUBLISH]: [EVENT_STATES.PUBLISHED, EVENT_STATES.CANCELED, EVENT_STATES.APPROVED_PENDING_DETAILS],
    [EVENT_STATES.PUBLISHED]: [EVENT_STATES.CANCELED],
    [EVENT_STATES.CANCELED]: [EVENT_STATES.APPROVED_PENDING_DETAILS],
    [EVENT_STATES.REJECTED]: [EVENT_STATES.APPROVED_PENDING_DETAILS]
};

const REQUIRED_FIELDS = [
    'title',
    'date',
    'start_time',
    'venue_name',
    'venue_city'
];

function canTransition(currentState, newState) {
    if (currentState === newState) return true;
    const allowed = ALLOWED_TRANSITIONS[currentState];
    return allowed && allowed.includes(newState);
}

function validateEventForPublish(event) {
    const missing = [];
    for (const field of REQUIRED_FIELDS) {
        if (!event[field]) {
            missing.push(field);
        }
    }

    if (!event.artists || (Array.isArray(event.artists) && event.artists.length === 0)) {
        // missing.push('artists');
    }

    return {
        isValid: missing.length === 0,
        missingFields: missing
    };
}

/**
 * Transitions an event state transactionally and logs history.
 * @param {Object} client - PG client (must be in transaction)
 * @param {string} eventId - UUID of event
 * @param {string} currentState - Current state
 * @param {string} newState - Target state
 * @param {string} actor - Actor performing action (default 'system')
 * @param {Object} metadata - Additional metadata
 * @returns {Promise<Object>} Updated event object
 */
async function transitionEvent(client, eventId, currentState, newState, actor = 'system', metadata = {}) {
    if (currentState === newState) return null; // No change

    if (!canTransition(currentState, newState)) {
        throw new Error(`Invalid state transition from ${currentState} to ${newState}`);
    }

    // Update status
    const updateRes = await client.query(
        'UPDATE events SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [newState, eventId]
    );

    if (updateRes.rows.length === 0) {
        throw new Error(`Event ${eventId} not found during transition`);
    }

    const updatedEvent = updateRes.rows[0];

    // Log history
    await client.query(
        `INSERT INTO event_state_history (event_id, previous_state, new_state, actor, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [eventId, currentState, newState, actor, JSON.stringify(metadata)]
    );

    return updatedEvent;
}

module.exports = {
    EVENT_STATES,
    ALLOWED_TRANSITIONS,
    canTransition,
    validateEventForPublish,
    transitionEvent
};
