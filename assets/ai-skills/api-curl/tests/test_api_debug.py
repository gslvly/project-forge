from __future__ import annotations

import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "api_debug.py"
SPEC = importlib.util.spec_from_file_location("backend_api_debug", SCRIPT)
assert SPEC and SPEC.loader
api_debug = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = api_debug
SPEC.loader.exec_module(api_debug)


def test_scope_distinguishes_local_http_from_shared_dev_config():
    assert "local HTTP" in api_debug.SCOPE_LABEL
    assert "dev.env" in api_debug.SCOPE_LABEL


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://127.0.0.1:8000/", "http://127.0.0.1:8000"),
        ("http://localhost:8000", "http://localhost:8000"),
        ("http://[::1]:8000", "http://[::1]:8000"),
    ],
)
def test_validate_base_url_accepts_loopback(raw, expected):
    assert api_debug.validate_base_url(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "https://api.example.com",
        "http://192.168.1.10:8000",
        "http://admin:secret@localhost:8000",
        "http://localhost:8000/api",
    ],
)
def test_validate_base_url_rejects_non_local_or_credentialed_urls(raw):
    with pytest.raises(api_debug.CliError):
        api_debug.validate_base_url(raw)


def test_normalize_path_adds_api_prefix_once():
    assert api_debug.normalize_path("auth/me", "/api") == "/api/auth/me"
    assert api_debug.normalize_path("/auth/me", "/api") == "/api/auth/me"
    assert api_debug.normalize_path("/api/auth/me", "/api") == "/api/auth/me"


def test_normalize_path_rejects_full_url():
    with pytest.raises(api_debug.CliError):
        api_debug.normalize_path("http://localhost:8000/api/auth/me", "/api")


def test_parse_headers_rejects_authorization():
    with pytest.raises(api_debug.CliError):
        api_debug.parse_headers(["Authorization: Bearer visible-in-shell-history"])


def test_parse_pairs_preserves_repeated_values():
    assert api_debug.parse_pairs(["id=1", "id=2"], "--query") == [("id", "1"), ("id", "2")]


def test_redact_removes_issued_token_from_response_text():
    token = "secret.jwt.value"
    assert api_debug.redact(f'{{"token":"{token}"}}', [token]) == (
        '{"token":"<redacted-token>"}'
    )


@pytest.mark.parametrize(
    ("status", "payload", "expected"),
    [
        (200, {"code": 0}, 0),
        (200, {"code": 1001}, api_debug.EXIT_API_ERROR),
        (401, {"code": 1401}, api_debug.EXIT_API_ERROR),
    ],
)
def test_response_exit_code(status, payload, expected):
    response = SimpleNamespace(status_code=status, json=lambda: payload)
    assert api_debug.response_exit_code(response) == expected
