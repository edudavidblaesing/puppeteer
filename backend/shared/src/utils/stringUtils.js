// String similarity and manipulation utilities

// Normalize string for matching (remove special chars, extra spaces, lowercase)
function normalizeForMatch(str) {
    if (!str) return '';
    return str.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Calculate string similarity (Levenshtein-based)
function stringSimilarity(a, b) {
    if (!a || !b) return 0;
    a = normalizeForMatch(a);
    b = normalizeForMatch(b);
    if (a === b) return 1;

    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1;

    // Simple contains check
    if (longer.includes(shorter) || shorter.includes(longer)) {
        return shorter.length / longer.length;
    }

    // Word overlap
    const wordsA = new Set(a.split(' ').filter(w => w.length > 2));
    const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
    const intersection = [...wordsA].filter(w => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);

    if (union.size === 0) return 0;
    return intersection.length / union.size;
}

// Extract postal code from address
function extractPostalCode(address) {
    if (!address) return null;

    // Match common postal code patterns
    // 5-digit codes (US, Germany, etc): 12345
    // UK postcodes: SW1A 1AA, EC1A 1BB
    // Canada: K1A 0B1
    const patterns = [
        /\b\d{5}\b/,                          // 5-digit (US, Germany)
        /\b[A-Z]{1,2}\d{1,2}[A-Z]?\s?\d[A-Z]{2}\b/i, // UK
        /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b/i      // Canada
    ];

    for (const pattern of patterns) {
        const match = address.match(pattern);
        if (match) {
            return match[0].trim();
        }
    }

    return null;
}

// Clean address by removing duplicate city/country information and extracting postal code
function cleanVenueAddress(address, city, country) {
    if (!address) return { address: address, postalCode: null };

    let cleaned = address;
    let postalCode = null;

    // Extract postal code before cleaning
    postalCode = extractPostalCode(cleaned);

    // Parse address that might contain: "Street; District; Postal City; Country"
    if (cleaned.includes(';')) {
        const parts = cleaned.split(';').map(p => p.trim());
        // Take only the first part (street address)
        cleaned = parts[0];
    }

    // Remove city from address if it appears
    if (city && cleaned.toLowerCase().includes(city.toLowerCase())) {
        // Use word boundary to avoid partial matches
        const cityRegex = new RegExp(`[,\\s]*${city.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,\\s]*`, 'gi');
        cleaned = cleaned.replace(cityRegex, ' ');
    }

    // Remove country from address if it appears
    if (country && cleaned.toLowerCase().includes(country.toLowerCase())) {
        const countryRegex = new RegExp(`[,\\s]*${country.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[,\\s]*`, 'gi');
        cleaned = cleaned.replace(countryRegex, ' ');
    }

    // Remove postal code from address
    if (postalCode) {
        cleaned = cleaned.replace(postalCode, '');
    }

    // Clean up extra commas, spaces, and trim
    cleaned = cleaned
        .replace(/,+/g, ',')           // Multiple commas to single
        .replace(/\s+/g, ' ')          // Multiple spaces to single
        .replace(/^[,\s]+|[,\s]+$/g, '') // Trim commas and spaces
        .trim();

    return { address: cleaned, postalCode };
}

module.exports = {
    normalizeForMatch,
    stringSimilarity,
    extractPostalCode,
    cleanVenueAddress
};
