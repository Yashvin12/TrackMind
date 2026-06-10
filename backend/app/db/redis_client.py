import redis.asyncio as aioredis
from redis.asyncio import Redis
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

_redis_pool: Redis | None = None


async def init_redis() -> None:
    global _redis_pool
    _redis_pool = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        socket_timeout=settings.REDIS_TIMEOUT,
        socket_connect_timeout=settings.REDIS_TIMEOUT,
        retry_on_timeout=True,
        health_check_interval=30,
    )
    await _redis_pool.ping()
    logger.info("Redis connection established")


async def close_redis() -> None:
    global _redis_pool
    if _redis_pool:
        await _redis_pool.aclose()
        _redis_pool = None
    logger.info("Redis connection closed")


def get_redis() -> Redis:
    if _redis_pool is None:
        raise RuntimeError("Redis not initialized. Call init_redis() first.")
    return _redis_pool
