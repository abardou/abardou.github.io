/*
 * Docta Ignorantia: small Gaussian-process toolkit (Cholesky, exact GP regression).
 * Works in the browser (window.DI.gp) and in Node (module.exports) for testing.
 * ES5 only: the Docker build minifies JS with uglifier.
 */
(function (root) {
  "use strict";

  // Lower Cholesky factor of a symmetric positive-definite n x n matrix (row-major).
  function cholesky(A, n) {
    var L = new Float64Array(n * n);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j <= i; j++) {
        var s = A[i * n + j];
        for (var k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
        if (i === j) {
          if (s <= 0) s = 1e-12;
          L[i * n + i] = Math.sqrt(s);
        } else {
          L[i * n + j] = s / L[j * n + j];
        }
      }
    }
    return L;
  }

  // Solve L z = b.
  function forward(L, n, b, out) {
    var z = out || new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var s = b[i];
      for (var k = 0; k < i; k++) s -= L[i * n + k] * z[k];
      z[i] = s / L[i * n + i];
    }
    return z;
  }

  // Solve L^T x = z.
  function backward(L, n, z) {
    var x = new Float64Array(n);
    for (var i = n - 1; i >= 0; i--) {
      var s = z[i];
      for (var k = i + 1; k < n; k++) s -= L[k * n + i] * x[k];
      x[i] = s / L[i * n + i];
    }
    return x;
  }

  /*
   * Exact GP regression with zero prior mean.
   *   kernel(a, b) -> covariance between inputs a and b (any representation)
   *   noise        -> observation-noise variance added to the diagonal
   */
  function GP(kernel, noise) {
    this.kernel = kernel;
    this.noise = noise;
    this.X = [];
    this.y = [];
    this.L = null;
    this.alpha = null;
  }

  GP.prototype.fit = function (X, y) {
    var n = X.length, K = new Float64Array(n * n);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j <= i; j++) {
        var v = this.kernel(X[i], X[j]);
        K[i * n + j] = v;
        K[j * n + i] = v;
      }
      K[i * n + i] += this.noise;
    }
    this.X = X.slice();
    this.y = y.slice();
    this.n = n;
    this.L = n ? cholesky(K, n) : null;
    this.alpha = n ? backward(this.L, n, forward(this.L, n, y)) : null;
    this._kx = new Float64Array(n);
    this._v = new Float64Array(n);
    return this;
  };

  // Posterior mean and variance at x; prior = k(x, x) (passed in to avoid recomputing).
  GP.prototype.predict = function (x, prior) {
    var n = this.n;
    if (!n) return { mu: 0, v: prior };
    var kx = this._kx, mu = 0;
    for (var i = 0; i < n; i++) {
      kx[i] = this.kernel(x, this.X[i]);
      mu += kx[i] * this.alpha[i];
    }
    var v = forward(this.L, n, kx, this._v), q = 0;
    for (i = 0; i < n; i++) q += v[i] * v[i];
    return { mu: mu, v: Math.max(0, prior - q) };
  };

  /*
   * Eigendecomposition of a symmetric n x n matrix (row-major): Householder reduction to tridiagonal
   * form, then the implicit QL algorithm (a port of EISPACK's tred2 and tql2, as in JAMA).
   * Returns { values, vectors } with eigenvalues in ascending order; eigenvector k is column k of vectors.
   */
  function eigh(A, n) {
    var V = new Float64Array(A), d = new Float64Array(n), e = new Float64Array(n);
    var i, j, k, f, g, h, hh, scale;
    for (j = 0; j < n; j++) d[j] = V[(n - 1) * n + j];
    for (i = n - 1; i > 0; i--) {
      scale = 0; h = 0;
      for (k = 0; k < i; k++) scale += Math.abs(d[k]);
      if (scale === 0) {
        e[i] = d[i - 1];
        for (j = 0; j < i; j++) { d[j] = V[(i - 1) * n + j]; V[i * n + j] = 0; V[j * n + i] = 0; }
      } else {
        for (k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
        f = d[i - 1];
        g = Math.sqrt(h);
        if (f > 0) g = -g;
        e[i] = scale * g;
        h -= f * g;
        d[i - 1] = f - g;
        for (j = 0; j < i; j++) e[j] = 0;
        for (j = 0; j < i; j++) {
          f = d[j];
          V[j * n + i] = f;
          g = e[j] + V[j * n + j] * f;
          for (k = j + 1; k <= i - 1; k++) { g += V[k * n + j] * d[k]; e[k] += V[k * n + j] * f; }
          e[j] = g;
        }
        f = 0;
        for (j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
        hh = f / (h + h);
        for (j = 0; j < i; j++) e[j] -= hh * d[j];
        for (j = 0; j < i; j++) {
          f = d[j]; g = e[j];
          for (k = j; k <= i - 1; k++) V[k * n + j] -= f * e[k] + g * d[k];
          d[j] = V[(i - 1) * n + j];
          V[i * n + j] = 0;
        }
      }
      d[i] = h;
    }
    for (i = 0; i < n - 1; i++) {
      V[(n - 1) * n + i] = V[i * n + i];
      V[i * n + i] = 1;
      h = d[i + 1];
      if (h !== 0) {
        for (k = 0; k <= i; k++) d[k] = V[k * n + i + 1] / h;
        for (j = 0; j <= i; j++) {
          g = 0;
          for (k = 0; k <= i; k++) g += V[k * n + i + 1] * V[k * n + j];
          for (k = 0; k <= i; k++) V[k * n + j] -= g * d[k];
        }
      }
      for (k = 0; k <= i; k++) V[k * n + i + 1] = 0;
    }
    for (j = 0; j < n; j++) { d[j] = V[(n - 1) * n + j]; V[(n - 1) * n + j] = 0; }
    V[(n - 1) * n + n - 1] = 1;
    e[0] = 0;

    for (i = 1; i < n; i++) e[i - 1] = e[i];
    e[n - 1] = 0;
    f = 0;
    var tst1 = 0, eps = Math.pow(2, -52), l, m, p, r, c, c2, c3, s, s2, el1, dl1;
    for (l = 0; l < n; l++) {
      tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
      m = l;
      while (m < n) { if (Math.abs(e[m]) <= eps * tst1) break; m++; }
      if (m > l) {
        var iter = 0;
        do {
          iter++;
          g = d[l];
          p = (d[l + 1] - g) / (2 * e[l]);
          r = Math.sqrt(p * p + 1);
          if (p < 0) r = -r;
          d[l] = e[l] / (p + r);
          d[l + 1] = e[l] * (p + r);
          dl1 = d[l + 1];
          h = g - d[l];
          for (i = l + 2; i < n; i++) d[i] -= h;
          f += h;
          p = d[m];
          c = 1; c2 = c; c3 = c;
          el1 = e[l + 1];
          s = 0; s2 = 0;
          for (i = m - 1; i >= l; i--) {
            c3 = c2; c2 = c; s2 = s;
            g = c * e[i];
            h = c * p;
            r = Math.sqrt(p * p + e[i] * e[i]);
            e[i + 1] = s * r;
            s = e[i] / r;
            c = p / r;
            p = c * d[i] - s * g;
            d[i + 1] = h + s * (c * g + s * d[i]);
            for (k = 0; k < n; k++) {
              h = V[k * n + i + 1];
              V[k * n + i + 1] = s * V[k * n + i] + c * h;
              V[k * n + i] = c * V[k * n + i] - s * h;
            }
          }
          p = -s * s2 * c3 * el1 * e[l] / dl1;
          e[l] = s * p;
          d[l] = c * p;
        } while (Math.abs(e[l]) > eps * tst1 && iter < 60);
      }
      d[l] += f;
      e[l] = 0;
    }
    // ascending order
    for (i = 0; i < n - 1; i++) {
      k = i; p = d[i];
      for (j = i + 1; j < n; j++) if (d[j] < p) { k = j; p = d[j]; }
      if (k !== i) {
        d[k] = d[i]; d[i] = p;
        for (j = 0; j < n; j++) { p = V[j * n + i]; V[j * n + i] = V[j * n + k]; V[j * n + k] = p; }
      }
    }
    return { values: d, vectors: V };
  }

  var api = { cholesky: cholesky, forward: forward, backward: backward, GP: GP, eigh: eigh };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) (root.DI || (root.DI = {})).gp = api;
})(typeof window !== "undefined" ? window : null);
