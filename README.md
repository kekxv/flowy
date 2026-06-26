# Flowy

轻量级问题追踪和需求管理平台，支持企业微信机器人集成

## 功能特性

- **问题与需求追踪** — 支持 Bug 和 Feature 类型，完整 CRUD 操作
- **企业微信机器人** — 通过机器人创建/更新/关闭/解决问题，自动分配给关联用户
- **项目角色管理** — project_lead, backend_dev, frontend_dev, tester, ui_designer, devops, clerk, member
- **里程碑** — 进度追踪，发布/关闭/重新打开工作流
- **时间追踪** — 按用户按问题的计时器，记录工作时长
- **评论系统** — 支持 Markdown，嵌套回复，状态审核
- **外部链接** — 通过 OAuth 或 PAT 连接 Gitea/GitHub，关联问题和 PR，自动同步
- **通知系统** — Webhook 和企业微信通道，多事件规则
- **权限管理** — admin, project_lead, feature owner, reporter 细粒度访问控制
- **国际化** — 中文和英文支持

## 注册策略

系统采用**首次开放注册**策略：
- 当系统没有任何用户时，允许注册，第一个注册用户自动成为管理员
- 一旦有用户后，注册功能自动关闭
- 后续用户只能由管理员通过管理面板手动创建
- 管理员可以重置用户密码

## 企业微信机器人

### 支持命令

#### 问题管理
- `/create [类型] <标题> [描述...]` — 创建问题（bug/问题/缺陷 或 feature/需求/功能/特性）
- `/update <id> <字段> <值>` — 更新问题字段
- `/close <id> [原因]` — 关闭问题（状态→closed）
- `/resolve <id> [说明]` — 解决问题（状态→resolved）
- `/assign <id> <用户>` — 分配问题给用户
- `/priority <id> <级别>` — 设置优先级（critical/high/medium/low/trivial）
- `/comment <id> <内容>` — 添加评论

#### 查询命令
- `/list [all]` — 列出问题（默认显示我的，all 显示全部）
- `/stats` — 问题统计（按状态/优先级分组，显示进度条）

#### 里程碑管理
- `/milestone create <名称>` — 创建里程碑
- `/milestone list` — 列出所有里程碑
- `/milestone close <id>` — 关闭里程碑
- `/milestone stats <id>` — 查看里程碑统计

#### 用户管理（管理员）
- `/add_user <wechat_id> [角色]` — 添加机器人用户
- `/remove_user <wechat_id>` — 移除机器人用户
- `/set_role <wechat_id> <角色>` — 设置用户角色（admin/helper/viewer）
- `/list_users` — 列出机器人用户

#### 账号绑定
- `/bind <token>` — 绑定 Flowy 账号（管理员生成绑定令牌）

### 自动分配

当用户通过企业微信机器人创建问题时，如果该用户已绑定 Flowy 账号，问题会**自动分配给该用户**。

### 指令格式

创建问题支持完整格式：
```
/create [类型] <标题> [描述内容...]
```

- **类型**：可选，支持中英文（bug/feature/问题/需求/功能/缺陷/特性），默认 bug
- **标题**：必填，第一个非类型参数
- **描述**：标题后的所有文本，引用消息内容也会追加到描述

示例：
```
/create bug 登录页面崩溃 用户点击登录按钮后页面白屏
/create 需求 用户导出功能 支持导出 CSV 和 Excel 格式
/创建 问题 接口超时 查询用户列表接口响应时间超过 5 秒
```

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Python 3.11, FastAPI, SQLAlchemy (async), SQLite |
| 前端 | React 19, Vite, Tailwind CSS 4, react-i18next |
| 包管理 | uv (Python), npm (Node) |
| 认证 | JWT (bcrypt) |
| OAuth | Gitea, GitHub |

## 快速开始

### 开发环境

```bash
# 后端
cd backend
cp .env.example .env    # 编辑密钥
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0

# 前端
cd frontend
npm install
npm run dev
```

访问 `http://localhost:5173` — 第一个注册的用户自动成为管理员。

### Docker 部署

```bash
cp .env.example .env
docker compose up -d
```

单镜像打包后端（FastAPI + Uvicorn）和前端（Nginx 静态文件），监听 80 端口。

#### 数据持久化

`.env.example` 中已配置：
- `DATABASE_URL=sqlite+aiosqlite:////data/flowy.db` — 数据库文件
- `UPLOAD_DIR=/data/uploads` — 机器人附件存储

确保 `flowy_data` 卷正确挂载到 `/data` 目录，数据会在容器重启后保留。

## 项目结构

```
flowy/
├── backend/
│   ├── app/
│   │   ├── api/v1/       # REST API 端点
│   │   ├── core/         # 加密、事件分发
│   │   ├── models/       # SQLAlchemy 模型
│   │   ├── schemas/      # Pydantic 验证模式
│   │   └── services/     # 业务逻辑、外部集成、通知、同步、企业微信机器人
│   ├── alembic/          # 数据库迁移
│   └── pyproject.toml
├── frontend/
│   └── src/
│       ├── api/          # API 客户端
│       ├── pages/        # 页面组件
│       ├── components/   # 布局、UI 组件
│       ├── locales/      # 国际化（zh.json, en.json）
│       └── store/        # Zustand 状态管理
├── .env.example          # 环境变量模板
├── docker-compose.yml
└── README.md
```

## 配置说明

### 环境变量

| 变量 | 描述 |
|------|------|
| `DATABASE_URL` | SQLite 数据库路径（默认：`sqlite+aiosqlite:////data/flowy.db`） |
| `UPLOAD_DIR` | 机器人附件存储目录（默认：`/data/uploads`） |
| `FRONTEND_URL` | 前端 URL，用于通知链接和 OAuth 回调 |
| `JWT_SECRET` | JWT 签名密钥 |
| `ENCRYPTION_KEY` | 敏感数据加密密钥（Fernet） |
| `SYNC_INTERVAL_MINUTES` | 外部问题同步间隔（分钟） |

### OAuth 配置

1. 在 GitHub/Gitea 开发者控制台注册 OAuth 应用
2. 设置回调 URL：`{frontend_url}/api/v1/external/connections/oauth/callback`
3. 在管理面板填写 Client ID 和 Client Secret

### 管理面板

管理员可以通过管理面板（`/#/admin`）：
- 查看系统统计（用户数、问题数、开放/关闭问题数）
- 创建新用户（用户名、邮箱、密码、显示名称、角色）
- 编辑用户信息（显示名称、昵称、项目角色）
- 切换用户管理员/成员身份
- 激活/停用用户账号
- 重置用户密码
- 配置 OAuth 连接
- 配置企业微信机器人

## 许可证

MIT
