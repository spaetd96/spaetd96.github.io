---
# Leave the homepage title empty to use the site title
title: ""
date: 2022-10-24
type: landing

design:
  # Default section spacing
  spacing: "6rem"

sections:
  - block: resume-biography-3
    content:
      # Choose a user profile to display (a folder name within `content/authors/`)
      username: admin
      text: ""
      # Show a call-to-action button under your biography? (optional)
      #button:
      #  text: Download CV
      #  url: uploads/resume.pdf
    design:
      css_class: dark
      background:
        color: black
        image:
          # Add your image background to `assets/media/`.
          #filename: stacked-peaks.svg
          filename: Rectangle.svg
          filters:
            brightness: 1.0
          size: cover
          position: center
          parallax: false
  - block: resume-experience
    id: experience
    content:
      username: admin
    design:
      # Hugo date format
      date_format: 'January 2006'
      # Education or Experience section first?
      is_education_first: false
  - block: collection
    id: papers
    content:
      title: Publications
      text: ""
      filters:
        folders:
          - publication
        exclude_featured: true
    design:
      view: citation
  - block: collection
    id: talks
    content:
      title: Talks
      filters:
        folders:
          - event
    design:
      view: article-grid
      columns: 1
  - block: collection
    id: outreach
    content:
      title: Outreach
      subtitle: ''
      text: ''
      # Page type to display. E.g. post, talk, publication...
      page_type: post
      # Choose how many pages you would like to display (0 = all pages)
      count: 0
      # Filter on criteria
      filters:
        author: ""
        category: ""
        tag: ""
        exclude_featured: false
        exclude_future: false
        exclude_past: false
        publication_type: ""
      # Choose how many pages you would like to offset by
      offset: 0
      # Page order: descending (desc) or ascending (asc) date.
      order: desc
    design:
      # Choose a layout view
      view: date-title-summary
      # Reduce spacing
      spacing:
        padding: [0, 0, 0, 0]
  - block: markdown
    id: teaching
    content:
      title: Teaching
      text: ""
---

## Courses
− Teaching Assistant - Climate Dynamics and Diagnostics (WS 2022, WS 2023). Master Program at the Meteorology and Geophysics department, University of Vienna.\
− Teaching Assistant - Climate Modelling Lab (SS 2023, SS 2024). Master Program at the Meteorology and Geophysics department, University of Vienna.\
− Teaching Assistant - Thermodynamics of the Atmosphere (SS 2023, SS 2024). Bachelor Program at the Meteorology and Geophysics department, University of Vienna.\
## Co-advised Theses
− Natalie Auer (MSc Thesis, ongoing). Equatorial waves and precipitation in CMIP models.\
− David Schubauer (BSs Thesis, 2022). Niederschlagsvariabilität in der Sahelzone auf der täglichen Skala in expliziten Konvetionsmodellen und TRACMIP Simulationen.
