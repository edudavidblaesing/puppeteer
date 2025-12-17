const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'eventuser',
    password: process.env.PGPASSWORD || 'eventpass',
    database: process.env.PGDATABASE || 'socialevents'
};

async function migrate() {
    console.log('Starting migrations via Node.js...');
    const pool = new Pool(DB_CONFIG);

    try {
        // Create migrations table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version VARCHAR(255) PRIMARY KEY,
                applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Get migration files
        const migrationDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationDir)
            .filter(f => f.endsWith('.sql'))
            .sort();

        for (const file of files) {
            const version = file.split('.')[0];

            // Check if applied
            const res = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version]);
            if (res.rows.length > 0) {
                console.log(`Skipping ${file} (already applied)`);
                continue;
            }

            console.log(`Applying ${file}...`);
            const content = fs.readFileSync(path.join(migrationDir, file), 'utf8');

            // Transaction
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(content);
                await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
                await client.query('COMMIT');
                console.log(`Applied ${file}`);
            } catch (err) {
                await client.query('ROLLBACK');
                throw new Error(`Failed to apply ${file}: ${err.message}`);
            } finally {
                client.release();
            }
        }

        console.log('All migrations completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    migrate();
}

module.exports = { migrate };
