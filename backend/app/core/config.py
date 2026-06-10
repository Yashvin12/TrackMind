from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # App
    APP_NAME: str = "TrackMind"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./trackmind.db"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_TIMEOUT: int = 10

    # Simulation
    SIMULATION_SPEED: float = 10.0
    LOOKAHEAD_MINUTES: int = 60

    # Optimization
    OPTIMIZER_TIMEOUT_SEC: int = 5
    SOLVER_TYPE: str = "cp_sat"

    # API
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    model_config = {"env_file": ".env.local", "case_sensitive": True}

    def model_post_init(self, __context: object) -> None:
        # Allow CORS_ORIGINS to be passed as a JSON string from env
        pass


settings = Settings()
