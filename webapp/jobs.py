from __future__ import annotations

import threading
from datetime import datetime

from .graph_store import GraphStore


class DatabaseJobManager:
    def __init__(self, graph_store: GraphStore):
        self.graph_store = graph_store
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None
        self._state = {
            "active": False,
            "job_type": None,
            "started_at": None,
            "finished_at": None,
            "status": "idle",
            "error": None,
        }

    def get_state(self) -> dict:
        with self._lock:
            return dict(self._state)

    def start_reseed(self) -> None:
        self._start_job("reseed", lambda: self.graph_store.seed_database(reset=True))

    def _start_job(self, job_type: str, fn) -> None:
        with self._lock:
            if self._thread and self._thread.is_alive():
                raise RuntimeError("A database job is already running.")

            self._state = {
                "active": True,
                "job_type": job_type,
                "started_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                "finished_at": None,
                "status": "running",
                "error": None,
            }

            def target():
                try:
                    fn()
                except Exception as exc:
                    with self._lock:
                        self._state.update(
                            {
                                "active": False,
                                "finished_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                                "status": "failed",
                                "error": str(exc),
                            }
                        )
                    return

                with self._lock:
                    self._state.update(
                        {
                            "active": False,
                            "finished_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
                            "status": "completed",
                            "error": None,
                        }
                    )

            self._thread = threading.Thread(target=target, daemon=True)
            self._thread.start()
