#!/usr/bin/env python3
"""Curl-like local API client bound to dev.env and a development JWT."""

from __future__ import annotations

import argparse
import asyncio
import json
import mimetypes
import os
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

REPO_ROOT = Path(__file__).resolve().parents[4]
BACKEND_DIR = REPO_ROOT / "backend"
DEFAULT_BASE_URL = "http://127.0.0.1:8000"
LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}
DEFAULT_TOKEN_TTL_SECONDS = 600
MIN_TOKEN_TTL_SECONDS = 60
MAX_TOKEN_TTL_SECONDS = 3600
SCOPE_LABEL = "local HTTP backend; config/database=dev.env"

EXIT_USAGE = 2
EXIT_API_ERROR = 4


class CliError(Exception):
    """A safe error that can be printed without leaking credentials."""


@dataclass(frozen=True)
class Actor:
    username: str
    role: str
    token: str


def token_ttl(value: str) -> int:
    try:
        ttl = int(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("token TTL 必须是整数秒") from exc
    if not MIN_TOKEN_TTL_SECONDS <= ttl <= MAX_TOKEN_TTL_SECONDS:
        raise argparse.ArgumentTypeError(
            f"token TTL 必须在 {MIN_TOKEN_TTL_SECONDS}-{MAX_TOKEN_TTL_SECONDS} 秒之间"
        )
    return ttl


def positive_timeout(value: str) -> float:
    try:
        timeout = float(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("timeout 必须是数字") from exc
    if timeout <= 0:
        raise argparse.ArgumentTypeError("timeout 必须大于 0")
    return timeout


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "curl-like 本机接口工具：自动注入开发 JWT；仅验证 localhost 后端及 "
            "dev.env 配置，不代表远端已部署服务"
        )
    )
    parser.add_argument("method", nargs="?", help="HTTP 方法，例如 GET、POST、PUT、PATCH、DELETE")
    parser.add_argument("path", nargs="?", help="接口路径，例如 /auth/me 或 /api/auth/me")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="本机后端基址")
    parser.add_argument(
        "--user",
        default="admin",
        help="dev.env 所连数据库中的用户名，默认 admin",
    )
    parser.add_argument(
        "--no-auth",
        action="store_true",
        help="不注入 Token，用于健康检查或 401 测试",
    )
    parser.add_argument(
        "--token-ttl",
        type=token_ttl,
        default=DEFAULT_TOKEN_TTL_SECONDS,
        help="自动签发 Token 的有效秒数，默认 600，范围 60-3600",
    )
    parser.add_argument("--query", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--header", action="append", default=[], metavar="NAME:VALUE")
    parser.add_argument("--form", action="append", default=[], metavar="KEY=VALUE")
    parser.add_argument("--file", action="append", default=[], metavar="FIELD=PATH")

    body = parser.add_mutually_exclusive_group()
    body.add_argument("--json", dest="json_text", help="JSON 请求体")
    body.add_argument("--json-file", type=Path, help="从 UTF-8 文件读取 JSON 请求体")

    parser.add_argument("--output", type=Path, help="把响应原始内容写入文件")
    parser.add_argument("--force", action="store_true", help="允许覆盖 --output 指定的已有文件")
    parser.add_argument("--show-headers", action="store_true", help="显示响应头（敏感头会脱敏）")
    parser.add_argument("--timeout", type=positive_timeout, default=30.0, help="请求超时秒数")
    return parser


def validate_base_url(raw: str) -> str:
    value = raw.rstrip("/")
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"}:
        raise CliError("--base-url 只支持 http 或 https")
    if parsed.hostname not in LOCAL_HOSTS:
        raise CliError("安全限制：api-curl 只允许访问本机回环地址")
    if parsed.username or parsed.password:
        raise CliError("--base-url 不能包含用户名或密码")
    if parsed.query or parsed.fragment:
        raise CliError("--base-url 不能包含 query 或 fragment")
    if parsed.path not in {"", "/"}:
        raise CliError("--base-url 不能包含路径；接口路径请使用 PATH 参数")
    try:
        _port = parsed.port
    except ValueError as exc:
        raise CliError("--base-url 端口格式无效") from exc
    return value


def normalize_path(raw: str, api_prefix: str) -> str:
    if "://" in raw:
        raise CliError("PATH 只能是接口路径，不能传完整 URL")
    path = raw if raw.startswith("/") else f"/{raw}"
    prefix = "/" + api_prefix.strip("/")
    if path == prefix or path.startswith(f"{prefix}/"):
        return path
    return f"{prefix}{path}"


def parse_pairs(values: list[str], label: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for value in values:
        key, separator, item = value.partition("=")
        if not separator or not key.strip():
            raise CliError(f"{label} 参数必须是 KEY=VALUE：{value!r}")
        pairs.append((key.strip(), item))
    return pairs


def parse_headers(values: list[str]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for value in values:
        name, separator, item = value.partition(":")
        if not separator or not name.strip():
            raise CliError(f"--header 必须是 NAME:VALUE：{value!r}")
        normalized_name = name.strip()
        if normalized_name.lower() == "authorization":
            raise CliError("不要通过 --header 传 Authorization；请使用自动鉴权或 --no-auth")
        headers[normalized_name] = item.strip()
    return headers


def load_json_body(args: argparse.Namespace) -> Any | None:
    if args.json_text is None and args.json_file is None:
        return None
    try:
        if args.json_text is not None:
            return json.loads(args.json_text)
        return json.loads(args.json_file.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CliError(f"JSON 文件不存在：{args.json_file}") from exc
    except (OSError, UnicodeError) as exc:
        raise CliError(f"无法读取 JSON 文件：{args.json_file}") from exc
    except json.JSONDecodeError as exc:
        raise CliError(f"JSON 格式错误：{exc.msg}（第 {exc.lineno} 行第 {exc.colno} 列）") from exc


def bootstrap_backend(ttl_seconds: int) -> str:
    if not BACKEND_DIR.is_dir():
        raise CliError(f"找不到项目 backend 目录：{BACKEND_DIR}")

    # Settings 在导入时读取环境变量。只覆盖当前 CLI 进程的有效期，不影响运行中的后端。
    os.environ["JWT_EXPIRE_SECONDS"] = str(ttl_seconds)
    sys.path.insert(0, str(BACKEND_DIR))
    try:
        from app.core.config import settings
    except Exception as exc:
        raise CliError("无法加载 dev.env；请确认本地开发配置完整") from exc
    return settings.api_prefix


async def issue_actor(username: str) -> Actor:
    try:
        from sqlalchemy import select

        from app.core.security import create_token
        from app.db.session import SessionLocal, engine
        from app.models.user import USER_STATUS_ENABLED, User
    except Exception as exc:
        raise CliError("无法加载后端鉴权或数据库模块") from exc

    try:
        async with SessionLocal() as session:
            user = await session.scalar(select(User).where(User.username == username))
            if user is None:
                raise CliError(f"dev.env 所连数据库中不存在用户：{username}")
            if user.status != USER_STATUS_ENABLED:
                raise CliError(f"用户已禁用，不能签发调试 Token：{username}")
            return Actor(
                username=user.username,
                role=user.role,
                token=create_token(user.id, user.username),
            )
    except CliError:
        raise
    except Exception as exc:
        raise CliError("无法从 dev.env 所连数据库读取用户；请检查本机开发配置") from exc
    finally:
        await engine.dispose()


def prepare_files(values: list[str]) -> tuple[list[tuple[str, tuple[str, Any, str]]], list[Any]]:
    files: list[tuple[str, tuple[str, Any, str]]] = []
    handles: list[Any] = []
    try:
        for field, raw_path in parse_pairs(values, "--file"):
            path = Path(raw_path).expanduser()
            if not path.is_file():
                raise CliError(f"上传文件不存在或不是普通文件：{path}")
            handle = path.open("rb")
            handles.append(handle)
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            files.append((field, (path.name, handle, content_type)))
    except Exception:
        for handle in handles:
            handle.close()
        raise
    return files, handles


def redact(value: str, secrets: list[str]) -> str:
    for secret in secrets:
        if secret:
            value = value.replace(secret, "<redacted-token>")
    return value


def print_response(
    response: Any,
    *,
    show_headers: bool,
    output: Path | None,
    force: bool,
    secrets: list[str],
) -> None:
    print(f"< HTTP {response.status_code}")
    if show_headers:
        sensitive = {"authorization", "proxy-authorization", "set-cookie"}
        for name, value in response.headers.items():
            shown = "<redacted>" if name.lower() in sensitive else redact(value, secrets)
            print(f"< {name}: {shown}")

    if output is not None:
        output.parent.mkdir(parents=True, exist_ok=True)
        mode = "wb" if force else "xb"
        try:
            with output.open(mode) as target:
                target.write(response.content)
        except FileExistsError as exc:
            raise CliError(f"输出文件已存在：{output}；确认可覆盖后再加 --force") from exc
        except OSError as exc:
            raise CliError(f"无法写入输出文件：{output}") from exc
        print(f"响应已保存：{output}（{len(response.content)} bytes）")
        return

    content_type = response.headers.get("content-type", "").lower()
    if "json" in content_type:
        try:
            rendered = json.dumps(response.json(), ensure_ascii=False, indent=2)
            print(redact(rendered, secrets))
            return
        except ValueError:
            pass
    if content_type.startswith("text/") or not response.content:
        print(redact(response.text, secrets))
        return
    print(f"<binary response: {len(response.content)} bytes；请使用 --output 保存>")


def response_exit_code(response: Any) -> int:
    if response.status_code >= 400:
        return EXIT_API_ERROR
    try:
        payload = response.json()
    except ValueError:
        return 0
    if isinstance(payload, dict) and payload.get("code", 0) != 0:
        return EXIT_API_ERROR
    return 0


def run(args: argparse.Namespace) -> int:
    if not args.method or not args.path:
        raise CliError("必须提供 METHOD 和 PATH；使用 --help 查看示例")
    method = args.method.upper()
    if not method.isalpha():
        raise CliError(f"HTTP 方法无效：{args.method}")
    if args.force and args.output is None:
        raise CliError("--force 只能与 --output 一起使用")
    if (args.form or args.file) and (args.json_text is not None or args.json_file is not None):
        raise CliError("JSON 请求体不能与 --form/--file 同时使用")
    if args.output is not None and args.output.exists() and not args.force:
        raise CliError(f"输出文件已存在：{args.output}；确认可覆盖后再加 --force")

    base_url = validate_base_url(args.base_url)
    api_prefix = bootstrap_backend(args.token_ttl)
    path = normalize_path(args.path, api_prefix)
    url = f"{base_url}{path}"

    headers = parse_headers(args.header)
    headers.setdefault("Accept", "application/json")
    headers.setdefault("X-Request-Id", f"api-curl-{uuid.uuid4().hex}")

    actor: Actor | None = None
    if not args.no_auth:
        actor = asyncio.run(issue_actor(args.user))
        headers["Authorization"] = f"Bearer {actor.token}"

    json_body = load_json_body(args)
    query = parse_pairs(args.query, "--query")
    form = parse_pairs(args.form, "--form")
    files, handles = prepare_files(args.file)

    try:
        import httpx2

        with httpx2.Client(timeout=args.timeout, follow_redirects=False) as client:
            response = client.request(
                method,
                url,
                params=query or None,
                headers=headers,
                json=json_body,
                # multipart 编码器只认 dict，传 list[tuple] 会在发送时抛 TypeError
                data=dict(form) or None,
                files=files or None,
            )
    except Exception as exc:
        raise CliError(f"请求本机后端失败：{type(exc).__name__}；请确认服务已由用户启动") from exc
    finally:
        for handle in handles:
            handle.close()

    auth_label = "none (--no-auth)" if actor is None else f"auto ({actor.username}, {actor.role})"
    print(f"> scope: {SCOPE_LABEL}")
    print(f"> {method} {response.request.url}")
    print(f"> auth: {auth_label}")
    print(f"> request-id: {headers['X-Request-Id']}")
    secrets = [] if actor is None else [actor.token]
    print_response(
        response,
        show_headers=args.show_headers,
        output=args.output,
        force=args.force,
        secrets=secrets,
    )
    return response_exit_code(response)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return run(args)
    except CliError as exc:
        print(f"api-curl: {exc}", file=sys.stderr)
        return EXIT_USAGE


if __name__ == "__main__":
    raise SystemExit(main())
