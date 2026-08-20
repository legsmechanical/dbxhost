# websmoke — the browser-verification rig for the remote UI

The jsdom harness every remote-UI change in the 2026-08 arc was verified with,
preserved from the session scratchpad (which does not survive sessions). Use it
whenever `davebox/web_ui*.js` changes: `node --check` is only a lint, and the
device is often not at hand — this is the middle gate.

## Running

```sh
cd davebox/tools/websmoke
npm init -y && npm i jsdom            # once, in this dir (gitignored)
python3 preview_server.py &           # serves ../../ (the davebox dir) on :8199
node smoke5.mjs                       # a representative smoke; write your own per change
```

The page runs on the MOCK SHIM (web_ui_core.js installs it when
`/static/schwung-remote-api.js` 404s), so the full app is interactive with
sample data and `setParam` writes are inspectable via the mock.

## The traps this rig already paid for — don't rediscover them

- **`preview_server.py` must speak HTTP/1.1 keep-alive** (and it does).
  Python's stock `http.server` default is HTTP/1.0 close-per-request, and
  node's fetch/undici *intermittently drops whole script loads* against it —
  the symptom is a DIFFERENT "X is not defined" every run as a random
  `web_ui_*.js` fails to load. It also sends `Cache-Control: no-store`
  (a phone reviewing the working tree cached stale JS) and redirects `/` to
  the app.
- **Install the canvas stub**: `import { installCanvasStub } from
  './ctxstub.mjs'` and call it in JSDOM's `beforeParse`. jsdom has no canvas;
  without the stub, `layout()` throws on the first draw and — because the
  poll loop reschedules AFTER drawing — polling dies forever, which silently
  freezes the model and makes every later assertion meaningless. (The export
  is `installCanvasStub`, not `install` — a wrong guard once ran a whole
  smoke stubless.)
- **Wait for the LAST script's global before interacting**
  (`typeof window.chainParams === "object"` poll): browsers guarantee
  classic-script document order, jsdom's async loader does not.
- **Retry the whole smoke once or twice** — jsdom + local HTTP still flakes
  rarely; a loop `for i in 1 2 3; do node smoke.mjs && break; done` is the
  pattern.
- Assertions on **`process.exit(0)` at the end** — jsdom keeps timers alive
  and the process never exits on its own (a piped `grep` then eats your
  output when the harness is killed on timeout).

## What a smoke should assert

Drive real DOM events (`dispatchEvent(new window.Event('click',{bubbles:true}))`),
then assert on rendered text/classes and on writes reaching the mock
(`schwungRemote.getParam(...)`, or the mock's `_compSets` spy for
`setParamAt`). See `smoke5.mjs` for the shape.
