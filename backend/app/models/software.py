import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _now() -> str:
    return datetime.now().isoformat()


class SoftwareComponent(Base):
    """A software component (web console, api service, mobile app, engine, ...)."""

    __tablename__ = "software_components"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    identifier: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    # frontend / backend / mobile / engine / other
    category: Mapped[str] = mapped_column(String(32), default="other", index=True)
    # Short badge abbreviation used on the card, e.g. "Web", "API", "App", "Eng"
    icon_key: Mapped[str] = mapped_column(String(16), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(String(32), default=_now)
    updated_at: Mapped[str] = mapped_column(String(32), default=_now, onupdate=_now)

    versions: Mapped[list["SoftwareVersion"]] = relationship(
        "SoftwareVersion",
        back_populates="component",
        cascade="all, delete-orphan",
        order_by="SoftwareVersion.published_at.desc()",
    )


class SoftwareVersion(Base):
    """A published version / release of a software component."""

    __tablename__ = "software_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    component_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("software_components.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    version: Mapped[str] = mapped_column(String(64), nullable=False)
    note: Mapped[str] = mapped_column(Text, default="")  # 最新说明
    # file (uploaded artifact) / url (external download path) / none (缺省)
    artifact_type: Mapped[str] = mapped_column(String(16), default="none")
    file_name: Mapped[str] = mapped_column(String(255), default="")
    file_size: Mapped[float] = mapped_column(Float, default=0.0)  # in MB
    download_url: Mapped[str] = mapped_column(Text, default="")
    stored_filename: Mapped[str] = mapped_column(String(255), default="")
    published_at: Mapped[str] = mapped_column(String(32), default=_now)
    created_at: Mapped[str] = mapped_column(String(32), default=_now)
    updated_at: Mapped[str] = mapped_column(String(32), default=_now, onupdate=_now)

    component: Mapped["SoftwareComponent"] = relationship("SoftwareComponent", back_populates="versions")
    dependencies: Mapped[list["SoftwareDependency"]] = relationship(
        "SoftwareDependency", back_populates="version", cascade="all, delete-orphan"
    )


class SoftwareDependency(Base):
    """A dependency declared by a software version (internal or external)."""

    __tablename__ = "software_dependencies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    version_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("software_versions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # internal (another managed component) / external (third-party) / runtime
    kind: Mapped[str] = mapped_column(String(16), default="external")
    name: Mapped[str] = mapped_column(String(128), default="")  # display name, e.g. "Node.js"
    target_component_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("software_components.id", ondelete="SET NULL"),
        nullable=True,
    )
    constraint: Mapped[str] = mapped_column(String(64), default="")  # e.g. ">= v2.4.0", ">= 18.x"

    version: Mapped["SoftwareVersion"] = relationship("SoftwareVersion", back_populates="dependencies")
    target_component: Mapped["SoftwareComponent | None"] = relationship(
        "SoftwareComponent", foreign_keys=[target_component_id]
    )
