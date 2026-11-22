---
layout: post
title: On learned ignorance
description: A short history of the fifteenth-century book that gave this blog its name.
date: 2026-11-02 09:00:00+0100
interactive: true
scripts:
  - /assets/js/docta/polygon.js
---

In late November 1437, a convoy of Venetian galleys left Constantinople for Venice carrying the Byzantine emperor, the patriarch, and a delegation sent to bring them to a council meant to reunite the Eastern and Western churches. Among the delegates was a German canon lawyer in his mid-thirties, Nicholas of Cusa. Two years later, he wrote that the central idea of his most famous book had come to him during that crossing, as what he believed was a gift from above.[^letter]

## A lawyer with a taste for mathematics

Nicholas was born in 1401 in Kues, a village on the Moselle. He studied at Heidelberg, then at Padua, where he received a doctorate in canon law in 1423. In Padua he also encountered the latest work in mathematics and astronomy.

He made his name at the Council of Basel in the 1430s with a treatise on church reform, *De concordantia catholica*, before joining the papal side and the mission to Constantinople.

## The book

*De docta ignorantia*, usually translated *On Learned Ignorance*, was finished at Kues in 1440. It has three parts: the first on God, the second on the universe, the third on Christ. Its starting point is a claim about knowledge. We come to know something by comparing it with what we already know, through proportion and measure. A finite mind can always grasp the truth more precisely, and never exactly. To know this, and to know it well, is what Cusa calls learned ignorance: the more a person knows that they do not know, he writes, the more learned they are.

As he does throughout the book, he makes the point with geometry. The intellect attempts to grasp the truth as a polygon inscribed in a circle attempts to grasp the circle: the more sides it has, the more it resembles the circle, but no number of sides makes it equal to the circle.[^letter2]

<figure class="di-widget di-wide" data-di-widget="polygon" data-n="6">
  <noscript><p class="di-caption">This figure is interactive and needs JavaScript.</p></noscript>
  <figcaption>Cusa's polygon (Book I, chapter 3). Drag the slider to change the number of sides; the plot shows the fraction of the disc left uncovered.</figcaption>
</figure>

Note that, for a regular polygon with $$n$$ sides, the covered fraction of the disc is

$$
\frac{A_n}{A_\circ} \;=\; \frac{n}{2\pi}\,\sin\frac{2\pi}{n}.
$$

The same habit of thought runs through the rest of the book. As a circle grows without bound, its circumference becomes indistinguishable from a straight line, and in the infinite, Cusa argues, opposites such as the curved and the straight, or the maximum and the minimum, coincide. The second book draws a startling conclusion for 1440: the universe has neither a fixed center nor a fixed boundary, and the Earth is neither its center nor at rest. It is a philosophical argument, not an astronomical model, but it came a century before Copernicus.

## After the book

Cusa became a cardinal in 1448 and bishop of Brixen, in the Tyrol, in 1450. That same year he wrote a series of dialogues featuring a layman, the *Idiota*. One of them, *De staticis experimentis*, argues that nature is best known by weighing: the blood and urine of the sick and the healthy, a seed and the plant it grows into, a ball of wool before and after it takes up moisture from the air. It is one of the few works in which he appeals to experiment.<span class="di-note">In <em>De mente</em>, written the same year, Cusa suggests that <em>mens</em>, mind, takes its name from <em>mensurare</em>, to measure.</span>

<aside class="di-note">Exact squaring was only proved impossible in 1882, when Lindemann showed that &pi; is transcendental.</aside>

He also returned again and again to squaring the circle, in treatises that his younger contemporary Regiomontanus took apart. He died in Todi, in Umbria, in 1464. The hospice he founded in Kues still stands, and still houses his library.

## Why the name

This blog is about learning under uncertainty: how algorithms should act when they know only part of what they need, and how much they can learn from a limited number of observations. Cusa's title names that subject better than anything I could come up with, so I borrowed it. Expect notes on my research and on ideas I find interesting, most of them with figures you can play with.

[^letter]: In the dedicatory letter to Cardinal Giuliano Cesarini that closes the book.
[^letter2]: The image itself was not new. Seventeen centuries earlier, Archimedes had squeezed the circle between inscribed and circumscribed polygons to bound $$\pi$$.