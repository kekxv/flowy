from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class PaginationParams:
    def __init__(
        self,
        page: int = 1,
        per_page: int = 20,
        sort: str = "-created_at",
    ):
        self.page = max(1, page)
        self.per_page = min(max(1, per_page), 100)
        self.sort = sort
        self.order_by, self.order_desc = self._parse_sort(sort)

    @staticmethod
    def _parse_sort(sort: str) -> tuple[str, bool]:
        desc = sort.startswith("-")
        field = sort[1:] if desc else sort
        allowed = {"created_at", "updated_at", "priority", "status", "title"}
        if field not in allowed:
            field = "created_at"
        return field, desc

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.per_page


class PaginatedResponse(BaseModel):
    data: list[Any]
    meta: dict


def paginated_response(data: list[Any], total: int, pagination: PaginationParams) -> dict:
    return {
        "data": data,
        "meta": {
            "page": pagination.page,
            "per_page": pagination.per_page,
            "total": total,
        },
    }
