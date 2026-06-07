"""Add system settings table

Revision ID: 016_system_settings
Revises: 015_project_lead
Create Date: 2026-06-05 16:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '016_system_settings'
down_revision: Union[str, None] = '015_project_lead'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Create system_settings table
    op.create_table(
        'system_settings',
        sa.Column('key', sa.String(), primary_key=True),
        sa.Column('value', sa.Text(), nullable=False)
    )
    
    # Insert default app name setting
    op.execute("INSERT INTO system_settings (key, value) VALUES ('app_name', 'BI Project Manager')")

def downgrade() -> None:
    op.drop_table('system_settings')
