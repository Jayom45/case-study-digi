"""Domain errors -> consistent JSON error responses: {"error": {"code", "message", "request_id", "details"}}."""


class AppError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, details: dict | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class NotFound(AppError):
    status_code = 404
    code = "not_found"


class Conflict(AppError):
    status_code = 409
    code = "conflict"


class InvalidState(AppError):
    status_code = 422
    code = "invalid_state"
