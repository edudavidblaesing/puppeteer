const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PGHOST || 'socialevents-db',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'eventuser',
    password: process.env.PGPASSWORD || 'eventpass',
    database: process.env.PGDATABASE || 'socialevents'
});

async function hardReset() {
    try {
        console.log('Connecting to database...');
        await pool.connect();

        console.log('Dropping public schema...');
        await pool.query('DROP SCHEMA public CASCADE');

        console.log('Recreating public schema...');
        await pool.query('CREATE SCHEMA public');

        console.log('Granting privileges...');
        await pool.query('GRANT ALL ON SCHEMA public TO public');
        await pool.query('GRANT ALL ON SCHEMA public TO eventuser'); // Ensure local user has access

        console.log('Database hard reset complete. Ready for migrations.');
    } catch (err) {
        console.error('Error resetting database:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

hardReset();
