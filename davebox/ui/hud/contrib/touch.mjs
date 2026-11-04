/* touch.mjs — which knob a finger is on, and the jog. */
import { S } from '../../ui_state.mjs';
export const touch = {
    key: 'touch',
    collect: () => ({ knob: S.knobTouched | 0, phys: S.knobPhysIdx | 0, jog: !!S.jogTouched }),
};
