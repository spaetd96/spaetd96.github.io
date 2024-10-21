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
      # set spacing
      #spacing:
      #  padding: ['30px', 0, '30px', 0]
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
      # set spacing
      #spacing:
      #  padding: ['30px', 0, '30px', 0]
  - block: collection
    id: talks
    content:
      title: Talks
      subtitle: ''
      text: ''
      # Page type to display. E.g. post, talk, publication...
      page_type: talks
      # Choose how many pages you would like to display (0 = all pages)
      count: 5
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
      # set spacing
      spacing:
        #padding: ['30px', 0, '30px', 0]
        padding: [0, 0, 0, 0]
  - block: collection
    id: events
    content:
      title: Events
      subtitle: ''
      text: ''
      # Page type to display. E.g. post, talk, publication...
      page_type: events
      # Choose how many pages you would like to display (0 = all pages)
      count: 5
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
      # set spacing
      spacing:
        padding: ['6rem', 0, 0, 0]
        #padding: [0, 0, 0, 0]
---