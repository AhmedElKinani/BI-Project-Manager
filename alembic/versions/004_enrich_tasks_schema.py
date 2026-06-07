"""enrich_tasks_schema

Revision ID: 004_tasks_schema
Revises: 003_user_teams
Create Date: 2026-05-13 12:03:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '004_tasks_schema'
down_revision: Union[str, None] = '003_user_teams'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add columns to tasks
    op.add_column('tasks', sa.Column('priority', sa.Text(), server_default='medium', nullable=False))
    op.add_column('tasks', sa.Column('estimated_hours', sa.Float(), nullable=True))
    op.add_column('tasks', sa.Column('actual_hours', sa.Float(), nullable=True))
    op.add_column('tasks', sa.Column('is_blocked', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('tasks', sa.Column('blocked_reason', sa.Text(), nullable=True))
    
    op.add_column('tasks', sa.Column('phase_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_tasks_phase_id', 'tasks', 'phases', ['phase_id'], ['id'], ondelete='SET NULL')
    
    op.add_column('tasks', sa.Column('team_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_tasks_team_id', 'tasks', 'teams', ['team_id'], ['id'], ondelete='SET NULL')
    
    op.add_column('tasks', sa.Column('assignee_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_tasks_assignee_id', 'tasks', 'users', ['assignee_id'], ['id'], ondelete='SET NULL')
    
    op.add_column('tasks', sa.Column('created_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_tasks_created_by_id', 'tasks', 'users', ['created_by_id'], ['id'], ondelete='SET NULL')
    
    op.add_column('tasks', sa.Column('completed_by_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_tasks_completed_by_id', 'tasks', 'users', ['completed_by_id'], ['id'], ondelete='SET NULL')

    # 2. task_state_logs
    op.create_table(
        'task_state_logs',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('task_id', sa.Integer(), nullable=False),
        sa.Column('from_state', sa.Text(), nullable=True),
        sa.Column('to_state', sa.Text(), nullable=False),
        sa.Column('actor_id', sa.Integer(), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('entered_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('exited_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['task_id'], ['tasks.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_state_logs_task', 'task_state_logs', ['task_id'])
    op.create_index('idx_state_logs_state', 'task_state_logs', ['to_state'])

def downgrade() -> None:
    op.drop_index('idx_state_logs_state', table_name='task_state_logs')
    op.drop_index('idx_state_logs_task', table_name='task_state_logs')
    op.drop_table('task_state_logs')
    
    op.drop_constraint('fk_tasks_completed_by_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'completed_by_id')
    op.drop_constraint('fk_tasks_created_by_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'created_by_id')
    op.drop_constraint('fk_tasks_assignee_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'assignee_id')
    op.drop_constraint('fk_tasks_team_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'team_id')
    op.drop_constraint('fk_tasks_phase_id', 'tasks', type_='foreignkey')
    op.drop_column('tasks', 'phase_id')
    
    op.drop_column('tasks', 'blocked_reason')
    op.drop_column('tasks', 'is_blocked')
    op.drop_column('tasks', 'actual_hours')
    op.drop_column('tasks', 'estimated_hours')
    op.drop_column('tasks', 'priority')
