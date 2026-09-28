import asyncio
from hashlib import sha256
from io import BytesIO
from pathlib import Path

import pytest
from fastapi import UploadFile
from fastapi.testclient import TestClient

from app.config import API_PREFIX
from app.main import app
from app.upload import upload


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def _stored_files(upload_root: Path) -> list[Path]:
    return [path for path in upload_root.rglob("*") if path.is_file()]


def test_health(client):
    response = client.get(f"{API_PREFIX}/health")

    assert response.status_code == 200
    assert response.json() == {"code": 0, "message": "ok", "data": {"status": "ok"}}


@pytest.mark.parametrize(
    ("filename", "content_type", "category"),
    [
        ("avatar.PNG", "image/png", "image"),
        (
            "report.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "excel",
        ),
        ("manual.pdf", "application/pdf", "document"),
    ],
)
def test_upload_classifies_and_saves_file(
    client, isolated_upload, filename, content_type, category
):
    content = b"test-content"

    response = client.post(
        f"{API_PREFIX}/upload",
        files={"file": (filename, content, content_type)},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    digest = sha256(content).hexdigest()
    extension = Path(filename).suffix.lower()
    expected_path = f"{category}/{digest[:2]}/{digest[2:4]}/{digest}{extension}"
    assert data == {
        "url": f"http://files.example/uploads/{expected_path}",
        "path": expected_path,
    }
    assert (isolated_upload / expected_path).read_bytes() == content


def test_upload_reuses_same_content(client, isolated_upload):
    content = b"same-image-content"

    first = client.post(
        f"{API_PREFIX}/upload",
        files={"file": ("first.jpg", content, "image/jpeg")},
    )
    second = client.post(
        f"{API_PREFIX}/upload",
        files={"file": ("second.jpg", content, "image/jpeg")},
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["data"] == second.json()["data"]
    # 只剩一个物理文件，.part 临时文件也已清掉
    assert len(_stored_files(isolated_upload)) == 1


async def test_concurrent_upload_reuses_same_content(isolated_upload):
    content = b"concurrent-same-content"

    async def upload_one(filename: str):
        return await upload(UploadFile(file=BytesIO(content), filename=filename))

    first, second = await asyncio.gather(
        upload_one("first.png"),
        upload_one("second.png"),
    )

    assert first.data == second.data
    assert len(_stored_files(isolated_upload)) == 1


def test_upload_rejects_unsupported_type(client, isolated_upload):
    response = client.post(
        f"{API_PREFIX}/upload",
        files={"file": ("page.html", b"<script></script>", "text/html")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 2001
    assert not _stored_files(isolated_upload)


def test_upload_rejects_empty_file_without_residue(client, isolated_upload):
    response = client.post(
        f"{API_PREFIX}/upload",
        files={"file": ("empty.jpg", b"", "image/jpeg")},
    )

    assert response.status_code == 400
    assert response.json()["code"] == 2002
    assert not _stored_files(isolated_upload)


def test_upload_rejects_oversized_file_without_residue(client, isolated_upload):
    response = client.post(
        f"{API_PREFIX}/upload",
        files={"file": ("large.jpg", b"x" * (1024 * 1024 + 1), "image/jpeg")},
    )

    assert response.status_code == 413
    assert response.json()["code"] == 2003
    assert not _stored_files(isolated_upload)


def test_upload_without_file_returns_unified_error(client):
    response = client.post(f"{API_PREFIX}/upload")

    assert response.status_code == 422
    body = response.json()
    assert body["code"] == 422
    assert body["message"].startswith("file:")
    assert body["data"] is None
