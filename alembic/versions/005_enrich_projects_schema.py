"""enrich_projects_schema

Revision ID: 005_projects_schema
Revises: 004_tasks_schema
Create Date: 2026-05-13 12:04:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '005_projects_schema'
down_revision: Union[str, None] = '004_tasks_schema'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # status and actor columns already exist from 000_initial_schema
    # Only add the FK columns that didn't exist in the base schema
    op.add_column('projects', sa.Column('phase_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_projects_phase_id', 'projects', 'phases', ['phase_id'], ['id'], ondelete='SET NULL')
    
    op.add_column('projects', sa.Column('team_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_projects_team_id', 'projects', 'teams', ['team_id'], ['id'], ondelete='SET NULL')
    
    op.add_column('projects', sa.Column('assignee_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_projects_assignee_id', 'projects', 'users', ['assignee_id'], ['id'], ondelete='SET NULL')

def downgrade() -> None:
    op.drop_constraint('fk_projects_assignee_id', 'projects', type_='foreignkey')
    op.drop_column('projects', 'assignee_id')
    op.drop_constraint('fk_projects_team_id', 'projects', type_='foreignkey')
    op.drop_column('projects', 'team_id')
    op.drop_constraint('fk_projects_phase_id', 'projects', type_='foreignkey')
    op.drop_column('projects', 'phase_id')
