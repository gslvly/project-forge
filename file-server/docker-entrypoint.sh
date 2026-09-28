#!/bin/sh
set -eu

# 对外给出的文件地址都用它拼；漏配则上传返回的地址不可用
: "${PUBLIC_BASE_URL:?PUBLIC_BASE_URL is required}"
: "${UPLOAD_DIR:=/data/uploads}"

mkdir -p "$UPLOAD_DIR/.upload-tmp"
# bind mount 的宿主机目录常由 root 创建，以 app 用户运行的后端会写不进去。
# 只修正不属于 app 的目录：hash 分片子目录建在它们下面，文件本身只需可读，不用逐个改。
find "$UPLOAD_DIR" -type d ! -user app -exec chown app:app {} +

exec setpriv --reuid=app --regid=app --init-groups \
  uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-access-log
