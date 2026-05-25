from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.issue import Label
from app.models.user import User
from app.schemas.issue import LabelCreate, LabelResponse, LabelUpdate
from app.services import issue_service

router = APIRouter(prefix="/labels", tags=["labels"])


@router.get("", response_model=list[LabelResponse])
async def list_labels(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    labels = await issue_service.get_labels(db)
    return [LabelResponse.model_validate(l) for l in labels]


@router.post("", response_model=LabelResponse, status_code=status.HTTP_201_CREATED)
async def create_label(
    data: LabelCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    label = await issue_service.create_label(db, data.name, data.color, data.description)
    return LabelResponse.model_validate(label)


@router.put("/{label_id}", response_model=LabelResponse)
async def update_label(
    label_id: str,
    data: LabelUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    label = await db.get(Label, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    label = await issue_service.update_label(
        db, label, data.name, data.color, data.description
    )
    return LabelResponse.model_validate(label)


@router.delete("/{label_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_label(
    label_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    label = await db.get(Label, label_id)
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")
    await issue_service.delete_label(db, label)
