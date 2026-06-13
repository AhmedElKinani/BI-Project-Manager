"""Add category and deleted_at columns to notifications

Revision ID: 015_notification_category
Revises: 017_project_snapshots
Create Date: 2026-06-14 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '015_notification_category'
down_revision: Union[str, None] = '017_project_snapshots'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Add category column for notification tab filtering
    op.add_column('notifications', sa.Column(
        'category', sa.String(length=50), server_default='general', nullable=False
    ))
    # 2. Add deleted_at for soft-delete support
    op.add_column('notifications', sa.Column(
        'deleted_at', sa.String(), nullable=True
    ))

def downgrade() -> None:
    op.drop_column('notifications', 'deleted_at')
    op.drop_column('notifications', 'category')
