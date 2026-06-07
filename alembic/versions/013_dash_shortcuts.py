"""Add dashboard config and published shortcuts

Revision ID: 013_dash_shortcuts
Revises: 012_remove_legacy_columns
Create Date: 2026-05-23 00:46:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '013_dash_shortcuts'
down_revision: Union[str, None] = '012_remove_legacy_columns'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Add dashboard_config to users table
    op.add_column('users', sa.Column('dashboard_config', sa.Text(), server_default='{}', nullable=False))
    
    # 2. Create published_shortcuts table
    op.create_table(
        'published_shortcuts',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('url', sa.Text(), nullable=False),
        sa.Column('icon', sa.Text(), server_default='fa-link', nullable=False),
        sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='CASCADE'), nullable=True),
        sa.Column('creator_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False)
    )

def downgrade() -> None:
    op.drop_table('published_shortcuts')
    op.drop_column('users', 'dashboard_config')
