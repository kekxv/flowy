import pytest

from app.models.tracking import UserProjectRole
from app.models.user import User
from app.services.test_service import TestService


@pytest.mark.asyncio
async def test_test_request_defaults_to_submitted_and_can_be_queued(db_session, test_user):
    service = TestService()
    request = await service.create_request(
        db_session,
        test_user,
        {"title": "登录回归", "catalog": "登录", "expected_effect": "登录成功", "current_behavior": "偶发失败"},
    )
    assert request.status == "submitted"
    await service.transition(db_session, request, test_user, "queued")
    assert request.status == "queued"


@pytest.mark.asyncio
async def test_only_tester_can_be_assigned_and_submit_result(db_session, test_user):
    tester = User(id="tester-001", username="tester", email="tester@example.com", password_hash="x", display_name="Tester", role="member")
    db_session.add(tester)
    db_session.add(UserProjectRole(user_id=tester.id, role="tester"))
    await db_session.flush()
    service = TestService()
    request = await service.create_request(db_session, test_user, {"title": "测试"})
    await service.assign(db_session, request, test_user, tester.id)
    assert request.status == "queued"
    await service.transition(db_session, request, tester, "testing")
    run = await service.submit_run(db_session, request, tester, {"version": "1.2.3", "method": "回归", "steps": "登录", "result": "通过", "report": "## 报告\n通过", "status": "passed"})
    assert request.status == "passed"
    assert run.version == "1.2.3"


@pytest.mark.asyncio
async def test_reject_requires_reason(db_session, test_user):
    service = TestService()
    request = await service.create_request(db_session, test_user, {"title": "测试"})
    with pytest.raises(ValueError, match="reason"):
        await service.reject(db_session, request, test_user, "")


@pytest.mark.asyncio
async def test_completed_cancelled_and_rejected_requests_can_be_reopened(db_session, test_user):
    from sqlalchemy import select

    from app.models.test import TestRun, TestStatusHistory

    tester = User(id="retest-user", username="retester", email="retest@example.com", password_hash="x", display_name="Tester", role="member")
    db_session.add(tester)
    db_session.add(UserProjectRole(user_id=tester.id, role="tester"))
    await db_session.flush()
    service = TestService()
    request = await service.create_request(db_session, test_user, {"title": "Retest"})
    await service.assign(db_session, request, test_user, tester.id)
    await service.transition(db_session, request, tester, "testing")
    run = await service.submit_run(db_session, request, tester, {"status": "passed", "version": "1.0", "method": "回归", "steps": "1. 登录", "result": "## 结果\n通过", "report": "## 报告\n通过"})
    await service.transition(db_session, request, test_user, "queued", "新版本回归")
    assert request.status == "queued"
    assert await db_session.get(TestRun, run.id) is not None
    await service.transition(db_session, request, tester, "testing")
    await service.transition(db_session, request, tester, "cancelled", "环境故障")
    await service.transition(db_session, request, test_user, "submitted", "变更范围")
    await service.reject(db_session, request, test_user, "范围待确认")
    await service.transition(db_session, request, test_user, "submitted", "已确认")
    histories = (await db_session.execute(select(TestStatusHistory).where(TestStatusHistory.request_id == request.id))).scalars().all()
    assert any(h.from_status == "passed" and h.to_status == "queued" and h.reason == "新版本回归" for h in histories)


@pytest.mark.asyncio
async def test_unrelated_user_cannot_change_status(db_session, test_user):
    service = TestService()
    request = await service.create_request(db_session, test_user, {"title": "权限"})
    stranger = User(id="stranger", username="stranger", email="stranger@example.com", password_hash="x", role="member")
    db_session.add(stranger)
    await db_session.flush()
    with pytest.raises(PermissionError):
        await service.transition(db_session, request, stranger, "queued")


@pytest.mark.asyncio
async def test_reassign_queued_and_testing_requests_records_change(db_session, test_user):
    from sqlalchemy import select

    from app.models.test import TestStatusHistory

    tester = User(id="assign-user", username="assigner", email="assign@example.com", password_hash="x", role="member")
    db_session.add(tester)
    db_session.add(UserProjectRole(user_id=tester.id, role="tester"))
    await db_session.flush()
    service = TestService()
    request = await service.create_request(db_session, test_user, {"title": "重新分配"})
    await service.assign(db_session, request, test_user, tester.id)
    await service.assign(db_session, request, test_user, tester.id)
    await service.transition(db_session, request, test_user, "testing")
    await service.assign(db_session, request, test_user, tester.id)
    assert request.status == "queued"
    records = (await db_session.execute(select(TestStatusHistory).where(TestStatusHistory.request_id == request.id))).scalars().all()
    assert any(h.from_status == "queued" and h.to_status == "queued" for h in records)
    assert any(h.from_status == "testing" and h.to_status == "queued" for h in records)


@pytest.mark.asyncio
async def test_start_requires_assignee_and_status_cannot_bypass_result_submission(db_session, test_user):
    service = TestService()
    request = await service.create_request(db_session, test_user, {"title": "验证状态约束"})
    await service.transition(db_session, request, test_user, "queued")
    with pytest.raises(ValueError):
        await service.transition(db_session, request, test_user, "testing")
    for target in ("passed", "failed", "unknown"):
        with pytest.raises(ValueError):
            await service.transition(db_session, request, test_user, target)


@pytest.mark.asyncio
async def test_manager_who_starts_can_finish_with_markdown_report(db_session, test_user):
    tester = User(id="finish-tester", username="finisher", email="finish@example.com", password_hash="x", role="member")
    db_session.add(tester)
    db_session.add(UserProjectRole(user_id=tester.id, role="tester"))
    await db_session.flush()
    service = TestService()
    request = await service.create_request(db_session, test_user, {"title": "完整流程", "objective": "## 目标\n验证登录"})
    await service.assign(db_session, request, test_user, tester.id)
    await service.transition(db_session, request, test_user, "testing")
    assert (await service.actions(db_session, request, test_user))["can_submit_run"] is True
    data = {"status": "passed", "version": "2.0", "method": "## 手工回归", "steps": "1. 登录", "result": "**通过**", "report": "## 测试报告\n全部用例通过"}
    run = await service.submit_run(db_session, request, test_user, data)
    assert request.status == "passed"
    assert request.objective == "## 目标\n验证登录"
    assert run.report == data["report"]
    assert run.tester_id == test_user.id


@pytest.mark.asyncio
async def test_finishing_requires_complete_report_before_changing_state(db_session, test_user):
    tester = User(id="required-tester", username="requiredtester", email="required@example.com", password_hash="x", role="member")
    db_session.add(tester)
    db_session.add(UserProjectRole(user_id=tester.id, role="tester"))
    await db_session.flush()
    service = TestService()
    request = await service.create_request(db_session, test_user, {"title": "报告必填"})
    await service.assign(db_session, request, test_user, tester.id)
    await service.transition(db_session, request, tester, "testing")
    valid = {"status": "failed", "version": "2.0", "method": "手工回归", "steps": "1. 登录", "result": "登录失败", "report": "## 报告\n存在阻塞问题"}
    for field in ("version", "method", "steps", "result", "report"):
        with pytest.raises(ValueError, match="required"):
            await service.submit_run(db_session, request, tester, {**valid, field: "  "})
        assert request.status == "testing"


@pytest.mark.asyncio
async def test_multiple_reports_can_be_added_without_reopening_request(db_session, test_user):
    from sqlalchemy import select

    from app.models.test import TestRun

    tester = User(id="multi-tester", username="multi", email="multi@example.com", password_hash="x", role="member")
    db_session.add(tester)
    db_session.add(UserProjectRole(user_id=tester.id, role="tester"))
    await db_session.flush()
    service = TestService()
    request = await service.create_request(db_session, test_user, {"title": "多份报告"})
    await service.assign(db_session, request, test_user, tester.id)
    await service.transition(db_session, request, tester, "testing")
    base = {"version": "1.0", "method": "回归", "steps": "1. 登录", "result": "通过", "report": "## 第一份报告", "status": "passed"}
    first = await service.submit_run(db_session, request, tester, base)
    assert (await service.actions(db_session, request, tester))["can_submit_run"] is True
    second = await service.submit_run(db_session, request, tester, {**base, "status": "failed", "report": "## 第二份报告", "result": "发现问题"})
    third = await service.submit_run(db_session, request, test_user, {**base, "version": "1.1", "report": "## 第三份报告"})
    assert request.status == "passed"
    rows = (await db_session.execute(select(TestRun).where(TestRun.request_id == request.id))).scalars().all()
    assert len(rows) == 3
    assert {row.id for row in rows} == {first.id, second.id, third.id}
    assert (await db_session.get(TestRun, first.id)).report == "## 第一份报告"
    await service.transition(db_session, request, test_user, "submitted")
    assert (await service.actions(db_session, request, tester))["can_submit_run"] is False
    with pytest.raises(ValueError):
        await service.submit_run(db_session, request, tester, base)

@pytest.mark.asyncio
async def test_appending_same_conclusion_updates_request_and_rejects_stale_submission(db_session, test_user):
    from sqlalchemy.ext.asyncio import AsyncSession

    from app.models.test import TestRequest

    service = TestService()
    tester = User(id="stale-tester", username="stale", email="stale@example.com", password_hash="x", role="member")
    db_session.add_all([tester, UserProjectRole(user_id=tester.id, role="tester")])
    await db_session.flush()
    request = await service.create_request(db_session, test_user, {"title": "并发追加"})
    await service.assign(db_session, request, test_user, tester.id)
    await service.transition(db_session, request, tester, "testing")
    data = {"version": "1", "method": "回归", "steps": "登录", "result": "通过", "report": "报告", "status": "passed"}
    await service.submit_run(db_session, request, tester, data)
    before = request.updated_at
    async with AsyncSession(bind=db_session.bind, expire_on_commit=False) as other:
        stale = await other.get(TestRequest, request.id)
        await service.submit_run(db_session, request, tester, data)
        assert request.updated_at > before
        with pytest.raises(ValueError, match="changed"):
            await service.submit_run(other, stale, test_user, {**data, "status": "failed"})
    await db_session.refresh(request)
    assert request.status == "passed"
