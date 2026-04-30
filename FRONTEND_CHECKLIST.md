# AI Signal Graph - Frontend Files Status

This checklist tracks the status of all frontend assets and templates to ensure clear ownership and progress visibility between Gemini and CodeX.

## Static Assets (`webapp/static/`)

| File | Status | Owner | Description |
|------|--------|-------|-------------|
| `graph.js` | 🚧 In Progress | CodeX | Core graph physics, D3 simulation, signal logic. |
| `shader.js` | ✅ Ready | Gemini | WebGL background shader implementation. |
| `app.js` | ✅ Ready | Gemini | General app interaction and UI logic. |
| `futuristic.css` | 🚧 In Progress | Gemini | Glass morphism and neon design system. |
| `premium.css` | 🚧 In Progress | Gemini | Premium layout constraints and HUD styling. |
| `app.css` | ✅ Ready | Gemini | Base styles and legacy fallbacks. |
| `flow_field.js` | ✅ Ready | CodeX/Gemini | Background flow animation logic. |
| `spline_handler.js` | ✅ Ready | CodeX/Gemini | Spline path handling for custom edges. |

## Templates (`webapp/templates/`)

| File | Status | Owner | Description |
|------|--------|-------|-------------|
| `base.html` | ✅ Ready | Gemini | Global HTML skeleton and asset loading. |
| `dashboard.html` | 🚧 In Progress | Gemini | Main HUD overlay, graph container, and sidebars. |
| `home.html` | ✅ Ready | Gemini | Landing page. |
| `entities.html` | ✅ Ready | Gemini | Tabular entity list view. |
| `stories.html` | ✅ Ready | Gemini | Tabular story list view. |
| `entity_detail.html` | ✅ Ready | Gemini | Detailed view for a single entity. |
| `story_detail.html` | ✅ Ready | Gemini | Detailed view for a single story. |
| `400.html` - `503.html` | ✅ Ready | Gemini | Standard error pages. |

---
**Last Updated:** April 2026
**Note:** File ownership aligns with the `COLLABORATION.md` and `GEMINI_HANDOFF.md` contracts.
