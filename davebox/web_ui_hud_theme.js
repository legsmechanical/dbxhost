/* dAVEBOx remote UI — the Screen view's stylesheet: tokens first, then one block
 * per element, each headed by the renderer it belongs to. Injected once. Sizes
 * are in stage units (the stage is 960×480 and scaled as a whole to fit). */
(window.HUDQ = window.HUDQ || []).push(() => {
  const css = `
#screenview{display:none;flex:1;min-height:0;align-items:center;justify-content:center;background:#050607;overflow:hidden;position:relative}
#screenview.on{display:flex}
#screenview .hud-fit{position:absolute;left:50%;top:50%;width:960px;height:var(--stage-h,480px)}
/* live controls on the stage: a hand cursor, and no browser gesture (scroll,
 * zoom, selection) on what a finger turns or presses */
.hud-screen [data-in]{cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
.hud-screen [data-in="knob"]{cursor:ns-resize}
/* as an app window the screen is the window: edge to edge, no card */
body.screen-only #screenview{background:#08090b}
body.screen-only .hud-screen{border-radius:0;box-shadow:none}
/* the window owns the whole display: no page inset (the touch layout pads the
 * page by the safe area); the stage keeps its CONTENT clear instead (rescale) */
body.screen-only #app{padding-left:0;padding-right:0}
/* the window controls (web_ui_hud_app.js): page pixels, not stage units */
/* bottom right: the footer's right end, which the hints (left-aligned) never
 * reach, so the controls cover nothing — the header's top right is the tempo */
.hud-appbar{position:absolute;bottom:calc(12px + env(safe-area-inset-bottom,0px));right:16px;z-index:5;display:flex;gap:8px;transition:opacity .35s}
.hud-appbtn{font:600 12px/1 ui-sans-serif,system-ui,-apple-system,sans-serif;color:#d6d9df;background:rgba(28,31,38,.86);
  border:1px solid #2c313b;border-radius:7px;padding:7px 11px;cursor:pointer;opacity:.6;transition:opacity .15s,background .15s}
.hud-appbtn:hover{opacity:1;background:rgba(40,45,55,.95)}
body.screen-only .hud-appbtn{opacity:.85}
body.screen-only.hud-idle .hud-appbar{opacity:0;pointer-events:none}
body.screen-only.hud-idle,body.screen-only.hud-idle *{cursor:none !important}
body.screen-only #site,body.screen-only #top{display:none}
body[data-view="screen"] .seqonly{display:none}
/* tokens */
.hud-screen{--h-bg:#08090b;--h-ink:#f2f3f5;--h-dim:#8a8f99;--h-faint:#4a4f59;--h-line:#16181d;--h-amber:#ffb340;
  --h-sel:#1c2733;--h-acc:#4da3ff;--h-play:#ffcf4d;
  position:relative;width:960px;height:var(--stage-h,480px);background:var(--h-bg);border-radius:18px;overflow:hidden;
  box-shadow:0 0 0 1px #1d2026,0 20px 50px rgba(0,0,0,.5);
  display:flex;flex-direction:column;--pad-l:max(26px,var(--safe-l,0px));--pad-r:max(26px,var(--safe-r,0px));padding:max(16px,var(--safe-t,0px)) var(--pad-r) 14px var(--pad-l);color:var(--h-ink);
  font:14px/1.3 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;box-sizing:border-box}
.hud-screen.hud-fade{animation:hudfade var(--fade,110ms) ease-out}
@keyframes hudfade{from{opacity:.55}to{opacity:1}}
.hud-screen *{box-sizing:border-box}
.hud-stale{filter:saturate(.2) brightness(.55)}
.hud-stalemsg{position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#ffc86b;font-size:15px;font-weight:600}
.hud-wait{align-items:center;justify-content:center}
.hud-waitmsg{color:var(--h-dim);font-size:20px}
/* region: status */
.hud-status{display:flex;align-items:center;gap:18px;height:44px;padding-bottom:10px;margin-bottom:8px;border-bottom:1px solid var(--h-line);flex:0 0 auto}
.hud-spacer{flex:1}
.hud-it-track{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:700;white-space:nowrap}
.hud-it-track i{width:28px;height:28px;font-size:15px !important;border-radius:6px;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;color:#0b0c0e;font-size:12px}
.hud-it-track span{color:var(--h-dim);font-weight:500}
.hud-it-clip{font-size:19px;color:var(--h-dim);white-space:nowrap}.hud-it-clip b{color:var(--h-ink)}.hud-it-clip .pl{color:var(--h-play)}
.hud-it-pips{display:flex;gap:5px}
.hud-pip{width:32px;height:24px;border-radius:6px;position:relative;font:700 13px ui-monospace,monospace;color:#0b0c0e;display:flex;align-items:center;justify-content:center}
.hud-pip.off{background:transparent!important;box-shadow:inset 0 0 0 1.5px var(--c);color:var(--c);opacity:.55}
.hud-pip.mute{opacity:.25}
.hud-pip.q{animation:hudq .6s steps(2) infinite}@keyframes hudq{50%{opacity:.35}}
.hud-pip.cur::after{content:"";position:absolute;left:3px;right:3px;bottom:-5px;height:2px;border-radius:1px;background:var(--h-ink)}
.hud-it-transport{font-size:18px;color:var(--h-dim);font-variant-numeric:tabular-nums;white-space:nowrap}.hud-it-transport b{color:var(--h-play)}
/* region: header */
.hud-header{display:flex;align-items:center;gap:12px;min-height:40px;flex:0 0 auto}
.hud-header .t{font-size:24px;font-weight:700;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hud-header .t.touch{font-size:24px}
.hud-header .r{margin-left:auto;color:var(--h-dim);font-size:16px;font-weight:600;white-space:nowrap}
.hud-header .tabs{display:flex;gap:6px;margin-left:8px}
.hud-header .tab{font-size:12px;font-weight:700;padding:4px 9px;border-radius:6px;color:var(--h-faint);background:#14161a}
.hud-header .tab.on{color:#0b0c0e;background:var(--h-acc)}
/* region: hints — a FOOTER BAR, set off from the screen (Josh, 2026-11-07:
 * "they should be a footer bar that makes it clear that they're ui
 * instructions"): edge to edge under a rule, its own ground, always there so
 * the screen above never shifts when a screen has no hints. */
.hud-hints{display:flex;gap:30px;color:#b4bac4;font-size:20px;height:56px;align-items:center;flex:0 0 auto;
  margin:8px calc(0px - var(--pad-r)) -14px calc(0px - var(--pad-l));padding:0 var(--pad-r) var(--safe-b,0px) var(--pad-l);background:#101318;border-top:1px solid #222730}
.hud-hints .hud-hint{display:flex;align-items:center;gap:10px;font-size:20px;color:#b4bac4;margin:0;line-height:1;font-weight:500}
.hud-hints kbd{font:700 18px ui-sans-serif,system-ui,sans-serif;padding:5px 11px;border-radius:8px;background:#262c37;color:var(--h-ink);box-shadow:inset 0 -2px 0 #0b0c0e}
.hud-hints .ctx{margin-left:auto;color:var(--h-ink);font-weight:600}
/* body */
.hud-body{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
.hud-body.hud-l-list{justify-content:flex-start;overflow:hidden;padding-top:4px}
/* layout: kit — one row of 8 */
.hud-knobs{display:grid;grid-template-columns:repeat(8,1fr);gap:10px;align-items:center}
.hud-kn{display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;min-width:0}
.hud-kn .w{height:92px;display:flex;align-items:center;justify-content:center;width:100%}
.hud-kn .v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.hud-kn .l{font-size:13px;color:var(--h-dim);text-align:center;height:17px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.hud-kn .sub{min-height:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}
.hud-kn{border-radius:14px;border:2px solid transparent}
.hud-kn.blank{opacity:.16}.hud-kn.tch .l{color:var(--h-ink);font-weight:700}
.hud-kn.tch{background:color-mix(in srgb,var(--kc) 16%,#0d0f13);border-color:var(--kc);box-shadow:0 0 18px color-mix(in srgb,var(--kc) 45%,transparent)}
.hud-kn.lock .l{color:var(--h-amber)}
/* touch + click does something on this knob: the OLED's corner brackets */
.hud-kn.opens::after{content:'';position:absolute;inset:3px;pointer-events:none;--oc:#4a505a;
  background:linear-gradient(var(--oc),var(--oc)) top left/12px 2px no-repeat,linear-gradient(var(--oc),var(--oc)) top left/2px 12px no-repeat,
  linear-gradient(var(--oc),var(--oc)) top right/12px 2px no-repeat,linear-gradient(var(--oc),var(--oc)) top right/2px 12px no-repeat,
  linear-gradient(var(--oc),var(--oc)) bottom left/12px 2px no-repeat,linear-gradient(var(--oc),var(--oc)) bottom left/2px 12px no-repeat,
  linear-gradient(var(--oc),var(--oc)) bottom right/12px 2px no-repeat,linear-gradient(var(--oc),var(--oc)) bottom right/2px 12px no-repeat}
.hud-kn.opens.tch::after{--oc:var(--kc)}
.hud-kn.under .w{height:60px}.hud-kn.under .v{font-size:17px}
/* widgets */
.hud-w-svg{width:92px;height:92px}
.hud-kn.under .hud-w-svg{width:58px;height:58px}
.hud-w-sq{min-width:70px;max-width:100%;height:56px;border-radius:12px;border:2px solid #23262c;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;padding:0 8px;white-space:nowrap;overflow:hidden}
.hud-w-big{font-size:34px;font-weight:800;font-variant-numeric:tabular-nums}
.hud-w-pill{width:64px;height:30px;border-radius:15px;background:#1d2026;position:relative}
.hud-w-pill i{position:absolute;top:4px;width:22px;height:22px;border-radius:11px;background:#5a606c}
.hud-w-pill.on i{left:38px}.hud-w-pill:not(.on) i{left:4px}
.hud-w-hbar{width:78px;height:10px;border-radius:5px;background:#1d2026;position:relative;overflow:hidden}
.hud-w-hbar i{position:absolute;left:0;top:0;bottom:0;border-radius:5px}
.hud-w-vbar{width:16px;height:80px;border-radius:8px;background:#1d2026;position:relative;overflow:hidden}
.hud-w-vbar i{position:absolute;left:0;right:0;bottom:0;border-radius:8px}
.hud-w-opaque{max-width:100%;height:44px;border-radius:10px;border:2px dashed #2a2f37;display:flex;align-items:center;padding:0 10px;font-size:14px;color:var(--h-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* adornments */
.hud-a-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px;vertical-align:2px}
.hud-a-auto{font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--h-amber)}
.hud-a-lock{font-size:10px;font-weight:700;letter-spacing:.6px;color:var(--h-amber)}
.hud-a-opts{display:flex;gap:6px;font-size:12px;color:var(--h-faint);white-space:nowrap}.hud-a-opts b{color:var(--h-ink)}
/* viz */
.hud-vrow{display:grid;grid-template-columns:repeat(8,1fr);gap:10px;height:118px;margin-bottom:10px}
.hud-viz{border-radius:12px;background:#0f1114;position:relative;overflow:hidden}
.hud-viz svg{position:absolute;inset:0;width:100%;height:100%}
.hud-viz .tag{position:absolute;left:10px;top:7px;font-size:10px;font-weight:700;letter-spacing:.8px;color:var(--h-faint)}
/* layout: overview */
.hud-ovw{display:flex;flex-direction:column;gap:22px}
.hud-ovw-info{display:flex;align-items:baseline;gap:16px}
.hud-ovw-info .k{font-size:30px;font-weight:700}
.hud-ovw-info .k.u{text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:8px;text-decoration-color:var(--h-acc)}
.hud-ovw-info .held{font-size:20px;font-weight:700;padding:4px 12px;border-radius:8px;background:var(--h-sel);color:var(--h-acc)}
.hud-ovw-info .tag{font-size:14px;font-weight:700;letter-spacing:.8px;color:var(--h-amber)}
.hud-ovw-info .r{margin-left:auto;font-size:18px;color:var(--h-dim);font-weight:600}
.hud-ovw-info .fol{font-size:12px;margin-right:8px;color:var(--h-faint)}
.hud-ovw-tracks{display:grid;grid-template-columns:repeat(8,1fr);gap:10px}
.hud-tile{height:120px;border-radius:14px;position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  box-shadow:inset 0 0 0 2px color-mix(in srgb,var(--c) 45%,transparent);background:color-mix(in srgb,var(--c) 10%,#0d0f12)}
.hud-tile .n{font-size:15px;font-weight:700;color:var(--h-dim)}
.hud-tile .c{font-size:44px;font-weight:800;color:var(--c);line-height:1}
.hud-tile.play{background:var(--c);box-shadow:none}.hud-tile.play .n,.hud-tile.play .c{color:#0b0c0e}
.hud-tile.q{animation:hudq .6s steps(2) infinite}
.hud-tile.empty .c{opacity:.35}
.hud-tile.mute{opacity:.35}
.hud-tile.cur{outline:3px solid var(--h-ink);outline-offset:3px}
.hud-tile .b{position:absolute;top:8px;right:9px;font-size:12px;font-weight:800;padding:1px 6px;border-radius:5px}
.hud-tile .b.s{background:#3fd28b;color:#0b0c0e}.hud-tile .b.m{background:#ff6b6b;color:#0b0c0e}
.hud-pos{display:flex;align-items:center;gap:10px}
.hud-pos .segs{flex:1;display:flex;gap:6px}
.hud-pos .seg{flex:1;height:12px;border-radius:6px;background:#1a1d22;position:relative}
.hud-pos .seg.view{background:#3a3f48}
.hud-pos .seg.play{box-shadow:inset 0 0 0 2px var(--h-play)}
.hud-pos .seg i{position:absolute;top:-4px;bottom:-4px;width:3px;margin-left:-1px;border-radius:2px;background:var(--h-play)}
.hud-pos .more{color:var(--h-dim);font-size:18px}
.hud-pos .len{color:var(--h-faint);font-size:13px;white-space:nowrap}
/* layout: bars */
.hud-bars{display:grid;grid-template-columns:repeat(8,1fr);gap:10px;height:250px}
.hud-bars .col{display:flex;flex-direction:column;align-items:center;gap:6px}
.hud-bars .well{flex:1;width:46px;border-radius:10px;background:#111317;position:relative;overflow:hidden}
.hud-bars .well i{position:absolute;left:0;right:0;bottom:0;border-radius:10px}
.hud-bars.bip .well::after{content:"";position:absolute;left:0;right:0;top:50%;height:2px;background:#2a2f37}
.hud-bars.bip .well i.up{bottom:50%;border-radius:10px 10px 0 0}
.hud-bars.bip .well i.dn{top:50%;bottom:auto;border-radius:0 0 10px 10px}
.hud-bars .well i.thru{top:0;opacity:.35}
.hud-bars .v{font-size:20px;font-weight:700;font-variant-numeric:tabular-nums;height:26px}
.hud-bars .l{font-size:13px;color:var(--h-dim)}
.hud-bars .col.off{opacity:.2}
.hud-bars .col.tch .l{color:var(--h-ink)}
/* layout: picture */
.hud-pic{display:flex;flex-direction:column;align-items:center;gap:8px}
.hud-oled{width:512px;height:256px;image-rendering:pixelated;border-radius:8px}
.hud-pic .cap{font-size:22px;font-weight:700}.hud-pic .sub{font-size:14px;color:var(--h-dim)}
.hud-pic.kn{gap:4px}.hud-pic.kn .hud-oled{width:352px;height:176px}.hud-pic.kn .cap{font-size:18px}
.hud-note{display:flex;align-items:center;justify-content:center;gap:14px}
.hud-note .nm{font-size:44px;font-weight:800}.hud-note .sb{font-size:18px;color:var(--h-dim)}
.hud-note.hi{box-shadow:inset 0 0 0 2px var(--h-acc)}
/* layout: perf */
.hud-perf{display:flex;flex-direction:column;align-items:center;gap:26px}
.hud-perf .pop{font-size:72px;font-weight:800}
.hud-perf .none{font-size:26px;font-weight:700;text-align:center}.hud-perf .none span{font-size:17px;color:var(--h-dim);font-weight:500}
.hud-perf .mods{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:860px}
.hud-perf .mod{font-size:24px;font-weight:800;padding:10px 20px;border-radius:14px;background:color-mix(in srgb,var(--c) 22%,#0d0f12);color:var(--c);box-shadow:inset 0 0 0 2px var(--c)}
.hud-perf .hud-chips .hud-chip{font-size:16px;padding:6px 14px}
.hud-bigv .row{display:flex;align-items:center;gap:40px}
.hud-bigv .pv,.hud-bigv .nx{font-size:26px;color:var(--h-faint);font-variant-numeric:tabular-nums}
.hud-bigv .pv::before{content:"‹ "}.hud-bigv .nx::after{content:" ›"}
.hud-strip{display:grid;grid-template-columns:repeat(var(--n),1fr);gap:2px;width:820px;height:40px;margin-top:14px}
.hud-strip i{background:#15181d;border-radius:2px}.hud-strip i.sq{background:#1b1f26}.hud-strip i.sb{background:#252a33}
.hud-strip i.on{background:var(--h-acc)}
.hud-stripn{display:flex;justify-content:space-around;width:820px;color:var(--h-faint);font-size:12px}
.hud-wavebox{height:150px;border-radius:12px;background:#0f1114;margin-bottom:10px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.hud-wavebox.sm{height:60px;margin:0}
.hud-wave{width:100%;height:100%}
.hud-wavemsg{color:var(--h-dim);font-size:16px}
.hud-wavebox.big{height:230px}
.hud-wavebox.mid{height:170px}
.hud-wknobs{margin-top:6px}
.hud-ro{display:flex;align-items:center;height:36px;margin-bottom:12px;font-variant-numeric:tabular-nums}
.hud-ro .l,.hud-ro .m,.hud-ro .r{flex:1;display:flex;gap:10px}.hud-ro .m{justify-content:center}.hud-ro .r{justify-content:flex-end}
.hud-ro .ro{font-size:18px;font-weight:600;color:var(--h-dim);padding:4px 10px;border-radius:8px}
.hud-ro .ro.on{background:var(--h-acc);color:#0b0c0e}
.hud-wavelab{position:relative;height:22px;margin-top:4px}
.hud-wavelab span{position:absolute;transform:translateX(-50%);font-size:13px;font-weight:600;color:var(--h-dim);white-space:nowrap}
/* layout: keyboard */
.hud-kbd{display:flex;flex-direction:column;gap:12px}
.hud-kbd .t{font-size:14px;color:var(--h-dim);text-transform:uppercase;letter-spacing:.6px}
.hud-kbd .buf{font-size:34px;font-weight:700;min-height:44px;border-bottom:2px solid #2a2f37;padding-bottom:6px;white-space:nowrap;overflow:hidden}
.hud-kbd .buf i{display:inline-block;width:3px;height:32px;background:var(--h-acc);margin-left:3px;vertical-align:-4px}
.hud-kbd .keys{display:grid;grid-template-columns:repeat(13,1fr);gap:6px}
.hud-kbd .key{height:36px;border-radius:8px;background:#14161a;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600}
.hud-kbd .key.sel{background:var(--h-acc);color:#0b0c0e}
.hud-kbd .spec{display:flex;gap:8px}.hud-kbd .spec .key{flex:1}
/* layout: list */
.hud-list{display:flex;flex-direction:column;gap:3px;position:relative;padding-right:14px}
.hud-row{display:flex;align-items:center;height:31px;padding:0 16px;border-radius:8px;font-size:18px;white-space:nowrap}
.hud-row .lab{overflow:hidden;text-overflow:ellipsis}
.hud-row .q{margin-left:8px;color:var(--h-faint);font-size:14px}
.hud-row .val{margin-left:auto;padding-left:16px;color:var(--h-dim);font-variant-numeric:tabular-nums}
.hud-row.hdr .lab{font-weight:600}
.hud-row.sel{background:var(--h-sel)}.hud-row.sel .val{color:var(--h-acc)}
.hud-row.sel::before{content:"";width:5px;height:22px;border-radius:3px;background:var(--h-acc);margin:0 12px 0 -8px;flex:0 0 auto}
.hud-row.edit .val{color:#0b0c0e;background:var(--h-acc);border-radius:6px;padding:2px 10px}
.hud-row.gap{height:10px}
.hud-row.div{height:13px;position:relative}
.hud-row.div::after{content:"";position:absolute;left:16px;right:16px;top:6px;height:1px;background:#2e333c}
.hud-scroll{position:absolute;right:0;top:4px;bottom:4px;width:4px;border-radius:2px;background:#1a1d22}
.hud-scroll i{position:absolute;left:0;right:0;border-radius:2px;background:#3a3f48}
/* layout: prompt */
.hud-prompt{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center}
.hud-prompt .q{font-size:30px;font-weight:700}
.hud-prompt .s{font-size:18px;color:var(--h-dim);max-width:720px;line-height:1.4}
.hud-btns{display:flex;gap:16px;margin-top:14px}
.hud-btn{min-width:150px;height:52px;border-radius:12px;border:2px solid #2a2f37;display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:600;color:var(--h-dim);padding:0 18px}
.hud-btn.sel{border-color:#ff6b6b;color:var(--h-ink);background:#2a1618}
/* layout: big / card */
.hud-bigv{display:flex;flex-direction:column;align-items:center;gap:10px}
.hud-bigv .n{font-size:96px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.hud-bigv .u{font-size:22px;color:var(--h-dim)}
.hud-bigv .bar{width:520px;height:12px;border-radius:6px;background:#1d2026;position:relative;overflow:hidden}
.hud-bigv .bar i{position:absolute;left:0;top:0;bottom:0;background:var(--h-acc);border-radius:6px}
.hud-chips{display:flex;gap:8px;justify-content:center;margin-top:10px}
.hud-chip{font-size:14px;font-weight:700;padding:4px 11px;border-radius:7px;background:#14161a;color:var(--h-faint)}
.hud-chip.on{background:var(--h-sel);color:var(--h-acc)}
/* region: overlay (cards drawn over any screen) */
.hud-ovl{position:absolute;inset:0;background:rgba(5,6,8,.62);display:flex;align-items:center;justify-content:center;padding:40px}
.hud-ovl .card{min-width:420px;max-width:760px;background:#12151b;border:1px solid #262b33;border-radius:16px;padding:20px 26px;box-shadow:0 20px 50px rgba(0,0,0,.6)}
.hud-ovl .card .t{font-size:20px;font-weight:700;margin-bottom:10px}
.hud-ovl .card.wide{max-width:none;width:100%;min-width:0}
.hud-ovl .card.c-list{min-width:360px;max-height:100%;overflow:hidden;display:flex;flex-direction:column}
.hud-ovl .card.c-list .hud-list{position:relative}
.hud-ovl .card.c-big .hud-bigv .n{font-size:56px}
.hud-row.note{justify-content:center;color:var(--h-dim);font-size:.85em}
.hud-ovl .card.c-big .hud-bigv .bar{width:420px}
.hud-pads{display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:auto repeat(4,64px);gap:8px;column-gap:8px}
.hud-pads .ph{font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a93a3;padding:0 2px 2px}
.hud-pads .pad{border:1px solid #23272e;border-radius:10px;background:#101318;display:flex;flex-direction:column;justify-content:center;padding:4px 7px;min-width:0;color:#e9edf2}
.hud-pads .pad .pl{font-size:15px;font-weight:600;line-height:1.15;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.hud-pads .pad .ps{font-size:13px;color:#aab2bf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hud-pads .pad.cur .ps{color:#3a4250}
body.hud-review>*:not(#hudreview){display:none!important}
html.hud-review,body.hud-review{background:#050607;overflow:auto!important;height:auto!important;min-height:0!important;position:static!important}
#hudreview{padding:24px;color:#e9edf2;font:14px ui-sans-serif,system-ui,sans-serif}
#hudreview h1{font-size:22px;margin:0 0 4px}#hudreview p{color:#8a8f99;margin:0 0 18px}
#hudreview .rv-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
#hudreview .rv-card{background:#0c0e11;border:1px solid #1d2128;border-radius:12px;padding:10px 12px}
#hudreview .rv-t{display:flex;gap:10px;align-items:baseline;margin-bottom:8px}#hudreview .rv-t span{color:#5a606b;font-size:12px}
#hudreview .rv-row{display:flex;gap:12px;align-items:flex-start}
#hudreview .rv-shot{width:480px;height:240px;flex:0 0 auto;overflow:hidden}
#hudreview .rv-shot>.hud-screen{transform:scale(.5);transform-origin:0 0}
#hudreview .rv-oled{width:192px;height:96px;image-rendering:pixelated;border-radius:6px;flex:0 0 auto}
#hudreview .rv-scratch{position:absolute;left:-20000px;top:0}
.hud-notice{display:flex;flex-direction:column;align-items:center;gap:8px;padding:10px 20px;text-align:center}
.hud-notice .t{font-size:30px;font-weight:800;letter-spacing:.04em}
.hud-notice .l{font-size:20px;color:var(--h-dim);padding:3px 14px;border-radius:8px}
.hud-notice .hi{background:var(--h-acc);color:#0b0c0e}
.hud-o-track,.hud-o-sess{display:flex;flex-direction:column;gap:8px;height:100%;min-height:0}
.hud-o-info{display:flex;align-items:baseline;gap:14px;flex:0 0 auto;min-height:32px}
.hud-o-info .k{font-size:26px;font-weight:700}
.hud-o-info .k.u{text-decoration:underline;text-decoration-thickness:3px;text-underline-offset:7px;text-decoration-color:var(--h-acc)}
.hud-o-info .held{font-size:17px;font-weight:700;padding:3px 10px;border-radius:8px;background:var(--h-sel);color:var(--h-acc)}
.hud-o-info .tag{font-size:13px;font-weight:800;letter-spacing:.8px;color:var(--h-amber)}
.hud-o-info .r{margin-left:auto;display:flex;gap:16px;align-items:baseline;font-size:17px;color:var(--h-dim);font-weight:600;white-space:nowrap}
.hud-o-info .fol{font-size:12px;color:var(--h-faint);margin-right:6px}
.hud-o-info .pg,.hud-o-info .st{color:var(--h-faint);font-size:15px}
.hud-o-info .tabs{display:flex;gap:6px}
.hud-o-info .tab{font-size:14px;font-weight:700;padding:5px 11px;border-radius:7px;color:var(--h-faint);background:#14161a}
.hud-o-info .tab.on{color:#0b0c0e;background:var(--h-acc)}
.hud-o-main{flex:1;min-height:0;display:flex;gap:14px}
.hud-o-rollbox{flex:1;min-width:0;border-radius:10px;background:#0e1014;overflow:hidden;position:relative}
.hud-o-keys{position:absolute;left:0;top:0;bottom:0;pointer-events:none}
.hud-o-keys span{position:absolute;right:6px;transform:translateY(-50%);font:700 11px ui-sans-serif,system-ui,sans-serif;color:#4a4f59;white-space:nowrap}
.hud-o-keys span.hi{color:#f2f3f5}
/* the knob strip under the roll (Track view): the roll gives up the height */
.hud-o-track.knobs{gap:6px}
.hud-o-knobs{flex:0 0 auto;border-top:1px solid #23272f;padding-top:6px}
.hud-o-kh{display:flex;align-items:baseline;gap:14px;height:22px;overflow:hidden;margin:0 0 4px 2px;font-size:13px;font-weight:800;letter-spacing:.06em;color:var(--h-dim);text-transform:uppercase;white-space:nowrap}
.hud-o-kh b{color:var(--h-ink);letter-spacing:.02em;text-transform:none;font-size:15px}
.hud-o-kh .opts{display:flex;gap:10px;letter-spacing:0;text-transform:none;font-weight:700;color:#5c626d}
.hud-o-kh .opts .on{color:var(--h-ink);background:#2a2f37;border-radius:5px;padding:1px 6px}
.hud-o-kh .val{letter-spacing:0;text-transform:none;color:var(--h-ink)}
.hud-o-knobs .hud-knobs{margin:0}
.hud-o-knobs .hud-kn{gap:3px;padding:6px 0 8px}
.hud-o-knobs .hud-kn .w{height:78px}
.hud-o-knobs .hud-kn .hud-w-svg{width:78px;height:78px}
.hud-o-knobs .hud-kn .v{font-size:20px}
.hud-o-knobs .hud-kn .l{font-size:14px;height:18px}
.hud-o-knobs .hud-kn .sub{display:none}
.hud-o-knobs .hud-kn .hud-w-big{font-size:40px}
.hud-o-roll{width:100%;height:100%;display:block}
.hud-o-roll text{font-family:ui-sans-serif,system-ui,sans-serif}
.hud-o-wait{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--h-faint);font-size:16px}
.hud-o-wave{height:100%;display:flex;align-items:center;padding:10px}
.hud-o-tl{width:250px;display:flex;flex-direction:column;gap:4px;flex:0 0 auto}
.hud-o-tl .row{display:flex;align-items:center;gap:8px;padding:0 8px;border-radius:8px;background:#0f1115;flex:1;min-height:0}
.hud-o-tl .row.cur{background:#141a22;box-shadow:inset 0 0 0 1.5px var(--c)}
.hud-o-tl .row.mute{opacity:.4}
.hud-o-tl .n{width:20px;height:20px;border-radius:5px;background:var(--c);color:#0b0c0e;font:800 12px ui-monospace,monospace;display:flex;align-items:center;justify-content:center;flex:0 0 auto}
.hud-o-tl .nm{flex:1;min-width:0;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hud-o-tl .cl{font-size:15px;font-weight:800;color:var(--h-dim)}
.hud-o-tl .cl.empty{color:var(--h-faint);font-weight:600}
.hud-o-tl .b,.hud-o-grid .th b{font:800 11px ui-sans-serif,system-ui,sans-serif;padding:1px 5px;border-radius:4px}
.hud-o-tl .b.s,.hud-o-grid .th b.s{background:#10283a;color:#4da3ff}
.hud-o-tl .b.m,.hud-o-grid .th b.m{background:#3a2a10;color:#ffb340}
.hud-o-tl .dot{width:9px;height:9px;border-radius:50%;background:#22262d;flex:0 0 auto}
.hud-o-tl .dot.pl{background:var(--h-play)}
.hud-o-tl .dot.q{background:transparent;box-shadow:inset 0 0 0 2px var(--h-play);animation:hudq .6s steps(2) infinite}
.hud-o-grid{flex:1;min-height:0;display:grid;grid-template-columns:30px repeat(8,minmax(0,1fr));gap:5px}
.hud-o-grid .th{display:flex;align-items:center;gap:5px;font-size:13px;font-weight:700;color:var(--h-dim);min-width:0}
.hud-o-grid .th i{width:16px;height:16px;border-radius:4px;background:var(--c);flex:0 0 auto;font-style:normal;color:#0b0c0e;font:800 10px ui-monospace,monospace;display:flex;align-items:center;justify-content:center}
.hud-o-grid .th span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;min-width:0}
.hud-o-grid .th.mute{opacity:.4}
.hud-o-grid .rl{display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:var(--h-faint);border-radius:6px}
.hud-o-grid .rl.on{background:#141a22;color:var(--h-acc)}
.hud-o-grid .cc{border-radius:7px;background:#0d0f12;padding:3px 7px;display:flex;flex-direction:column;justify-content:center;gap:4px;min-width:0;min-height:0}
.hud-o-grid .cc.has{background:#151920}
.hud-o-grid .cc.pl{background:color-mix(in srgb,var(--c) 32%,#0d0f12);box-shadow:inset 0 0 0 1.5px var(--c)}
.hud-o-grid .cc.q{box-shadow:inset 0 0 0 1.5px var(--c);animation:hudq .6s steps(2) infinite}
.hud-o-grid .cc.off{opacity:.45}
.hud-o-grid .cc.mute{opacity:.35}
.hud-o-grid .cc .l{font-size:12px;font-weight:800;color:var(--h-dim)}
.hud-o-grid .cc.pl .l{color:#fff}
.hud-o-grid .th16{display:grid;grid-template-columns:repeat(16,1fr);gap:1px}
.hud-o-grid .th16 i{height:4px;border-radius:1px;background:#1d2128}
.hud-o-grid .th16 i.on{background:var(--c)}
.hud-o-mix{display:grid;grid-template-columns:30px repeat(8,minmax(0,1fr));gap:5px;align-items:center;height:42px;flex:0 0 auto}
.hud-o-mix .ml{font-size:10px;font-weight:800;letter-spacing:.06em;color:var(--h-dim);text-transform:uppercase;overflow:hidden}
.hud-o-mix .mx{display:flex;align-items:center;gap:6px;min-width:0}
.hud-o-mix .mx .w{width:36px;height:36px;flex:0 0 auto}
.hud-o-mix .mx .w svg{width:100%;height:100%}
.hud-o-mix .mx span{font-size:13px;font-weight:700;color:var(--h-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hud-o-mix .mx{border-radius:10px;border:2px solid transparent;padding:0 6px 0 2px}
.hud-o-mix .mx.tch{background:color-mix(in srgb,var(--kc) 16%,#0d0f13);border-color:var(--kc);box-shadow:0 0 14px color-mix(in srgb,var(--kc) 40%,transparent)}
.hud-o-mix .mx.tch span{color:var(--h-ink)}
.hud-o-info .kt{color:var(--h-ink);font-size:17px}
.hud-pads .pad.jt{border-bottom-left-radius:0;border-bottom-right-radius:0;margin-bottom:-4px}
.hud-pads .pad.jb{border-top-left-radius:0;border-top-right-radius:0;margin-top:-4px}
/* layout: lanes (web_ui_hud_lanes.js) — the AUTOMATION screen, and the lane strip over a parameter's page */
.hud-lanesv{display:grid;grid-template-columns:330px minmax(0,1fr);gap:18px;height:100%;min-height:0;align-items:start}
.hud-lanesv.solo{grid-template-columns:minmax(0,1fr)}
.hud-lanes{position:relative;display:flex;flex-direction:column;gap:2px;min-width:0;padding-right:10px}
.hud-lane-g{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--h-faint);padding:6px 10px 1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hud-lane{display:grid;grid-template-columns:110px minmax(0,1fr) 66px;align-items:center;gap:10px;height:30px;padding:0 10px;border-radius:8px;font-size:16px}
.hud-lanes.wide .hud-lane{grid-template-columns:200px minmax(0,1fr) 90px;height:40px;font-size:18px}
.hud-lane .nm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hud-lane .v{text-align:right;color:var(--h-dim);font-size:13px;white-space:nowrap;font-variant-numeric:tabular-nums}
.hud-lane-sp{width:100%;height:24px;display:block}
.hud-lanes.wide .hud-lane-sp{height:34px}
.hud-lane.sel{background:var(--h-sel);box-shadow:inset 3px 0 0 var(--lc)}
.hud-lane.sel .nm{color:var(--lc);font-weight:600}
.hud-lane.off .nm,.hud-lane.off .v{color:var(--h-faint)}
.hud-lane.act{grid-template-columns:1fr;color:var(--h-dim);font-size:15px}
.hud-lane-empty{color:var(--h-faint);font-size:18px;padding:20px 10px}
.hud-lane-detail{display:flex;flex-direction:column;gap:8px;min-width:0;background:#0d0f13;border:1px solid #1d2128;border-radius:14px;padding:12px 14px}
.hud-lane-detail .t,.hud-lane-strip .t{display:flex;align-items:baseline;gap:10px;white-space:nowrap;min-width:0}
.hud-lane-detail .g,.hud-lane-strip .g{font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--h-dim);overflow:hidden;text-overflow:ellipsis}
.hud-lane-detail .p{font-size:20px;font-weight:700;color:var(--lc)}
.hud-lane-detail .mute{font-size:12px;font-weight:700;color:#0b0c0e;background:var(--h-dim);border-radius:5px;padding:1px 7px}
.hud-lane-detail .now,.hud-lane-strip .now{margin-left:auto;font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
.hud-lane-detail .graph{position:relative;display:grid;grid-template-columns:62px minmax(0,1fr);gap:8px}
.hud-lane-detail .ax{display:flex;flex-direction:column;justify-content:space-between;text-align:right;font-size:12px;color:var(--h-dim);padding:2px 0;white-space:nowrap;overflow:hidden}
.hud-lane-big{width:100%;height:170px;display:block;background:#090a0d;border-radius:8px}
.hud-lane-steps{display:grid;grid-template-columns:repeat(16,1fr);gap:3px;margin-left:70px}
.hud-lane-steps i{height:12px;border-radius:3px;background:#1a1d23}
.hud-lane-steps i.none{background:#121419}
.hud-lane-steps i.held{outline:2px solid #fff;outline-offset:1px}
.hud-lane-detail .foot{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-left:70px}
.hud-lane-detail .pg{font-size:13px;color:var(--h-dim);margin-right:6px}
.hud-lane-detail .hud-chip{font-weight:600}.hud-lane-detail .hud-chip b{color:var(--h-ink);font-weight:700}
.hud-lane-strip{display:flex;flex-direction:column;gap:4px;margin:0 0 8px;padding:8px 12px;background:#0d0f13;border:1px solid #1d2128;border-radius:12px;flex:0 0 auto}
.hud-lane-strip .p{font-size:16px;font-weight:700;color:var(--lc)}
.hud-lane-strip .st{font-size:13px;color:var(--h-dim)}
.hud-lane-strip .pgs{display:flex;gap:3px;margin-left:8px}.hud-lane-strip .pgs i{width:14px;height:4px;border-radius:2px;background:#2a2f37}.hud-lane-strip .pgs i.on{background:var(--lc)}
.hud-lane-strip-g{width:100%;height:74px;display:block}
.hud-ovl.left{justify-content:flex-start;background:rgba(5,6,8,.35)}
.hud-ovl.left .card{min-width:0;width:330px}
`;
  const el = document.createElement('style');
  el.id = 'hud-theme';
  el.textContent = css;
  document.head.appendChild(el);
});
