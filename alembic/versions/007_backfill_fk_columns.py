"""backfill_fk_columns

Revision ID: 007_backfill_fk
Revises: 006_supporting_tables
Create Date: 2026-05-13 12:06:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '007_backfill_fk'
down_revision: Union[str, None] = '006_supporting_tables'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Backfill users.role_id
    op.execute("""
      UPDATE users u
      SET role_id = r.id
      FROM roles r
      WHERE r.name = u.role
    """)

    # 2. Backfill user_teams
    op.execute("""
      INSERT INTO user_teams (user_id, team_id, is_primary)
      SELECT u.id, t.id, TRUE
      FROM users u
      JOIN teams t ON t.name = u.team
      ON CONFLICT DO NOTHING
    """)

    # 3. Backfill tasks.phase_id
    op.execute("""
      UPDATE tasks tk
      SET phase_id = p.id
      FROM phases p
      WHERE p.name = tk.crisp_dm_phase
    """)

    # 4. Backfill tasks.team_id
    op.execute("""
      UPDATE tasks tk
      SET team_id = t.id
      FROM teams t
      WHERE t.name = tk.team
    """)

    # 5. Backfill tasks.assignee_id
    op.execute("""
      UPDATE tasks tk
      SET assignee_id = u.id
      FROM users u
      WHERE u.username = tk.assignee
    """)

    # 6. Backfill projects.phase_id, team_id
    op.execute("""
      UPDATE projects p
      SET phase_id = ph.id
      FROM phases ph
      WHERE ph.name = p.phase
    """)
    op.execute("""
      UPDATE projects p
      SET team_id = t.id
      FROM teams t
      WHERE t.name = p.team
    """)
    op.execute("""
      UPDATE projects p
      SET assignee_id = u.id
      FROM users u
      WHERE u.username = p.assignee
    """)

    # 7. Seed initial task_state_logs
    op.execute("""
      INSERT INTO task_state_logs (task_id, from_state, to_state, entered_at)
      SELECT id, NULL, status, COALESCE(TO_TIMESTAMP(created_at, 'YYYY-MM-DD HH24:MI:SS'), NOW())
      FROM tasks
      WHERE created_at IS NOT NULL
    """)

def downgrade() -> None:
    # Downgrade doesn't undo the data backfill cleanly, we just let it be.
    pass
