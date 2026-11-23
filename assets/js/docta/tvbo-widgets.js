/*
 * Docta Ignorantia: widgets for "The mistake no optimizer can avoid" (time-varying Bayesian optimization).
 * Requires core.js, gp.js and tvbo.js. ES5 only: the Docker build minifies JS with uglifier.
 */
(function (root) {
  "use strict";

  var DI = root.DI, TV = DI.tv, TAU = 2 * Math.PI;

  // Regret plateaus for 15 temporal kernels (RBF and Matern-3/2 with lengthscale par, sinc^2 with cutoff par), from
  // our experiments (noise variance 0.01, one observation per unit of time, RBF spatial kernel with lengthscale 0.1
  // on 100 inputs): the expected regret of the oracle at step 400 (1000 Monte Carlo samples) and the average regret
  // of GP-UCB over steps 601-800 (20 objectives), with their standard errors.
  var PRICE = [{"fam":"rbf","par":2,"einf":0.1005,"rho":1.201,"oracle":0.0378,"oSe":0.00255,"ucb":1.02,"uSe":0.0195},{"fam":"rbf","par":5,"einf":0.02228,"rho":0.5859,"oracle":0.00583,"oSe":0.000648,"ucb":0.6458,"uSe":0.0156},{"fam":"rbf","par":10,"einf":0.009554,"rho":0.3353,"oracle":0.002616,"oSe":0.000308,"ucb":0.3878,"uSe":0.00878},{"fam":"rbf","par":20,"einf":0.004617,"rho":0.1898,"oracle":0.001431,"oSe":0.000163,"ucb":0.2386,"uSe":0.0151},{"fam":"rbf","par":50,"einf":0.001929,"rho":0.08821,"oracle":0.0007644,"oSe":0.000121,"ucb":0.1529,"uSe":0.0223},{"fam":"m32","par":2,"einf":0.3487,"rho":1.79,"oracle":0.2804,"oSe":0.0122,"ucb":1.059,"uSe":0.0234},{"fam":"m32","par":5,"einf":0.07849,"rho":1.09,"oracle":0.04572,"oSe":0.00348,"ucb":0.7169,"uSe":0.0148},{"fam":"m32","par":10,"einf":0.02927,"rho":0.6839,"oracle":0.01371,"oSe":0.00125,"ucb":0.4959,"uSe":0.0136},{"fam":"m32","par":20,"einf":0.01325,"rho":0.4219,"oracle":0.003704,"oSe":0.000401,"ucb":0.2969,"uSe":0.0158},{"fam":"m32","par":50,"einf":0.005541,"rho":0.2205,"oracle":0.001943,"oSe":0.000299,"ucb":0.1873,"uSe":0.0172},{"fam":"sinc2","par":0.02,"einf":0.003509,"rho":0.1504,"oracle":0.001269,"oSe":0.000187,"ucb":0.2243,"uSe":0.00916},{"fam":"sinc2","par":0.05,"einf":0.009358,"rho":0.3303,"oracle":0.002501,"oSe":0.000263,"ucb":0.4577,"uSe":0.0123},{"fam":"sinc2","par":0.1,"einf":0.02265,"rho":0.5916,"oracle":0.005912,"oSe":0.000538,"ucb":0.7624,"uSe":0.0118},{"fam":"sinc2","par":0.3,"einf":0.1713,"rho":1.449,"oracle":0.07194,"oSe":0.00452,"ucb":1.219,"uSe":0.0144},{"fam":"sinc2","par":0.7,"einf":0.9809,"rho":2.298,"oracle":1.282,"oSe":0.0294,"ucb":1.455,"uSe":0.0181}];

  var PER = TV.periodic(40, 1);
  // the RBF kernel with the same correlation between consecutive observations as PER: the same speed
  var RBF_MATCHED = TV.rbf(1 / Math.sqrt(-2 * Math.log(TV.k(PER, 1))));
  // a low-rank kernel: a constant plus L cosines
  var LR_FREQS = [1 / 48, 1 / 20, 1 / 11, 1 / 7, 1 / 4.5];
  function lowRank(L) {
    var f = [0], w = [0.2];
    for (var i = 0; i < L; i++) { f.push(LR_FREQS[i]); w.push(0.8 / L); }
    return TV.cosines(f, w);
  }

  /* helpers ------------------------------------------------------------------ */

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function keepTitle(svg) { var t = svg.firstChild; clear(svg); svg.appendChild(t); }
  function path(pts) {
    return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
  }
  function log10(v) { return Math.log(v) / Math.LN10; }
  function logScale(d0, d1, r0, r1) {
    var l0 = log10(d0), l1 = log10(d1);
    var floor = Math.min(d0, d1) * 1e-3;
    return function (v) { return r0 + (log10(Math.max(v, floor)) - l0) / (l1 - l0) * (r1 - r0); };
  }
  var SUP = { "0": "\u2070", "1": "\u00B9", "2": "\u00B2", "3": "\u00B3", "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079", "-": "\u207B" };
  function sup(n) { return String(n).split("").map(function (c) { return SUP[c]; }).join(""); }
  function pow10(e) { return e === 0 ? "1" : e === 1 ? "10" : "10" + sup(e); }
  // a continuous part (fresh information) in the first categorical slot, rhythms in the second
  function regimeColor(C, ac) { return ac ? C.base : C.avg; }
  function fmtSmall(v) {
    if (v === 0) return "0";
    if (v >= 0.01) return DI.fmt(v, v >= 0.1 ? 2 : 3);
    // toExponential rounds the mantissa and the exponent together (no "10.0 x 10^-6")
    var parts = v.toExponential(1).split("e");
    return parts[0] + "\u00D710" + sup(parseInt(parts[1], 10));
  }
  // a half-width of the form 0.26 or 0.0063
  function fmtHalf(v) { return v >= 0.1 ? v.toFixed(2) : v.toPrecision(2); }
  function legend(parent, items) {
    var el = DI.el("div", "di-legend", parent);
    return function () {
      var C = DI.colors();
      clear(el);
      items.forEach(function (it) {
        var span = DI.el("span", "di-legend-item", el);
        var key = DI.el("i", it.dot ? "di-legend-dot" : "di-legend-line", span);
        var col = typeof it.color === "function" ? it.color(C) : C[it.color];
        if (it.dash) { key.style.background = "none"; key.style.borderTop = "2px dashed " + col; key.style.height = "0"; }
        else key.style.background = col;
        span.appendChild(document.createTextNode(it.label));
      });
    };
  }

  // A titled chart.
  function chartBox(parent, title, label) {
    var col = DI.el("div", null, parent);
    DI.el("div", "di-panel-title", col, title);
    var s = DI.svg("svg", { class: "di-plot", role: "img" }, col);
    DI.svg("title", {}, s).textContent = label;
    return { col: col, svg: s };
  }

  function axes(s, W, H, M, xs, ys, xlabel, ylabel) {
    DI.svg("line", { x1: M.l, x2: W - M.r, y1: H - M.b, y2: H - M.b, class: "di-svg-axis" }, s);
    xs.forEach(function (t) { DI.svg("text", { x: t[0], y: H - M.b + 15, "text-anchor": "middle", class: "di-svg-label" }, s).textContent = t[1]; });
    ys.forEach(function (t) {
      DI.svg("line", { x1: M.l, x2: W - M.r, y1: t[0], y2: t[0], class: "di-svg-grid" }, s);
      DI.svg("text", { x: M.l - 6, y: t[0] + 4, "text-anchor": "end", class: "di-svg-label" }, s).textContent = t[1];
    });
    if (xlabel) DI.svg("text", { x: W - M.r, y: H - 3, "text-anchor": "end", class: "di-svg-label" }, s).textContent = xlabel;
    if (ylabel) DI.svg("text", { x: M.l, y: 10, class: "di-svg-label" }, s).textContent = ylabel;
  }

  // at most max decades between lo and hi, from the top
  function decades(lo, hi, max) {
    var e0 = Math.ceil(log10(lo) - 1e-9), e1 = Math.floor(log10(hi) + 1e-9), stp = Math.max(1, Math.ceil((e1 - e0 + 1) / max)), out = [];
    for (var e = e1; e >= e0; e -= stp) out.push(e);
    return out;
  }

  // Logarithmic axes: the number of observations n from 1 to nMax horizontally, values from top to bot vertically.
  function logFrame(box, o) {
    var s = box.svg, W = Math.max(260, Math.round(box.col.clientWidth)), H = o.H || 220, Mg = o.Mg || { l: 44, r: 14, t: 14, b: 34 };
    s.setAttribute("viewBox", "0 0 " + W + " " + H);
    keepTitle(s);
    var sx = logScale(1, o.nMax, Mg.l, W - Mg.r), sy = logScale(o.top, o.bot, Mg.t, H - Mg.b);
    o.ticks.forEach(function (e) {
      var v = Math.pow(10, e);
      DI.svg("line", { x1: Mg.l, x2: W - Mg.r, y1: sy(v), y2: sy(v), class: "di-svg-grid" }, s);
      DI.svg("text", { x: Mg.l - 8, y: sy(v) + 4, "text-anchor": "end", class: "di-svg-label" }, s).textContent = pow10(e);
    });
    for (var e = 0; Math.pow(10, e) <= o.nMax; e++) {
      DI.svg("text", { x: sx(Math.pow(10, e)), y: H - Mg.b + 16, "text-anchor": "middle", class: "di-svg-label" }, s).textContent = pow10(e);
    }
    DI.svg("text", { x: W - Mg.r, y: H - 4, "text-anchor": "end", class: "di-svg-label" }, s).textContent = o.xlabel || "observations n";
    if (o.ylabel) DI.svg("text", { x: Mg.l, y: 10, class: "di-svg-label" }, s).textContent = o.ylabel;
    box.geo = { sx: sx, sy: sy, Mg: Mg, W: W, H: H, nMax: o.nMax };
    return box.geo;
  }

  // drawn last, so that it stays on top
  function crosshair(box) {
    box.cross = DI.svg("line", { class: "di-svg-crosshair", y1: box.geo.Mg.t, y2: box.geo.H - box.geo.Mg.b }, box.svg);
  }
  function showCross(box, n) {
    if (!box.cross) return;
    var x = box.geo.sx(n);
    box.cross.setAttribute("x1", x); box.cross.setAttribute("x2", x); box.cross.style.display = "block";
  }
  // the n under the pointer, on a chart drawn by logFrame
  function pointerN(box, e) {
    var g = box.geo, r = box.svg.getBoundingClientRect(), x = (e.clientX - r.left) * g.W / r.width;
    var n = Math.round(Math.pow(10, (x - g.Mg.l) / (g.W - g.Mg.l - g.Mg.r) * log10(g.nMax)));
    return Math.max(1, Math.min(g.nMax, n));
  }
  // the points (n, get(n)) for n = 1..last, about one per 1.5 pixel
  function logSeries(g, get, last) {
    var pts = [], prev = -1e9;
    for (var k = 1; k <= last; k++) {
      var x = g.sx(k);
      if (k > 1 && k !== last && x - prev < 1.5) continue;
      pts.push([x, g.sy(get(k))]);
      prev = x;
    }
    return pts;
  }

  // The spectrum seen by an optimizer that observes every D units of time: the continuous part of the spectral
  // density of (k_T(h D))_h, folded onto [0, 1/2] cycle per observation by aliasing, plus the noise level sig2,
  // on a logarithmic scale. With natural logarithms, the shaded area between the two is rho (Pinsker). Dirac
  // deltas are drawn as arrows: infinitely high, zero width. sig2 may be 0 (no noise level, no area).
  function drawSpectrum(box, o) {
    var C = DI.colors(), s = box.svg, W = Math.max(260, Math.round(box.col.clientWidth)), H = o.H || 230;
    var M = { l: 44, r: 12, t: 18, b: 34 }, ac = TV.acMass(o.spec) > 0, col = regimeColor(C, ac), K = 500, vals = [], peak = 0, i;
    s.setAttribute("viewBox", "0 0 " + W + " " + H);
    keepTitle(s);
    for (i = 0; i <= K; i++) {
      var v = (ac ? TV.folded(o.spec, Math.PI * i / K, o.D) : 0) + o.sig2;
      vals.push(v);
      if (v > peak) peak = v;
    }
    var hi = o.hi || Math.max(peak * 4, o.sig2 * 1e3), lo = o.lo || o.sig2 / Math.pow(10, 0.22 * log10(hi / o.sig2));
    var sy = logScale(hi, lo, M.t, H - M.b), yb = H - M.b;
    function Y(u) { return u > lo ? Math.max(M.t, sy(u)) : yb; }
    function sx(f) { return M.l + f / 0.5 * (W - M.l - M.r); }
    axes(s, W, H, M, [0, 0.1, 0.2, 0.3, 0.4, 0.5].map(function (f) { return [sx(f), String(f)]; }),
      decades(lo, hi, 5).map(function (e) { return [sy(Math.pow(10, e)), pow10(e)]; }),
      "frequency, cycles per observation", o.sig2 > 0 ? "spectrum + noise level, log scale" : "spectrum, log scale");
    var yN = o.sig2 > 0 ? sy(o.sig2) : yb;
    if (ac) {
      var pts = vals.map(function (u, k) { return [sx(0.5 * k / K), Y(u)]; });
      if (o.sig2 > 0) DI.svg("path", { d: path(pts) + "L" + sx(0.5) + "," + yN + "L" + sx(0) + "," + yN + "Z", fill: col, opacity: 0.3, stroke: "none" }, s);
      DI.svg("path", { d: path(pts), stroke: col, class: "di-svg-series" }, s);
    }
    if (o.sig2 > 0) {
      DI.svg("line", { x1: M.l, x2: W - M.r, y1: yN, y2: yN, stroke: C.ink, "stroke-width": 1.25, opacity: 0.75 }, s);
      DI.svg("text", { x: W - M.r, y: yN + 14, "text-anchor": "end", class: "di-svg-label" }, s).textContent = "noise level \u03C3\u2080\u00B2";
    }
    var at = TV.atoms(o.spec), top = at.reduce(function (m, a) { return Math.max(m, a.c); }, 0);
    at.forEach(function (a) {
      if (a.c < 1e-4 * top) return;
      var u = a.f * o.D;
      u -= Math.floor(u);
      if (u > 0.5) u = 1 - u;
      var x = sx(u), op = 0.35 + 0.65 * Math.sqrt(a.c / top);
      DI.svg("line", { x1: x, x2: x, y1: yN, y2: M.t + 6, stroke: C.avg, "stroke-width": 1.75, opacity: op }, s);
      DI.svg("path", { d: "M" + (x - 3.5) + "," + (M.t + 7) + "L" + x + "," + M.t + "L" + (x + 3.5) + "," + (M.t + 7) + "Z", fill: C.avg, opacity: op }, s);
    });
    return { sx: sx, sy: sy, W: W, H: H, M: M };
  }

  // an arrow from y0 to y1, its head at y1
  function arrow(s, x, y0, y1, col) {
    var d = y1 > y0 ? -1 : 1;
    DI.svg("line", { x1: x, x2: x, y1: y0, y2: y1 + 6 * d, stroke: col, "stroke-width": 2 }, s);
    DI.svg("path", { d: "M" + (x - 4) + "," + (y1 + 7 * d) + "L" + x + "," + y1 + "L" + (x + 4) + "," + (y1 + 7 * d) + "Z", fill: col }, s);
  }

  // Labels may contain math in braces, e.g. "Noise variance {\u03C3\u2080\u00B2}": each brace becomes a span that escapes the
  // uppercase style of labels and titles, so that symbols keep their case.
  function symbolize(root) {
    var els = root.querySelectorAll(".di-field-label, .di-stat-label, .di-panel-title");
    for (var i = 0; i < els.length; i++) {
      var el = els[i], nodes = [].slice.call(el.childNodes);
      for (var k = 0; k < nodes.length; k++) {
        var nd = nodes[k];
        if (nd.nodeType !== 3 || nd.nodeValue.indexOf("{") < 0) continue;
        var parts = nd.nodeValue.split(/[{}]/), frag = document.createDocumentFragment();
        for (var j = 0; j < parts.length; j++) {
          if (!parts[j]) continue;
          if (j % 2) DI.el("span", "di-sym", frag, parts[j]);
          else frag.appendChild(document.createTextNode(parts[j]));
        }
        el.replaceChild(frag, nd);
      }
    }
  }

  /* 1. Four classes of temporal kernels: a sample objective and its spectral density ---- */

  DI.mount("tv-classes", function (body) {
    var M = 60, T = 240, sp = TV.spatial(M, 0.1), FLOOR = 1e-9;
    var CL = [
      { value: "broad", label: "Broadband", kernel: "RBF kernel", param: "Lengthscale", min: 3, max: 40, step: 1, v: 10,
        fmt: function (v) { return String(v); }, spec: function (v) { return TV.rbf(v); } },
      { value: "band", label: "Band-limited", kernel: "sinc\u00B2 kernel", param: "Cutoff frequency {\u03C4}", min: 0.01, max: 0.15, step: 0.005, v: 0.05,
        fmt: function (v) { return DI.fmt(v, 3); }, spec: function (v) { return TV.sinc2(v); } },
      { value: "ap", label: "Almost periodic", kernel: "periodic kernel", param: "Period", min: 20, max: 80, step: 1, v: 40,
        fmt: function (v) { return String(v); }, spec: function (v) { return TV.periodic(v, 0.5); } },
      { value: "lr", label: "Low-rank", kernel: "sum-of-cosines kernel", param: "Number of cosines", min: 1, max: 5, step: 1, v: 2,
        fmt: function (v) { return String(v); }, spec: lowRank }
    ];
    var st = { key: "broad", seed: 1 };
    function cur() { return CL.filter(function (c) { return c.value === st.key; })[0]; }

    var bar = DI.toolbar(body);
    DI.segmented(bar, "Class", CL, st.key, function (v) { st.key = v; showSlider(); sample(); });
    var bar2 = DI.toolbar(body);
    CL.forEach(function (c) {
      c.slider = DI.slider(bar2, c.param, { min: c.min, max: c.max, step: c.step, value: c.v, format: c.fmt }, function (v) { c.v = v; sample(); });
      c.wrap = c.slider.input.parentNode;
    });
    DI.button(bar2, "New sample", function () { st.seed += 1; sample(); });
    function showSlider() { CL.forEach(function (c) { c.wrap.style.display = c.value === st.key ? "" : "none"; }); }

    var badge = DI.el("div", "di-badge-row", body), badgeKey = DI.el("i", "di-key", badge), badgeText = DI.el("span", null, badge);
    var duo = DI.el("div", "di-duo", body);
    duo.style.marginTop = "0.2rem";
    var left = DI.el("div", null, duo);
    DI.el("div", "di-panel-title", left, "A sample objective");
    var cv = DI.canvas(left, 1.55);
    cv.setAttribute("aria-label", "A sample objective, with the input x vertically and time horizontally, darker for higher values, and its maximizer at each time.");
    var spec = chartBox(duo, "Spectral density of its temporal kernel", "The spectral density of the temporal kernel for positive frequencies, on a logarithmic scale: its continuous part (filled curve) and its Dirac deltas (arrows)");

    function sample() {
      var c = cur();
      st.k = c.spec(c.v);
      st.F = TV.sampleObjective(st.k, sp, T, 1, st.seed * 7 + 1);
      draw();
    }

    function drawHeat() {
      var f = DI.fit(cv), ctx = f.ctx, F = st.F, lo = Infinity, hi = -Infinity, i, x, t;
      for (i = 0; i < F.length; i++) { if (F[i] < lo) lo = F[i]; if (F[i] > hi) hi = F[i]; }
      var vals = new Float64Array(T * M);
      for (var r = 0; r < M; r++) for (t = 0; t < T; t++) vals[r * T + t] = (F[(M - 1 - r) * T + t] - lo) / (hi - lo);
      st.off = DI.heatRect(vals, T, M, DI.ramp("gray"), st.off);
      var pad = { l: 16, r: 2, t: 2, b: 18 }, pw = f.w - pad.l - pad.r, ph = f.h - pad.t - pad.b, C = DI.colors();
      ctx.clearRect(0, 0, f.w, f.h);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(st.off, pad.l, pad.t, pw, ph);
      ctx.fillStyle = DI.isDark() ? "#16171a" : "#ffffff";
      for (t = 0; t < T; t++) {
        var b = -Infinity, a = 0;
        for (x = 0; x < M; x++) if (F[x * T + t] > b) { b = F[x * T + t]; a = x; }
        ctx.beginPath(); ctx.arc(pad.l + (t + 0.5) / T * pw, pad.t + (1 - a / (M - 1)) * ph, 1.2, 0, TAU); ctx.fill();
      }
      ctx.save();
      ctx.font = "11px Roboto, sans-serif"; ctx.fillStyle = C.muted;
      ctx.textAlign = "left"; ctx.fillText("t = 0", pad.l, f.h - 4);
      ctx.textAlign = "right"; ctx.fillText("t = " + T, pad.l + pw, f.h - 4);
      ctx.translate(10, pad.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("input x", 0, 0);
      ctx.restore();
    }

    // On a logarithmic scale, so that small components stay visible: the continuous part relative to its maximum,
    // the Dirac deltas relative to the heaviest one.
    function drawDensity(col, ac) {
      var s = spec.svg, W = Math.max(260, Math.round(spec.col.clientWidth)), H = Math.max(170, Math.round(W / 1.55));
      var M2 = { l: 40, r: 12, t: 14, b: 34 }, wmax = 0.5, K = 500, i;
      s.setAttribute("viewBox", "0 0 " + W + " " + H);
      keepTitle(s);
      function sx(w) { return M2.l + w / wmax * (W - M2.l - M2.r); }
      var sy = logScale(1, FLOOR, M2.t + 8, H - M2.b), yb = H - M2.b;
      axes(s, W, H, M2, [0, 0.1, 0.2, 0.3, 0.4, 0.5].map(function (w) { return [sx(w), String(w)]; }),
        [0, -3, -6, -9].map(function (e) { return [sy(Math.pow(10, e)), pow10(e)]; }), "frequency \u03C9, cycles per unit of time", "relative weight, log scale");
      if (ac) {
        var d = [], peak = 0;
        for (i = 0; i <= K; i++) { var v = TV.density(st.k, wmax * i / K); d.push(v); if (v > peak) peak = v; }
        var pts = d.map(function (v, k) { return [sx(wmax * k / K), v / peak > FLOOR ? sy(v / peak) : yb]; });
        DI.svg("path", { d: path(pts) + "L" + sx(wmax) + "," + yb + "L" + sx(0) + "," + yb + "Z", fill: col, opacity: 0.25, stroke: "none" }, s);
        DI.svg("path", { d: path(pts), stroke: col, class: "di-svg-series" }, s);
      }
      // two-sided weights: an atom at f > 0 is a pair of Dirac deltas at +f and -f
      var at = TV.atoms(st.k).map(function (a) { return { f: a.f, w: a.f === 0 ? a.c : a.c / 2 }; }), top = 0;
      at.forEach(function (a) { top = Math.max(top, a.w); });
      at.forEach(function (a) {
        if (a.w / top < FLOOR) return;
        if (a.f > wmax) return;
        arrow(s, sx(a.f), yb, sy(a.w / top), col);
      });
      if (st.key === "ap") {
        DI.svg("text", { x: W - M2.r, y: M2.t + 4, "text-anchor": "end", class: "di-svg-label-strong" }, s).textContent =
          "infinitely many deltas, at every multiple of 1/period";
      }
    }

    function draw() {
      var C = DI.colors(), c = cur(), ac = TV.acMass(st.k) > 0, col = regimeColor(C, ac);
      drawHeat();
      drawDensity(col, ac);
      badgeKey.style.background = col;
      badgeText.textContent = ac ? "Not rhythmic: the spectral density of the " + c.kernel + " is continuous." :
        "Rhythmic: the spectral density of the " + c.kernel + " consists of Dirac deltas only.";
    }

    DI.onTheme(draw);
    DI.onResize(draw);
    showSlider();
    symbolize(body);
    sample();
  });

  /* 2. How well does the past predict the present? One input, observed forever ---- */

  DI.mount("tv-floor", function (body, host) {
    var N = 1000, WIN = 120, SIG2 = 0.01;
    var LANES = [
      { spec: TV.cosines([0], [1]), title: "Constant kernel: a static value", name: "Static", slot: "muted" },
      { spec: PER, title: "Periodic kernel (almost periodic)", name: "Periodic", slot: "avg" },
      { spec: RBF_MATCHED, title: "RBF kernel (broadband), same speed", name: "RBF", slot: "base" }
    ];
    var st = { seed: 2, n: 0, acc: 0, raf: null };

    var bar = DI.toolbar(body);
    var actions = DI.el("div", "di-actions", bar);
    var playBtn = DI.button(actions, "Play", function () { st.raf ? pause() : play(); }, true);
    var scrub = DI.slider(bar, "Observations so far", { min: -0.5, max: 3, step: 0.01, value: -0.5, format: function (v) { return String(toN(v)); } },
      function (v) { pause(); st.n = toN(v); st.acc = 0; draw(); });
    DI.button(bar, "New sample", function () { st.seed += 1; reset(); });
    function toN(v) { return v < 0 ? 0 : Math.round(Math.pow(10, v)); }

    LANES.forEach(function (L) {
      // exact, from the kernel: the variance e[m] of the present value given m noisy past observations, and the
      // information info[m] brought by the m-th observation
      L.e = TV.predictionErrors(L.spec, 1, SIG2, N);
      L.info = new Float64Array(N + 1);
      for (var m = 1; m <= N; m++) L.info[m] = 0.5 * Math.log(1 + L.e[m - 1] / SIG2);
      L.rho = TV.rho(L.spec, 1, SIG2);
      L.einf = TV.einf(L.rho, SIG2);
      L.row = DI.el("div", "di-lane", body);
      var head = DI.el("div", "di-lane-head", L.row), t = DI.el("div", "di-panel-title", head);
      L.swatch = DI.el("i", "di-key", t);
      t.appendChild(document.createTextNode(L.title));
      L.read = DI.el("div", "di-lane-value", head);
      L.svg = DI.svg("svg", { class: "di-plot", role: "img" }, L.row);
      DI.svg("title", {}, L.svg).textContent = L.name + ": the true value, its recent noisy observations, and the prediction of each value from all the earlier observations";
    });

    var drawLegend = legend(body, LANES.map(function (L) { return { color: L.slot, label: L.name }; }));
    var duo = DI.el("div", "di-duo", body);
    duo.style.marginTop = "0.4rem";
    var cE = chartBox(duo, "Uncertainty about the present, {e\u2099}", "Variance of the present value given n noisy past observations, on logarithmic axes");
    var cI = chartBox(duo, "Information brought by each observation, {I\u2099}", "Information brought by the n-th observation, in nats, on logarithmic axes");
    var tip = DI.tooltip(body);

    function reset() {
      pause();
      LANES.forEach(function (L, i) {
        var rnd = TV.rng(st.seed * 131 + 17 * i), t;
        L.x = TV.sampleTemporal(L.spec, N + 1, 1, rnd, 1)[0];
        L.y = new Float64Array(N + 1);
        for (t = 0; t <= N; t++) L.y[t] = L.x[t] + Math.sqrt(SIG2) * TV.gaussian(rnd);
        // the prediction of each value from all the earlier observations
        L.P = TV.oneStep(L.spec, 1, SIG2, L.y);
        // a vertical range that fits this sample, and at least the +-2 band of the prior
        L.yr = 2;
        for (t = 0; t <= N; t++) L.yr = Math.max(L.yr, Math.abs(L.x[t]) + 0.4);
      });
      draw();
    }

    // slowly at first, then faster and faster: about 1% more observations per frame
    function frame() {
      st.acc += Math.max(1 / 8, 0.01 * st.n);
      if (st.acc >= 1) {
        var k = Math.floor(st.acc);
        st.acc -= k;
        st.n = Math.min(N, st.n + k);
        draw();
      }
      if (st.n >= N) { st.raf = null; playBtn.textContent = "Play again"; return; }
      st.raf = requestAnimationFrame(frame);
    }
    function play() {
      if (st.n >= N) { st.n = 0; st.acc = 0; }
      playBtn.textContent = "Pause";
      st.raf = requestAnimationFrame(frame);
    }
    function pause() {
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = null;
      playBtn.textContent = st.n >= N ? "Play again" : "Play";
    }

    function drawLane(L) {
      var C = DI.colors(), col = C[L.slot], s = L.svg, n = st.n, t;
      var W = Math.max(280, Math.round(L.row.clientWidth)), H = 92, Mg = { l: 4, r: 58, t: 6, b: 16 };
      s.setAttribute("viewBox", "0 0 " + W + " " + H);
      keepTitle(s);
      var t0 = Math.max(0, n - WIN + 1), pw = W - Mg.l - Mg.r, ph = H - Mg.t - Mg.b;
      function sx(u) { return Mg.l + (u - t0) / (WIN - 1) * pw; }
      function sy(v) { return Mg.t + (1 - (Math.max(-L.yr, Math.min(L.yr, v)) + L.yr) / (2 * L.yr)) * ph; }
      DI.svg("line", { x1: Mg.l, x2: Mg.l + pw, y1: sy(0), y2: sy(0), class: "di-svg-grid" }, s);
      var up = [], lo = [], tr = [];
      for (t = t0; t <= n; t++) {
        var h = 2 * Math.sqrt(L.P.v[t]);
        up.push([sx(t), sy(L.P.mean[t] + h)]);
        lo.push([sx(t), sy(L.P.mean[t] - h)]);
        tr.push([sx(t), sy(L.x[t])]);
      }
      DI.svg("path", { d: path(up.concat(lo.reverse())) + "Z", fill: col, opacity: 0.3, stroke: "none" }, s);
      DI.svg("path", { d: path(tr), stroke: C.ink, class: "di-svg-series", "stroke-width": 1.25, opacity: 0.7 }, s);
      for (t = t0; t < n; t++) DI.svg("circle", { cx: sx(t), cy: sy(L.y[t]), r: 1.5, fill: C.muted }, s);
      // the present: its prediction from the whole past (bar), and its true value (ring)
      var xn = sx(n), mu = L.P.mean[n], half = 2 * Math.sqrt(L.P.v[n]);
      DI.svg("line", { x1: xn, x2: xn, y1: sy(mu - half), y2: sy(mu + half), stroke: col, "stroke-width": 4, "stroke-linecap": "round" }, s);
      DI.svg("circle", { cx: xn, cy: sy(L.x[n]), r: 3.5, fill: C.surface, stroke: C.ink, "stroke-width": 1.5 }, s);
      DI.svg("text", { x: Mg.l + pw + 10, y: sy(mu) + 4, class: "di-svg-label-strong" }, s).textContent = "\u00B1" + fmtHalf(half);
      DI.svg("text", { x: Mg.l, y: H - 3, class: "di-svg-label" }, s).textContent = n ? "step " + t0 : "";
      DI.svg("text", { x: Mg.l + pw, y: H - 3, "text-anchor": "end", class: "di-svg-label" }, s).textContent = n ? "now: step " + n : "no observation yet";
      L.swatch.style.background = col;
      L.read.textContent = "e\u2099 = " + fmtSmall(L.e[n]);
    }

    function drawChart(box, get, o, ref, refText) {
      var C = DI.colors(), n = st.n, g = logFrame(box, o), y = g.sy(ref);
      DI.svg("line", { x1: g.Mg.l, x2: g.W - g.Mg.r, y1: y, y2: y, class: "di-svg-ref" }, box.svg);
      DI.svg("text", { x: g.W - g.Mg.r, y: y - 7, "text-anchor": "end", class: "di-svg-label-strong" }, box.svg).textContent = refText;
      LANES.forEach(function (L) {
        var col = C[L.slot], f = function (k) { return get(L, k); };
        DI.svg("path", { d: path(logSeries(g, f, N)), stroke: col, class: "di-svg-series", opacity: 0.22 }, box.svg);
        if (n < 1) return;
        var pts = logSeries(g, f, n), e = pts[pts.length - 1];
        DI.svg("path", { d: path(pts), stroke: col, class: "di-svg-series" }, box.svg);
        DI.svg("circle", { cx: e[0], cy: e[1], r: 4, fill: col, class: "di-svg-end" }, box.svg);
      });
      crosshair(box);
    }

    function draw() {
      LANES.forEach(drawLane);
      drawLegend();
      scrub.set(st.n ? log10(st.n) : -0.5);
      var R = LANES[2];
      drawChart(cE, function (L, k) { return L.e[k]; }, { nMax: N, top: 2, bot: 1e-5, ticks: [-5, -4, -3, -2, -1, 0] },
        R.einf, "e\u221E = " + fmtSmall(R.einf));
      drawChart(cI, function (L, k) { return L.info[k]; }, { nMax: N, top: 5, bot: 1e-4, ticks: [-4, -3, -2, -1, 0] },
        R.rho, "\u03C1 = " + DI.fmt(R.rho, 2) + " nats");
    }

    [cE, cI].forEach(function (box, bi) {
      box.svg.addEventListener("pointermove", function (e) {
        if (!box.geo) return;
        var n = pointerN(box, e), C = DI.colors(), p = DI.pointer(e, body);
        showCross(box, n);
        tip.show(p.x, p.y, [{ value: "n = " + n, label: "" }].concat(LANES.map(function (L) {
          return { value: bi ? DI.fmt(L.info[n], 3) + " nats" : fmtSmall(L.e[n]), label: L.name, color: C[L.slot] };
        })));
      });
      box.svg.addEventListener("pointerleave", function () { if (box.cross) box.cross.style.display = "none"; tip.hide(); });
    });

    DI.onTheme(draw);
    DI.onResize(draw);
    symbolize(body);
    reset();
    if (DI.reducedMotion()) { st.n = N; pause(); draw(); }
    else DI.onVisible(host, function () { if (!st.raf && st.n === 0) play(); });
  });

  /* 3. The information rate as an area ---------------------------------------- */

  DI.mount("tv-area", function (body) {
    var CL = [
      { value: "broad", label: "Broadband", spec: TV.rbf(10) },
      { value: "band", label: "Band-limited", spec: TV.sinc2(0.05) },
      { value: "ap", label: "Almost periodic", spec: PER },
      { value: "lr", label: "Low-rank", spec: lowRank(3) }
    ];
    var NONE = -3.5, st = { key: "broad", lsig: -2, lw: NONE };
    function cur() { return CL.filter(function (c) { return c.value === st.key; })[0]; }
    function rhythmic() { return st.key === "ap" || st.key === "lr"; }

    var bar = DI.toolbar(body);
    DI.segmented(bar, "Class", CL, st.key, function (v) { st.key = v; update(); });
    var bar2 = DI.toolbar(body);
    DI.slider(bar2, "Noise variance {\u03C3\u2080\u00B2}", { min: -6, max: 0, step: 0.25, value: st.lsig, format: function (v) { return fmtSmall(Math.pow(10, v)); } },
      function (v) { st.lsig = v; update(); });
    var mix = DI.slider(bar2, "Weight of an added RBF part", { min: NONE, max: -0.5, step: 0.25, value: st.lw, format: function (v) { return v <= NONE ? "none" : fmtSmall(Math.pow(10, v)); } },
      function (v) { st.lw = v; update(); });
    var mixWrap = mix.input.parentNode;
    var box = chartBox(body, "The spectrum seen by the optimizer, and the noise level", "The continuous part of the spectral density of the sampled process plus the noise level, on a logarithmic scale, with the Dirac deltas as arrows. The shaded area between the spectrum and the noise level is the information rate");
    var stats = DI.stats(body, [
      { key: "rho", label: "Information rate {\u03C1}, nats per observation" },
      { key: "einf", label: "Irreducible uncertainty {e\u221E}" }
    ]);

    function update() {
      var c = cur(), w = rhythmic() && st.lw > NONE ? Math.pow(10, st.lw) : 0, sig2 = Math.pow(10, st.lsig);
      var sk = w > 0 ? TV.mix([[1 - w, c.spec], [w, TV.rbf(10)]]) : c.spec;
      var rho = TV.rho(sk, 1, sig2), einf = TV.einf(rho, sig2);
      mixWrap.style.display = rhythmic() ? "" : "none";
      drawSpectrum(box, { spec: sk, D: 1, sig2: sig2, H: 250 });
      stats.rho.textContent = rho > 0 ? fmtSmall(rho) : "0";
      stats.einf.textContent = einf > 0 ? fmtSmall(einf) : "0";
    }

    DI.onTheme(update);
    DI.onResize(update);
    symbolize(body);
    update();
  });

  /* 4. A rhythmic objective: static functions with oscillating weights ------- */

  DI.mount("tv-rhythm", function (body, host) {
    var M = 80, T = 360, SIG = 0.1, AHEAD = 50;
    var sp = TV.spatial(M, 0.1), J = sp.J;
    var freqs = [0, 1 / 40], cw = [0.3, 0.7];
    // components: m = 0 constant, then (cos, sin) for each frequency; the weight of both is the one-sided c_p
    var COMP = [{ f: 0, trig: "c", w: cw[0], name: "constant" }];
    for (var p = 1; p < freqs.length; p++) {
      COMP.push({ f: freqs[p], trig: "c", w: cw[p], name: "cos" });
      COMP.push({ f: freqs[p], trig: "s", w: cw[p], name: "sin" });
    }
    var K = COMP.length, Dm = K * J;
    function psi(c, t) { return c.f === 0 ? 1 : c.trig === "c" ? Math.cos(TAU * c.f * t) : Math.sin(TAU * c.f * t); }
    var st = { seed: 3, t: 0, raf: null, frame: 0 };

    var bar = DI.toolbar(body);
    var actions = DI.el("div", "di-actions", bar);
    var playBtn = DI.button(actions, "Play", function () { st.raf ? pause() : play(); }, true);
    DI.button(actions, "Start over", function () { st.seed += 1; reset(); play(); });

    var layout = DI.el("div", "di-split di-split-wide", body);
    var stage = DI.el("div", "di-stage-wide", layout);
    DI.el("div", "di-panel-title", stage, "The objective over time");
    var heat = DI.canvas(stage, 2.2);
    heat.setAttribute("aria-label", "A rhythmic objective over time, with the current time marked.");
    var nowTitle = DI.el("div", "di-panel-title", stage, "Now: the truth, and what has been learned");
    nowTitle.style.marginTop = "0.9rem";
    var slice = DI.svg("svg", { class: "di-plot", role: "img" }, stage);
    DI.svg("title", {}, slice).textContent = "The objective at the current time, and the posterior mean and uncertainty of the model";
    var side = DI.el("div", "di-side", layout);
    DI.el("div", "di-panel-title", side, "Its ingredients: " + ["no", "one", "two", "three", "four", "five", "six", "seven"][K] + " static functions, times known oscillations");
    var rows = COMP.map(function (c, i) {
      var r = DI.el("div", "di-ingredient", side);
      var s = DI.svg("svg", { class: "di-plot", role: "img" }, r);
      DI.svg("title", {}, s).textContent = "Static function number " + i + " and its oscillating weight";
      return { svg: s, row: r };
    });
    var stats = DI.stats(side, [
      { key: "n", label: "Observations" },
      { key: "unc", label: "Uncertainty " + AHEAD + " steps ahead" }
    ]);

    function reset() {
      pause();
      var rnd = TV.rng(st.seed * 31 + 1), i, j, x;
      st.zeta = new Float64Array(Dm);
      for (i = 0; i < Dm; i++) st.zeta[i] = TV.gaussian(rnd);
      st.g = COMP.map(function (c, m) {
        var g = new Float64Array(M);
        for (x = 0; x < M; x++) { var v = 0; for (j = 0; j < J; j++) v += sp.A[x * J + j] * st.zeta[m * J + j]; g[x] = v; }
        return g;
      });
      st.F = new Float64Array(M * T);
      for (x = 0; x < M; x++) for (var t = 0; t < T; t++) {
        var v2 = 0;
        for (var m = 0; m < K; m++) v2 += Math.sqrt(COMP[m].w) * psi(COMP[m], t) * st.g[m][x];
        st.F[x * T + t] = v2;
      }
      var lo = Infinity, hi = -Infinity;
      for (i = 0; i < M * T; i++) { lo = Math.min(lo, st.F[i]); hi = Math.max(hi, st.F[i]); }
      st.lo = lo; st.hi = hi;
      // Bayesian linear model on the coefficients of the static functions: prior N(0, I), exact updates
      st.mu = new Float64Array(Dm);
      st.S = new Float64Array(Dm * Dm);
      for (i = 0; i < Dm; i++) st.S[i * Dm + i] = 1;
      st.noise = TV.rng(st.seed * 977 + 5);
      st.t = 0; st.n = 0; st.obs = [];
      draw();
    }

    function features(x, t, out) {
      for (var m = 0; m < K; m++) {
        var a = Math.sqrt(COMP[m].w) * psi(COMP[m], t);
        for (var j = 0; j < J; j++) out[m * J + j] = a * sp.A[x * J + j];
      }
      return out;
    }
    var phi = new Float64Array(Dm), Sphi = new Float64Array(Dm);

    function observe() {
      var x = Math.floor(st.noise() * M), t = st.t, i, j;
      var y = st.F[x * T + t] + SIG * TV.gaussian(st.noise);
      features(x, t, phi);
      var den = SIG * SIG, pred = 0;
      for (i = 0; i < Dm; i++) {
        var s = 0;
        for (j = 0; j < Dm; j++) s += st.S[i * Dm + j] * phi[j];
        Sphi[i] = s; den += phi[i] * s; pred += phi[i] * st.mu[i];
      }
      var g = (y - pred) / den;
      for (i = 0; i < Dm; i++) {
        st.mu[i] += Sphi[i] * g;
        var a = Sphi[i] / den;
        for (j = 0; j < Dm; j++) st.S[i * Dm + j] -= a * Sphi[j];
      }
      st.obs.push([t, x, y]);
      st.n++;
    }

    // posterior mean and sd of f(., t) or of a single static function g_m
    function posterior(t, m) {
      var mean = new Float64Array(M), sd = new Float64Array(M);
      for (var x = 0; x < M; x++) {
        if (m === undefined) features(x, t, phi);
        else { for (var i0 = 0; i0 < Dm; i0++) phi[i0] = 0; for (var j0 = 0; j0 < J; j0++) phi[m * J + j0] = sp.A[x * J + j0]; }
        var mu = 0, v = 0;
        for (var i = 0; i < Dm; i++) {
          if (phi[i] === 0) continue;
          mu += phi[i] * st.mu[i];
          var s = 0;
          for (var j = 0; j < Dm; j++) if (phi[j] !== 0) s += st.S[i * Dm + j] * phi[j];
          v += phi[i] * s;
        }
        mean[x] = mu; sd[x] = Math.sqrt(Math.max(v, 0));
      }
      return { mean: mean, sd: sd };
    }

    function frame() {
      st.frame++;
      if (st.frame % 3 === 0) {
        observe();
        st.t++;
        draw();
        if (st.t >= T) { st.raf = null; playBtn.textContent = "Play again"; return; }
      }
      st.raf = requestAnimationFrame(frame);
    }
    function play() { if (st.t >= T) reset(); playBtn.textContent = "Pause"; st.raf = requestAnimationFrame(frame); }
    function pause() { if (st.raf) cancelAnimationFrame(st.raf); st.raf = null; playBtn.textContent = "Play"; }

    function draw() {
      var C = DI.colors(), t = Math.min(st.t, T - 1);
      // heatmap of the whole run, the present marked, the observations so far
      var f = DI.fit(heat), ctx = f.ctx, ramp = DI.ramp("gray"), vals = new Float64Array(T * M);
      for (var r = 0; r < M; r++) for (var c = 0; c < T; c++) vals[r * T + c] = (st.F[(M - 1 - r) * T + c] - st.lo) / (st.hi - st.lo);
      st.off = DI.heatRect(vals, T, M, ramp, st.off);
      var pad = { l: 6, r: 6, t: 4, b: 16 }, pw = f.w - pad.l - pad.r, ph = f.h - pad.t - pad.b;
      ctx.clearRect(0, 0, f.w, f.h);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(st.off, pad.l, pad.t, pw, ph);
      ctx.fillStyle = DI.isDark() ? "rgba(35,36,39,0.55)" : "rgba(247,247,245,0.55)";
      var xNow = pad.l + (t + 0.5) / T * pw;
      ctx.fillRect(xNow, pad.t, pad.l + pw - xNow, ph);
      // every observation made so far (the model uses them all), the latest one larger
      ctx.fillStyle = C.avg;
      st.obs.forEach(function (o) { ctx.beginPath(); ctx.arc(pad.l + (o[0] + 0.5) / T * pw, pad.t + (1 - o[1] / (M - 1)) * ph, 1.7, 0, TAU); ctx.fill(); });
      if (st.obs.length) { var lastO = st.obs[st.obs.length - 1]; DI.dot(ctx, pad.l + (lastO[0] + 0.5) / T * pw, pad.t + (1 - lastO[1] / (M - 1)) * ph, 3.2, C.avg, C.surface); }
      ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(xNow, pad.t); ctx.lineTo(xNow, pad.t + ph); ctx.stroke(); ctx.restore();
      ctx.save(); ctx.font = "11px Roboto, sans-serif"; ctx.fillStyle = C.muted; ctx.textAlign = "left";
      ctx.fillText("time \u2192", pad.l, f.h - 3); ctx.textAlign = "right"; ctx.fillText("the future (shaded) is still unobserved", pad.l + pw, f.h - 3); ctx.restore();

      // the present slice: truth and posterior
      var W = Math.max(260, Math.round(stage.clientWidth)), H = 150, Mg = { l: 8, r: 8, t: 8, b: 8 };
      slice.setAttribute("viewBox", "0 0 " + W + " " + H); keepTitle(slice);
      var span = Math.max(Math.abs(st.lo), Math.abs(st.hi)) * 1.15;
      function sx(x) { return Mg.l + x / (M - 1) * (W - Mg.l - Mg.r); }
      function sy(v) { return Mg.t + (1 - (v + span) / (2 * span)) * (H - Mg.t - Mg.b); }
      var P = posterior(t), up = [], lo = [], mp = [], tr = [];
      for (var x = 0; x < M; x++) {
        up.push([sx(x), sy(Math.min(span, P.mean[x] + 2 * P.sd[x]))]); lo.push([sx(x), sy(Math.max(-span, P.mean[x] - 2 * P.sd[x]))]);
        mp.push([sx(x), sy(P.mean[x])]); tr.push([sx(x), sy(st.F[x * T + t])]);
      }
      DI.svg("line", { x1: Mg.l, x2: W - Mg.r, y1: sy(0), y2: sy(0), class: "di-svg-grid" }, slice);
      DI.svg("path", { d: path(up.concat(lo.reverse())) + "Z", fill: C.avg, opacity: 0.18, stroke: "none" }, slice);
      DI.svg("path", { d: path(tr), stroke: C.ink, class: "di-svg-series", "stroke-width": 1.5 }, slice);
      DI.svg("path", { d: path(mp), stroke: C.avg, class: "di-svg-series", "stroke-dasharray": "5 3" }, slice);

      // the ingredients: each static function, what has been learned of it, and its oscillating weight now
      rows.forEach(function (rw, m) {
        var s = rw.svg, Wr = Math.max(220, Math.round(rw.row.clientWidth)), Hr = 46, gw = Wr * 0.62;
        s.setAttribute("viewBox", "0 0 " + Wr + " " + Hr); keepTitle(s);
        var gs = 2.6;
        function gx(x2) { return 2 + x2 / (M - 1) * (gw - 4); }
        function gy(v) { return Hr / 2 - v / gs * (Hr / 2 - 3); }
        var Pm = posterior(t, m), u2 = [], l2 = [], tr2 = [], mp2 = [];
        for (var x3 = 0; x3 < M; x3++) {
          u2.push([gx(x3), gy(Math.min(gs, Pm.mean[x3] + 2 * Pm.sd[x3]))]); l2.push([gx(x3), gy(Math.max(-gs, Pm.mean[x3] - 2 * Pm.sd[x3]))]);
          tr2.push([gx(x3), gy(st.g[m][x3])]); mp2.push([gx(x3), gy(Pm.mean[x3])]);
        }
        DI.svg("path", { d: path(u2.concat(l2.reverse())) + "Z", fill: C.avg, opacity: 0.18, stroke: "none" }, s);
        DI.svg("path", { d: path(tr2), stroke: C.ink, class: "di-svg-series", "stroke-width": 1.25 }, s);
        DI.svg("path", { d: path(mp2), stroke: C.avg, class: "di-svg-series", "stroke-dasharray": "4 3", "stroke-width": 1.25 }, s);
        // its weight over time: a known oscillation, with the present marked
        var x0 = gw + 10, x1 = Wr - 4, amp = Math.sqrt(COMP[m].w), wv = [];
        for (var k = 0; k <= 60; k++) { var tt = t - 60 + k; wv.push([x0 + k / 60 * (x1 - x0), Hr / 2 - amp * psi(COMP[m], tt) * (Hr / 2 - 4)]); }
        DI.svg("line", { x1: x0, x2: x1, y1: Hr / 2, y2: Hr / 2, class: "di-svg-grid" }, s);
        DI.svg("path", { d: path(wv), stroke: C.muted, class: "di-svg-series", "stroke-width": 1.25 }, s);
        DI.svg("circle", { cx: x1, cy: Hr / 2 - amp * psi(COMP[m], t) * (Hr / 2 - 4), r: 3, fill: C.ink }, s);
      });

      // how uncertain the future still is
      var Pf = posterior(t + AHEAD), u = 0;
      for (var q = 0; q < M; q++) u += Pf.sd[q] / M;
      stats.n.textContent = st.n;
      stats.unc.textContent = DI.fmt(u, 2);
    }

    DI.onTheme(draw);
    DI.onResize(draw);
    reset();
    DI.onVisible(host, function () { if (!DI.reducedMotion() && !st.raf && st.t === 0) play(); });
  });


  /* 5. Band-limited objectives: the Nyquist rate, and why noise matters ------- */

  DI.mount("tv-nyquist", function (body) {
    // below a relative variance of 1e-6, the noiseless recursion is no longer accurate in double precision
    var TAUC = 0.05, MM = 1000, NONE = -9.5, PREC = 1e-6, TT = 300, HF = 0.5, KF = 300, sk = TV.sinc2(TAUC);
    var st = { D: 5, lsig: -2, seed: 4 };

    var bar = DI.toolbar(body);
    DI.slider(bar, "Time between observations {\u0394}", { min: 1, max: 20, step: 0.5, value: st.D, format: function (v) { return DI.fmt(v, 1); } },
      function (v) { st.D = v; update(); });
    DI.slider(bar, "Noise variance {\u03C3\u2080\u00B2}", { min: NONE, max: -1, step: 0.5, value: st.lsig, format: function (v) { return v <= NONE ? "none" : fmtSmall(Math.pow(10, v)); } },
      function (v) { st.lsig = v; update(); });
    DI.button(bar, "New sample", function () { st.seed += 1; draw0(); update(); });
    var badge = DI.el("div", "di-badge-row", body), badgeKey = DI.el("i", "di-key", badge), badgeText = DI.el("span", null, badge);
    var cT = chartBox(body, "The objective at a fixed input, observed every {\u0394}", "A band-limited sample over time, its noisy observations, and the prediction of each observed value from the earlier observations");
    var duo = DI.el("div", "di-duo", body);
    var cS = chartBox(duo, "The spectrum seen by the optimizer", "The spectrum of the sampled band-limited process, plus the noise level, on a logarithmic scale");
    var cE = chartBox(duo, "Uncertainty about the present, {e\u2099}", "Variance of the present value given n past observations, with this noise and without noise, on logarithmic axes");
    var drawLegend = legend(body, [{ color: "base", label: "with this noise" }, { color: "muted", dash: true, label: "without noise" }]);
    var stats = DI.stats(body, [
      { key: "rho", label: "Information rate {\u03C1}, nats per observation" },
      { key: "einf", label: "Irreducible uncertainty {e\u221E}" }
    ]);

    // An exactly band-limited sample: a sum of KF cosines with random phases, whose frequencies are drawn from the
    // spectral density of the sinc^2 kernel (a triangle on [-tau, tau]). Its covariance is the sinc^2 kernel.
    function draw0() {
      var rnd = TV.rng(st.seed * 977 + 1), i;
      st.w = []; st.ph = [];
      for (i = 0; i < KF; i++) { st.w.push(TAUC * (1 - Math.sqrt(1 - rnd()))); st.ph.push(TAU * rnd()); }
      st.eps = [];
      for (i = 0; i <= TT; i++) st.eps.push(TV.gaussian(rnd));
    }
    function value(t) {
      var s = 0;
      for (var i = 0; i < KF; i++) s += Math.cos(TAU * st.w[i] * t + st.ph[i]);
      return s * Math.sqrt(2 / KF);
    }

    function drawSeries(C, sig2) {
      var s = cT.svg, W = Math.max(280, Math.round(cT.col.clientWidth)), H = 130, Mg = { l: 4, r: 4, t: 6, b: 18 }, D = st.D, i;
      s.setAttribute("viewBox", "0 0 " + W + " " + H);
      keepTitle(s);
      var ys = [], ts = [];
      for (i = 0; i * D <= TT; i++) { ts.push(i * D); ys.push(value(i * D) + Math.sqrt(sig2) * st.eps[i]); }
      var P = TV.oneStep(sk, D, sig2, ys), yr = 3;
      function sx(t) { return Mg.l + t / TT * (W - Mg.l - Mg.r); }
      function sy(v) { return Mg.t + (1 - (Math.max(-yr, Math.min(yr, v)) + yr) / (2 * yr)) * (H - Mg.t - Mg.b); }
      DI.svg("line", { x1: Mg.l, x2: W - Mg.r, y1: sy(0), y2: sy(0), class: "di-svg-grid" }, s);
      var up = [], lo = [];
      for (i = 0; i < ys.length; i++) {
        var h = 2 * Math.sqrt(P.v[i]);
        up.push([sx(ts[i]), sy(P.mean[i] + h)]);
        lo.push([sx(ts[i]), sy(P.mean[i] - h)]);
      }
      DI.svg("path", { d: path(up.concat(lo.reverse())) + "Z", fill: C.base, opacity: 0.25, stroke: "none" }, s);
      var line = [];
      for (var t = 0; t <= TT; t += HF) line.push([sx(t), sy(value(t))]);
      DI.svg("path", { d: path(line), stroke: C.ink, class: "di-svg-series", "stroke-width": 1.25, opacity: 0.75 }, s);
      for (i = 0; i < ys.length; i++) DI.svg("circle", { cx: sx(ts[i]), cy: sy(ys[i]), r: 2.2, fill: C.base, class: "di-svg-end" }, s);
      DI.svg("text", { x: Mg.l, y: H - 3, class: "di-svg-label" }, s).textContent = "t = 0";
      DI.svg("text", { x: W - Mg.r, y: H - 3, "text-anchor": "end", class: "di-svg-label" }, s).textContent = "t = " + TT;
    }

    function update() {
      var C = DI.colors(), D = st.D, sig2 = st.lsig <= NONE ? 0 : Math.pow(10, st.lsig), ratio = 1 / (2 * TAUC * D);
      var e0 = TV.predictionErrors(sk, D, 0, MM), en = sig2 > 0 ? TV.predictionErrors(sk, D, sig2, MM) : e0;
      var rho = sig2 > 0 ? TV.rho(sk, D, sig2) : Infinity, einf = sig2 > 0 ? TV.einf(rho, sig2) : TV.einfNoiseless(sk, D);

      drawSeries(C, sig2);

      var g = drawSpectrum(cS, { spec: sk, D: D, sig2: sig2, lo: 1e-11, hi: 100, H: 230 });
      if (ratio > 1) {
        // above the Nyquist rate, the band only covers [0, tau D] and the spectrum is zero beyond
        var xa = g.sx(TAUC * D), xb = g.sx(0.5);
        DI.svg("text", { x: (xa + xb) / 2, y: sig2 > 0 ? g.sy(sig2) - 8 : g.H - g.M.b - 8, "text-anchor": "middle", class: "di-svg-label" }, cS.svg).textContent =
          sig2 > 0 ? "only noise" : "zero: log = \u2212\u221E";
      }

      var h = logFrame(cE, { nMax: MM, top: 2, bot: 1e-9, ticks: [-9, -6, -3, 0], H: 230, xlabel: "past observations n" });
      // without noise: up to the numerical precision, then an arrow down when the limit is 0
      var last0 = MM, k;
      for (k = 1; k <= MM; k++) if (e0[k] < PREC) { last0 = k - 1; break; }
      var p0 = logSeries(h, function (k2) { return e0[k2]; }, last0);
      DI.svg("path", { d: path(p0), stroke: C.muted, class: "di-svg-series", "stroke-dasharray": "5 4", "stroke-width": 1.75 }, cE.svg);
      if (last0 < MM) {
        var q = p0[p0.length - 1];
        arrow(cE.svg, q[0], q[1] + 4, Math.min(h.H - h.Mg.b - 4, q[1] + 34), C.muted);
      }
      if (sig2 > 0) DI.svg("path", { d: path(logSeries(h, function (k2) { return Math.max(en[k2], 1e-10); }, MM)), stroke: C.base, class: "di-svg-series" }, cE.svg);
      if (einf > 1e-9) {
        var y = h.sy(einf);
        DI.svg("line", { x1: h.Mg.l, x2: h.W - h.Mg.r, y1: y, y2: y, class: "di-svg-ref" }, cE.svg);
        DI.svg("text", { x: h.W - h.Mg.r, y: y < 40 ? y + 16 : y - 7, "text-anchor": "end", class: "di-svg-label-strong" }, cE.svg).textContent = "e\u221E = " + fmtSmall(einf);
      } else {
        DI.svg("text", { x: h.W - h.Mg.r, y: h.H - h.Mg.b - 8, "text-anchor": "end", class: "di-svg-label-strong" }, cE.svg).textContent = "e\u2099 \u2192 0";
      }
      drawLegend();

      badgeKey.style.background = C.base;
      badgeText.textContent = ratio > 1.001 ? "Observed " + DI.fmt(ratio, 1) + " times faster than the Nyquist rate: the spectrum is zero on part of the band." :
        ratio < 0.999 ? "Observed " + DI.fmt(1 / ratio, 1) + " times slower than the Nyquist rate: aliasing folds the band onto itself, and the spectrum covers the whole band." :
        "Observed exactly at the Nyquist rate.";
      stats.rho.textContent = sig2 > 0 ? fmtSmall(rho) : "\u221E (no noise)";
      stats.einf.textContent = einf > 1e-12 ? fmtSmall(einf) : "0";
    }

    DI.onTheme(update);
    DI.onResize(update);
    symbolize(body);
    draw0();
    update();
  });

  /* 6. Same speed, opposite fates: GP-UCB on two moving objectives ------------ */

  DI.mount("tv-race", function (body, host) {
    var M = 80, N = 500, W = 150, SIG2 = 0.01, BETA = 2;
    var sp = TV.spatial(M, 0.1);
    var LANES = [
      { spec: PER, title: "Periodic temporal kernel", ac: false, name: "Periodic" },
      { spec: RBF_MATCHED, title: "RBF temporal kernel, same speed", ac: true, name: "RBF" }
    ];
    var EINF = TV.einf(TV.rho(RBF_MATCHED, 1, SIG2), SIG2);
    var st = { seed: 7, raf: null, frame: 0 };

    var bar = DI.toolbar(body);
    var actions = DI.el("div", "di-actions", bar);
    var playBtn = DI.button(actions, "Run", function () { st.raf ? pause() : play(); }, true);
    DI.button(actions, "New objectives", function () { st.seed += 1; restart(); play(); });

    var duo = DI.el("div", "di-duo", body);
    duo.style.marginTop = "0";
    LANES.forEach(function (L) {
      var col = DI.el("div", null, duo);
      var t = DI.el("div", "di-panel-title", col);
      L.swatch = DI.el("i", "di-key", t);
      t.appendChild(document.createTextNode(L.title));
      L.canvas = DI.canvas(col, 1.75);
      L.canvas.setAttribute("aria-label", L.title + ": the objective over the last steps (input vertically, time horizontally), its maximizer and the queries of GP-UCB.");
      L.kT = new Float64Array(N + 1);
      for (var h = 0; h <= N; h++) L.kT[h] = TV.k(L.spec, h);
    });

    var charts = DI.el("div", "di-duo", body);
    var cR = chartBox(charts, "Average regret {R\u2099 / n}", "Average regret of GP-UCB as a function of the number of observations, on logarithmic axes");
    var cV = chartBox(charts, "Smallest uncertainty about the present", "Smallest posterior variance of the objective at the present time, over all inputs, just before each query, on logarithmic axes");
    var tip = DI.tooltip(body);

    function restart() {
      pause();
      LANES.forEach(function (L, i) {
        L.F = TV.sampleObjective(L.spec, sp, N, 1, st.seed * 101 + i);
        L.fmax = new Float64Array(N); L.amax = new Int16Array(N);
        var lo = Infinity, hi = -Infinity, x, t;
        for (t = 0; t < N; t++) {
          var b = -Infinity, a = 0;
          for (x = 0; x < M; x++) { var v = L.F[x * N + t]; if (v > b) { b = v; a = x; } if (v < lo) lo = v; if (v > hi) hi = v; }
          L.fmax[t] = b; L.amax[t] = a;
        }
        L.lo = lo; L.hi = hi;
        L.gp = new TV.OnlineGP(sp.KS, M, L.kT, SIG2, N);
        L.noise = TV.rng(st.seed * 7919 + 3);
        L.cum = new Float64Array(N + 1); L.vmin = new Float64Array(N + 1); L.qx = new Int16Array(N); L.n = 0;
      });
      st.frame = 0;
      draw();
    }

    function step(L) {
      var t = L.n + 1, P = L.gp.predict(t), best = -Infinity, ix = 0, vmin = Infinity;
      for (var j = 0; j < M; j++) {
        var u = P.mean[j] + Math.sqrt(BETA * P.v[j]);
        if (u > best) { best = u; ix = j; }
        if (P.v[j] < vmin) vmin = P.v[j];
      }
      var f = L.F[ix * N + t - 1];
      L.gp.add(ix, t, f + Math.sqrt(SIG2) * TV.gaussian(L.noise));
      L.qx[L.n] = ix;
      L.vmin[t] = vmin;
      L.cum[t] = L.cum[L.n] + (L.fmax[t - 1] - f);
      L.n++;
    }

    function frame() {
      st.frame++;
      var n = LANES[0].n, t0 = Date.now();
      // slow at first, so that the first queries can be followed, then as fast as the budget allows
      if (n < 30) { if (st.frame % 5 === 0) LANES.forEach(step); }
      else if (n < 100) { if (st.frame % 2 === 0) LANES.forEach(step); }
      else { do { LANES.forEach(step); } while (Date.now() - t0 < 18 && LANES[0].n < N); }
      draw();
      if (LANES[0].n >= N) { st.raf = null; playBtn.textContent = "Run again"; return; }
      st.raf = requestAnimationFrame(frame);
    }
    function play() {
      if (LANES[0].n >= N) restart();
      playBtn.textContent = "Pause";
      st.raf = requestAnimationFrame(frame);
    }
    function pause() {
      if (st.raf) cancelAnimationFrame(st.raf);
      st.raf = null;
      playBtn.textContent = LANES[0] && LANES[0].n >= N ? "Run again" : "Run";
    }

    function drawLane(L) {
      var C = DI.colors(), f = DI.fit(L.canvas), ctx = f.ctx, ramp = DI.ramp("gray");
      var pad = { l: 18, r: 6, t: 4, b: 18 }, pw = f.w - pad.l - pad.r, ph = f.h - pad.t - pad.b;
      ctx.clearRect(0, 0, f.w, f.h);
      var n = L.n, t1 = Math.max(1, n - W + 1), vals = new Float64Array(W * M);
      for (var c = 0; c < W; c++) {
        var t = t1 + c;
        for (var r = 0; r < M; r++) vals[r * W + c] = t <= n ? (L.F[(M - 1 - r) * N + t - 1] - L.lo) / (L.hi - L.lo) : NaN;
      }
      L.off = DI.heatRect(vals, W, M, ramp, L.off);
      ctx.save();
      ctx.fillStyle = DI.isDark() ? "#2a2b2f" : "#ecebe7";
      ctx.fillRect(pad.l, pad.t, pw, ph);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(L.off, pad.l, pad.t, pw, ph);
      ctx.restore();
      function X(u) { return pad.l + (u - t1 + 0.5) / W * pw; }
      function Y(ix) { return pad.t + (1 - ix / (M - 1)) * ph; }
      // the maximizer, and the queries of GP-UCB
      ctx.fillStyle = DI.isDark() ? "#16171a" : "#ffffff";
      for (var t2 = t1; t2 <= n; t2++) { ctx.beginPath(); ctx.arc(X(t2), Y(L.amax[t2 - 1]), 1.3, 0, TAU); ctx.fill(); }
      var col = regimeColor(C, L.ac);
      for (var t3 = t1; t3 <= n; t3++) DI.dot(ctx, X(t3), Y(L.qx[t3 - 1]), t3 === n ? 3.5 : 2, col, C.surface);
      ctx.save();
      ctx.font = "11px Roboto, sans-serif"; ctx.fillStyle = C.muted;
      ctx.textAlign = "left"; ctx.fillText(n ? "step " + t1 : "", pad.l, f.h - 4);
      ctx.textAlign = "right"; ctx.fillText(n ? "now: step " + n : "press Run", pad.l + pw, f.h - 4);
      ctx.translate(11, pad.t + ph / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center"; ctx.fillText("input x", 0, 0);
      ctx.restore();
      L.swatch.style.background = col;
    }

    function endLabel(svg, pts, col, name) {
      var e = pts[pts.length - 1];
      DI.svg("circle", { cx: e[0], cy: e[1], r: 4, fill: col, class: "di-svg-end" }, svg);
      DI.svg("text", { x: e[0] + 8, y: e[1] + 4, class: "di-svg-label-strong" }, svg).textContent = name;
    }

    function drawCharts() {
      var C = DI.colors(), Mg = { l: 40, r: 64, t: 14, b: 34 };
      var g = logFrame(cR, { nMax: 1000, top: 3, bot: 0.01, ticks: [-2, -1, 0], Mg: Mg });
      LANES.forEach(function (L) {
        if (!L.n) return;
        var pts = logSeries(g, function (k) { return L.cum[k] / k; }, L.n);
        DI.svg("path", { d: path(pts), stroke: regimeColor(C, L.ac), class: "di-svg-series" }, cR.svg);
        endLabel(cR.svg, pts, regimeColor(C, L.ac), L.name);
      });
      crosshair(cR);
      // the irreducible uncertainty of the RBF objective: no input can go below it, whatever the queries
      var h = logFrame(cV, { nMax: 1000, top: 2, bot: 1e-4, ticks: [-4, -3, -2, -1, 0], Mg: Mg }), yF = h.sy(EINF);
      DI.svg("line", { x1: h.Mg.l, x2: h.W - h.Mg.r, y1: yF, y2: yF, class: "di-svg-ref" }, cV.svg);
      DI.svg("text", { x: h.Mg.l + 6, y: yF + 15, class: "di-svg-label-strong" }, cV.svg).textContent = "e\u221E = " + fmtSmall(EINF) + " (RBF)";
      LANES.forEach(function (L) {
        if (!L.n) return;
        var pts = logSeries(h, function (k) { return L.vmin[k]; }, L.n);
        DI.svg("path", { d: path(pts), stroke: regimeColor(C, L.ac), class: "di-svg-series", "stroke-width": 1.5 }, cV.svg);
        endLabel(cV.svg, pts, regimeColor(C, L.ac), L.name);
      });
      crosshair(cV);
    }

    function draw() { LANES.forEach(drawLane); drawCharts(); }

    [cR, cV].forEach(function (box, bi) {
      box.svg.addEventListener("pointermove", function (e) {
        if (!box.geo || !LANES[0].n) return;
        var n = Math.min(pointerN(box, e), LANES[0].n), C = DI.colors(), p = DI.pointer(e, body);
        showCross(box, n);
        tip.show(p.x, p.y, [{ value: "n = " + n, label: "" }].concat(LANES.map(function (L) {
          return bi ? { value: fmtSmall(L.vmin[n]), label: L.name + ", smallest variance", color: regimeColor(C, L.ac) } :
            { value: DI.fmt(L.cum[n] / n, 3), label: L.name + ", average regret", color: regimeColor(C, L.ac) };
        })));
      });
      box.svg.addEventListener("pointerleave", function () { if (box.cross) box.cross.style.display = "none"; tip.hide(); });
    });

    DI.onTheme(draw);
    DI.onResize(draw);
    symbolize(body);
    restart();
    DI.onVisible(host, function () { if (!DI.reducedMotion() && !st.raf && LANES[0].n === 0) play(); });
  });

  /* 7. The size of the mistake: regret plateaus against the irreducible uncertainty ---- */

  // a marker per kernel family: circle, square or triangle
  function marker(s, shape, x, y, r, attrs) {
    var el;
    if (shape === "circle") el = DI.svg("circle", { cx: x, cy: y, r: r }, s);
    else if (shape === "square") el = DI.svg("rect", { x: x - r * 0.9, y: y - r * 0.9, width: 1.8 * r, height: 1.8 * r }, s);
    else el = DI.svg("path", { d: "M" + x + "," + (y - 1.15 * r) + "L" + (x + r) + "," + (y + 0.8 * r) + "L" + (x - r) + "," + (y + 0.8 * r) + "Z" }, s);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  DI.mount("tv-price", function (body) {
    var FAMS = [
      { value: "rbf", label: "RBF", shape: "circle", pars: [50, 20, 10, 5, 2], name: "lengthscale", spec: function (p) { return TV.rbf(p); } },
      { value: "m32", label: "Mat\u00E9rn-3/2", shape: "square", pars: [50, 20, 10, 5, 2], name: "lengthscale", spec: function (p) { return TV.m32(p); } },
      { value: "sinc2", label: "sinc\u00B2", shape: "triangle", pars: [0.02, 0.05, 0.1, 0.3, 0.7], name: "cutoff", spec: function (p) { return TV.sinc2(p); } }
    ];
    var ALGOS = [{ value: "oracle", label: "Oracle" }, { value: "ucb", label: "GP-UCB" }];
    var st = { fam: "rbf", i: 2, algo: "oracle", seed: 3 };
    function fam() { return FAMS.filter(function (f) { return f.value === st.fam; })[0]; }
    function famOf(d) { return FAMS.filter(function (f) { return f.value === d.fam; })[0]; }
    function datum(f, i) { return PRICE.filter(function (d) { return d.fam === f.value && d.par === f.pars[i]; })[0]; }

    var bar = DI.toolbar(body);
    var seg = DI.segmented(bar, "Temporal kernel", FAMS, st.fam, function (v) { st.fam = v; slider.set(st.i); draw(); });
    var slider = DI.slider(bar, "Speed of change", { min: 0, max: 4, step: 1, value: st.i, format: function (v) { var f = fam(); return f.name + " " + f.pars[v]; } },
      function (v) { st.i = v; draw(); });
    var bar2 = DI.toolbar(body);
    DI.segmented(bar2, "Regret of", ALGOS, st.algo, function (v) { st.algo = v; draw(); });
    var cS = chartBox(body, "A sample at a fixed input", "A sample of the objective at a fixed input over 200 steps");
    var cP = chartBox(body, "Regret once it has stopped decreasing, against {e\u221E}", "Regret plateau against the irreducible uncertainty, for 15 temporal kernels, on logarithmic axes");
    var lg = DI.el("div", "di-legend", body);
    var stats = DI.stats(body, [
      { key: "einf", label: "Irreducible uncertainty {e\u221E}" },
      { key: "reg", label: "Regret plateau" }
    ]);
    var tip = DI.tooltip(body), pts = [];

    function drawSample(f) {
      var C = DI.colors(), s = cS.svg, W = Math.max(260, Math.round(cS.col.clientWidth)), H = 64, T = 200;
      s.setAttribute("viewBox", "0 0 " + W + " " + H);
      keepTitle(s);
      var x = TV.sampleTemporal(f.spec(f.pars[st.i]), T, 1, TV.rng(st.seed * 17 + st.i), 1)[0], line = [];
      for (var t = 0; t < T; t++) line.push([4 + t / (T - 1) * (W - 8), H / 2 - Math.max(-3, Math.min(3, x[t])) / 3 * (H / 2 - 4)]);
      DI.svg("line", { x1: 4, x2: W - 4, y1: H / 2, y2: H / 2, class: "di-svg-grid" }, s);
      DI.svg("path", { d: path(line), stroke: C.base, class: "di-svg-series", "stroke-width": 1.5 }, s);
    }

    function drawLegend(C) {
      clear(lg);
      FAMS.forEach(function (f) {
        var span = DI.el("span", "di-legend-item", lg), sv = DI.svg("svg", { width: 12, height: 12, viewBox: "0 0 12 12", style: "width:12px;height:12px;display:inline-block;flex:none" }, span);
        marker(sv, f.shape, 6, 6.5, 4.5, { fill: C.base });
        span.appendChild(document.createTextNode(f.label));
      });
    }

    function draw() {
      var C = DI.colors(), f = fam(), sel = datum(f, st.i), key = st.algo;
      drawSample(f);
      drawLegend(C);
      var s = cP.svg, W = Math.max(300, Math.round(cP.col.clientWidth)), H = 300, M = { l: 48, r: 18, t: 14, b: 38 };
      s.setAttribute("viewBox", "0 0 " + W + " " + H);
      keepTitle(s);
      var sx = logScale(1e-3, 2, M.l, W - M.r), sy = logScale(3, 3e-4, M.t, H - M.b);
      [-3, -2, -1, 0].forEach(function (e) {
        var v = Math.pow(10, e);
        DI.svg("line", { x1: M.l, x2: W - M.r, y1: sy(v), y2: sy(v), class: "di-svg-grid" }, s);
        DI.svg("text", { x: M.l - 8, y: sy(v) + 4, "text-anchor": "end", class: "di-svg-label" }, s).textContent = pow10(e);
        DI.svg("text", { x: sx(v), y: H - M.b + 16, "text-anchor": "middle", class: "di-svg-label" }, s).textContent = pow10(e);
      });
      DI.svg("text", { x: W - M.r, y: H - 4, "text-anchor": "end", class: "di-svg-label" }, s).textContent = "irreducible uncertainty e\u221E";
      DI.svg("text", { x: M.l, y: 10, class: "di-svg-label" }, s).textContent = "regret plateau of " + (key === "ucb" ? "GP-UCB" : "the oracle");
      // a log-log fit, away from saturation (e_inf <= 0.2)
      var F = PRICE.filter(function (d) { return d.einf <= 0.2; });
      var lx = F.map(function (d) { return log10(d.einf); }), ly = F.map(function (d) { return log10(d[key]); });
      var mx = lx.reduce(function (a, b) { return a + b; }, 0) / lx.length, my = ly.reduce(function (a, b) { return a + b; }, 0) / ly.length, sxy = 0, sxx = 0;
      lx.forEach(function (v, i) { sxy += (v - mx) * (ly[i] - my); sxx += (v - mx) * (v - mx); });
      var slope = sxy / sxx, b0 = my - slope * mx, xa = Math.min.apply(null, lx), xb = Math.max.apply(null, lx);
      DI.svg("line", { x1: sx(Math.pow(10, xa)), x2: sx(Math.pow(10, xb)), y1: sy(Math.pow(10, b0 + slope * xa)), y2: sy(Math.pow(10, b0 + slope * xb)), class: "di-svg-ref" }, s);
      DI.svg("text", { x: M.l + 10, y: M.t + 16, class: "di-svg-label-strong" }, s).textContent =
        "log-log slope " + DI.fmt(slope, 2) + (Math.abs(slope - 1) < 0.15 ? ": regret \u2248 proportional to e\u221E" : "");
      pts = [];
      PRICE.forEach(function (d) {
        var x = sx(d.einf), y = sy(d[key]), on = d === sel;
        if (!on) marker(s, famOf(d).shape, x, y, 4.5, { fill: C.base, opacity: 0.45 });
        pts.push({ x: x, y: y, d: d });
      });
      marker(s, f.shape, sx(sel.einf), sy(sel[key]), 7.5, { fill: C.base, stroke: C.surface, "stroke-width": 2 });
      stats.einf.textContent = fmtSmall(sel.einf);
      stats.reg.textContent = fmtSmall(sel[key]);
    }

    function nearest(e) {
      var r = cP.svg.getBoundingClientRect(), vb = cP.svg.viewBox.baseVal, x = (e.clientX - r.left) * vb.width / r.width, y = (e.clientY - r.top) * vb.height / r.height;
      var best = null, bd = 16;
      pts.forEach(function (q) { var dd = Math.sqrt((q.x - x) * (q.x - x) + (q.y - y) * (q.y - y)); if (dd < bd) { bd = dd; best = q; } });
      return best;
    }
    cP.svg.addEventListener("pointermove", function (e) {
      var q = nearest(e);
      if (!q) { tip.hide(); cP.svg.style.cursor = ""; return; }
      cP.svg.style.cursor = "pointer";
      var f = famOf(q.d), p = DI.pointer(e, body);
      tip.show(p.x, p.y, [
        { value: f.label + ", " + f.name + " " + q.d.par, label: "" },
        { value: fmtSmall(q.d.einf), label: "e\u221E" },
        { value: fmtSmall(q.d[st.algo]), label: "regret plateau" }
      ]);
    });
    cP.svg.addEventListener("pointerleave", function () { tip.hide(); });
    // a click on a point selects its kernel
    cP.svg.addEventListener("click", function (e) {
      var q = nearest(e);
      if (!q) return;
      var f = famOf(q.d);
      st.fam = f.value; st.i = f.pars.indexOf(q.d.par);
      seg.set(st.fam, true); slider.set(st.i);
      draw();
    });

    DI.onTheme(draw);
    DI.onResize(draw);
    symbolize(body);
    draw();
  });
})(window);
