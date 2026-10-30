"""Structured JSON logging.

Every line is one JSON object with: timestamp, level, logger, message, request_id,
and any structured fields passed via `extra={"event": ..., ...}`.
Logs go to stdout and to a rotating file. A filter redacts anything that looks like a secret.
"""
import contextvars
import json
import logging
import re
import sys
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

# Standard LogRecord attributes we never copy into the JSON payload.
_RESERVED = set(vars(logging.LogRecord("", 0, "", 0, "", (), None))) | {"message", "asctime"}

_SECRET_PATTERNS = [
    re.compile(r"AIza[0-9A-Za-z\-_]{20,}"),                 # Google API keys
    re.compile(r"sk-[0-9A-Za-z\-_]{16,}"),                  # OpenAI-style keys
    re.compile(r"(?i)(api[_-]?key|x-goog-api-key|authorization|password|secret|token)(\"?\s*[:=]\s*\"?)[^\s\",}]+"),
]
_SENSITIVE_KEYS = {"api_key", "gemini_api_key", "authorization", "password", "secret", "token", "x-goog-api-key"}


def redact(value):
    if isinstance(value, str):
        for pattern in _SECRET_PATTERNS:
            value = pattern.sub(
                lambda m: f"{m.group(1)}{m.group(2)}[REDACTED]" if m.lastindex and m.lastindex >= 2 else "[REDACTED]",
                value,
            )
        return value
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if str(k).lower() in _SENSITIVE_KEYS else redact(v)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    return value


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "request_id": getattr(record, "request_id", "-"),
            "message": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and key not in payload and not key.startswith("_"):
                payload[key] = value
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(redact(payload), default=str, ensure_ascii=False)


def setup_logging(level: str, log_file: str) -> None:
    Path(log_file).parent.mkdir(parents=True, exist_ok=True)
    formatter = JsonFormatter()
    rid_filter = RequestIdFilter()

    file_handler = RotatingFileHandler(log_file, maxBytes=5_000_000, backupCount=3, encoding="utf-8")
    stream_handler = logging.StreamHandler(sys.stdout)
    for handler in (file_handler, stream_handler):
        handler.setFormatter(formatter)
        handler.addFilter(rid_filter)

    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)
    root.addHandler(file_handler)
    root.addHandler(stream_handler)

    # Our own request log replaces uvicorn's access log; keep library noise down.
    logging.getLogger("uvicorn.access").disabled = True
    for noisy in ("httpx", "httpcore", "sqlalchemy.engine"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
