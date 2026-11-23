---
layout: post
title: "Chasing a moving optimum: the mistake no Bayesian optimizer can avoid"
description: When the optimum of a time-varying problem keeps moving, can a Bayesian optimizer eventually stop making mistakes? Only if the changes can be predicted from the past; otherwise, every optimizer makes a mistake at every step, of a size set by the problem. Any system that must keep learning after deployment, from a controller to an LLM, faces the same limit.
date: 2026-11-23 12:00:00+0100
interactive: true
scripts:
  - /assets/js/docta/core.js
  - /assets/js/docta/gp.js
  - /assets/js/docta/tvbo.js
  - /assets/js/docta/tvbo-widgets.js
---

Many systems must keep learning after they are deployed, because the world they operate in keeps changing. A recommender system faces shifting tastes, the best gains of a controller drift as its hardware wears out, and an LLM in production meets new topics, new users and new usage patterns, so that the prompt or the decoding settings that work best today may not work best next month. Such systems must keep adapting from feedback while they are in use: this is continual learning. Can they eventually stop making mistakes?

Let us study this question under the setting of time-varying Bayesian optimization and try to come up with an exact answer. A Bayesian optimizer searches for the maximum of an expensive black-box function $$f$$, one noisy evaluation at a time: for instance, the performance of a deployed system as a function of its configuration $$x$$ (the gains of the controller, the decoding settings of the LLM), measured through noisy feedback. It models $$f$$ with a Gaussian process and queries the input $$x$$ where $$f$$ could plausibly be highest. In the vanilla, static case where $$f$$ does not change, the uncertainty of the model about the location of the maximum vanishes as observations accumulate, and the optimizer eventually stops making mistakes. If $$f$$ changes over time, the maximum at a given time $$t$$, $$x^*_t = \arg\max_{x} f(x, t)$$ moves, and this becomes a tracking problem where old observations lose relevance. 

Let us make things more precise before going forward.

## The model

Time-varying Bayesian optimization models the objective as a Gaussian process $$f(x, t)$$ with zero mean, where $$x \in [0, 1]^d$$ is the input and $$t$$ is time. Its kernel is a product,

$$
k\big((x, t), (x', t')\big) = k_S(x, x')\, k_T(t - t'),
$$

where the spatial kernel $$k_S$$ says how correlated the values of $$f$$ at two inputs $$x$$ and $$x'$$ are, and the temporal kernel $$k_T$$ how correlated they are at two times $$t$$ and $$t'$$. Both equal 1 at zero distance. The optimizer observes $$f$$ every $$\Delta$$ units of time: at time $$t_i = i\Delta$$, it queries an input $$x_i$$ and observes $$y_i = f(x_i, t_i) + \varepsilon_i$$, where $$\varepsilon_i$$ is Gaussian noise with variance $$\sigma_0^2$$. Its mistake at step $$i$$ is the regret

$$
r_i = \max_x f(x, t_i) - f(x_i, t_i),
$$

the gap between the value of the best input at time $$t_i$$ and the value of the query. An algorithm is *no-regret* if its average regret $$R_n / n = \frac{1}{n}\sum_{i=1}^n r_i$$ goes to zero.

## Four classes of temporal kernels

Let us recall the very useful Bochner's theorem, stating that a stationary kernel is a superposition of oscillations:

$$
k_T(t) = \int_{\mathbb{R}} S_T(\omega)\, e^{2\pi i \omega t}\, d\omega,
$$

where $$S_T(\omega) \geq 0$$ is the share of the variance at frequency $$\omega$$, in cycles per unit of time, and is called the **spectral density** of $$k_T$$. $$S_T$$ has two possible components: a *continuous part*, which spreads variance over intervals of frequencies, and *Dirac deltas*, which put a finite share of the variance on single frequencies. The temporal kernels used in practice fall into four classes:

| Class | Spectral density | Examples |
|---|---|---|
| Broadband | continuous, positive at all frequencies | RBF, Matérn |
| Band-limited | continuous, zero outside a band $$[-\tau, \tau]$$ | sinc, sinc² |
| Almost periodic | infinitely many Dirac deltas | periodic |
| Low-rank | finitely many Dirac deltas | sum of cosines, constant |

In the following, it will be useful to distinguish a temporal kernel with no continuous part in its spectral density $$S_T$$, i.e., if it is almost periodic or low-rank. I will call them **rhythmic**. For rythmic kernels, $$k_T(t) = \alpha_0 + 2\sum_{p \geq 1} \alpha_p \cos(2\pi\omega_p t)$$ with weights $$\alpha_p \geq 0$$: the objective is a superposition of oscillations at fixed frequencies, such as daily and weekly cycles. A static objective, with $$k_T \equiv 1$$, is the simplest rhythmic case: a single Dirac delta at $$\omega = 0$$.

Below, you can find a visualization of spectral densities of the four kernel classes and an example of function drawn from the resulting Gaussian process. Feel free to play with it and make yourself familiar with these classes.

<figure class="di-widget di-wide" data-di-widget="tv-classes">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>Left: an objective drawn from the prior, with the input x vertically and time horizontally, darker for higher values; dots mark the maximizer at each time. Right: the spectral density of its temporal kernel for positive frequencies (it is symmetric), on a logarithmic scale: the continuous part relative to its maximum (filled curve) and the Dirac deltas relative to the heaviest one (arrows). The almost periodic example is a periodic kernel with lengthscale 0.5: its Dirac deltas sit at every multiple of 1/period, with weights that decrease quickly but never vanish. The spatial kernel is an RBF kernel with lengthscale 0.1.</figcaption>
</figure>

## How well does the past predict the present?

Fix an input $$x$$. Since $$k_S(x, x) = 1$$, the values $$(f(x, t))_t$$ form a Gaussian process in time with kernel $$k_T$$. Suppose that a noisy version $$y_i$$ of $$f$$ is observed at $$x$$ at every step $$t_i$$, and let $$e_n = \mathrm{Var}[f(x, t_n) \mid y_0, \cdots, y_{n-1}]$$ be the variance of the present value $$f(x, t_n)$$ given the $$n$$ previous noisy observations. For a static objective, $$e_n = \sigma_0^2 / (n + \sigma_0^2)$$, which goes to zero. Below, three temporal kernels are compared, with $$\sigma_0^2 = 0.01$$: a constant kernel, a periodic kernel and an RBF kernel. The last two change at the same speed: the correlation between consecutive values, $$k_T(\Delta)$$, is 0.988 for both.

<figure class="di-widget di-wide" data-di-widget="tv-floor">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>Each row shows the true value at a fixed input (black line), its noisy observations (gray dots) and the prediction of each value from all the earlier observations (band of two standard deviations). The bar at the right edge predicts the present value before it is observed; the ring is the true value. Below, eₙ and Iₙ (defined in the next section) as functions of n. They are computed exactly from the kernels; the prediction bands in the rows are from one sample.</figcaption>
</figure>

For the constant kernel, $$e_n$$ decreases like $$1/n$$, as predicted. For the periodic kernel, $$e_n$$ stays close to that of the RBF kernel during the first period (40 steps), then also decreases like $$1/n$$. For the RBF kernel, $$e_n$$ stops decreasing after about 30 steps, at $$0.016$$: no amount of past observations appears to lower this variance. If we want to understand the asymptotic performance of a Bayesian optimizer in a time-varying setting, a quantity that seems interesting to study is $$e_\infty = \lim_{n \to \infty} e_n$$, the uncertainty of the model about the present given an infinite past.

## The information rate

The $$n$$-th observation $$y_n$$ is informative only if there is still some uncertainty about $$f(x, t_n)$$ given the previous observations $$\{y_1, \cdots, y_{n-1}\}$$, and we have seen that this uncertainty is given by $$e_{n-1}$$. To quantify the information that $$y_n$$ brings about $$f(x, \cdot)$$, in nats, we can use Shannon's formula for a Gaussian channel:

$$
I_n = \frac{1}{2}\log\left(1 + \frac{e_{n-1}}{\sigma_0^2}\right).
$$

Taking the limit, we get the *information rate* $$\rho = \lim_{n \to \infty} I_n$$, the information that each new observation brings given an infinite past. Solving for $$e_\infty$$:

$$
e_\infty = \sigma_0^2\left(e^{2\rho} - 1\right).
$$

Hence, a model will face an irreducible uncertainty ($$e_\infty > 0$$), even when having access to infinitely many past observations, if and only if each observation keeps bringing new information ($$\rho > 0$$). For the RBF kernel above, $$\rho \approx 0.48$$ nats per observation; for the constant and periodic kernels, $$\rho = 0$$.

The information rate can actually be computed from the spectral density $$S_T$$. Sampling every $$\Delta$$ units of time folds all frequencies onto $$[0, 1/2]$$ cycle per observation (aliasing). Let $$s_\Delta(\nu)$$ be the continuous part of the folded spectral density at frequency $$\nu$$. Then[^pinsker]

$$
\rho = \int_0^{1/2} \log\left(1 + \frac{s_\Delta(\nu)}{\sigma_0^2}\right) d\nu.
$$

This is Shannon's formula applied frequency by frequency, with signal-to-noise ratio $$s_\Delta(\nu) / \sigma_0^2$$. On a logarithmic scale, $$\rho$$ is the area between the spectrum $$s_\Delta + \sigma_0^2$$ and the noise level $$\sigma_0^2$$. Dirac deltas do not enter the formula: they have zero width, hence zero area.

Here is a visualization of the equation above. Play with the noise level to see how it impacts the informative rate $$\rho$$ and the irreducible uncertainty $$e_\infty$$. For rhythmic kernels, you are given the opportunity to build a mixture with a broadband kernel (RBF).

<figure class="di-widget di-wide" data-di-widget="tv-area">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>The continuous part of the spectrum seen by an optimizer that observes once per unit of time (Δ = 1), plus the noise level, on a logarithmic scale. Dirac deltas are drawn as orange arrows. With natural logarithms, the shaded area is ρ. Kernels: RBF with lengthscale 10, sinc² with cutoff 0.05, periodic with period 40, and a constant plus three cosines; the added part is an RBF kernel with lengthscale 10.</figcaption>
</figure>

Two consequences follow. A rhythmic kernel has $$\rho = 0$$ and $$e_\infty = 0$$. A kernel with a continuous part, even one of tiny weight, has $$\rho > 0$$ and $$e_\infty > 0$$, for every finite observation frequency $$1/\Delta$$ and every observational noise $$\sigma_0^2 > 0$$. In short: **even with an infinite past, the uncertainty about the present vanishes if and only if the temporal kernel is rhythmic.**

## Rhythms are learned once and for all

Why do rhythms bring no information in the long run? Using $$\cos(2\pi\omega(t - t')) = \cos(2\pi\omega t)\cos(2\pi\omega t') + \sin(2\pi\omega t)\sin(2\pi\omega t')$$, an objective with a rhythmic temporal kernel can be written as

$$
f(x, t) = \sum_{m} \sqrt{w_m}\,\psi_m(t)\,g_m(x),
$$

where the $$\psi_m$$ are known functions of time (a constant, and the cosine and sine of each frequency $$\omega_p$$), the $$w_m$$ are the weights of the Dirac deltas in $$S_T$$, and the $$g_m$$ are independent static functions drawn from $$\mathcal{GP}(0, k_S)$$. All the randomness is in the $$g_m$$, drawn only once at the start. Predicting the objective at any future time only requires learning the $$g_m$$, which is a static problem, as you can see below.

<figure class="di-widget di-wide" data-di-widget="tv-rhythm">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>An objective with a constant and one cosine of period 40: three static functions g (black, right) multiplied by known oscillating weights (gray, with the present marked) and summed. At each step, one noisy observation is made at a random input (orange dots: every observation so far, all used by the model). Dashed orange curves and bands: posterior mean plus or minus two standard deviations. Noise standard deviation 0.1.</figcaption>
</figure>

As observations accumulate, the posterior of every $$g_m$$ concentrates, and so does the posterior of the objective at every future time. A continuous part admits no such decomposition into countably many static functions: new randomness enters at every instant, which makes the optimization problem inherently not static.

## Band-limited objectives, the Nyquist rate and the noise

Band-limited kernels show that the observation noise is essential. A band-limited objective has no variation at frequencies above its cutoff $$\tau$$. If it is observed faster than the Nyquist rate, $$1/\Delta > 2\tau$$, the folded spectrum $$s_\Delta$$ is zero on part of $$[0, 1/2]$$. **Without noise, such an objective can be predicted perfectly from a long enough past**: the prediction variance goes to zero, even though the spectral density has a continuous part.[^noiseless] **With noise, it cannot**: $$\log(1 + s_\Delta/\sigma_0^2)$$ is positive wherever $$s_\Delta$$ is, so $$\rho > 0$$ and $$e_\infty > 0$$ for every $$\sigma_0^2 > 0$$.

Below the Nyquist rate, aliasing folds the band onto itself, $$s_\Delta$$ is positive everywhere, and $$e_\infty > 0$$ even without noise. Observing $$k$$ times faster, for an integer $$k$$, can only reduce $$e_\infty$$, but with noise it never makes it zero.

<figure class="di-widget di-wide" data-di-widget="tv-nyquist">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>A sinc² temporal kernel with cutoff τ = 0.05 cycle per unit of time, so the Nyquist rate is one observation every 10 units of time. Top: a sample at a fixed input (black line), its noisy observations every Δ (dots) and the prediction of each observed value from the earlier observations (band of two standard deviations). Bottom left: the folded spectrum plus the noise level, on a logarithmic scale; the shaded area is ρ. Bottom right: the variance eₙ of the present value given n past observations, with the chosen noise (solid) and without noise (dashed). Below 10⁻⁶, double-precision arithmetic cannot follow the noiseless curve; an arrow marks that it keeps decreasing to zero.</figcaption>
</figure>

At $$\Delta = 5$$ (twice the Nyquist rate), the noiseless prediction variance falls below $$10^{-6}$$ within 20 observations and keeps decreasing to zero, while with noise variance $$0.01$$ it stops at $$e_\infty \approx 0.11$$. Decreasing the noise lowers $$e_\infty$$ (to about $$10^{-4}$$ for a noise variance of $$10^{-8}$$) but never cancels it. Beyond $$\Delta = 10$$, the two curves stop at almost the same level: aliasing, not noise, limits the prediction.

## From irreducible uncertainty to an unavoidable mistake

An optimizer does not observe $$f(x, t_i)$$, with a fixed $$x$$ at every step $$i$$. It moves, and through $$k_S$$, an observation at one input informs the others. However, this does not beat the constraint imposed by $$e_\infty$$. An observation at $$x_i$$ is a noisy measurement of $$k_S(x_i, x)\, f(x, t_i)$$ plus a term independent of $$f(x, \cdot)$$. Because $$k_S$$ can be seen as a correlation function without loss of generality ($$\lvert k_S(x_i, x) \rvert \leq 1$$ w.l.o.g.), it is less informative about $$f(x, \cdot)$$ than an observation at $$x$$ itself. Hence, for every algorithm and every input $$x$$,

$$
\mathrm{Var}\left[f(x, t_n) \mid y_1, \dots, y_{n-1}\right] \geq e_{n-1} \geq e_\infty.
$$

The same argument applies to the difference between the values at the query $$x_n$$ and at an input $$x'$$ far from it: its posterior variance stays above $$2c_S\, e_\infty$$, where $$c_S > 0$$ is a positive constant that depends only on $$k_S$$. The optimizer can therefore never be absolutely sure that $$x_n$$ is better than $$x'$$. With a probability strictly greater than zero, we can show it is not, and the instantaneous regret $$r_n \geq f(x', t_n) - f(x_n, t_n)$$ is positive.

To summarize, we have two complementary results.

**Theorem 1.** If the spectral density of $$k_T$$ has a continuous part, there is a constant $$c > 0$$, which depends only on $$k_S$$, $$k_T$$, $$\Delta$$ and $$\sigma_0^2$$, such that for every algorithm (deterministic or randomized) and every step $$n$$, $$\mathbb{E}[r_n] \geq c$$. Hence $$\mathbb{E}[R_n] \in \Theta(n)$$, and $$R_n \geq cn/2$$ with a probability bounded away from zero.[^assumptions]

**Theorem 2.** If $$k_T$$ is rhythmic, GP-UCB is no-regret under mild conditions. For a sum of $$L$$ cosines and an RBF spatial kernel in $$d$$ dimensions, $$R_n \in \mathcal{O}\big(\sqrt{(2L+1)\, n\, (\log n)^{d+2}}\big)$$ with high probability: this is the rate of GP-UCB on a static objective, up to the factor $$2L + 1$$.

The race below runs GP-UCB on two objectives that change at the same speed, as in the second figure: one with the periodic temporal kernel, one with the RBF temporal kernel.

<figure class="di-widget di-wide" data-di-widget="tv-race">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>Top: each objective over the last 150 steps, with the input x vertically and time horizontally, darker for higher values. White dots: the maximizer at each step; colored dots: the queries of GP-UCB. Bottom left: the average regret. Bottom right: the smallest posterior variance of the objective at the present time, over all 80 inputs, just before each query; the dashed line is e∞ for the RBF objective. Spatial kernel: RBF with lengthscale 0.1; noise variance 0.01; exploration weight β = 2.</figcaption>
</figure>

On the RBF objective, the posterior variance at the present stays above $$e_\infty$$ at every input, and the average regret stops decreasing. On the periodic objective, both keep decreasing.

These results also explain why previous regret bounds for time-varying Bayesian optimization are linear. Such bounds are expressed with the maximum information gain $$\gamma_n$$, the largest information that $$n$$ observations can bring about $$f$$. Observing a single input at every step already brings at least $$\rho$$ nats per observation, so $$\gamma_n \geq \rho n$$, and every bound in terms of $$\gamma_n$$ is linear when $$\rho > 0$$.

## How large is the mistake?

Theorem 1 guarantees that the mistake does not vanish, but its magnitude could still be very small. What controls the size of the mistake in practice? To answer independently of any particular algorithm, consider an oracle that observes the whole objective on a grid of 100 inputs at every past step, with the same noise, and queries the maximizer of its posterior mean. No algorithm that queries one grid input per step can have a smaller expected regret.

<figure class="di-widget di-wide" data-di-widget="tv-price">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>From our experiments: 15 temporal kernels (RBF and Matérn-3/2 with lengthscales from 2 to 50, sinc² with cutoffs from 0.02 to 0.7), noise variance 0.01 and Δ = 1. Oracle: expected regret at step 400 (1000 samples). GP-UCB: average regret over steps 601 to 800 (20 objectives). Dashed line: log-log fit on the kernels with e∞ ≤ 0.2. The slider goes through the five kernels of the chosen family, from slow to fast changes; a click on a point selects its kernel.</figcaption>
</figure>

Across the 15 kernels and three families, the regret of the oracle is approximately proportional to $$e_\infty$$, over two orders of magnitude (log-log slope 1.07). The irreducible uncertainty seems to measure the *intrinsic difficulty* of the problem: a kernel with ten times the $$e_\infty$$ costs about ten times the regret, whatever its family. GP-UCB, which observes one input per step, makes larger mistakes, as expected, and its regret grows more slowly with $$e_\infty$$ (slope 0.46), but it ranks the kernels in the same order (Spearman correlation 0.95). Whether the proportionality holds exactly is an open question (and maybe the subject of a future note...)

## What this means for continual learning

**From no-regret to ε-optimality.** When the world keeps producing information that its past cannot predict, asymptotic optimality, i.e., an average regret that goes to zero, is out of reach for every algorithm. A better goal is ε-optimality: an average regret that stays below a tolerance $$\varepsilon$$ in the long run, $$\limsup_{n \to \infty} \mathbb{E}[R_n] / n \leq \varepsilon$$. The results above say which tolerances are within reach. Theorem 1 rules out every $$\varepsilon < c$$, and the oracle shows that no algorithm querying one grid input per step goes below a level approximately proportional to $$e_\infty$$. Algorithms can then be compared by how close their long-run regret comes to this level, rather than by whether they are no-regret. GP-UCB, for instance, stays up to 200 times above it on slowly changing objectives, so surely there is room for better algorithms!

**A lower bound for harder problems.** The setting of this note is favorable to the learner: the changes are stationary and Gaussian, their statistics are known exactly, and feedback arrives at a fixed rate. Real continual learning, for instance with a deployed LLM, cannot enjoy these simplifications. The theorems do not apply to such tasks directly. However, observe that the insight behind Theorem 1 concerns the world, not the learner: no learner, however large, can predict what its past does not determine. Whenever a task keeps producing information that its past cannot predict, its error has a positive floor, and having to learn the dynamics instead of knowing them can only increase the error. In this sense, the results are a lower bound for continual learning: they show that the floor exists and what lowers it, but not how high it is for a given task.

**What lowers the floor.** More past data and more computation do not lower it. More frequent or less noisy feedback does, without ever cancelling it. What recurs, such as daily or weekly cycles, can be learned once and for all. A continual learner should therefore separate what recurs, which it can learn, from what drifts, which it can only track with a positive error.

What decides between an error that vanishes and one that does not is not how fast the world changes with respect to the observation frequency, but whether it keeps producing information that its past cannot predict.

This note is based on joint work with Patrick Thiran. For more technical details, see our paper [on arXiv](https://arxiv.org/abs/2505.13012).

[^pinsker]: This is Pinsker's formula for the mutual information rate between a stationary Gaussian sequence and its noisy observations. The folded density is $$s_\Delta(\nu) = \frac{1}{\Delta}\sum_{\ell \in \mathbb{Z}} S_T^c\big((\nu + \ell)/\Delta\big)$$, where $$S_T^c$$ is the continuous part of $$S_T$$. The relation $$e_\infty = \sigma_0^2(e^{2\rho} - 1)$$ is the Kolmogorov–Szegő formula applied to the noisy observations.
[^noiseless]: Without noise, the limit of the prediction variance is $$\exp\big(2\int_0^{1/2} \log s_\Delta(\nu)\, d\nu\big)$$, which is zero when $$s_\Delta$$ vanishes on an interval. It is reached only in the limit: for every finite $$n$$, the prediction variance is positive.
[^assumptions]: Assumptions: a product kernel, a spatial kernel smooth enough for $$f$$ to be Lipschitz in $$x$$ with high probability, Gaussian noise, and observations at a fixed frequency.
