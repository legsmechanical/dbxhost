/* dAVEBOx remote UI — the Screen view's stylesheet: tokens first, then one block
 * per element, each headed by the renderer it belongs to. Injected once. Sizes
 * are in stage units (the stage is 960×480 and scaled as a whole to fit). */
(window.HUDQ = window.HUDQ || []).push(() => {
  const css = `
#screenview{display:none;flex:1;min-height:0;align-items:center;justify-content:center;background:#050607;overflow:hidden;position:relative}
#screenview.on{display:flex}
#screenview .hud-fit{position:absolute;left:50%;top:50%;width:960px;height:480px}
body.screen-only #site,body.screen-only #top{display:none}
body[data-view="screen"] .seqonly{display:none}
/* tokens */
.hud-screen{--h-bg:#08090b;--h-ink:#f2f3f5;--h-dim:#8a8f99;--h-faint:#4a4f59;--h-line:#16181d;--h-amber:#ffb340;
  --h-sel:#1c2733;--h-acc:#4da3ff;--h-play:#ffcf4d;
  position:relative;width:960px;height:480px;background:var(--h-bg);border-radius:18px;overflow:hidden;
  box-shadow:0 0 0 1px #1d2026,0 20px 50px rgba(0,0,0,.5);
  display:flex;flex-direction:column;padding:16px 26px 14px;color:var(--h-ink);
  font:14px/1.3 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;box-sizing:border-box}
.hud-screen.hud-fade{animation:hudfade var(--fade,110ms) ease-out}
@keyframes hudfade{from{opacity:.55}to{opacity:1}}
.hud-screen *{box-sizing:border-box}
.hud-stale{filter:saturate(.2) brightness(.55)}
.hud-stalemsg{position:absolute;left:0;right:0;bottom:14px;text-align:center;color:#ffc86b;font-size:15px;font-weight:600}
.hud-wait{align-items:center;justify-content:center}
.hud-waitmsg{color:var(--h-dim);font-size:20px}
/* region: status */
.hud-status{display:flex;align-items:center;gap:14px;height:30px;padding-bottom:8px;margin-bottom:6px;border-bottom:1px solid var(--h-line);flex:0 0 auto}
.hud-spacer{flex:1}
.hud-it-track{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600;white-space:nowrap}
.hud-it-track i{width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:800;color:#0b0c0e;font-size:12px}
.hud-it-track span{color:var(--h-dim);font-weight:500}
.hud-it-clip{font-size:14px;color:var(--h-dim);white-space:nowrap}.hud-it-clip b{color:var(--h-ink)}.hud-it-clip .pl{color:var(--h-play)}
.hud-it-pips{display:flex;gap:5px}
.hud-pip{width:26px;height:18px;border-radius:5px;position:relative;font:700 10px ui-monospace,monospace;color:#0b0c0e;display:flex;align-items:center;justify-content:center}
.hud-pip.off{background:transparent!important;box-shadow:inset 0 0 0 1.5px var(--c);color:var(--c);opacity:.55}
.hud-pip.mute{opacity:.25}
.hud-pip.q{animation:hudq .6s steps(2) infinite}@keyframes hudq{50%{opacity:.35}}
.hud-pip.cur::after{content:"";position:absolute;left:3px;right:3px;bottom:-5px;height:2px;border-radius:1px;background:var(--h-ink)}
.hud-it-transport{font-size:13px;color:var(--h-dim);font-variant-numeric:tabular-nums;white-space:nowrap}.hud-it-transport b{color:var(--h-play)}
/* region: header */
.hud-header{display:flex;align-items:center;gap:12px;min-height:40px;flex:0 0 auto}
.hud-header .t{font-size:24px;font-weight:700;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hud-header .t.touch{font-size:24px}
.hud-header .r{margin-left:auto;color:var(--h-dim);font-size:16px;font-weight:600;white-space:nowrap}
.hud-header .tabs{display:flex;gap:6px;margin-left:8px}
.hud-header .tab{font-size:12px;font-weight:700;padding:4px 9px;border-radius:6px;color:var(--h-faint);background:#14161a}
.hud-header .tab.on{color:#0b0c0e;background:var(--h-acc)}
/* region: hints */
.hud-hints{display:flex;gap:24px;color:var(--h-faint);font-size:13px;height:22px;align-items:center;flex:0 0 auto}
.hud-hints b{color:var(--h-dim);font-weight:600}
.hud-hints .ctx{margin-left:auto;color:var(--h-dim)}
/* body */
.hud-body{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center}
/* layout: kit — one row of 8 */
.hud-knobs{display:grid;grid-template-columns:repeat(8,1fr);gap:10px;align-items:center}
.hud-kn{display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;min-width:0}
.hud-kn .w{height:92px;display:flex;align-items:center;justify-content:center;width:100%}
.hud-kn .v{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.hud-kn .l{font-size:13px;color:var(--h-dim);text-align:center;height:17px;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.hud-kn .sub{min-height:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px}
.hud-kn.blank{opacity:.16}.hud-kn.dim{opacity:.35}.hud-kn.tch .l{color:var(--h-ink)}
.hud-kn.lock .l{color:var(--h-amber)}
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
.hud-a-range{width:84px;height:5px;border-radius:3px;background:#1d2026;position:relative}
.hud-a-range i{position:absolute;left:0;top:0;bottom:0;border-radius:3px}
.hud-a-range u{position:absolute;top:-3px;bottom:-3px;width:2px;background:#5a606c}
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
.hud-row{display:flex;align-items:center;height:36px;padding:0 16px;border-radius:9px;font-size:19px;white-space:nowrap}
.hud-row .lab{overflow:hidden;text-overflow:ellipsis}
.hud-row .q{margin-left:8px;color:var(--h-faint);font-size:14px}
.hud-row .val{margin-left:auto;padding-left:16px;color:var(--h-dim);font-variant-numeric:tabular-nums}
.hud-row.hdr .lab{font-weight:600}
.hud-row.sel{background:var(--h-sel)}.hud-row.sel .val{color:var(--h-acc)}
.hud-row.sel::before{content:"";width:5px;height:22px;border-radius:3px;background:var(--h-acc);margin:0 12px 0 -8px;flex:0 0 auto}
.hud-row.edit .val{color:#0b0c0e;background:var(--h-acc);border-radius:6px;padding:2px 10px}
.hud-row.gap{height:10px}
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
`;
  const el = document.createElement('style');
  el.id = 'hud-theme';
  el.textContent = css;
  document.head.appendChild(el);
});
