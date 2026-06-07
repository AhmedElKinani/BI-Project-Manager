"""Add project snapshots table and columns

Revision ID: 017_project_snapshots
Revises: 016_system_settings
Create Date: 2026-06-06 13:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '017_project_snapshots'
down_revision: Union[str, None] = '016_system_settings'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Create project_snapshots table
    op.create_table(
        'project_snapshots',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('project_id', sa.String(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('phase_name', sa.Text(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('deliverables', sa.Text(), nullable=True),
        sa.Column('completed_at', sa.String(), nullable=True),
        sa.Column('completed_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.String(), nullable=True)
    )
    
    # Add actual_end_date and launch_note columns to projects table
    op.add_column('projects', sa.Column('actual_end_date', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('launch_note', sa.Text(), nullable=True))

def downgrade() -> None:
    op.drop_column('projects', 'launch_note')
    op.drop_column('projects', 'actual_end_date')
    op.drop_table('project_snapshots')
