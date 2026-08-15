// tools/audit_loader.mjs — register the design-audit resolve/load hooks, which
// resolve device-absolute shared imports to the REAL files in this repo rather
// than stubbing them. See audit_loader_hooks.mjs for why that matters here.
//   node --import ./tools/audit_loader.mjs tools/audit_screens.mjs
import { register } from 'node:module';
register('./audit_loader_hooks.mjs', import.meta.url);
