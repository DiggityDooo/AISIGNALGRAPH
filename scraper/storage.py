"""Story storage backend: GCS bucket in production, local files in dev.

The scraper runs as a Cloud Run Job and persists to GCS. The Flask app reads
the same objects at startup. When STORIES_BUCKET is unset, both fall back to
local files under data/ so development needs no cloud credentials.
"""

import json
import os
import tempfile
from pathlib import Path

from loguru import logger

STORIES_BLOB = "ai_stories.json"
STATE_BLOB = "scrape_state.json"

DEFAULT_STORIES_PATH = Path("data/ai_stories.json")
DEFAULT_STATE_PATH = Path("data/scrape_state.json")


def _bucket_name() -> str:
    return os.environ.get("STORIES_BUCKET", "").strip()


class StoryStorage:
    """Read/write stories + scrape state, GCS-backed when configured."""

    def __init__(
        self,
        bucket_name: str | None = None,
        stories_path: Path = DEFAULT_STORIES_PATH,
        state_path: Path = DEFAULT_STATE_PATH,
    ):
        self.bucket_name = bucket_name if bucket_name is not None else _bucket_name()
        self.stories_path = stories_path
        self.state_path = state_path
        self._bucket = None

    # -- GCS helpers ---------------------------------------------------------

    def _get_bucket(self):
        if self._bucket is None:
            from google.cloud import storage  # imported lazily; optional in dev

            client = storage.Client()
            self._bucket = client.bucket(self.bucket_name)
        return self._bucket

    def _read_blob(self, blob_name: str) -> str | None:
        try:
            blob = self._get_bucket().blob(blob_name)
            if not blob.exists():
                return None
            return blob.download_as_text(encoding="utf-8")
        except Exception as exc:
            logger.error("GCS read failed for {}: {}", blob_name, exc)
            return None

    def _write_blob(self, blob_name: str, content: str) -> bool:
        try:
            blob = self._get_bucket().blob(blob_name)
            blob.upload_from_string(content, content_type="application/json")
            return True
        except Exception as exc:
            logger.error("GCS write failed for {}: {}", blob_name, exc)
            return False

    # -- Local helpers -------------------------------------------------------

    @staticmethod
    def _read_local(path: Path) -> str | None:
        try:
            return path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return None
        except OSError as exc:
            logger.error("Local read failed for {}: {}", path, exc)
            return None

    @staticmethod
    def _write_local_atomic(path: Path, content: str) -> bool:
        """Write via temp file + os.replace; partial writes never corrupt."""
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            fd, tmp_name = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as handle:
                    handle.write(content)
                os.replace(tmp_name, path)
            finally:
                if os.path.exists(tmp_name):
                    os.unlink(tmp_name)
            return True
        except OSError as exc:
            logger.error("Atomic local write failed for {}: {}", path, exc)
            return False

    # -- Public API ----------------------------------------------------------

    def load_stories(self) -> list[dict]:
        raw = (
            self._read_blob(STORIES_BLOB)
            if self.bucket_name
            else self._read_local(self.stories_path)
        )
        if raw is None:
            return []
        try:
            stories = json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.error("Stories JSON malformed: {}", exc)
            return []
        return stories if isinstance(stories, list) else []

    def save_stories(self, stories: list[dict]) -> bool:
        content = json.dumps(stories, ensure_ascii=False, indent=2)
        if self.bucket_name:
            return self._write_blob(STORIES_BLOB, content)
        return self._write_local_atomic(self.stories_path, content)

    def load_state(self) -> dict:
        raw = (
            self._read_blob(STATE_BLOB)
            if self.bucket_name
            else self._read_local(self.state_path)
        )
        if raw is None:
            return {}
        try:
            state = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return state if isinstance(state, dict) else {}

    def save_state(self, state: dict) -> bool:
        content = json.dumps(state, ensure_ascii=False, indent=2)
        if self.bucket_name:
            return self._write_blob(STATE_BLOB, content)
        return self._write_local_atomic(self.state_path, content)
