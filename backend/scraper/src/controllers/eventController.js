const { v4: uuidv4 } = require('uuid');
const { pool } = require('../db');
const { geocodeAddress } = require('../services/geocoder');
const eventService = require('../services/data/eventService');
const { EVENT_STATES } = require('../models/eventStateMachine'); // Keep constants if needed by controller logic not moved yet

// -----------------------------------------------------------------------------
// READ OPERATIONS
// -----------------------------------------------------------------------------


async function listEvents(req, res) {
    try {
        // Trigger auto-rejection of past drafts lazily (could be moved to service or cron)
        // await autoRejectPastEvents(); // Keeping it here or moving? Ideally separate. 
        // For now, let's keep the side effect or assuming it's done elsewhere. 
        // Original code had it. Let's keep it but maybe it should be a service method too.

        const params = req.query;
        const events = await eventService.findEvents(params);
        const total = await eventService.countEvents(params);

        res.json({
            data: events,
            total: total,
            limit: parseInt(params.limit || 100),
            offset: parseInt(params.offset || 0)
        });
    } catch (error) {
        if (error.code === '42P01') {
            return res.json({ data: [], total: 0, limit: parseInt(req.query.limit || 100), offset: 0 });
        }
        console.error('Error in listEvents:', error);
        res.status(500).json({ error: error.message });
    }
}

async function getEvent(req, res) {
    try {
        const event = await eventService.findById(req.params.id);
        if (!event) return res.status(404).json({ error: 'Event not found' });
        res.json(event);
    } catch (error) {
        console.error('Error in getEvent:', error);
        res.status(500).json({ error: error.message });
    }
}

async function getRecentUpdates(req, res) {
    try {
        const { limit } = req.query;
        const result = await eventService.getRecentUpdates(limit);
        res.json(result);
    } catch (error) {
        res.json({ data: [], total: 0 });
    }
}

async function getMapEvents(req, res) {
    try {
        const result = await eventService.getMapEvents(req.query);
        res.json(result);
    } catch (error) {
        console.error('Error fetching map events:', error);
        res.json({ data: [], total: 0 });
    }
}


// -----------------------------------------------------------------------------
// WRITE OPERATIONS
// -----------------------------------------------------------------------------



async function createEvent(req, res) {
    try {
        const { artists_list, ...eventData } = req.body;
        const newEvent = await eventService.create(eventData, artists_list);
        res.json(newEvent);
    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({ error: error.message });
    }
}

async function updateEvent(req, res) {
    try {
        const { id } = req.params;
        const updates = req.body;
        console.log(`[EventController] Updating event ${id} with:`, JSON.stringify(updates).substring(0, 200));

        const updatedEvent = await eventService.update(id, updates, req.user);
        res.json(updatedEvent);
    } catch (error) {
        console.error(`[EventController] Update failed for ${req.params.id}:`, error);
        if (error.message === 'Event not found') return res.status(404).json({ error: 'Event not found' });
        if (error.message.startsWith('Invalid state')) return res.status(400).json({ error: error.message });
        if (error.message.startsWith('Missing fields')) return res.status(400).json({ error: error.message });
        res.status(500).json({ error: error.message });
    }
}

async function deleteEvent(req, res) {
    try {
        const success = await eventService.delete(req.params.id);
        if (!success) return res.status(404).json({ error: 'Event not found' });
        res.json({ success: true, deleted: req.params.id });
    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ error: error.message });
    }
}

async function deleteAllEvents(req, res) {
    try {
        const deletedCount = await eventService.deleteAll();
        res.json({ success: true, deleted: deletedCount });
    } catch (error) {
        console.error('Delete all events error:', error);
        res.status(500).json({ error: error.message });
    }
}

async function getChanges(req, res) {
    try {
        const result = await eventService.getChanges(req.params.id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function applyChanges(req, res) {
    try {
        const { id } = req.params;
        const { scraped_event_id, fields } = req.body;
        if (!scraped_event_id) return res.status(400).json({ error: 'scraped_event_id required' });

        const result = await eventService.applyChanges(id, scraped_event_id, fields);
        res.json(result);
    } catch (error) {
        if (error.message === 'Scraped event not found') return res.status(404).json({ error: 'Scraped event not found' });
        if (error.message === 'No fields to update') return res.status(400).json({ error: 'No fields to update' });
        console.error('Error applying changes:', error);
        res.status(500).json({ error: error.message });
    }
}

async function dismissChanges(req, res) {
    try {
        const { id } = req.params;
        const { scraped_event_id } = req.body;
        if (!scraped_event_id) return res.status(400).json({ error: 'scraped_event_id required' });

        const result = await eventService.dismissChanges(id, scraped_event_id);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function publishStatus(req, res) {
    try {
        const { ids, status } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids required' });

        const result = await eventService.publishStatus(ids, status, req.user?.id || 'admin');
        res.json({ success: true, results: result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function syncEvents(req, res) {
    try {
        const events = req.body.events || req.body;
        if (!Array.isArray(events)) return res.status(400).json({ error: 'Expected array of events' });

        const result = await eventService.syncEvents(events);
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

async function syncVenueCoords(req, res) {
    try {
        const updated = await eventService.syncVenueCoords();
        res.json({ success: true, updated });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    listEvents,
    getEvent,
    getRecentUpdates,
    getMapEvents,
    createEvent,
    updateEvent,
    deleteEvent,
    deleteAllEvents,
    getChanges,
    applyChanges,
    dismissChanges,
    publishStatus,
    syncEvents,
    syncVenueCoords
};
