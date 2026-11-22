/*
 * Docta Ignorantia: widgets for "Symmetries as an inductive bias", part 1
 * (echoes, a symmetric 1D primer, orbit pairs, kernel fields, folding, two invariant priors).
 * Requires core.js, gp.js and symmetry.js. ES5 only: the Docker build minifies JS with uglifier.
 */
(function (root) {
  "use strict";

  var DI = root.DI, SYM = DI.sym, UI = SYM.ui, TAU = SYM.TAU;
  var MIRRORS = [1, 2, 3, 4, 6, 8].map(function (v) { return { value: v, label: String(v) }; });
  var GROUPS = [2, 3, 4, 6].map(function (v) { return { value: v, label: String(v) }; })
    .concat([{ value: Infinity, label: "\u221E" }]);

  function path(pts) {
    return pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  /* 0. Twins: two antennas, and what their labels do to the search space */

  DI.mount("wifi", function (body) {
    var users = SYM.wifiUsers(5), N = 81, RMAX = 260, GW = 150, GH = 46, HALF = SYM.WIFI.half;
    var st = { p: [0.3, 0.62], drag: null, anim: null, from: null, e: 0 };

    // the landscape over the search space (position of antenna 1, position of antenna 2), once
    var land = new Float64Array(N * N), lo = Infinity, hi = -Infinity, i, j;
    for (i = 0; i < N; i++) for (j = 0; j < N; j++) {
      var v = SYM.wifiThroughput(users, j / (N - 1), 1 - i / (N - 1));
      land[i * N + j] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
    }
    var landImg = null, floorOff = document.createElement("canvas");
    floorOff.width = GW; floorOff.height = GH;

    var floorWrap = DI.el("div", "di-floor", body);
    DI.el("div", "di-panel-title", floorWrap, "The corridor");
    var floor = DI.canvas(floorWrap, 3.3, "di-draggable");
    floor.setAttribute("aria-label", "A corridor of offices with sixteen users and two antennas, numbered 1 and 2. Drag the antennas.");
    var layout = DI.el("div", "di-split", body);
    var stage = DI.el("div", "di-stage", layout);
    DI.el("div", "di-panel-title", stage, "The search space");
    var square = DI.canvas(stage, 1, "di-draggable");
    square.setAttribute("aria-label", "Total throughput for every pair of positions of antennas 1 and 2, with the current design and its relabelled twin.");
    var side = DI.el("div", "di-side", layout);
    var stats = DI.stats(side, [
      { key: "x", label: "Design x" },
      { key: "twin", label: "Labels swapped" },
      { key: "f", label: "Total throughput" }
    ]);
    var actions = DI.el("div", "di-actions", side);
    DI.button(actions, "Swap the labels", swap, true);
    var hint = DI.el("p", "di-hint", side);
    hint.textContent = "Drag the antennas along the corridor, or the dot in the square. Swapping the labels sends the design " +
      "across the diagonal: a different point of the search space, the same network, the same throughput.";
    var tip = DI.tooltip(body);

    function clampP(v) { return Math.max(0.02, Math.min(0.98, v)); }

    function floorMap(w, h) {
      var pad = w < 600 ? 6 : 12, s = Math.min((w - 2 * pad) / 1, (h - 2 * pad) / (2 * HALF));
      var ox = (w - s) / 2, oy = h / 2;
      return {
        s: s, ox: ox, oy: oy,
        px: function (x, y) { return [ox + x * s, oy - y * s]; },
        inv: function (X) { return (X - ox) / s; }
      };
    }

    function squareMap(w, h) {
      var padL = 30, padB = 34, padT = 10, padR = 12, S = Math.min(w - padL - padR, h - padT - padB);
      var ox = padL + (w - padL - padR - S) / 2, oy = padT;
      return {
        S: S, ox: ox, oy: oy,
        px: function (p1, p2) { return [ox + p1 * S, oy + (1 - p2) * S]; },
        inv: function (X, Y) { return [(X - ox) / S, 1 - (Y - oy) / S]; }
      };
    }

    // positions and labels, during a swap the labels cross-fade while the antennas stay put
    function shown() {
      if (!st.from) return { pos: st.p, e: 0 };
      return { pos: st.from, e: st.e };
    }

    function drawFloor() {
      // on narrow screens a slightly taller canvas lets the corridor use the full width
      var narrow = floor.clientWidth < 600;
      floor._aspect = narrow ? 2.75 : 3.3;
      var f = DI.fit(floor), ctx = f.ctx, C = DI.colors(), m = floorMap(f.w, f.h), sh = shown(), P = sh.pos;
      ctx.clearRect(0, 0, f.w, f.h);
      // shading: the data rate a user would get at each spot, before sharing airtime
      var octx = floorOff.getContext("2d"), img = octx.createImageData(GW, GH), ramp = DI.ramp("blue");
      for (var a = 0; a < GH; a++) for (var b = 0; b < GW; b++) {
        var x = (b + 0.5) / GW, y = HALF - 2 * HALF * (a + 0.5) / GH, c = ramp(SYM.wifiLink(x, y, P[0], P[1]).rate / RMAX), k = 4 * (a * GW + b);
        img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 255;
      }
      octx.putImageData(img, 0, 0);
      var tl = m.px(0, HALF), br = m.px(1, -HALF), rr = 8;
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1], rr); else ctx.rect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
      ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(floorOff, tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
      ctx.restore();
      // office partitions along both walls
      ctx.save();
      ctx.strokeStyle = UI.faint(); ctx.lineWidth = 1;
      for (var q = 1; q < 8; q++) {
        var top = m.px(q / 8, HALF), bot = m.px(q / 8, -HALF);
        ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.lineTo(top[0], top[1] + 0.05 * m.s);
        ctx.moveTo(bot[0], bot[1]); ctx.lineTo(bot[0], bot[1] - 0.05 * m.s); ctx.stroke();
      }
      ctx.strokeStyle = C.rule;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1], rr); else ctx.rect(tl[0], tl[1], br[0] - tl[0], br[1] - tl[1]);
      ctx.stroke();
      ctx.restore();
      // who is served by whom
      var aps = [m.px(P[0], 0), m.px(P[1], 0)];
      ctx.save();
      ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.3; ctx.lineWidth = 1;
      users.forEach(function (u) {
        var l = SYM.wifiLink(u[0], u[1], P[0], P[1]), s = m.px(u[0], u[1]);
        ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(aps[l.ap][0], aps[l.ap][1]); ctx.stroke();
      });
      ctx.restore();
      users.forEach(function (u) { var s = m.px(u[0], u[1]); DI.dot(ctx, s[0], s[1], 3, C.ink, C.surface); });
      aps.forEach(function (s, k) {
        DI.dot(ctx, s[0], s[1], narrow ? 9 : 11, C.ink, C.surface);
        ctx.save();
        ctx.font = "600 " + (narrow ? 11 : 12) + "px Roboto, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = C.surface;
        ctx.globalAlpha = 1 - sh.e; ctx.fillText(String(k + 1), s[0], s[1] + 0.5);
        ctx.globalAlpha = sh.e; ctx.fillText(String(2 - k), s[0], s[1] + 0.5);
        ctx.restore();
      });
    }

    function drawSquare() {
      var f = DI.fit(square), ctx = f.ctx, C = DI.colors(), m = squareMap(f.w, f.h);
      ctx.clearRect(0, 0, f.w, f.h);
      if (!landImg) {
        var vals = new Float64Array(N * N);
        for (var k = 0; k < N * N; k++) vals[k] = (land[k] - lo) / (hi - lo);
        landImg = DI.heatImage(vals, N, DI.ramp("blue"));
      }
      var cell = m.S / (N - 1);
      ctx.save();
      ctx.beginPath(); ctx.rect(m.ox, m.oy, m.S, m.S); ctx.clip();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(landImg, m.ox - cell / 2, m.oy - cell / 2, m.S + cell, m.S + cell);
      ctx.restore();
      ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.strokeRect(m.ox, m.oy, m.S, m.S);
      // the mirror: swapping the labels reflects every design across the diagonal
      var d0 = m.px(0, 0), d1 = m.px(1, 1);
      ctx.save();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(d0[0], d0[1]); ctx.lineTo(d1[0], d1[1]); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.translate(m.ox + 0.8 * m.S, m.oy + 0.2 * m.S); ctx.rotate(-Math.PI / 4);
      DI.label(ctx, 0, -6, "same position", C, { align: "center", weight: "500", size: 11, color: C.muted });
      ctx.restore();
      // axes
      ctx.save();
      ctx.font = "11px Roboto, sans-serif"; ctx.fillStyle = C.muted; ctx.textAlign = "center";
      ctx.fillText("0", m.ox, m.oy + m.S + 14); ctx.fillText("1", m.ox + m.S, m.oy + m.S + 14);
      ctx.fillText("position of antenna 1", m.ox + m.S / 2, m.oy + m.S + 28);
      ctx.textAlign = "right"; ctx.fillText("0", m.ox - 6, m.oy + m.S); ctx.fillText("1", m.ox - 6, m.oy + 9);
      ctx.translate(m.ox - 12, m.oy + m.S / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = "center";
      ctx.fillText("position of antenna 2", 0, 0);
      ctx.restore();
      // the design and its twin
      var a = st.from || st.p, e = st.from ? st.e : 0;
      var pt = [a[0] + (a[1] - a[0]) * e, a[1] + (a[0] - a[1]) * e], tw = [a[1] + (a[0] - a[1]) * e, a[0] + (a[1] - a[0]) * e];
      var sp = m.px(pt[0], pt[1]), st2 = m.px(tw[0], tw[1]);
      ctx.save();
      ctx.setLineDash([2, 4]); ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.25;
      ctx.beginPath(); ctx.moveTo(sp[0], sp[1]); ctx.lineTo(st2[0], st2[1]); ctx.stroke();
      ctx.restore();
      DI.ring(ctx, st2[0], st2[1], 6, C.ink, C.surface);
      DI.dot(ctx, sp[0], sp[1], 6, C.ink, C.surface);
      DI.label(ctx, sp[0] + 10, sp[1] - 9, "x", C, { family: "Newsreader, Georgia, serif", weight: "italic 500", size: 16 });
      DI.label(ctx, st2[0] + 10, st2[1] - 9, "swapped", C, { weight: "500", size: 11 });
    }

    function readouts() {
      var p = st.p;
      stats.x.textContent = "(" + DI.fmt(p[0]) + ", " + DI.fmt(p[1]) + ")";
      stats.twin.textContent = "(" + DI.fmt(p[1]) + ", " + DI.fmt(p[0]) + ")";
      stats.f.textContent = Math.round(SYM.wifiThroughput(users, p[0], p[1])) + " Mbit/s";
    }

    function draw() { drawFloor(); drawSquare(); readouts(); }

    function swap() {
      if (st.anim) return;
      st.from = st.p.slice();
      var t0 = null, dur = DI.reducedMotion() ? 1 : 750;
      function tick(ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur);
        st.e = DI.ease(k);
        if (k >= 1) { st.p = [st.from[1], st.from[0]]; st.from = null; st.anim = null; st.e = 0; draw(); return; }
        drawFloor(); drawSquare();
        st.anim = requestAnimationFrame(tick);
      }
      st.anim = requestAnimationFrame(tick);
    }

    floor.addEventListener("pointerdown", function (e) {
      if (st.anim) return;
      var m = floorMap(floor.clientWidth, floor.clientHeight), p = DI.pointer(e, floor);
      var d = st.p.map(function (v) { var s = m.px(v, 0); return Math.hypot(p.x - s[0], p.y - s[1]); });
      var k = d[0] <= d[1] ? 0 : 1;
      if (d[k] > 30) return;
      st.drag = { where: "floor", k: k };
      floor.setPointerCapture(e.pointerId);
    });
    floor.addEventListener("pointermove", function (e) {
      if (!st.drag || st.drag.where !== "floor") return;
      var m = floorMap(floor.clientWidth, floor.clientHeight), p = DI.pointer(e, floor);
      st.p[st.drag.k] = clampP(m.inv(p.x));
      draw();
    });
    square.addEventListener("pointerdown", function (e) {
      if (st.anim) return;
      var m = squareMap(square.clientWidth, square.clientHeight), p = DI.pointer(e, square), q = m.inv(p.x, p.y);
      if (q[0] < -0.05 || q[0] > 1.05 || q[1] < -0.05 || q[1] > 1.05) return;
      st.drag = { where: "square" };
      square.setPointerCapture(e.pointerId);
      st.p = [clampP(q[0]), clampP(q[1])];
      tip.hide();
      draw();
    });
    square.addEventListener("pointermove", function (e) {
      var m = squareMap(square.clientWidth, square.clientHeight), p = DI.pointer(e, square), q = m.inv(p.x, p.y);
      if (st.drag && st.drag.where === "square") { st.p = [clampP(q[0]), clampP(q[1])]; draw(); return; }
      if (q[0] < 0 || q[0] > 1 || q[1] < 0 || q[1] > 1) { tip.hide(); return; }
      var bp = DI.pointer(e, body);
      tip.show(bp.x, bp.y, [
        { value: Math.round(SYM.wifiThroughput(users, q[0], q[1])) + " Mbit/s", label: "total throughput" },
        { value: "(" + DI.fmt(q[0]) + ", " + DI.fmt(q[1]) + ")", label: "positions of 1 and 2" }
      ]);
    });
    square.addEventListener("pointerleave", function () { tip.hide(); });
    function release() { st.drag = null; }
    floor.addEventListener("pointerup", release);
    square.addEventListener("pointerup", release);

    DI.onTheme(function () { landImg = null; draw(); });
    DI.onResize(draw);
    draw();
  });

  /* 1. Echoes: hunt for the peak, with and without the symmetry -------- */

  DI.mount("echoes", function (body) {
    var BUDGET = 6, REVEAL = 0.15;
    var st = { n: 4, use: false, evals: [], discs: [], all: false, hover: null };
    var img = null;

    var layout = DI.el("div", "di-split", body);
    var stage = DI.el("div", "di-stage", layout);
    var canvas = DI.canvas(stage, 1, "di-clickable");
    canvas.setAttribute("aria-label", "A hidden landscape on a disc. Click to evaluate it at a point.");
    var side = DI.el("div", "di-side", layout);

    var bar = DI.toolbar(side);
    DI.segmented(bar, "Mirrors", MIRRORS, st.n, function (v) { st.n = v; img = null; reset(); });
    DI.toggle(bar, "Use the symmetry", st.use, function (v) { st.use = v; reset(); });

    var stats = DI.stats(side, [
      { key: "evals", label: "Evaluations" },
      { key: "area", label: "Area seen" },
      { key: "best", label: "Best value" }
    ]);
    var hint = DI.el("p", "di-hint", side);
    var actions = DI.el("div", "di-actions", side);
    DI.button(actions, "Reveal the landscape", function () { st.all = true; draw(); });
    DI.button(actions, "Start over", reset);

    function reset() { st.evals = []; st.discs = []; st.all = false; st.area = 0; draw(); }

    function areaSeen() {
      if (!st.discs.length) return 0;
      var m = 90, hit = 0, tot = 0;
      for (var i = 0; i < m; i++) {
        for (var j = 0; j < m; j++) {
          var x = -1 + 2 * (j + 0.5) / m, y = -1 + 2 * (i + 0.5) / m;
          if (x * x + y * y > 1) continue;
          tot++;
          for (var k = 0; k < st.discs.length; k++) {
            var dx = x - st.discs[k][0], dy = y - st.discs[k][1];
            if (dx * dx + dy * dy <= REVEAL * REVEAL) { hit++; break; }
          }
        }
      }
      return hit / tot;
    }

    function draw() {
      var f = DI.fit(canvas), ctx = f.ctx, C = DI.colors(), map = UI.discMapper(f.w, f.h, 4);
      if (!img) img = UI.landscapeImage(st.n, 160, DI.ramp("blue"));
      ctx.clearRect(0, 0, f.w, f.h);

      ctx.beginPath();
      ctx.arc(map.cx, map.cy, map.rad, 0, TAU);
      ctx.fillStyle = DI.isDark() ? "#2c2d31" : "#e8e8e4";
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      if (st.all) ctx.arc(map.cx, map.cy, map.rad, 0, TAU);
      st.discs.forEach(function (d) {
        var p = map.px(d[0], d[1]);
        ctx.moveTo(p[0] + REVEAL * map.rad, p[1]);
        ctx.arc(p[0], p[1], REVEAL * map.rad, 0, TAU);
      });
      ctx.clip();
      UI.drawDiscImage(ctx, img, map);
      ctx.restore();

      if (st.use) UI.mirrorLines(ctx, map, st.n, C.rule);
      UI.strokeDisc(ctx, map, C.rule);

      if (st.all) {
        SYM.peaks(st.n).forEach(function (q) { var p = map.px(q[0], q[1]); DI.ring(ctx, p[0], p[1], 7, C.ink, C.surface); });
      }
      var G = SYM.group(st.n);
      st.evals.forEach(function (q) {
        if (st.use) SYM.orbit(G, q[0], q[1]).forEach(function (o) {
          var p = map.px(o[0], o[1]); DI.ring(ctx, p[0], p[1], 4, C.ink, C.surface);
        });
        var p = map.px(q[0], q[1]);
        DI.dot(ctx, p[0], p[1], 4.5, C.ink, C.surface);
      });

      if (st.hover && !st.all && st.evals.length < BUDGET) {
        ctx.save();
        ctx.setLineDash([3, 4]);
        ctx.lineWidth = 1.25;
        ctx.strokeStyle = C.ink;
        ctx.globalAlpha = 0.55;
        var pts = st.use ? SYM.orbit(G, st.hover[0], st.hover[1]) : [st.hover];
        pts.forEach(function (o) {
          var p = map.px(o[0], o[1]);
          ctx.beginPath();
          ctx.arc(p[0], p[1], REVEAL * map.rad, 0, TAU);
          ctx.stroke();
        });
        ctx.restore();
      }

      var best = st.evals.reduce(function (b, q) { return Math.max(b, SYM.objective(q[0], q[1], st.n)); }, -Infinity);
      stats.evals.textContent = st.evals.length + " / " + BUDGET;
      stats.area.textContent = Math.round(100 * (st.area || 0)) + "%";
      stats.best.textContent = st.evals.length ? DI.fmt(best) : "\u2013";
      if (st.all || st.evals.length >= BUDGET) {
        hint.textContent = "The peak is 1.00, reached at " + (2 * st.n) + " places (circled). Your best: " +
          (st.evals.length ? DI.fmt(best) : "none") + ".";
      } else if (st.use) {
        hint.textContent = "Each evaluation is repeated across the " + st.n + " mirror" + (st.n > 1 ? "s" : "") +
          ": one click uncovers " + (2 * st.n) + " regions.";
      } else {
        hint.textContent = "Click anywhere on the disc to evaluate the landscape there.";
      }
    }

    canvas.addEventListener("pointermove", function (e) {
      var map = UI.discMapper(canvas.clientWidth, canvas.clientHeight, 4);
      var p = DI.pointer(e, canvas), q = map.inv(p.x, p.y);
      st.hover = q[0] * q[0] + q[1] * q[1] <= 1 ? q : null;
      draw();
    });
    canvas.addEventListener("pointerleave", function () { st.hover = null; draw(); });
    canvas.addEventListener("click", function (e) {
      if (st.all || st.evals.length >= BUDGET) return;
      var map = UI.discMapper(canvas.clientWidth, canvas.clientHeight, 4);
      var p = DI.pointer(e, canvas), q = map.inv(p.x, p.y);
      if (q[0] * q[0] + q[1] * q[1] > 1) return;
      st.evals.push(q);
      var pts = st.use ? SYM.orbit(SYM.group(st.n), q[0], q[1]) : [q];
      st.discs = st.discs.concat(pts);
      st.area = areaSeen();
      draw();
    });

    DI.onTheme(function () { img = null; draw(); });
    DI.onResize(draw);
    draw();
  });

  /* 2. Bayesian optimisation on a mirror-symmetric function -------------- */

  DI.mount("bo-primer", function (body) {
    var L = 0.07, S2 = 0.2, NOISE = 1e-5, BUDGET = 24, START = [0.33, 0.56];
    function g(x) {
      return 0.5 * Math.exp(-(x - 0.18) * (x - 0.18) / (2 * 0.05 * 0.05)) +
        0.95 * Math.exp(-(x - 0.7) * (x - 0.7) / (2 * 0.035 * 0.035)) +
        0.3 * Math.exp(-(x - 0.9) * (x - 0.9) / (2 * 0.04 * 0.04)) + 0.08 * Math.cos(9 * x);
    }
    function f(x) { return g(Math.abs(x)); }
    var kernels = {
      blind: function (a, b) { return S2 * Math.exp(-(a - b) * (a - b) / (2 * L * L)); },
      // the max kernel for x -> -x: the base kernel applied to |x|
      sym: function (a, b) { var d = Math.abs(a) - Math.abs(b); return S2 * Math.exp(-d * d / (2 * L * L)); }
    };
    var st = { X: START.slice(), sym: false, truth: false };
    var NX = 401, xs = [];
    for (var i = 0; i < NX; i++) xs.push(-1 + 2 * i / (NX - 1));

    var W = 640, H1 = 220, H2 = 84, M = { l: 40, r: 12, t: 18, b: 8 }, GAP = 30;
    var H = M.t + H1 + GAP + H2 + 24;
    var svg = DI.svg("svg", { class: "di-plot di-clickable", role: "img" }, body);
    DI.svg("title", {}, svg).textContent = "Gaussian-process posterior on a mirror-symmetric function, and the acquisition function";
    var Y0 = -0.9, Y1 = 1.5;
    function sx(x) { return M.l + (x + 1) / 2 * (W - M.l - M.r); }
    function sy(v) { return M.t + (Y1 - Math.max(Y0, Math.min(Y1, v))) / (Y1 - Y0) * H1; }
    var A0 = M.t + H1 + GAP;

    var gAxes = DI.svg("g", {}, svg);
    function axes() {
      W = Math.max(300, Math.round(body.clientWidth));
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      clear(gAxes);
      [-0.5, 0, 0.5, 1].forEach(function (v) {
        DI.svg("line", { x1: M.l, x2: W - M.r, y1: sy(v), y2: sy(v), class: "di-svg-grid" }, gAxes);
        DI.svg("text", { x: M.l - 8, y: sy(v) + 4, "text-anchor": "end", class: "di-svg-label" }, gAxes).textContent = v;
      });
      DI.svg("line", { x1: sx(0), x2: sx(0), y1: M.t - 6, y2: A0 + H2, class: "di-svg-mirror" }, gAxes);
      DI.svg("text", { x: sx(0) + 6, y: M.t - 4, class: "di-svg-label" }, gAxes).textContent = "mirror: f(x) = f(\u2212x)";
      DI.svg("text", { x: M.l, y: A0 - 9, class: "di-svg-label" }, gAxes).textContent = "acquisition (upper confidence bound)";
      DI.svg("line", { x1: M.l, x2: W - M.r, y1: A0 + H2, y2: A0 + H2, class: "di-svg-axis" }, gAxes);
      [-1, -0.5, 0, 0.5, 1].forEach(function (v) {
        DI.svg("text", { x: sx(v), y: A0 + H2 + 16, "text-anchor": "middle", class: "di-svg-label" }, gAxes).textContent =
          v < 0 ? "\u2212" + Math.abs(v) : v;
      });
    }

    var band = DI.svg("path", { class: "di-svg-band" }, svg);
    var truth = DI.svg("path", { class: "di-svg-truth" }, svg);
    var mean = DI.svg("path", { class: "di-svg-line" }, svg);
    var nextLine = DI.svg("line", { class: "di-svg-guide" }, svg);
    var acqFill = DI.svg("path", { class: "di-svg-band" }, svg);
    var acq = DI.svg("path", { class: "di-svg-line" }, svg);
    var nextDot = DI.svg("circle", { r: 4.5, class: "di-svg-dot-ringed" }, svg);
    var gObs = DI.svg("g", {}, svg);
    var cross = DI.svg("line", { class: "di-svg-crosshair", y1: M.t, y2: M.t + H1 }, svg);

    var tip = DI.tooltip(body);
    var bar = DI.toolbar(body);
    var go = DI.button(bar, "Let the algorithm choose", function () { st.X.push(xs[st.next]); render(); }, true);
    DI.button(bar, "Start over", function () { st.X = START.slice(); render(); });
    DI.toggle(bar, "Tell the model that f(x) = f(\u2212x)", st.sym, function (v) { st.sym = v; render(); });
    DI.toggle(bar, "Show the hidden function", st.truth, function (v) { st.truth = v; render(); });
    var stats = DI.stats(body, [
      { key: "n", label: "Evaluations" },
      { key: "best", label: "Best so far" },
      { key: "waste", label: "Paid twice" }
    ]);

    // An evaluation is paid twice when the mirror had already revealed its value: a symmetric model fitted to
    // the earlier evaluations is nearly certain there, while a symmetry-blind one is not.
    function wasted() {
      var w = 0, s0 = Math.sqrt(S2);
      for (var t = START.length; t < st.X.length; t++) {
        var prev = st.X.slice(0, t), y = prev.map(f);
        var a = new DI.gp.GP(kernels.sym, NOISE).fit(prev, y), b = new DI.gp.GP(kernels.blind, NOISE).fit(prev, y);
        if (Math.sqrt(a.predict(st.X[t], S2).v) < 0.3 * s0 && Math.sqrt(b.predict(st.X[t], S2).v) > 0.6 * s0) w++;
      }
      return w;
    }

    function render() {
      axes();
      var gp = new DI.gp.GP(kernels[st.sym ? "sym" : "blind"], NOISE);
      gp.fit(st.X, st.X.map(f));
      var post = xs.map(function (x) { return gp.predict(x, S2); });
      var u = post.map(function (p) { return p.mu + 2 * Math.sqrt(p.v); });
      // on a plateau of equal scores (an untouched region), go to its middle rather than its edge
      var umax = Math.max.apply(null, u), ties = [];
      for (var i = 0; i < NX; i++) if (u[i] >= umax - 1e-6) ties.push(i);
      var arg = ties[Math.floor(ties.length / 2)];
      st.next = arg;
      st.post = post;

      var up = xs.map(function (x, i) { return [sx(x), sy(post[i].mu + 2 * Math.sqrt(post[i].v))]; });
      var lo = xs.map(function (x, i) { return [sx(x), sy(post[i].mu - 2 * Math.sqrt(post[i].v))]; }).reverse();
      band.setAttribute("d", path(up.concat(lo)) + "Z");
      mean.setAttribute("d", path(xs.map(function (x, i) { return [sx(x), sy(post[i].mu)]; })));
      truth.setAttribute("d", st.truth ? path(xs.map(function (x) { return [sx(x), sy(f(x))]; })) : "");

      var umin = Math.min.apply(null, u);
      function ay(v) { return A0 + H2 - (umax > umin ? (v - umin) / (umax - umin) : 0) * (H2 - 6); }
      var apts = xs.map(function (x, i) { return [sx(x), ay(u[i])]; });
      acq.setAttribute("d", path(apts));
      acqFill.setAttribute("d", path(apts) + "L" + sx(1) + "," + (A0 + H2) + "L" + sx(-1) + "," + (A0 + H2) + "Z");
      nextDot.setAttribute("cx", sx(xs[arg]));
      nextDot.setAttribute("cy", ay(u[arg]));
      nextLine.setAttribute("x1", sx(xs[arg])); nextLine.setAttribute("x2", sx(xs[arg]));
      nextLine.setAttribute("y1", M.t); nextLine.setAttribute("y2", A0 + H2);

      clear(gObs);
      // hollow: values known for free, by symmetry
      st.X.forEach(function (x) {
        if (Math.abs(x) > 0.02) DI.svg("circle", { cx: sx(-x), cy: sy(f(x)), r: 4, class: "di-svg-obs-hollow" }, gObs);
      });
      st.X.forEach(function (x) { DI.svg("circle", { cx: sx(x), cy: sy(f(x)), r: 4.5, class: "di-svg-obs" }, gObs); });
      stats.n.textContent = st.X.length;
      stats.best.textContent = DI.fmt(Math.max.apply(null, st.X.map(f)));
      stats.waste.textContent = wasted();
      go.disabled = st.X.length >= BUDGET;
    }

    function xFromEvent(e) {
      var r = svg.getBoundingClientRect(), k = W / r.width;
      var x = ((e.clientX - r.left) * k - M.l) / (W - M.l - M.r) * 2 - 1;
      return Math.max(-1, Math.min(1, x));
    }
    svg.addEventListener("click", function (e) { if (st.X.length < BUDGET) { st.X.push(xFromEvent(e)); render(); } });
    svg.addEventListener("pointermove", function (e) {
      var x = xFromEvent(e), i = Math.round((x + 1) / 2 * (NX - 1)), p = st.post[i];
      cross.setAttribute("x1", sx(xs[i])); cross.setAttribute("x2", sx(xs[i]));
      cross.style.display = "block";
      var pt = DI.pointer(e, body);
      tip.show(pt.x, pt.y, [
        { value: DI.fmt(p.mu), label: "posterior mean" },
        { value: "\u00B1 " + DI.fmt(2 * Math.sqrt(p.v)), label: "uncertainty (2 std)" }
      ]);
    });
    svg.addEventListener("pointerleave", function () { cross.style.display = "none"; tip.hide(); });
    DI.onResize(render);
    render();
  });

  /* 3. Orbit pairs: what the average and the max do with the copies ------- */

  DI.mount("pairs", function (body) {
    var LK = 0.3;
    var st = { n: 3, x: [0.66, 0.16], xp: [0.02, 0.58], drag: null };

    var layout = DI.el("div", "di-split", body);
    var stage = DI.el("div", "di-stage", layout);
    var canvas = DI.canvas(stage, 1, "di-draggable");
    canvas.setAttribute("aria-label", "Two points x and x-prime on a disc with mirror lines, and every copy of x-prime. Drag the points.");
    var side = DI.el("div", "di-side", layout);
    var bar = DI.toolbar(side);
    DI.segmented(bar, "Mirrors", GROUPS.slice(0, 4), st.n, function (v) { st.n = v; draw(); });
    var C0 = DI.colors();
    var stats = DI.stats(side, [
      { key: "avg", label: "Averaged kernel", color: C0.avg },
      { key: "max", label: "Max kernel", color: C0.max }
    ]);
    var stripWrap = DI.el("div", "di-strip", side);
    DI.el("div", "di-strip-title", stripWrap, "Similarity of x to each copy of x\u2032");
    var strip = DI.svg("svg", { class: "di-plot", role: "img" }, stripWrap);
    DI.svg("title", {}, strip).textContent = "The similarities between x and every copy of x-prime, with their average and their maximum";
    var hint = DI.el("p", "di-hint", side);

    function sims() {
      var G = SYM.group(st.n), copies = SYM.orbit(G, st.xp[0], st.xp[1]);
      var v = copies.map(function (c) { return SYM.kb(st.x[0] - c[0], st.x[1] - c[1], LK); });
      var best = 0;
      for (var i = 1; i < v.length; i++) if (v[i] > v[best]) best = i;
      var avg = v.reduce(function (s, a) { return s + a; }, 0) / v.length;
      return { copies: copies, v: v, best: best, avg: avg, max: v[best] };
    }

    function draw() {
      var f = DI.fit(canvas), ctx = f.ctx, C = DI.colors(), map = UI.discMapper(f.w, f.h, 6), S = sims();
      ctx.clearRect(0, 0, f.w, f.h);
      ctx.beginPath(); ctx.arc(map.cx, map.cy, map.rad, 0, TAU);
      ctx.fillStyle = DI.isDark() ? "#2a2b2f" : "#efefeb";
      ctx.fill();
      UI.mirrorLines(ctx, map, st.n, UI.faint());
      UI.strokeDisc(ctx, map, C.rule);

      var px = map.px(st.x[0], st.x[1]);
      ctx.save();
      ctx.strokeStyle = C.ink;
      S.copies.forEach(function (c, i) {
        if (i === S.best) return;
        var q = map.px(c[0], c[1]);
        ctx.globalAlpha = 0.07 + 0.93 * S.v[i];
        ctx.lineWidth = 1.25 + 1.5 * S.v[i];
        ctx.beginPath(); ctx.moveTo(px[0], px[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
      });
      ctx.restore();
      var qb = map.px(S.copies[S.best][0], S.copies[S.best][1]);
      ctx.save();
      ctx.strokeStyle = C.max; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(px[0], px[1]); ctx.lineTo(qb[0], qb[1]); ctx.stroke();
      ctx.restore();

      S.copies.forEach(function (c, i) {
        if (i === 0) return;
        var q = map.px(c[0], c[1]);
        DI.square(ctx, q[0], q[1], 4, C.ink, C.surface, true);
      });
      var pp = map.px(st.xp[0], st.xp[1]);
      DI.square(ctx, pp[0], pp[1], 5, C.ink, C.surface);
      DI.dot(ctx, px[0], px[1], 6, C.ink, C.surface);
      DI.label(ctx, px[0] + 10, px[1] - 9, "x", C, { family: "Newsreader, Georgia, serif", weight: "italic 500", size: 16 });
      DI.label(ctx, pp[0] + 10, pp[1] - 9, "x\u2032", C, { family: "Newsreader, Georgia, serif", weight: "italic 500", size: 16 });

      stats.avg.textContent = DI.fmt(S.avg);
      stats.max.textContent = DI.fmt(S.max);
      stats.avgKey.style.background = C.avg;
      stats.maxKey.style.background = C.max;
      drawStrip(S, C);
      hint.textContent = "Drag x or x\u2032. Only one copy is well aligned with x (green); the average dilutes it among all " + S.v.length +
        ". Bring x\u2032 onto a mirror, or to the center, and watch the average.";
    }

    function drawStrip(S, C) {
      var W = Math.max(220, Math.round(stripWrap.clientWidth)), H = 104, padL = 8, padR = 8, base = 64;
      strip.setAttribute("viewBox", "0 0 " + W + " " + H);
      var keep = strip.firstChild;
      clear(strip);
      strip.appendChild(keep);
      function sx(v) { return padL + v * (W - padL - padR); }
      DI.svg("line", { x1: sx(0), x2: sx(1), y1: base + 8, y2: base + 8, class: "di-svg-axis" }, strip);
      [0, 0.5, 1].forEach(function (v) {
        DI.svg("text", { x: sx(v), y: base + 24, "text-anchor": v === 0 ? "start" : v === 1 ? "end" : "middle", class: "di-svg-label" }, strip).textContent = v;
      });
      // a small beeswarm: dots rise when they would overlap
      var placed = [], R = 4.5, order = S.v.map(function (v, i) { return i; }).sort(function (a, b) { return S.v[a] - S.v[b]; });
      order.forEach(function (i) {
        var x = sx(S.v[i]), lvl = 0;
        for (; lvl < 5; lvl++) {
          var ok = true;
          for (var k = 0; k < placed.length; k++) {
            if (placed[k].lvl === lvl && Math.abs(placed[k].x - x) < 2 * R + 1) { ok = false; break; }
          }
          if (ok) break;
        }
        placed.push({ x: x, lvl: lvl, i: i });
      });
      placed.forEach(function (p) {
        DI.svg("rect", {
          x: p.x - R + 0.5, y: base - p.lvl * (2 * R + 1) - R + 0.5, width: 2 * R - 1, height: 2 * R - 1,
          class: p.i === S.best ? "di-svg-sq-best" : "di-svg-sq"
        }, strip);
      });
      var ax = sx(S.avg), mx = sx(S.max), close = Math.abs(ax - mx) < 86;
      DI.svg("line", { x1: ax, x2: ax, y1: 14, y2: base + 8, stroke: C.avg, class: "di-svg-marker" }, strip);
      DI.svg("line", { x1: mx, x2: mx, y1: 14, y2: base + 8, stroke: C.max, class: "di-svg-marker" }, strip);
      var aRight = ax < W - 90;
      DI.svg("text", { x: ax + (aRight ? 5 : -5), y: 11, "text-anchor": aRight ? "start" : "end", class: "di-svg-label-strong" }, strip).textContent = "average";
      if (!close || mx > ax) {
        var mRight = mx < W - 50 && !(close && !aRight);
        DI.svg("text", { x: mx + (mRight ? 5 : -5), y: close ? H - 2 : 11, "text-anchor": mRight ? "start" : "end", class: "di-svg-label-strong" }, strip).textContent = "max";
      }
    }

    function pick(e) {
      var map = UI.discMapper(canvas.clientWidth, canvas.clientHeight, 6), p = DI.pointer(e, canvas);
      return { map: map, q: map.inv(p.x, p.y) };
    }
    canvas.addEventListener("pointerdown", function (e) {
      var P = pick(e);
      var dx = Math.hypot(P.q[0] - st.x[0], P.q[1] - st.x[1]), dp = Math.hypot(P.q[0] - st.xp[0], P.q[1] - st.xp[1]);
      st.drag = dx <= dp ? "x" : "xp";
      canvas.setPointerCapture(e.pointerId);
      st[st.drag] = UI.clampDisc(P.q, 0.97);
      draw();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!st.drag) return;
      st[st.drag] = UI.clampDisc(pick(e).q, 0.97);
      draw();
    });
    canvas.addEventListener("pointerup", function () { st.drag = null; });

    DI.onTheme(draw);
    DI.onResize(draw);
    draw();
  });

  /* 4. Three kernels, side by side --------------------------------------- */

  DI.mount("kernels", function (body) {
    var Lk = 0.2, M = 110;
    var st = { n: 4, p: [0.55, 0.22] };
    var bar = DI.toolbar(body);
    DI.segmented(bar, "Mirrors", MIRRORS, st.n, function (v) { st.n = v; render(); });

    var trio = DI.el("div", "di-trio", body);
    var names = [
      { key: "base", title: "Base kernel" },
      { key: "avg", title: "Average over the group" },
      { key: "max", title: "Max over the group" }
    ];
    var panels = names.map(function (d) {
      var col = DI.el("div", "di-trio-col", trio);
      var t = DI.el("div", "di-panel-title", col);
      var key = DI.el("i", "di-key", t);
      t.appendChild(document.createTextNode(d.title));
      var c = DI.canvas(col, 1, "di-draggable");
      c.setAttribute("aria-label", d.title + ": drag to move the reference point");
      var read = DI.el("div", "di-readout", col);
      return { key: d.key, canvas: c, read: read, swatch: key };
    });
    var scale = DI.el("div", "di-scale", body);
    DI.el("span", null, scale, "0");
    var grad = DI.el("span", "di-scale-bar", scale);
    DI.el("span", null, scale, "1");
    var tip = DI.tooltip(body);

    function value(kind, a, b) {
      if (kind === "base") return SYM.kBase(a, b, Lk);
      if (kind === "max") return SYM.kMax(a, b, Lk);
      return SYM.kAvg(a, b, Lk);
    }

    var raf = null;
    function render() { if (!raf) raf = requestAnimationFrame(function () { raf = null; draw(); }); }

    function draw() {
      var C = DI.colors(), ramp = DI.ramp("blue"), n = st.n, G = SYM.group(n);
      var ref = SYM.point(st.p[0], st.p[1], n);
      var stops = [];
      for (var s = 0; s <= 8; s++) stops.push(DI.rgb(ramp(s / 8)));
      grad.style.background = "linear-gradient(90deg," + stops.join(",") + ")";
      panels.forEach(function (pn) {
        pn.swatch.style.background = C[pn.key];
        var vals = new Float64Array(M * M);
        for (var i = 0; i < M; i++) {
          for (var j = 0; j < M; j++) {
            var x = -1 + 2 * (j + 0.5) / M, y = 1 - 2 * (i + 0.5) / M;
            vals[i * M + j] = x * x + y * y > 1.02 ? NaN : value(pn.key, ref, SYM.point(x, y, n));
          }
        }
        var img = DI.heatImage(vals, M, ramp);
        var f = DI.fit(pn.canvas), ctx = f.ctx, map = UI.discMapper(f.w, f.h, 3);
        ctx.clearRect(0, 0, f.w, f.h);
        UI.drawDiscImage(ctx, img, map);
        UI.mirrorLines(ctx, map, n, DI.isDark() ? "rgba(255,255,255,0.14)" : "rgba(27,29,34,0.12)");
        UI.strokeDisc(ctx, map, C.rule);
        SYM.orbit(G, st.p[0], st.p[1]).forEach(function (o, k) {
          if (k === 0) return;
          var p = map.px(o[0], o[1]);
          DI.ring(ctx, p[0], p[1], 4, C.ink, C.surface);
        });
        var p0 = map.px(st.p[0], st.p[1]);
        DI.dot(ctx, p0[0], p0[1], 4.5, C.ink, C.surface);
        var c = ref.orb[n > 1 ? 2 : 1], copy = SYM.point(c[0], c[1], n);
        pn.read.textContent = "at the dot " + DI.fmt(value(pn.key, ref, ref)) + " \u00B7 at its copies " + DI.fmt(value(pn.key, ref, copy));
      });
    }

    panels.forEach(function (pn) {
      var dragging = false;
      function move(e) {
        var map = UI.discMapper(pn.canvas.clientWidth, pn.canvas.clientHeight, 3);
        var p = DI.pointer(e, pn.canvas);
        st.p = UI.clampDisc(map.inv(p.x, p.y));
        render();
      }
      pn.canvas.addEventListener("pointerdown", function (e) { dragging = true; pn.canvas.setPointerCapture(e.pointerId); move(e); });
      pn.canvas.addEventListener("pointermove", function (e) {
        if (dragging) { move(e); return; }
        var map = UI.discMapper(pn.canvas.clientWidth, pn.canvas.clientHeight, 3);
        var p = DI.pointer(e, pn.canvas), q = map.inv(p.x, p.y);
        if (q[0] * q[0] + q[1] * q[1] > 1) { tip.hide(); return; }
        var v = value(pn.key, SYM.point(st.p[0], st.p[1], st.n), SYM.point(q[0], q[1], st.n));
        var bp = DI.pointer(e, body);
        tip.show(bp.x, bp.y, [{ value: DI.fmt(v), label: "similarity to the dot", color: DI.colors()[pn.key] }]);
      });
      pn.canvas.addEventListener("pointerup", function () { dragging = false; });
      pn.canvas.addEventListener("pointerleave", function () { tip.hide(); });
    });

    DI.onTheme(render);
    DI.onResize(render);
    draw();
  });

  /* 5. Folding the disc into its quotient --------------------------------- */

  DI.mount("fold", function (body) {
    var LK = 0.3;
    var st = { n: 3, u: 0, A: [0.45, -0.45], B: [-0.2, 0.7], drag: null, anim: null };
    var tex = null;

    var layout = DI.el("div", "di-split", body);
    var stage = DI.el("div", "di-stage", layout);
    var canvas = DI.canvas(stage, 1, "di-draggable");
    canvas.setAttribute("aria-label", "The disc, its mirror lines and two points A and B. Fold it with the slider.");
    var side = DI.el("div", "di-side", layout);
    var bar = DI.toolbar(side);
    DI.segmented(bar, "Mirrors", GROUPS, st.n, function (v) { st.n = v; tex = null; draw(); });
    var foldSlider = DI.slider(bar, "Fold", { min: 0, max: 1, step: 0.005, value: 0, format: function (v) { return Math.round(v * 100) + "%"; } },
      function (v) { stop(); st.u = v; draw(); });
    var actions = DI.el("div", "di-actions", side);
    var play = DI.button(actions, "Fold", function () { animate(st.u < 0.5 ? 1 : 0); }, true);
    var C0 = DI.colors();
    var stats = DI.stats(side, [
      { key: "flat", label: "Distance on the disc" },
      { key: "folded", label: "Distance once folded" },
      { key: "kb", label: "Base kernel", color: C0.base },
      { key: "km", label: "Max kernel", color: C0.max }
    ]);
    var hint = DI.el("p", "di-hint", side);

    function geometry(w, h) {
      var n = st.n, base = UI.discMapper(w, h, 6), e = DI.ease(st.u), state = null, tmax;
      if (isFinite(n)) { state = SYM.unfoldState(n, 1 - st.u); tmax = SYM.footprint(state); }
      else tmax = TAU * (1 - e);
      var map = UI.zoom(base, UI.sectorBox(Math.max(tmax, 0.02)), 1, 2.3);
      function place(x, y) {
        if (state) return SYM.placeUnfold(x, y, state);
        var r = Math.sqrt(x * x + y * y), t = Math.atan2(y, x);
        if (t < 0) t += TAU;
        t *= 1 - e;
        return [r * Math.cos(t), r * Math.sin(t)];
      }
      return { map: map, state: state, tmax: tmax, place: place, e: e };
    }

    function nearestCopy() {
      if (!isFinite(st.n)) {
        var ra = Math.hypot(st.A[0], st.A[1]), rb = Math.hypot(st.B[0], st.B[1]), ta = Math.atan2(st.A[1], st.A[0]);
        return { p: [rb * Math.cos(ta), rb * Math.sin(ta)], d: Math.abs(ra - rb) };
      }
      var best = null, bd = Infinity;
      SYM.orbit(SYM.group(st.n), st.B[0], st.B[1]).forEach(function (o) {
        var d = Math.hypot(o[0] - st.A[0], o[1] - st.A[1]);
        if (d < bd) { bd = d; best = o; }
      });
      return { p: best, d: bd };
    }

    function draw() {
      var f = DI.fit(canvas), ctx = f.ctx, C = DI.colors(), n = st.n, Gm = geometry(f.w, f.h), map = Gm.map;
      if (!tex) tex = UI.landscapeImage(n, 220, DI.ramp("blue"));
      ctx.clearRect(0, 0, f.w, f.h);

      if (Gm.state) UI.drawUnfold(ctx, map, tex, Gm.state, C);
      else {
        var t = Math.max(Gm.tmax, 0.03), bandA = Math.max(0, Math.min(1, (0.35 - Gm.tmax) / 0.3));
        ctx.save(); ctx.globalAlpha = 1 - bandA; UI.sector(ctx, map, 0, t); ctx.clip(); UI.drawImage(ctx, tex, map); ctx.restore();
        if (st.u > 0.002 && bandA < 1) {
          ctx.save(); ctx.globalAlpha = 1 - bandA; ctx.strokeStyle = UI.faint(); ctx.lineWidth = 1; UI.sector(ctx, map, 0, t); ctx.stroke(); ctx.restore();
        }
        if (bandA > 0) {
          // the orbifold of all rotations: the segment of radii, painted with the landscape along it
          var p0 = map.px(0, 0), p1 = map.px(1, 0), ramp = DI.ramp("blue"), gr = ctx.createLinearGradient(p0[0], 0, p1[0], 0);
          for (var g = 0; g <= 24; g++) gr.addColorStop(g / 24, DI.rgb(ramp(SYM.radial(g / 24))));
          ctx.save();
          ctx.globalAlpha = bandA;
          ctx.fillStyle = gr;
          ctx.fillRect(p0[0], p0[1] - 7, p1[0] - p0[0], 14);
          ctx.strokeStyle = C.rule; ctx.strokeRect(p0[0], p0[1] - 7, p1[0] - p0[0], 14);
          DI.label(ctx, p0[0], p0[1] + 30, "0", C, { align: "center", weight: "400", color: C.muted });
          DI.label(ctx, p1[0], p1[1] + 30, "1", C, { align: "center", weight: "400", color: C.muted });
          DI.label(ctx, (p0[0] + p1[0]) / 2, p0[1] + 30, "radius \u2016x\u2016", C, { align: "center", weight: "400", color: C.muted });
          ctx.restore();
        }
      }
      if (st.u < 0.002) UI.strokeDisc(ctx, map, C.rule);

      // the shortest route from A to B once copies are allowed, carried along by the fold
      var nc = nearestCopy(), prev = null;
      ctx.save();
      ctx.lineWidth = 2; ctx.strokeStyle = C.ink; ctx.lineCap = "round";
      ctx.beginPath();
      for (var k = 0; k <= 80; k++) {
        var x = st.A[0] + (nc.p[0] - st.A[0]) * k / 80, y = st.A[1] + (nc.p[1] - st.A[1]) * k / 80;
        var w2 = Gm.place(x, y), s2 = map.px(w2[0], w2[1]);
        if (prev && Math.hypot(s2[0] - prev[0], s2[1] - prev[1]) > map.rad * 0.25) ctx.moveTo(s2[0], s2[1]);
        else if (k) ctx.lineTo(s2[0], s2[1]); else ctx.moveTo(s2[0], s2[1]);
        prev = s2;
      }
      ctx.stroke();
      ctx.restore();

      if (isFinite(n)) {
        SYM.orbit(SYM.group(n), st.B[0], st.B[1]).forEach(function (o, i) {
          if (!i) return;
          var w3 = Gm.place(o[0], o[1]), s3 = map.px(w3[0], w3[1]);
          DI.ring(ctx, s3[0], s3[1], 4.5, C.ink, C.surface);
        });
      } else {
        // with every rotation, the copies of B fill a whole circle, which closes with the fan
        var rb = Math.hypot(st.B[0], st.B[1]);
        ctx.save();
        ctx.setLineDash([2, 4]); ctx.lineWidth = 1.75; ctx.strokeStyle = C.ink; ctx.lineCap = "round";
        ctx.beginPath(); ctx.arc(map.cx, map.cy, rb * map.rad, 0, -Math.max(Gm.tmax, 1e-3), true); ctx.stroke();
        ctx.restore();
      }
      var wa = Gm.place(st.A[0], st.A[1]), sa = map.px(wa[0], wa[1]);
      var wb = Gm.place(st.B[0], st.B[1]), sb = map.px(wb[0], wb[1]);
      DI.dot(ctx, sb[0], sb[1], 6, C.ink, C.surface);
      DI.dot(ctx, sa[0], sa[1], 6, C.ink, C.surface);
      if (!isFinite(n) && st.u > 0.8) {
        // on the segment the two points sit side by side: one label above, one below
        var aFirst = Math.hypot(st.A[0], st.A[1]) <= Math.hypot(st.B[0], st.B[1]);
        DI.label(ctx, sa[0], sa[1] + (aFirst ? -14 : 22), "A", C, { align: "center" });
        DI.label(ctx, sb[0], sb[1] + (aFirst ? 22 : -14), "B", C, { align: "center" });
      } else {
        DI.label(ctx, sa[0] + 9, sa[1] - 8, "A", C);
        DI.label(ctx, sb[0] + 9, sb[1] - 8, "B", C);
      }

      var flat = Math.hypot(st.A[0] - st.B[0], st.A[1] - st.B[1]);
      stats.flat.textContent = DI.fmt(flat);
      stats.folded.textContent = DI.fmt(nc.d);
      stats.kb.textContent = DI.fmt(Math.exp(-flat * flat / (2 * LK * LK)));
      stats.km.textContent = DI.fmt(Math.exp(-nc.d * nc.d / (2 * LK * LK)));
      stats.kbKey.style.background = C.base;
      stats.kmKey.style.background = C.max;
      play.textContent = st.u < 0.5 ? "Fold" : "Unfold";
      var inf = !isFinite(n);
      hint.textContent = st.u < 0.02 ?
        (inf ? "Drag A or B. Under every rotation, the copies of B form the dashed circle; the line is the shortest way from A to it." :
          "Drag A or B. The rings are the copies of B; the line is the shortest way from A to any of them.") :
        st.u > 0.98 ?
          (inf ? "Folded onto a single radius: each circle became a point, and the distance is now the difference of the radii, |\u2016A\u2016 \u2212 \u2016B\u2016|." :
            "Folded: every copy of B has landed on B, and the line is now a plain straight segment inside the wedge.") :
          "Unfold to move the points.";
    }

    function stop() { if (st.anim) { cancelAnimationFrame(st.anim); st.anim = null; } }
    function animate(to) {
      stop();
      var from = st.u, t0 = null;
      var dur = (isFinite(st.n) ? (2 * st.n - 1) * 360 : 1900) * Math.abs(to - from) + 1;
      function tick(ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur);
        st.u = from + (to - from) * (isFinite(st.n) ? k : DI.ease(k));
        foldSlider.set(st.u);
        draw();
        st.anim = k < 1 ? requestAnimationFrame(tick) : null;
      }
      st.anim = requestAnimationFrame(tick);
    }

    canvas.addEventListener("pointerdown", function (e) {
      if (st.u > 0.02) return;
      var map = UI.discMapper(canvas.clientWidth, canvas.clientHeight, 6), p = DI.pointer(e, canvas);
      var a = map.px(st.A[0], st.A[1]), b = map.px(st.B[0], st.B[1]);
      var da = Math.hypot(p.x - a[0], p.y - a[1]), db = Math.hypot(p.x - b[0], p.y - b[1]);
      if (Math.min(da, db) > 24) return;
      st.drag = da < db ? "A" : "B";
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!st.drag) return;
      var map = UI.discMapper(canvas.clientWidth, canvas.clientHeight, 6), p = DI.pointer(e, canvas);
      st[st.drag] = UI.clampDisc(map.inv(p.x, p.y), 0.97);
      draw();
    });
    canvas.addEventListener("pointerup", function () { st.drag = null; });

    DI.onTheme(function () { tex = null; draw(); });
    DI.onResize(draw);
    draw();
  });

  /* 6. Two invariant priors from the same random draw --------------------- */

  DI.mount("priors", function (body, host) {
    var M = 180, L = 0.2, NF = 420, VMAX = 2.4, U0 = 0.16, NR = 110, NT = 360;
    var st = { n: 4, seed: 64, u: 0, anim: null };
    var D = null, lut = null, heat = [DI.heatCanvas(M), DI.heatCanvas(M), DI.heatCanvas(M), DI.heatCanvas(M)];

    var bar = DI.toolbar(body);
    DI.segmented(bar, "Mirrors", GROUPS, st.n, function (v) { st.n = v; build(); jump(); });
    var actions = DI.el("div", "di-actions", bar);
    var playBtn = DI.button(actions, "Play", function () { st.anim ? stop() : play(); }, true);
    DI.button(actions, "New draw", function () { st.seed += 1; build(); jump(); });
    var slider = DI.slider(bar, "Progress", { min: 0, max: 1, step: 0.002, value: 0, format: function (v) { return Math.round(v * 100) + "%"; } },
      function (v) { stop(); st.u = v; frame(); });

    var trio = DI.el("div", "di-trio", body);
    var specs = [
      { key: "h", title: "One draw h of the base prior" },
      { key: "avg", title: "Average h over every copy" },
      { key: "max", title: "Keep one wedge of h, unfold it" }
    ];
    var panels = specs.map(function (d) {
      var col = DI.el("div", "di-trio-col", trio);
      var t = DI.el("div", "di-panel-title", col);
      var key = DI.el("i", "di-key", t);
      var label = document.createTextNode(d.title);
      t.appendChild(label);
      var c = DI.canvas(col, 1);
      c.setAttribute("role", "img");
      var read = DI.el("div", "di-readout", col);
      return { key: d.key, canvas: c, read: read, swatch: key, label: label };
    });
    var scale = DI.el("div", "di-scale", body);
    DI.el("span", null, scale, "\u2212" + VMAX.toFixed(1));
    var grad = DI.el("span", "di-scale-bar", scale);
    DI.el("span", null, scale, "+" + VMAX.toFixed(1) + "  (same colors in all three panels)");

    function norm(v) { return 0.5 + 0.5 * Math.max(-1, Math.min(1, v / VMAX)); }

    function build() {
      var n = st.n, h = SYM.drawGrid(L, NF, st.seed, M), N = M * M, i, j, p;
      var inside = new Uint8Array(N), xs = new Float64Array(N), ys = new Float64Array(N);
      for (i = 0; i < M; i++) for (j = 0; j < M; j++) {
        p = i * M + j;
        xs[p] = -1 + 2 * (j + 0.5) / M; ys[p] = 1 - 2 * (i + 0.5) / M;
        // compute a little beyond the rim, so that smoothing never blends the edge with transparency
        inside[p] = xs[p] * xs[p] + ys[p] * ys[p] <= 1.3 ? 1 : 0;
      }
      var fmax = new Float64Array(N), avgSteps = [], polar = null, ri = null, ti = null, favg = new Float64Array(N);
      for (p = 0; p < N; p++) {
        if (!inside[p]) { fmax[p] = NaN; continue; }
        var q = SYM.fold(xs[p], ys[p], n);
        fmax[p] = SYM.sample(h, M, q[0], q[1]);
      }
      if (isFinite(n)) {
        var G = SYM.group(n), sum = new Float64Array(N);
        G.forEach(function (g, k) {
          var out = new Float32Array(N);
          for (var p2 = 0; p2 < N; p2++) {
            if (!inside[p2]) { out[p2] = NaN; continue; }
            sum[p2] += SYM.sample(h, M, g[0] * xs[p2] + g[1] * ys[p2], g[2] * xs[p2] + g[3] * ys[p2]);
            out[p2] = sum[p2] / (k + 1);
          }
          avgSteps.push(out);
        });
        favg = avgSteps[avgSteps.length - 1];
      } else {
        // polar table with running sums along the angle: averaging over a growing arc of rotations is O(1) per pixel
        polar = new Float64Array(NR * (2 * NT + 1));
        for (var a = 0; a < NR; a++) {
          var r = (a + 0.5) / NR, acc = 0, row = a * (2 * NT + 1);
          polar[row] = 0;
          for (var b = 0; b < 2 * NT; b++) {
            var th = TAU * (b % NT) / NT;
            acc += SYM.sample(h, M, r * Math.cos(th), r * Math.sin(th));
            polar[row + b + 1] = acc;
          }
        }
        ri = new Int16Array(N); ti = new Int16Array(N);
        for (p = 0; p < N; p++) {
          if (!inside[p]) continue;
          var rr = Math.sqrt(xs[p] * xs[p] + ys[p] * ys[p]), tt = Math.atan2(ys[p], xs[p]);
          if (tt < 0) tt += TAU;
          ri[p] = Math.min(NR - 1, Math.floor(rr * NR));
          ti[p] = Math.floor(tt / TAU * NT) % NT;
          var rw = ri[p] * (2 * NT + 1);
          favg[p] = polar[rw + NT] / NT;
        }
        for (p = 0; p < N; p++) if (!inside[p]) favg[p] = NaN;
      }
      function rms(arr) {
        var s = 0, c = 0;
        for (var k = 0; k < N; k++) if (inside[k] && xs[k] * xs[k] + ys[k] * ys[k] <= 1) { s += arr[k] * arr[k]; c++; }
        return Math.sqrt(s / c);
      }
      var hv = new Float64Array(N);
      for (p = 0; p < N; p++) hv[p] = inside[p] ? h[p] : NaN;
      D = { n: n, h: hv, fmax: fmax, favg: favg, avgSteps: avgSteps, polar: polar, ri: ri, ti: ti, inside: inside,
        rms: { h: rms(hv), avg: rms(favg), max: rms(fmax) }, buf: new Float64Array(N) };
      paintStatic();
    }

    function paintStatic() {
      lut = DI.lut(DI.ramp("div"));
      var N = M * M, a = new Float64Array(N), b = new Float64Array(N);
      for (var p = 0; p < N; p++) { a[p] = D.h[p] === D.h[p] ? norm(D.h[p]) : NaN; b[p] = D.fmax[p] === D.fmax[p] ? norm(D.fmax[p]) : NaN; }
      D.hImg = heat[0].put(a, lut);
      D.maxImg = heat[1].put(b, lut);
      var ramp = DI.ramp("div"), stops = [];
      for (var s = 0; s <= 8; s++) stops.push(DI.rgb(ramp(s / 8)));
      grad.style.background = "linear-gradient(90deg," + stops.join(",") + ")";
    }

    function avgFrame(pa) {
      var N = M * M, out = D.buf, p;
      if (isFinite(D.n)) {
        var steps = D.avgSteps, kf = pa * (steps.length - 1), k0 = Math.min(steps.length - 2, Math.floor(kf)), fr = kf - k0;
        var A = steps[k0], B = steps[k0 + 1];
        for (p = 0; p < N; p++) out[p] = A[p] === A[p] ? norm(A[p] * (1 - fr) + B[p] * fr) : NaN;
      } else {
        var w = Math.round(pa * NT);
        for (p = 0; p < N; p++) {
          if (!D.inside[p]) { out[p] = NaN; continue; }
          if (w < 1) { out[p] = norm(D.h[p]); continue; }
          var row = D.ri[p] * (2 * NT + 1), t0 = D.ti[p];
          out[p] = norm((D.polar[row + t0 + w] - D.polar[row + t0]) / w);
        }
      }
      return heat[2].put(out, lut);
    }

    function drawH() {
      var pn = panels[0], f = DI.fit(pn.canvas), ctx = f.ctx, C = DI.colors(), map = UI.discMapper(f.w, f.h, 3);
      ctx.clearRect(0, 0, f.w, f.h);
      UI.drawDiscImage(ctx, D.hImg, map);
      UI.strokeDisc(ctx, map, C.rule);
      pn.read.textContent = "typical size " + DI.fmt(D.rms.h);
    }

    function frame() {
      var C = DI.colors(), n = D.n, inf = !isFinite(n), u = st.u, pa = Math.max(0, Math.min(1, (u - U0) / (1 - U0)));
      // averaging route
      var pn = panels[1], f = DI.fit(pn.canvas), ctx = f.ctx, map = UI.discMapper(f.w, f.h, 3);
      ctx.clearRect(0, 0, f.w, f.h);
      UI.drawDiscImage(ctx, avgFrame(pa), map);
      if (pa >= 1) UI.mirrorLines(ctx, map, n, UI.faint());
      UI.strokeDisc(ctx, map, C.rule);
      if (pa >= 1) pn.read.textContent = "typical size " + DI.fmt(D.rms.avg);
      else if (pa <= 0) pn.read.textContent = inf ? "averages over every rotation" : "averages " + (2 * n) + " copies";
      else pn.read.textContent = inf ? "averaged over " + Math.round(360 * pa) + "\u00B0 of rotation" :
        "copies averaged: " + (1 + Math.floor(pa * (2 * n - 1) + 1e-9)) + " of " + (2 * n);

      // folding route
      pn = panels[2]; f = DI.fit(pn.canvas); ctx = f.ctx; map = UI.discMapper(f.w, f.h, 3);
      ctx.clearRect(0, 0, f.w, f.h);
      if (u < U0) {
        var keep = u / U0, sliver = inf ? 0.09 : Math.PI / n;
        ctx.save();
        ctx.globalAlpha = 1 - DI.ease(keep);
        UI.drawDiscImage(ctx, D.hImg, map);
        ctx.restore();
        ctx.save(); UI.sector(ctx, map, 0, sliver); ctx.clip(); UI.drawImage(ctx, inf ? D.maxImg : D.hImg, map); ctx.restore();
        if (keep > 0.02) {
          ctx.save(); ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.5 * keep; ctx.lineWidth = 1.25; UI.sector(ctx, map, 0, sliver); ctx.stroke(); ctx.restore();
        }
        pn.read.textContent = inf ? "keeps h along one radius" : "keeps one wedge of h";
      } else if (inf) {
        var sweep = Math.max(0.09, TAU * pa);
        ctx.save(); UI.sector(ctx, map, 0, sweep); ctx.clip(); UI.drawImage(ctx, D.maxImg, map); ctx.restore();
        if (pa < 1) {
          var e = map.px(Math.cos(sweep), Math.sin(sweep));
          ctx.save(); ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.25;
          ctx.beginPath(); ctx.moveTo(map.cx, map.cy); ctx.lineTo(e[0], e[1]); ctx.stroke(); ctx.restore();
          pn.read.textContent = "swept round " + Math.round(360 * pa) + "\u00B0";
        }
      } else {
        var state = SYM.unfoldState(n, pa);
        UI.drawUnfold(ctx, map, D.maxImg, state, C);
        if (pa < 1) pn.read.textContent = "wedges unfolded: " + Math.min(2 * n, state.k) + " of " + (2 * n);
      }
      if (pa >= 1) pn.read.textContent = "typical size " + DI.fmt(D.rms.max);
      UI.strokeDisc(ctx, map, C.rule);

      panels[1].swatch.style.background = C.avg;
      panels[2].swatch.style.background = C.max;
      panels[0].swatch.style.background = "transparent";
      panels[0].swatch.style.boxShadow = "inset 0 0 0 1.5px " + C.muted;
      panels[2].label.textContent = inf ? "Keep h on one radius, sweep it round" : "Keep one wedge of h, unfold it";
      playBtn.textContent = st.anim ? "Pause" : u >= 1 ? "Replay" : "Play";
    }

    function drawAll() { drawH(); frame(); }
    function jump() { stop(); st.u = 1; slider.set(1); drawAll(); }
    function stop() { if (st.anim) { cancelAnimationFrame(st.anim); st.anim = null; } if (D) frame(); }
    function play() {
      if (st.u >= 1) st.u = 0;
      var from = st.u, t0 = null, dur = (isFinite(st.n) ? 1400 + (2 * st.n - 1) * 520 : 5200) * (1 - from);
      function tick(ts) {
        if (t0 === null) t0 = ts;
        var k = Math.min(1, (ts - t0) / dur);
        st.u = from + (1 - from) * k;
        slider.set(st.u);
        st.anim = k < 1 ? requestAnimationFrame(tick) : null;
        frame();
      }
      st.anim = requestAnimationFrame(tick);
      frame();
    }

    build();
    st.u = 0;
    drawAll();
    DI.onVisible(host, function () { if (DI.reducedMotion()) jump(); else play(); });
    DI.onTheme(function () { paintStatic(); drawAll(); });
    DI.onResize(drawAll);
  });
})(window);
