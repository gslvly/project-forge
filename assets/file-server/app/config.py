"""文件服务配置。

所有参数都支持环境变量覆盖；本地运行时读取 file-server/.env。
PUBLIC_BASE_URL 必须由部署环境提供，其余参数都有默认值。
"""

from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, PositiveInt
from pydantic_settings import BaseSettings, SettingsConfigDict

# file-server/ 根目录：app -> file-server
BASE_DIR = Path(__file__).resolve().parents[1]

# 与 Nginx 路由约定一致，不作为环境变量开放。
API_PREFIX = "/api"
UPLOAD_URL_PREFIX = "/uploads"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # 开启后暴露 /api/docs，生产不要开
    debug: bool = False

    # 逗号分隔的允许来源。只有浏览器跨域直传时才需要，服务端之间调用留空即可。
    cors_origins: str = ""

    # 本服务对外可访问的基址，如 http://10.0.0.8:9000。上传接口返回的 URL 用它拼成绝对地址：
    # 调用方常把这个地址原样交给下游（如 Agent）去下载，相对路径会因缺协议而失败，
    # 所以必填——漏配时启动就报错，好过上线后才发现返回的地址全都打不开。
    public_base_url: Annotated[str, Field(min_length=1)]

    # 相对路径以 file-server/ 为基准；Docker 镜像内固定为 /data/uploads。
    upload_dir: Path = Path("data/uploads")
    # 同时决定 Nginx 的 client_max_body_size
    upload_max_size_mb: PositiveInt = 20

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def upload_root(self) -> Path:
        if self.upload_dir.is_absolute():
            return self.upload_dir.resolve()
        return (BASE_DIR / self.upload_dir).resolve()

    @property
    def upload_max_size_bytes(self) -> int:
        return self.upload_max_size_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
