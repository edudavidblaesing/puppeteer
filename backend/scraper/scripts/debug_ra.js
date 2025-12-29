// Use dynamic import for node-fetch (ESM)
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const RA_GRAPHQL_URL = 'https://ra.co/graphql';
const HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://ra.co/',
    'Origin': 'https://ra.co'
};

async function fetchGraphQL(query, variables) {
    try {
        const response = await fetch(RA_GRAPHQL_URL, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({ query, variables })
        }); // .then(r => r.json()); // simplified

        if (!response.ok) {
            return { error: `HTTP ${response.status}`, text: await response.text() };
        }
        return await response.json();

    } catch (e) {
        return { error: e.message };
    }
}

async function testStrategies() {
    const term = "Hamburg";

    console.log("Starting RA Schema Probe for:", term);

    // Strategy 1: 'areas' with simple 'query' arg (common)
    const query1 = `
        query GetAreas($term: String) {
            areas(query: $term) { 
                id name 
            }
        }
    `;

    // Strategy 2: 'areas' with 'filter' object (common)
    const query2 = `
        query GetAreas($term: String) {
            areas(filter: { query: $term }) {
                id name
            }
        }
    `;

    // Strategy 3: 'areas' with 'searchTerm' convention
    const query3 = `
        query GetAreas($term: String) {
            areas(searchTerm: $term) {
                id name
            }
        }
    `;

    // Strategy 4: Root level 'locations' or 'cities' check
    const query4 = `
        query GetLocations {
            locations(query: "Hamburg") { id name }
        }
    `;

    console.log("\n--- Probe 1: areas(query: ...) ---");
    const res1 = await fetchGraphQL(query1, { term });
    console.log(JSON.stringify(res1, null, 2));

    console.log("\n--- Probe 2: areas(filter: { query: ... }) ---");
    const res2 = await fetchGraphQL(query2, { term });
    console.log(JSON.stringify(res2, null, 2));

    console.log("\n--- Probe 3: areas(searchTerm: ...) ---");
    const res3 = await fetchGraphQL(query3, { term });
    console.log(JSON.stringify(res3, null, 2));

    console.log("\n--- Probe 4: locations(query: ...) ---");
    const res4 = await fetchGraphQL(query4, {});
    console.log(JSON.stringify(res4, null, 2));
}

testStrategies();
