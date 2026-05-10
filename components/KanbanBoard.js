import { getTeamClass, appPrompt, ProjectBadges, getPhaseClass, logAudit, getInitials, apiFetch } from '../utils/core.js';
import { PHASES, TEAMS } from '../utils/core.js';
import { ProjectCard } from './ProjectManagement.js';
import { TASK_STATUSES, STATUS_META } from './TaskManagement.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

export const KanbanBoard = ({ projects, tasks, viewMode, setViewMode, onProjectClick, onUpdate }) => {
  const [drillDown, setDrillDown] = useState(null); // { project, phase }

  const columns = viewMode === 'phase' ? PHASES : TEAMS;

  const getPhaseTasks = (projectId, phase) => tasks.filter(t => t.project_id === projectId && t.crisp_dm_phase === phase);

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title">Project Pivot Board</h2>
          <p class="page-subtitle">Track project lifecycle states and task-level execution</p>
        </div>
        <div class="toggle-group">
          <button class=${viewMode === 'phase' ? 'active' : ''} onClick=${() => setViewMode('phase')}><i class="fa-solid fa-layer-group"></i> Phase</button>
          <button class=${viewMode === 'team' ? 'active' : ''} onClick=${() => setViewMode('team')}><i class="fa-solid fa-users"></i> Team</button>
          <button class=${viewMode === 'deep_dive' ? 'active' : ''} onClick=${() => setViewMode('deep_dive')}><i class="fa-solid fa-table-cells"></i> Deep Dive Matrix</button>
        </div>
      </div>

      ${viewMode === 'deep_dive' ? html`
        <div class="info-block" style="padding:0;overflow-x:auto;">
          <table class="data-grid-table" style="min-width:1000px;">
            <thead>
              <tr>
                <th style="position:sticky;left:0;background:var(--bg-panel);z-index:2;width:250px;">Project</th>
                ${PHASES.map(ph => html`<th style="text-align:center;min-width:120px;">${ph.replace(' Understanding','')}</th>`)}
              </tr>
            </thead>
            <tbody>
              ${projects.slice().sort((a,b) => (a.is_deployed === b.is_deployed ? 0 : a.is_deployed ? 1 : -1)).map(p => html`
                <tr style="transition:var(--transition);">
                  <td style="position:sticky;left:0;background:var(--bg-panel);z-index:1;">
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
                      <div style="font-weight:700;color:var(--accent-blue);cursor:pointer;" onClick=${() => onProjectClick(p)}>${p.id}</div>
                    </div>
                    <${ProjectBadges} project=${p} />
                    <div style="font-size:0.75rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px;margin-top:0.5rem;">${p.title}</div>
                    <div style="font-size:0.7rem;margin-top:0.25rem;"><span class="tag ${getTeamClass(p.team)}" style="font-size:0.6rem;">${p.team}</span></div>
                  </td>
                  ${PHASES.map(ph => {
                    const phaseTasks = getPhaseTasks(p.id, ph);
                    const doneCount = phaseTasks.filter(t => t.status === 'done').length;
                    const totalCount = phaseTasks.length;
                    const isCurrent = p.phase === ph;
                    const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
                    
                    return html`
                      <td style="padding:0.5rem;text-align:center;">
                        <div 
                          class="matrix-cell ${isCurrent ? 'current' : ''} ${totalCount > 0 ? 'has-tasks' : ''}" 
                          style="padding:0.6rem;border-radius:8px;cursor:pointer;background:${isCurrent ? 'rgba(59,130,246,0.1)' : 'transparent'};border:1px solid ${isCurrent ? 'var(--accent-blue)' : 'transparent'};"
                          onClick=${() => setDrillDown({ project: p, phase: ph })}
                        >
                          ${totalCount > 0 ? html`
                            <div style="font-weight:700;font-size:0.9rem;color:${pct === 100 ? 'var(--accent-green)' : 'var(--text-primary)'}">${doneCount}/${totalCount}</div>
                            <div style="width:100%;height:3px;background:rgba(255,255,255,0.05);margin-top:0.4rem;border-radius:2px;overflow:hidden;">
                                <div style="width:${pct}%;height:100%;background:${pct === 100 ? 'var(--accent-green)' : 'var(--accent-blue)'};"></div>
                            </div>
                          ` : html`<div style="opacity:0.2;font-size:0.7rem;">—</div>`}
                          ${isCurrent && html`<div style="font-size:0.6rem;text-transform:uppercase;font-weight:800;color:var(--accent-blue);margin-top:0.3rem;">ACTIVE</div>`}
                        </div>
                      </td>
                    `;
                  })}
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      ` : html`
        <div class="board-container">
          ${columns.map(col => {
            const colProjects = projects.filter(p => viewMode === 'phase' ? p.phase === col : p.team === col);
            return html`
              <div class="column">
                <div class="column-header">
                  <span class="column-title">${col}</span>
                  <span class="column-count">${colProjects.length}</span>
                </div>
                <div class="card-list">
                  ${colProjects.map(p => html`<${ProjectCard} project=${p} viewMode=${viewMode} onClick=${onProjectClick} />`)}
                </div>
              </div>
            `;
          })}
        </div>
      `}

      ${drillDown && html`<${PhaseDrillDown} 
        project=${drillDown.project} 
        phase=${drillDown.phase} 
        tasks=${getPhaseTasks(drillDown.project.id, drillDown.phase)}
        onClose=${() => setDrillDown(null)}
        onUpdate=${onUpdate}
      />`}
    </div>
  `;
};

export const PhaseDrillDown = ({ project, phase, tasks, onClose, onUpdate }) => {
  const [currentUser] = useState(() => JSON.parse(localStorage.getItem('currentUser')));
  
  const handleStatusChange = async (task, newStatus) => {
    let resolution_note = task.resolution_note || '';
    let completed_by = task.completed_by || '';

    if (newStatus === 'done' && task.status !== 'done') {
      const note = await appPrompt("Task completed! Enter a resolution or completion note:", "", 'Completion Note');
      if (note === null) return; // cancellation
      resolution_note = note;
      completed_by = currentUser.username;
    }

    const payload = { 
      ...task, 
      status: newStatus,
      resolution_note: newStatus === 'done' ? resolution_note : null,
      completed_by: newStatus === 'done' ? completed_by : null
    };
    delete payload.created_at;

    await apiFetch('/api/tasks/' + task.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    logAudit(currentUser, 'TASK_STATUS_CHANGED', `Moved task "${task.title}" to ${newStatus} via Deep Dive`);
    onUpdate();
  };

  return html`
    <div class="modal-overlay" onClick=${e => e.target === e.currentTarget && onClose()}>
      <div class="modal-content" style="max-width:700px;">
        <div class="modal-header">
          <div>
            <div style="font-size:0.8rem;color:var(--text-secondary);">${project.id} — ${project.title}</div>
            <h2 style="font-size:1.4rem;"><span class="tag ${getPhaseClass(phase)}" style="margin-right:0.75rem;">${phase}</span> Tasks</h2>
          </div>
          <button class="modal-close" onClick=${onClose}>✕</button>
        </div>
        <div class="modal-body">
          ${tasks.length === 0 ? html`
            <div style="padding:3rem;text-align:center;color:var(--text-secondary);">
              <i class="fa-solid fa-clipboard-list" style="font-size:3rem;opacity:0.2;margin-bottom:1rem;display:block;"></i>
              No tasks defined for this phase yet.
            </div>
          ` : html`
            <div style="display:flex;flex-direction:column;gap:1rem;">
              ${tasks.map(task => {
                let dueDateBadge = null;
                if (task.due_date && task.status !== 'done') {
                  const d = new Date(task.due_date);
                  const diffDays = Math.floor((d - new Date()) / (1000 * 60 * 60 * 24));
                  if (diffDays < 0) dueDateBadge = { label: 'Overdue', color: 'var(--accent-pink)' };
                  else if (diffDays === 0) dueDateBadge = { label: 'Due Today', color: 'var(--accent-orange)' };
                  else if (diffDays <= 2) dueDateBadge = { label: 'Due Soon', color: 'var(--accent-purple)' };
                }
                return html`
                <div class="info-block" style="display:flex;justify-content:space-between;align-items:flex-start;padding:1rem;">
                  <div style="flex:1;">
                    <div style="font-weight:700;margin-bottom:0.25rem;">${task.title}</div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);">${task.description || 'No description provided.'}</div>
                    <div style="margin-top:0.5rem;display:flex;align-items:center;gap:1rem;">
                       <div class="assignee" style="background:transparent;padding:0;">
                          <div class="avatar" style="width:24px;height:24px;font-size:0.6rem;">${getInitials(task.assignee || '?')}</div>
                          <span style="font-size:0.75rem;">${task.assignee}</span>
                       </div>
                       <span class="tag" style="font-size:0.65rem;opacity:0.7;">${task.team}</span>
                       ${dueDateBadge && html`<span class="tag" style="font-size:0.65rem;border:1px solid currentColor;color:${dueDateBadge.color};">${dueDateBadge.label}</span>`}
                    </div>

                    ${task.status === 'done' && html`
                      <div style="margin-top:0.75rem;padding:0.75rem;background:rgba(16,185,129,0.1);border-left:3px solid var(--accent-green);border-radius:4px;">
                         <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.25rem;">
                           <i class="fa-solid fa-check-double" style="color:var(--accent-green);margin-right:0.4rem;"></i>
                           Completed by <strong>${task.completed_by || task.assignee || 'Unknown'}</strong>
                         </div>
                         ${task.resolution_note && html`<div style="font-size:0.8rem;color:var(--text-primary);">${task.resolution_note}</div>`}
                      </div>
                    `}
                  </div>
                  <div style="display:flex;flex-direction:column;gap:0.5rem;align-items:flex-end;margin-left:1rem;">
                     <select class="form-select" style="font-size:0.75rem;padding:0.25rem 0.5rem;" value=${task.status} onChange=${e => handleStatusChange(task, e.target.value)}>
                        ${TASK_STATUSES.map(s => html`<option value=${s}>${STATUS_META[s].label}</option>`)}
                     </select>
                  </div>
                </div>
              `;
              })}
            </div>
          `}
        </div>
      </div>
    </div>
  `;
};


