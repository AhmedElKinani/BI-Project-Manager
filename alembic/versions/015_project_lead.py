"""Add project lead and phase comments

Revision ID: 015_project_lead
Revises: 014_phase1_database_optimization
Create Date: 2026-06-05 15:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '015_project_lead'
down_revision: Union[str, None] = '014_phase1_database_optimization'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Add project_lead_id to projects
    op.add_column('projects', sa.Column('project_lead_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
    
    # Create phase_comments table
    op.create_table(
        'phase_comments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('project_id', sa.String(), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('phase_name', sa.Text(), nullable=False),
        sa.Column('author_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('submitted_by', sa.Text(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.String(), nullable=True)
    )
    
    # Create index
    op.create_index('idx_phase_comments_project_id', 'phase_comments', ['project_id'])

def downgrade() -> None:
    op.drop_index('idx_phase_comments_project_id', table_name='phase_comments')
    op.drop_table('phase_comments')
    op.drop_column('projects', 'project_lead_id')
