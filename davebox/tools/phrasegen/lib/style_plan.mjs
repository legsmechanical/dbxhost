/* Which styles and named styles the melodic generator writes, and how many
 * phrases of each type. A style's measured statistics live in
 * research/refs/stats/<file>.json; its named styles are that file's
 * `flavours`. Counts shrink for a part the style seldom has (its measured
 * presence), so a jazz library is not padded with arps. */
export const STYLE_FILES = {
    basics: '', acid: 'ACID', ambient: 'AMBIENT', breaks: 'BREAKS', country: 'COUNTRY', darksyn: 'DARKSYN',
    disco: 'DISCO', dnb: 'DNB', electro: 'ELECTRO', funk: 'FUNK', garage: 'GARAGE', hardcore: 'HARDCORE',
    hiphop: 'HIPHOP', house: 'HOUSE', indie: 'INDIE', italo: 'ITALO', jazz: 'JAZZ', latin: 'LATIN',
    metal: 'METAL', newwave: 'NEW WAVE', pop: 'POP', punk: 'PUNK', reggae: 'REGGAE', rnb: 'RNB',
    rock: 'ROCK', techno: 'TECHNO', trance: 'TRANCE',
};
/* measured flavour key → the name its phrases carry */
export const FLAVOUR_NAME = {
    postpunk: 'POST PUNK', goth: 'GOTH', darkwave: 'DARKWAVE', synthwave: 'SYNTHWAVE',
    ebm: 'EBM', industrial: 'INDUSTRIAL', darksynth: 'DARKSYNTH',
    synthpop: 'SYNTHPOP', jpop: 'JPOP', kpop: 'KPOP', citypop: 'CITY POP', hyperpop: 'HYPERPOP',
    soul: 'SOUL', neosoul: 'NEO SOUL', alt: 'ALT', shoegaze: 'SHOEGAZE', dreampop: 'DREAM POP', grunge: 'GRUNGE',
    dub: 'DUB', dancehall: 'DANCEHALL', ska: 'SKA', reggaeton: 'REGGAETON', salsa: 'SALSA', bossa: 'BOSSA',
    cumbia: 'CUMBIA', swing: 'SWING', bebop: 'BEBOP', jazzfunk: 'JAZZ FUNK', folk: 'FOLK', bluegrass: 'BLUEGRASS',
    trap: 'TRAP', lofi: 'LOFI', boombap: 'BOOM BAP', jungle: 'JUNGLE', blues: 'BLUES',
};
export const PER_STYLE = 10, PER_BASICS = 24, PER_FLAVOUR = 6;
/* a flavour is generated when it has measured songs or chord-sheet loops */
export const flavourUsable = (f) => !!f && ((f.songs || 0) >= 3 || (f.chord_sheets && (f.chord_sheets.songs || 0) >= 20));
/* Electronic styles, where arps and sequencer riffs are a staple of a
 * starter library whatever share of songs the measurement found them in. */
export const ELECTRONIC = new Set(['acid', 'ambient', 'breaks', 'darksyn', 'dnb', 'electro', 'garage', 'hardcore',
    'house', 'italo', 'techno', 'trance']);
export const ELECTRONIC_FLAVOURS = new Set(['synthpop', 'synthwave', 'darkwave', 'ebm', 'darksynth', 'industrial']);
/* How many phrases of `cat`: base, scaled by how present the part is in the
 * style. Chord playing was measured across chord / pad / keys / guitar parts,
 * so the chord type uses the strongest of them. */
export function countFor(base, cat, part, prof, file, flavour) {
    let p = part && typeof part.presence === 'number' ? part.presence : 0.5;
    if (cat === 'chord' && prof)
        for (const n of ['pad', 'keys', 'guitar']) { const q = prof.part(n); if (q && q.presence > p) p = q.presence; }
    if ((cat === 'arp' || cat === 'seq') && (ELECTRONIC.has(file) || ELECTRONIC_FLAVOURS.has(flavour))) p = Math.max(p, 0.7);
    return Math.max(2, Math.round(base * Math.max(0.3, Math.min(1, p * 1.5))));
}

/* Generated drums top up a style: many where it has little real material,
 * a few where it has plenty (real phrases win the duplicate check). A drum
 * type the style barely uses (a measured median of no hits) gets none, except
 * toms, which are fills. */
/* Styles whose drum measurements are unusable (research/refs/README.md: the
 * DnB files sit at the wrong tempo): drums from real material only. */
export const NO_DRUM_MODEL = new Set(['dnb']);
export function drumCountFor(cat, prof, realCount, isFlavour, file) {
    if (NO_DRUM_MODEL.has(file)) return 0;
    const D = prof.drums();
    const P = D && D[cat];
    if (!P) return 0;
    if (cat !== 'tom' && (P.songs_using || 0) < 0.2) return 0;
    /* a drum the style's grooves seldom play (median under half a hit a bar)
     * is not generated: the model would invent a part the style doesn't have */
    if (cat !== 'tom' && (!P.hits_per_bar || P.hits_per_bar[1] < 0.5)) return 0;
    /* tom fills barely differ by style: a couple per style, none per named style */
    if (cat === 'tom') return isFlavour ? 0 : 2;
    const target = cat === 'cymb' ? (isFlavour ? 3 : 6) : (isFlavour ? 5 : 10);
    return Math.max(isFlavour ? 3 : 2, target - Math.floor(realCount / 4));
}
