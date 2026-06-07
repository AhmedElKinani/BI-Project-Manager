"""normalize_supporting_tables

Revision ID: 006_supporting_tables
Revises: 005_projects_schema
Create Date: 2026-05-13 12:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '006_supporting_tables'
down_revision: Union[str, None] = '005_projects_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # author_id, user_fk, sender_id FK columns already exist from 000_initial_schema.
    # Kept as a placeholder to preserve the migration chain.
    pass

def downgrade() -> None:
    pass
