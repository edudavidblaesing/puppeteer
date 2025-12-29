const fetch = require('node-fetch');

const RA_GRAPHQL_URL = 'https://ra.co/graphql';

const HEADERS = {
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://ra.co/'
};

async function testSearch(queryTerm) {
    const query = `
    query Search($query: String!) {
        search(query: $query) {
            areas {
                id
                name
                country {
                    name
                }
            }
        }
    }
    `;

    try {
        const response = await fetch(RA_GRAPHQL_URL, {
            method: 'POST',
            headers: HEADERS,
            body: JSON.stringify({
                query,
                variables: { query: queryTerm }
            })
        });

        const data = await response.json();
        console.log("Response:", JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}

testSearch('Hamburg');
