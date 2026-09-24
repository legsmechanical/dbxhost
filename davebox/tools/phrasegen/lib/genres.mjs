/* The public style tags (genre is only ever a NAME tag; categories are
 * instruments) and each one's audition tempo. BASIC ('') is general-purpose.
 * Narrower styles are filed under a broader tag but keep their own name on the
 * phrase ("GOTH 04" in NEW WAVE), so they can be found inside it. */
export const TAGS = ['HOUSE', 'TECHNO', 'TRANCE', 'ELECTRO', 'DARKSYN', 'DISCO', 'FUNK', 'DNB', 'BREAKS',
    'HIPHOP', 'RNB', 'GARAGE', 'ACID', 'DUB', 'AMBIENT', 'HARDCORE', 'ROCK', 'INDIE', 'METAL', 'PUNK', 'NEW WAVE',
    'ITALO', 'POP', ''];
export const FLAVOUR_OF = {
    'POST PUNK': 'NEW WAVE', GOTH: 'NEW WAVE', DARKWAVE: 'NEW WAVE', SYNTHWAVE: 'NEW WAVE',
    EBM: 'DARKSYN', INDUSTRIAL: 'DARKSYN', DARKSYNTH: 'DARKSYN',
    SYNTHPOP: 'POP',
    SOUL: 'RNB', ALT: 'INDIE',
};
/* A style name → the public tag it is filed under. */
export const publicTag = (t) => FLAVOUR_OF[t] || t;
export const TAG_BPM = { HOUSE: 124, TECHNO: 130, TRANCE: 138, ELECTRO: 125, DISCO: 118, FUNK: 100, DNB: 172,
    BREAKS: 132, HIPHOP: 92, GARAGE: 132, ACID: 128, DUB: 80, AMBIENT: 90, HARDCORE: 170, ROCK: 120,
    PUNK: 170, 'NEW WAVE': 128, 'POST PUNK': 132, GOTH: 120, SYNTHPOP: 118, ITALO: 120, EBM: 122,
    SYNTHWAVE: 100, POP: 112, DARKSYN: 120, RNB: 96, SOUL: 100, INDIE: 124, ALT: 124, METAL: 140, INDUSTRIAL: 124, DARKWAVE: 124, DARKSYNTH: 110, '': 120 };
export const isTag = (t) => TAGS.includes(t);
