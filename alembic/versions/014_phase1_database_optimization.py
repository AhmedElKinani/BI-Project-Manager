"""Database Optimization and Phase 1 Schema Upgrades

Revision ID: 014_phase1_database_optimization
Revises: 013_dash_shortcuts
Create Date: 2026-05-24 14:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '014_phase1_database_optimization'
down_revision: Union[str, None] = '013_dash_shortcuts'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Add description to roles table
    op.add_column('roles', sa.Column('description', sa.Text(), nullable=True))
    
    # 2. Add updated_at to roles, teams, and phases tables
    op.add_column('roles', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True))
    op.add_column('teams', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True))
    op.add_column('phases', sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=True))

    # 3. Create indices on foreign keys to optimize PostgreSQL performance
    op.create_index('idx_tasks_project_id', 'tasks', ['project_id'])
    op.create_index('idx_tasks_assignee_id', 'tasks', ['assignee_id'])
    op.create_index('idx_tasks_team_id', 'tasks', ['team_id'])
    op.create_index('idx_tasks_phase_id', 'tasks', ['phase_id'])
    op.create_index('idx_history_project_id', 'history', ['project_id'])
    op.create_index('idx_task_comments_task_id', 'task_comments', ['task_id'])
    op.create_index('idx_notifications_user_fk', 'notifications', ['user_fk'])
    op.create_index('idx_project_streams_project_id', 'project_streams', ['project_id'])
    op.create_index('idx_published_shortcuts_team_id', 'published_shortcuts', ['team_id'])

def downgrade() -> None:
    # Drop indices
    op.drop_index('idx_published_shortcuts_team_id', table_name='published_shortcuts')
    op.drop_index('idx_project_streams_project_id', table_name='project_streams')
    op.drop_index('idx_notifications_user_fk', table_name='notifications')
    op.drop_index('idx_task_comments_task_id', table_name='task_comments')
    op.drop_index('idx_history_project_id', table_name='history')
    op.drop_index('idx_tasks_phase_id', table_name='tasks')
    op.drop_index('idx_tasks_team_id', table_name='tasks')
    op.drop_index('idx_tasks_assignee_id', table_name='tasks')
    op.drop_index('idx_tasks_project_id', table_name='tasks')

    # Drop columns
    op.drop_column('phases', 'updated_at')
    op.drop_column('teams', 'updated_at')
    op.drop_column('roles', 'updated_at')
    op.drop_column('roles', 'description')
