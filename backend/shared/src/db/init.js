const { Pool } = require('pg');

// Database configuration
const DB_CONFIG = {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'eventuser',
    password: process.env.PGPASSWORD || 'eventpassword',
    database: process.env.PGDATABASE || 'socialevents'
};

async function initializeDatabase() {
    console.log('[DB Init] Starting database initialization...');

    // Try connecting with postgres superuser first (for Docker), fall back to regular user
    const adminUser = process.env.POSTGRES_USER || 'postgres';
    const adminPassword = process.env.POSTGRES_PASSWORD || DB_CONFIG.password;

    let adminPool = new Pool({
        host: DB_CONFIG.host,
        port: DB_CONFIG.port,
        user: adminUser,
        password: adminPassword,
        database: 'postgres' // Connect to default postgres database
    });

    try {
        // Check if our database exists
        const dbCheck = await adminPool.query(
            "SELECT 1 FROM pg_database WHERE datname = $1",
            [DB_CONFIG.database]
        );

        if (dbCheck.rows.length === 0) {
            console.log(`[DB Init] Database '${DB_CONFIG.database}' does not exist. Creating...`);
            await adminPool.query(`CREATE DATABASE ${DB_CONFIG.database}`);
            console.log(`[DB Init] Database '${DB_CONFIG.database}' created successfully`);

            // Grant privileges to the app user if different from admin
            if (adminUser !== DB_CONFIG.user) {
                await adminPool.query(`GRANT ALL PRIVILEGES ON DATABASE ${DB_CONFIG.database} TO ${DB_CONFIG.user}`);
                console.log(`[DB Init] Granted privileges to user '${DB_CONFIG.user}'`);
            }
        } else {
            console.log(`[DB Init] Database '${DB_CONFIG.database}' exists`);
        }
    } catch (error) {
        console.error('[DB Init] Error with admin connection:', error.message);

        // If admin connection failed, try with the regular user
        console.log('[DB Init] Trying connection with regular user...');
        await adminPool.end();

        adminPool = new Pool({
            host: DB_CONFIG.host,
            port: DB_CONFIG.port,
            user: DB_CONFIG.user,
            password: DB_CONFIG.password,
            database: 'postgres'
        });

        try {
            const dbCheck = await adminPool.query(
                "SELECT 1 FROM pg_database WHERE datname = $1",
                [DB_CONFIG.database]
            );

            if (dbCheck.rows.length === 0) {
                console.log(`[DB Init] Database '${DB_CONFIG.database}' does not exist. Creating with regular user...`);
                await adminPool.query(`CREATE DATABASE ${DB_CONFIG.database}`);
                console.log(`[DB Init] Database '${DB_CONFIG.database}' created successfully`);
            }
        } catch (innerError) {
            console.error('[DB Init] Could not create database with regular user either:', innerError.message);
            console.error('[DB Init] Please create the database manually or ensure user has CREATEDB privilege');
        }
    } finally {
        await adminPool.end();
    }
}

module.exports = { initializeDatabase, DB_CONFIG };
