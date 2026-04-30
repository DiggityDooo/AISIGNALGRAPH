from __future__ import annotations

import threading
from collections.abc import Callable
from datetime import UTC, datetime

from .graph_store import GraphStore, GraphStoreCancelled
from .types import JobState


def _utc_timestamp() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


class DatabaseJobManager:
    def __init__(self, graph_store: GraphStore):
        self.graph_store = graph_store
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._state: JobState = {
            "active": False,
            "job_type": None,
            "started_at": None,
            "finished_at": None,
            "status": "idle",
            "error": None,
            "cancel_requested": False,
        }

    def get_state(self) -> JobState:
        with self._lock:
            return dict(self._state)

    def cancel_job(self) -> bool:
        with self._lock:
            if self._thread and self._thread.is_alive():
                self._stop_event.set()
                self._state["cancel_requested"] = True
                self._state["status"] = "cancelling"
                return True
        return False

    def start_reseed(self) -> None:
        self._start_job("reseed", lambda: self.graph_store.seed_database(reset=True, cancel_event=self._stop_event))

    def _start_job(self, job_type: str, fn: Callable[[], None]) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                raise RuntimeError("A database job is already running.")

            self._stop_event.clear()

            self._state = {
                "active": True,
                "job_type": job_type,
                "started_at": _utc_timestamp(),
                "finished_at": None,
                "status": "running",
                "error": None,
                "cancel_requested": False,
            }

            def target():
                try:
                    fn()
                except GraphStoreCancelled as exc:
                    with self._lock:
                        self._state.update(
                            {
                                "active": False,
                                "finished_at": _utc_timestamp(),
                                "status": "cancelled",
                                "error": str(exc),
                            }
                        )
                    return
                except Exception as exc:
                    with self._lock:
                        self._state.update(
                            {
                                "active": False,
                                "finished_at": _utc_timestamp(),
                                "status": "failed",
                                "error": str(exc),
                            }
                        )
                    return

                with self._lock:
                    self._state.update(
                        {
                            "active": False,
                            "finished_at": _utc_timestamp(),
                            "status": "completed",
                            "error": None,
                            "cancel_requested": False,
                        }
                    )

            self._thread = threading.Thread(target=target, daemon=True)
            self._thread.start()
