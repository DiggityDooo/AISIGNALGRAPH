import os
import sys
from pathlib import Path

from loguru import logger

# Configuration for loguru to work well in containerized environments (Cloud Run)
# We ensure it logs to stdout for Cloud Logging and optionally to a file if writable.

def setup_logging(log_dir: Path | str = "logs"):
    resolved_log_dir = Path(log_dir)
    logger.remove()
    logger.add(sys.stdout, format="{time} | {level} | {message}", level="INFO")
    
    try:
        resolved_log_dir.mkdir(parents=True, exist_ok=True)
        logger.add(resolved_log_dir / "aisignalgraph.log", rotation="5 MB", level="DEBUG")
    except Exception as e:
        logger.warning(f"File logging disabled: could not write to {resolved_log_dir} ({e})")
    
    return logger
