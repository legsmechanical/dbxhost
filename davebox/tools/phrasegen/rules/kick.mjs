/* kick — one sound
 * Sources: the private collection (when PHRASEGEN_PRIVATE_DIR is set), the
 * Groove MIDI Dataset (real drummers) and the Lakh MIDI loops (80s styles).
 * Everything that passes the library's rules is kept (duplicates merged). */
const GMD_STYLES = ['rock', 'punk', 'funk', 'hiphop', 'soul', 'pop', 'dance/disco', 'dance/breakbeat'];
export default {
    stats: true,   /* generated drums top styles up (lib/stats_gen.mjs genDrum) */
    ingest: [
        { source: 'own' },
        ...GMD_STYLES.map(style => ({ source: 'gmd', style, count: 24 })),
        { source: 'lmd' },
    ],
};
