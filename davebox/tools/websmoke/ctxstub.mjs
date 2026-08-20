/* Minimal 2D-context stub: jsdom has no canvas backend, and davebox's poll loop
   self-reschedules AFTER drawing — one throw in layout() kills polling forever,
   which would freeze the model the Sound view follows. */
export function installCanvasStub(window) {
  const grad = { addColorStop() {} };
  const make = () => new Proxy({}, {
    get(t, p) {
      if (p in t) return t[p];
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => grad;
      if (p === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (p === 'canvas') return undefined;
      return () => {};
    },
    set(t, p, v) { t[p] = v; return true; }
  });
  window.HTMLCanvasElement.prototype.getContext = function () {
    if (!this.__ctx) this.__ctx = make();
    return this.__ctx;
  };
}
