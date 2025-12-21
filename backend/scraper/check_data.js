const { pool } = require('./src/db');

async function checkData() {
    try {
        console.log('Checking Artists with Wiki source...');
        const artists = await pool.query(`
            SELECT id, name, field_sources 
            FROM artists 
            WHERE field_sources::text LIKE '%wiki%' 
            LIMIT 5
        `);
        console.log(`Found ${artists.rows.length} artists:`);
        artists.rows.forEach(a => console.log(`- ${a.name}: ${JSON.stringify(a.field_sources)}`));

        console.log('\nChecking Venues with Wiki source...');
        const venues = await pool.query(`
            SELECT id, name, field_sources 
            FROM venues 
            WHERE field_sources::text LIKE '%wiki%' 
            LIMIT 5
        `);
        console.log(`Found ${venues.rows.length} venues:`);
        venues.rows.forEach(v => console.log(`- ${v.name}: ${JSON.stringify(v.field_sources)}`));

    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
    }
}
checkData();
