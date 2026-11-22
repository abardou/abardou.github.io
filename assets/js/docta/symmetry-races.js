/*
 * Docta Ignorantia: widgets for "Folding the search space", part 2
 * (the race under mirrors, the race under rotations seen from the orbifold, the paper's results,
 * the eigenvalue clue, and the cone of a pure rotation group).
 * Requires core.js, gp.js and symmetry.js. ES5 only: the Docker build minifies JS with uglifier.
 */
(function (root) {
  "use strict";

  var DI = root.DI, SYM = DI.sym, UI = SYM.ui, TAU = SYM.TAU;
  var LABELS = { base: "Base kernel", avg: "Averaged kernel", max: "Max kernel" };

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function path(pts) {
    return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
  }

  function legend(parent, keys, kind) {
    var el = DI.el("div", "di-legend", parent);
    return function () {
      var C = DI.colors();
      clear(el);
      keys.forEach(function (k) {
        var it = DI.el("span", "di-legend-item", el);
        var key = DI.el("i", kind === "dot" ? "di-legend-dot" : "di-legend-line", it);
        key.style.background = C[k.color || k.key];
        if (k.dash) { key.style.background = "none"; key.style.borderTop = "2px dashed " + C[k.color]; key.style.height = "0"; }
        it.appendChild(document.createTextNode(k.label));
      });
    };
  }

  // Panels with the three posterior means, and a cumulative-regret chart, shared by both races.
  function trio(body, ariaSuffix) {
    var el = DI.el("div", "di-trio", body);
    return ["base", "avg", "max"].map(function (k) {
      var col = DI.el("div", "di-trio-col", el);
      var t = DI.el("div", "di-panel-title", col);
      var key = DI.el("i", "di-key", t);
      t.appendChild(document.createTextNode(LABELS[k]));
      var c = DI.canvas(col, 1);
      c.setAttribute("aria-label", LABELS[k] + ariaSuffix);
      var read = DI.el("div", "di-readout", col);
      return { key: k, canvas: c, swatch: key, read: read };
    });
  }

  function regretChart(body, height) {
    var W = 640, H = height || 230, M = { l: 44, r: 92, t: 22, b: 34 }, T = SYM.RACE.T;
    var drawLegend = legend(body, [{ key: "base", label: LABELS.base }, { key: "avg", label: LABELS.avg }, { key: "max", label: LABELS.max }]);
    var svg = DI.svg("svg", { class: "di-plot", role: "img" }, body);
    DI.svg("title", {}, svg).textContent = "Cumulative regret of the three optimizers";
    var gAx = DI.svg("g", {}, svg), gLines = DI.svg("g", {}, svg);
    var cross = DI.svg("line", { class: "di-svg-crosshair", y1: M.t, y2: H - M.b }, svg);
    var tip = DI.tooltip(body), race = null, sx = null;

    function draw(r) {
      race = r;
      drawLegend();
      var C = DI.colors();
      W = Math.max(300, Math.round(body.clientWidth));
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      var ymax = 0.5;
      race.models.forEach(function (m) { ymax = Math.max(ymax, m.cum[m.cum.length - 1]); });
      var step = [0.25, 0.5, 1, 2, 5, 10, 20].filter(function (s) { return ymax / s <= 5; })[0] || 50;
      ymax = Math.ceil(ymax / step - 1e-9) * step;
      sx = function (t) { return M.l + t / T * (W - M.l - M.r); };
      function sy(v) { return M.t + (1 - v / ymax) * (H - M.t - M.b); }
      clear(gAx);
      for (var v = 0; v <= ymax + 1e-9; v += step) {
        DI.svg("line", { x1: M.l, x2: W - M.r, y1: sy(v), y2: sy(v), class: v ? "di-svg-grid" : "di-svg-axis" }, gAx);
        DI.svg("text", { x: M.l - 8, y: sy(v) + 4, "text-anchor": "end", class: "di-svg-label" }, gAx).textContent = +v.toFixed(2);
      }
      [0, 10, 20, 30].forEach(function (t) {
        DI.svg("text", { x: sx(t), y: H - M.b + 17, "text-anchor": "middle", class: "di-svg-label" }, gAx).textContent = t;
      });
      DI.svg("text", { x: W - M.r, y: H - 4, "text-anchor": "end", class: "di-svg-label" }, gAx).textContent = "evaluations";
      DI.svg("text", { x: M.l, y: 10, class: "di-svg-label" }, gAx).textContent = "cumulative regret (lower is better)";

      clear(gLines);
      var ends = [];
      race.models.forEach(function (m) {
        var d = m.cum.map(function (c, t) { return (t ? "L" : "M") + sx(t).toFixed(1) + "," + sy(c).toFixed(1); }).join("");
        DI.svg("path", { d: d, class: "di-svg-series", stroke: C[m.name] }, gLines);
        var t = m.cum.length - 1;
        DI.svg("circle", { cx: sx(t), cy: sy(m.cum[t]), r: 4, fill: C[m.name], class: "di-svg-end" }, gLines);
        ends.push({ y: sy(m.cum[t]), x: sx(t), name: m.name });
      });
      if (!race.t) ends = [];
      ends.sort(function (a, b) { return a.y - b.y; });
      for (var i = 1; i < ends.length; i++) {
        var prev = ends[i - 1].ly || ends[i - 1].y;
        if (ends[i].y - prev < 14) ends[i].ly = prev + 14;
      }
      ends.forEach(function (e) {
        var ly = e.ly || e.y;
        if (Math.abs(ly - e.y) > 1) DI.svg("line", { x1: e.x + 6, y1: e.y, x2: e.x + 14, y2: ly, class: "di-svg-leader" }, gLines);
        DI.svg("text", { x: e.x + 16, y: ly + 4, class: "di-svg-label-strong" }, gLines).textContent = LABELS[e.name].replace(" kernel", "");
      });
    }

    svg.addEventListener("pointermove", function (e) {
      if (!race || !sx) return;
      var r = svg.getBoundingClientRect(), k = W / r.width, x = (e.clientX - r.left) * k;
      var t = Math.round((x - M.l) / (W - M.l - M.r) * T);
      t = Math.max(0, Math.min(race.t, t));
      cross.setAttribute("x1", sx(t)); cross.setAttribute("x2", sx(t)); cross.style.display = "block";
      var C = DI.colors(), p = DI.pointer(e, body);
      var rows = [{ value: "after " + t + " evaluation" + (t === 1 ? "" : "s"), label: "" }];
      race.models.forEach(function (m) { rows.push({ value: DI.fmt(m.cum[t], 2), label: LABELS[m.name], color: C[m.name] }); });
      tip.show(p.x, p.y, rows);
    });
    svg.addEventListener("pointerleave", function () { cross.style.display = "none"; tip.hide(); });
    return { draw: draw };
  }

  // Run / Step / New start, shared by both races.
  function controls(bar, api) {
    var actions = DI.el("div", "di-actions", bar);
    var playBtn = DI.button(actions, "Run", function () { api.timer() ? api.pause() : api.run(); }, true);
    DI.button(actions, "Step", function () { api.pause(); api.advance(); });
    DI.button(actions, "New start", api.newStart);
    return playBtn;
  }

  function racer(st, drawAll, playBtnRef) {
    var T = SYM.RACE.T;
    var api = {
      restart: function () { api.pause(); st.race = new SYM.Race(st.n, st.seed); drawAll(); },
      advance: function () { if (!st.race.step()) api.pause(); drawAll(); },
      run: function () {
        if (st.race.t >= T) api.restart();
        playBtnRef.btn.textContent = "Pause";
        st.timer = setInterval(api.advance, 320);
      },
      pause: function () {
        if (st.timer) clearInterval(st.timer);
        st.timer = null;
        if (playBtnRef.btn) playBtnRef.btn.textContent = st.race && st.race.t >= T ? "Run again" : "Run";
      },
      timer: function () { return st.timer; },
      newStart: function () { st.seed += 1; api.restart(); }
    };
    return api;
  }

  function drawObservations(ctx, map, mod, key, C) {
    mod.X.slice(0, SYM.RACE.init).forEach(function (q) {
      var p = map.px(q.x, q.y); DI.ring(ctx, p[0], p[1], 3, C.ink, C.surface);
    });
    mod.queries.forEach(function (q, i) {
      var p = map.px(q.x, q.y), last = i === mod.queries.length - 1;
      DI.dot(ctx, p[0], p[1], last ? 5 : 3, C[key], C.surface);
    });
  }

  // Posterior mean on the grid nodes, painted on the disc.
  function drawGridMean(ctx, map, race, mod) {
    var m = SYM.RACE.m, ramp = DI.ramp("gray"), vals = new Float64Array(m * m);
    for (var q = 0; q < vals.length; q++) vals[q] = NaN;
    race.grid.forEach(function (g, i) {
      var col = Math.round((g.x + 1) / 2 * (m - 1)), row = Math.round((1 - g.y) / 2 * (m - 1));
      vals[row * m + col] = (mod.mu[i] + 0.1) / 1.2;
    });
    var img = DI.heatImage(vals, m, ramp);
    // the image grid is node-centred: stretch it so nodes land on the right pixels
    var cell = 2 * map.rad / (m - 1);
    ctx.save();
    ctx.beginPath(); ctx.arc(map.cx, map.cy, map.rad, 0, TAU); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, map.cx - map.rad - cell / 2, map.cy - map.rad - cell / 2, 2 * map.rad + cell, 2 * map.rad + cell);
    ctx.restore();
  }

  /* 7. The race under mirror symmetries ----------------------------------- */

  DI.mount("race", function (body, host) {
    var st = { n: 8, seed: 6, race: null, timer: null }, ref = {};
    var bar = DI.toolbar(body);
    DI.segmented(bar, "Mirrors", [4, 8].map(function (v) { return { value: v, label: String(v) }; }), st.n,
      function (v) { st.n = v; api.restart(); });
    var panels = trio(body, ": what the model believes, and where it evaluated");
    var chart = regretChart(body);
    var api = racer(st, drawAll, ref);
    ref.btn = controls(bar, api);

    function drawPanels() {
      var C = DI.colors(), race = st.race;
      panels.forEach(function (pn, idx) {
        var mod = race.models[idx];
        pn.swatch.style.background = C[pn.key];
        var f = DI.fit(pn.canvas), ctx = f.ctx, map = UI.discMapper(f.w, f.h, 3);
        ctx.clearRect(0, 0, f.w, f.h);
        drawGridMean(ctx, map, race, mod);
        UI.strokeDisc(ctx, map, C.rule);
        SYM.peaks(race.n).forEach(function (q) {
          var p = map.px(q[0], q[1]);
          ctx.beginPath(); ctx.arc(p[0], p[1], 6, 0, TAU);
          ctx.lineWidth = 1; ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.45; ctx.stroke(); ctx.globalAlpha = 1;
        });
        drawObservations(ctx, map, mod, pn.key, C);
        pn.read.textContent = "best value found " + DI.fmt(mod.best) + " of 1.00";
      });
    }
    function drawAll() { drawPanels(); chart.draw(st.race); }

    DI.onTheme(drawAll);
    DI.onResize(drawAll);
    api.restart();
    DI.onVisible(host, function () { if (!DI.reducedMotion() && !st.timer && st.race.t === 0) api.run(); });
  });

  /* 8. The race under all rotations, seen from the orbifold --------------- */

  DI.mount("race-rot", function (body, host) {
    var st = { n: Infinity, seed: 26, race: null, timer: null }, ref = {}, NR = 121, rs = [];
    for (var i = 0; i < NR; i++) rs.push(i / (NR - 1));
    var bar = DI.toolbar(body);
    var panels = trio(body, ": what the model believes on the disc, and where it evaluated");

    var duo = DI.el("div", "di-duo", body);
    var views = ["avg", "max"].map(function (k) {
      var col = DI.el("div", "di-duo-col", duo);
      var t = DI.el("div", "di-panel-title", col);
      var key = DI.el("i", "di-key", t);
      t.appendChild(document.createTextNode(LABELS[k] + ", seen along a radius"));
      var svg = DI.svg("svg", { class: "di-plot", role: "img" }, col);
      DI.svg("title", {}, svg).textContent = LABELS[k] + ": posterior mean and uncertainty as a function of the radius";
      var read = DI.el("div", "di-readout", col);
      return { key: k, svg: svg, col: col, swatch: key, read: read };
    });
    var chart = regretChart(body, 200);
    var api = racer(st, drawAll, ref);
    ref.btn = controls(bar, api);

    function drawPanels() {
      var C = DI.colors(), race = st.race, ramp = DI.ramp("gray"), MI = 120;
      panels.forEach(function (pn, idx) {
        var mod = race.models[idx];
        pn.swatch.style.background = C[pn.key];
        var f = DI.fit(pn.canvas), ctx = f.ctx, map = UI.discMapper(f.w, f.h, 3);
        ctx.clearRect(0, 0, f.w, f.h);
        if (pn.key === "base") drawGridMean(ctx, map, race, mod);
        else {
          // invariant models believe in rings: paint the disc from their posterior along one radius
          var post = race.alongRay(idx, rs), vals = new Float64Array(MI * MI);
          for (var a = 0; a < MI; a++) for (var b = 0; b < MI; b++) {
            var x = -1 + 2 * (b + 0.5) / MI, y = 1 - 2 * (a + 0.5) / MI, r = Math.sqrt(x * x + y * y);
            if (r > 1.02) { vals[a * MI + b] = NaN; continue; }
            var t = Math.min(NR - 1.001, r * (NR - 1)), j = t | 0, fr = t - j;
            vals[a * MI + b] = (post[j].mu * (1 - fr) + post[j + 1].mu * fr + 0.1) / 1.2;
          }
          UI.drawDiscImage(ctx, DI.heatImage(vals, MI, ramp), map);
          pn.post = post;
        }
        UI.strokeDisc(ctx, map, C.rule);
        ctx.save();
        ctx.setLineDash([2, 5]); ctx.lineWidth = 1.25; ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.55;
        ctx.beginPath(); ctx.arc(map.cx, map.cy, SYM.RADIAL_PEAK * map.rad, 0, TAU); ctx.stroke();
        ctx.restore();
        drawObservations(ctx, map, mod, pn.key, C);
        pn.read.textContent = "best value found " + DI.fmt(mod.best) + " of 1.00";
      });
    }

    function drawViews() {
      var C = DI.colors(), race = st.race;
      views.forEach(function (v, vi) {
        var idx = vi + 1, mod = race.models[idx], post = panels[idx].post || race.alongRay(idx, rs);
        v.swatch.style.background = C[v.key];
        var W = Math.max(240, Math.round(v.col.clientWidth)), H = 210, M = { l: 30, r: 8, t: 10, b: 30 };
        var Y0 = -1.25, Y1 = 1.85;
        function sx(r) { return M.l + r * (W - M.l - M.r); }
        function sy(y) { return M.t + (Y1 - Math.max(Y0, Math.min(Y1, y))) / (Y1 - Y0) * (H - M.t - M.b); }
        var svg = v.svg, keep = svg.firstChild;
        svg.setAttribute("viewBox", "0 0 " + W + " " + H);
        clear(svg); svg.appendChild(keep);
        [-1, 0, 1].forEach(function (y) {
          DI.svg("line", { x1: M.l, x2: W - M.r, y1: sy(y), y2: sy(y), class: "di-svg-grid" }, svg);
          DI.svg("text", { x: M.l - 6, y: sy(y) + 4, "text-anchor": "end", class: "di-svg-label" }, svg).textContent = y;
        });
        [0, 0.5, 1].forEach(function (r) {
          DI.svg("text", { x: sx(r), y: H - M.b + 16, "text-anchor": r ? (r === 1 ? "end" : "middle") : "start", class: "di-svg-label" }, svg).textContent = r;
        });
        DI.svg("text", { x: (sx(0) + sx(1)) / 2, y: H - 2, "text-anchor": "middle", class: "di-svg-label" }, svg).textContent =
          "radius r = \u2016x\u2016, from the center to the rim";
        var up = post.map(function (p, i) { return [sx(rs[i]), sy(p.mu + p.sd)]; });
        var lo = post.map(function (p, i) { return [sx(rs[i]), sy(p.mu - p.sd)]; }).reverse();
        DI.svg("path", { d: path(up.concat(lo)) + "Z", fill: C[v.key], class: "di-svg-band-model" }, svg);
        DI.svg("path", { d: path(rs.map(function (r) { return [sx(r), sy(SYM.radial(r))]; })), class: "di-svg-truth" }, svg);
        DI.svg("path", { d: path(post.map(function (p, i) { return [sx(rs[i]), sy(p.mu)]; })), stroke: C[v.key], class: "di-svg-series" }, svg);
        var nq = race.grid[mod.next];
        if (race.t < SYM.RACE.T) {
          DI.svg("line", { x1: sx(nq.r), x2: sx(nq.r), y1: M.t, y2: H - M.b, class: "di-svg-guide" }, svg);
          DI.svg("text", { x: Math.min(sx(nq.r) + 4, W - M.r - 26), y: M.t + 10, class: "di-svg-label" }, svg).textContent = "next";
        }
        v.read.textContent = "fitted signal variance " + DI.fmt(mod.hp.lam, 1) + " \u00B7 lengthscale " + DI.fmt(mod.hp.l);
        mod.X.forEach(function (q, i) {
          var init = i < SYM.RACE.init;
          DI.svg("circle", {
            cx: sx(q.r), cy: sy(mod.y[i]), r: init ? 3.5 : 3.5,
            class: init ? "di-svg-obs-hollow" : "di-svg-end", fill: init ? "none" : C[v.key]
          }, svg);
        });
      });
    }

    function drawAll() { drawPanels(); drawViews(); chart.draw(st.race); }
    DI.onTheme(drawAll);
    DI.onResize(drawAll);
    api.restart();
    DI.onVisible(host, function () { if (!DI.reducedMotion() && !st.timer && st.race.t === 0) api.run(); });
  });

  /* 9. The paper's results, relative to ignoring the symmetry ------------- */

  DI.mount("results", function (body) {
    var ROWS = [
      { name: "Ackley", dim: "2D", G: "8", base: [382.7, 5.7], avg: [128.2, 10.4], max: [126.4, 3.6] },
      { name: "Griewank", dim: "6D", G: "64", base: [3840.3, 177.7], avg: [3067.4, 841.9], max: [1832.6, 146.3] },
      { name: "Rastrigin", dim: "5D", G: "3,840", base: [3568.5, 91.3], avg: [1583.5, 341.9], max: [813.4, 70.6] },
      { name: "Radial", dim: "2D", G: "\u221E", base: [388.6, 20.3], avg: [480.9, 76.4], max: [199.7, 11.6] },
      { name: "Scaling", dim: "2D", G: "\u221E", base: [1820.6, 1135.4], avg: [3361.8, 742.9], max: [25.4, 6.4] }
    ];
    var XMAX = 2.4, ROW = 46;
    var drawLegend = legend(body, [{ key: "base", label: LABELS.base }, { key: "avg", label: LABELS.avg }, { key: "max", label: "Max kernel (projected)" }], "dot");
    var svg = DI.svg("svg", { class: "di-plot", role: "img" }, body);
    DI.svg("title", {}, svg).textContent = "Cumulative regret of each kernel divided by that of the base kernel, on five benchmarks";
    var tip = DI.tooltip(body), hit = [];

    function draw() {
      drawLegend();
      var C = DI.colors(), W = Math.max(300, Math.round(body.clientWidth)), narrow = W < 520;
      var M = { l: narrow ? 92 : 132, r: 14, t: 26, b: 38 }, H = M.t + ROW * ROWS.length + M.b;
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      var keep = svg.firstChild; clear(svg); svg.appendChild(keep);
      function sx(v) { return M.l + Math.min(v, XMAX) / XMAX * (W - M.l - M.r); }
      [0, 0.5, 1, 1.5, 2].forEach(function (v) {
        DI.svg("line", { x1: sx(v), x2: sx(v), y1: M.t - 6, y2: H - M.b, class: v === 1 ? "di-svg-ref" : "di-svg-grid" }, svg);
        DI.svg("text", { x: sx(v), y: H - M.b + 16, "text-anchor": "middle", class: "di-svg-label" }, svg).textContent = v === 1 ? "1" : v;
      });
      DI.svg("text", { x: sx(1) + 5, y: M.t - 12, class: "di-svg-label" }, svg).textContent = narrow ? "= base kernel" : "same as ignoring the symmetry";
      DI.svg("text", { x: (sx(0) + sx(XMAX)) / 2, y: H - 4, "text-anchor": "middle", class: "di-svg-label" }, svg).textContent =
        narrow ? "regret relative to the base kernel" : "cumulative regret, relative to the base kernel (lower is better)";
      hit = [];
      ROWS.forEach(function (row, i) {
        var y = M.t + ROW * i + ROW / 2, b = row.base[0];
        if (i) DI.svg("line", { x1: 0, x2: W - M.r, y1: y - ROW / 2, y2: y - ROW / 2, class: "di-svg-grid" }, svg);
        DI.svg("text", { x: 0, y: y - 2, class: "di-svg-label-strong" }, svg).textContent = row.name + " " + row.dim;
        DI.svg("text", { x: 0, y: y + 13, class: "di-svg-label" }, svg).textContent = "|G| = " + row.G;
        [["base", -9], ["avg", 0], ["max", 9]].forEach(function (k) {
          var m = row[k[0]][0] / b, se = row[k[0]][1] / b, yy = y + k[1];
          DI.svg("line", { x1: sx(Math.max(0, m - se)), x2: sx(m + se), y1: yy, y2: yy, stroke: C[k[0]], class: "di-svg-errbar" }, svg);
          DI.svg("circle", { cx: sx(m), cy: yy, r: 4.5, fill: C[k[0]], class: "di-svg-end" }, svg);
          if (m + se > XMAX) DI.svg("text", { x: sx(XMAX) - 2, y: yy - 5, "text-anchor": "end", class: "di-svg-label" }, svg).textContent = "\u2192";
        });
        hit.push({ y0: y - ROW / 2, y1: y + ROW / 2, row: row });
      });
    }

    svg.addEventListener("pointermove", function (e) {
      var r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, y = (e.clientY - r.top) * vb.height / r.height;
      var h = hit.filter(function (q) { return y >= q.y0 && y < q.y1; })[0];
      if (!h) { tip.hide(); return; }
      var C = DI.colors(), p = DI.pointer(e, body), row = h.row;
      tip.show(p.x, p.y, [{ value: row.name + " " + row.dim + ", |G| = " + row.G, label: "" }].concat(["base", "avg", "max"].map(function (k) {
        return { value: row[k][0].toFixed(1) + " \u00B1 " + row[k][1].toFixed(1), label: LABELS[k], color: C[k] };
      })));
    });
    svg.addEventListener("pointerleave", function () { tip.hide(); });
    DI.onTheme(draw);
    DI.onResize(draw);
    draw();
  });

  /* 10. The eigenvalue clue -------------------------------------------------- */

  // Eigenvalues (divided by N) of Matern-3/2 Gram matrices, lengthscale 0.3, N = 1500 uniform points in the unit disc
  // (or in a disc |G| times smaller in area), for D_n with n mirrors. Computed offline with NumPy.
  var SPECTRA = {"2":{"b":[[1,0.137],[2,0.098],[3,0.091],[4,0.0632],[5,0.061],[6,0.0546],[7,0.04],[8,0.0387],[9,0.0314],[10,0.0299],[11,0.0255],[13,0.0185],[14,0.0174],[16,0.0155],[17,0.0154],[19,0.0107],[22,0.00956],[24,0.00685],[27,0.00609],[30,0.00518],[33,0.00414],[37,0.00318],[41,0.00271],[45,0.00214],[50,0.00181],[56,0.00136],[62,0.00107],[69,0.000844],[77,0.000671],[86,0.000506],[95,0.000396],[106,0.000302],[118,0.000237],[131,0.000185],[146,0.000139],[162,0.000108],[180,8.39e-05],[200,6.31e-05],[223,4.79e-05],[248,3.71e-05],[275,2.81e-05],[306,2.18e-05],[340,1.66e-05],[378,1.25e-05],[420,9.33e-06],[467,7.16e-06],[520,5.36e-06],[578,4e-06],[642,3.01e-06],[714,2.22e-06],[794,1.61e-06],[883,1.15e-06],[982,8.02e-07],[1091,5.38e-07],[1213,3.14e-07],[1349,1.35e-07],[1500,5e-10]],"bs":[[1,0.355],[2,0.15],[3,0.143],[4,0.0615],[5,0.0557],[6,0.0471],[7,0.025],[8,0.0237],[9,0.0176],[10,0.0173],[11,0.011],[13,0.00753],[14,0.00715],[16,0.00527],[17,0.00508],[19,0.00335],[22,0.0028],[24,0.0018],[27,0.00151],[30,0.0013],[33,0.000911],[37,0.000704],[41,0.000548],[45,0.000407],[50,0.000333],[56,0.000242],[62,0.000181],[69,0.000141],[77,0.000105],[86,8.15e-05],[95,6.18e-05],[106,4.65e-05],[118,3.44e-05],[131,2.73e-05],[146,2.04e-05],[162,1.54e-05],[180,1.17e-05],[200,8.91e-06],[223,6.67e-06],[248,5e-06],[275,3.89e-06],[306,2.91e-06],[340,2.17e-06],[378,1.63e-06],[420,1.24e-06],[467,9.28e-07],[520,6.98e-07],[578,5.17e-07],[642,3.84e-07],[714,2.83e-07],[794,2.1e-07],[883,1.48e-07],[982,1.02e-07],[1091,6.87e-08],[1213,4e-08],[1349,1.89e-08],[1500,2.05e-10]],"avg":[[1,0.136],[2,0.0605],[3,0.055],[4,0.0239],[5,0.0173],[6,0.0167],[7,0.00985],[8,0.00628],[9,0.00565],[10,0.00513],[11,0.00413],[13,0.00212],[14,0.00198],[16,0.00181],[17,0.00121],[19,0.000981],[22,0.000728],[24,0.000597],[27,0.000387],[30,0.000335],[33,0.000234],[37,0.000193],[41,0.00014],[45,0.000112],[50,9.04e-05],[56,6.2e-05],[62,4.99e-05],[69,3.65e-05],[77,2.75e-05],[86,2.16e-05],[95,1.57e-05],[106,1.2e-05],[118,9.05e-06],[131,6.88e-06],[146,5.07e-06],[162,3.94e-06],[180,2.95e-06],[200,2.24e-06],[223,1.66e-06],[248,1.25e-06],[275,9.52e-07],[306,7.17e-07],[340,5.44e-07],[378,4.13e-07],[420,3.11e-07],[467,2.35e-07],[520,1.76e-07],[578,1.31e-07],[642,9.75e-08],[714,7.36e-08],[794,5.16e-08],[883,3.67e-08],[982,2.48e-08],[1091,1.67e-08],[1213,9.69e-09],[1349,4.48e-09]],"max":[[1,0.348],[2,0.164],[3,0.128],[4,0.0724],[5,0.0482],[6,0.0443],[7,0.0333],[8,0.0202],[9,0.0168],[10,0.0161],[11,0.015],[13,0.00769],[14,0.00686],[16,0.00607],[17,0.00463],[19,0.00348],[22,0.00271],[24,0.00229],[27,0.00152],[30,0.00122],[33,0.000968],[37,0.000707],[41,0.000582],[45,0.000416],[50,0.000349],[56,0.000236],[62,0.000191],[69,0.000142],[77,0.000109],[86,8.23e-05],[95,6.29e-05],[106,4.79e-05],[118,3.59e-05],[131,2.72e-05],[146,2.06e-05],[162,1.57e-05],[180,1.18e-05],[200,9.01e-06],[223,6.7e-06],[248,5.04e-06],[275,3.85e-06],[306,2.89e-06],[340,2.18e-06],[378,1.66e-06],[420,1.25e-06],[467,9.44e-07],[520,7.04e-07],[578,5.23e-07],[642,3.92e-07],[714,2.92e-07],[794,2.05e-07],[883,1.48e-07],[982,1.01e-07],[1091,6.75e-08],[1213,3.91e-08],[1349,1.76e-08],[1500,3.59e-11]]},"4":{"b":[[1,0.141],[2,0.0974],[3,0.0929],[4,0.0618],[5,0.0602],[6,0.0536],[7,0.039],[8,0.0375],[9,0.0326],[10,0.0314],[11,0.0244],[13,0.0192],[14,0.018],[16,0.0156],[17,0.0143],[19,0.0107],[22,0.00931],[24,0.00692],[27,0.00622],[30,0.00502],[33,0.00405],[37,0.00328],[41,0.00262],[45,0.0021],[50,0.00181],[56,0.00132],[62,0.0011],[69,0.000828],[77,0.000645],[86,0.000511],[95,0.000401],[106,0.000305],[118,0.000239],[131,0.000184],[146,0.000141],[162,0.000109],[180,8.42e-05],[200,6.39e-05],[223,4.86e-05],[248,3.7e-05],[275,2.82e-05],[306,2.12e-05],[340,1.63e-05],[378,1.23e-05],[420,9.25e-06],[467,6.99e-06],[520,5.19e-06],[578,3.87e-06],[642,2.93e-06],[714,2.1e-06],[794,1.53e-06],[883,1.08e-06],[982,7.52e-07],[1091,4.99e-07],[1213,3.09e-07],[1349,1.44e-07],[1500,7.44e-10]],"bs":[[1,0.495],[2,0.149],[3,0.142],[4,0.0452],[5,0.0417],[6,0.0318],[7,0.0149],[8,0.0139],[9,0.0101],[10,0.00908],[11,0.00563],[13,0.00358],[14,0.0035],[16,0.00247],[17,0.00228],[19,0.0015],[22,0.00116],[24,0.000785],[27,0.000605],[30,0.000528],[33,0.000352],[37,0.000285],[41,0.000209],[45,0.000154],[50,0.00013],[56,8.91e-05],[62,6.76e-05],[69,5.25e-05],[77,3.96e-05],[86,2.96e-05],[95,2.23e-05],[106,1.7e-05],[118,1.28e-05],[131,9.66e-06],[146,7.11e-06],[162,5.47e-06],[180,4.03e-06],[200,3.17e-06],[223,2.32e-06],[248,1.78e-06],[275,1.36e-06],[306,1.01e-06],[340,7.52e-07],[378,5.66e-07],[420,4.22e-07],[467,3.18e-07],[520,2.42e-07],[578,1.78e-07],[642,1.35e-07],[714,9.86e-08],[794,7.12e-08],[883,5.1e-08],[982,3.55e-08],[1091,2.33e-08],[1213,1.38e-08],[1349,6.62e-09],[1500,2.42e-11]],"avg":[[1,0.141],[2,0.054],[3,0.023],[4,0.0163],[5,0.00669],[6,0.00507],[7,0.0041],[8,0.00217],[9,0.00184],[10,0.00121],[11,0.00105],[13,0.000768],[14,0.000511],[16,0.000353],[17,0.000344],[19,0.000231],[22,0.000163],[24,0.000123],[27,9.4e-05],[30,6.27e-05],[33,5.46e-05],[37,3.75e-05],[41,2.95e-05],[45,2.28e-05],[50,1.65e-05],[56,1.31e-05],[62,9.47e-06],[69,7.23e-06],[77,5.16e-06],[86,3.9e-06],[95,3.05e-06],[106,2.21e-06],[118,1.66e-06],[131,1.29e-06],[146,9.49e-07],[162,7.27e-07],[180,5.53e-07],[200,4.08e-07],[223,3.08e-07],[248,2.33e-07],[275,1.77e-07],[306,1.34e-07],[340,1e-07],[378,7.53e-08],[420,5.63e-08],[467,4.28e-08],[520,3.23e-08],[578,2.37e-08],[642,1.76e-08],[714,1.28e-08],[794,9.22e-09],[883,6.79e-09],[982,4.69e-09],[1091,3.19e-09],[1213,1.91e-09],[1349,9.2e-10]],"max":[[1,0.476],[2,0.178],[3,0.114],[4,0.0598],[5,0.0366],[6,0.0298],[7,0.0221],[8,0.0127],[9,0.00934],[10,0.00895],[11,0.00833],[13,0.00409],[14,0.00374],[16,0.00285],[17,0.00254],[19,0.0016],[22,0.0012],[24,0.00108],[27,0.000637],[30,0.00053],[33,0.000391],[37,0.000296],[41,0.000229],[45,0.000173],[50,0.000135],[56,9.47e-05],[62,7.34e-05],[69,5.61e-05],[77,4.2e-05],[86,3.13e-05],[95,2.38e-05],[106,1.78e-05],[118,1.36e-05],[131,1.03e-05],[146,7.67e-06],[162,5.77e-06],[180,4.36e-06],[200,3.35e-06],[223,2.49e-06],[248,1.87e-06],[275,1.41e-06],[306,1.07e-06],[340,8.08e-07],[378,6.09e-07],[420,4.49e-07],[467,3.4e-07],[520,2.56e-07],[578,1.89e-07],[642,1.42e-07],[714,1.04e-07],[794,7.45e-08],[883,5.42e-08],[982,3.73e-08],[1091,2.55e-08],[1213,1.52e-08],[1349,7.37e-09]]},"8":{"b":[[1,0.137],[2,0.096],[3,0.0927],[4,0.0638],[5,0.0606],[6,0.056],[7,0.0404],[8,0.0387],[9,0.0309],[10,0.0291],[11,0.0255],[13,0.0182],[14,0.0175],[16,0.0155],[17,0.015],[19,0.0105],[22,0.0094],[24,0.00677],[27,0.00614],[30,0.00514],[33,0.00415],[37,0.00323],[41,0.00284],[45,0.00204],[50,0.00185],[56,0.00136],[62,0.00103],[69,0.000843],[77,0.000652],[86,0.000513],[95,0.000403],[106,0.000309],[118,0.00024],[131,0.000186],[146,0.000141],[162,0.00011],[180,8.34e-05],[200,6.43e-05],[223,4.92e-05],[248,3.75e-05],[275,2.92e-05],[306,2.18e-05],[340,1.65e-05],[378,1.27e-05],[420,9.55e-06],[467,7.2e-06],[520,5.39e-06],[578,3.94e-06],[642,3e-06],[714,2.2e-06],[794,1.65e-06],[883,1.2e-06],[982,8.05e-07],[1091,5.43e-07],[1213,3.22e-07],[1349,1.58e-07],[1500,1.35e-09]],"bs":[[1,0.638],[2,0.126],[3,0.12],[4,0.0267],[5,0.0263],[6,0.0198],[7,0.00729],[8,0.00702],[9,0.005],[10,0.00463],[11,0.00246],[13,0.00158],[14,0.00155],[16,0.00101],[17,0.000968],[19,0.000597],[22,0.000464],[24,0.000291],[27,0.000239],[30,0.000208],[33,0.00014],[37,0.000107],[41,7.73e-05],[45,6.08e-05],[50,4.75e-05],[56,3.4e-05],[62,2.49e-05],[69,1.92e-05],[77,1.42e-05],[86,1.09e-05],[95,8.2e-06],[106,6.13e-06],[118,4.67e-06],[131,3.44e-06],[146,2.62e-06],[162,1.97e-06],[180,1.48e-06],[200,1.14e-06],[223,8.44e-07],[248,6.4e-07],[275,4.92e-07],[306,3.63e-07],[340,2.77e-07],[378,2.09e-07],[420,1.57e-07],[467,1.17e-07],[520,8.7e-08],[578,6.53e-08],[642,4.89e-08],[714,3.64e-08],[794,2.67e-08],[883,1.87e-08],[982,1.31e-08],[1091,8.66e-09],[1213,5.09e-09],[1349,2.15e-09],[1500,1.42e-11]],"avg":[[1,0.136],[2,0.0559],[3,0.0171],[4,0.0055],[5,0.00437],[6,0.00201],[7,0.00135],[8,0.000856],[9,0.000518],[10,0.000373],[11,0.000342],[13,0.000192],[14,0.000133],[16,9.9e-05],[17,6.78e-05],[19,5.94e-05],[22,3.66e-05],[24,2.88e-05],[27,2.09e-05],[30,1.52e-05],[33,1.01e-05],[37,8.36e-06],[41,5.97e-06],[45,4.83e-06],[50,3.4e-06],[56,2.46e-06],[62,1.9e-06],[69,1.43e-06],[77,1.07e-06],[86,7.52e-07],[95,5.62e-07],[106,4.17e-07],[118,3.19e-07],[131,2.43e-07],[146,1.78e-07],[162,1.34e-07],[180,1.01e-07],[200,7.71e-08],[223,5.7e-08],[248,4.23e-08],[275,3.22e-08],[306,2.42e-08],[340,1.8e-08],[378,1.35e-08],[420,1.03e-08],[467,7.67e-09],[520,5.63e-09],[578,4.28e-09],[642,3.17e-09],[714,2.33e-09],[794,1.67e-09],[883,1.17e-09],[982,8.13e-10],[1091,5.07e-10],[1213,3e-10],[1349,1.37e-10]],"max":[[1,0.564],[2,0.195],[3,0.0751],[4,0.0608],[5,0.029],[6,0.0186],[7,0.0124],[8,0.00764],[9,0.00713],[10,0.00596],[11,0.0033],[13,0.00263],[14,0.00173],[16,0.00138],[17,0.0012],[19,0.000927],[22,0.000575],[24,0.000395],[27,0.000332],[30,0.000227],[33,0.000168],[37,0.000134],[41,9.8e-05],[45,7.11e-05],[50,5.58e-05],[56,4.09e-05],[62,2.97e-05],[69,2.26e-05],[77,1.6e-05],[86,1.27e-05],[95,9.17e-06],[106,6.94e-06],[118,5.23e-06],[131,3.84e-06],[146,2.87e-06],[162,2.21e-06],[180,1.65e-06],[200,1.23e-06],[223,9.04e-07],[248,6.92e-07],[275,5.15e-07],[306,3.91e-07],[340,2.9e-07],[378,2.17e-07],[420,1.64e-07],[467,1.22e-07],[520,9.02e-08],[578,6.86e-08],[642,5.07e-08],[714,3.73e-08],[794,2.67e-08],[883,1.89e-08],[982,1.3e-08],[1091,8.18e-09],[1213,4.83e-09],[1349,2.2e-09]]}};

  DI.mount("spectrum", function (body) {
    var st = { n: 4 };
    var bar = DI.toolbar(body);
    DI.segmented(bar, "Mirrors", [2, 4, 8].map(function (v) { return { value: v, label: v + "  (|G| = " + 2 * v + ")" }; }), st.n,
      function (v) { st.n = v; draw(); });
    var SERIES = [
      { key: "b", color: "muted", label: "Base kernel on the disc" },
      { key: "avg", color: "avg", label: "Averaged kernel" },
      { key: "max", color: "max", label: "Max kernel" },
      { key: "bs", color: "ink", label: "Base kernel on a disc |G| times smaller", dash: true }
    ];
    var drawLegend = legend(body, SERIES.map(function (s) { return { key: s.key, color: s.color, label: s.label, dash: s.dash }; }));
    var svg = DI.svg("svg", { class: "di-plot", role: "img" }, body);
    DI.svg("title", {}, svg).textContent = "Eigenvalue decay of the kernels, on logarithmic axes";
    var cross = null, tip = DI.tooltip(body), geo = null;
    var SUP = { "0": "\u2070", "1": "\u00B9", "2": "\u00B2", "3": "\u00B3", "4": "\u2074", "5": "\u2075", "6": "\u2076", "7": "\u2077", "8": "\u2078", "9": "\u2079", "-": "\u207B" };
    function pow10(e) { return e === 0 ? "1" : "10" + String(e).split("").map(function (c) { return SUP[c]; }).join(""); }

    function draw() {
      drawLegend();
      var C = DI.colors(), W = Math.max(300, Math.round(body.clientWidth)), H = 300, M = { l: 46, r: 14, t: 14, b: 40 };
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      var keep = svg.firstChild; clear(svg); svg.appendChild(keep);
      var X0 = 0, X1 = Math.log10(1500), E0 = -10, E1 = 0;
      function sx(i) { return M.l + (Math.log10(i) - X0) / (X1 - X0) * (W - M.l - M.r); }
      function sy(v) { return M.t + (E1 - Math.max(E0, Math.log10(Math.max(v, 1e-12)))) / (E1 - E0) * (H - M.t - M.b); }
      for (var e = E0; e <= E1; e += 2) {
        DI.svg("line", { x1: M.l, x2: W - M.r, y1: sy(Math.pow(10, e)), y2: sy(Math.pow(10, e)), class: e === E0 ? "di-svg-axis" : "di-svg-grid" }, svg);
        DI.svg("text", { x: M.l - 8, y: sy(Math.pow(10, e)) + 4, "text-anchor": "end", class: "di-svg-label" }, svg).textContent = pow10(e);
      }
      [1, 10, 100, 1000].forEach(function (i) {
        DI.svg("text", { x: sx(i), y: H - M.b + 16, "text-anchor": "middle", class: "di-svg-label" }, svg).textContent = i;
      });
      DI.svg("text", { x: W - M.r, y: H - 4, "text-anchor": "end", class: "di-svg-label" }, svg).textContent = "index of the eigenvalue";
      var data = SPECTRA[String(st.n)];
      SERIES.forEach(function (s) {
        var pts = data[s.key].map(function (p) { return [sx(p[0]), sy(p[1])]; });
        DI.svg("path", { d: path(pts), stroke: C[s.color], class: "di-svg-series" + (s.dash ? " di-svg-dashed" : "") + (s.key === "max" ? " di-svg-thick" : "") }, svg);
      });
      cross = DI.svg("line", { class: "di-svg-crosshair", y1: M.t, y2: H - M.b }, svg);
      geo = { sx: sx, M: M, W: W, X0: X0, X1: X1, data: data, C: C };
    }

    function at(series, i) {
      var best = series[0];
      series.forEach(function (p) { if (Math.abs(Math.log(p[0] / i)) < Math.abs(Math.log(best[0] / i))) best = p; });
      return best;
    }
    svg.addEventListener("pointermove", function (e) {
      if (!geo) return;
      var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * geo.W / r.width;
      var i = Math.pow(10, geo.X0 + (x - geo.M.l) / (geo.W - geo.M.l - geo.M.r) * (geo.X1 - geo.X0));
      i = Math.max(1, Math.min(1500, i));
      var ref = at(geo.data.max, i);
      cross.setAttribute("x1", geo.sx(ref[0])); cross.setAttribute("x2", geo.sx(ref[0])); cross.style.display = "block";
      var p = DI.pointer(e, body);
      tip.show(p.x, p.y, [{ value: "eigenvalue #" + ref[0], label: "" }].concat(SERIES.map(function (s) {
        return { value: at(geo.data[s.key], ref[0])[1].toExponential(1), label: s.label, color: geo.C[s.color] };
      })));
    });
    svg.addEventListener("pointerleave", function () { if (cross) cross.style.display = "none"; tip.hide(); });
    DI.onTheme(draw);
    DI.onResize(draw);
    draw();
  });

  /* 11. Rotations without mirrors: gluing the wedge into a cone ------------- */

  DI.mount("cone", function (body) {
    var BETA = Math.PI / 2, NRr = 12, NT = 22, TILT = 0.95;
    var X = [0.72, 0.13], XP = [0.62, BETA - 0.11];   // (radius, angle) inside the quarter disc
    var st = { s: 0, anim: null };

    var layout = DI.el("div", "di-split", body);
    var stage = DI.el("div", "di-stage", layout);
    var canvas = DI.canvas(stage, 1);
    canvas.setAttribute("aria-label", "A quarter of the disc whose two straight edges are glued together, forming a cone.");
    var side = DI.el("div", "di-side", layout);
    var bar = DI.toolbar(side);
    var slider = DI.slider(bar, "Glue the edges", { min: 0, max: 1, step: 0.005, value: 0, format: function (v) { return Math.round(v * 100) + "%"; } },
      function (v) { stop(); st.s = v; draw(); });
    var actions = DI.el("div", "di-actions", side);
    var play = DI.button(actions, "Glue", function () { animate(st.s < 0.5 ? 1 : 0); }, true);
    var stats = DI.stats(side, [
      { key: "inside", label: "Distance inside the wedge" },
      { key: "orbit", label: "Distance between orbits" }
    ]);
    var hint = DI.el("p", "di-hint", side);

    // the rolled position of the wedge point (r, theta): azimuth stretched, radius shrunk, apex lifted
    function roll(r, t, s) {
      var e = DI.ease(s), g = BETA + e * (TAU - BETA), k = BETA / g;
      // the wedge opens upward from its apex, and the glued seam ends up facing the viewer
      var phi = t / k - g / 2 + Math.PI / 2;
      return [r * k * Math.cos(phi), r * k * Math.sin(phi), r * Math.sqrt(Math.max(0, 1 - k * k))];
    }
    function project(p, s, view) {
      var tau = TILT * DI.ease(s), c = Math.cos(tau), sn = Math.sin(tau);
      var sy = p[1] * c + p[2] * sn, depth = -p[1] * sn + p[2] * c;
      return { x: view.cx + p[0] * view.k, y: view.cy - sy * view.k, d: depth };
    }

    function draw() {
      var f = DI.fit(canvas), ctx = f.ctx, C = DI.colors(), s = st.s, dark = DI.isDark();
      ctx.clearRect(0, 0, f.w, f.h);
      var e = DI.ease(s), view = { k: f.w * (0.6 + 0.12 * e), cx: f.w / 2, cy: f.h * 0.88 };
      var quads = [], i, j;
      for (i = 0; i < NRr; i++) for (j = 0; j < NT; j++) {
        var r0 = i / NRr, r1 = (i + 1) / NRr, t0 = BETA * j / NT, t1 = BETA * (j + 1) / NT;
        var P = [roll(r0, t0, s), roll(r1, t0, s), roll(r1, t1, s), roll(r0, t1, s)];
        var Q = P.map(function (p) { return project(p, s, view); });
        // a little light, from the normal of the facet
        var ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2];
        var vx = P[3][0] - P[0][0], vy = P[3][1] - P[0][1], vz = P[3][2] - P[0][2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, nn = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        var lit = Math.abs((nx * -0.3 + ny * -0.5 + nz * 0.8) / nn);
        quads.push({ Q: Q, d: (Q[0].d + Q[1].d + Q[2].d + Q[3].d) / 4, lit: lit, ring: i, col: j });
      }
      quads.sort(function (a, b) { return a.d - b.d; });
      quads.forEach(function (q) {
        ctx.beginPath();
        q.Q.forEach(function (p, k) { if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        ctx.closePath();
        var v = dark ? 52 + 30 * q.lit : 214 + 30 * q.lit;
        ctx.fillStyle = "rgb(" + Math.round(v) + "," + Math.round(v) + "," + Math.round(v + (dark ? 4 : 2)) + ")";
        ctx.strokeStyle = dark ? "rgba(255,255,255,0.08)" : "rgba(27,29,34,0.08)";
        ctx.lineWidth = 0.75;
        ctx.fill(); ctx.stroke();
      });

      // the two straight edges, which are glued
      function curve(fn, n) {
        var pts = [];
        for (var k = 0; k <= n; k++) pts.push(fn(k / n));
        return pts.map(function (p) { return project(p, s, view); });
      }
      function stroke(pts, color, w, dash) {
        ctx.save();
        ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = "round";
        if (dash) ctx.setLineDash(dash);
        ctx.beginPath();
        pts.forEach(function (p, k) { if (k) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        ctx.stroke();
        ctx.restore();
      }
      stroke(curve(function (u) { return roll(u, 0, s); }, 12), C.accent, 2.5);
      stroke(curve(function (u) { return roll(u, BETA, s); }, 12), C.accent, 2.5);

      // inside the wedge, the long way round; across the glued edge, the short way
      function cart(p) { return [p[0] * Math.cos(p[1]), p[0] * Math.sin(p[1])]; }
      var a = cart(X), b = cart([XP[0], XP[1] - BETA]);  // the copy of x' rotated back across the edge
      var tc = a[1] / (a[1] - b[1]), cross = [a[0] + (b[0] - a[0]) * tc, 0];
      function polar(q) { return [Math.hypot(q[0], q[1]), Math.atan2(q[1], q[0])]; }
      function seg(p, q) {
        return curve(function (u) { var z = polar([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]); return roll(z[0], z[1], s); }, 30);
      }
      var bIn = cart(XP), bc = [cross[0] * Math.cos(BETA), cross[0] * Math.sin(BETA)];
      stroke(seg(a, bIn), C.muted, 1.5, [2, 4]);
      stroke(seg(a, cross), C.max, 3);
      stroke(seg(bc, bIn), C.max, 3);

      var pa = project(roll(X[0], X[1], s), s, view), pb = project(roll(XP[0], XP[1], s), s, view);
      DI.dot(ctx, pa.x, pa.y, 5.5, C.ink, C.surface);
      DI.square(ctx, pb.x, pb.y, 5, C.ink, C.surface);
      DI.label(ctx, pa.x + 9, pa.y + 4, "x", C, { family: "Newsreader, Georgia, serif", weight: "italic 500", size: 16 });
      DI.label(ctx, pb.x + 9, pb.y + 4, "x\u2032", C, { family: "Newsreader, Georgia, serif", weight: "italic 500", size: 16 });

      var ai = cart(X), bi = cart(XP);
      stats.inside.textContent = DI.fmt(Math.hypot(ai[0] - bi[0], ai[1] - bi[1]));
      stats.orbit.textContent = DI.fmt(Math.hypot(a[0] - b[0], a[1] - b[1]));
      play.textContent = st.s < 0.5 ? "Glue" : "Unglue";
      hint.textContent = s < 0.05 ?
        "A quarter of the disc holds one copy of every point under rotations by 90\u00B0. Its two blue edges are copies of each other: the short way from x to x\u2032 (green) leaves through one and comes back through the other." :
        s > 0.95 ? "Glued, the quarter disc becomes a cone, and the short way from x to x\u2032 is one unbroken path. A cone cannot be flattened without tearing, so no fold turns these distances into ordinary ones." :
          "Gluing\u2026";
    }

    function stop() { if (st.anim) { cancelAnimationFrame(st.anim); st.anim = null; } }
    function animate(to) {
      stop();
      var from = st.s, t0 = null, dur = 1800 * Math.abs(to - from) + 1;
      function tick(ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur);
        st.s = from + (to - from) * k;
        slider.set(st.s);
        draw();
        st.anim = k < 1 ? requestAnimationFrame(tick) : null;
      }
      st.anim = requestAnimationFrame(tick);
    }

    DI.onTheme(draw);
    DI.onResize(draw);
    draw();
  });

  /* 12. The max kernel, its projection k+, and where they differ ------------ */

  DI.mount("projection", function (body) {
    var L = 0.25, M = 90, NMAX = 150;
    var st = { g: "rot", n: 60, seed: 4, x0: [0.55, 0.25], drag: false };
    var D = null, P = null, G = null, Kdx = null, pix = null, raf = null;
    var heat = [DI.heatCanvas(M), DI.heatCanvas(M), DI.heatCanvas(M)];

    var bar = DI.toolbar(body);
    DI.segmented(bar, "Group", [{ value: "rot", label: "Rotations by 90\u00B0" }, { value: "mir", label: "Plus mirrors" }], st.g,
      function (v) { st.g = v; rebuild(); });
    DI.slider(bar, "Data points", { min: 20, max: NMAX, step: 10, value: st.n, format: function (v) { return String(v); } },
      function (v) { st.n = v; rebuild(); });
    var actions = DI.el("div", "di-actions", bar);
    DI.button(actions, "New data", function () { st.seed += 1; rebuild(); });

    var trio = DI.el("div", "di-trio", body);
    var specs = [
      { key: "max", title: "Max kernel" },
      { key: "plus", title: "Projected kernel" },
      { key: "diff", title: "Max minus projected" }
    ];
    var panels = specs.map(function (d) {
      var col = DI.el("div", "di-trio-col", trio);
      DI.el("div", "di-panel-title", col, d.title);
      var c = DI.canvas(col, 1, "di-draggable");
      c.setAttribute("aria-label", d.title + ". Drag to move the reference point x0.");
      var read = DI.el("div", "di-readout", col);
      return { key: d.key, canvas: c, read: read };
    });
    var scales = DI.el("div", "di-scales", body);
    var sc1 = DI.el("div", "di-scale", scales), sc2 = DI.el("div", "di-scale", scales);
    DI.el("span", null, sc1, "0");
    var grad1 = DI.el("span", "di-scale-bar", sc1);
    DI.el("span", null, sc1, "1");
    var lo2 = DI.el("span", null, sc2, "");
    var grad2 = DI.el("span", "di-scale-bar", sc2);
    var hi2 = DI.el("span", null, sc2, "");
    var stats = DI.stats(body, [
      { key: "neg", label: "Negative eigenvalues set to zero" },
      { key: "gap", label: "Largest gap on the disc" },
      { key: "data", label: "Largest gap at the data" }
    ]);

    // pixel centres inside the disc, computed once
    pix = [];
    for (var i = 0; i < M; i++) for (var j = 0; j < M; j++) {
      var x = -1 + 2 * (j + 0.5) / M, y = 1 - 2 * (i + 0.5) / M;
      pix.push(x * x + y * y <= 1.06 ? [x, y] : null);
    }

    function points(seed) {
      var rnd = SYM.rng(seed), out = [];
      for (var k = 0; k < NMAX; k++) { var r = Math.sqrt(rnd()), t = TAU * rnd(); out.push([r * Math.cos(t), r * Math.sin(t)]); }
      return out;
    }

    function rebuild() {
      G = st.g === "rot" ? SYM.cyclic(4) : SYM.group(4);
      D = points(st.seed).slice(0, st.n);
      P = new SYM.Projected(D, G, L);
      // k_max between every data point and every pixel, so that moving x0 only costs a weighted sum
      Kdx = new Float32Array(st.n * pix.length);
      for (var q = 0; q < pix.length; q++) {
        if (!pix[q]) continue;
        for (var k = 0; k < st.n; k++) Kdx[k * pix.length + q] = SYM.kMaxG(D[k], pix[q], G, L);
      }
      draw();
    }

    function render() { if (!raf) raf = requestAnimationFrame(function () { raf = null; draw(); }); }

    function draw() {
      var C = DI.colors(), n = st.n, NP = pix.length, w = P.weights(st.x0);
      var vMax = new Float64Array(NP), vPlus = new Float64Array(NP), gap = 0, q, k;
      for (q = 0; q < NP; q++) {
        if (!pix[q]) { vMax[q] = vPlus[q] = NaN; continue; }
        var s = 0;
        for (k = 0; k < n; k++) s += w[k] * Kdx[k * NP + q];
        vMax[q] = SYM.kMaxG(st.x0, pix[q], G, L);
        vPlus[q] = s;
        if (pix[q][0] * pix[q][0] + pix[q][1] * pix[q][1] <= 1) gap = Math.max(gap, Math.abs(vMax[q] - s));
      }
      var atData = 0;
      for (var a = 0; a < n; a++) {
        var kp = 0;
        for (k = 0; k < n; k++) kp += w[k] * SYM.kMaxG(D[k], D[a], G, L);
        atData = Math.max(atData, Math.abs(SYM.kMaxG(st.x0, D[a], G, L) - kp));
      }
      // a symmetric colour range for the difference, in round steps
      var R = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].filter(function (r) { return r >= gap; })[0] || 1;
      var lutB = DI.lut(DI.ramp("blue")), lutD = DI.lut(DI.ramp("div"));
      var A = new Float64Array(NP), B = new Float64Array(NP), Dd = new Float64Array(NP);
      for (q = 0; q < NP; q++) {
        A[q] = vMax[q]; B[q] = vPlus[q];
        Dd[q] = vMax[q] === vMax[q] ? 0.5 + 0.5 * Math.max(-1, Math.min(1, (vMax[q] - vPlus[q]) / R)) : NaN;
      }
      var imgs = [heat[0].put(A, lutB), heat[1].put(B, lutB), heat[2].put(Dd, lutD)];
      var orbit = SYM.orbit(G, st.x0[0], st.x0[1]);
      panels.forEach(function (pn, idx) {
        var f = DI.fit(pn.canvas), ctx = f.ctx, map = UI.discMapper(f.w, f.h, 3);
        ctx.clearRect(0, 0, f.w, f.h);
        UI.drawDiscImage(ctx, imgs[idx], map);
        UI.strokeDisc(ctx, map, C.rule);
        ctx.save();
        ctx.fillStyle = C.ink; ctx.globalAlpha = 0.75;
        D.forEach(function (p) { var s2 = map.px(p[0], p[1]); ctx.beginPath(); ctx.arc(s2[0], s2[1], 1.6, 0, TAU); ctx.fill(); });
        ctx.restore();
        orbit.forEach(function (o, k2) {
          if (!k2) return;
          var s3 = map.px(o[0], o[1]); DI.ring(ctx, s3[0], s3[1], 4, C.ink, C.surface);
        });
        var s0 = map.px(st.x0[0], st.x0[1]);
        DI.dot(ctx, s0[0], s0[1], 4.5, C.ink, C.surface);
      });
      var kpx0 = 0;
      for (k = 0; k < n; k++) kpx0 += w[k] * SYM.kMaxG(D[k], st.x0, G, L);
      panels[0].read.textContent = "at x\u2080 and its copies 1.00";
      panels[1].read.textContent = "at x\u2080 " + DI.fmt(kpx0);
      panels[2].read.textContent = "colors span \u00B1" + R;
      var sB = [], sD = [], rb = DI.ramp("blue"), rd = DI.ramp("div");
      for (var t = 0; t <= 8; t++) { sB.push(DI.rgb(rb(t / 8))); sD.push(DI.rgb(rd(t / 8))); }
      grad1.style.background = "linear-gradient(90deg," + sB.join(",") + ")";
      grad2.style.background = "linear-gradient(90deg," + sD.join(",") + ")";
      lo2.textContent = "\u2212" + R; hi2.textContent = "+" + R;
      stats.neg.textContent = P.negative + " of " + n;
      stats.gap.textContent = DI.fmt(gap);
      stats.data.textContent = DI.fmt(atData);
    }

    panels.forEach(function (pn) {
      function move(e) {
        var map = UI.discMapper(pn.canvas.clientWidth, pn.canvas.clientHeight, 3), p = DI.pointer(e, pn.canvas);
        st.x0 = UI.clampDisc(map.inv(p.x, p.y), 0.97);
        render();
      }
      pn.canvas.addEventListener("pointerdown", function (e) { st.drag = true; pn.canvas.setPointerCapture(e.pointerId); move(e); });
      pn.canvas.addEventListener("pointermove", function (e) { if (st.drag) move(e); });
      pn.canvas.addEventListener("pointerup", function () { st.drag = false; });
    });

    DI.onTheme(render);
    DI.onResize(render);
    rebuild();
  });
})(window);
