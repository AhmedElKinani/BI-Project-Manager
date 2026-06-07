"""Remove legacy columns

Revision ID: 012_remove_legacy_columns
Revises: 011_phase_1_3
Create Date: 2026-05-20 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '012_remove_legacy_columns'
down_revision: Union[str, None] = '011_phase_1_3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. users table
    op.drop_column('users', 'role')
    op.drop_column('users', 'team')
    
    # 2. projects table
    op.drop_column('projects', 'phase')
    op.drop_column('projects', 'team')
    op.drop_column('projects', 'assignee')
    op.drop_column('projects', 'progress')
    
    # 3. tasks table
    op.drop_column('tasks', 'crisp_dm_phase')
    op.drop_column('tasks', 'assignee')
    op.drop_column('tasks', 'team')
    op.drop_column('tasks', 'created_by')
    op.drop_column('tasks', 'completed_by')
    
    # 4. task_comments table
    op.drop_column('task_comments', 'author')
    
    # 5. notifications table
    op.drop_column('notifications', 'user_id')
    
    # 6. messages table
    op.drop_column('messages', 'sender')

def downgrade() -> None:
    # 1. users table
    op.add_column('users', sa.Column('role', sa.String(), nullable=True))
    op.add_column('users', sa.Column('team', sa.String(), nullable=True))
    
    # 2. projects table
    op.add_column('projects', sa.Column('phase', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('team', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('assignee', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('progress', sa.Integer(), nullable=True))
    
    # 3. tasks table
    op.add_column('tasks', sa.Column('crisp_dm_phase', sa.String(), nullable=True))
    op.add_column('tasks', sa.Column('assignee', sa.String(), nullable=True))
    op.add_column('tasks', sa.Column('team', sa.String(), nullable=True))
    op.add_column('tasks', sa.Column('created_by', sa.String(), nullable=True))
    op.add_column('tasks', sa.Column('completed_by', sa.String(), nullable=True))
    
    # 4. task_comments table
    op.add_column('task_comments', sa.Column('author', sa.String(), nullable=True))
    
    # 5. notifications table
    op.add_column('notifications', sa.Column('user_id', sa.String(), nullable=True))
    
    # 6. messages table
    op.add_column('messages', sa.Column('sender', sa.String(), nullable=True))
