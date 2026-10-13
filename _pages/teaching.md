---
layout: page
permalink: /teaching/
title: teaching
description: 
nav: true
nav_order: 5
---
{%- assign total_hours = 0 -%}
{%- assign total_courses = 0 -%}
{%- for inst in site.data.teaching -%}
  {%- for course in inst.courses -%}
    {%- assign n_terms = course.terms | size -%}
    {%- assign course_hours = course.hours | times: n_terms -%}
    {%- assign total_hours = total_hours | plus: course_hours -%}
    {%- assign total_courses = total_courses | plus: 1 -%}
  {%- endfor -%}
{%- endfor -%}
{%- assign total_institutions = site.data.teaching | size -%}

<div class="teaching">
  <div class="summary-row">
    <div class="stat"><span class="stat-value">{{ total_hours }}</span><span class="stat-label">hours taught</span></div>
    <div class="stat"><span class="stat-value">{{ total_courses }}</span><span class="stat-label">courses</span></div>
    <div class="stat"><span class="stat-value">{{ total_institutions }}</span><span class="stat-label">institutions</span></div>
  </div>
  {%- for inst in site.data.teaching %}
  <section class="institution">
    <div class="institution-header">
      <h2><a href="{{ inst.url }}">{{ inst.institution }}</a></h2>
      <span class="location">{{ inst.location }}</span>
    </div>
    {%- for course in inst.courses %}
    {%- assign n_terms = course.terms | size %}
    <div class="course">
      <div class="terms">
        {%- for term in course.terms %}
        <span class="term">{{ term }}</span>
        {%- endfor %}
      </div>
      <div class="course-body">
        <div class="course-title">{{ course.title }}</div>
        <div class="course-meta">{{ course.level }} · {{ course.hours }} h{% if n_terms > 1 %} per term{% endif %} · {{ course.role }}</div>
        {%- if course.instructor %}
        <div class="course-meta">Course led by {% if course.instructor_url %}<a href="{{ course.instructor_url }}">{{ course.instructor }}</a>{% else %}{{ course.instructor }}{% endif %}</div>
        {%- endif %}
      </div>
    </div>
    {%- endfor %}
  </section>
  {%- endfor %}
</div>
