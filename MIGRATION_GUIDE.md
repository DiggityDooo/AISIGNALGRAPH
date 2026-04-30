# Migration Guide

AISIGNALGRAPH now stores a lightweight schema version in the SQLite `meta` table.

## Current Schema

- `schema_version`: `1`
- Database path: controlled by `DATABASE_PATH`
- Source document path: controlled by `AI_MASTER_DOC_PATH`

## Upgrade Rules

1. Bump `SCHEMA_VERSION` in `webapp/graph_store.py` when a schema change is not backward compatible.
2. Keep additive migrations inline when they can be applied safely at startup.
3. Force a rebuild when the stored source signature no longer matches the current source document.

## Current Startup Behavior

- Missing `cluster_id` / `cluster_role` columns are added in place.
- `schema_version` is written into `meta`.
- If the source signature changes, the graph database is rebuilt.

## Operator Notes

- Health and integrity checks are available at `/api/health`.
- Rebuilds can be triggered at `/api/rebuild`.
- Rebuild cancellation is exposed at `/api/rebuild/cancel`.
