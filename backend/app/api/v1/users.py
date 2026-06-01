from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.tracking import UserProjectRole
from app.models.user import User
from app.schemas.auth import UserResponse

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
async def list_users(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(select(User).order_by(User.created_at))
    return [
        {
            "id": u.id,
            "username": u.username,
            "email": u.email,
            "display_name": u.display_name,
            "role": u.role,
            "is_active": u.is_active,
            "avatar_url": u.avatar_url,
            "created_at": u.created_at,
        }
        for u in result.scalars().all()
    ]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if "role" in data and data["role"] in ("admin", "member"):
        user.role = data["role"]
    if "is_active" in data and isinstance(data["is_active"], bool):
        user.is_active = data["is_active"]
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


@router.get("/{user_id}/project-roles")
async def get_user_project_roles(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(select(UserProjectRole).where(UserProjectRole.user_id == user_id))
    return [r.role for r in result.scalars().all()]


@router.put("/{user_id}/project-roles")
async def set_user_project_roles(
    user_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    await db.execute(delete(UserProjectRole).where(UserProjectRole.user_id == user_id))
    for r in data.get("roles", []):
        db.add(UserProjectRole(user_id=user_id, role=r))
    await db.commit()
    return {"roles": data.get("roles", [])}
