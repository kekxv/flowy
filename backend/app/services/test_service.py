from datetime import datetime
from uuid import uuid4

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.test import TestRequest, TestRun, TestStatusHistory
from app.models.tracking import UserProjectRole
from app.models.user import User


class TestService:
    async def create_request(self, db: AsyncSession, user: User, data: dict) -> TestRequest:
        title = (data.get("title") or "").strip()
        if not title:
            raise ValueError("title is required")
        request = TestRequest(id=str(uuid4()), reporter_id=user.id, title=title, objective=data.get("objective", data.get("catalog", "")), expected_effect=data.get("expected_effect", ""), current_behavior=data.get("current_behavior", ""), issue_id=data.get("issue_id"))
        db.add(request)
        await db.flush()
        await self._history(db, request, "", "submitted", user.id)
        await db.commit()
        await db.refresh(request)
        return request

    async def _history(self, db, request, old, new, user_id, reason=""):
        db.add(TestStatusHistory(request_id=request.id, from_status=old, to_status=new, changed_by=user_id, reason=reason))

    async def _is_tester(self, db, user_id: str) -> bool:
        return bool(await db.scalar(select(UserProjectRole).where(UserProjectRole.user_id == user_id, UserProjectRole.role == "tester")))

    async def can_manage(self, db, request, actor):
        return actor.role == "admin" or actor.id == request.reporter_id or bool(await db.scalar(select(UserProjectRole).where(UserProjectRole.user_id == actor.id, UserProjectRole.role == "project_lead")))

    async def actions(self, db, request, actor):
        manager = await self.can_manage(db, request, actor)
        tester = request.tester_id == actor.id and await self._is_tester(db, actor.id)
        allowed = {
            "submitted": ["queued", "rejected", "cancelled"],
            "queued": ["testing", "submitted", "cancelled"],
            "testing": ["queued", "submitted", "cancelled"],
            "passed": ["queued", "submitted"],
            "failed": ["queued", "testing", "submitted", "cancelled"],
            "cancelled": ["submitted", "queued"],
            "rejected": ["submitted"],
        }
        transitions = []
        for target in allowed.get(request.status, []):
            if target == "testing":
                permitted = bool(request.tester_id) and (manager or tester)
            elif target in ("rejected", "submitted") or request.status == "submitted":
                permitted = manager
            else:
                permitted = manager or tester
            if permitted:
                transitions.append(target)
        return {"available_transitions": transitions, "can_assign": manager and request.status in ("submitted", "queued", "testing"), "can_submit_run": bool(request.tester_id) and bool(manager or tester) and request.status in ("testing", "passed", "failed")}

    async def assign(self, db: AsyncSession, request: TestRequest, actor: User, tester_id: str):
        actions = await self.actions(db, request, actor)
        if not actions["can_assign"]:
            raise PermissionError("not allowed to assign in this state")
        if not await self._is_tester(db, tester_id):
            raise ValueError("user is not a tester")
        old_tester = request.tester_id
        request.tester_id = tester_id
        if request.status == "queued":
            await self._history(db, request, "queued", "queued", actor.id, f"重新分配测试人员：{old_tester or '未分配'} -> {tester_id}")
            await db.commit()
        else:
            await self.transition(db, request, actor, "queued", "审核通过并分配" if request.status == "submitted" else "变更测试人员，重新排队")
        await db.refresh(request)
        return request

    async def transition(self, db: AsyncSession, request: TestRequest, actor: User, status: str, reason=""):
        if not await self.can_manage(db, request, actor) and not (request.tester_id == actor.id and await self._is_tester(db, actor.id)):
            raise PermissionError("not allowed to change this request")
        if status not in (await self.actions(db, request, actor))["available_transitions"]:
            raise ValueError(f"invalid transition: {request.status} -> {status}")
        if status == "rejected" and not reason.strip():
            raise ValueError("reason is required")
        old = request.status
        request.status = status
        request.rejection_reason = reason if status == "rejected" else ""
        await self._history(db, request, old, status, actor.id, reason)
        await db.commit()
        return request

    async def reject(self, db, request, actor, reason):
        return await self.transition(db, request, actor, "rejected", reason)

    async def submit_run(self, db: AsyncSession, request: TestRequest, tester: User, data: dict) -> TestRun:
        if not await self.can_manage(db, request, tester) and not (request.tester_id == tester.id and await self._is_tester(db, tester.id)):
            raise PermissionError("not allowed to finish this test")
        if request.status not in ("testing", "passed", "failed") or not request.tester_id:
            raise ValueError("request is not testing")
        status = data.get("status")
        if status not in ("passed", "failed"):
            raise ValueError("run status must be passed or failed")
        for field in ("version", "method", "steps", "result", "report"):
            if not (data.get(field) or "").strip():
                raise ValueError(f"{field} is required")
        # Claim the version read by this session so concurrent reports cannot
        # overwrite a newer conclusion or record an incorrect previous state.
        old = request.status
        now = datetime.now().isoformat()
        changed = await db.execute(
            update(TestRequest)
            .where(TestRequest.id == request.id, TestRequest.status == old,
                   TestRequest.updated_at == request.updated_at,
                   TestRequest.tester_id == request.tester_id)
            .values(status=status, updated_at=now)
            .execution_options(synchronize_session=False)
        )
        if changed.rowcount != 1:
            await db.rollback()
            raise ValueError("request changed; refresh before submitting the report")
        run = TestRun(id=str(uuid4()), request_id=request.id, tester_id=tester.id, status=status, version=data.get("version", ""), method=data.get("method", ""), server_url=data.get("server_url", ""), steps=data.get("steps", ""), result=data.get("result", ""), report=data["report"], created_at=now)
        db.add(run)
        await self._history(db, request, old, status, tester.id, f"提交测试报告 · {run.version}")
        await db.commit()
        await db.refresh(request)
        await db.refresh(run)
        return run

    async def stats(self, db: AsyncSession) -> dict:
        rows = (await db.execute(select(TestRequest.status, func.count(TestRequest.id)).group_by(TestRequest.status))).all()
        by_status = dict(rows)
        total = sum(by_status.values())
        return {"total": total, "by_status": by_status, "active": sum(by_status.get(s, 0) for s in ("submitted", "queued", "testing")), "success_rate": round(by_status.get("passed", 0) / total * 100) if total else 0}
