"""Phase 1.1 DB Updates

Revision ID: 009_phase_1_1
Revises: 008_project_streams
Create Date: 2026-05-16 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '009_phase_1_1'
down_revision: Union[str, None] = '008_project_streams'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('tasks', sa.Column('post_production', sa.Boolean(), server_default='0', nullable=False))
    
    # Backfill NULLs before setting nullable=False
    op.execute("UPDATE tasks SET project_id = 'UNASSIGNED' WHERE project_id IS NULL OR project_id = ''")
    op.execute("UPDATE tasks SET phase_id = 1 WHERE phase_id IS NULL")
    
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.alter_column('project_id',
               existing_type=sa.VARCHAR(),
               nullable=False)
        batch_op.alter_column('phase_id',
               existing_type=sa.INTEGER(),
               nullable=False)

def downgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.alter_column('phase_id',
               existing_type=sa.INTEGER(),
               nullable=True)
        batch_op.alter_column('project_id',
               existing_type=sa.VARCHAR(),
               nullable=True)
        batch_op.drop_column('post_production')
