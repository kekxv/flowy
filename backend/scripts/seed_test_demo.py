"""Add realistic testing demos without replacing existing application data.

Run from backend/: uv run python scripts/seed_test_demo.py
Stable IDs make repeated execution safe: existing demo requests are skipped.
"""
import asyncio
import json
import sys
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402

import app.models  # noqa: F401,E402 -- register all ORM relationships
from app.database import async_session, engine  # noqa: E402
from app.models.issue import Issue  # noqa: E402
from app.models.test import TestRequest, TestRun, TestStatusHistory  # noqa: E402
from app.models.tracking import UserProjectRole  # noqa: E402
from app.models.user import User  # noqa: E402


def uid(key):
    return str(uuid5(NAMESPACE_URL, f'flowy/demo-testing/2026-10/{key}'))


def chart(kind, title, labels, series):
    return '```chart\n' + json.dumps(dict(type=kind, title=title, labels=labels, series=series), ensure_ascii=False) + '\n```'


def report_content(topic, status, counts):
    passed, failed, blocked = counts
    total = sum(counts)
    summary = '验证通过，建议按发布计划上线。' if status == 'passed' else '存在未关闭缺陷，本轮验证不通过，修复后需要复测。'
    recommendations = ('- 本轮未发现阻断发布的问题。\n- 上线后持续观察错误率和关键接口响应时间。' if status == 'passed' else '- **高优先级：** 修复权限缓存与幂等校验。\n- 缺陷关闭后重新执行完整回归，不仅复测单个失败用例。')
    return f'''## 执行摘要

{topic}，本轮共执行 **{total}** 个用例，其中 **{passed}** 个通过、**{failed}** 个失败、**{blocked}** 个阻塞。

> **测试结论：** {summary}

### 测试环境

| 项目 | 配置 |
| --- | --- |
| 浏览器 | Chrome 130 / Edge 130 / Safari 18 |
| 操作系统 | Windows 11、macOS 15 |
| 数据集 | 演示环境隔离数据，含普通用户与管理员 |
| 测试范围 | 核心功能、权限边界、异常提示和回归验证 |

### 用例结果分布

{chart('pie', '用例执行结果', ['通过', '失败', '阻塞'], [dict(name='用例数', data=list(counts))])}

### 模块覆盖情况

{chart('bar', '各模块执行情况', ['核心流程', '权限边界', '异常处理'], [dict(name='执行用例', data=[round(total * .5), round(total * .3), total-round(total*.5)-round(total*.3)])])}

### 质量变化趋势

{chart('line', '最近三轮通过率（%）', ['第一轮', '第二轮', '本轮'], [dict(name='通过率', data=[72, 88, round(passed/total*100)])])}

### 关键用例记录

| 编号 | 场景 | 预期结果 | 实际结果 |
| --- | --- | --- | --- |
| TC-001 | 标准业务流程 | 操作完成且数据正确保存 | 通过 |
| TC-002 | 无权限账户访问 | 阻止访问并明确提示 | {'通过' if status == 'passed' else '失败：权限刷新后仍可短暂访问'} |
| TC-003 | 重复提交或网络重试 | 不产生重复数据 | {'通过' if status == 'passed' else '失败：偶发重复记录'} |
| TC-004 | 空值、边界值与特殊字符 | 正确校验并保留输入 | 通过 |

### 执行流程

```mermaid
flowchart LR
    A[准备环境与数据] --> B[执行功能验证]
    B --> C[验证权限及异常场景]
    C --> D{{是否通过}}
    D -->|通过| E[归档报告]
    D -->|失败| F[修复并重新测试]
    F --> B
```

### 风险与建议

{recommendations}

### 验证记录

```text
[09:10:00] 初始化隔离测试数据完成
[09:12:30] 核心流程执行完成
[09:20:45] 权限与异常场景验证完成
[09:25:10] 生成本轮测试结论及报告
```

---

本报告为演示数据，用于检查 Markdown、表格、图表、流程图与 A4/A5 打印排版。
'''


DEMOS = [
    dict(key='login', title='登录与权限回归 · 失败后复测通过', status='passed', topic='登录、退出与角色权限边界', linked=True,
         runs=[('v2.3.0-rc.1', 'failed', (25, 4, 1)), ('v2.3.0-rc.2', 'passed', (30, 0, 0)), ('v2.3.0', 'passed', (36, 0, 0))]),
    dict(key='upload', title='大文件上传与断点续传 · 连续两轮失败', status='failed', topic='附件大小限制、断点续传及重复提交', linked=True,
         runs=[('v2.3.1-rc.1', 'failed', (18, 5, 1)), ('v2.3.1-rc.2', 'failed', (21, 2, 1))]),
    dict(key='dashboard', title='首页统计仪表盘 · 待审核', status='submitted', topic='首页与测试页统计口径及图表展示', runs=[]),
    dict(key='wechat', title='企业微信状态查询指令 · 等待测试', status='queued', topic='按测试编号查询状态、结果及报告链接', runs=[]),
    dict(key='print', title='报告打印与分页 · 测试中', status='testing', topic='多份报告、图表、长表格与 A4/A5 分页', runs=[]),
    dict(key='mobile', title='移动端导航改版 · 已取消', status='cancelled', topic='移动端菜单导航与窄屏适配', reason='需求方案调整，本次测试取消，待新设计确认后重新申请。', runs=[]),
    dict(key='sms', title='短信服务集成 · 不予测试', status='rejected', topic='短信验证码发送与限流', reason='缺少可用的短信沙箱账号及测试环境，暂不具备测试条件，请补充后重新申请。', runs=[]),
    dict(key='performance', title='列表接口性能 · 失败后等待复测', status='queued', topic='千条记录分页查询与并发响应时间',
         runs=[('v2.2.9', 'failed', (16, 3, 1))]),
    dict(key='charts', title='图表与 Markdown 综合报告 · 测试成功', status='passed', topic='柱状图、折线图、饼图、流程图与打印一致性',
         runs=[('v2.3.2', 'passed', (42, 0, 0))]),
]


async def main():
    async with async_session() as db:
        admin = await db.scalar(select(User).where(User.role == 'admin', User.is_active.is_(True)).order_by(User.created_at))
        tester = await db.scalar(select(User).join(UserProjectRole, UserProjectRole.user_id == User.id).where(UserProjectRole.role == 'tester', User.is_active.is_(True)).order_by(User.role.desc(), User.created_at))
        if not admin or not tester:
            raise RuntimeError('An active admin and an active tester are required; no accounts will be created or reset.')
        issues = list((await db.scalars(select(Issue).order_by(Issue.created_at).limit(2))).all())
        now = datetime.now()
        created = []
        skipped = 0
        for index, demo in enumerate(DEMOS):
            request_id = uid(demo['key'])
            if await db.get(TestRequest, request_id):
                skipped += 1
                continue
            start = now - timedelta(days=6, hours=index)
            events = []

            def event(old, new, reason, actor=None, *, start=start, events=events, demo=demo, request_id=request_id):
                stamp = (start + timedelta(hours=len(events) * 3)).isoformat()
                events.append(TestStatusHistory(id=uid(f"{demo['key']}/event/{len(events)}"), request_id=request_id, from_status=old, to_status=new, changed_by=actor or admin.id, reason=reason, created_at=stamp))
                return stamp

            event('', 'submitted', '提交演示测试申请，等待审核')
            current = 'submitted'
            if demo['status'] not in ('submitted', 'rejected', 'cancelled'):
                event(current, 'queued', '审核通过并分配测试人员')
                current = 'queued'
            if demo['runs'] or demo['status'] == 'testing':
                event(current, 'testing', '测试环境就绪，开始执行测试', tester.id)
                current = 'testing'
            runs = []
            for i, (version, status, counts) in enumerate(demo['runs']):
                if i:
                    event(current, 'queued', '修复或版本变更，安排新一轮验证')
                    event('queued', 'testing', '开始新一轮测试', tester.id)
                    current = 'testing'
                stamp = event(current, status, f'提交测试报告 · {version}', tester.id)
                current = status
                runs.append(TestRun(id=uid(f"{demo['key']}/run/{i}"), request_id=request_id, tester_id=tester.id, status=status, version=version,
                    method='## 测试策略\n\n- **功能验证：** 手工场景与自动化回归结合。\n- **兼容性：** Chrome、Edge、Safari。\n- **异常验证：** 权限不足、网络重试、边界输入。',
                    server_url=f"https://{demo['key']}.qa.example.test",
                    steps=f"1. 登录演示测试环境，确认版本为 `{version}`。\n2. 准备普通用户和管理员两组隔离数据。\n3. 验证{demo['topic']}。\n4. 执行异常场景、记录日志与实际结果。\n5. 对照预期逐项核验并归档报告。",
                    result=f"### {'验证通过' if status == 'passed' else '验证未通过'}\n\n共 **{sum(counts)}** 个用例：通过 **{counts[0]}**、失败 **{counts[1]}**、阻塞 **{counts[2]}**。\n\n" + ('核心流程与权限边界均符合预期。' if status == 'passed' else '**发现问题：** 权限刷新及重复提交场景仍存在异常，需修复后复测。'),
                    report=report_content(demo['topic'], status, counts), created_at=stamp))
            if current != demo['status']:
                event(current, demo['status'], demo.get('reason', '已修复性能问题，等待下一轮复测'))
            request = TestRequest(id=request_id, title='【演示】' + demo['title'],
                objective=f"## 测试目标\n\n验证 **{demo['topic']}**，覆盖正常路径、异常路径及权限边界。\n\n### 验证范围\n\n- 核心业务流程与数据正确性\n- 多角色权限与输入边界\n- 页面展示、错误反馈与操作体验\n\n> 此申请为演示数据，可以用于查看详情、报告卡片和打印效果。",
                expected_effect='## 验收标准\n\n- [ ] 核心流程可以完成，保存后数据一致。\n- [ ] 无权限操作被阻止，错误提示明确。\n- [ ] 异常输入不会导致页面崩溃或数据丢失。\n- [ ] 桌面及移动端内容完整显示。',
                current_behavior='## 当前现象\n\n新版本已交付演示环境，需要对核心功能和异常场景进行验证。\n\n| 场景 | 观察重点 |\n| --- | --- |\n| 常规操作 | 数据正确性与反馈时机 |\n| 边界场景 | 权限、重试与空值处理 |',
                issue_id=issues[index % len(issues)].id if demo.get('linked') and issues else None,
                reporter_id=admin.id, tester_id=tester.id if demo['status'] not in ('submitted', 'rejected', 'cancelled') else None,
                status=demo['status'], rejection_reason=demo.get('reason', '') if demo['status'] == 'rejected' else '',
                created_at=start.isoformat(), updated_at=events[-1].created_at)
            db.add(request)
            await db.flush()
            db.add_all(runs + events)
            created.append(demo)
        await db.commit()
        print(json.dumps({'created_requests':len(created), 'created_reports':sum(len(d['runs']) for d in created), 'skipped_existing':skipped, 'created_statuses':dict(Counter(d['status'] for d in created)), 'tester':tester.username, 'reporter':admin.username}, ensure_ascii=False, indent=2))
    await engine.dispose()


if __name__ == '__main__':
    asyncio.run(main())
