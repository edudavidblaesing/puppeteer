const { pool } = require('./src/db');
const venueService = require('./src/services/data/venueService');
const eventService = require('./src/services/data/eventService');

async function run() {
    try {
        const mockUser = { id: 'mock-user-123', username: 'mockuser' };

        console.log('--- Testing Venue Creation Audit ---');
        const venueData = {
            name: `Test Venue ${Date.now()}`,
            address: '123 Test St',
            city: 'Berlin',
            country: 'Germany',
            latitude: 52.5200,
            longitude: 13.4050
        };
        // Creating Venue
        console.log("Calling venueService.create...");
        const venue = await venueService.create(venueData, mockUser);
        console.log(`Venue created: ${venue.id}`);

        const venueLog = await pool.query(
            "SELECT * FROM audit_logs WHERE entity_type = 'venue' AND entity_id = $1",
            [venue.id]
        );
        console.log('Venue Audit Log Performed By:', venueLog.rows[0]?.performed_by);
        if (venueLog.rows[0]?.performed_by === mockUser.id) {
            console.log('✅ Venue Audit Performed By matches mock user');
        } else {
            console.error('❌ Venue Audit Performed By MISMATCH or Missing Log');
        }

        console.log('\n--- Testing Event Creation Audit ---');
        const eventData = {
            title: `Test Event ${Date.now()}`,
            date: '2025-12-31',
            start_time: '20:00',
            venue_id: venue.id,
            venue_name: venue.name,
            venue_city: venue.city,
            venue_country: venue.country
        };
        // Creating Event
        console.log("Calling eventService.create...");
        const event = await eventService.create(eventData, [], mockUser);
        console.log(`Event created: ${event.id}`);

        const eventLog = await pool.query(
            "SELECT * FROM audit_logs WHERE entity_type = 'event' AND entity_id = $1 AND action = 'CREATE'",
            [event.id]
        );
        console.log('Event Audit Log Performed By:', eventLog.rows[0]?.performed_by);
        if (eventLog.rows[0]?.performed_by === mockUser.id) {
            console.log('✅ Event Creation Audit Performed By matches mock user');
        } else {
            console.error('❌ Event Creation Audit Performed By MISMATCH or Missing Log');
        }

    } catch (err) {
        console.error('Error:', err);
    } finally {
        pool.end();
    }
}

run();
