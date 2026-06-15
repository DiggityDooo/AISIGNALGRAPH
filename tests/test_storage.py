"""Tests for scraper/storage.py — StoryStorage local and GCS paths."""

from __future__ import annotations

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from scraper.storage import (
    DEFAULT_STATE_PATH,
    DEFAULT_STORIES_PATH,
    STATE_BLOB,
    STORIES_BLOB,
    StoryStorage,
    _bucket_name,
)


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def local_storage(tmp_path):
    """StoryStorage with no bucket — uses temp directory."""
    return StoryStorage(
        bucket_name="",
        stories_path=tmp_path / "stories.json",
        state_path=tmp_path / "state.json",
    )


@pytest.fixture()
def stories_file(tmp_path):
    path = tmp_path / "stories.json"
    path.write_text(json.dumps([{"id": "s1", "title": "Test Story"}]), encoding="utf-8")
    return path


@pytest.fixture()
def state_file(tmp_path):
    path = tmp_path / "state.json"
    path.write_text(json.dumps({"last_run": "2024-01-01"}), encoding="utf-8")
    return path


# ---------------------------------------------------------------------------
# _bucket_name
# ---------------------------------------------------------------------------


class TestBucketName:
    def test_returns_empty_string_when_unset(self, monkeypatch):
        monkeypatch.delenv("STORIES_BUCKET", raising=False)
        assert _bucket_name() == ""

    def test_returns_env_value(self, monkeypatch):
        monkeypatch.setenv("STORIES_BUCKET", "my-bucket")
        assert _bucket_name() == "my-bucket"

    def test_strips_whitespace(self, monkeypatch):
        monkeypatch.setenv("STORIES_BUCKET", "  my-bucket  ")
        assert _bucket_name() == "my-bucket"


# ---------------------------------------------------------------------------
# StoryStorage init
# ---------------------------------------------------------------------------


class TestStoryStorageInit:
    def test_default_paths_set(self):
        s = StoryStorage(bucket_name="")
        assert s.stories_path == DEFAULT_STORIES_PATH
        assert s.state_path == DEFAULT_STATE_PATH

    def test_custom_bucket_stored(self):
        s = StoryStorage(bucket_name="my-bucket")
        assert s.bucket_name == "my-bucket"

    def test_empty_bucket_name_is_falsy(self):
        s = StoryStorage(bucket_name="")
        assert not s.bucket_name

    def test_reads_bucket_from_env_when_none(self, monkeypatch):
        monkeypatch.setenv("STORIES_BUCKET", "env-bucket")
        s = StoryStorage(bucket_name=None)
        assert s.bucket_name == "env-bucket"

    def test_explicit_bucket_overrides_env(self, monkeypatch):
        monkeypatch.setenv("STORIES_BUCKET", "env-bucket")
        s = StoryStorage(bucket_name="explicit-bucket")
        assert s.bucket_name == "explicit-bucket"


# ---------------------------------------------------------------------------
# _read_local
# ---------------------------------------------------------------------------


class TestReadLocal:
    def test_reads_existing_file(self, tmp_path):
        p = tmp_path / "data.json"
        p.write_text('{"key": "value"}', encoding="utf-8")
        result = StoryStorage._read_local(p)
        assert result == '{"key": "value"}'

    def test_returns_none_for_missing_file(self, tmp_path):
        result = StoryStorage._read_local(tmp_path / "nonexistent.json")
        assert result is None

    def test_returns_none_on_os_error(self, tmp_path):
        p = tmp_path / "file.json"
        p.write_text("data", encoding="utf-8")
        with patch.object(Path, "read_text", side_effect=OSError("disk error")):
            result = StoryStorage._read_local(p)
        assert result is None


# ---------------------------------------------------------------------------
# _write_local_atomic
# ---------------------------------------------------------------------------


class TestWriteLocalAtomic:
    def test_creates_file_with_content(self, tmp_path):
        p = tmp_path / "out.json"
        result = StoryStorage._write_local_atomic(p, '{"ok": true}')
        assert result is True
        assert p.read_text(encoding="utf-8") == '{"ok": true}'

    def test_creates_parent_directory(self, tmp_path):
        p = tmp_path / "nested" / "dir" / "out.json"
        result = StoryStorage._write_local_atomic(p, "content")
        assert result is True
        assert p.exists()

    def test_returns_false_on_os_error(self, tmp_path):
        p = tmp_path / "out.json"
        with patch("tempfile.mkstemp", side_effect=OSError("no space")):
            result = StoryStorage._write_local_atomic(p, "content")
        assert result is False

    def test_no_tmp_file_left_on_success(self, tmp_path):
        p = tmp_path / "out.json"
        StoryStorage._write_local_atomic(p, "content")
        tmp_files = list(tmp_path.glob("*.tmp"))
        assert len(tmp_files) == 0


# ---------------------------------------------------------------------------
# load_stories (local)
# ---------------------------------------------------------------------------


class TestLoadStoriesLocal:
    def test_returns_list_from_valid_file(self, tmp_path, stories_file):
        s = StoryStorage(bucket_name="", stories_path=stories_file)
        result = s.load_stories()
        assert isinstance(result, list)
        assert result[0]["id"] == "s1"

    def test_returns_empty_list_when_file_missing(self, tmp_path):
        s = StoryStorage(bucket_name="", stories_path=tmp_path / "no.json")
        assert s.load_stories() == []

    def test_returns_empty_list_on_malformed_json(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("not json {{}", encoding="utf-8")
        s = StoryStorage(bucket_name="", stories_path=p)
        assert s.load_stories() == []

    def test_returns_empty_list_when_json_is_not_list(self, tmp_path):
        p = tmp_path / "obj.json"
        p.write_text('{"key": "value"}', encoding="utf-8")
        s = StoryStorage(bucket_name="", stories_path=p)
        assert s.load_stories() == []

    def test_returns_empty_list_for_json_null(self, tmp_path):
        p = tmp_path / "null.json"
        p.write_text("null", encoding="utf-8")
        s = StoryStorage(bucket_name="", stories_path=p)
        assert s.load_stories() == []

    def test_returns_multiple_stories(self, tmp_path):
        stories = [{"id": f"s{i}", "title": f"Story {i}"} for i in range(5)]
        p = tmp_path / "stories.json"
        p.write_text(json.dumps(stories), encoding="utf-8")
        s = StoryStorage(bucket_name="", stories_path=p)
        result = s.load_stories()
        assert len(result) == 5


# ---------------------------------------------------------------------------
# save_stories (local)
# ---------------------------------------------------------------------------


class TestSaveStoriesLocal:
    def test_saves_and_reloads(self, local_storage):
        stories = [{"id": "s1", "title": "Test"}]
        local_storage.save_stories(stories)
        loaded = local_storage.load_stories()
        assert loaded == stories

    def test_returns_true_on_success(self, local_storage):
        result = local_storage.save_stories([{"id": "s1"}])
        assert result is True

    def test_file_is_valid_json(self, local_storage):
        stories = [{"id": "s1", "title": "Story"}]
        local_storage.save_stories(stories)
        content = local_storage.stories_path.read_text(encoding="utf-8")
        parsed = json.loads(content)
        assert parsed == stories

    def test_overwrites_existing_file(self, local_storage):
        local_storage.save_stories([{"id": "old"}])
        local_storage.save_stories([{"id": "new"}])
        result = local_storage.load_stories()
        assert result[0]["id"] == "new"

    def test_unicode_preserved(self, local_storage):
        stories = [{"id": "s1", "title": "AI événement"}]
        local_storage.save_stories(stories)
        loaded = local_storage.load_stories()
        assert loaded[0]["title"] == "AI événement"

    def test_empty_list_saves_cleanly(self, local_storage):
        result = local_storage.save_stories([])
        assert result is True
        assert local_storage.load_stories() == []


# ---------------------------------------------------------------------------
# load_state (local)
# ---------------------------------------------------------------------------


class TestLoadStateLocal:
    def test_returns_dict_from_valid_file(self, tmp_path, state_file):
        s = StoryStorage(bucket_name="", state_path=state_file)
        result = s.load_state()
        assert isinstance(result, dict)
        assert result["last_run"] == "2024-01-01"

    def test_returns_empty_dict_when_file_missing(self, tmp_path):
        s = StoryStorage(bucket_name="", state_path=tmp_path / "no.json")
        assert s.load_state() == {}

    def test_returns_empty_dict_on_malformed_json(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("[[[[", encoding="utf-8")
        s = StoryStorage(bucket_name="", state_path=p)
        assert s.load_state() == {}

    def test_returns_empty_dict_when_json_is_not_dict(self, tmp_path):
        p = tmp_path / "list.json"
        p.write_text("[1, 2, 3]", encoding="utf-8")
        s = StoryStorage(bucket_name="", state_path=p)
        assert s.load_state() == {}


# ---------------------------------------------------------------------------
# save_state (local)
# ---------------------------------------------------------------------------


class TestSaveStateLocal:
    def test_saves_and_reloads(self, local_storage):
        state = {"last_run": "2024-06-01", "count": 42}
        local_storage.save_state(state)
        loaded = local_storage.load_state()
        assert loaded == state

    def test_returns_true_on_success(self, local_storage):
        result = local_storage.save_state({"key": "value"})
        assert result is True

    def test_empty_dict_saves_cleanly(self, local_storage):
        result = local_storage.save_state({})
        assert result is True
        assert local_storage.load_state() == {}

    def test_file_is_valid_json(self, local_storage):
        state = {"step": "done"}
        local_storage.save_state(state)
        content = local_storage.state_path.read_text(encoding="utf-8")
        assert json.loads(content) == state


# ---------------------------------------------------------------------------
# GCS path (mocked)
# ---------------------------------------------------------------------------


class TestGCSPaths:
    def _make_gcs_storage(self, tmp_path):
        return StoryStorage(
            bucket_name="test-bucket",
            stories_path=tmp_path / "stories.json",
            state_path=tmp_path / "state.json",
        )

    def test_load_stories_uses_gcs_when_bucket_set(self, tmp_path):
        s = self._make_gcs_storage(tmp_path)
        mock_blob = MagicMock()
        mock_blob.exists.return_value = True
        mock_blob.download_as_text.return_value = json.dumps([{"id": "gcs-story"}])
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        s._bucket = mock_bucket

        result = s.load_stories()
        assert result == [{"id": "gcs-story"}]
        mock_bucket.blob.assert_called_once_with(STORIES_BLOB)

    def test_load_stories_returns_empty_when_blob_missing(self, tmp_path):
        s = self._make_gcs_storage(tmp_path)
        mock_blob = MagicMock()
        mock_blob.exists.return_value = False
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        s._bucket = mock_bucket

        result = s.load_stories()
        assert result == []

    def test_save_stories_uploads_to_gcs(self, tmp_path):
        s = self._make_gcs_storage(tmp_path)
        mock_blob = MagicMock()
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        s._bucket = mock_bucket

        stories = [{"id": "s1"}]
        result = s.save_stories(stories)
        assert result is True
        mock_blob.upload_from_string.assert_called_once()
        call_args = mock_blob.upload_from_string.call_args
        assert json.loads(call_args[0][0]) == stories

    def test_save_state_uses_state_blob(self, tmp_path):
        s = self._make_gcs_storage(tmp_path)
        mock_blob = MagicMock()
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        s._bucket = mock_bucket

        s.save_state({"step": "done"})
        mock_bucket.blob.assert_called_once_with(STATE_BLOB)

    def test_load_state_uses_state_blob(self, tmp_path):
        s = self._make_gcs_storage(tmp_path)
        mock_blob = MagicMock()
        mock_blob.exists.return_value = True
        mock_blob.download_as_text.return_value = json.dumps({"last_run": "2024-01-01"})
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        s._bucket = mock_bucket

        result = s.load_state()
        assert result == {"last_run": "2024-01-01"}
        mock_bucket.blob.assert_called_once_with(STATE_BLOB)

    def test_gcs_read_failure_returns_empty(self, tmp_path):
        s = self._make_gcs_storage(tmp_path)
        mock_bucket = MagicMock()
        mock_bucket.blob.side_effect = Exception("GCS connection error")
        s._bucket = mock_bucket

        result = s.load_stories()
        assert result == []

    def test_gcs_write_failure_returns_false(self, tmp_path):
        s = self._make_gcs_storage(tmp_path)
        mock_blob = MagicMock()
        mock_blob.upload_from_string.side_effect = Exception("Upload failed")
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        s._bucket = mock_bucket

        result = s.save_stories([{"id": "s1"}])
        assert result is False

    def test_get_bucket_lazy_init(self, tmp_path, monkeypatch):
        s = self._make_gcs_storage(tmp_path)
        assert s._bucket is None
        mock_client_cls = MagicMock()
        mock_bucket = MagicMock()
        mock_client_cls.return_value.bucket.return_value = mock_bucket
        monkeypatch.setattr("scraper.storage.StoryStorage._get_bucket", lambda self: mock_bucket)
        # accessing _bucket is still None until first call
        assert s._bucket is None
