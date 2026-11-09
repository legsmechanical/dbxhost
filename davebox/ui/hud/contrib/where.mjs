/* where.mjs — which screen, and the selection it is about. The screen id comes
 * from the dispatcher (hudScreen); the rest from state the UI already keeps. */
import { S } from '../../ui_state.mjs';
import { BANKS } from '../../ui_constants.mjs';
const PAD_MODES = ['melodic', 'drum', 'chord', 'audio', 'slicer'];
export const where = {
    key: 'where',
    collect: (frame) => {
        const t = S.activeTrack | 0, bank = S.activeBank | 0;
        return {
            screen: frame.screen || 'unknown',
            view: S.sessionView ? 'session' : 'track',
            track: t,
            clip: S.trackActiveClip[t] | 0,
            bank,
            bankName: BANKS[bank] ? BANKS[bank].name : '',
            padMode: PAD_MODES[S.trackPadMode[t] | 0] || 'melodic',
            lane: S.trackPadMode[t] === 1 ? (S.activeDrumLane[t] | 0) : -1,   /* a drum track's lane */
        };
    },
};
