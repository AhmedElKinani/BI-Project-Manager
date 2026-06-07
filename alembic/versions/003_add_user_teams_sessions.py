"""add_user_teams_sessions

Revision ID: 003_user_teams
Revises: 002_teams_phases
Create Date: 2026-05-13 12:02:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '003_user_teams'
down_revision: Union[str, None] = '002_teams_phases'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. user_teams table
    op.create_table(
        'user_teams',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('team_id', sa.Integer(), nullable=False),
        sa.Column('is_primary', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('joined_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['team_id'], ['teams.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'team_id')
    )

    # 2. sessions table
    op.create_table(
        'sessions',
        sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('token_hash', sa.Text(), nullable=False),
        sa.Column('issued_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash')
    )
    op.create_index('idx_sessions_token', 'sessions', ['token_hash'])

    # 3. Add columns to users
    op.add_column('users', sa.Column('role_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_users_role_id', 'users', 'roles', ['role_id'], ['id'], ondelete='SET NULL')
    
    op.add_column('users', sa.Column('is_active', sa.Integer(), server_default='1', nullable=False))
    op.add_column('users', sa.Column('needs_rehash', sa.Boolean(), server_default='true', nullable=False))

def downgrade() -> None:
    op.drop_column('users', 'needs_rehash')
    op.drop_column('users', 'is_active')
    op.drop_constraint('fk_users_role_id', 'users', type_='foreignkey')
    op.drop_column('users', 'role_id')
    op.drop_index('idx_sessions_token', table_name='sessions')
    op.drop_table('sessions')
    op.drop_table('user_teams')
