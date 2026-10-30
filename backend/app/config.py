"""Runtime configuration, read once from environment variables (.env supported)."""
import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # dotenv is optional in production
    pass

BASE_DIR = Path(__file__).resolve().parent.parent


def _bool(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'data' / 'app.db'}")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")
    ai_timeout_s: float = float(os.getenv("AI_TIMEOUT_S", "25"))
    ai_max_attempts: int = int(os.getenv("AI_MAX_ATTEMPTS", "2"))
    log_level: str = os.getenv("LOG_LEVEL", "INFO").upper()
    log_file: str = os.getenv("LOG_FILE", str(BASE_DIR / "logs" / "app.log"))
    seed_on_start: bool = _bool("SEED_ON_START", True)
    max_notes_chars: int = int(os.getenv("MAX_NOTES_CHARS", "20000"))

    @property
    def ai_enabled(self) -> bool:
        return bool(self.gemini_api_key)


settings = Settings()
