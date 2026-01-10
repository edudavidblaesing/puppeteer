const { catchAsync, AppError } = require('@social-events/shared');
const { extractColorsFromImage } = require('@social-events/shared/src/services/colorService');
const { services: { eventService } } = require('@social-events/shared');
const eventStateMachine = require('@social-events/shared').models.eventStateMachine;


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

async function getEventUsage(req, res) {
    try {
        const usage = await eventService.getUsage(req.params.id);
        res.json(usage);
    } catch (error) {
        console.error('Error in getEventUsage:', error);
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
        const newEvent = await eventService.create(eventData, artists_list, req.user);
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

async function extractEventColors(req, res) {
    try {
        const event = await eventService.findById(req.params.id);
        if (!event) return res.status(404).json({ error: 'Event not found' });

        if (!event.flyer_front) return res.status(400).json({ error: 'Event has no flyer image' });

        const colors = await extractColorsFromImage(event.flyer_front);

        // Persist
        const updated = await eventService.update(req.params.id, { colors }, req.user);

        res.json({ status: 'success', data: { colors: updated.colors } });
    } catch (error) {
        console.error('Extract colors error:', error);
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
        const id = req.query.id || req.params.id;
        if (!id) return res.status(400).json({ error: 'Event ID required' });
        const result = await eventService.getChanges(id);
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

        const result = await eventService.applyChanges(id, scraped_event_id, fields, req.user?.id || 'system');
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

async function cleanupExpired(req, res) {
    try {
        const result = await eventService.rejectExpiredDrafts();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error cleaning up expired drafts:', error);
        res.status(500).json({ error: error.message });
    }
}

async function getHistory(req, res) {
    try {
        const history = await eventService.getHistory(req.params.id);
        res.json({ data: history });
    } catch (error) {
        console.error('Error in getHistory:', error);
        res.status(500).json({ error: error.message });
    }
}

async function searchSource(req, res) {
    try {
        const { source, query } = req.query;
        if (!query) return res.json([]);
        const { services } = require('@social-events/shared');
        // We need to import scraperService dynamically or ensure it's available. 
        // Typically shared lib doesn't include scraper service.
        // We might need to call scraper service directly if in same monorepo or use shared logic.
        // Assuming scraper service logic is imported in controller for now or moved to shared?
        // Wait, scraperService is in `backend/scraper`, controller is in `backend/api`.
        // They are separate packages usually.
        // If they are separate, `api` cannot require `scraper`.
        // But the user has them in same workspace.

        // Let's assume for now we use a direct require if feasible, otherwise we need a shared service.
        // Given structure: `backend/api` and `backend/scraper`.
        // `api` depends on `shared`. `scraper` depends on `shared`.
        // `api` usually DOES NOT depend on `scraper`.
        // If so, `searchSource` should be in `scraper` service and `api` calls it via HTTP or similar?
        // OR we move `searchEvents` to `shared/src/services/scraper/`?

        // Valid approach: The user requested to "Add searchSource endpoint in eventController (proxy to scraper service)".
        // If scraper service is a running service, we should call it.
        // If it's just code, we might duplicate it or move it.
        // However, looking at `eventController.js` imports:
        // `const { services: { eventService } } = require('@social-events/shared');`

        // I will try to Require it relative path if allowed, or implementing search directly in controller (bad practice).
        // Best bet: use `scraperService` from where I just edited it: `backend/scraper/src/services/scraperService.js`.
        // Path from `backend/api/src/controllers/eventController.js`:
        // `../../../scraper/src/services/scraperService`

        const sourceSearchService = require('../services/sourceSearchService');
        const results = await sourceSearchService.searchEvents(source, query);
        res.json(results);
    } catch (error) {
        console.error('Search source error:', error);
        res.status(500).json({ error: error.message });
    }
}

async function linkSource(req, res) {
    try {
        const { id } = req.params;
        const { sourceCode, sourceEventId } = req.body;
        const result = await eventService.manualLinkSource(id, sourceCode, sourceEventId, req.user?.id || 'system');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    listEvents,
    getEvent,
    getEventUsage,
    getHistory,
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
    syncVenueCoords,
    cleanupExpired,
    cleanupExpired,
    searchSource,
    linkSource,
    extractEventColors
};
