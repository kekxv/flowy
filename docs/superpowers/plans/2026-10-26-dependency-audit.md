# 依赖与追加流程检查计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 审查开放依赖 PR、修复可验证的流程问题，升级已知漏洞依赖并保留可复现测试。

**Architecture:** 保留此前未提交修复；依赖只更新安全修复和开放 PR 涉及的兼容版本。应用运行时保持现有版本，在独立环境验证 Python 3.12，并让 CI 同时覆盖 3.11/3.12。

**Tech Stack:** uv、Python 3.11/3.12、npm、Vitest、pytest、GitHub API。

**Spec:** 用户本轮要求继续检查并评估 GitHub PR 和依赖更新。

## Global Constraints

- 不自动合并、关闭或评论远程 PR。
- Node 25 已结束支持，不采用该 PR；维持受支持的 Node 22。
- 保留现有所有工作区修改，更新声明时同步锁文件。
- 扫描告警与可利用漏洞分开陈述，不对外保证绝对无漏洞。

## Tasks

- [x] 读取 12 个开放 PR、文件范围与 CI 结论，对比本地声明和锁定版本。
- [x] 执行 npm audit 和后端生产依赖 pip-audit，记录升级前结果。
- [x] 升级前端 Vite、Happy DOM、follow-redirects、Zod；更新 Tailwind/Zustand 对应补丁版本。保留已高于 PR 的 Axios/Vitest。
- [x] 升级后端已知漏洞包、PR 对应 SQLAlchemy/配置库/开发工具；同步 uv.lock，重新扫描并分析残留告警是否可达。
- [x] 追加检查引用问题编号与旧搜索数字选择流程，先复现再修复发现的问题。
- [x] 运行 CI 等价检查；独立 Python 3.12 环境运行全量后端测试，补 CI 版本矩阵及锁文件一致性检查。Happy DOM 21 的 iframe 默认配置变化已在测试配置适配。
- [x] 独立只读复核最终补丁，生成逐 PR 建议与本地验证记录。
