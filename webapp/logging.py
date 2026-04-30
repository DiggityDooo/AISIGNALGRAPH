from __future__ import annotations

import sys
from pathlib import Path

from loguru import logger


def setup_logging(log_dir: Path | str = "logs"):
    resolved_log_dir = Path(log_dir)
    resolved_log_dir.mkdir(parents=True, exist_ok=True)
    logger.remove()
    logger.add(sys.stdout, format="{time} | {level} | {message}", level="INFO")
    logger.add(resolved_log_dir / "aisignalgraph.log", rotation="5 MB", level="DEBUG")
    return logger
