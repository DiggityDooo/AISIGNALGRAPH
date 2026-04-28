# AI Signal Graph

This app is now a local AI knowledge graph, not a scraper UI.

It ignores the old markdown vault, old generated notes, and `scraper.db`. The active application reads only from:

- `/home/seanb/Documents/New Folder/AI_Master_Document_2020_2026.md`
- `data/ai_graph.db`

## What it does

- Stores AI stories covering advancements, drama, cheats, policy, and infrastructure.
- Imports the master document into structured stories, entities, keyword hubs, and relationship edges.
- Maps those stories to labs, models, products, risks, people, years, and topic nodes.
- Renders the network as an interactive graph view inspired by Obsidian-style relationship maps with a more fluid force simulation.
- Supports story and entity exploration through server-rendered detail pages.

## Run it

```bash
./venv/bin/python -m pip install -r requirements.txt
./venv/bin/python app.py
```

Open `http://127.0.0.1:5000`.

## Reset the dataset

Use the `Rebuild from master document` button in the UI, or remove `data/ai_graph.db` and restart the app.
