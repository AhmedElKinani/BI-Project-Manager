import { apiFetch, getPhaseClass, getTeamClass, logAudit, hasPermission } from '../utils/core.js';
import { h } from 'https://esm.sh/preact';
import htm from 'https://esm.sh/htm';
const html = htm.bind(h);

export const TeamPoolView = ({ tasks, projects, fetchTasks, currentUser }) => {
  const isAdmin = hasPermission(currentUser, 'admin.panel');
  const poolTasks = tasks.filter(t => {
    if (!t.assignee && t.approval_status === 'approved') {
      return isAdmin ? true : t.team === currentUser.team;
    }
    return false;
  });

  const claimTask = async (task) => {
    const now = new Date().toISOString().split('.')[0].replace('T',' ');
    const payload = { ...task, assignee: currentUser.username, acceptance_status: 'accepted', accepted_at: now };
    await apiFetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    logAudit(currentUser, 'TASK_CLAIMED', `Claimed task: ${task.title}`);
    fetchTasks();
  };

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title">${isAdmin ? 'All Teams Pool' : 'Team Pool'}</h2>
          <p class="page-subtitle">${isAdmin ? 'Unassigned tasks across all teams' : `Unassigned tasks designated for ${currentUser.team}`}</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(300px, 1fr));gap:1rem;">
        ${poolTasks.length === 0 ? html`<div style="grid-column:1/-1;padding:3rem;text-align:center;color:var(--text-secondary);font-style:italic;">Pool is empty. Excellent!</div>` : 
          poolTasks.map(task => {
            const proj = projects.find(p => p.id === task.project_id);
            return html`
              <div class="info-block kanban-pool-card" style="display:flex;flex-direction:column;justify-content:space-between;">
                <div>
                  <div style="font-weight:600;font-size:1.05rem;margin-bottom:0.25rem;">${task.title} ${task.is_blocked ? html`<span class="tag" style="background:var(--accent-pink);color:white;margin-left:0.5rem;">BLOCKED</span>` : null}</div>
                  <div style="font-size:0.85rem;color:var(--text-secondary);margin-bottom:0.5rem;">${task.description}</div>
                  ${proj && html`<div style="font-size:0.75rem;margin-bottom:0.5rem;"><i class="fa-solid fa-folder-open"></i> ${proj.id}</div>`}
                  <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
                    <span class="tag ${getPhaseClass(task.crisp_dm_phase)}" style="font-size:0.7rem;">${task.crisp_dm_phase}</span>
                    ${isAdmin && html`<span class="tag ${getTeamClass(task.team)}" style="font-size:0.65rem;">${task.team}</span>`}
                  </div>
                </div>
                <div style="margin-top:1rem;display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:0.75rem;color:var(--text-secondary);">Created: ${task.created_at.split(' ')[0]}</span>
                  <button class="btn active" style="background:var(--accent-purple);" onClick=${() => claimTask(task)}>Claim Task</button>
                </div>
              </div>
            `;
          })
        }
      </div>
    </div>
  `;
};
