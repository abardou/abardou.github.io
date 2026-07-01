---
layout: about
title: Anthony Bardou
description: Anthony Bardou is a postdoctoral researcher at EPFL working on adaptive algorithms, online learning, and uncertainty-aware optimization for complex real-world systems.
permalink: /
subtitle: Postdoctoral Researcher @ <a href='https://www.epfl.ch/en/'>EPFL</a>, <a href='https://indy.epfl.ch/'>INDY Lab</a>.

profile: false

news: true  # includes a list of news items
selected_papers: true # includes a list of papers marked as "selected={true}"
social: true  # includes social icons at the bottom of the page
---

<div class="about-hero">
  <!-- <div class="about-hero-badge">Research highlight</div> -->
  <h1 class="about-hero-title">Optimization under <span class="hero-term hero-uncertainty">uncertainty</span>, <span class="hero-term hero-dynamics">dynamics</span> and <span class="hero-term hero-structure">structure</span></h1>
  <p class="about-hero-subtitle">I build algorithms that allow intelligent systems to learn from limited data, to make robust decisions over time, and to thrive in complex networks and embedded environments.</p>
</div>

<div class="about-showcase">
  <div class="about-card about-card-featured">
    <h3>Built for real systems</h3>
    <p>Optimization is most impactful when it leaves the benchmark and meets the real world. My research develops algorithms for complex, distributed, and resource-constrained systems, with applications ranging from wireless networks to autonomous aerial robotics.</p>
    <div class="video-frame">
      <video controls preload="metadata" playsinline>
        <source src="/assets/vid/launch_drone.mp4" type="video/mp4">
      </video>
    </div>
    <p class="legend"><small><b>Description:</b> An EasyGlider 4 is launched by hand from a field in Switzerland. Shot by my co-authors (Simon Jeger, Marin Philippe 👋) during our first outdoor flight aiming at testing our optimization algorithm for autonomous soaring.</small></p>
    <div class="video-frame">
      <video controls preload="metadata" playsinline>
        <source src="/assets/vid/reroute_gp.mp4" type="video/mp4">
      </video>
    </div>
    <p class="legend"><small><b>Description:</b> While flying, the drone continuously observe its environment. Using a world model that combines prior domain knowledge with online learning, it dynamically replan its route towards the mission goal and favours trajectories that go through high-energy (red) areas.</small></p>
  </div>
  <div class="about-right">
    <div class="about-card">
      <h3>Gray-Box Optimization</h3>
      <p>Real-world problems are rarely unstructured. By incorporating symmetries, invariances, and domain knowledge into versatile optimization frameworks, I develop algorithms that learn more efficiently.</p>
      <div class="video-frame">
        <video controls preload="metadata" playsinline>
          <source src="/assets/vid/rotation_invariant_gp.mp4" type="video/mp4">
        </video>
      </div>
      <p class="legend"><small><b>Description:</b> Incorporating the objective symmetry directly into the model significantly improves both the GP regression and the sample efficiency of the optimization algorithm.</small></p>
      <!-- <div class="card-gallery">
        <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&h=200&fit=crop" alt="Optimization landscape" class="gallery-img">
        <img src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=300&h=200&fit=crop" alt="Network topology" class="gallery-img">
      </div> -->
    </div>
    <div class="about-card">
      <h3>Adapting to Change</h3>
      <p>Many optimization problems evolve over time, requiring algorithms that can continuously adapt as objectives and environments change. I develop optimization methods that remain sample-efficient and reliable in dynamic settings.</p>
      <div class="video-frame">
        <video controls preload="metadata" playsinline>
          <source src="/assets/vid/PermSix-Hump_Camel_25.0_240.mp4" type="video/mp4">
        </video>
      </div>
      <p class="legend"><small><b>Description:</b> GP surrogate able to identify and remove stale observations from its own dataset, while still managing to track the maximal argument of the objective.</small></p>
      <!-- <div class="card-gallery">
        <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=300&h=200&fit=crop" alt="Real-time adaptation" class="gallery-img">
        <img src="https://images.unsplash.com/photo-1518611505868-d7f6b3b2c5b4?w=300&h=200&fit=crop" alt="Performance metrics" class="gallery-img">
      </div> -->
    </div>
  </div>
</div>

<div class="about-body">
  <h2>about</h2>
  <div class="about-story">
    <div class="about-story-image">
      <img src="/assets/img/prof_pic.jpg" alt="Antoine Bardou">
    </div>
    <div class="about-story-copy">
      <p>I am a postdoctoral researcher at <a href='https://www.epfl.ch/en/'>EPFL</a>, within the <a href='https://indy.epfl.ch/'>INDY Lab</a>, working in collaboration with <a href='https://people.epfl.ch/patrick.thiran'>Prof. Patrick Thiran</a>. My research lies at the intersection of experimental design, stochastic modeling, online learning, and derivative-free, uncertainty-aware optimization. Broadly speaking, I am interested in developing adaptive algorithms that efficiently acquire information and make decisions in uncertain, complex, and evolving environments. This work spans both fundamental questions (such as statistical efficiency, exploration strategies, and performance guarantees) and applications to real-world problems, mostly in wireless networks, embedded systems, and network science.</p>

      <p>Prior to joining EPFL, I obtained my Ph.D. from <a href='https://www.ens-lyon.fr/'>École Normale Supérieure (ENS) Lyon</a>, where I was a member of the <a href='https://www.ens-lyon.fr/LIP/index.php/research/hownet-team'>HoWNet team</a> under the supervision of <a href='https://perso.ens-lyon.fr/thomas.begin/'>Prof. Thomas Begin</a>. My doctoral research focused on high-dimensional black-box decision-making and online learning methods, with a particular emphasis on the autonomous management of next-generation wireless networks (particularly Wi-Fi and 5G networks). Through this work, I developed scalable approaches capable of operating under severe uncertainty while continuously adapting to changing conditions.</p>

      <p>More generally, my research is motivated by a simple question: how can intelligent systems learn efficiently from limited observations and improve their decisions over time? Answering this question requires combining ideas from machine learning, statistics, and optimization, while maintaining a strong connection to practical challenges in modern complex systems.</p>

      <p><strong>I am on the job market! If interested, feel free to drop me an e-mail!</strong></p>
    </div>
  </div>
</div>

<script>
  function syncVideoFrames() {
    document.querySelectorAll('.video-frame').forEach(function (frame) {
      const video = frame.querySelector('video');
      if (!video) return;

      const ratio = video.videoWidth && video.videoHeight
        ? video.videoWidth / video.videoHeight
        : 16 / 9;

      frame.style.aspectRatio = ratio.toString();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.video-frame video').forEach(function (video) {
      video.addEventListener('loadedmetadata', syncVideoFrames);
      video.addEventListener('loadeddata', syncVideoFrames);
      video.addEventListener('canplay', syncVideoFrames);
    });
    syncVideoFrames();
  });

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      document.querySelectorAll('video').forEach(function (video) {
        video.load();
      });
    }
  });
</script>