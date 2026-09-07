#!/usr/bin/env node
/* grab-screen.mjs — save what the dAVEBOx SA host is showing on the OLED.
 *
 *   node davebox/tools/grab-screen.mjs [host] out.png
 *   host defaults to move.local; the login is ableton (the deploy scripts' user).
 *
 * Reads OUR display segment, /dev/shm/dbxhost-display (the prefix is
 * standalone/config.sh's DBX_SHM_PREFIX; movy's grab-screen reads STOCK's
 * /dev/shm/schwung-display, which under a session is the wrong screen), and
 * writes the frame with the same PNG writer the preview tools use. Hygiene
 * item, Josh 2026-09-05. */
import { execFileSync } from 'node:child_process';
import { unpackDisplay, DISPLAY_BYTES } from './display_unpack.mjs';
import { writePng } from './render_fb.mjs';

const args = process.argv.slice(2);
const out = args.pop();
const host = args[0] || 'move.local';
if (!out || !out.endsWith('.png')) { console.error('usage: grab-screen.mjs [host] out.png'); process.exit(2); }

const SEG = '/dev/shm/dbxhost-display';
const raw = execFileSync('ssh', ['-o', 'ConnectTimeout=8', 'ableton@' + host,
    'test -f ' + SEG + ' && cat ' + SEG + ' || { echo "no ' + SEG + ' — is a dAVEBOx session running?" >&2; exit 3; }'],
    { maxBuffer: 1 << 20 });
if (raw.length < DISPLAY_BYTES) { console.error('short read: ' + raw.length + ' bytes'); process.exit(3); }
writePng(unpackDisplay(raw.subarray(0, DISPLAY_BYTES)), out);
console.log(out);
