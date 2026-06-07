import { apiFetch, getPhaseClass, logAudit } from '../utils/core.js';
import { TaskDetailModal } from './TaskManagement.js';
import { TaskFocusModal, PhaseSubmitModal } from './FocusModal.js';
import { STATUS_META } from './TaskManagement.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
const html = htm.bind(h);

export const TeamDashboardView = ({ tasks, projects, users, fetchTasks, currentUser }) => {
  const teamTasks = tasks.filter(t => t.team === currentUser.team && t.approval_status === 'approved');
  const teamMembers = users.filter(u => u.team === currentUser.team);

  // ── Modal state ──────────────────────────────────────────────
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showPhaseModal, setShowPhaseModal]   = useState(false);
  const [editingTask,    setEditingTask]       = useState(null);

  // ── Bulk-select ───────────────────────────────────────────────
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedTasksForBulk, setSelectedTasksForBulk] = useState(new Set());
  const toggleBulkSelect = (id) => {
    setSelectedTasksForBulk(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkReassign = async (assignee) => {
    for (const id of selectedTasksForBulk) {
      const t = teamTasks.find(x => x.id === id);
      if (t) {
        const payload = { ...t, assignee, acceptance_status: assignee ? 'pending_acceptance' : 'accepted' };
        await apiFetch('/api/tasks/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      }
    }
    setSelectedTasksForBulk(new Set());
    fetchTasks();
  };

  // ── Derived stats ─────────────────────────────────────────────
  const todoCount     = teamTasks.filter(t => t.status === 'todo').length;
  const activeCount   = teamTasks.filter(t => t.status === 'in_progress').length;
  const reviewCount   = teamTasks.filter(t => t.status === 'review').length;
  const doneCount     = teamTasks.filter(t => t.status === 'done').length;
  const overdueCount  = teamTasks.filter(t => t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date()).length;

  return html`
    <div>
      <!-- Header -->
      <div class="page-header">
        <div>
          <h2 class="page-title">
            <i class="fa-solid fa-people-group" style="color:var(--accent-blue);margin-right:0.6rem;"></i>
            Team Oversight
          </h2>
          <p class="page-subtitle">Manage your team's workload, assign tasks, and submit phase completions</p>
        </div>
        <div style="display:flex;gap:0.75rem;">
          <button class="btn active" style="background:var(--accent-purple);" onClick=${() => { setEditingTask(null); setShowAssignModal(true); }}>
            <i class="fa-solid fa-user-plus"></i> Assign Task
          </button>
          <button class="btn active" style="background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));" onClick=${() => setShowPhaseModal(true)}>
            <i class="fa-solid fa-code-branch"></i> Submit Phase
          </button>
        </div>
      </div>

      <!-- KPI Strip -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;margin-bottom:1.5rem;">
        ${[
          { label:'To Do',      value: todoCount,    color:'var(--text-secondary)', icon:'fa-circle' },
          { label:'In Progress',value: activeCount,  color:'var(--accent-blue)',    icon:'fa-bolt' },
          { label:'In Review',  value: reviewCount,  color:'var(--accent-purple)',  icon:'fa-magnifying-glass' },
          { label:'Done',       value: doneCount,    color:'var(--accent-green)',   icon:'fa-circle-check' },
          { label:'Overdue',    value: overdueCount, color:'var(--accent-orange)',  icon:'fa-triangle-exclamation' },
        ].map(s => html`
          <div class="metric-card" style="text-align:center;padding:1.25rem 1rem;">
            <div style="font-size:2.2rem;font-weight:800;color:${s.color};line-height:1;">${s.value}</div>
            <div style="font-size:0.68rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-top:0.4rem;">
              <i class="fa-solid ${s.icon}" style="margin-right:0.25rem;"></i>${s.label}
            </div>
          </div>`)}
      </div>

      <!-- Task table -->
      <div class="info-block" style="padding:0;overflow:hidden;">
        <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;">
          <span style="font-weight:600;font-size:0.95rem;"><i class="fa-solid fa-list-check" style="margin-right:0.4rem;color:var(--accent-blue);"></i>Team Tasks (${teamTasks.length})</span>
          ${teamMembers.length > 0 && html`<span style="font-size:0.75rem;color:var(--text-secondary);">${teamMembers.length} members</span>`}
        </div>
        <div style="overflow-x:auto;">
          <table class="data-grid-table">
            <thead>
              <tr>
                <th style="width:40px;"><input type="checkbox" onChange=${e => {
                  if (e.target.checked) setSelectedTasksForBulk(new Set(teamTasks.map(t=>t.id)));
                  else setSelectedTasksForBulk(new Set());
                }} checked=${selectedTasksForBulk.size > 0 && selectedTasksForBulk.size === teamTasks.length} /></th>
                <th>Task <span style="font-size:0.7rem;color:var(--text-secondary);font-weight:400;">(click to open)</span></th>
                <th>Assignee</th>
                <th>Status</th>
                <th>Due Date</th>
              </tr>
            </thead>
            <tbody>
              ${teamTasks.length === 0 ? html`
                <tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-secondary);font-style:italic;">No tasks for your team yet.</td></tr>
              ` : teamTasks.map(t => html`
                <tr class="accordion-row" style=${selectedTasksForBulk.has(t.id) ? 'background:rgba(59,130,246,0.1);' : ''}>
                  <td onClick=${e => e.stopPropagation()}><input type="checkbox" checked=${selectedTasksForBulk.has(t.id)} onChange=${() => toggleBulkSelect(t.id)} /></td>
                  <td onClick=${() => setSelectedTask(t)}>
                    <div style="font-weight:600;">${t.title}</div>
                    <div style="font-size:0.7rem;color:var(--text-secondary);">
                      ${t.project_id} | <span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span>
                    </div>
                  </td>
                  <td>${t.assignee ? html`<strong>${t.assignee}</strong>` : html`<span class="tag color-bu">Pool</span>`}</td>
                  <td>
                    <span class="tag" style="background:${STATUS_META[t.status].bg};color:${STATUS_META[t.status].color}">${STATUS_META[t.status].label}</span>
                    ${t.assignee && t.acceptance_status === 'pending_acceptance' && html`<span class="tag color-eval" style="margin-left:0.5rem;">Pending Accept</span>`}
                  </td>
                  <td style="color:${new Date(t.due_date)<new Date()&&t.status!=='done'?'var(--accent-pink)':'var(--text-primary)'}">${t.due_date || '—'}</td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Floating bulk-action bar -->
      ${selectedTasksForBulk.size > 0 && html`
        <div style="position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--bg-panel);backdrop-filter:blur(10px);padding:1rem 2rem;border-radius:999px;border:1px solid var(--border-color);box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:1.5rem;z-index:200;">
          <span style="font-weight:600;">${selectedTasksForBulk.size} selected</span>
          <div style="width:1px;height:20px;background:var(--border-color);"></div>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span style="font-size:0.8rem;color:var(--text-secondary);">Reassign:</span>
            <select class="form-select" style="padding:0.2rem 1.5rem 0.2rem 0.5rem;font-size:0.8rem;" onChange=${e => handleBulkReassign(e.target.value)}>
              <option value="">— Choose —</option>
              <option value="">Send to Pool</option>
              ${teamMembers.map(m => html`<option value=${m.username}>${m.username}</option>`)}
            </select>
          </div>
        </div>
      `}

      <!-- Task Detail Modal -->
      ${selectedTask && html`<${TaskDetailModal} task=${selectedTask} projects=${projects} currentUser=${currentUser} fetchTasks=${fetchTasks} onClose=${() => setSelectedTask(null)} />`}

      <!-- Assign Task FocusModal -->
      <${TaskFocusModal}
        open=${showAssignModal}
        onClose=${() => { setShowAssignModal(false); setEditingTask(null); }}
        projects=${projects}
        currentUser=${currentUser}
        editingTask=${editingTask}
        onSaved=${fetchTasks} />

      <!-- Submit Phase FocusModal -->
      <${PhaseSubmitModal}
        open=${showPhaseModal}
        onClose=${() => setShowPhaseModal(false)}
        projects=${projects}
        tasks=${tasks}
        currentUser=${currentUser}
        onSaved=${fetchTasks} />
    </div>
  `;
};
