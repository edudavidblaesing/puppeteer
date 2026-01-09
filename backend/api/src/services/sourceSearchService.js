// using global fetch

// TICKETMASTER_API_KEY from env
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || 'nxUv3tE9qx64KGji30MwrYZFSxfb9p6r';

async function searchEvents(source, query) {
    if (source === 'tm') {
        const params = new URLSearchParams({
            keyword: query,
            apikey: TICKETMASTER_API_KEY,
            size: '20',
            sort: 'date,asc'
        });
        const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
        console.log(`Searching Ticketmaster: ${url}`);

        try {
            const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
            if (!response.ok) throw new Error(`TM API Error: ${response.status}`);
            const data = await response.json();
            const events = data._embedded?.events || [];

            return events.map(event => ({
                id: event.id,
                title: event.name,
                date: event.dates?.start?.localDate,
                venue: event._embedded?.venues?.[0]?.name,
                url: event.url,
                image: event.images?.find(i => i.ratio === '16_9')?.url || event.images?.[0]?.url,
                source_code: 'tm'
            }));
        } catch (e) {
            console.error('TM Search Failed:', e);
            return [];
        }
    }
    // Add RA or others here if needed (RA search usually requires unofficial API or diff logic)
    return [];
}

module.exports = {
    searchEvents
};
