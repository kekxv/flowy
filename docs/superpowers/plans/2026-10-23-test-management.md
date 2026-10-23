# 测试管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 增加测试申请、测试执行、测试报告、统计和企业微信查询能力，并复用现有项目角色、附件和认证体系。

**Architecture:** 新增独立的 `test_requests`、`test_runs`、`test_attachments` 和状态历史模型；测试申请可选关联问题或需求，测试人员通过已有 `tester` 项目角色授权。FastAPI 提供 REST API，React 增加测试列表/详情/创建/报告页面；报告使用 CSS `@page` 支持 A4/A5 打印。

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, Alembic, React 19, TypeScript, Tailwind CSS 4, Vitest/Pytest。

**Spec:** 用户确认的测试管理需求（2026-10-23）。

## Global Constraints

- “测试申请”是待审核状态；正式分配后进入“等待测试”。
- 关联已有问题/需求是可选项。
- 报告支持网页查看和 A4/A5 打印，不要求 PDF 生成。
- 首页仪表盘和测试页都显示测试统计。
- 附件复用系统上传限制，并限制类型、单文件大小和单申请数量。

### Task 1: 数据模型、迁移和后端领域服务

**Files:** `backend/app/models/test.py`, `backend/app/models/__init__.py`, `backend/alembic/versions/*_test_management.py`, `backend/app/services/test_service.py`, `backend/tests/test_test_service.py`

- [ ] 先写模型/状态流转/权限的失败测试：新建默认 `submitted`；受理为 `queued`；开始为 `testing`；结果只能提交 `passed` 或 `failed`；申请人可取消未开始申请；拒绝必须记录原因；测试人员必须具备 `tester` 项目角色。
- [ ] 运行 `cd backend && uv run pytest tests/test_test_service.py -q` 确认测试因模型和服务缺失失败。
- [ ] 添加申请、测试轮次、附件元数据、状态历史模型及索引和约束，迁移时兼容 SQLite。
- [ ] 实现服务层的创建、受理、分配、开始、提交结果、取消、拒绝和统计查询。
- [ ] 重跑单测并确保通过。

### Task 2: 测试 REST API 和附件接口

**Files:** `backend/app/schemas/test.py`, `backend/app/api/v1/tests.py`, `backend/app/api/v1/router.py`, `backend/tests/test_api_tests.py`

- [ ] 先写 API 失败测试：申请 CRUD、可选 issue_id、tester 分配、状态流转、结果字段、附件数量/大小校验和统计接口。
- [ ] 运行指定测试确认失败。
- [ ] 实现 `/tests`、`/tests/{id}`、`/tests/{id}/runs`、`/tests/{id}/transition`、`/tests/stats` 和受保护附件上传/下载。
- [ ] 仅管理员、项目负责人或申请人可管理申请；只有被分配测试人员可录入结果；报告读取遵循项目可见性。
- [ ] 重跑后端 API 测试。

### Task 3: 前端测试工作台和报告打印

**Files:** `frontend/src/api/tests.ts`, `frontend/src/pages/TestListPage.tsx`, `frontend/src/pages/TestCreatePage.tsx`, `frontend/src/pages/TestDetailPage.tsx`, `frontend/src/components/layout/AppLayout.tsx`, `frontend/src/App.tsx`, `frontend/src/locales/zh.json`, `frontend/src/locales/en.json`, `frontend/src/index.css`, `frontend/src/pages/TestListPage.test.tsx`

- [ ] 先写列表统计、状态筛选和报告打印按钮的失败测试。
- [ ] 运行 `cd frontend && npm test -- --run src/pages/TestListPage.test.tsx` 确认失败。
- [ ] 实现测试列表、简单统计、创建申请、详情/分配/状态操作、测试结果录入和报告视图；附件复用 Markdown 上传组件。
- [ ] 使用打印媒体样式和 A4/A5 选择控件，隐藏导航和操作区，保留标题、申请信息、环境、步骤、结果及附件链接。
- [ ] 将“测试”加入导航和创建菜单，补齐中英文文案。
- [ ] 运行前端测试、TypeScript 检查和构建。

### Task 4: 首页统计与企业微信查询

**Files:** `backend/app/api/v1/dashboard.py`, `backend/app/services/wechat_work_bot/command_parser.py`, `backend/app/services/wechat_work_bot/handlers.py`, `backend/tests/test_wechat_test_commands.py`, `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/DashboardPage.test.tsx`

- [ ] 先写统计和机器人命令失败测试：按状态统计、`/test <id>` 返回状态、`/test report <id>` 返回报告链接、无权限时拒绝。
- [ ] 实现仪表盘测试统计聚合和机器人 `/test`、`/测试` 查询命令，返回最近一次测试结果和报告 URL。
- [ ] 在首页增加状态总数和成功率摘要，不改变已有问题统计。
- [ ] 运行后端和前端全量测试。

### Task 5: 验证和文档

**Files:** `README.md`

- [ ] 运行后端全量 `uv run pytest`、前端 `npm test -- --run`、`npm run build`。
- [ ] 更新 README 的测试管理、权限、状态和企业微信命令说明。
- [ ] 检查数据库迁移、附件越权、打印布局和移动端页面。
