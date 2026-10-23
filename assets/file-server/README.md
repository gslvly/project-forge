# file-server

独立部署的通用文件服务，从 bi-jing 项目中抽出，**不含鉴权**。在项目开始前先部署好，业务项目只通过 HTTP 调用它。

- 写入：`POST /api/upload`，由 FastAPI 处理
- 读取：`GET /uploads/<path>`，由 Nginx 直接从磁盘返回，不经过后端

文件名取内容的 SHA-256，相同内容只存一份，按 `<分类>/<hash[:2]>/<hash[2:4]>/<hash><扩展名>` 分片存放。
先写临时文件，再用硬链接落到目标位置，并发上传同一内容也不会重复写或写坏。

```
file-server/
├── app/                        # FastAPI，只负责写入
│   ├── config.py               # 环境变量配置
│   ├── upload.py               # 上传接口与存储逻辑（允许的类型在 CATEGORY_BY_EXTENSION）
│   ├── response.py / exceptions.py   # 统一响应 {code, message, data}
│   └── main.py
├── nginx/default.conf.template # /uploads 直出、/api 转发、413 统一 JSON
├── Dockerfile / docker-entrypoint.sh
├── docker-compose.yaml         # app + nginx 两个容器，共享 ./data/uploads
└── tests/
```

## 部署

```bash
cp .env.example .env        # 必填 PUBLIC_BASE_URL，例如 http://10.0.0.8:9000
docker compose up -d --build
docker compose ps           # 两个服务都应为 healthy
curl http://127.0.0.1:9000/api/health
```

- 上传文件持久化在 `./data/uploads`，`docker compose down` 或重建容器都不会删除。
- 宿主机端口默认 `9000`，通过 `.env` 的 `FILE_SERVER_PORT` 修改。
- **没有鉴权**，按内网可信处理。必须用安全组或防火墙限制来源，或把端口只绑定到内网 IP：
  `ports: ["<内网IP>:9000:8080"]`。如果对公网开放，任何人都能往里上传文件。

## 接口

所有接口返回 `{code, message, data}`，`code == 0` 表示成功。

### 上传

```bash
curl -F file=@avatar.png http://10.0.0.8:9000/api/upload
```

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "url": "http://10.0.0.8:9000/uploads/image/42/82/4282…88d0.png",
    "path": "image/42/82/4282…88d0.png"
  }
}
```

- `url`：可直接访问的绝对地址，由 `PUBLIC_BASE_URL` 拼接而成
- `path`：相对存储路径。业务库建议只存它，展示时再拼基址，这样服务迁移换地址不用刷数据

| code | HTTP | 含义 |
| --- | --- | --- |
| 2001 | 400 | 文件类型不支持 |
| 2002 | 400 | 空文件 |
| 2003 | 413 | 超过 `UPLOAD_MAX_SIZE_MB`（Nginx 和后端都会拦截，返回格式一致） |
| 2004 | 500 | 落盘失败 |
| 422 | 422 | 缺少 `file` 字段 |

默认允许 jpg、jpeg、png、gif、webp、xls、xlsx、doc、docx、pdf、md、txt。新增类型时在
`app/upload.py` 的 `CATEGORY_BY_EXTENSION` 里加一行即可。不要加 html、svg、js 这类
浏览器会执行的类型，否则会形成存储型 XSS。

### 读取

```bash
curl http://10.0.0.8:9000/uploads/image/42/82/4282…88d0.png
```

URL 由内容 hash 决定，内容永远不会变，所以响应带一年的 `immutable` 缓存。

## 业务项目接入

- **服务端转发**（推荐）：浏览器先传给业务后端，业务后端校验权限后再转发到 `/api/upload`，
  库里保存返回的 `path`。鉴权放在业务后端做，文件服务只对内网开放。
- **浏览器直传**：在 `.env` 中配置 `CORS_ORIGINS`。这种方式等于上传接口对浏览器所在网络开放，
  只适合内网系统。

## 本地开发

```bash
uv sync
uv run pytest
uv run ruff check . && uv run ruff format --check .
uv run uvicorn app.main:app --reload   # 只提供上传接口；/uploads 读取需通过 docker compose 起 Nginx
```
