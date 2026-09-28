---
name: api-curl
description: 使用 curl-like CLI 调试和验收本项目 ，内部已经鉴权
---

# 后端接口 CLI 调试

使用配套的 `api-curl` 请求真实运行中的后端。它从真实用户表读取用户、复用项目 JWT 签发逻辑，并只
在内部注入 Token。AI 的使用方式和 curl 一样直接，但不需要处理登录、验证码或 Authorization。

## 环境边界

- “真实运行”只表示请求了用户已经启动的 `localhost:8000`，不是 mock 或 TestClient。
- 本工具没有独立配置：用户、Token 和上游地址均复用 backend 的 `Settings`，配置源是根目录 `dev.env`。
- HTTP 请求始终打本机；自动鉴权查询的数据库来自 `dev.env` 的 `MYSQL_DSN`，并与 `bijing-mysql` 共用，因此数据库可能位于远端。
- 涉及远端已部署服务验收时，停止使用本工具作结论，改走项目明确提供的部署环境入口。
- CLI 每次请求都会打印不含凭据的 `scope`，交付结果时也要明确写“本机后端”，避免把本机验收误报成部署环境验收。

## 调用前先确认接口契约

遵循项目的接口查询顺序，只读取本次目标所需文件：

1. 从 `backend/app/api/router.py` 确认业务路由已挂载。
2. 读取 `backend/app/api/routes/<module>.py`，确认方法、路径、权限依赖和响应类型。
3. 读取 `backend/app/schemas/<module>.py`，确认请求及响应字段。
4. 只有需要理解行为时，才读取对应 service、安全依赖或数据库模型。
5. 前端联调再读取 `frontend/src/api/<module>.ts`。

不要用 `/docs` 或完整 `openapi.json` 代替后端源码。

## 固定命令入口

从项目根目录执行：

```bash
rtk proxy ai-agent/skills/api-curl/scripts/api-curl <METHOD> <PATH> [options]
```

`rtk proxy` 只负责遵循当前 Codex 环境的命令约定；真正的 HTTP 工具是后面的 `api-curl`。如果运行
环境没有 `rtk`，直接执行 `ai-agent/skills/api-curl/scripts/api-curl ...`。

`PATH` 可以写源码中的模块路径，例如 `/auth/me`；脚本会自动补 `/api`。也可以显式写
`/api/auth/me`。

先确认用户启动的服务可用，不能自行启动后端：

```bash
rtk proxy ai-agent/skills/api-curl/scripts/api-curl GET /health --no-auth
```

## 常用请求

默认以 `dev.env` 所连数据库中的 `admin` 用户调用鉴权接口：

```bash
rtk proxy ai-agent/skills/api-curl/scripts/api-curl GET /auth/me
```

切换为另一个已启用用户：

```bash
rtk proxy ai-agent/skills/api-curl/scripts/api-curl GET /skills/mine --user alice
```

提交 JSON：

```bash
rtk proxy ai-agent/skills/api-curl/scripts/api-curl POST /skills/batch \
  --json '{"ids":[1,2]}'
```

查询参数可重复传入：

```bash
rtk proxy ai-agent/skills/api-curl/scripts/api-curl GET /users \
  --query page=1 --query page_size=20
```

上传 multipart 文件：

```bash
rtk proxy ai-agent/skills/api-curl/scripts/api-curl POST /upload \
  --file file=/tmp/example.xlsx
```

下载到新文件；默认拒绝覆盖，只有目标确实可以覆盖时才显式加 `--force`：

```bash
rtk proxy ai-agent/skills/api-curl/scripts/api-curl GET /tags/template \
  --output /tmp/tags-template.xlsx
```

验证无 Token 分支：

```bash
rtk proxy ai-agent/skills/api-curl/scripts/api-curl GET /auth/me --no-auth
```

运行 `rtk proxy ai-agent/skills/api-curl/scripts/api-curl --help` 查看完整参数。不要自行拼接或
打印 JWT，也不要退回到读取浏览器 localStorage；脚本失败时应排查本机服务、`dev.env`、数据库
和用户状态。

## 结果判断与接口验收

脚本输出 HTTP 状态码和响应体。HTTP 状态码大于等于 400，或统一 JSON 响应中的 `code != 0`，都会
返回非零退出码；测试预期错误分支时，非零退出码是正常现象，应继续核对具体状态码和业务码。

新增或修改接口后，至少覆盖：

- 正常流程及真实数据读写结果。
- 参数校验。
- 无鉴权、普通用户和管理员权限。
- 业务错误流程。
- 本次写入数据的清理；文件接口还要比对实际上传或下载内容。

必须请求用户已经启动的 `localhost:8000` 服务。若服务、数据库或目标用户不可用，应明确说明本机真实接口
尚未完成验收，不能用 mock、TestClient 或路由注册检查替代。

## 安全约束

- 脚本只允许回环地址，不能通过修改命令转去远程或生产服务。
- Token 只存在于当前进程内存，有效期默认 10 分钟，不输出也不缓存。
- AI 只调用 `api-curl`，不传账号密码、验证码或 Token；不要把 Authorization 放入 `--header`，
  工具也会拒绝它。
- 不为了通过测试修改或伪造真实业务数据。会写数据的接口先明确目标，完成后清理。
