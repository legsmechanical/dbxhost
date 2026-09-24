/* The public style tags (genre is only ever a NAME tag; categories are
 * instruments) and each one's audition tempo. BASIC ('') is general-purpose.
 * Narrower styles are FLAVOURS of these, not tags of their own: goth and
 * darkwave under POST PUNK, synthwave and darksynth under SYNTHPOP, EBM under
 * ELECTRO (FLAVOUR_OF). */
export const TAGS = ['HOUSE', 'TECHNO', 'TRANCE', 'ELECTRO', 'DISCO', 'FUNK', 'DNB', 'BREAKS', 'HIPHOP',
    'GARAGE', 'ACID', 'DUB', 'AMBIENT', 'HARDCORE', 'ROCK', 'PUNK', 'NEW WAVE', 'POST PUNK',
    'SYNTHPOP', 'ITALO', 'POP', ''];
export const FLAVOUR_OF = { GOTH: 'POST PUNK', DARKWAVE: 'POST PUNK', SYNTHWAVE: 'SYNTHPOP', DARKSYNTH: 'SYNTHPOP', EBM: 'ELECTRO' };
/* A style name → the public tag it is filed under. */
export const publicTag = (t) => FLAVOUR_OF[t] || t;
export const TAG_BPM = { HOUSE: 124, TECHNO: 130, TRANCE: 138, ELECTRO: 125, DISCO: 118, FUNK: 100, DNB: 172,
    BREAKS: 132, HIPHOP: 92, GARAGE: 132, ACID: 128, DUB: 80, AMBIENT: 90, HARDCORE: 170, ROCK: 120,
    PUNK: 170, 'NEW WAVE': 128, 'POST PUNK': 132, GOTH: 120, SYNTHPOP: 118, ITALO: 120, EBM: 122,
    SYNTHWAVE: 100, POP: 112, '': 120 };
export const isTag = (t) => TAGS.includes(t);
