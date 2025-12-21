const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Simple rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 500; // 0.5 seconds

const waitIfNeeded = async () => {
    const now = Date.now();
    const timeSinceLast = now - lastRequestTime;
    if (timeSinceLast < MIN_REQUEST_INTERVAL) {
        await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLast));
    }
    lastRequestTime = Date.now();
};
const { stringSimilarity } = require('../utils/stringUtils');

const HEADERS = {
    'User-Agent': 'SocialEventsScraper/1.0 ( https://github.com/edudavidblaesing/social-events )',
    'Accept': 'application/json'
};

const REST_API_BASE = (lang) => `https://${lang}.wikipedia.org/api/rest_v1/page/summary`;
const ACTION_API_BASE = (lang) => `https://${lang}.wikipedia.org/w/api.php`;

async function searchWikipedia(query, lang = 'en') {
    await waitIfNeeded();
    // Use list=search for full text search which is better for finding things by context
    const url = `${ACTION_API_BASE(lang)}?action=query&list=search&srsearch=${encodeURIComponent(query)}&limit=5&format=json`;

    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'SocialEventsScraper/1.0 (social-events-bot@yourdomain.com)' }
        });
        if (!response.ok) throw new Error(`Wiki Search Error: ${response.status}`);

        const data = await response.json();
        const results = data.query?.search || [];

        return results.map(r => ({
            title: r.title,
            description: r.snippet.replace(/<[^>]+>/g, ''), // clean html from snippet
            pageid: r.pageid
        }));
    } catch (error) {
        console.warn(`[Wikipedia] Search failed for ${query} (${lang}): ${error.message}`);
        return [];
    }
}

async function getPageSummary(title, lang = 'en') {
    await waitIfNeeded();
    const url = `${REST_API_BASE(lang)}/${encodeURIComponent(title.replace(/ /g, '_'))}`;

    try {
        const res = await fetch(url, { headers: HEADERS });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`Wiki Summary Error: ${res.status}`);

        return await res.json();
    } catch (error) {
        console.warn(`[Wikipedia] Get Summary failed for ${title}: ${error.message}`);
        return null;
    }
}

async function findBestMatch(results, name, type, contextKeywords) {
    let bestMatch = null;
    let bestScore = 0;

    for (const result of results) {
        // Cleaning
        const cleanTitle = result.title.replace(/\s*\(.*?\)\s*/g, '');
        const descRaw = result.description || '';
        const descLower = descRaw.toLowerCase();
        const titleLower = (result.title || '').toLowerCase();
        const nameLower = name.toLowerCase();

        // Base Score: String Similarity
        let score = stringSimilarity(name, cleanTitle);

        // Boosts
        // 1. Keyword match (Context)
        if (contextKeywords.some(k => descLower.includes(k) || titleLower.includes(k))) {
            score += 0.35;
        }

        // 2. Substring match
        if (nameLower.includes(titleLower) || titleLower.includes(nameLower)) {
            score += 0.2;
        }

        // Penalties
        if (descLower.includes('surname') || descLower.includes('given name') || descLower.includes('disambiguation') ||
            descLower.includes('nachname') || descLower.includes('vorname') || descLower.includes('begriffsklärung') ||
            descLower.includes('weiblicher vorname') || descLower.includes('männlicher vorname')) {
            score -= 1.0;
        }

        // Title penalties for generic names
        if (titleLower.includes('(name)') || titleLower.includes('(vorname)')) {
            score -= 1.0;
        }

        if (score > bestScore) {
            bestScore = score;
            bestMatch = result;
        }
    }

    return { bestMatch, bestScore };
}

async function searchAndGetDetails(name, type = 'artist') {
    let langs = ['en'];
    let contextKeywords = [];

    if (type === 'venue') {
        langs = ['de', 'en'];
        contextKeywords = ['club', 'venue', 'theatre', 'arena', 'nightclub', 'nachtclub', 'diskothek', 'berlin', 'kultur', 'techno', 'party'];
    } else {
        contextKeywords = ['band', 'musician', 'rapper', 'singer', 'group', 'musiker', 'sänger', 'dj', 'producer'];
        langs = ['en', 'de'];
    }

    for (const lang of langs) {
        // SEARCH 1: Exact Name
        let results = await searchWikipedia(name, lang);
        let { bestMatch, bestScore } = await findBestMatch(results, name, type, contextKeywords);

        // SEARCH 2: Retry with City (For Venues only, if score is low)
        if (type === 'venue' && bestScore < 0.55) {
            const cityResults = await searchWikipedia(`${name} Berlin`, lang);
            const cityMatchInfo = await findBestMatch(cityResults, name, type, contextKeywords);

            if (cityMatchInfo.bestScore > bestScore) {
                bestMatch = cityMatchInfo.bestMatch;
                bestScore = cityMatchInfo.bestScore;
            }
        }

        // Acceptance Threshold: 0.5
        if (bestMatch && bestScore >= 0.5) {
            const summary = await getPageSummary(bestMatch.title, lang);
            // Double check summary type
            if (summary && summary.type !== 'disambiguation') {
                return {
                    source_code: 'wiki',
                    source_id: summary.pageid ? summary.pageid.toString() : bestMatch.title,
                    name: summary.title,
                    description: summary.extract,
                    image_url: summary.thumbnail ? summary.thumbnail.source : null,
                    content_url: summary.content_urls ? summary.content_urls.desktop.page : `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(bestMatch.title)}`,
                    raw: summary
                };
            }
        }
    }

    return null;
}

module.exports = {
    searchWikipedia,
    getPageSummary,
    searchAndGetDetails
};
