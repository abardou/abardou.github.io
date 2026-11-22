/*
 * Docta Ignorantia: shared widget toolkit (DOM helpers, theme, colours, controls).
 * ES5 only: the Docker build minifies JS with uglifier.
 */
(function (root) {
  "use strict";

  var DI = root.DI || (root.DI = {});
  var NS = "http://www.w3.org/2000/svg";

  /* DOM ------------------------------------------------------------------ */

  DI.svg = function (name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    if (attrs) for (var k in attrs) node.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(node);
    return node;
  };

  DI.el = function (tag, cls, parent, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  };

  DI.mount = function (name, fn) {
    function run() {
      var roots = document.querySelectorAll('[data-di-widget="' + name + '"]');
      for (var i = 0; i < roots.length; i++) {
        var host = roots[i];
        var body = DI.el("div", "di-widget-body");
        host.insertBefore(body, host.querySelector("figcaption"));
        fn(body, host);
      }
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
  };

  /* Theme ---------------------------------------------------------------- */

  DI.isDark = function () {
    return document.documentElement.getAttribute("data-theme") === "dark";
  };

  var themeListeners = [];
  DI.onTheme = function (cb) {
    themeListeners.push(cb);
    if (themeListeners.length === 1 && root.MutationObserver) {
      new MutationObserver(function () {
        for (var i = 0; i < themeListeners.length; i++) themeListeners[i]();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    }
  };

  var resizeListeners = [];
  var resizeTimer = null;
  DI.onResize = function (cb) {
    resizeListeners.push(cb);
    if (resizeListeners.length === 1) {
      root.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
          for (var i = 0; i < resizeListeners.length; i++) resizeListeners[i]();
        }, 120);
      });
    }
  };

  DI.token = function (el, name) {
    return getComputedStyle(el).getPropertyValue(name).trim();
  };

  /* Colour --------------------------------------------------------------- */

  function hexToRgb(h) {
    h = h.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  DI.hexToRgb = hexToRgb;

  // Sequential ramps: one hue, the low end receding into the widget surface.
  var RAMPS = {
    blue: {
      light: ["#eef2f8", "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
      dark: ["#262a33", "#0d366b", "#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4", "#cde2fb"]
    },
    gray: {
      light: ["#f1f1ef", "#dcdcd8", "#c3c2bd", "#a7a6a0", "#8a8983", "#6c6b66", "#4f4e4a", "#33322f"],
      dark: ["#2a2b2e", "#3b3c3f", "#4f5054", "#66676b", "#7f8085", "#9a9ba0", "#b8b9bd", "#d8d9dc"]
    },
    // Diverging (signed values such as GP draws): two poles and a neutral midpoint at 0.5.
    div: {
      light: ["#2f2380", "#5b4fc0", "#a39be3", "#efeeea", "#e8c35c", "#c58f0e", "#8a5f00"],
      dark: ["#d4ceff", "#8f84e6", "#5146a6", "#2a2b2f", "#9a7416", "#d9a92e", "#f6d77f"]
    }
  };

  DI.ramp = function (name) {
    var stops = RAMPS[name || "blue"][DI.isDark() ? "dark" : "light"].map(hexToRgb);
    var m = stops.length - 1;
    return function (v) {
      if (!(v > 0)) v = 0;
      if (v > 1) v = 1;
      var t = v * m, i = Math.min(m - 1, Math.floor(t)), f = t - i;
      var a = stops[i], b = stops[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    };
  };

  // Categorical slots 1-3 (validated all-pairs in both modes) and one status colour.
  DI.colors = function () {
    var dark = DI.isDark();
    return {
      base: dark ? "#3987e5" : "#2a78d6",
      avg: dark ? "#d95926" : "#eb6834",
      max: dark ? "#199e70" : "#1baf7a",
      critical: "#d03b3b",
      ink: dark ? "#e6e7eb" : "#1b1d22",
      muted: dark ? "#8a8f9b" : "#858a94",
      rule: dark ? "rgba(255,255,255,0.11)" : "rgba(27,29,34,0.11)",
      surface: dark ? "#232427" : "#f7f7f5",
      accent: dark ? "#96a4ff" : "#2f44d3"
    };
  };

  DI.rgb = function (c, k) {
    k = k === undefined ? 1 : k;
    return "rgb(" + Math.round(c[0] * k) + "," + Math.round(c[1] * k) + "," + Math.round(c[2] * k) + ")";
  };

  /* Randomness ----------------------------------------------------------- */

  DI.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* Canvas --------------------------------------------------------------- */

  // A canvas that tracks its CSS width, keeps an aspect ratio and is sharp on HiDPI.
  DI.canvas = function (parent, aspect, cls) {
    var c = DI.el("canvas", "di-canvas" + (cls ? " " + cls : ""), parent);
    c._aspect = aspect || 1;
    return c;
  };

  DI.fit = function (c) {
    var w = c.clientWidth || 300;
    var h = Math.round(w / c._aspect);
    var dpr = Math.min(2, root.devicePixelRatio || 1);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.height = h + "px";
    }
    var ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  };

  // Paint an m x m grid of values in [0,1] (NaN = transparent) into an offscreen canvas.
  DI.heatImage = function (values, m, ramp) {
    var off = document.createElement("canvas");
    off.width = m; off.height = m;
    var octx = off.getContext("2d");
    var img = octx.createImageData(m, m);
    for (var i = 0; i < m * m; i++) {
      var v = values[i];
      if (v !== v) { img.data[4 * i + 3] = 0; continue; }
      var c = ramp(v);
      img.data[4 * i] = c[0]; img.data[4 * i + 1] = c[1]; img.data[4 * i + 2] = c[2]; img.data[4 * i + 3] = 255;
    }
    octx.putImageData(img, 0, 0);
    return off;
  };

  // A reusable m x m offscreen canvas: put(values, lut) paints values in [0,1] through a
  // 256-entry colour table (NaN = transparent). Cheap enough to call on every animation frame.
  DI.heatCanvas = function (m) {
    var off = document.createElement("canvas");
    off.width = m; off.height = m;
    var octx = off.getContext("2d"), img = octx.createImageData(m, m), d = img.data;
    return {
      canvas: off,
      put: function (values, lut, alpha) {
        var a = alpha === undefined ? 255 : Math.round(255 * alpha);
        for (var i = 0; i < m * m; i++) {
          var v = values[i];
          if (v !== v) { d[4 * i + 3] = 0; continue; }
          var k = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255) | 0;
          d[4 * i] = lut[3 * k]; d[4 * i + 1] = lut[3 * k + 1]; d[4 * i + 2] = lut[3 * k + 2]; d[4 * i + 3] = a;
        }
        octx.putImageData(img, 0, 0);
        return off;
      }
    };
  };

  DI.lut = function (ramp) {
    var t = new Uint8ClampedArray(256 * 3);
    for (var i = 0; i < 256; i++) {
      var c = ramp(i / 255);
      t[3 * i] = c[0]; t[3 * i + 1] = c[1]; t[3 * i + 2] = c[2];
    }
    return t;
  };

  // Run fn once, the first time el scrolls well into view (immediately if unsupported).
  DI.onVisible = function (el, fn) {
    if (!root.IntersectionObserver) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { io.disconnect(); fn(); return; }
      }
    }, { threshold: 0.55 });
    io.observe(el);
  };

  DI.reducedMotion = function () {
    return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  };

  DI.ease = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  // A dot with a 2px surface ring, so it reads on top of any heatmap.
  DI.dot = function (ctx, x, y, r, fill, ring) {
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, 2 * Math.PI);
    ctx.fillStyle = ring;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = fill;
    ctx.fill();
  };

  DI.ring = function (ctx, x, y, r, stroke, ring) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.lineWidth = 4;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.lineWidth = 1.75;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  };

  // Square markers (a second point identity that does not rely on colour).
  DI.square = function (ctx, x, y, r, fill, ring, hollow) {
    ctx.save();
    if (hollow) {
      ctx.lineWidth = 4; ctx.strokeStyle = ring; ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
      ctx.lineWidth = 1.75; ctx.strokeStyle = fill; ctx.strokeRect(x - r, y - r, 2 * r, 2 * r);
    } else {
      ctx.fillStyle = ring; ctx.fillRect(x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4);
      ctx.fillStyle = fill; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    ctx.restore();
  };

  // Text with a surface halo, for labels drawn over heatmaps.
  DI.label = function (ctx, x, y, txt, C, opts) {
    opts = opts || {};
    ctx.save();
    ctx.font = (opts.weight || "600") + " " + (opts.size || 12) + "px " + (opts.family || "Roboto, sans-serif");
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "alphabetic";
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.strokeStyle = C.surface;
    ctx.fillStyle = opts.color || C.ink;
    ctx.strokeText(txt, x, y);
    ctx.fillText(txt, x, y);
    ctx.restore();
  };

  /* Controls ------------------------------------------------------------- */

  DI.toolbar = function (parent) {
    return DI.el("div", "di-toolbar", parent);
  };

  DI.segmented = function (parent, label, options, value, onchange) {
    var wrap = DI.el("div", "di-field", parent);
    DI.el("span", "di-field-label", wrap, label);
    var group = DI.el("div", "di-segmented", wrap);
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", label);
    var buttons = [];
    function set(v, silent) {
      value = v;
      for (var i = 0; i < buttons.length; i++) {
        var on = buttons[i]._value === v;
        buttons[i].setAttribute("aria-checked", on ? "true" : "false");
        buttons[i].tabIndex = on ? 0 : -1;
      }
      if (!silent) onchange(v);
    }
    options.forEach(function (o) {
      var b = DI.el("button", "di-seg", group, o.label);
      b.type = "button";
      b.setAttribute("role", "radio");
      b._value = o.value;
      b.addEventListener("click", function () { set(o.value); });
      buttons.push(b);
    });
    group.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var idx = 0;
      for (var i = 0; i < buttons.length; i++) if (buttons[i]._value === value) idx = i;
      idx = (idx + (e.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length;
      set(buttons[idx]._value);
      buttons[idx].focus();
      e.preventDefault();
    });
    set(value, true);
    return { set: set, get: function () { return value; }, el: wrap };
  };

  DI.slider = function (parent, label, opts, onchange) {
    var wrap = DI.el("label", "di-field di-field-slider", parent);
    DI.el("span", "di-field-label", wrap, label);
    var input = DI.el("input", null, wrap);
    input.type = "range";
    input.min = opts.min; input.max = opts.max; input.step = opts.step; input.value = opts.value;
    var out = DI.el("span", "di-field-value", wrap);
    function show() { out.textContent = opts.format ? opts.format(+input.value) : input.value; }
    input.addEventListener("input", function () { show(); onchange(+input.value); });
    show();
    return {
      input: input,
      set: function (v) { input.value = v; show(); },
      get: function () { return +input.value; }
    };
  };

  DI.button = function (parent, label, onclick, primary) {
    var b = DI.el("button", "di-btn" + (primary ? " di-btn-primary" : ""), parent, label);
    b.type = "button";
    b.addEventListener("click", onclick);
    return b;
  };

  DI.toggle = function (parent, label, on, onchange) {
    var b = DI.el("button", "di-switch", parent);
    b.type = "button";
    b.setAttribute("role", "switch");
    DI.el("span", "di-switch-track", b);
    DI.el("span", "di-switch-label", b, label);
    function set(v, silent) {
      on = !!v;
      b.setAttribute("aria-checked", on ? "true" : "false");
      if (!silent) onchange(on);
    }
    b.addEventListener("click", function () { set(!on); });
    set(on, true);
    return { set: set, get: function () { return on; } };
  };

  DI.stats = function (parent, items) {
    var wrap = DI.el("div", "di-stats", parent);
    wrap.setAttribute("aria-live", "polite");
    var out = {};
    items.forEach(function (it) {
      var s = DI.el("div", "di-stat", wrap);
      if (it.color) {
        var lab = DI.el("span", "di-stat-label", s);
        var key = DI.el("i", "di-key", lab);
        key.style.background = it.color;
        lab.appendChild(document.createTextNode(it.label));
        out[it.key + "Key"] = key;
      } else {
        DI.el("span", "di-stat-label", s, it.label);
      }
      out[it.key] = DI.el("span", "di-stat-value", s, it.value || "");
    });
    return out;
  };

  // One floating tooltip per widget; values lead, labels follow.
  DI.tooltip = function (host) {
    host.style.position = "relative";
    var tip = DI.el("div", "di-tip", host);
    tip.setAttribute("role", "status");
    return {
      show: function (x, y, rows) {
        while (tip.firstChild) tip.removeChild(tip.firstChild);
        rows.forEach(function (r) {
          var row = DI.el("div", "di-tip-row", tip);
          if (r.color) { var k = DI.el("i", "di-tip-key", row); k.style.background = r.color; }
          DI.el("strong", null, row, r.value);
          if (r.label) DI.el("span", null, row, r.label);
        });
        tip.style.display = "block";
        var hw = host.clientWidth, tw = tip.offsetWidth;
        var left = x + 14 + tw > hw ? x - 14 - tw : x + 14;
        tip.style.left = Math.max(0, left) + "px";
        tip.style.top = Math.max(0, y - 10) + "px";
      },
      hide: function () { tip.style.display = "none"; }
    };
  };

  DI.fmt = function (v, d) {
    return (Math.abs(v) < 1e-12 ? 0 : v).toFixed(d === undefined ? 2 : d);
  };

  // Pointer position relative to an element, in CSS pixels.
  DI.pointer = function (e, el) {
    var r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
})(typeof window !== "undefined" ? window : this);
