"""Phase 1.3 DB Updates

Revision ID: 011_phase_1_3
Revises: 010_phase_1_2
Create Date: 2026-05-19 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '011_phase_1_3'
down_revision: Union[str, None] = '010_phase_1_2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('tasks', sa.Column('rejection_reason', sa.Text(), nullable=True))
    op.add_column('tasks', sa.Column('review_submitted_at', sa.String(), nullable=True))
    op.add_column('tasks', sa.Column('reviewed_by', sa.String(), nullable=True))
    op.add_column('tasks', sa.Column('review_accepted_at', sa.String(), nullable=True))

def downgrade() -> None:
    with op.batch_alter_table('tasks', schema=None) as batch_op:
        batch_op.drop_column('rejection_reason')
        batch_op.drop_column('review_submitted_at')
        batch_op.drop_column('reviewed_by')
        batch_op.drop_column('review_accepted_at')
