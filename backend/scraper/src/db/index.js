const { Pool } = require('pg');

const DB_CONFIG = {
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT || 5432,
    user: process.env.PGUSER || 'eventuser',
    password: process.env.PGPASSWORD || 'eventpass',
    database: process.env.PGDATABASE || 'socialevents'
};

const pool = new Pool(DB_CONFIG);

// Test connection
pool.on('error', (err, client) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    DB_CONFIG
};
