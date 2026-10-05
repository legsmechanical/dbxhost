// dbx-bug-drop — receives a dAVEBOx bug-report zip and saves it to a Drive folder.
//
// The web manager on a test build POSTs the zip as base64 text, with the
// metadata in the query string (schwung-manager/bugreport.go, uploadReport).
// Deploy as a Web app, Execute as: Me, Who has access: Anyone. See
// docs/BUG_REPORTS.md.

const FOLDER_ID = 'PASTE_FOLDER_ID_HERE';   // the Drive folder that receives reports
const TOKEN     = '';                        // optional shared value; '' disables the check
const MAX_BYTES = 45 * 1024 * 1024;          // decoded size cap

function doPost(e) {
  try {
    const p = (e && e.parameter) || {};
    if (TOKEN && p.token !== TOKEN) return reply_({ ok: false, error: 'bad token' });
    const body = e && e.postData && e.postData.contents;
    if (!body) return reply_({ ok: false, error: 'empty body' });
    const bytes = Utilities.base64Decode(body.replace(/\s+/g, ''));
    if (bytes.length > MAX_BYTES) return reply_({ ok: false, error: 'too large: ' + bytes.length });
    const name = safeName_(p.name || ('dbx-report_' +
      Utilities.formatDate(new Date(), 'UTC', 'yyyy-MM-dd_HH-mm-ss') + '.zip'));
    const blob = Utilities.newBlob(bytes, 'application/zip', name);
    const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
    file.setDescription(('version=' + (p.version || '?') + ' from=' + (p.host || '?')).slice(0, 2000));
    return reply_({ ok: true, id: file.getId(), name: file.getName(), size: bytes.length });
  } catch (err) {
    return reply_({ ok: false, error: String((err && err.message) || err) });
  }
}

// GET = liveness check (the manager's /bug-report/ping).
function doGet(e) { return reply_({ ok: true, service: 'dbx-bug-drop' }); }

function reply_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function safeName_(n) {
  n = String(n).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  return /\.zip$/i.test(n) ? n : n + '.zip';
}
