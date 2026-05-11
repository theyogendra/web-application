from typing import List
from pydantic_settings import BaseSettings
from pydantic import AnyHttpUrl

class Settings(BaseSettings):
    PROJECT_NAME: str = "Enterprise Platform"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "supersecretkey"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8  # 8 days
    
    # DATABASE
    DATABASE_URL: str = "postgresql://postgres:postgres@db:5432/enterprise_platform"
    
    # REDIS
    REDIS_URL: str = "redis://redis:6379/0"
    
    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    # ADMIN SEED
    ADMIN_EMAIL: str = "admin@enterprise.com"
    ADMIN_PASSWORD: str = "password"
    ADMIN_FULL_NAME: str = "System Administrator"

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "allow"

settings = Settings()
