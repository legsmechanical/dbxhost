# Bug reports from test builds

Test builds (version `0.0.x`, and every dev deploy) carry a **Report a bug** page
in the web manager (`http://move.local:7700/bug-report`, also linked from System
and the page footer). A tester describes the problem, picks a project (the open
one is preselected; any other can be chosen — a project that crashes on load does
not need to be open), sees the exact list of files, and presses **Send**.

## What is sent

One zip, built by `schwung-manager/bugreport.go` (`planReport` — the page shows
the same plan the zip is built from):

- `note.txt` — the tester's description.
- `logs/` — `launch.log` (last 2 MB), `launch.log.1` (last 1 MB), `seq8sa.log`,
  `shim_crash_bt.txt`, `manager.log`, `debug.log` (+`.1`), `schwung.log`, and
  small state files (`sa-build.json`, `active_set.txt`, `projects.json`, …).
  Absent files are listed as such.
- `project/<uuid>/` — the whole project folder: the dAVEBOx state folder
  (`dAVEBOx`, `dAVEBOx~11`, …) with `host/` slot files, and the Move set. Audio
  files and any file over 8 MB are left out and listed.
- `meta.json` — version, time, detected open project, what was included,
  skipped, missing, and whether the size cap cut it short.

The zip is capped at 30 MB (the upload is base64, and the receiver refuses a
body past ~50 MB). The newest three reports stay on the device in
`<install>/bug-reports/` and can be downloaded from the page.

## Where it goes

The manager POSTs the zip (base64, `Content-Type: text/plain`, metadata in the
query) to a Google Apps Script web app, which saves it to a Drive folder. The
script: [`tools/apps-script/dbx-bug-drop.gs`](../tools/apps-script/dbx-bug-drop.gs).
Apps Script answers the POST with a 302 to `script.googleusercontent.com`; the
client follows it as a GET, which is the contract. Success is a JSON body with
`ok: true` — anything else (including Google's HTML sign-in page) is a failure,
and the page offers the zip as a download instead.

### Setting up the receiver (once)

1. Create a Drive folder; copy its ID from the URL (`…/folders/<ID>`).
2. script.google.com → New project → paste `dbx-bug-drop.gs` → set `FOLDER_ID`.
3. Deploy → New deployment → Web app → **Execute as: Me**, **Who has access:
   Anyone** → Deploy → authorise Drive → copy the `/exec` URL.
4. Check it: `curl -L <exec-url>` → `{"ok":true,"service":"dbx-bug-drop"}`.
5. Release builds: repository secret `SA_BUG_REPORT_URL` (and `SA_BUG_REPORT_TOKEN`
   if `TOKEN` is set). Dev deploys: `standalone/bug-report.local.json`
   (`{"upload_url": "…", "token": ""}`, untracked).

To change the script later: Deploy → Manage deployments → edit → Version: New.
The URL stays the same.

⚠ The URL ships inside public test-build tarballs. Anyone who finds it can add
files to the folder (not read or delete them). The optional `TOKEN` stops
drive-by posts; the Drive quota is the ceiling. Rotate by redeploying under a new
deployment if it is abused.

## How a build knows it is a test build

`<install>/bug-report.json` — present: the page exists; `upload_url` empty:
download-only. `build-sa-release.sh` writes it for `0.0.*` versions only;
`install-host.sh` writes it on every dev deploy; `layout-install.sh` removes it
when a release (which lacks it) is installed over a test build. Pinned by
`tests/host/test_bug_report_gate.sh`.
