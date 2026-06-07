"""add_project_streams

Revision ID: 008_project_streams
Revises: 007_backfill_fk
Create Date: 2026-05-14 13:23:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '008_project_streams'
down_revision: Union[str, None] = '007_backfill_fk'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.create_table(
        'project_streams',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('phase_name', sa.Text(), nullable=False),
        sa.Column('team_name', sa.Text(), nullable=False),
        sa.Column('status', sa.Text(), server_default='active', nullable=False),
        sa.Column('progress', sa.Integer(), server_default='0', nullable=False),
        sa.Column('started_at', sa.String(), nullable=True),
        sa.Column('completed_at', sa.String(), nullable=True),
        sa.Column('completed_by', sa.String(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], name='fk_project_streams_project_id', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'phase_name', 'team_name', name='uq_project_streams_proj_phase_team')
    )

def downgrade() -> None:
    op.drop_table('project_streams')
