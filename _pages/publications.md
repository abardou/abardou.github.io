---
layout: page
permalink: /publications/
title: publications
description: publications in reversed chronological order.
years: [2026, 2025, 2024, 2023, 2022, 2021]
nav: true
nav_order: 1
summary: true  # key figures above the list, see _includes/publications_summary.html
---
{% if page.summary %}{% include publications_summary.html %}{% endif %}
<!-- _pages/publications.md -->
<div class="publications">

{%- for y in page.years %}
  <h2 class="year">{{y}}</h2>
  {% bibliography -f papers -q @*[year={{y}}]* %}
{% endfor %}

</div>
