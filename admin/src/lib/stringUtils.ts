/**
 * Calculates the Levenshtein distance between two strings.
 * This represents the minimum number of single-character edits required to change one string into the other.
 */
export function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i += 1) {
        matrix[0][i] = i;
    }

    for (let j = 0; j <= b.length; j += 1) {
        matrix[j][0] = j;
    }

    for (let j = 1; j <= b.length; j += 1) {
        for (let i = 1; i <= a.length; i += 1) {
            const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j][i - 1] + 1, // deletion
                matrix[j - 1][i] + 1, // insertion
                matrix[j - 1][i - 1] + indicator // substitution
            );
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Calculates the similarity percentage between two strings (0 to 100).
 * 100 means identical, 0 means completely different.
 */
export function similarityPercentage(a: string, b: string): number {
    const normalize = (str: string) => str.toLowerCase().trim().replace(/\s+/g, ' ');
    const s1 = normalize(a);
    const s2 = normalize(b);

    if (!s1 && !s2) return 100;
    if (!s1 || !s2) return 0;

    const distance = levenshteinDistance(s1, s2);
    const longestLength = Math.max(s1.length, s2.length);

    return ((longestLength - distance) / longestLength) * 100;
}
