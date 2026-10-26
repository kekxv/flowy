# 依赖与追加流程审查（2026-10-26）

## 范围与结论

检查 GitHub 12 个开放 Dependabot PR、依赖声明与锁文件、已知漏洞数据库，以及机器人引用编号和数字选择流程。依赖更新和流程修复已在本地实施；没有合并、关闭或评论远程 PR，没有推送或部署。

本次扫描结果不能保证不存在未知漏洞。临时详情仍是持链接可读的分享快照，权限变化不会自动撤销已生成快照，详见此前安全审查记录。

## PR 建议

查询时所有 PR 的前后端检查成功，Docker 检查跳过；合并状态未知，不能据此认定可以直接合并。

| PR | 内容 | 审查建议与本地处理 |
| --- | --- | --- |
| [#57](https://github.com/kekxv/flowy/pull/57) | Python 3.11 → 3.12 | Python 3.12.13 独立环境应用导入及 436 项测试通过；已增加 CI 3.11/3.12 矩阵。生产 Docker 暂保留 3.11，切换前仍需实际构建验证。 |
| [#56](https://github.com/kekxv/flowy/pull/56) | Node 22 → 25 | 不建议采用。官方发布日程中 Node 25 于 2026-06-01 结束支持，Node 22 支持至 2027-04-30。维持 Node 22。 |
| [#55](https://github.com/kekxv/flowy/pull/55) | Vitest 4.1.10 | 当前已是 4.1.12，无需降级。 |
| [#54](https://github.com/kekxv/flowy/pull/54) | Zustand 5.0.15 | 已本地更新至 5.0.16。 |
| [#53](https://github.com/kekxv/flowy/pull/53) | Axios 1.19.0 | 当前锁文件已是 1.20.0，无需降级；声明范围兼容。 |
| [#52](https://github.com/kekxv/flowy/pull/52) | SQLAlchemy 2.0.52 | 声明与锁文件同步更新至 2.0.52，未升级至 2.1。 |
| [#51](https://github.com/kekxv/flowy/pull/51) | Tailwind Vite 插件 4.3.3 | 插件和 tailwindcss 同步更新至 4.3.3。 |
| [#50](https://github.com/kekxv/flowy/pull/50) | respx 0.23.1 | 锁文件已有该版本，声明最低版本同步抬高。 |
| [#49](https://github.com/kekxv/flowy/pull/49) | cryptography 50.0.0 | 采用含后续修复的 50.0.2，并同步声明。 |
| [#48](https://github.com/kekxv/flowy/pull/48) | coverage-v8 4.1.10 | 当前已是 4.1.12，与 Vitest 对齐，无需降级。 |
| [#47](https://github.com/kekxv/flowy/pull/47) | pydantic-settings 2.15.0 | 声明与锁文件更新至 2.15.0。 |
| [#46](https://github.com/kekxv/flowy/pull/46) | Ruff 0.16.3 | 声明与锁文件更新至 0.16.3。 |

Node 发布日程来源：https://raw.githubusercontent.com/nodejs/Release/main/schedule.json

后端依赖 PR 只改 pyproject.toml、未改 uv.lock。生产镜像使用 `uv sync --no-dev --frozen`，不会因为声明变动自动安装新版本。CI 现在先执行 `uv lock --check`，随后安装和运行检查均使用 `--frozen`，避免测试时隐式更新锁文件而掩盖生产依赖未更新的问题。

## 安全依赖更新

前端升级前 npm audit 报告涉及 4 个 high 包；升级后报告为 0 个已知漏洞。

| 包 | 原版本 | 更新后锁定版本 |
| --- | --- | --- |
| Vite | 8.1.5 | 8.3.5 |
| Happy DOM | 20.9.0 | 21.0.4 |
| follow-redirects | 1.16.0 | 1.16.2 |
| Zod | 4.4.3 | 4.6.7 |

后端扫描完全锁定的生产依赖导出；升级前涉及 7 个包，升级后 pip-audit 返回 `No known vulnerabilities found`（退出码 0）。告警条目中包含重复标识，不能按条目数认定独立可利用漏洞数量。

| 包 | 原版本 | 更新后锁定版本 |
| --- | --- | --- |
| aiohttp | 3.14.1 | 3.14.5 |
| anyio | 4.13.0 | 4.14.2（Python <3.15）；4.15.1（Python >=3.15） |
| certifi | 2026.5.20 | 2026.10.23 |
| cryptography | 49.0.0 | 50.0.2 |
| multidict | 6.7.1 | 6.9.1 |
| Pillow | 12.3.0 | 13.0.0 |
| PyJWT | 2.13.0 | 2.15.1 |

复现扫描：

```sh
cd frontend
npm audit
cd ../backend
uv export --frozen --no-dev --no-hashes --no-emit-project --format requirements-txt -o /tmp/flowy-production-requirements.txt
uvx pip-audit -r /tmp/flowy-production-requirements.txt --no-deps --disable-pip
```

## 本轮追加流程修复

- 引用问题支持短 UUID、数字开头 UUID 和完整 UUID，避免数字开头的真实编号被截断；兼容旧短数字编号。
- 引用中的超长数字跳过，避免触发 Python 整数转换长度限制。
- 授权通过并执行新指令前清理旧 Wiki/指派数字选择，避免后续回复数字误操作旧结果。
- 新增 5 个回归场景，相关定向测试 117 项通过。

## 验证

- Python 3.11.2：应用导入、Ruff 通过，436 项测试通过。
- Python 3.12.13：独立虚拟环境应用导入、436 项测试通过。有 18 条 SQLite datetime 适配器弃用警告及 jieba 初始化语法警告，不影响本次测试结果。
- Node 22.23.4：`npm ci`、ESLint、`tsc -b`、149 项测试、生产构建通过；构建仍有 Mermaid/ELK 大分块提示，未在本轮扩大打包调整范围。
- `uv lock --check`、`git diff --check` 通过。
- 新增代码和依赖变更已完成独立只读复核，未发现可证实的回归或兼容缺陷。
- 前端 Happy DOM 21 默认关闭 iframe 加载，导致原打印测试失败；测试环境显式启用 iframe 加载以继续覆盖 about:blank 打印预览，不改变生产配置。
