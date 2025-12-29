const { searchCities } = require('./src/services/externalSearchService');

// Mock dependencies if needed, or rely on actual services
// For this test we run it from backend/scraper root so it finds the src modules

async function testAll() {
    console.log("Searching 'Munich'...");
    const results = await searchCities('Munich');

    console.log(`Found ${results.length} results.`);
    results.forEach(r => {
        console.log(`[${r.source.toUpperCase()}] ${r.name} (ID: ${r.id}) - Lat/Lon: ${r.lat}/${r.lon}`);
    });

    console.log("\nSearching 'Hamburg'...");
    const results2 = await searchCities('Hamburg');
    results2.forEach(r => {
        console.log(`[${r.source.toUpperCase()}] ${r.name} (ID: ${r.id}) - Lat/Lon: ${r.lat}/${r.lon}`);
    });
}

testAll();
