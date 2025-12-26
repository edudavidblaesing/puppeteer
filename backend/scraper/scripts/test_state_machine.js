
const { pool } = require('../src/db');
const { createEvent, updateEvent, publishStatus, deleteEvent } = require('../src/controllers/eventController');
const { EVENT_STATES } = require('../src/models/eventStateMachine');

// Mock Request/Response
const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.data = data;
        return res;
    };
    return res;
};

async function runTests() {
    console.log('Starting State Machine Tests...');
    let eventId = null;

    try {
        // 1. Test Create Event (Default Status)
        console.log('\n[Test 1] Create Event');
        const reqCreate = {
            body: {
                title: 'Test Event ' + Date.now(),
                venue_name: 'Test Venue',
                date: '2025-01-01',
                start_time: '20:00'
            }
        };
        const resCreate = mockRes();
        await createEvent(reqCreate, resCreate);

        if (resCreate.data && resCreate.data.id) {
            eventId = resCreate.data.id;
            console.log('Created Event ID:', eventId);
            console.log('Status:', resCreate.data.status);
            if (resCreate.data.status !== EVENT_STATES.MANUAL_DRAFT) {
                console.error('FAIL: Expected MANUAL_DRAFT, got', resCreate.data.status);
            } else {
                console.log('PASS: Initial status is MANUAL_DRAFT');
            }
        } else {
            throw new Error('Failed to create event');
        }

        // 2. Test Invalid Transition (MANUAL_DRAFT -> PUBLISHED)
        console.log('\n[Test 2] Invalid Transition (MANUAL_DRAFT -> PUBLISHED)');
        const reqUpdateInvalid = {
            params: { id: eventId },
            body: { status: EVENT_STATES.PUBLISHED }
        };
        const resUpdateInvalid = mockRes();
        await updateEvent(reqUpdateInvalid, resUpdateInvalid);

        if (resUpdateInvalid.statusCode === 400) {
            console.log('PASS: Blocked invalid transition');
        } else {
            console.error('FAIL: Should have blocked transition. Status:', resUpdateInvalid.statusCode);
        }

        // 3. Test Valid Transition (MANUAL_DRAFT -> APPROVED_PENDING_DETAILS)
        console.log('\n[Test 3] Valid Transition (MANUAL_DRAFT -> APPROVED_PENDING_DETAILS)');
        const reqUpdateValid = {
            params: { id: eventId },
            body: { status: EVENT_STATES.APPROVED_PENDING_DETAILS }
        };
        const resUpdateValid = mockRes();
        await updateEvent(reqUpdateValid, resUpdateValid);

        if (resUpdateValid.data.status === EVENT_STATES.APPROVED_PENDING_DETAILS) {
            console.log('PASS: Transition successful');
        } else {
            console.error('FAIL: Transition failed', resUpdateValid.data);
        }

        // Verify history log
        const historyRes = await pool.query('SELECT * FROM event_state_history WHERE event_id = $1 ORDER BY created_at DESC', [eventId]);
        if (historyRes.rows.length === 0) {
            console.error('FAIL: History failed: No history record found for APPROVED_PENDING_DETAILS transition');
        } else {
            const latestHistory = historyRes.rows[0];
            if (latestHistory.previous_state !== 'MANUAL_DRAFT' || latestHistory.new_state !== 'APPROVED_PENDING_DETAILS') {
                console.error(`FAIL: History failed: Expected MANUAL_DRAFT -> APPROVED_PENDING_DETAILS, got ${latestHistory.previous_state} -> ${latestHistory.new_state}`);
            } else {
                console.log('PASS: History logged correctly for valid transition');
            }
        }

        // 4. Test Validation Failure (APPROVED -> READY_TO_PUBLISH with missing fields)
        console.log('\n[Test 4] Validation Failure (Missing fields for READY_TO_PUBLISH)');
        const reqUpdateValidation = {
            params: { id: eventId },
            body: { status: EVENT_STATES.READY_TO_PUBLISH }
        };
        const resUpdateValidation = mockRes();
        await updateEvent(reqUpdateValidation, resUpdateValidation);

        if (resUpdateValidation.statusCode === 400 && resUpdateValidation.data.error.includes('Missing required fields')) {
            console.log('PASS: Validation blocked missing fields');
        } else {
            console.error('FAIL: Should have blocked. Code:', resUpdateValidation.statusCode, 'Data:', resUpdateValidation.data);
        }

        // 5. Test Validation Success (Add fields -> READY_TO_PUBLISH)
        console.log('\n[Test 5] Validation Success (Add fields -> READY_TO_PUBLISH)');
        const reqUpdateFields = {
            params: { id: eventId },
            body: {
                status: EVENT_STATES.READY_TO_PUBLISH,
                description: 'A valid description',
                event_type: 'concert',
                // Assuming venue info was added in create, but checking minimal requirements
                // We might need to ensure venue properties are set.
                // Re-using create data: venue_name was set.
            }
        };
        // Need to ensure venue is linked or has name/city.
        // Actually validation requires: title, date, start_time, (venue_id OR (venue_name, venue_city)), description OR flyer_front OR content_url, event_type.
        // Created with: title, date, start_time, venue_name. 
        // Missing: venue_city, description/flyer/url, event_type (defaulted?).
        // Let's add venue_city too.
        reqUpdateFields.body.venue_city = 'Test City';

        const resUpdateFields = mockRes();
        await updateEvent(reqUpdateFields, resUpdateFields);

        if (resUpdateFields.data.status === EVENT_STATES.READY_TO_PUBLISH) {
            console.log('PASS: Transition to READY_TO_PUBLISH successful');
        } else {
            console.error('FAIL: Transition failed', resUpdateFields.data);
        }

        // 6. Test PublishStatus (Bulk Publish)
        console.log('\n[Test 6] Bulk Publish (READY_TO_PUBLISH -> PUBLISHED)');
        const reqPublish = {
            body: {
                ids: [eventId],
                status: EVENT_STATES.PUBLISHED
            }
        };
        const resPublish = mockRes();
        await publishStatus(reqPublish, resPublish);

        if (resPublish.data.success && resPublish.data.results.success.includes(eventId)) {
            console.log('PASS: Bulk publish successful');
        } else {
            console.error('FAIL: Bulk publish failed', resPublish.data);
        }

        // Verify history text for publish
        const publishHistoryRes = await pool.query('SELECT * FROM event_state_history WHERE event_id = $1 AND new_state = $2', [eventId, 'PUBLISHED']);
        if (publishHistoryRes.rows.length === 0) {
            console.error('FAIL: History failed: No history record found for PUBLISHED transition');
        } else {
            console.log('PASS: History logged correctly for bulk publish');
        }

    } catch (err) {
        console.error('Test Suite Error:', err);
    } finally {
        // Cleanup
        if (eventId) {
            console.log('\nCleaning up...');
            await deleteEvent({ params: { id: eventId } }, mockRes());
        }
        await pool.end();
    }
}

runTests();
