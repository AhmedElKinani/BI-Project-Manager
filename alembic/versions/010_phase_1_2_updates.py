"""Phase 1.2 DB Updates

Revision ID: 010_phase_1_2
Revises: 009_phase_1_1
Create Date: 2026-05-16 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '010_phase_1_2'
down_revision: Union[str, None] = '009_phase_1_1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('projects', sa.Column('is_launched', sa.Boolean(), server_default='0', nullable=False))

def downgrade() -> None:
    with op.batch_alter_table('projects', schema=None) as batch_op:
        batch_op.drop_column('is_launched')
