"""add software component/version/dependency tables

Revision ID: e014
Revises: e013
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e014"
down_revision: str | None = "e013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "software_components",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("identifier", sa.String(length=128), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False, server_default="other"),
        sa.Column("icon_key", sa.String(length=16), nullable=False, server_default=""),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.String(length=32), nullable=False),
        sa.Column("updated_at", sa.String(length=32), nullable=False),
    )
    op.create_index("ix_software_components_identifier", "software_components", ["identifier"])
    op.create_index("ix_software_components_category", "software_components", ["category"])

    op.create_table(
        "software_versions",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "component_id",
            sa.String(length=36),
            sa.ForeignKey("software_components.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("version", sa.String(length=64), nullable=False),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("artifact_type", sa.String(length=16), nullable=False, server_default="none"),
        sa.Column("file_name", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("file_size", sa.Float(), nullable=False, server_default="0"),
        sa.Column("download_url", sa.Text(), nullable=False, server_default=""),
        sa.Column("stored_filename", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("published_at", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.String(length=32), nullable=False),
        sa.Column("updated_at", sa.String(length=32), nullable=False),
    )
    op.create_index("ix_software_versions_component_id", "software_versions", ["component_id"])

    op.create_table(
        "software_dependencies",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column(
            "version_id",
            sa.String(length=36),
            sa.ForeignKey("software_versions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="external"),
        sa.Column("name", sa.String(length=128), nullable=False, server_default=""),
        sa.Column(
            "target_component_id",
            sa.String(length=36),
            sa.ForeignKey("software_components.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("constraint", sa.String(length=64), nullable=False, server_default=""),
    )
    op.create_index("ix_software_dependencies_version_id", "software_dependencies", ["version_id"])


def downgrade() -> None:
    op.drop_table("software_dependencies")
    op.drop_table("software_versions")
    op.drop_table("software_components")
