const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PGHOST || 'socialevents-db',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'eventuser',
    password: process.env.PGPASSWORD || 'eventpass',
    database: process.env.PGDATABASE || 'socialevents'
});

async function resetDb() {
    try {
        console.log('Connecting to database...');
        await pool.connect();

        console.log('Fetching all tables...');
        const res = await pool.query(`
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public'
        `);

        if (res.rows.length === 0) {
            console.log('No tables found to truncate.');
            return;
        }

        const tables = res.rows.map(row => `"${row.tablename}"`).join(', ');

        console.log(`Truncating ${res.rows.length} tables: ${tables}`);

        // Truncate all tables at once with CASCADE
        await pool.query(`TRUNCATE TABLE ${tables} CASCADE`);

        console.log('Database reset (truncation) complete.');
    } catch (err) {
        console.error('Error resetting database:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

resetDb();
