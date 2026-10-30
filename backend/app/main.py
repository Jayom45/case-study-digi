import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import Base, SessionLocal, engine
from .errors import AppError
from .logging_setup import get_logger, request_id_var, setup_logging
from .routers import items, meetings, misc, takeover

setup_logging(settings.log_level, settings.log_file)
log = get_logger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    request_id_var.set("startup")
    Base.metadata.create_all(engine)
    if settings.seed_on_start:
        from .seed import seed_if_empty

        with SessionLocal() as db:
            seed_if_empty(db)
    log.info("Application started", extra={"event": "app_started", "ai_enabled": settings.ai_enabled,
                                           "model": settings.gemini_model, "log_level": settings.log_level})
    yield


app = FastAPI(title="Handover AI", version="1.0.0", lifespan=lifespan)


@app.middleware("http")
async def request_context(request: Request, call_next):
    """Correlation ID per request: reuse the caller's X-Request-ID or mint one; echo it back."""
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    token = request_id_var.set(rid)
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        log.exception("Unhandled error", extra={"event": "unhandled_error", "method": request.method,
                                                "path": request.url.path})
        response = JSONResponse(status_code=500, content={"error": {
            "code": "internal_error", "message": "Something went wrong. Quote the request id when reporting it.",
            "request_id": rid}})
    duration = int((time.perf_counter() - start) * 1000)
    if request.url.path.startswith("/api"):
        level = log.warning if response.status_code >= 400 else log.info
        level("Request handled", extra={"event": "http_request", "method": request.method, "path": request.url.path,
                                        "status": response.status_code, "duration_ms": duration})
    response.headers["X-Request-ID"] = rid
    request_id_var.reset(token)
    return response


def _error(status: int, code: str, message: str, details=None):
    return JSONResponse(status_code=status, content={"error": {
        "code": code, "message": message, "details": details or {}, "request_id": request_id_var.get()}})


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError):
    log.warning(exc.message, extra={"event": "app_error", "code": exc.code, "path": request.url.path,
                                    "details": exc.details})
    return _error(exc.status_code, exc.code, exc.message, exc.details)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    fields = [{"field": ".".join(str(p) for p in e["loc"][1:]) or "body",
               "message": e["msg"].replace("Value error, ", "")} for e in exc.errors()]
    log.warning("Validation failed", extra={"event": "validation_error", "path": request.url.path, "fields": fields})
    return _error(422, "validation_error", fields[0]["message"] if fields else "Invalid input", {"fields": fields})


app.include_router(meetings.router)
app.include_router(items.router)
app.include_router(misc.router)
app.include_router(takeover.router)

# Serve the built React app (single deployable unit).
DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return _error(404, "not_found", "Unknown API route")
        target = DIST / full_path
        return FileResponse(target if full_path and target.is_file() else DIST / "index.html")
