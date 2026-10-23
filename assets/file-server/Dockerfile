# syntax=docker/dockerfile:1

FROM ghcr.m.daocloud.io/astral-sh/uv:0.12.3 AS uv-bin


FROM docker.m.daocloud.io/library/python:3.12-slim-bookworm AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_DEFAULT_INDEX=https://mirrors.aliyun.com/pypi/simple

COPY --from=uv-bin /uv /bin/
WORKDIR /app
COPY pyproject.toml ./
RUN uv sync --no-dev --no-install-project


FROM docker.m.daocloud.io/library/python:3.12-slim-bookworm AS runtime

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UPLOAD_DIR=/data/uploads

RUN useradd --system --uid 10001 --no-create-home --shell /usr/sbin/nologin app

WORKDIR /app
COPY --from=builder /app/.venv ./.venv
COPY app ./app
COPY docker-entrypoint.sh /usr/local/bin/file-server-entrypoint

RUN chmod 0755 /usr/local/bin/file-server-entrypoint \
    && mkdir -p /data/uploads \
    && chown app:app /data/uploads

VOLUME ["/data/uploads"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).read()"]

ENTRYPOINT ["/usr/local/bin/file-server-entrypoint"]
