/*
 * Docta Ignorantia: maths and shared drawing for "Symmetries as an inductive bias".
 * Groups (dihedral D_n, and all rotations as n = Infinity), landscapes, the three kernels,
 * a GP-UCB race, random GP draws, and the kaleidoscope folding engine.
 * Requires core.js and gp.js in the browser; the maths also runs in Node for testing.
 * ES5 only: the Docker build minifies JS with uglifier.
 */
(function (root) {
  "use strict";

  var TAU = 2 * Math.PI;
  var gpApi = root && root.DI ? root.DI.gp : require("./gp.js");
  var SYM = { TAU: TAU };

  /* Groups ---------------------------------------------------------------- */

  // D_n: n rotations and n mirrors (|G| = 2n), as 2x2 matrices [a, b, c, d].
  var groups = {};
  SYM.group = function (n) {
    if (groups[n]) return groups[n];
    var G = [];
    for (var k = 0; k < n; k++) {
      var a = TAU * k / n, c = Math.cos(a), s = Math.sin(a);
      G.push([c, -s, s, c]);   // rotation by a
      G.push([c, s, s, -c]);   // mirror across the line at angle a/2
    }
    groups[n] = G;
    return G;
  };

  SYM.orbit = function (G, x, y) {
    var out = [];
    for (var i = 0; i < G.length; i++) out.push([G[i][0] * x + G[i][1] * y, G[i][2] * x + G[i][3] * y]);
    return out;
  };

  // Representative in the fundamental domain: the wedge 0 <= angle <= pi/n, or the ray [0, 1] for rotations.
  SYM.fold = function (x, y, n) {
    var r = Math.sqrt(x * x + y * y);
    if (!isFinite(n)) return [r, 0];
    var w = TAU / n, t = Math.atan2(y, x);
    t = ((t % w) + w) % w;
    if (t > w / 2) t = w - t;
    return [r * Math.cos(t), r * Math.sin(t)];
  };

  /* Landscapes ------------------------------------------------------------ */

  // A D_n-invariant landscape on the unit disc (maximum 1 at 2n points on r = 0.62).
  SYM.objective = function (x, y, n) {
    var r = Math.sqrt(x * x + y * y), t = Math.atan2(y, x);
    var A = 0.5 * Math.cos(n * t) - 0.5 * Math.cos(2 * n * t);
    var ring = Math.exp(-(r - 0.62) * (r - 0.62) / (2 * 0.12 * 0.12)) * (0.2 + 0.8 * (A + 1) / 1.5625);
    var inner = 0.5 * Math.exp(-(r - 0.22) * (r - 0.22) / (2 * 0.09 * 0.09)) * (0.5 + 0.5 * Math.cos(n * t + Math.PI));
    return ring + inner;
  };

  SYM.peaks = function (n) {
    var out = [], t0 = Math.acos(0.25) / n;
    for (var k = 0; k < n; k++) {
      var b = TAU * k / n;
      out.push([0.62 * Math.cos(b + t0), 0.62 * Math.sin(b + t0)]);
      out.push([0.62 * Math.cos(b - t0), 0.62 * Math.sin(b - t0)]);
    }
    return out;
  };

  // A rotation-invariant landscape: a synthetic function of the radius only. It is the paper's radial benchmark,
  // the negated one-dimensional Rastrigin function of a rescaled radius, mapped onto the unit disc and normalized
  // to [0, 1]: a local maximum at the center, a trough, and the global maximum on the circle r = 0.85.
  SYM.radial = function (r) {
    var z = (r - 0.85) * 0.8 / 0.85;
    return 1 - (10 + z * z - 10 * Math.cos(TAU * z)) / 20.25;
  };
  SYM.RADIAL_PEAK = 0.85;

  SYM.land = function (x, y, n) {
    return isFinite(n) ? SYM.objective(x, y, n) : SYM.radial(Math.sqrt(x * x + y * y));
  };

  /* A small wireless network ------------------------------------------------ */

  // Two identical antennas at positions p1, p2 along a corridor [0, 1] x [-0.15, 0.15], mounted slightly
  // above the users. Each user joins the antenna it hears best; its rate follows from the
  // signal-to-interference-plus-noise ratio (path-loss exponent 3.5, the other antenna interferes, 20 MHz),
  // and the airtime of each antenna is shared equally among its users. A toy model, but the symmetry is real.
  SYM.WIFI = { K: 0.28, alpha: 3.5, h: 0.04, band: 20, half: 0.15 };

  SYM.wifiUsers = function (seed) {
    var rnd = mulberry(seed), out = [], i;
    function g() { return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd()); }
    function clampX(x) { return Math.max(0.03, Math.min(0.97, x)); }
    function y() { return (2 * rnd() - 1) * 0.12; }
    for (i = 0; i < 7; i++) out.push([clampX(0.22 + 0.07 * g()), y()]);   // one group of offices
    for (i = 0; i < 6; i++) out.push([clampX(0.74 + 0.05 * g()), y()]);   // another
    for (i = 0; i < 3; i++) out.push([0.35 + 0.25 * rnd(), y()]);         // a few in between
    return out;
  };

  // Signal of an antenna at (p, 0) for a user at (x, y), relative to the noise.
  function wifiSnr(x, y, p) {
    var W = SYM.WIFI, d2 = (x - p) * (x - p) + y * y + W.h * W.h;
    return W.K * Math.pow(d2, -W.alpha / 2);
  }

  // The antenna a user at (x, y) joins (0 or 1) and its rate in Mbit/s before airtime sharing.
  SYM.wifiLink = function (x, y, p1, p2) {
    var s1 = wifiSnr(x, y, p1), s2 = wifiSnr(x, y, p2), a = s1 >= s2 ? 0 : 1;
    var sinr = a === 0 ? s1 / (1 + s2) : s2 / (1 + s1);
    return { ap: a, rate: SYM.WIFI.band * Math.log(1 + sinr) / Math.LN2 };
  };

  // Total throughput in Mbit/s. Swapping p1 and p2 relabels the antennas and changes nothing else.
  SYM.wifiThroughput = function (users, p1, p2) {
    var sum = [0, 0], cnt = [0, 0];
    for (var i = 0; i < users.length; i++) {
      var l = SYM.wifiLink(users[i][0], users[i][1], p1, p2);
      sum[l.ap] += l.rate; cnt[l.ap]++;
    }
    return (cnt[0] ? sum[0] / cnt[0] : 0) + (cnt[1] ? sum[1] / cnt[1] : 0);
  };

  /* Kernels --------------------------------------------------------------- */

  // exp(-x) I_0(x), the scaled modified Bessel function (Abramowitz & Stegun 9.8.1-2, error < 2e-7).
  SYM.i0e = function (x) {
    x = Math.abs(x);
    if (x <= 3.75) {
      var t = x / 3.75; t *= t;
      return Math.exp(-x) * (1 + t * (3.5156229 + t * (3.0899424 + t * (1.2067492 + t * (0.2659732 + t * (0.0360768 + t * 0.0045813))))));
    }
    var u = 3.75 / x;
    return (0.39894228 + u * (0.01328592 + u * (0.00225319 + u * (-0.00157565 + u * (0.00916281 +
      u * (-0.02057706 + u * (0.02635537 + u * (-0.01647633 + u * 0.00392377)))))))) / Math.sqrt(x);
  };

  // A point carries its radius, folded coordinates and orbit, so the kernels stay cheap.
  SYM.point = function (x, y, n) {
    return {
      x: x, y: y, r: Math.sqrt(x * x + y * y),
      f: SYM.fold(x, y, n),
      orb: isFinite(n) ? SYM.orbit(SYM.group(n), x, y) : null
    };
  };

  function kb(dx, dy, l) { return Math.exp(-(dx * dx + dy * dy) / (2 * l * l)); }
  SYM.kb = kb;

  SYM.kBase = function (a, b, l) { return kb(a.x - b.x, a.y - b.y, l); };

  // Max over the orbit. For mirror groups it is the base kernel on the folded points;
  // for all rotations it is the base kernel on the radii.
  SYM.kMax = function (a, b, l) { return kb(a.f[0] - b.f[0], a.f[1] - b.f[1], l); };

  // Average over the orbit. For all rotations, the closed form
  // exp(-(r^2 + r'^2) / 2l^2) I_0(r r' / l^2), written with i0e for stability.
  SYM.kAvg = function (a, b, l) {
    if (!a.orb) {
      var d = a.r - b.r;
      return Math.exp(-d * d / (2 * l * l)) * SYM.i0e(a.r * b.r / (l * l));
    }
    var s = 0, o = b.orb;
    for (var i = 0; i < o.length; i++) s += kb(a.x - o[i][0], a.y - o[i][1], l);
    return s / o.length;
  };

  /* The projected max kernel k+ (the coda) ----------------------------------- */

  // C_n: the n rotations by multiples of 2 pi / n, without mirrors.
  SYM.cyclic = function (n) {
    var G = [];
    for (var k = 0; k < n; k++) {
      var a = TAU * k / n, c = Math.cos(a), s = Math.sin(a);
      G.push([c, -s, s, c]);
    }
    return G;
  };

  // max over the group of the base kernel, for plain [x, y] points and any finite group of matrices
  SYM.kMaxG = function (a, b, G, l) {
    var best = 0;
    for (var i = 0; i < G.length; i++) {
      var g = G[i], dx = a[0] - (g[0] * b[0] + g[1] * b[1]), dy = a[1] - (g[2] * b[0] + g[3] * b[1]);
      var v = Math.exp(-(dx * dx + dy * dy) / (2 * l * l));
      if (v > best) best = v;
    }
    return best;
  };

  // k+(x, x') = k_max(x, D) K+^dagger k_max(D, x'), where K+ keeps the eigenvalues of K = k_max(D, D)
  // above a threshold (1e-4, as in the paper's code): eigenvalue clipping, then the Nystrom extension.
  SYM.Projected = function (D, G, l, tol) {
    var n = D.length, K = new Float64Array(n * n), i, j;
    for (i = 0; i < n; i++) for (j = 0; j <= i; j++) K[i * n + j] = K[j * n + i] = SYM.kMaxG(D[i], D[j], G, l);
    var E = gpApi.eigh(K, n), keep = [];
    this.negative = 0;
    for (i = 0; i < n; i++) {
      if (E.values[i] < -1e-10) this.negative++;
      if (E.values[i] > (tol || 1e-4)) keep.push(i);
    }
    this.D = D; this.G = G; this.l = l; this.n = n; this.E = E; this.keep = keep;
    this.minEig = E.values[0];
  };

  // Weights w = K+^dagger k_max(D, x0), so that k+(x0, x) = sum_j w_j k_max(D_j, x).
  SYM.Projected.prototype.weights = function (x0) {
    var n = this.n, a = new Float64Array(n), w = new Float64Array(n), V = this.E.vectors, i, j;
    for (i = 0; i < n; i++) a[i] = SYM.kMaxG(x0, this.D[i], this.G, this.l);
    for (var t = 0; t < this.keep.length; t++) {
      var k = this.keep[t], c = 0;
      for (i = 0; i < n; i++) c += V[i * n + k] * a[i];
      c /= this.E.values[k];
      for (j = 0; j < n; j++) w[j] += c * V[j * n + k];
    }
    return w;
  };

  SYM.discGrid = function (m) {
    var pts = [];
    for (var i = 0; i < m; i++) {
      for (var j = 0; j < m; j++) {
        var x = -1 + 2 * j / (m - 1), y = -1 + 2 * i / (m - 1);
        if (x * x + y * y <= 1 + 1e-9) pts.push([x, y]);
      }
    }
    return pts;
  };

  /* The race -------------------------------------------------------------- */

  // The protocol of the paper's experiments: 5 random starting points, then GP-UCB with
  // beta_t = 0.5 d log(2n); observations corrupted by noise of variance 2% of the landscape's variance;
  // outputs standardized and the hyperparameters (signal variance, lengthscale, noise) fitted by maximum
  // likelihood at every step, each model with its own kernel. Candidates: a 41 x 41 grid over the disc.
  SYM.RACE = { init: 5, T: 30, m: 41, noise: 0.02 };

  var LS = [], RHO = [];
  (function () {
    for (var i = 0; i < 26; i++) LS.push(Math.exp(Math.log(0.03) + i * (Math.log(1.5) - Math.log(0.03)) / 25));
    for (i = 0; i < 11; i++) RHO.push(Math.exp(Math.log(1e-4) + i * Math.log(1e4) / 10));
  })();

  // Unit-variance kernels by name.
  SYM.kUnit = function (name, a, b, l) {
    return name === "base" ? SYM.kBase(a, b, l) : name === "max" ? SYM.kMax(a, b, l) : SYM.kAvg(a, b, l);
  };

  // Maximum likelihood for the kernel lam * k(., .; l) with noise variance lam * rho. For fixed (l, rho) the best
  // lam is y' (K + rho I)^-1 y / n in closed form; (l, rho) are searched on a log grid.
  SYM.fitHyper = function (name, X, y) {
    var n = X.length, K0 = new Float64Array(n * n), A = new Float64Array(n * n), best = { v: Infinity };
    for (var a = 0; a < LS.length; a++) {
      var l = LS[a], i, j;
      for (i = 0; i < n; i++) for (j = 0; j <= i; j++) K0[i * n + j] = K0[j * n + i] = SYM.kUnit(name, X[i], X[j], l);
      for (var b = 0; b < RHO.length; b++) {
        A.set(K0);
        for (i = 0; i < n; i++) A[i * n + i] += RHO[b] + 1e-8;
        var L = gpApi.cholesky(A, n), z = gpApi.forward(L, n, y), q = 0, logdet = 0;
        for (i = 0; i < n; i++) { q += z[i] * z[i]; logdet += Math.log(L[i * n + i]); }
        var lam = q / n, v = 0.5 * n * Math.log(lam) + logdet;
        if (v < best.v) best = { v: v, lam: lam, l: l, rho: RHO[b] };
      }
    }
    return best;
  };

  function gaussian(rnd) {
    var u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  // Three GP-UCB optimizers (base, averaged, max kernels) on the same landscape and start.
  // n is the number of mirrors, or Infinity for all rotations.
  SYM.Race = function (n, seed) {
    var P = SYM.RACE, i, rnd = mulberry(seed);
    this.n = n;
    this.rnd = rnd;
    this.grid = SYM.discGrid(P.m).map(function (q) { return SYM.point(q[0], q[1], n); });
    var fs = this.grid.map(function (q) { return SYM.land(q.x, q.y, n); });
    var mean = fs.reduce(function (s, v) { return s + v; }, 0) / fs.length;
    this.fstar = Math.max.apply(null, fs);
    this.noiseSd = Math.sqrt(P.noise * fs.reduce(function (s, v) { return s + (v - mean) * (v - mean); }, 0) / fs.length);

    var start = [];
    for (i = 0; i < P.init; i++) {
      var r = Math.sqrt(rnd()), t = TAU * rnd();
      start.push(SYM.point(r * Math.cos(t), r * Math.sin(t), n));
    }
    var f0 = start.map(function (q) { return SYM.land(q.x, q.y, n); });
    var self = this;
    this.models = ["base", "avg", "max"].map(function (name) {
      // the same noise sequence for every model, so they differ only by their kernel
      var noise = mulberry(seed * 7919 + 13);
      return {
        name: name,
        noise: noise,
        X: start.slice(),
        f: f0.slice(),
        y: f0.map(function (v) { return v + self.noiseSd * gaussian(noise); }),
        queries: [],
        cum: [0],
        best: Math.max.apply(null, f0),
        mu: new Float64Array(0)
      };
    });
    this.t = 0;
    this.update();
  };

  SYM.Race.prototype.update = function () {
    var grid = this.grid, rnd = this.rnd;
    this.models.forEach(function (m) {
      var n = m.y.length, mean = 0, sd = 0, i;
      for (i = 0; i < n; i++) mean += m.y[i] / n;
      for (i = 0; i < n; i++) sd += (m.y[i] - mean) * (m.y[i] - mean) / (n - 1);
      sd = Math.sqrt(sd) || 1;
      var ys = m.y.map(function (v) { return (v - mean) / sd; });
      var hp = SYM.fitHyper(m.name, m.X, ys), name = m.name;
      m.hp = hp;
      m.stat = { mean: mean, sd: sd };
      m.gp = new gpApi.GP(function (a, b) { return hp.lam * SYM.kUnit(name, a, b, hp.l); }, hp.lam * (hp.rho + 1e-8)).fit(m.X, ys);
      m.sqrtBeta = Math.sqrt(0.5 * 2 * Math.log(2 * n));
      var mu = new Float64Array(grid.length), bestU = -Infinity, ties = [];
      for (i = 0; i < grid.length; i++) {
        var p = m.gp.predict(grid[i], hp.lam * SYM.kUnit(name, grid[i], grid[i], hp.l));
        mu[i] = mean + sd * p.mu;
        var u = p.mu + m.sqrtBeta * Math.sqrt(p.v);
        if (u > bestU + 1e-9) { bestU = u; ties = [i]; } else if (u > bestU - 1e-9) ties.push(i);
      }
      m.mu = mu;
      // invariant models see every copy of a point alike: break ties at random, not by grid order
      m.next = ties[Math.floor(rnd() * ties.length)];
    });
  };

  SYM.Race.prototype.step = function () {
    if (this.t >= SYM.RACE.T) return false;
    var self = this;
    this.models.forEach(function (m) {
      var q = self.grid[m.next], v = SYM.land(q.x, q.y, self.n);
      m.X.push(q); m.f.push(v); m.y.push(v + self.noiseSd * gaussian(m.noise)); m.queries.push(q);
      m.best = Math.max(m.best, v);
      m.cum.push(m.cum[m.cum.length - 1] + (self.fstar - v));
    });
    this.t++;
    this.update();
    return true;
  };

  // Posterior of model idx along the ray (radii rs), in the units of the landscape: what an invariant model
  // believes on the orbifold.
  SYM.Race.prototype.alongRay = function (idx, rs) {
    var m = this.models[idx], n = this.n;
    return rs.map(function (r) {
      var p = SYM.point(r, 0, n), q = m.gp.predict(p, m.hp.lam * SYM.kUnit(m.name, p, p, m.hp.l));
      return { mu: m.stat.mean + m.stat.sd * q.mu, sd: m.stat.sd * Math.sqrt(q.v) };
    });
  };

  /* Random draws from the base GP (random Fourier features) ---------------- */

  // h ~ GP(0, Gaussian kernel with lengthscale l), sampled on an M x M cell-centred grid over [-1, 1]^2
  // (row 0 at the top). The sum over features is separable in x and y, which keeps it fast.
  SYM.drawGrid = function (l, nf, seed, M) {
    var rnd = mulberry(seed), spare = null;
    function gauss() {
      if (spare !== null) { var s = spare; spare = null; return s; }
      var u = 1 - rnd(), v = rnd(), rad = Math.sqrt(-2 * Math.log(u));
      spare = rad * Math.sin(TAU * v);
      return rad * Math.cos(TAU * v);
    }
    var cx = new Float64Array(nf * M), sx = new Float64Array(nf * M);
    var cy = new Float64Array(nf * M), sy = new Float64Array(nf * M), a = new Float64Array(nf);
    var f, i, j;
    for (f = 0; f < nf; f++) {
      var w1 = gauss() / l, w2 = gauss() / l, b = TAU * rnd();
      a[f] = gauss() * Math.sqrt(2 / nf);
      for (j = 0; j < M; j++) {
        var x = -1 + 2 * (j + 0.5) / M;
        cx[f * M + j] = Math.cos(w1 * x); sx[f * M + j] = Math.sin(w1 * x);
      }
      for (i = 0; i < M; i++) {
        var y = 1 - 2 * (i + 0.5) / M;
        cy[f * M + i] = Math.cos(w2 * y + b); sy[f * M + i] = Math.sin(w2 * y + b);
      }
    }
    var out = new Float64Array(M * M);
    for (f = 0; f < nf; f++) {
      var off = f * M;
      for (i = 0; i < M; i++) {
        var ci = a[f] * cy[off + i], si = a[f] * sy[off + i], row = i * M;
        for (j = 0; j < M; j++) out[row + j] += cx[off + j] * ci - sx[off + j] * si;
      }
    }
    return out;
  };

  // Bilinear lookup in a cell-centred M x M grid over [-1, 1]^2.
  SYM.sample = function (grid, M, x, y) {
    var px = (x + 1) / 2 * M - 0.5, py = (1 - y) / 2 * M - 0.5;
    if (px < 0) px = 0; if (py < 0) py = 0;
    if (px > M - 1.001) px = M - 1.001; if (py > M - 1.001) py = M - 1.001;
    var j = px | 0, i = py | 0, fx = px - j, fy = py - i, k = i * M + j;
    return (grid[k] * (1 - fx) + grid[k + 1] * fx) * (1 - fy) + (grid[k + M] * (1 - fx) + grid[k + M + 1] * fx) * fy;
  };

  function mulberry(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  SYM.rng = mulberry;

  /* Kaleidoscope geometry --------------------------------------------------- */

  // Unfolding the 2n wedges of D_n one flap at a time: w in [0, 1] (0 folded, 1 open).
  // Flap k (1 .. 2n-1) swings about the mirror at angle k pi/n; s = -1 lies folded, s = 1 lies open.
  SYM.unfoldState = function (n, w) {
    var m = 2 * n - 1, t = Math.max(0, Math.min(1, w)) * m;
    if (t >= m - 1e-9) return { k: 2 * n, s: 1, n: n };
    var k = Math.floor(t) + 1, sig = t - (k - 1);
    var e = sig < 0.5 ? 2 * sig * sig : 1 - Math.pow(-2 * sig + 2, 2) / 2;
    return { k: k, s: -Math.cos(Math.PI * e), n: n };
  };

  // p -> p_parallel + s p_perpendicular, relative to the line at angle theta: [m11, m12, m21, m22].
  SYM.flap = function (theta, s) {
    var c = Math.cos(theta), sn = Math.sin(theta);
    return [c * c + s * sn * sn, (1 - s) * c * sn, (1 - s) * c * sn, sn * sn + s * c * c];
  };

  // The copy of (x, y) that lies in wedge k.
  SYM.inWedge = function (x, y, n, k) {
    var a = Math.PI / n, f = SYM.fold(x, y, n), r = Math.sqrt(x * x + y * y), psi = Math.atan2(f[1], f[0]);
    var ang = k % 2 === 0 ? k * a + psi : (k + 1) * a - psi;
    return [r * Math.cos(ang), r * Math.sin(ang)];
  };

  // Where a point of the open disc sits in the unfolding state st.
  SYM.placeUnfold = function (x, y, st) {
    var n = st.n;
    if (st.k >= 2 * n) return [x, y];
    var a = Math.PI / n, t = Math.atan2(y, x);
    if (t < 0) t += TAU;
    var j = Math.min(2 * n - 1, Math.floor(t / a));
    if (j < st.k) return [x, y];
    var q = SYM.inWedge(x, y, n, st.k), M = SYM.flap(st.k * a, st.s);
    return [M[0] * q[0] + M[1] * q[1], M[2] * q[0] + M[3] * q[1]];
  };

  // Largest angle covered by the visible paper in state st (for framing).
  SYM.footprint = function (st) {
    var a = Math.PI / st.n;
    if (st.k >= 2 * st.n) return TAU;
    return st.k * a + a * Math.max(0, st.s);
  };

  if (typeof module !== "undefined" && module.exports) module.exports = SYM;
  if (!root || !root.document) return;

  /* ======================================================================
   * Shared drawing helpers (browser only)
   * ==================================================================== */

  var DI = root.DI, UI = {};
  SYM.ui = UI;
  DI.sym = SYM;

  UI.discMapper = function (W, H, pad) {
    var rad = Math.min(W, H) / 2 - pad, cx = W / 2, cy = H / 2;
    return {
      rad: rad, cx: cx, cy: cy,
      px: function (x, y) { return [cx + x * rad, cy - y * rad]; },
      inv: function (px, py) { return [(px - cx) / rad, (cy - py) / rad]; }
    };
  };

  // A zoomed view of a mapper: the box [x0, x1] x [y0, y1] is centred and scaled to fill the frame.
  UI.zoom = function (map, box, amount, cap) {
    var w = box[1] - box[0], h = box[3] - box[2];
    var z = Math.max(1, Math.min(cap || 2.4, 1.9 / Math.max(w, h, 1e-6)));
    var s = 1 + amount * (z - 1), cx = amount * (box[0] + box[1]) / 2, cy = amount * (box[2] + box[3]) / 2;
    return {
      rad: map.rad * s,
      cx: map.cx - cx * map.rad * s,
      cy: map.cy + cy * map.rad * s,
      px: function (x, y) { return map.px((x - cx) * s, (y - cy) * s); },
      inv: function (px, py) { var q = map.inv(px, py); return [q[0] / s + cx, q[1] / s + cy]; }
    };
  };

  // Bounding box of the sector of the unit disc between angles 0 and t (t <= 2 pi).
  UI.sectorBox = function (t) {
    var xs = [0, 1, Math.cos(t)], ys = [0, 0, Math.sin(t)];
    if (t >= Math.PI / 2) { xs.push(0); ys.push(1); }
    if (t >= Math.PI) { xs.push(-1); ys.push(0); }
    if (t >= 1.5 * Math.PI) { xs.push(0); ys.push(-1); }
    return [Math.min.apply(null, xs), Math.max.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, ys)];
  };

  UI.clampDisc = function (p, rmax) {
    var r = Math.sqrt(p[0] * p[0] + p[1] * p[1]);
    rmax = rmax || 0.98;
    return r > rmax ? [p[0] * rmax / r, p[1] * rmax / r] : p;
  };

  // A landscape (dihedral, or radial when n is infinite) as an m x m image over the disc.
  UI.landscapeImage = function (n, m, ramp) {
    var vals = new Float64Array(m * m);
    for (var i = 0; i < m; i++) {
      for (var j = 0; j < m; j++) {
        var x = -1 + 2 * (j + 0.5) / m, y = 1 - 2 * (i + 0.5) / m;
        vals[i * m + j] = x * x + y * y <= 1.03 ? SYM.land(x, y, n) : NaN;
      }
    }
    return DI.heatImage(vals, m, ramp);
  };

  // Canvas path of the sector between math angles t0 < t1 (counter-clockwise), in mapper coordinates.
  UI.sector = function (ctx, map, t0, t1, r) {
    var R = (r === undefined ? 1 : r) * map.rad;
    ctx.beginPath();
    ctx.moveTo(map.cx, map.cy);
    if (t1 - t0 >= TAU - 1e-9) { ctx.moveTo(map.cx + R, map.cy); ctx.arc(map.cx, map.cy, R, 0, TAU); }
    else ctx.arc(map.cx, map.cy, R, -t0, -t1, true);
    ctx.closePath();
  };

  UI.drawImage = function (ctx, img, map) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(img, map.cx - map.rad, map.cy - map.rad, 2 * map.rad, 2 * map.rad);
  };

  UI.drawDiscImage = function (ctx, img, map) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(map.cx, map.cy, map.rad, 0, TAU);
    ctx.clip();
    UI.drawImage(ctx, img, map);
    ctx.restore();
  };

  UI.strokeDisc = function (ctx, map, color, lw) {
    ctx.beginPath();
    ctx.arc(map.cx, map.cy, map.rad, 0, TAU);
    ctx.lineWidth = lw || 1;
    ctx.strokeStyle = color;
    ctx.stroke();
  };

  UI.mirrorLines = function (ctx, map, n, color, upTo) {
    if (!isFinite(n)) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    var a = Math.PI / n, last = upTo === undefined ? 2 * n : upTo;
    for (var k = 0; k < Math.min(last, 2 * n); k++) {
      var p = map.px(Math.cos(k * a), Math.sin(k * a));
      ctx.beginPath();
      ctx.moveTo(map.cx, map.cy);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
    ctx.restore();
  };

  UI.faint = function () { return DI.isDark() ? "rgba(255,255,255,0.16)" : "rgba(27,29,34,0.13)"; };

  // Draw the paper (an image over the disc) in the unfolding state st: settled wedges, then the swinging flap.
  UI.drawUnfold = function (ctx, map, img, st, C) {
    var n = st.n, a = Math.PI / n, k = Math.min(st.k, 2 * n);
    ctx.save();
    UI.sector(ctx, map, 0, k * a);
    ctx.clip();
    UI.drawImage(ctx, img, map);
    ctx.restore();
    UI.mirrorLines(ctx, map, n, UI.faint(), k);
    if (st.k >= 2 * n) return;

    var M = SYM.flap(k * a, st.s);
    // the same linear map, in canvas coordinates (y points down), fixing the centre
    var A = M[0], B = -M[2], Cc = -M[1], D = M[3];
    ctx.save();
    ctx.transform(A, B, Cc, D, map.cx - A * map.cx - Cc * map.cy, map.cy - B * map.cx - D * map.cy);
    UI.sector(ctx, map, k * a, (k + 1) * a);
    ctx.clip();
    UI.drawImage(ctx, img, map);
    // a touch of shade while the flap is tilted, so the swing reads as a fold
    var shade = 0.28 * (1 - Math.abs(st.s));
    ctx.fillStyle = DI.isDark() ? "rgba(0,0,0," + shade + ")" : "rgba(20,22,30," + shade + ")";
    ctx.fillRect(map.cx - map.rad, map.cy - map.rad, 2 * map.rad, 2 * map.rad);
    ctx.restore();

    // the hinge
    var h = map.px(Math.cos(k * a), Math.sin(k * a));
    ctx.save();
    ctx.strokeStyle = C.ink;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.25;
    ctx.beginPath(); ctx.moveTo(map.cx, map.cy); ctx.lineTo(h[0], h[1]); ctx.stroke();
    ctx.restore();
  };
})(typeof window !== "undefined" ? window : null);
