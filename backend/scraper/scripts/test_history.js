const { Pool } = require('pg');
const eventService = require('../src/services/data/eventService');
const { v4: uuidv4 } = require('uuid');

// Mock pool to intercept queries? No, let's use real DB but we need to run migrations first?
// Assuming migrations are run or we need to run DDL for audit_logs manually in script if not exist?
// Better: Check if table exists, if not create it TEMP?
// The user has likely NOT run migrations yet effectively since I just wrote it.
// So this script should probably try to create the schema if missing or fail gracefully.

const pool = new Pool({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT,
});

async function run() {
    console.log('--- Starting History Verification ---');

    // 1. Ensure Table Exists (Quick Hack for verification if migration didn't run)
    await pool.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL,
      entity_id UUID NOT NULL,
      action VARCHAR(50) NOT NULL,
      changes JSONB,
      performed_by VARCHAR(255),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

    // 2. Create Test Event
    const testId = uuidv4();
    console.log(`Creating test event: ${testId}`);
    await pool.query(`
    INSERT INTO events (id, title, date, start_time, source_code, status, is_published, created_at, updated_at)
    VALUES ($1, 'Test History Event', '2025-01-01', '2025-01-01T20:00:00Z', 'ra', 'MANUAL_DRAFT', false, NOW(), NOW())
  `, [testId]);

    try {
        // 3. Update Event (User Edit Simulation)
        console.log('Updating event via eventService...');
        // We mock the user object
        const mockUser = { id: 'user-123' };

        // We need to use eventService.update. It uses `pool` internally.
        // Ensure we are pointing to the same DB.
        // eventService update signature: update(id, updates, user)

        const updates = {
            title: 'Updated Title',
            description: 'New Description',
            start_time: '2025-01-01T21:00:00Z' // Changed
        };

        await eventService.update(testId, updates, mockUser);
        console.log('Event updated.');

        // 4. Verify Audit Log (User Edit)
        const logsV1 = await eventService.getHistory(testId);
        console.log('History entries found:', logsV1.length);

        const contentLog = logsV1.find(l => l.type === 'content' && l.action === 'UPDATE');
        if (contentLog) {
            console.log('✅ Found User Audit Log:', JSON.stringify(contentLog.changes));
            if (contentLog.changes.title.new === 'Updated Title') console.log('✅ Title diff verified');
            else console.error('❌ Title diff mismatch');
        } else {
            console.error('❌ Missing User Audit Log');
        }

        // 5. Simulate Scraper Update
        // Create scraped_event
        const scrapeId = 99999 + Math.floor(Math.random() * 1000);
        const scrapeSourceId = 'test-source-id-' + scrapeId;
        await pool.query(`
        INSERT INTO scraped_events(id, title, start_time, source_code, status, has_changes, changes, artists_json, source_event_id)
        VALUES($1, 'Scraped Title Override', '22:00:00', 'ra', 'review', true, $2, '[]', $3)
                `, [scrapeId, JSON.stringify({ title: 'Scraped Title Override', start_time: '2025-01-01T22:00:00Z' }), scrapeSourceId]);

        // Link it (needed for applyChanges "remaining" check, though not strictly for the update itself)
        // Actually applyChanges takes (eventId, scrapedEventId, fields).
        // BUT applyChanges checks `event_scraped_links` at the end to update has_pending_changes!
        // So we need to insert into event_scraped_links

        await pool.query(`INSERT INTO event_scraped_links (event_id, scraped_event_id) VALUES ($1, $2)`, [testId, scrapeId]);

        console.log('Applying Scraper Changes...');
        await eventService.applyChanges(testId, scrapeId, ['title', 'start_time']);
        console.log('Scraper Changes Applied.');

        // 6. Verify Audit Log (Scraper)
        const logsV2 = await eventService.getHistory(testId);
        const scraperLog = logsV2.find(l => l.type === 'content' && l.action === 'SCRAPER_UPDATE');

        if (scraperLog) {
            console.log('✅ Found Scraper Audit Log:', JSON.stringify(scraperLog.changes));
            if (scraperLog.changes.title.new === 'Scraped Title Override') console.log('✅ Scraper Title diff verified');
            else console.error('❌ Scraper Title diff mismatch');
        } else {
            console.error('❌ Missing Scraper Audit Log');
        }

    } catch (err) {
        console.error('Error during verification:', err);
    } finally {
        // Cleanup
        console.log('Cleaning up...');
        await pool.query('DELETE FROM event_scraped_links WHERE event_id = $1', [testId]);
        await pool.query('DELETE FROM events WHERE id = $1', [testId]);
        await pool.query('DELETE FROM audit_logs WHERE entity_id = $1', [testId]);
        await pool.query('DELETE FROM scraped_events WHERE title = \'Scraped Title Override\'');
        await pool.end();
    }
}

run();
