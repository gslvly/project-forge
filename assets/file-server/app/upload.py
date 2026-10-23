"""文件上传与分类存储。

只负责写入：读取由 Nginx 从同一目录直出 /uploads，不经过本服务。
文件名取内容的 SHA-256，相同内容只落一份，按 <分类>/<hash[:2]>/<hash[2:4]>/ 分片存放。

没有鉴权：按内网可信处理，访问来源由部署机的安全组 / 防火墙控制。
若端口对公网开放，等于任何人都能往这里上传文件。
"""

import logging
from contextlib import suppress
from functools import partial
from hashlib import sha256
from os import link
from pathlib import Path
from typing import Annotated
from uuid import uuid4

import anyio
from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

from app.config import UPLOAD_URL_PREFIX, settings
from app.exceptions import AppError
from app.response import ApiResponse

logger = logging.getLogger(__name__)

UPLOAD_ERROR_UNSUPPORTED_TYPE = 2001
UPLOAD_ERROR_EMPTY_FILE = 2002
UPLOAD_ERROR_TOO_LARGE = 2003
UPLOAD_ERROR_SAVE_FAILED = 2004

# 放在上传根目录下，保证和目标文件在同一挂载点，硬链接才能成功。Nginx 禁止外部访问。
TMP_DIR_NAME = ".upload-tmp"
_CHUNK_SIZE = 1024 * 1024

# 允许的扩展名及其存放分类，顺序即报错文案里的展示顺序。新增类型在这里加一行即可。
# 不要加 .html/.svg/.js 这类浏览器会执行的类型：文件由 Nginx 同源直出，会变成存储型 XSS。
CATEGORY_BY_EXTENSION = {
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".gif": "image",
    ".webp": "image",
    ".xls": "excel",
    ".xlsx": "excel",
    ".doc": "document",
    ".docx": "document",
    ".pdf": "document",
    ".md": "document",
    ".txt": "document",
}


class UploadOut(BaseModel):
    # 可直接访问的完整地址
    url: str
    # 相对上传根目录的存放路径。调用方存库建议只存它，基址变了不用刷数据
    path: str


def public_url(stored_path: str) -> str:
    """对外可访问的文件地址，唯一的拼装入口。

    恒返回绝对地址（public_base_url 是必填配置）：调用方常把它原样交给下游去下载，
    相对路径会因缺 http:// 协议而失败。
    """
    return f"{settings.public_base_url.rstrip('/')}{UPLOAD_URL_PREFIX}/{stored_path}"


def _classify(filename: str | None) -> tuple[str, str]:
    extension = Path(filename or "").suffix.lower()
    category = CATEGORY_BY_EXTENSION.get(extension)
    if category is None:
        names = "、".join(item.removeprefix(".") for item in CATEGORY_BY_EXTENSION)
        raise AppError(
            f"仅支持 {names} 文件",
            code=UPLOAD_ERROR_UNSUPPORTED_TYPE,
            status_code=400,
        )
    return category, extension


async def _remove_if_exists(path: Path) -> None:
    try:
        await anyio.to_thread.run_sync(partial(path.unlink, missing_ok=True))
    except OSError:
        logger.warning("清理上传临时文件失败: %s", path, exc_info=True)


async def store(file: UploadFile) -> Path:
    """分块写入并计算 SHA-256，相同内容复用同一个物理文件。

    返回相对 settings.upload_root 的存放路径。
    """
    temporary_path = settings.upload_root / TMP_DIR_NAME / f"{uuid4().hex}.part"
    target_path: Path | None = None

    try:
        category, extension = _classify(file.filename)
        await anyio.to_thread.run_sync(
            partial(temporary_path.parent.mkdir, parents=True, exist_ok=True)
        )

        size = 0
        content_hash = sha256()
        async with await anyio.open_file(temporary_path, "xb") as output:
            while chunk := await file.read(_CHUNK_SIZE):
                size += len(chunk)
                if size > settings.upload_max_size_bytes:
                    raise AppError(
                        f"文件不能超过 {settings.upload_max_size_mb} MB",
                        code=UPLOAD_ERROR_TOO_LARGE,
                        status_code=413,
                    )
                content_hash.update(chunk)
                await output.write(chunk)

        if size == 0:
            raise AppError(
                "不能上传空文件",
                code=UPLOAD_ERROR_EMPTY_FILE,
                status_code=400,
            )

        digest = content_hash.hexdigest()
        relative_path = Path(category, digest[:2], digest[2:4], f"{digest}{extension}")
        target_path = settings.upload_root / relative_path
        await anyio.to_thread.run_sync(
            partial(target_path.parent.mkdir, parents=True, exist_ok=True)
        )

        # 同挂载点硬链接能原子地做到“仅首次创建”；已存在时直接复用。
        with suppress(FileExistsError):
            await anyio.to_thread.run_sync(link, temporary_path, target_path)

        return relative_path
    except OSError as exc:
        logger.exception("保存上传文件失败: %s", target_path or temporary_path)
        raise AppError(
            "文件保存失败",
            code=UPLOAD_ERROR_SAVE_FAILED,
            status_code=500,
        ) from exc
    finally:
        await file.close()
        await _remove_if_exists(temporary_path)


router = APIRouter(tags=["upload"])


@router.post("/upload", summary="上传文件")
async def upload(
    file: Annotated[UploadFile, File(description="图片、Excel 或文档")],
) -> ApiResponse[UploadOut]:
    """存文件并返回访问地址。"""
    stored_path = (await store(file)).as_posix()
    return ApiResponse.ok(UploadOut(url=public_url(stored_path), path=stored_path))
