/* beat — whole-kit drum beats, up to 8 sounds. Real drummers' bars from the
 * Groove MIDI Dataset, whole; layered and generated beats come next. */
const GMD_STYLES = ['rock', 'funk', 'hiphop', 'jazz', 'jazz/swing', 'afrobeat', 'soul', 'pop', 'neworleans',
                    'latin', 'latin/brazilian-samba', 'punk', 'dance/disco', 'blues'];
export default {
    ingest: GMD_STYLES.map(style => ({ source: 'gmd', style, count: style === 'rock' ? 60 : 30 })),
};
