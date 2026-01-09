const { pool } = require('/usr/src/app/shared/src/db');
const eventService = require('/usr/src/app/shared/src/services/data/eventService');
const { EVENT_STATES } = require('/usr/src/app/shared/src/models/eventStateMachine');

async function run() {
    try {
        console.log('Fetching Draft events with pending changes...');
        const res = await pool.query(`
            SELECT e.id, se.id as scraped_id, se.changes
            FROM events e
            JOIN event_scraped_links esl ON esl.event_id = e.id
            JOIN scraped_events se ON se.id = esl.scraped_event_id
            WHERE (e.status = 'DRAFT' OR e.status = 'SCRAPED_DRAFT' OR e.status = 'MANUAL_DRAFT')
            AND se.has_changes = true
        `);

        console.log(`Found ${res.rows.length} drafts with pending changes.`);

        for (const row of res.rows) {
            console.log(`Applying changes for Event ${row.id}...`);
            try {
                const changes = row.changes || {};
                const fields = Object.keys(changes);
                
                if (fields.length > 0) {
                     await eventService.applyChanges(row.id, row.scraped_id, fields, 'system');
                } else {
                     await pool.query('UPDATE scraped_events SET has_changes = false WHERE id = ', [row.scraped_id]);
                }
                console.log(`Success.`);
            } catch (err) {
                console.error(`Failed to apply changes for ${row.id}:`, err);
            }
        }
        console.log('Done.');
    } catch (err) { 
        console.error(err);
    } finally {
        pool.end();
    }
}

run();
