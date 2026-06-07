"""initial_schema

Revision ID: 000_initial
Revises:
Create Date: 2026-05-13 11:00:00.000000

Creates all base tables that existed before Alembic was introduced:
users, projects, tasks, history, task_comments, audit_logs, notifications, messages.
The later numbered migrations (001+) add columns/tables on top of this base.
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '000_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # users — base columns only; 003 adds role_id, is_active, needs_rehash
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('username', sa.String(), nullable=False),
        sa.Column('password', sa.String(), nullable=False),
        sa.Column('role', sa.String()),
        sa.Column('team', sa.String()),
        sa.UniqueConstraint('username'),
    )
    op.create_index('ix_users_id', 'users', ['id'])
    op.create_index('ix_users_username', 'users', ['username'])

    # projects — base columns only; 005 adds FK columns
    op.create_table(
        'projects',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('title', sa.String()),
        sa.Column('description', sa.Text()),
        sa.Column('phase', sa.String()),
        sa.Column('team', sa.String()),
        sa.Column('assignee', sa.String()),
        sa.Column('progress', sa.Integer()),
        sa.Column('blockers', sa.Text()),
        sa.Column('nextStep', sa.Text()),
        sa.Column('start_date', sa.String()),
        sa.Column('target_date', sa.String()),
        sa.Column('is_deployed', sa.Integer(), server_default='0'),
        sa.Column('iteration', sa.Integer(), server_default='1'),
        sa.Column('is_iterating', sa.Integer(), server_default='0'),
        sa.Column('short_description', sa.Text()),
        sa.Column('full_description', sa.Text()),
        sa.Column('stakeholders', sa.Text()),
        sa.Column('status', sa.Text(), server_default='active', nullable=False),
    )
    op.create_index('ix_projects_id', 'projects', ['id'])

    # tasks — base columns only; 004 adds priority, hours, is_blocked, FK cols
    op.create_table(
        'tasks',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('project_id', sa.String(), sa.ForeignKey('projects.id', ondelete='CASCADE')),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text()),
        sa.Column('crisp_dm_phase', sa.String()),
        sa.Column('assignee', sa.String()),
        sa.Column('team', sa.String()),
        sa.Column('created_by', sa.String()),
        sa.Column('completed_by', sa.String()),
        sa.Column('status', sa.String(), server_default='todo'),
        sa.Column('created_at', sa.String()),
        sa.Column('approval_status', sa.String(), server_default='approved'),
        sa.Column('acceptance_status', sa.String(), server_default='pending_acceptance'),
        sa.Column('start_date', sa.String()),
        sa.Column('due_date', sa.String()),
        sa.Column('resolution_note', sa.Text()),
        sa.Column('resolved_at', sa.String()),
        sa.Column('accepted_at', sa.String()),
    )
    op.create_index('ix_tasks_id', 'tasks', ['id'])

    # history
    op.create_table(
        'history',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('project_id', sa.String(), sa.ForeignKey('projects.id', ondelete='CASCADE')),
        sa.Column('date', sa.String()),
        sa.Column('phase', sa.String()),
        sa.Column('status', sa.String()),
        sa.Column('note', sa.Text()),
        sa.Column('actor', sa.Text()),
    )
    op.create_index('ix_history_id', 'history', ['id'])

    # task_comments
    op.create_table(
        'task_comments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('task_id', sa.Integer(), sa.ForeignKey('tasks.id', ondelete='CASCADE')),
        sa.Column('author', sa.String()),
        sa.Column('author_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('content', sa.Text()),
        sa.Column('created_at', sa.String()),
    )
    op.create_index('ix_task_comments_id', 'task_comments', ['id'])

    # audit_logs
    op.create_table(
        'audit_logs',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('timestamp', sa.String()),
        sa.Column('username', sa.String()),
        sa.Column('user_role', sa.String()),
        sa.Column('action', sa.String()),
        sa.Column('details', sa.Text()),
    )

    # notifications
    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.String()),
        sa.Column('user_fk', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
        sa.Column('message', sa.Text()),
        sa.Column('is_read', sa.Integer(), server_default='0'),
        sa.Column('created_at', sa.String()),
        sa.Column('related_task_id', sa.Integer()),
    )

    # messages
    op.create_table(
        'messages',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('channel_name', sa.String()),
        sa.Column('sender', sa.String()),
        sa.Column('sender_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True),
        sa.Column('content', sa.Text()),
        sa.Column('timestamp', sa.String()),
    )
    op.create_index('ix_messages_channel_name', 'messages', ['channel_name'])


def downgrade() -> None:
    op.drop_index('ix_messages_channel_name', table_name='messages')
    op.drop_table('messages')
    op.drop_table('notifications')
    op.drop_table('audit_logs')
    op.drop_index('ix_task_comments_id', table_name='task_comments')
    op.drop_table('task_comments')
    op.drop_index('ix_history_id', table_name='history')
    op.drop_table('history')
    op.drop_index('ix_tasks_id', table_name='tasks')
    op.drop_table('tasks')
    op.drop_index('ix_projects_id', table_name='projects')
    op.drop_table('projects')
    op.drop_index('ix_users_username', table_name='users')
    op.drop_index('ix_users_id', table_name='users')
    op.drop_table('users')
