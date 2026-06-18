# Issue Tracker: Local Markdown

Issues for this repo are tracked as markdown files under `.scratch/<feature-name>/` in the repository.

## Structure

Each issue is a single `.md` file with YAML frontmatter:

```yaml
---
title: Brief issue title
state: needs-triage  # or needs-info, ready-for-agent, ready-for-human, wontfix
assignee: (optional)
created: 2026-06-18
---

Issue description and context here.
```

## Workflow

- **needs-triage**: You review and decide if it's valid
- **needs-info**: Waiting on more details before proceeding
- **ready-for-agent**: Fully specified; an AI agent can pick it up
- **ready-for-human**: Blocked on human implementation
- **wontfix**: Closing without action

Skills that read from here: `to-issues`, `triage`, `qa`, `to-prd`.
