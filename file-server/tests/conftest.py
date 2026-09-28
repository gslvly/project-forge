"""测试共用 fixture。"""

import os
from pathlib import Path

import pytest

# 必填配置先给占位值，必须在导入 app 之前设置
os.environ.setdefault("PUBLIC_BASE_URL", "http://files.example")

from app.config import settings  # noqa: E402


@pytest.fixture(autouse=True)
def isolated_upload(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """每个用例写到独立临时目录，基址固定，断言不依赖本机 .env 的实际取值。"""
    monkeypatch.setattr(settings, "upload_dir", tmp_path)
    monkeypatch.setattr(settings, "upload_max_size_mb", 1)
    monkeypatch.setattr(settings, "public_base_url", "http://files.example")
    return tmp_path
