// See https://github.com/Ableton/push-interface/blob/main/doc/AbletonPush2MIDIDisplayInterface.asc 
// for Push2 and most the same Move internal MIDI commands


/* Reference: https://github.com/Cycling74/rnbo.move.control (MIT)
 * See also: docs/reference/rnbo-move-control/NOTES.md, schwung_move.h
 * PALETTE TABLE: replaced with upstream Schwung v1.0.0's (e3d5bc8c) on the
 * param-pages adoption. COMMENT ONLY -- not one exported constant's numeric
 * value moved. This fork's table was an older, partial reading of the same
 * hardware palette: 92 of 128 indices, no dim/dark columns, and it called
 * 122/123 duplicates of White/Light Grey. Upstream re-measured and they are
 * not duplicates -- 122 is #CCCCCC and 123 is #404040, the two rungs a
 * brightness ramp needs, which is exactly what param_pages/knob_leds.mjs
 * WHITE_LEVELS climbs. Keeping the old table would have left the knob-LED
 * ramp documented as going bright, dark, bright.

================================================================================
RGB COLOR PALETTE (INDEXED 0–127)
================================================================================

--- NEUTRALS / GREYS -----------------------------------------------------------
  0 : #000000  Black
117 : #000000  Black (dup)
118 : #595959  Light Grey
119 : #1A1A1A  Dark Grey
120 : #FFFFFF  White
121 : #595959  Light Grey (dup)
122 : #CCCCCC  White (dup)
123 : #404040  Dark Grey (dup)
124 : #141414  Dark Grey 2

--- REDS / ORANGES / YELLOWS ---------------------------------------------------
  1 : #FF4032  Bright Red              dim  65 #661914  dark  66 #210806
  2 : #800400  Orange Red              dim  67 #460300  dark  68 #280000
  3 : #C93C00  Bright Orange           dim  69 #5D1700  dark  70 #200D00
  4 : #AC1F00  Tan / Muted Orange      dim  71 #470C00  dark  72 #1C0800
  5 : #8C5018  Light Yellow            dim  73 #3B2B14  dark  74 #1C130A
  6 : #491804  Ochre                   dim  75 #250E05  dark  76 #0D0602  
  7 : #FADC3B  Vivid Yellow            dim  77 #645817  dark  78 #201C07
  8 : #FFC516  Bright Yellow           dim  79 #664E08  dark  80 #211902
  9 : #B6FF0E  Bright Lime             dim  81 #486605  dark  82 #172101

--- GREENS / TEALS -------------------------------------------------------------
 10 : #79FF18  Dull Green              dim  83 #306609  dark  84 #0F2103
 11 : #34C216  Neon Green              dim  85 #144D08  dark  86 #061902
 12 : #4F8A04  Teal Green              dim  87 #1F3701  dark  88 #0A1100
 13 : #62FF55  Muted Teal              dim  89 #276622  dark  90 #0C210B
 14 : #297D53  Cyan-Teal               dim  91 #143E29  dark  92 #081910
 15 : #269E72  Teal-Cyan               dim  93 #004D36, dark  94 #00180E

--- CYANS / AQUAS / BLUES ------------------------------------------------------
 16 : #31ADFF  Azure Blue              dim  95 #134566  dark  96 #061621
 17 : #3663FC  Royal Blue              dim  97 #152764  dark  98 #070C20
 18 : #1A34FF  Blue-Violet             dim  99 #0A1466  dark 100 #030621
 19 : #1C0CE6  Violet                  dim 101 #0B045C  dark 102 #03011D

--- PURPLES / MAGENTAS / PINKS -------------------------------------------------
 20 : #153999  Electric Violet         dim 103 #0A1C4C  dark 104 #040B1E
 21 : #3937FF  Hot Magenta             dim 105 #161666  dark 106 #070721
 22 : #5722FF  Purple                  dim 107 #220D66  dark 108 #0B0421
 23 : #972BFF  Neon Pink               dim 109 #3C1166  dark 110 #130521
 24 : #852178  Rose                    dim 111 #350D30  dark 112 #11040F
 25 : #FF1032  Bright Pink             dim 113 #660614  dark 114 #210206
 26 : #FF2BD4  Light Magenta           dim 115 #661154  dark 116 #21051B

--- SATURATION VARIANTS (27–35) ------------------------------------------------
 27 : #A63421  Rust Red
 28 : #995628  Burnt Orange
 29 : #876700  Mustard
 30 : #90821F  Yellow-Green
 31 : #4A8700  Lime
 32 : #007F12  Deep Green
 33 : #1853B2  Blue
 34 : #624BAD  Lilac
 35 : #733A67  Mauve

--- PASTELS / LIGHT TONES (36–64) ----------------------------------------------
 36 : #F8BCAF  Pale Salmon
 37 : #FF9B76  Light Orange
 38 : #FFBF5F  Light Amber
 39 : #D9AF71  Sand
 40 : #FFF480  Light Yellow 2
 41 : #BFBA69  Pale Olive
 42 : #BCCC88  Pale Lime
 43 : #AEFF99  Pale Green
 44 : #7CDD9F  Mint Green
 45 : #89B47D  Olive Green
 46 : #80F3FF  Pale Cyan
 47 : #7ACEFC  Sky Blue
 48 : #68A1D3  Light Blue
 49 : #858FC2  Muted Blue
 50 : #BBAAF2  Lavender Blue
 51 : #CDBBE4  Pale Lavender
 52 : #EF8BB0  Pale Pink
 53 : #859D8C  Pale Sea Green
 54 : #6B756E  Grey Green
 55 : #84909B  Grey Blue
 56 : #6A7075  Steel Grey
 57 : #88859D  Lavender Grey
 58 : #6C6A75  Dark Steel
 59 : #9D859C  Mauve Grey
 60 : #746A74  Warm Grey
 61 : #9C9D85  Olive Grey
 62 : #74756A  Sage Grey
 63 : #9D8484  Rose Grey
 64 : #756A6A  Brown Grey

--- PRIMARY COLORS -------------------------------------------------------------
125 : #0000FF  Blue
126 : #00FF00  Green
127 : #FF0000  Red
================================================================================
*/

// --- NEUTRALS / GREYS ---
export const Black = 0;
export const DarkGrey = 124;
export const LightGrey = 118;
/* Imported from upstream v1.0.0 for the param_pages knob grid's LED ramp.
 * Upstream splits the greys differently -- its DarkGrey is 119 and its
 * DarkGrey2 is 124, which is THIS fork's DarkGrey. Both spellings are kept:
 * the fork's own call sites say DarkGrey, the imported grid says DarkGrey2,
 * and they are the same pad colour. DarkGrey3 (#404040) and OffWhite
 * (#CCCCCC) fill the two gaps a brightness ramp needs -- see
 * param_pages/knob_leds.mjs WHITE_LEVELS. */
export const DarkGrey2 = 124;
export const DarkGrey3 = 123;
export const OffWhite = 122;
export const White = 120;

// --- REDS / PINKS / MAGENTAS ---
export const BrightRed = 1;
export const RustRed = 27;
export const DeepRed = 65;
export const VeryDarkRed = 66;
export const Brick = 67 ;
export const ElectricViolet = 20 ;
export const HotMagenta = 21;
export const NeonPink = 23;
export const Rose = 24;
export const BrightPink = 25;
export const LightMagenta = 26;
export const DeepViolet = 104;
export const MutedViolet = 105;
export const DarkPurple = 107;
export const DeepMagenta = 109;
export const DustyRose = 111;
export const Mauve = 113;
export const DeepWine = 114;
export const DuskyMauve = 115;
export const ShadowMauve = 116;

// --- ORANGES / AMBERS / YELLOWS ---
export const OrangeRed = 2;
export const Bright = 3;
/* Upstream's name for the same pad colour as `Bright` above, plus its two
 * dim/dark partners. Imported for the param_pages knob grid, which names the
 * whole 3/69/70 ramp. */
export const BrightOrange = 3;
export const BurntSienna = 69;
export const DarkBrown = 70;
export const Tan = 4;
export const LightYellow = 5;
export const Ochre = 6;
export const VividYellow = 7;
export const BurntOrange = 28;
export const Mustard = 29;
export const YellowGreen = 30;
export const DullYellow = 73;
export const VeryDarkYellow = 74;
export const BrownYellow = 75;
export const DeepBrownYellow = 76;
export const Olive = 77;
export const DarkOlive = 78;

// --- GREENS / TEALS ---
export const BrightGreen = 8;
export const ForestGreen = 9;
export const DullGreen = 10;
export const NeonGreen = 11;
export const TealGreen = 12;
export const MutedTeal = 13;
export const Cyan = 14;
export const Lime = 31;
export const DeepGreen = 32;
export const PaleGreen = 43;
export const MintGreen = 44;
export const OliveGreen = 45;
export const VeryDarkGreen = 80;
export const DullOlive = 81;
export const DarkOliveGreen = 83;
export const DarkGrassGreen = 85;
export const DarkTeal = 87;
export const MutedSeaGreen = 89;
export const DeepTeal = 90;

// --- CYANS / AQUAS / BLUES ---
export const AzureBlue = 15;
export const RoyalBlue = 16;
export const Navy = 17;
export const PaleCyan = 46;
export const SkyBlue = 47;
export const LightBlue = 48;
export const MutedBlue = 49;
export const LavenderBlue = 50;
export const DeepBlue = 93;
export const DarkBlue = 95;
export const CoolBlue = 97;
export const Indigo = 99;
export const DeepBlueIndigo = 100;
export const PurpleBlue = 101;
export const DarkIndigo = 102;
export const PureBlue = 125;

// --- PURPLES / VIOLETS ---
export const BlueViolet = 18;
export const Violet = 19;
export const Purple = 22;
export const Lilac = 34;
export const DeepPlum = 106;
export const DarkViolet = 108;
export const WinePurple = 110;
export const DarkRose = 112;

// --- PRIMARY COLORS ---
export const Blue = 125;
export const Green = 126;
export const Red = 127;

export const colourNames = {  // for pads, steps and play, rec, and record leds
  0: "Black",
  1: "Bright Red",
  2: "Orange Red",
  3: "Bright Orange",
  4: "Tan / Muted Orange",
  5: "Light Yellow",
  6: "Ochre",
  7: "Vivid Yellow",
  8: "Bright Green",
  9: "Forest Green",
  10: "Dull Green",
  11: "Neon Green",
  12: "Teal Green",
  13: "Muted Teal",
  14: "Cyan",
  15: "Azure Blue",
  16: "Royal Blue",
  17: "Navy",
  18: "Blue-Violet",
  19: "Violet",
  20: "Electric Violet",
  21: "Hot Magenta",
  22: "Purple",
  23: "Neon Pink",
  24: "Rose",
  25: "Bright Pink",
  26: "Light Magenta",
  27: "Rust Red",
  28: "Burnt Orange",
  29: "Mustard",
  30: "Yellow-Green",
  31: "Lime",
  32: "Deep Green",
  33: "Blue",
  34: "Lilac",
  35: "Mauve",
  36: "",
  37: "",
  38: "",
  39: "",
  40: "",
  41: "",
  42: "",
  43: "Pale Green",
  44: "Mint Green",
  45: "Olive Green",
  46: "Pale Cyan",
  47: "Sky Blue",
  48: "Light Blue",
  49: "Muted Blue",
  50: "Lavender Blue",
  51: "",
  52: "",
  53: "",
  54: "",
  55: "",
  56: "",
  57: "",
  58: "",
  59: "",
  60: "",
  61: "",
  62: "",
  63: "",
  64: "",
  65: "Deep Red",
  66: "Very Dark Red",
  67: "Brick",
  68: "",
  69: "",
  70: "",
  71: "",
  72: "",
  73: "Dull Yellow",
  74: "Very Dark Yellow",
  75: "Brown-Yellow",
  76: "Deep Brown-Yellow",
  77: "Olive",
  78: "Dark Olive",
  79: "Dull Green",
  80: "Very Dark Green",
  81: "Dull Olive",
  82: "",
  83: "Dark Olive Green",
  84: "",
  85: "Dark Grass Green",
  86: "",
  87: "Dark Teal",
  88: "",
  89: "Muted Sea Green",
  90: "Deep Teal",
  91: "",
  92: "",
  93: "Deep Blue",
  94: "",
  95: "Dark Blue",
  96: "",
  97: "Cool Blue",
  98: "",
  99: "Indigo",
  100: "Deep Indigo",
  101: "Purple-Blue",
  102: "Dark Indigo",
  104: "Deep Violet",
  105: "Muted Violet",
  106: "Deep Plum",
  107: "Dark Purple",
  108: "Dark Violet",
  109: "Deep Magenta",
  110: "Wine Purple",
  111: "Dusty Rose",
  112: "Dark Rose",
  113: "Mauve",
  114: "Deep Wine",
  115: "Dusky Mauve",
  116: "Shadow Mauve",
  117: "Black (dup)",
  118: "Light Grey",
  119: "Dark Grey (dup)",
  120: "White",
  121: "Light Grey (dup)",
  122: "White (dup)",
  123: "Light Grey (dup)",
  124: "Dark Grey",
  125: "Blue",
  126: "Green",
  127: "Red",
  128: ""
};

export const midiNotes = {
  0: "C-2",
  1: "C#-2/Db-2",
  2: "D-2",
  3: "D#-2/Eb-2",
  4: "E-2",
  5: "F-2",
  6: "F#-2/Gb-2",
  7: "G-2",
  8: "G#-2/Ab-2",
  9: "A-2",
  10: "A#-2/Bb-2",
  11: "B-2",
  12: "C-1",
  13: "C#-1/Db-1",
  14: "D-1",
  15: "D#-1/Eb-1",
  16: "E-1",
  17: "F-1",
  18: "F#-1/Gb-1",
  19: "G-1",
  20: "G#-1/Ab-1",
  21: "A0",
  22: "A#0/Bb0",
  23: "B0",
  24: "C1",
  25: "C#1/Db1",
  26: "D1",
  27: "D#1/Eb1",
  28: "E1",
  29: "F1",
  30: "F#1/Gb1",
  31: "G1",
  32: "G#1/Ab1",
  33: "A1",
  34: "A#1/Bb1",
  35: "B1",
  36: "C2",
  37: "C#2/Db2",
  38: "D2",
  39: "D#2/Eb2",
  40: "E2",
  41: "F2",
  42: "F#2/Gb2",
  43: "G2",
  44: "G#2/Ab2",
  45: "A2",
  46: "A#2/Bb2",
  47: "B2",
  48: "C3",
  49: "C#3/Db3",
  50: "D3",
  51: "D#3/Eb3",
  52: "E3",
  53: "F3",
  54: "F#3/Gb3",
  55: "G3",
  56: "G#3/Ab3",
  57: "A3",
  58: "A#3/Bb3",
  59: "B3",
  60: "C4 midC",
  61: "C#4/Db4",
  62: "D4",
  63: "D#4/Eb4",
  64: "E4",
  65: "F4",
  66: "F#4/Gb4",
  67: "G4",
  68: "G#4/Ab4",
  69: "A4",
  70: "A#4/Bb4",
  71: "B4",
  72: "C5",
  73: "C#5/Db5",
  74: "D5",
  75: "D#5/Eb5",
  76: "E5",
  77: "F5",
  78: "F#5/Gb5",
  79: "G5",
  80: "G#5/Ab5",
  81: "A5",
  82: "A#5/Bb5",
  83: "B5",
  84: "C6",
  85: "C#6/Db6",
  86: "D6",
  87: "D#6/Eb6",
  88: "E6",
  89: "F6",
  90: "F#6/Gb6",
  91: "G6",
  92: "G#6/Ab6",
  93: "A6",
  94: "A#6/Bb6",
  95: "B6",
  96: "C7",
  97: "C#7/Db7",
  98: "D7",
  99: "D#7/Eb7",
  100: "E7",
  101: "F7",
  102: "F#7/Gb7",
  103: "G7",
  104: "G#7/Ab7",
  105: "A7",
  106: "A#7/Bb7",
  107: "B7",
  108: "C8",
  109: "C#8/Db8",
  110: "D8",
  111: "D#8/Eb8",
  112: "E8",
  113: "F8",
  114: "F#8/Gb8",
  115: "G8",
  116: "G#8/Ab8",
  117: "A8",
  118: "A#8/Bb8",
  119: "B8",
  120: "C9",
  121: "C#9/Db9",
  122: "D9",
  123: "D#9/Eb9",
  124: "E9",
  125: "F9",
  126: "F#9/Gb9",
  127: "G9"
};


// MIDI messages 
export const MidiNoteOff = 0x80;
export const MidiNoteOn = 0x90;
export const MidiPolyAftertouch = 0xA0;
export const MidiCC = 0xB0;
export const MidiPC = 0xC0;
export const MidiChAftertouch = 0xD0;
export const MidiWheel = 0xE0;
export const MidiSysexStart = 0xF0;
export const MidiSysexEnd = 0xF7;
export const MidiClock = 0xF8;

export const MidiCCOn = 0x7F;
export const MidiCCOff = 0x00;
export const MIDIChannels = Array.from({length: 16}, (x, i) => i+1);


// Internal MIDI Notes
export const MoveKnob1Touch = 0;  // on = 127, off = 0-63
export const MoveKnob2Touch = 1;
export const MoveKnob3Touch = 2;
export const MoveKnob4Touch = 3;
export const MoveKnob5Touch = 4;
export const MoveKnob6Touch = 5;
export const MoveKnob7Touch = 6;
export const MoveKnob8Touch = 7;
export const MoveMasterTouch = 8;
export const MoveMainTouch = 9;
export const MoveStep1 = 16;   // and LED
export const MoveStep2 = 17;   // and LED
export const MoveStep3 = 18;   // and LED
export const MoveStep4 = 19;   // and LED
export const MoveStep5 = 20;   // and LED
export const MoveStep6 = 21;   // and LED
export const MoveStep7 = 22;   // and LED
export const MoveStep8 = 23;   // and LED
export const MoveStep9 = 24;   // and LED
export const MoveStep10 = 25;   // and LED
export const MoveStep11 = 26;   // and LED
export const MoveStep12 = 27;   // and LED
export const MoveStep13 = 28;   // and LED
export const MoveStep14 = 29;   // and LED
export const MoveStep15 = 30;   // and LED
export const MoveStep16 = 31;   // and LED
export const MovePad1 = 68;   // and LED
// PADs 68-99 from bottom left to top right
export const MovePad32 = 99;   // and LED

// Internal MIDI CCs
export const MoveMainButton = 3;   // no LED
export const MoveMainKnob = 14;   // no LED
export const MoveStep1UI = 16;   // LED only
export const MoveStep2UI = 17;   // LED only
export const MoveStep3UI = 18;   // LED only
export const MoveStep4UI = 19;   // LED only
export const MoveStep5UI = 20;   // LED only
export const MoveStep6UI = 21;   // LED only
export const MoveStep7UI = 22;   // LED only
export const MoveStep8UI = 23;   // LED only
export const MoveStep9UI = 24;   // LED only
export const MoveStep10UI = 25;   // LED only
export const MoveStep11UI = 26;   // LED only
export const MoveStep12UI = 27;   // LED only
export const MoveStep13UI = 28;   // LED only
export const MoveStep14UI = 29;   // LED only
export const MoveStep15UI = 30;   // LED only
export const MoveStep16UI = 31;   // LED only
export const MoveRow4 = 40;   // bottom row    RGB led
export const MoveRow3 = 41;   // RGB led
export const MoveRow2 = 42;   // RGB led
export const MoveRow1 = 43;   // RGB led
export const MoveShift = 49;
export const MoveMenu = 50;
export const MoveBack = 51;
export const MoveCapture = 52;
export const MoveDown = 54;
export const MoveUp = 55;
export const MoveUndo = 56;
export const MoveLoop = 58;
export const MoveCopy = 60;
export const MoveLeft = 62;
export const MoveRight = 63;
export const MoveKnob1 = 71;   // clockwise = 1-63, counter clockwise = 64-127
export const MoveKnob2 = 72;
export const MoveKnob3 = 73;
export const MoveKnob4 = 74;
export const MoveKnob5 = 75;
export const MoveKnob6 = 76;
export const MoveKnob7 = 77;
export const MoveKnob8 = 78;
export const MoveMaster = 79;   // no LED
export const MovePlay = 85;
export const MoveRec = 86;
export const MoveMute = 88;
export const MoveMicOrAudIn = 114;   // Plug detect - MIC in = 0, Line in = 127
export const MoveSpkrOrAudOut = 115;   // Plug detect - Spkr out = 0, Line out = 127
export const MoveRecord = 118;   // RGB LED
export const MoveSample = 118;   // Alias for MoveRecord (Sample button)
export const MoveDelete = 119;

// Groupings
export const MovePads = Array.from({length: 32}, (x, i) => i + 68);
export const MoveSteps = Array.from({length: 16}, (x, i) => i + 16);
export const MoveCCButtons = [
  MoveMainButton,
  MoveBack,
  MoveMenu,
  MovePlay,
  MoveRec,
  MoveCapture,
  MoveRecord,
  MoveSample,
  MoveLoop,
  MoveMute,
  MoveDelete,
  MoveCopy,
  MoveUndo,
  MoveShift,
  MoveUp,
  MoveLeft,
  MoveRight,
  MoveDown
];
export const MoveNoteButtons = [...MoveSteps];
export const MoveRGBLeds = [
  ...MovePads,
  ...MoveSteps,
  MovePlay,
  MoveRec,
  MoveRecord
];
export const MoveWhiteLeds = [
  MoveBack,
  MoveMenu,
  MoveCapture,
  MoveLoop,
  MoveMute,
  MoveDelete,
  MoveCopy,
  MoveUndo,
  MoveShift,
  MoveUp,
  MoveLeft,
  MoveRight,
  MoveDown
];


// LED Animations
export const NoAnimation = 0x00;
export const Trans24th = 0x01;   // 24th note based on tempo
export const Trans16th = 0x02;
export const Trans8th = 0x03;
export const Trans4th = 0x04;
export const Trans2th = 0x05;
export const Pulse24th = 0x06;
export const Pulse16th = 0x07;
export const Pulse8th = 0x08;
export const Pulse4th = 0x09;
export const Pulse2th = 0x0A;
export const Blink24th = 0x0B;
export const Blink16th = 0x0C;
export const Blink8th = 0x0D;
export const Blink4th = 0x0E;
export const Blink2th = 0x0F;

// White LED Brightness (for Menu, Back, Capture, Shift, arrows, etc.)
// These buttons have white LEDs, not RGB - use brightness values 0-127
export const WhiteLedOff = 0x00;
export const WhiteLedDim = 0x10;      // 16 - subtle
export const WhiteLedMedium = 0x40;   // 64 - medium
export const WhiteLedBright = 0x7c;   // 124 - bright (max visible)
