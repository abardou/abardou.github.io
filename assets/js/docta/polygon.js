/*
 * Docta Ignorantia: Cusa's inscribed polygon.
 * Mounts on any element with data-di-widget="polygon". Colours come from the
 * .di-svg-* classes in _sass/_blog.scss, so light and dark themes just work.
 * ES5 only: the Docker build minifies JS with uglifier.
 */
(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";
  var N_MIN = 3;
  var N_MAX = 24; // beyond this the vertices crowd together and stop being readable

  function el(name, attrs, parent) {
    var node = document.createElementNS(NS, name);
    for (var key in attrs) node.setAttribute(key, attrs[key]);
    if (parent) parent.appendChild(node);
    return node;
  }

  function text(parent, x, y, content, anchor) {
    var node = el("text", { x: x, y: y, class: "di-svg-label", "text-anchor": anchor || "start" }, parent);
    node.textContent = content;
    return node;
  }

  // Fraction of the disc covered by the inscribed regular n-gon.
  function covered(n) { return (n / (2 * Math.PI)) * Math.sin((2 * Math.PI) / n); }
  function uncovered(n) { return 1 - covered(n); }

  function vertex(n, k, cx, cy, r) {
    var a = -Math.PI / 2 + (2 * Math.PI * k) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  }

  function mount(root) {
    var initial = Math.min(N_MAX, Math.max(N_MIN, parseInt(root.getAttribute("data-n") || "6", 10)));

    var grid = document.createElement("div");
    grid.className = "di-widget-grid";

    // Left: the polygon inside its circle.
    var shape = el("svg", { viewBox: "0 0 240 240", role: "img" }, grid);
    var shapeTitle = el("title", {}, shape);
    el("circle", { cx: 120, cy: 120, r: 100, class: "di-svg-ideal" }, shape);
    var poly = el("polygon", { class: "di-svg-shape" }, shape);
    var vertices = el("g", {}, shape);

    // Right: uncovered fraction of the disc against the number of sides.
    var W = 360, H = 240, m = { l: 44, r: 14, t: 22, b: 40 };
    var plot = el("svg", { viewBox: "0 0 " + W + " " + H, role: "img" }, grid);
    el("title", {}, plot).textContent = "Uncovered fraction of the disc as a function of the number of sides";
    var Y_MAX = 0.6;
    function x(n) { return m.l + ((n - N_MIN) / (N_MAX - N_MIN)) * (W - m.l - m.r); }
    function y(v) { return m.t + (1 - v / Y_MAX) * (H - m.t - m.b); }

    [0, 0.2, 0.4, 0.6].forEach(function (v) {
      el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: v === 0 ? "di-svg-axis" : "di-svg-grid" }, plot);
      text(plot, m.l - 8, y(v) + 4, Math.round(v * 100) + "%", "end");
    });
    for (var t = N_MIN; t <= N_MAX; t += 3) {
      el("line", { x1: x(t), x2: x(t), y1: H - m.b, y2: H - m.b + 4, class: "di-svg-axis" }, plot);
      text(plot, x(t), H - m.b + 17, String(t), "middle");
    }
    text(plot, m.l - 8, 11, "uncovered", "end");
    text(plot, W - m.r, H - 3, "number of sides", "end");

    var d = "";
    for (var n = N_MIN; n <= N_MAX; n++) d += (n === N_MIN ? "M" : "L") + x(n).toFixed(2) + "," + y(uncovered(n)).toFixed(2);
    el("path", { d: d, class: "di-svg-line di-svg-faint" }, plot);
    for (n = N_MIN; n <= N_MAX; n++) el("circle", { cx: x(n), cy: y(uncovered(n)), r: 2.2, class: "di-svg-point" }, plot);
    text(plot, x(10) + 4, y(uncovered(10)) - 14, "\u221D 1/n\u00B2", "start");

    var guide = el("line", { class: "di-svg-grid" }, plot);
    var halo = el("circle", { r: 9, class: "di-svg-halo" }, plot);
    var dot = el("circle", { r: 4, class: "di-svg-dot" }, plot);

    // Readout and control.
    var stats = document.createElement("div");
    stats.className = "di-stats";
    stats.setAttribute("aria-live", "polite");
    stats.innerHTML =
      '<div class="di-stat"><span class="di-stat-label">Sides</span><span class="di-stat-value" data-k="n"></span></div>' +
      '<div class="di-stat"><span class="di-stat-label">Covered</span><span class="di-stat-value" data-k="covered"></span></div>' +
      '<div class="di-stat"><span class="di-stat-label">Uncovered</span><span class="di-stat-value" data-k="uncovered"></span></div>';

    var id = "di-polygon-" + Math.random().toString(36).slice(2, 8);
    var control = document.createElement("div");
    control.className = "di-control";
    control.innerHTML =
      '<label for="' + id + '">Sides</label>' +
      '<input id="' + id + '" type="range" min="' + N_MIN + '" max="' + N_MAX + '" step="1">';
    var slider = control.querySelector("input");

    function render(n) {
      var pts = [];
      while (vertices.firstChild) vertices.removeChild(vertices.firstChild);
      for (var k = 0; k < n; k++) {
        var v = vertex(n, k, 120, 120, 100);
        pts.push(v[0].toFixed(2) + "," + v[1].toFixed(2));
        el("circle", { cx: v[0], cy: v[1], r: 2.4, class: "di-svg-dot" }, vertices);
      }
      poly.setAttribute("points", pts.join(" "));
      shapeTitle.textContent = "A regular polygon with " + n + " sides inscribed in a circle";

      var px = x(n), py = y(uncovered(n));
      guide.setAttribute("x1", px); guide.setAttribute("x2", px);
      guide.setAttribute("y1", py); guide.setAttribute("y2", H - m.b);
      halo.setAttribute("cx", px); halo.setAttribute("cy", py);
      dot.setAttribute("cx", px); dot.setAttribute("cy", py);

      var u = uncovered(n) * 100;
      stats.querySelector('[data-k="n"]').textContent = n;
      stats.querySelector('[data-k="covered"]').textContent = (100 - u).toFixed(2) + "%";
      stats.querySelector('[data-k="uncovered"]').textContent = u.toFixed(2) + "%";
      slider.setAttribute("aria-valuetext", n + " sides, " + u.toFixed(2) + "% of the disc uncovered");
    }

    slider.value = initial;
    slider.addEventListener("input", function () { render(+slider.value); });

    var caption = root.querySelector("figcaption");
    root.insertBefore(grid, caption);
    root.insertBefore(stats, caption);
    root.insertBefore(control, caption);
    render(initial);
  }

  function init() {
    var roots = document.querySelectorAll('[data-di-widget="polygon"]');
    for (var i = 0; i < roots.length; i++) mount(roots[i]);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
