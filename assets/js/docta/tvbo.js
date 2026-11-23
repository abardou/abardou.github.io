/*
 * Docta Ignorantia: maths for "An infinite past is not enough" (asymptotics of time-varying Bayesian optimization).
 * Temporal kernels with exact spectral representations, the information rate of a kernel sampled every
 * delta under noise, prediction from the noisy past (Durbin-Levinson), exact sampling of objectives
 * f(x, t) ~ GP(0, k_S k_T) on a grid, and an exact online separable GP.
 * Works in the browser (window.DI.tv) and in Node (module.exports) for testing.
 * ES5 only: the Docker build minifies JS with uglifier.
 */
(function (root) {
  "use strict";

  var TAU = 2 * Math.PI;
  var gpApi = root && root.DI ? root.DI.gp : require("./gp.js");
  var TV = {};

  /* Temporal kernels --------------------------------------------------------
   * A kernel is a base kernel or a mixture { parts: [[weight, base], ...] }. Base kernels are either
   * absolutely continuous ("ac": a spectral density without atoms) or atomic (only Dirac deltas).
   * Frequencies are in cycles per unit of time; time is measured in sampling periods unless delta != 1. */

  TV.rbf = function (ell) { return { kind: "ac", type: "rbf", ell: ell }; };
  TV.m12 = function (ell) { return { kind: "ac", type: "m12", ell: ell }; };
  TV.m32 = function (ell) { return { kind: "ac", type: "m32", ell: ell }; };
  TV.sinc2 = function (bw) { return { kind: "ac", type: "sinc2", bw: bw }; };
  TV.sinc = function (bw) { return { kind: "ac", type: "sinc", bw: bw }; };
  TV.periodic = function (period, ell) { return { kind: "atomic", type: "periodic", period: period, ell: ell }; };
  // a sum of cosines, k(t) = sum_p c_p cos(2 pi f_p t), with one-sided weights c_p summing to 1
  TV.cosines = function (freqs, weights) {
    var s = weights.reduce(function (a, b) { return a + b; }, 0);
    return { kind: "atomic", type: "cos", freqs: freqs.slice(), weights: weights.map(function (w) { return w / s; }) };
  };
  // periodic x RBF: rhythms whose shape slowly drifts (its spectrum is continuous)
  TV.locper = function (period, ell, rbfEll) { return { kind: "ac", type: "locper", period: period, ell: ell, rbfEll: rbfEll }; };
  TV.mix = function (parts) { return { parts: parts }; };

  function parts(spec) { return spec.parts ? spec.parts : [[1, spec]]; }

  // e^{-z} I_p(z), by its power series (fine for the moderate z = 1 / ell^2 used here)
  function ive(p, z) {
    var term = Math.pow(z / 2, p), k, s;
    for (k = 2; k <= p; k++) term /= k;
    s = term;
    for (k = 1; k < 400; k++) {
      term *= (z * z / 4) / (k * (k + p));
      s += term;
      if (term < 1e-17 * s) break;
    }
    return s * Math.exp(-z);
  }
  TV.ive = ive;

  // one-sided atoms of the periodic kernel: exp(-2 sin^2(pi t / r) / ell^2) = e^{-z} (I_0(z) + 2 sum_p I_p(z) cos(2 pi p t / r))
  function periodicAtoms(b) {
    if (b._atoms) return b._atoms;
    var z = 1 / (b.ell * b.ell), f = [0], c = [ive(0, z)];
    for (var p = 1; p < 200; p++) {
      var w = 2 * ive(p, z);
      if (w < 1e-15) break;
      f.push(p / b.period); c.push(w);
    }
    b._atoms = { f: f, c: c };
    return b._atoms;
  }

  function sincf(x) { return Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); }

  function baseK(b, tau) {
    tau = Math.abs(tau);
    switch (b.type) {
      case "rbf": return Math.exp(-0.5 * tau * tau / (b.ell * b.ell));
      case "m12": return Math.exp(-tau / b.ell);
      case "m32": var a = Math.sqrt(3) * tau / b.ell; return (1 + a) * Math.exp(-a);
      case "sinc2": var s = sincf(b.bw * tau); return s * s;
      case "sinc": return sincf(2 * b.bw * tau);
      case "periodic": var q = Math.sin(Math.PI * tau / b.period); return Math.exp(-2 * q * q / (b.ell * b.ell));
      case "cos": var v = 0; for (var i = 0; i < b.freqs.length; i++) v += b.weights[i] * Math.cos(TAU * b.freqs[i] * tau); return v;
      case "locper": return baseK({ type: "periodic", period: b.period, ell: b.ell }, tau) * Math.exp(-0.5 * tau * tau / (b.rbfEll * b.rbfEll));
    }
    throw new Error("unknown kernel " + b.type);
  }

  TV.k = function (spec, tau) {
    var P = parts(spec), v = 0;
    for (var i = 0; i < P.length; i++) v += P[i][0] * baseK(P[i][1], tau);
    return v;
  };

  // continuous part of the kernel alone (the sum of the ac components)
  TV.kac = function (spec, tau) {
    var P = parts(spec), v = 0;
    for (var i = 0; i < P.length; i++) if (P[i][1].kind === "ac") v += P[i][0] * baseK(P[i][1], tau);
    return v;
  };

  TV.acMass = function (spec) {
    return parts(spec).reduce(function (s, p) { return s + (p[1].kind === "ac" ? p[0] : 0); }, 0);
  };

  // one-sided atoms of the whole spectral measure: k(t) contains c cos(2 pi f t) for each atom (f, c)
  TV.atoms = function (spec) {
    var out = [];
    parts(spec).forEach(function (p) {
      var b = p[1];
      if (b.kind !== "atomic") return;
      var A = b.type === "periodic" ? periodicAtoms(b) : { f: b.freqs, c: b.weights };
      for (var i = 0; i < A.f.length; i++) out.push({ f: A.f[i], c: p[0] * A.c[i] });
    });
    return out;
  };

  // two-sided spectral density of an ac base kernel, frequency w in cycles per unit of time
  function baseDensity(b, w) {
    w = Math.abs(w);
    switch (b.type) {
      case "rbf": return Math.sqrt(TAU) * b.ell * Math.exp(-2 * Math.PI * Math.PI * b.ell * b.ell * w * w);
      case "m12": var u = TAU * b.ell * w; return 2 * b.ell / (1 + u * u);
      case "m32": var lam = Math.sqrt(3) / b.ell, d = lam * lam + TAU * TAU * w * w; return 4 * lam * lam * lam / (d * d);
      case "sinc2": return w <= b.bw ? (1 - w / b.bw) / b.bw : 0;
      case "sinc": return w <= b.bw ? 1 / (2 * b.bw) : 0;
      case "locper":
        var A = periodicAtoms(b), s = 0, r = { type: "rbf", ell: b.rbfEll };
        // the atoms of the periodic kernel, two-sided, each smeared by the RBF density
        s += A.c[0] * baseDensity(r, w);
        for (var i = 1; i < A.f.length; i++) s += 0.5 * A.c[i] * (baseDensity(r, w - A.f[i]) + baseDensity(r, w + A.f[i]));
        return s;
    }
    return 0;
  }

  function extent(b) {
    switch (b.type) {
      case "rbf": return 1.5 / b.ell;
      case "m12": return Infinity;
      case "m32": return 400;
      case "sinc2": case "sinc": return b.bw;
      case "locper": return periodicAtoms(b).f.slice(-1)[0] + 1.5 / b.rbfEll;
    }
    return 0;
  }

  TV.density = function (spec, w) {
    var P = parts(spec), v = 0;
    for (var i = 0; i < P.length; i++) if (P[i][1].kind === "ac") v += P[i][0] * baseDensity(P[i][1], w);
    return v;
  };

  // continuous part of the spectral density of the sampled sequence (k(h delta))_h, theta in radians per
  // observation: S folded by aliasing, s(theta) = (1 / delta) sum_l S((theta + 2 pi l) / (2 pi delta)).
  function foldedBase(b, theta, delta) {
    if (b.type === "m12") {   // the sampled exponential kernel is an AR(1) sequence
      var a = Math.exp(-delta / b.ell);
      return (1 - a * a) / (1 - 2 * a * Math.cos(theta) + a * a);
    }
    var L = Math.ceil(extent(b) * delta) + 1, s = 0;
    for (var l = -L; l <= L; l++) s += baseDensity(b, (theta / TAU + l) / delta);
    return s / delta;
  }

  TV.folded = function (spec, theta, delta) {
    var P = parts(spec), v = 0;
    for (var i = 0; i < P.length; i++) if (P[i][1].kind === "ac") v += P[i][0] * foldedBase(P[i][1], theta, delta);
    return v;
  };

  // Information rate in nats per observation (Pinsker): rho = (1 / 4 pi) int_{-pi}^{pi} log(1 + s(theta) / sigma2) d theta.
  TV.rho = function (spec, delta, sigma2, N) {
    if (TV.acMass(spec) <= 0) return 0;
    N = N || 4000;
    var h = Math.PI / N, s = 0;
    for (var i = 0; i <= N; i++) {
      var v = Math.log(1 + TV.folded(spec, i * h, delta) / sigma2);
      s += (i === 0 || i === N ? 1 : i % 2 ? 4 : 2) * v;
    }
    return s * h / 3 / TAU;
  };

  // The part of the present that the whole noisy past cannot predict (Kolmogorov-Szego).
  TV.einf = function (rho, sigma2) { return sigma2 * (Math.exp(2 * rho) - 1); };

  // The same without noise: exp(2 int_0^{1/2} log s(nu) d nu), the geometric mean of the folded continuous
  // spectrum (midpoint rule, so that a zero at a single endpoint does not count). It is 0 as soon as s vanishes
  // on an interval, e.g. for a band-limited kernel sampled above its Nyquist rate.
  TV.einfNoiseless = function (spec, delta, N) {
    if (TV.acMass(spec) <= 0) return 0;
    N = N || 4000;
    var s = 0;
    for (var i = 0; i < N; i++) {
      var v = TV.folded(spec, Math.PI * (i + 0.5) / N, delta);
      if (!(v > 0)) return 0;
      s += Math.log(v);
    }
    return Math.exp(s / N);
  };

  /* Prediction from the noisy past ------------------------------------------- */

  // e_m = Var[X_0 | Y_{-1}, ..., Y_{-m}] for m = 0..M, with Y = X + noise, by the Durbin-Levinson recursion on
  // the autocovariance of Y, r_h = k(h delta) + sigma2 [h = 0]; e_m is the prediction error of Y minus sigma2.
  // sigma2 may be 0: once the noiseless prediction error is below 1e-13 (numerical precision), it is reported as 0.
  TV.predictionErrors = function (spec, delta, sigma2, M) {
    var r = new Float64Array(M + 1), a = new Float64Array(M + 1), prev = new Float64Array(M + 1), e = new Float64Array(M + 1), h, j;
    for (h = 0; h <= M; h++) r[h] = TV.k(spec, h * delta) + (h === 0 ? sigma2 : 0);
    var P = r[0];
    e[0] = P - sigma2;
    for (var m = 1; m <= M; m++) {
      var acc = r[m];
      for (j = 1; j < m; j++) acc -= a[j] * r[m - j];
      var kappa = acc / P;
      if (!(P > 1e-13 * r[0]) || !(Math.abs(kappa) < 1)) { for (; m <= M; m++) e[m] = 0; break; }
      prev.set(a);
      a[m] = kappa;
      for (j = 1; j < m; j++) a[j] = prev[j] - kappa * prev[m - j];
      P *= 1 - kappa * kappa;
      e[m] = Math.max(P - sigma2, 0);
    }
    return e;
  };

  // One-step predictions of X_t from all the noisy past y_0..y_{t-1} along one series, for t = 0..T-1:
  // the Durbin-Levinson coefficients of order t give E[X_t | past] and its variance. Without noise, the order
  // stops growing once the prediction error reaches 1e-6 (below, double precision is no longer accurate), and
  // the predictor of that order is used from then on.
  TV.oneStep = function (spec, delta, sigma2, y) {
    var T = y.length, r = new Float64Array(T + 1), a = new Float64Array(T + 1), prev = new Float64Array(T + 1), h, j;
    for (h = 0; h <= T; h++) r[h] = TV.k(spec, h * delta) + (h === 0 ? sigma2 : 0);
    var mean = new Float64Array(T), vr = new Float64Array(T), P = r[0], ord = 0, frozen = false;
    mean[0] = 0; vr[0] = P - sigma2;
    for (var m = 1; m < T; m++) {
      if (!frozen) {
        var acc = r[m];
        for (j = 1; j < m; j++) acc -= a[j] * r[m - j];
        var kappa = acc / P, Pn = P * (1 - kappa * kappa);
        if (!(Math.abs(kappa) < 1) || (sigma2 === 0 && Pn < 1e-6 * r[0])) frozen = true;
        else {
          prev.set(a);
          a[m] = kappa;
          for (j = 1; j < m; j++) a[j] = prev[j] - kappa * prev[m - j];
          P = Pn;
          ord = m;
        }
      }
      var mu = 0;
      for (j = 1; j <= ord; j++) mu += a[j] * y[m - j];
      mean[m] = mu;
      vr[m] = Math.max(P - sigma2, 0);
    }
    return { mean: mean, v: vr };
  };

  /* Random numbers and the FFT ------------------------------------------------ */

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
  TV.rng = mulberry;

  function gaussian(rnd) {
    var u = 1 - rnd(), v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  TV.gaussian = gaussian;

  // in-place radix-2 FFT of (re, im), length a power of two
  function fft(re, im) {
    var n = re.length, i, j, k, len;
    for (i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { var t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (len = 2; len <= n; len <<= 1) {
      var ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (i = 0; i < n; i += len) {
        var cr = 1, ci = 0;
        for (k = 0; k < len / 2; k++) {
          var ar = re[i + k], ai = im[i + k], br = re[i + k + len / 2], bi = im[i + k + len / 2];
          var xr = br * cr - bi * ci, xi = br * ci + bi * cr;
          re[i + k] = ar + xr; im[i + k] = ai + xi;
          re[i + k + len / 2] = ar - xr; im[i + k + len / 2] = ai - xi;
          var ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }
  TV.fft = fft;

  /* Sampling ------------------------------------------------------------------- */

  // count independent stationary sequences of length N with covariance (k(h delta))_h: the atoms exactly
  // (random cosines and sines), the continuous part by circulant embedding (two sequences per complex FFT).
  TV.sampleTemporal = function (spec, N, delta, rnd, count) {
    var out = [], c, i, h;
    for (c = 0; c < count; c++) out.push(new Float64Array(N));
    var atoms = TV.atoms(spec);
    for (c = 0; c < count; c++) {
      atoms.forEach(function (a) {
        var s = Math.sqrt(a.c);
        if (a.f === 0) { var g = s * gaussian(rnd); for (var t = 0; t < N; t++) out[c][t] += g; return; }
        var A = s * gaussian(rnd), B = s * gaussian(rnd), w = TAU * a.f * delta;
        for (var t2 = 0; t2 < N; t2++) out[c][t2] += A * Math.cos(w * t2) + B * Math.sin(w * t2);
      });
    }
    if (TV.acMass(spec) > 0) {
      var M = 1;
      while (M < 2 * N) M <<= 1;
      var lam = new Float64Array(M), lim = new Float64Array(M);
      for (h = 0; h < M; h++) lam[h] = TV.kac(spec, Math.min(h, M - h) * delta);
      fft(lam, lim);
      for (h = 0; h < M; h++) lam[h] = Math.sqrt(Math.max(lam[h], 0) / M);
      for (c = 0; c < count; c += 2) {
        var re = new Float64Array(M), im = new Float64Array(M);
        for (h = 0; h < M; h++) { re[h] = lam[h] * gaussian(rnd); im[h] = lam[h] * gaussian(rnd); }
        fft(re, im);
        for (i = 0; i < N; i++) {
          out[c][i] += re[i];
          if (c + 1 < count) out[c + 1][i] += im[i];
        }
      }
    }
    return out;
  };

  // A with A A^T = K_S, for an RBF spatial kernel on a regular grid of m points of [0, 1], keeping the
  // components whose eigenvalue is not negligible: { A (m x J, row-major), J, KS (m x m), xs }.
  TV.spatial = function (m, ellS) {
    var K = new Float64Array(m * m), xs = [], i, j;
    for (i = 0; i < m; i++) xs.push(m === 1 ? 0 : i / (m - 1));
    for (i = 0; i < m; i++) for (j = 0; j < m; j++) K[i * m + j] = Math.exp(-0.5 * (xs[i] - xs[j]) * (xs[i] - xs[j]) / (ellS * ellS));
    var E = gpApi.eigh(K, m), top = E.values[m - 1], keep = [];
    for (i = m - 1; i >= 0; i--) if (E.values[i] > 1e-10 * top) keep.push(i);
    var J = keep.length, A = new Float64Array(m * J);
    for (i = 0; i < m; i++) for (j = 0; j < J; j++) A[i * J + j] = E.vectors[i * m + keep[j]] * Math.sqrt(E.values[keep[j]]);
    return { A: A, J: J, KS: K, xs: xs, m: m };
  };

  // An objective f(x, t) ~ GP(0, k_S k_T) on the grid, for t = 1..N (index t - 1): F[x * N + t - 1].
  TV.sampleObjective = function (spec, sp, N, delta, seed) {
    var rnd = mulberry(seed), Z = TV.sampleTemporal(spec, N, delta, rnd, sp.J), F = new Float64Array(sp.m * N);
    for (var x = 0; x < sp.m; x++) {
      for (var j = 0; j < sp.J; j++) {
        var a = sp.A[x * sp.J + j], z = Z[j];
        if (a === 0) continue;
        for (var t = 0; t < N; t++) F[x * N + t] += a * z[t];
      }
    }
    return F;
  };

  /* Exact online GP for k((x, t), (x', t')) = k_S(x, x') k_T(t - t'), observations at grid points ----- */

  // kT: table of k_T(h delta) for h = 0..Nmax. The Cholesky factor grows by one row per observation.
  TV.OnlineGP = function (KS, m, kT, sigma2, Nmax) {
    this.KS = KS; this.m = m; this.kT = kT; this.sigma2 = sigma2;
    this.L = new Float64Array(Nmax * Nmax); this.z = new Float64Array(Nmax);
    this.xs = new Int32Array(Nmax); this.ts = new Int32Array(Nmax);
    this.n = 0; this.Nmax = Nmax;
    this.V = new Float64Array(Nmax * m);
  };

  // posterior mean and variance of f(., t) on the grid (t an integer time index)
  TV.OnlineGP.prototype.predict = function (t) {
    var n = this.n, m = this.m, KS = this.KS, kT = this.kT, L = this.L, V = this.V, N = this.Nmax, i, j, k;
    var mean = new Float64Array(m), vr = new Float64Array(m);
    for (j = 0; j < m; j++) vr[j] = KS[j * m + j] * kT[0];
    for (i = 0; i < n; i++) {
      var row = i * m, kt = kT[Math.abs(t - this.ts[i])], xr = this.xs[i] * m;
      for (j = 0; j < m; j++) V[row + j] = KS[xr + j] * kt;
      for (k = 0; k < i; k++) {
        var lik = L[i * N + k];
        if (lik === 0) continue;
        var rk = k * m;
        for (j = 0; j < m; j++) V[row + j] -= lik * V[rk + j];
      }
      var d = L[i * N + i], zi = this.z[i];
      for (j = 0; j < m; j++) { V[row + j] /= d; mean[j] += V[row + j] * zi; vr[j] -= V[row + j] * V[row + j]; }
    }
    for (j = 0; j < m; j++) vr[j] = Math.max(vr[j], 1e-12);
    this.lastT = t;
    return { mean: mean, v: vr };
  };

  // add y observed at grid index ix and time t; must follow predict(t)
  TV.OnlineGP.prototype.add = function (ix, t, y) {
    var n = this.n, m = this.m, N = this.Nmax, L = this.L, V = this.V, i;
    var diag = this.KS[ix * m + ix] * this.kT[0] + this.sigma2, resid = y;
    for (i = 0; i < n; i++) {
      var v = V[i * m + ix];
      L[n * N + i] = v;
      diag -= v * v;
      resid -= v * this.z[i];
    }
    var d = Math.sqrt(Math.max(diag, 1e-12));
    L[n * N + n] = d;
    this.z[n] = resid / d;
    this.xs[n] = ix; this.ts[n] = t;
    this.n++;
  };

  if (typeof module !== "undefined" && module.exports) module.exports = TV;
  if (root && root.DI) root.DI.tv = TV;
})(typeof window !== "undefined" ? window : null);
