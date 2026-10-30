"""AI client: one place that talks to the LLM.

Reliability rules:
- Ask for JSON only, then validate it against a Pydantic schema. Invalid output is never trusted.
- Timeout on every call; up to `ai_max_attempts` attempts (retry on timeout, 429/5xx, or invalid JSON,
  feeding the validation error back to the model on the retry).
- Every attempt is logged: operation, model, attempt, latency_ms, outcome. Prompts/notes and the API key are not logged.
- If the AI is not configured or still fails, raise AIUnavailable; callers fall back to a deterministic path.
"""
import json
import time
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from ..config import settings
from ..logging_setup import get_logger

log = get_logger("app.ai")
T = TypeVar("T", bound=BaseModel)

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class AIUnavailable(Exception):
    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


class AIResult:
    def __init__(self, data: BaseModel, model: str, latency_ms: int, attempts: int):
        self.data, self.model, self.latency_ms, self.attempts = data, model, latency_ms, attempts


def _call_gemini(system: str, prompt: str) -> str:
    """Raw call. Key travels in a header (never in the URL, so it can't leak into access logs)."""
    resp = httpx.post(
        GEMINI_URL.format(model=settings.gemini_model),
        headers={"x-goog-api-key": settings.gemini_api_key, "Content-Type": "application/json"},
        json={
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
        },
        timeout=settings.ai_timeout_s,
    )
    if resp.status_code == 429 or resp.status_code >= 500:
        raise httpx.HTTPStatusError(f"retryable status {resp.status_code}", request=resp.request, response=resp)
    resp.raise_for_status()
    body = resp.json()
    try:
        return body["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError, TypeError):
        reason = (body.get("promptFeedback") or {}).get("blockReason") or "empty_response"
        raise ValueError(f"no text in model response ({reason})")


# Indirection so tests can swap the transport without network access.
transport = _call_gemini


def generate_json(operation: str, system: str, prompt: str, schema: type[T]) -> AIResult:
    if not settings.ai_enabled:
        log.warning("AI not configured; using fallback", extra={"event": "ai_call", "operation": operation,
                                                                "outcome": "not_configured", "latency_ms": 0})
        raise AIUnavailable("not_configured")

    started = time.perf_counter()
    last_reason = "unknown"
    current_prompt = prompt
    for attempt in range(1, settings.ai_max_attempts + 1):
        t0 = time.perf_counter()
        outcome, http_status = "success", None
        try:
            text = transport(system, current_prompt)
            data = schema.model_validate(json.loads(text))
            latency = int((time.perf_counter() - t0) * 1000)
            log.info("AI call succeeded", extra={"event": "ai_call", "operation": operation, "model": settings.gemini_model,
                                                 "attempt": attempt, "latency_ms": latency, "outcome": "success",
                                                 "prompt_chars": len(current_prompt), "response_chars": len(text)})
            return AIResult(data, settings.gemini_model, int((time.perf_counter() - started) * 1000), attempt)
        except httpx.TimeoutException:
            outcome = last_reason = "timeout"
        except httpx.HTTPStatusError as exc:
            http_status = exc.response.status_code
            outcome = last_reason = "http_error"
            if http_status in (400, 401, 403, 404):  # config problem: retrying won't help
                _log_attempt(operation, attempt, t0, outcome, http_status, level="error")
                raise AIUnavailable(f"http_{http_status}")
        except (json.JSONDecodeError, ValidationError) as exc:
            outcome = last_reason = "invalid_output"
            # Tell the model exactly what was wrong on the retry.
            current_prompt = (f"{prompt}\n\nYour previous reply was rejected because it was not valid JSON for the "
                              f"required schema. Error: {str(exc)[:400]}\nReturn ONLY the corrected JSON object.")
        except (httpx.HTTPError, ValueError) as exc:
            outcome = last_reason = "error"
            log.debug("AI transport error", extra={"operation": operation, "error": str(exc)[:200]})
        _log_attempt(operation, attempt, t0, outcome, http_status)
        if attempt < settings.ai_max_attempts:
            time.sleep(min(2 ** (attempt - 1), 4))

    log.error("AI call failed after retries; falling back",
              extra={"event": "ai_call", "operation": operation, "outcome": "failed", "reason": last_reason,
                     "latency_ms": int((time.perf_counter() - started) * 1000)})
    raise AIUnavailable(last_reason)


def _log_attempt(operation, attempt, t0, outcome, http_status, level="warning"):
    getattr(log, level)("AI call attempt failed", extra={
        "event": "ai_call", "operation": operation, "model": settings.gemini_model, "attempt": attempt,
        "latency_ms": int((time.perf_counter() - t0) * 1000), "outcome": outcome, "http_status": http_status})
