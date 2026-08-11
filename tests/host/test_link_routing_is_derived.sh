#!/usr/bin/env bash
set -euo pipefail

# The Link Audio rebuild is DERIVED from track routing, never a user setting.
#
# A track routed to Move plays a Move instrument, and dAVEBOx owns that
# instrument's audio: it returns through the corresponding Move FX bus so it can
# be levelled, effected and sent. That return path exists only under the Link
# Audio rebuild — so the rebuild must be on exactly when at least one track is
# routed to Move. That is a consequence of the routing, not a question to ask.
#
# The "Move->Schwung" Global Settings row is therefore RETIRED. This pins the
# replacement so the row cannot drift back and so the derivation cannot be
# quietly dropped, which would leave the buses unreachable with no way to
# enable them (the internal flag has no other writer).

host_js="src/shadow/shadow_ui.js"
schema="src/shared/settings-schema.json"
db_engine="davebox/ui/ui_engine.mjs"
db_bridge="davebox/ui/ui_dsp_bridge.mjs"

# 1. The user-facing row must not come back (in either mirror of the schema).
if grep -qE '\{ *key: *"link_audio_routing"' "$host_js"; then
  echo "FAIL: the Move->Schwung Global Settings row is back in $host_js." >&2
  echo "      Link Audio routing is derived from track routing now." >&2
  exit 1
fi
if grep -q '"key": *"link_audio_routing"' "$schema"; then
  echo "FAIL: link_audio_routing is back in $schema (the web-manager mirror)." >&2
  exit 1
fi

# 2. The internal flag must survive — it is what the derivation writes.
if ! grep -q 'master_fx:link_audio_routing' "$host_js"; then
  echo "FAIL: the master_fx:link_audio_routing param is gone from $host_js." >&2
  echo "      Removing the ROW must not remove the mechanism." >&2
  exit 1
fi

# 3. The module must derive it, and must invalidate its cache on project load —
#    the host's flag belongs to the previous project, so an unchanged-looking
#    value would otherwise suppress the correcting write.
if ! grep -q 'export function syncLinkAudioRoutingFromRoutes' "$db_engine"; then
  echo "FAIL: syncLinkAudioRoutingFromRoutes is gone from $db_engine — nothing" >&2
  echo "      would enable Link Audio, and the Move buses become unreachable." >&2
  exit 1
fi
if ! grep -q 'export function invalidateLinkAudioRoutingCache' "$db_engine"; then
  echo "FAIL: invalidateLinkAudioRoutingCache is gone from $db_engine." >&2
  exit 1
fi

# 4. Both drive points must be wired: a route CHANGE, and a bulk project LOAD.
hits="$(grep -c 'syncLinkAudioRoutingFromRoutes(' "$db_bridge" || true)"
if [ "${hits:-0}" -lt 2 ]; then
  echo "FAIL: $db_bridge calls syncLinkAudioRoutingFromRoutes $hits time(s);" >&2
  echo "      expected at least 2 — the route-change path AND the project-load" >&2
  echo "      path. Missing the load path leaves a restored project's flag stale." >&2
  exit 1
fi
if ! grep -q 'invalidateLinkAudioRoutingCache()' "$db_bridge"; then
  echo "FAIL: the project-load path does not invalidate the routing cache." >&2
  exit 1
fi

echo "PASS: Link Audio routing is derived from track routes; no user-facing row; both drive points wired"
exit 0
