---
name: init-project
description: 新项目初始化时可用：内含项目初始化流程和一套模板（AI 规则、前端、文件服务、skill 等）。用户要新建、初始化或搭建项目时，先读详情再决定是否使用。
---

# 项目初始化

适用于任意小项目。`assets/` 里的模板只是起点：它们是从别的项目里抽出来的，带着原项目的路径、命名和配置。先询问用户，再挑出需要的模板复制进新项目，并按新项目改写：不适用的删掉，缺的补上，原项目特有的写法换成新项目的。没选中的模板不带，选中的也不要整套照搬。

文中 `assets/...` 指本 skill 目录（本文件所在目录）下的路径；生成的文件放进用户指定的目标目录。

## 流程
1. 先查看目标目录。已有代码的话，能从中推断出来的就不再问。
2. 把决策点一次问完，每项给出推荐的默认值，用户只需回答「按默认」或改其中几项。用户没提的功能不要加。
3. 列出方案给用户确认，内容包括：用哪些模板、各自怎么改、需要用户提供的地址或账号。确认后再动手。
4. 生成后必须跑通，包括安装依赖、构建、启动、测试。模板改写最容易留下断掉的 import 和多余的配置，只有实际跑一遍才会暴露。最后汇报做了什么、还缺什么。

## 决策点
- 项目组成和技术栈
- 是否需要登录鉴权
- 持久化：数据库、文件存储，以及是否已经有共享的实例
- 部署方式：k8s、docker-compose，或者暂时不部署
- 需要哪些模板（只列出和技术栈匹配的）

## 约定
- 版本号不要凭记忆写（记忆里的版本往往已经过时），一律用包管理器装最新版（`pnpm add`、`uv add`）。前端用 pnpm，Python 用 uv，其他工具也优先选最新、最现代化的。
- 用 git 管理项目。多项目（比如前后端放在一起）用 monorepo：规模小就用 bash 串起来，规模大了再换 moon v2 或 Nx。
- 项目根目录放一个 `run.sh`，用户一条命令就能把项目跑起来。
- 前端的 type 由后端的 OpenAPI 生成。后端能自动导出 schema（比如 FastAPI）就直接用它；导不出时，以 openapi.yaml 作为唯一来源。
- 确定了部署方案再生成部署文件。镜像要轻量，并使用多阶段构建。
- 持久化数据（文件、数据库）在开发开始前单独部署好。开发阶段所有人共用同一份数据，方便调试。
- 有后端就要在初始化时把日志搭好，规范见 AGENTS.md 的「日志」一节：
  - 选技术栈里主流的结构化日志库（比如 Python 用 structlog，Node 用 pino），输出 jsonl。
  - 请求中间件负责处理 `X-Request-ID` 并记录 `http.request`；全局异常处理统一记录 `error`；按前端模板的约定实现 `/diagnostics/frontend-errors` 接口。
  - 本地写到 `logs/app.jsonl`，按大小轮转，并加入 git 忽略；线上输出到 stdout。
  - 写一个会报错的测试接口，确认成功请求、业务失败、意外异常三种情况各自落下的日志符合规范后再删掉。

## 模板
| 位置 | 内容 | 何时用 |
|---|---|---|
| `assets/AGENTS.md` | AI 规则，含日志规范 | 总是用 |
| `assets/frontend/` | utils、组件、指令、vite 插件和配置 | 技术栈必须是 vue3 + element-plus + ts + vite + vue-router |
| `assets/frontend/plugins/vite-plugin-ai-bridge` | vite dev 时注入 js 作为桥，读取前端运行时的数据 | 前端项目，用于调试前端 |
| `assets/file-server/` | 无鉴权的内网文件服务，部署方法见它的 README | 需要文件存储 |
| `assets/ai-skills/api-curl` | 用 curl 调后端接口，由它自动完成鉴权 | 项目有登录鉴权后 |
| `ai-skills/deploy-to-test` | 发布到测试环境（暂无模板，需要时现写） | 部署方案确定后 |

复制时带上隐藏文件（`.gitignore`、`.env.example` 等），但不要带 `.venv`、`node_modules`、`__pycache__`、`.pytest_cache`、`.ruff_cache` 这类本地产物。

### 改写要点
下面列的是已知要改的地方，不是全部；复制后再通读一遍。

- **AGENTS.md**：前端相关条目（axios、弹窗、ref、依赖注入、css、eslint）只在有 vue 前端时保留；`src/utils/`、`src/components/` 换成新项目的实际目录。
- **frontend/**：只有工具代码和配置，没有 `index.html`、`src/main.ts`、`App.vue`，不能直接跑。先用 `pnpm create vite` 选 vue-ts 建出骨架，再把 `utils/`、`components/`、`directives/`、`router/`、`global-modals/` 放进 `src/`，`plugins/`、`vite.config.ts`、tsconfig 放在前端根目录。
  - `package.json` 只用来看需要哪些依赖，依赖一律用 `pnpm add` 重新装。
  - `vite.config.ts` 引用了 `env/`（envDir）、`src/config/mode`、`src/assets/style/mixin.scss`、`src/assets/imgs`，端口写死 8036，`/api` 代理到 `127.0.0.1:8000`。这些要按新项目补齐或删掉。
  - `utils/auth.ts` 的存储 key 是占位的 `"xxx"`，`AuthUser` 是 `any`；`router/index.ts` 只有兜底路由，`/login`、`/home` 要和实际页面对上。不需要登录时，把 auth、路由守卫和 `request.ts` 里的 token 处理一起去掉。
  - 后端的 `/diagnostics/frontend-errors` 接口按 `utils/frontend-error-reporting.ts` 实际发送的请求体来实现，`X-Request-ID` 的处理对照 `utils/request-trace.ts`。
- **file-server/**：独立服务，按它的 README 单独部署。已有共享实例就直接用现成的地址，不用再部署。业务项目只需要记下它的地址。
- **ai-skills/api-curl**：来自 bi-jing 项目（FastAPI + SQLAlchemy + JWT）。
  - `SKILL.md.tmpl` 复制后改名为 `SKILL.md`。模板里特意改了名，避免被 AI 工具扫描成独立的 skill。
  - SKILL.md 里的 `ai-agent/skills/` 路径、`rtk proxy` 前缀、`dev.env`、`bijing-mysql`、接口示例，以及源码查找顺序（`backend/app/api/...`）都要换成新项目的。
  - `scripts/api_debug.py` 的 `REPO_ROOT = parents[4]` 和 `scripts/api-curl` 里的 `../../../..` 都是按 `ai-agent/skills/api-curl/scripts/` 的层级算的，放到 `ai-skills/api-curl/scripts/` 要少一级。从后端导入的 `app.core.config`、`app.core.security.create_token`、`app.db.session`、`app.models.user` 要对上新项目后端的实际模块；脚本跑在后端的 uv 环境里，用到的 `sqlalchemy`、`httpx2` 要在后端装上。
  - 改完跑一遍 `tests/test_api_debug.py`，再用它真实请求一次 `/health` 和一个需要鉴权的接口。

## AI 规则
- `AGENTS.md` 是规则的唯一来源。模板里的条目按技术栈取舍，再补上本项目的启动命令、端口和目录结构。规则中提到的工具（比如 eslint）必须实际装好。
- 选用了 ai-bridge 时，把 `assets/frontend/plugins/vite-plugin-ai-bridge/ai-bridge.md` 合并进 AGENTS.md。
- 需要 `CLAUDE.md` 时，内容只写一行 `@AGENTS.md`，并加入 git 忽略。
- skill 放在 `ai-skills/` 目录下，每个子目录是一个 skill。要软链到各 AI 工具读取 skill 的目录（比如 `.claude/skills`），不做软链的话工具加载不到它们。
- 文件服务或数据库部署完成后，如果还没有对应的 skill，就补一个，让 AI 能管理其中的数据。skill 提供的命令要自带鉴权，参数和原命令保持一致，比如 `mysql`。数据库 skill 在查询前先获取索引信息，避免全表扫描。
- 线上日志如果汇集到了日志平台（比如 Graylog），并且还没有对应的 skill，就补一个，让 AI 能按 `request_id`、`event`、`level` 查询线上日志。
