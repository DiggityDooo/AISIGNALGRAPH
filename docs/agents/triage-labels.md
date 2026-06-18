# Triage Labels

This repo uses a five-state triage vocabulary:

| State | Label | Meaning |
|-------|-------|---------|
| Evaluate | `needs-triage` | Maintainer needs to review and decide |
| Blocked | `needs-info` | Waiting on reporter / more context |
| Ready for agent | `ready-for-agent` | Fully specified; AI-ready to pick up |
| Ready for human | `ready-for-human` | Needs human implementation |
| Closed | `wontfix` | Will not be actioned |

Since this repo uses local markdown (not GitHub Issues), these states live in markdown frontmatter, not GitHub labels. See `docs/agents/issue-tracker.md` for structure.
