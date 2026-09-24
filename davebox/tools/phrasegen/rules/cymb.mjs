/* cymb — one sound (rides and crashes)
 * Sources: the private collection (when PHRASEGEN_PRIVATE_DIR is set), the
 * Groove MIDI Dataset (real drummers) and the Lakh MIDI loops (80s styles).
 * Counts are the first listening sample's; scaled up once it is judged. */
const GMD_STYLES = ['rock', 'punk', 'funk', 'hiphop', 'soul', 'pop', 'dance/disco', 'dance/breakbeat'];
export default {
    ingest: [
        { source: 'own', count: 8 },
        ...GMD_STYLES.map(style => ({ source: 'gmd', style, count: 1 })),
        { source: 'lmd', count: 3 },
    ],
};
