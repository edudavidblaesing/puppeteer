const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.PGUSER,
  host: process.env.PGHOST,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT,
});

async function run() {
  console.log('--- Checking Scraped Events End Times ---');

  // Check RA
  const raRes = await pool.query(`
    SELECT count(*) as total, 
           count(end_time) as has_end_time,
           count(description) as has_description
    FROM scraped_events 
    WHERE source_code = 'ra'
  `);
  console.log('RA Stats:', raRes.rows[0]);

  // Check TM
  const tmRes = await pool.query(`
    SELECT count(*) as total, 
           count(end_time) as has_end_time,
           count(description) as has_description
    FROM scraped_events 
    WHERE source_code = 'ticketmaster'
  `);
  console.log('TM Stats:', tmRes.rows[0]);

  // Sample RA with missing end time to see url
  const sample = await pool.query(`
    SELECT title, start_time, end_time, content_url 
    FROM scraped_events 
    WHERE source_code = 'ra' AND end_time IS NULL 
    LIMIT 3
  `);
  if (sample.rows.length > 0) {
    console.log('Sample RA Missing End Time:', sample.rows);
  }

  await pool.end();
}

run();
