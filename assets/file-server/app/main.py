"""应用装配入口。

本地运行（在 file-server/ 下执行）：
    uv run uvicorn app.main:app --reload

本地运行只有上传接口；/uploads 的读取由 Nginx 提供，完整链路用 docker compose 起。
"""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import upload
from app.config import API_PREFIX, settings
from app.exceptions import register_exception_handlers
from app.response import ApiResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def create_app() -> FastAPI:
    app = FastAPI(
        title="文件服务",
        version="0.1.0",
        # 挂在 /api 下才能经 Nginx 访问；仅 debug 暴露，避免泄露接口结构
        docs_url=f"{API_PREFIX}/docs" if settings.debug else None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json" if settings.debug else None,
    )

    if settings.cors_origin_list:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origin_list,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    register_exception_handlers(app)

    @app.get(f"{API_PREFIX}/health", summary="健康检查", tags=["health"])
    async def health() -> ApiResponse[dict[str, str]]:
        return ApiResponse.ok({"status": "ok"})

    app.include_router(upload.router, prefix=API_PREFIX)
    return app


app = create_app()
