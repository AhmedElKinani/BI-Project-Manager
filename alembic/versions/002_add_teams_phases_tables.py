"""add_teams_phases_tables

Revision ID: 002_teams_phases
Revises: 001_roles_perms
Create Date: 2026-05-13 12:01:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '002_teams_phases'
down_revision: Union[str, None] = '001_roles_perms'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. teams table
    op.create_table(
        'teams',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('color', sa.Text(), server_default='#6366f1', nullable=False),
        sa.Column('is_active', sa.Integer(), server_default='1', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    # 2. phases table
    op.create_table(
        'phases',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('display_order', sa.Integer(), server_default='0', nullable=False),
        sa.Column('color_class', sa.Text(), server_default='color-dep', nullable=False),
        sa.Column('is_terminal', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('is_active', sa.Integer(), server_default='1', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )

    # 3. team_phases table
    op.create_table(
        'team_phases',
        sa.Column('team_id', sa.Integer(), nullable=False),
        sa.Column('phase_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['phase_id'], ['phases.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('team_id', 'phase_id')
    )

def downgrade() -> None:
    op.drop_table('team_phases')
    op.drop_table('phases')
    op.drop_table('teams')
