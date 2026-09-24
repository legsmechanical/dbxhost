/* beat — whole-kit drum beats, up to 8 sounds. Real drummers' bars from the
 * Groove MIDI Dataset, whole; and beats LAYERED from each style's single-drum
 * phrases (lib/beat_layer.mjs). */
const GMD_STYLES = ['rock', 'funk', 'hiphop', 'jazz', 'jazz/swing', 'afrobeat', 'soul', 'pop', 'neworleans',
                    'latin', 'latin/brazilian-samba', 'punk', 'dance/disco', 'blues'];
export default {
    layer: true,
    /* no style may crowd the list: the Latin and jazz sets are many small
     * substyles of one tag each */
    ingest: GMD_STYLES.map(style => ({ source: 'gmd', style, count: style === 'rock' ? 60 : /^(latin|jazz\/|neworleans|afrobeat)/.test(style) ? 20 : 30 })),
};
