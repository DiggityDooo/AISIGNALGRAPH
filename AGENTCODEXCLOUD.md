# AI Signal Graph — Agent Instructions

## Project Structure

- `app.py` — Flask routes and API endpoints
- `static/graph.js` — D3 force simulation and graph rendering
- `static/futuristic.css` — All layout and styling
- `static/shader.js` — Background canvas shader
- `templates/` — Jinja2 HTML templates
- `data/ai_graph.db` — SQLite database
- `data/ai_master.md` — Intelligence source file

## Stack

- Python / Flask backend
- SQLite via direct connection
- D3.js v7 force graph (2D)
- Three.js (3D mode toggle)
- Vanilla JS, no frontend framework

## How to Run Locally

```bash
pip install -r requirements.txt
python app.py
```

## Debug Checklist — Run These Before Finishing Any Task

- Check for duplicate HTML element IDs
- Verify z-index layering on all canvas/SVG elements
- Confirm no stray layout blocks enter the graph viewport
- Check Flask routes return valid JSON with correct status codes
- Verify JS console has no uncaught errors
- Test graph loads with empty database AND populated database

## Known Issues to Watch For

- Content blocks rendering alongside the graph canvas (layout bleed)
- D3 simulation becoming rigid (check velocityDecay, alphaDecay, linkStrength)
- SQLite path errors on cloud restart (ephemeral filesystem)
- Rate limit headers missing from API responses
