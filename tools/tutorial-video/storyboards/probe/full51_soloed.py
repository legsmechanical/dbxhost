"""Off-camera probe: 5.1's exact steps with the lead (track 4) soloed."""
import importlib.util, os
_spec = importlib.util.spec_from_file_location("s51", os.path.join(os.path.dirname(__file__), "..", "5_1_sequencer_effects.py"))
_s51 = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_s51)
from lead_setup import PRE_WITH_RIFF
TITLE, NUMBER, BPM = "5.1 soloed", "x", 110
STEPS = _s51.STEPS


def PRE(bus):
    PRE_WITH_RIFF(bus)
    cc = lambda n, v: bus.inject_midi(bytes([0x0B, 0xB0, n, v]))
    cc(49, 127); bus.wait_frame(20); cc(88, 127); bus.wait_frame(20); cc(88, 0); bus.wait_frame(20)
    cc(49, 0); bus.wait_frame(100)                       # Shift + Mute: solo track 4
