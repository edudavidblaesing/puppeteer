const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

async function searchWikiDE(query) {
    const url = `https://de.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        return data.query?.search || [];
    } catch (e) {
        console.error('Fetch error:', e);
        return [];
    }
}

async function testSearch() {
    console.log('--- Testing DE Wikipedia Search ---');

    const queries = [
        'Salon zur Wilden Renate',
        '://about blank',
        'Renate Berlin',
        'Kater Blau',
        'Berghain',
        'Sisyphos'
    ];

    for (const q of queries) {
        console.log(`\nQuery: "${q}"`);
        const results = await searchWikiDE(q);
        results.slice(0, 3).forEach(r => {
            console.log(`- [${r.title}]: ${r.snippet.replace(/<[^>]+>/g, '')}`);
        });
    }
}

testSearch();
