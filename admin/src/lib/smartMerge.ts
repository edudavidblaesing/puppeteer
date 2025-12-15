import { SourceReference } from '@/types';

export const SOURCE_PRIORITY = ['og', 'ra', 'tm', 'eb', 'di', 'mb', 'fb'];

/**
 * Determines the best source for a specific field based on improved logic.
 * - Genres: Prioritizes MusicBrainz ('mb'), then source with most genres.
 * - Description: Prioritizes Resident Advisor ('ra') or Original ('og'), then longest text.
 * - Others: Follows standard SOURCE_PRIORITY order.
 */
export function getBestSourceForField(sources: SourceReference[] | undefined, field: string): SourceReference | undefined {
    if (!sources || sources.length === 0) return undefined;

    // Filter sources that actually have a computed value for this field
    const validSources = sources.filter(s => {
        const val = (s as any)[field];
        return val !== undefined && val !== null && val !== '' &&
            (Array.isArray(val) ? val.length > 0 : true);
    });

    if (validSources.length === 0) return undefined;

    // Intelligence based on field name
    if (field === 'genres') {
        // 1. Prefer MusicBrainz ('mb') if available
        const mbSource = validSources.find(s => s.source_code === 'mb');
        if (mbSource) return mbSource;

        // 2. Otherwise, find the source with the most genres (longest array/string length)
        // We try to parse if it's a string looking like an array
        const sortedByLength = [...validSources].sort((a, b) => {
            const getLen = (val: any) => {
                if (Array.isArray(val)) return val.length;
                if (typeof val === 'string') {
                    if (val.startsWith('[')) {
                        try { return JSON.parse(val).length; } catch { return val.length; } // Treat as char length if parse fails? Or 1? 
                        // If string is JSON array, parse to get count.
                    }
                    return val.split(',').length; // Naive comma separation count
                }
                return 0;
            };
            return getLen((b as any)[field]) - getLen((a as any)[field]);
        });
        return sortedByLength[0];
    }

    if (field === 'description' || field === 'bio') {
        // Prefer RA for descriptions as they are usually high quality manually written
        const raSource = validSources.find(s => s.source_code === 'ra');
        if (raSource && (raSource as any)[field].length > 50) return raSource; // Only if substantial

        // Otherwise longest description
        const sortedByLength = [...validSources].sort((a, b) => {
            const lenA = String((a as any)[field] || '').length;
            const lenB = String((b as any)[field] || '').length;
            return lenB - lenA;
        });
        return sortedByLength[0];
    }

    // Default Priority for other fields
    for (const code of SOURCE_PRIORITY) {
        const s = validSources.find(vs => vs.source_code === code);
        if (s) return s;
    }

    return validSources[0];
}

/**
 * Formats a value for display, handling arrays and JSON strings.
 */
export function formatSourceValue(val: any): string {
    if (val === null || val === undefined || val === '') return '(Empty)';

    if (Array.isArray(val)) {
        return val.join(', ');
    }

    if (typeof val === 'string') {
        // Check if it's a JSON array string e.g. '["Rock","Pop"]'
        if (val.trim().startsWith('[') && val.trim().endsWith(']')) {
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) {
                    return parsed.join(', ');
                }
            } catch (e) {
                // Not valid JSON, ignore
            }
        }
    }

    if (typeof val === 'object') {
        return JSON.stringify(val);
    }

    return String(val);
}
