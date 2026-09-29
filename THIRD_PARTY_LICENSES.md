# Third-Party Licenses

dAVEBOx's own source code, and the Schwung source it forks, are licensed under
the **MIT License** — see [`LICENSE`](LICENSE).

The release also links against and redistributes third-party components. This
document lists them, their licences, and which shipped artifact each one ends
up in.

---

## How this release is licensed

**The source code is MIT.** That does not change anywhere below.

Some of the *binaries* built from it combine that MIT source with copyleft
libraries, and a binary is licensed by everything that went into it. Two
different situations, which must not be conflated:

**Linked — the binary is a combined work.** `schwung-shim.so` (installed on the
device as `/usr/lib/davebox-shim.so`) is dynamically linked against
`libespeak-ng` (GPL-3.0-or-later) for the screen reader — see `SHIM_LIBS` in
`scripts/build.sh`. MIT is GPL-compatible, so this combination is permitted,
but the resulting binary is conveyed under GPL-3.0-or-later and recipients get
GPL rights over it. The MIT source remains MIT and can be reused as MIT by
anyone who does not link eSpeak.

**Aggregated — separate programs sharing a tarball.** `link-subscriber` is a
standalone program the host never links; it exchanges audio with the shim over
shared memory only. It keeps its own licence and imposes nothing on the rest.

| Shipped artifact (in `payload/`) | Licence as conveyed | Why |
|---|---|---|
| `schwung` (host) | MIT | QuickJS (MIT), stb, curl — no copyleft |
| `schwung-shim.so` → `/usr/lib/davebox-shim.so` | **GPL-3.0-or-later** | MIT source **linked** against eSpeak NG; also Flite (BSD) |
| `link-subscriber` (when built with `libs/link`) | **GPL-2.0-or-later** | Ableton Link compiled in (header-only) |
| `lib/libespeak-ng.so.*` | **GPL-3.0-or-later** | Redistributed unmodified |
| `lib/libflite*.so.*` | BSD-style | Redistributed unmodified |
| `lib/libsonic.so.*` | Apache-2.0 | Redistributed unmodified |
| `bin/heal` (`davebox-heal`), `modules/chain`, `modules/tools/davebox-sound` | MIT | This repo's own code |

Corresponding source for the GPL components is available from each project's
upstream repository, linked in its section below; `libs/link` is a git
submodule of this repository.

**Not third-party:** `lib/libpcaudio.so.0` is Schwung's own stub
(`src/host/pcaudio_stub.c`), written to satisfy eSpeak NG's symbols without
pulling in the libpulse/libX11 chain. It contains no pcaudiolib code.

**Not shipped:** `src/lib/jack2/` (vendored jack2 headers and
`JackShadowDriver`, GPL-2.0-or-later / LGPL-2.1-or-later) is in the tree but
`scripts/build.sh` removes `lib/jack` from the build, so no jack2-derived
binary is in this release. See its section below for the source licence.

---

## Flite (Carnegie Mellon University)

**Used in:** TTS (Text-to-Speech) engine for accessibility features
**Location:** Dynamically linked (libflite, libflite_cmu_us_kal, libflite_usenglish, libflite_cmulex)
**Version:** 2.2
**Website:** http://cmuflite.org

**Copyright:**
```
Copyright (c) 1999-2016 Language Technologies Institute,
Carnegie Mellon University
All Rights Reserved.
```

**License:** BSD-style permissive license

```
Permission is hereby granted, free of charge, to use and distribute
this software and its documentation without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of this work, and to
permit persons to whom this work is furnished to do so, subject to
the following conditions:
 1. The code must retain the above copyright notice, this list of
    conditions and the following disclaimer.
 2. Any modifications must be clearly marked as such.
 3. Original authors' names are not deleted.
 4. The authors' names are not used to endorse or promote products
    derived from this software without specific prior written
    permission.

CARNEGIE MELLON UNIVERSITY AND THE CONTRIBUTORS TO THIS WORK
DISCLAIM ALL WARRANTIES WITH REGARD TO THIS SOFTWARE, INCLUDING
ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS, IN NO EVENT
SHALL CARNEGIE MELLON UNIVERSITY NOR THE CONTRIBUTORS BE LIABLE
FOR ANY SPECIAL, INDIRECT OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN
AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF
THIS SOFTWARE.
```

---

## QuickJS

**Used in:** JavaScript engine for module UI execution
**Location:** `libs/quickjs/`
**Version:** 2025-04-26
**Authors:** Fabrice Bellard, Charlie Gordon
**Website:** https://bellard.org/quickjs/

**Copyright:**
```
Copyright (c) 2017-2025 Fabrice Bellard
Copyright (c) 2017-2025 Charlie Gordon
```

**License:** MIT License

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

## stb_image.h

**Used in:** Image loading for display graphics
**Location:** `src/lib/stb_image.h`
**Version:** 2.30
**Author:** Sean Barrett
**Website:** https://github.com/nothings/stb

**License:** Public Domain / MIT-0

```
Public domain image loader - http://nothings.org/stb
No warranty implied; use at your own risk
```

Also available under MIT license for jurisdictions that don't recognize public domain.

---

## curl

**Used in:** HTTP downloads for Module Store
**Location:** `libs/curl/`
**Version:** Binary included in build
**Website:** https://curl.se/

**Copyright:**
```
Copyright (c) 1996 - 2024, Daniel Stenberg, <daniel@haxx.se>, and many
contributors, see the THANKS file.
```

**License:** curl License (BSD-style)

```
Permission to use, copy, modify, and distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright
notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF THIRD PARTY RIGHTS. IN
NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
OR OTHER DEALINGS IN THE SOFTWARE.
```

---

## stb_truetype.h

**Used in:** TrueType font rendering for display
**Location:** `src/lib/stb_truetype.h`
**Author:** Sean Barrett
**Website:** https://github.com/nothings/stb

**License:** Public Domain / MIT-0

```
Public domain font renderer
No warranty implied; use at your own risk
```

---

## Ableton Link

**Used in:** Receiving Move's per-track audio over Link Audio; publishing
Schwung's slot output back as `ME-N` channels
**Location:** `libs/link/` (git submodule — https://github.com/Ableton/link)
**Shipped as:** `link-subscriber` (standalone executable, built from
`src/host/link_subscriber.cpp` against Link's header-only C++ SDK)
**Upstream:** https://github.com/Ableton/link

**Copyright:**
```
Copyright 2016, Ableton AG, Berlin. All rights reserved.
```

**License:** GPL-2.0-or-later (Ableton also offers a separate commercial license)

```
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.

If you would like to incorporate Link into a proprietary software application,
please contact <link-devs@ableton.com>.
```

Link is header-only, so it is compiled into `link-subscriber`. That executable
is therefore GPL-2.0-or-later and is distributed as such. It is a separate
program from `schwung` / `schwung-shim.so`, which do not link Link and
communicate with it only through the `/schwung-link-in` and `/schwung-pub-audio`
shared-memory segments.

---

## eSpeak NG

**Used in:** Text-to-speech for screen-reader accessibility
**Location:** Dynamically linked (`lib/libespeak-ng.so.1`), with phoneme and
voice data in `espeak-ng-data/`
**Version:** 1.51
**Upstream:** https://github.com/espeak-ng/espeak-ng

**Copyright:**
```
Copyright Holders: Jonathan Duddington 2005-2014, Gilles Casse 2007,
Ross Bencina 1999-2002, Phil Burk 1999-2002, Sun Microsystems, Inc. 2008,
Bill Cox 2010, Nicolas Pitre 2010, The NetBSD Foundation, Inc. 2000,
Reece H. Dunn 2013-2016
```

**License:** GPL-3.0-or-later

```
This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
```

The full upstream copyright file — which also covers the separately-licensed
`ieee80.c` (Apple) and `compat/getopt.c` (NetBSD Foundation) — ships as
`licenses/ESPEAK_NG_LICENSE.txt`.

eSpeak NG is a shared library loaded by Schwung's TTS path. It is redistributed
unmodified under GPL-3.0-or-later.

---

## sonic

**Used in:** Time-stretching and pitch-shifting for eSpeak NG
**Location:** Dynamically linked (`lib/libsonic.so.0`), redistributed from Debian
**Author:** Bill Cox
**Upstream:** https://github.com/waywardgeek/sonic

**License:** Apache-2.0

```
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

---

## jack2 / JackShadowDriver

**Used in:** JACK audio driver that shares audio, MIDI, and display with Move's
firmware, for the RNBO runner
**Location:** `src/lib/jack2/` (vendored headers + `shadow/JackShadowDriver.{cpp,h}`)
**Shipped as:** nothing in this release (`scripts/build.sh` removes `lib/jack`); source only
**Upstream:** https://github.com/jackaudio/jack2

**Copyright:**
```
Copyright (C) 2001 Paul Davis
Copyright (C) 2004-2008 Grame
Copyright (C) 2025 Cycling '74 - Adapted for Move (JackMoveDriver)
Copyright (C) 2026 Charles Vestal - Shadow driver (shared memory)
```

**License:** GPL-2.0-or-later (jack2 server-side headers and the driver);
LGPL-2.1-or-later (jack2 client-side headers)

```
This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program; if not, write to the Free Software
Foundation, Inc., 675 Mass Ave, Cambridge, MA 02139, USA.
```

`JackShadowDriver` is a derivative of Cycling '74's `JackMoveDriver`, itself
derived from jack2's driver classes, and is built with `-DSERVER_SIDE` against
jack2's GPL-2.0-or-later server headers. **It is GPL-2.0-or-later, not MIT.**
It is loaded by `jackd` as a driver plugin and is a separate program from the
rest of Schwung.

Of the vendored jack2 headers, 96 are LGPL-2.1-or-later (client side) and 39
are GPL-2.0-or-later (server side); `jack_shadow.so` uses both.

---

## Ableton ablspi (protocol documentation)

**Used in:** SPI buffer layout and ioctl protocol for `/dev/ablspi0.0`
**Location:** Documented in `src/lib/schwung_spi_lib.h` and `docs/SPI_PROTOCOL.md`

**License of the reference material:** GPL-2.0

Ableton's `ablspi` kernel driver was obtained through a GPL source request for
Move's JACK driver. Schwung contains **no copied ablspi code**: the struct
layouts, buffer offsets, and ioctl numbers documented in
`src/lib/schwung_spi_lib.h` describe the kernel interface Schwung must speak,
and the implementation is Schwung's own. Two short comments quote upstream
lines verbatim to record where a constant comes from. Interface facts of this
kind are not themselves a derivative work, but the provenance is recorded here
rather than left implicit.

---

## License Compatibility

**The source code is MIT** and is not a derivative of any copyleft component
listed above. Anyone may take that source under MIT terms.

One shipped binary is a combined work: `schwung-shim.so` links `libespeak-ng`
(GPL-3.0-or-later), so **that binary is conveyed under GPL-3.0-or-later**.
Recipients of the binary get GPL rights over it, and the corresponding source
must be available — which it is, publicly, at this repository.

`link-subscriber` (GPL-2.0-or-later) and `lib/libespeak-ng.so.*`
(GPL-3.0-or-later, unmodified) are separate programs/libraries in the same
tarball — mere aggregation — and impose nothing on anything else.

The full GPL texts ship as `licenses/GPL-2.0.txt` and `licenses/GPL-3.0.txt`.

**If you redistribute this release**, ship this file and `LICENSE`, keep the
`licenses/` directory intact, and keep the GPL-licensed artifacts identifiable
so their source obligations can be met.

---

## Acknowledgments

- **Carnegie Mellon University** - Flite speech synthesis library
- **Fabrice Bellard & Charlie Gordon** - QuickJS JavaScript engine
- **Sean Barrett** - stb single-file libraries
- **Daniel Stenberg** - curl HTTP library
- **Ableton** - Move hardware platform, and Ableton Link
- **The eSpeak NG contributors** - eSpeak NG speech synthesis
