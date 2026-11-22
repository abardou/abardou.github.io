---
layout: post
title: Symmetries as an inductive bias
description: When a function has symmetries, every observation yields information about multiple locations in the search space. How to tell a Bayesian optimizer about it?
date: 2026-11-22 01:30:00+0100
interactive: true
scripts:
  - /assets/js/docta/core.js
  - /assets/js/docta/gp.js
  - /assets/js/docta/symmetry.js
  - /assets/js/docta/symmetry-widgets.js
  - /assets/js/docta/symmetry-races.js
---

Some functions are invariant according to some symmetries. The energy of a molecule does not change when you rotate it, and a mixture of three powders is the same whatever order you list them in. When a function is unchanged by a group of transformations, a single evaluation tells you its value at several places at once. When evaluations are expensive, that is a powerful way to increase sample efficiency.

Take a wireless network. Below, two identical antennas serve sixteen people working along a corridor, and the goal is to place them so as to maximize the total throughput. A design of the wireless network is a pair of numbers, $$x = (x_1, x_2)$$: the position of antenna 1 and the position of antenna 2. But the ordering of the antennas is arbitrary. Change it and you get another design, $$(x_2, x_1)$$, which describes the very same network.

<figure class="di-widget di-wide" data-di-widget="wifi">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>Each user joins the antenna it hears best, the two antennas interfere with each other, and each shares its airtime among its users. The shading in the corridor is the data rate a user would get at each spot; the shading in the square is the total throughput of every design. A toy model, but the symmetry is exact.</figcaption>
</figure>

Every network appears twice in the search space, once on each side of the diagonal, and the landscape is a mirror image of itself. That is worth exploiting. And the more antennas, the more worth it is: with $$n$$ antennas, each network has $$n!$$ labelings, and an optimizer that does not know it may pay for the same network up to $$n!$$ times.

Now, the easiest way to grasp how useful symmetries could be is to play the optimizer yourself. Below is a hidden landscape with a few mirror symmetries. You have six evaluations to find its highest point. Then switch the symmetry on and play again.

<figure class="di-widget di-wide" data-di-widget="echoes">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>A landscape on the disc that is unchanged by reflection across each mirror line, and therefore by the rotations those reflections generate. With the symmetry on, each evaluation is copied to every point the group maps it to.</figcaption>
</figure>

This note is about incorporating these symmetries as an inductive bias for a Bayesian algorithm. It is based on our [ICLR 2026 paper](https://openreview.net/forum?id=zUbBaWAM1Q) with Antoine Gonon, Aryan Ahadinia and Patrick Thiran, in which we revisit a simple idea from kernel methods, and show that it makes Bayesian optimization significantly more sample-efficient on symmetric problems.

## Paying twice for the same information

Bayesian optimization looks for the maximum of a function that is expensive to evaluate and that offers no gradients: all you can do is query it and observe a (noisy) value. It maintains a probabilistic model of the function, usually a Gaussian process. After each evaluation, the model provides two things at every point $$x$$: a best guess $$\mu(x)$$, the posterior mean, and an uncertainty $$\sigma(x)$$. The next query goes where the function could plausibly be highest,

$$
x_{t+1} = \arg\max_x \; \mu_t(x) + \beta\,\sigma_t(x),
$$

where a large $$\beta$$ favors exploring uncertain regions and a small one favors refining the best region found so far. Everything the model believes comes from a single object, its kernel $$k(x, x') = \mathrm{Cov}(f(x), f(x'))$$, which quantifies how similar the values of the function at $$x$$ and $$x'$$ should be. Here, as in the rest of this note, it is the Gaussian kernel $$k(x,x') = \exp\left(-\lVert x - x' \rVert^2 / 2\ell^2\right)$$: nearby points are similar, distant ones are not.

The function below is symmetric: for any $$x$$, $$f(x) = f(-x)$$, but the model does not know it. Let the algorithm choose a few points and watch where it goes. Then tell the model about the mirror.

<figure class="di-widget di-wide" data-di-widget="bo-primer">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>A Gaussian process fitted to a few evaluations (dots); the band is the posterior mean plus or minus two standard deviations. Hollow dots are values known for free, by symmetry. The lower curve is the acquisition function; its maximum, marked, is the next query. Click on the plot to evaluate the function yourself.</figcaption>
</figure>

The symmetry-blind model sees an unexplored half and pays to evaluate it again, point by point. Once it knows the mirror, its uncertainty collapses on both sides at once and every evaluation lands somewhere new. With a single mirror, ignoring the symmetry roughly doubles the work. In real-world problems, a point can have thousands of copies.

## Two ways to make a kernel invariant

Suppose that $$f$$ is invariant under a group $$G$$ of transformations: $$f(gx) = f(x)$$ for every $$g \in G$$ and every $$x$$. Then $$x$$ and $$gx$$ are not merely similar, they are interchangeable. A Gaussian process whose sample paths all share this invariance must have an invariant kernel, with $$k(gx, g'x') = k(x, x')$$ for all $$g, g' \in G$$.[^ginsbourger] Starting from a base kernel $$k$$, there are two natural ways to build one:

$$
k_{\mathrm{avg}}(x,x') = \frac{1}{\lvert G \rvert^2}\sum_{g,g'\in G} k(gx, g'x'),
\qquad
k_{\max}(x,x') = \max_{g,g'\in G}\, k(gx, g'x').
$$

Both compare the copies of $$x$$ with the copies of $$x'$$. The first averages these similarities. It is the standard choice for Bayesian optimization, with a clean interpretation: the functions it can represent are exactly the invariant functions of the base kernel.[^avg] The second keeps only the best alignment. Below, a group with $$n$$ mirror lines gives $$x'$$ its $$2n$$ copies, and each segment links $$x$$ to one of them, darker when they are more similar.

<figure class="di-widget di-wide" data-di-widget="pairs">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>Every copy of x′ (squares) and its similarity to x under the Gaussian kernel with lengthscale 0.3. The averaged kernel is the mean of these similarities, the max kernel their maximum; by invariance, comparing every copy of x with every copy of x′ gives the same two numbers.</figcaption>
</figure>

One thing becomes immediately clear: only one copy is well aligned with $$x$$, and the average dilutes it among all $$2n$$ of them, so the averaged similarity is roughly $$1/(2n)$$ of the true one. Unlike the average, taking the max keeps the closest alignment. The exception is instructive: drag $$x'$$ onto a mirror line, or to the center, and several copies merge. There, several alignments are right at once, and the average recovers part of its strength. Its opinion of how similar two points are depends on where they are relative to the mirrors.

The same contrast, for all points of the disc at once: each panel shows how similar every point is to the dot.

<figure class="di-widget di-wide" data-di-widget="kernels">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>Similarity to a reference point under the Gaussian kernel (lengthscale 0.2) and its two invariant versions, for a group with n mirror lines. Rings mark the copies of the dot; drag it around.</figcaption>
</figure>

The base kernel knows nothing of the symmetry and shows a single bump. Both invariant kernels light up every copy of the dot, but the average lights them at a fraction of full strength, while under the max kernel every copy is exactly as similar to the dot as the dot is to itself (as it should be).

## Folding the search space

We just found something interesting. Why is $$k_\mathrm{max}$$ so good at capturing symmetries?

The answer is geometric, and can easily be visualized. Fold the disc along its mirror lines, like a paper fan, until all the copies of a point land on top of one another. What remains is a single wedge in which each point stands for a whole family of equivalent points. More formally, this is the quotient of the disc by the group, the space of equivalence classes, also called an orbifold. There is a natural distance function in this space: the distance between two points of the wedge is the length of the shortest path from one to any copy of the other, $$\min_{g \in G} \lVert x - gx' \rVert$$.

<figure class="di-widget di-wide" data-di-widget="fold">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>Fold the disc along its mirror lines, one wedge at a time. The rings are the copies of B; once folded, they all land on B. The line is the shortest path from A to any copy of B, and its length is the distance in the folded space. Both kernels use a lengthscale of 0.3.</figcaption>
</figure>

The last option, ∞, takes every rotation of the disc. The copies of a point now form a whole circle, the wedge narrows to a single line, and the fold sends each point $$x$$ to its distance from the center, $$\lVert x \rVert_2$$. The orbifold is a segment, and the distance between two points is the difference of their radii.

## Fold first, then draw

Now put an ordinary Gaussian process on the folded space, with the base kernel and these distances, and unfold it. The result is a Gaussian process on the disc whose covariance is exactly $$k_{\max}$$![^prop] The max kernel is not an ad hoc trick: it is what you get by modeling the function where it actually lives, on the space of equivalence classes, with the base kernel you would have used anyway.

The averaged kernel has a construction too. Draw a function $$h$$ from the base Gaussian process on the whole disc, then average it over all its copies, $$\frac{1}{\lvert G \rvert}\sum_{g} h(gx)$$. The result is invariant, and its covariance is exactly $$k_{\mathrm{avg}}$$; it is also what you obtain by conditioning $$h$$ on being invariant to $$G$$.[^brown] Both routes can start from the same random draw. Here they are, side by side.

<figure class="di-widget di-wide" data-di-widget="priors">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>One random function h drawn from the Gaussian-kernel prior (lengthscale 0.2), made invariant in two ways. Averaging over the group gives a draw from the prior of the averaged kernel; keeping h on the fundamental wedge, or on one radius, and unfolding it gives a draw from the prior of the max kernel. Typical size is the root mean square over the disc.</figcaption>
</figure>

Same draw, two invariant functions. Folding keeps $$h$$ intact on every copy of the wedge: the result looks like an ordinary draw from the base prior, repeated by the symmetry. Averaging washes $$h$$ out, because $$\lvert G \rvert$$ unrelated values mostly cancel, except near the mirrors and the center, where some copies coincide. The averaged prior is not only fainter, it is uneven: it expects the function to vary much more near the symmetry axes than anywhere else, for no reason other than the way the kernel was built. Formally, the Gaussian process built with the average kernel is not stationary. Conversely, the Gaussian process built from $$k_\max$$ is a vanilla stationary process in the wedge, which the mirrors copy across the whole disc.

## A race

Time to see the kernels at work. Below, three optimizers chase the peak of the same symmetric landscape from the same five random starting points, using the upper-confidence rule from above. They differ only in their kernel. Each panel shows what the model currently believes, its posterior mean, along with every point it has evaluated; faint circles mark the true peaks. The chart tracks the cumulative regret $$R_T = \sum_{i = 1}^T (f(x^*) - f(x_i))$$, the total optimization error of all evaluations so far with respect to the maximum of $$f$$.

<figure class="di-widget di-wide" data-di-widget="race">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>Three optimizers with the base, averaged and max kernels on a landscape with n mirror lines, run as in the experiments of the paper: noisy evaluations, and each model fits its signal variance, lengthscale and noise level by maximum likelihood at every step. The exploration weight β grows slowly with the number of evaluations.</figcaption>
</figure>

Run it a few times. With four mirrors, both invariant kernels leave the base kernel far behind and stay fairly close. With eight mirrors, $$\lvert G \rvert = 16$$, the gap opens. To fit the data, the averaged model inflates its signal variance, to about five times that of the max model, and its uncertainty is then largest where copies merge: on the mirrors and at the center. That is where it spends its evaluations, more than half of them against a fifth for the max kernel.

## Coda: when the max is not a kernel

Everything above relied on folding: mirror lines fold the disc flat into a wedge, and all rotations together collapse it onto a segment. Unfortunately, some groups cannot be folded that way. Take the four rotations by multiples of 90°, without mirrors. A quarter of the disc contains one copy of every point, but its two straight edges are copies of each other according to $$G$$, and to measure distances between orbits they must be glued together.

<figure class="di-widget di-wide" data-di-widget="cone">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>The quotient of the disc by the rotations of 90°: a quarter of the disc with its two edges glued, which is a cone. The green path is the shortest way from x to a copy of x′; the dotted one stays inside the quarter disc.</figcaption>
</figure>

A cone cannot be laid flat without tearing or stretching, so no fold turns orbit distances into ordinary distances, and $$k_{\max}$$ indeed fails to be positive semi-definite here. A Gaussian process cannot use it as it is.

The fix is pragmatic. Given the points $$D$$ evaluated so far, form the matrix $$K = k_{\max}(D, D)$$, set its negative eigenvalues to zero to obtain $$K_+$$, and extend it to new points with the Nyström formula

$$
k_+(x, x') = k_{\max}(x, D)\, K_+^{\dagger}\, k_{\max}(D, x').
$$

The result is a valid invariant kernel that agrees with $$k_{\max}$$ on $$D$$ whenever $$K$$ was already positive semi-definite, at the same asymptotic cost per iteration as the averaged kernel. Here are the two kernels side by side. Drag the reference point $$x_0$$, change the number of data points, or switch groups.

<figure class="di-widget di-wide" data-di-widget="projection">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>The max kernel and its projected version k₊ as functions of their second argument, for a reference point x₀ (dot; rings mark its copies) and data points D (small dots), with a Gaussian base kernel of lengthscale 0.25. Eigenvalues below 10⁻⁴ are dropped, as in the paper's code. The third panel has its own color range, shown below it.</figcaption>
</figure>

With rotations by 90°, about a third of the eigenvalues of $$K$$ are negative and set to zero. The two kernels then differ by a few hundredths, even at the data points, and the gap shrinks only slowly as data accumulate: it comes from the negative part of $$k_{\max}$$ itself, not from a lack of data. Add the mirrors and nothing is clipped: once the data cover the disc, $$k_+$$ and $$k_{\max}$$ coincide.

This is the off-the-shelf version of the $$k_\max$$ we propose in our paper, and our benchmarks show its advantage over the averaged kernel, which grows with the size of the group.

If you are eager for more technical details, the paper is [on OpenReview](https://openreview.net/forum?id=zUbBaWAM1Q), and the code is [on GitHub](https://github.com/abardou/max-kernel).

Thanks for reading, and see you on the next note!

[^ginsbourger]: D. Ginsbourger, X. Bay, O. Roustant and L. Carraro, *Argumentwise invariant kernels for the approximation of invariant functions*, Annales de la Faculté des Sciences de Toulouse, 2012.
[^avg]: R. Kondor, *Group theoretical methods in machine learning*, PhD thesis, Columbia University, 2008; T. Brown, A. Cioba and I. Bogunovic, *Sample-efficient Bayesian optimisation using known invariances*, NeurIPS 2024.
[^prop]: Proposition 1 in the paper. It requires a folding map that turns the distance between orbits into an ordinary Euclidean distance: folding along mirrors provides one, and so does $$x \mapsto \lVert x \rVert$$ for all rotations.
[^brown]: Brown, Cioba and Bogunovic (2024), for a base kernel that is unchanged when both of its arguments are transformed together, as the Gaussian kernel is under rotations and reflections.
