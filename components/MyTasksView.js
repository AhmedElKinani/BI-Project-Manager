import { 
  formatDuration, 
  getTeamClass, 
  appPrompt, 
  ProjectBadges, 
  appConfirm, 
  sendNotification, 
  getPhaseClass, 
  sendChannelMessage, 
  appAlert, 
  logAudit, 
  apiFetch,
  hasPermission
} from '../utils/core.js';
import { TaskFocusModal } from './FocusModal.js';
import { STATUS_META } from './TaskManagement.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
const html = htm.bind(h);

export const MyTasksView = ({ tasks, projects, users, fetchTasks, currentUser }) => {
  const [showSelfAssignModal, setShowSelfAssignModal] = useState(false);
  const [focusEditTask, setFocusEditTask] = useState(null);

  // 1. Filter tasks
  // Tasks assigned to me, approved
  const myTasks = tasks.filter(t => t.assignee === currentUser.username && t.approval_status === 'approved');
  
  // Pending acceptance from leader assign
  const pending = myTasks.filter(t => t.acceptance_status === 'pending_acceptance' && t.status !== 'review');
  // Active work (accepted, approved, and not done/review)
  const activeWork = myTasks.filter(t => t.acceptance_status === 'accepted' && t.status !== 'done' && t.status !== 'review');
  // Submitted for review
  const inReview = myTasks.filter(t => t.status === 'review');
  // Completed
  const completed = tasks.filter(t => t.assignee === currentUser.username && t.status === 'done');
  
  // Overdue active tasks
  const overdueActive = activeWork.filter(t => {
    if (!t.due_date) return false;
    return new Date(t.due_date) < new Date();
  });

  // Soft-rejected self-assignment tasks (created by me, status rejected)
  const rejectedSelfAssignments = tasks.filter(t => t.created_by === currentUser.username && t.approval_status === 'rejected');

  // 2. State handlers
  const updateAcceptance = async (task, status) => {
    const payload = { ...task, acceptance_status: status };
    if (status === 'accepted') {
      const now = new Date().toISOString().split('.')[0].replace('T',' ');
      payload.accepted_at = now;
    } else if (status === 'passed') {
      payload.assignee = '';
      payload.acceptance_status = 'accepted';
      payload.status = 'todo';
    }
    await apiFetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(status === 'passed') {
        logAudit(currentUser, 'TASK_PASSED', `Passed on task: ${task.title}`);
    }
    fetchTasks();
  };

  const handleDeleteTask = async (task) => {
    const confirmed = await appConfirm(`Are you sure you want to delete this rejected task: "${task.title}"?`, "Delete Task");
    if (!confirmed) return;
    await apiFetch('/api/tasks/' + task.id, { method: 'DELETE' });
    logAudit(currentUser, 'TASK_DELETED', `Deleted rejected self-assigned task: ${task.title}`);
    fetchTasks();
  };

  const handleStatusChange = async (task, newStatus) => {
    let resolution_note = task.resolution_note || '';
    let completed_by = task.completed_by || '';
    const now = new Date().toISOString().split('.')[0].replace('T',' ');
    
    // Business Rule: Members can't move to 'done' directly (dynamic capability check)
    if (newStatus === 'done' && !hasPermission(currentUser, 'task.approve')) {
        newStatus = 'review';
    }

    const payload = { ...task, status: newStatus };
    
    if (newStatus === 'review') {
        payload.acceptance_status = 'pending_acceptance'; // Reset for leader to accept the review
        payload.review_submitted_at = now;
        logAudit(currentUser, 'TASK_SUBMITTED_FOR_REVIEW', `Submitted task "${task.title}" for leader review.`);
        sendChannelMessage(task.team, '🤖 System', `🔍 Task submitted for review: [TASK:${task.id}:${task.title}] by @${currentUser.username}. Leaders, please verify.`);
    }

    if (newStatus === 'done' && task.status !== 'done') {
      const note = await appPrompt("Task completed! Enter a resolution or completion note:", "", 'Completion Note');
      if (note === null) return; 
      const hours = await appPrompt("How many actual hours were spent on this task?", task.estimated_hours || '0', 'Actual Effort');
      if (hours === null) return;
      resolution_note = note;
      completed_by = currentUser.username;
      payload.resolution_note = resolution_note;
      payload.completed_by = completed_by;
      payload.resolved_at = now;
      payload.actual_hours = parseFloat(hours) || 0;
    }
    
    await apiFetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    logAudit(currentUser, 'TASK_STATUS_CHANGED', `Moved task "${task.title}" to ${newStatus}`);
    fetchTasks();
  };

  // 3. Card renderer
  const renderCard = (task, borderCol, displayMode) => {
    const proj = projects.find(p => p.id === task.project_id);
    let dueDateBadge = null;
    if (task.due_date && task.status !== 'done') {
      const d = new Date(task.due_date);
      const now = new Date();
      const diffDays = Math.floor((d - now) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) dueDateBadge = { label: 'Overdue', color: 'var(--accent-pink)' };
      else if (diffDays === 0) dueDateBadge = { label: 'Due Today', color: 'var(--accent-orange)' };
      else if (diffDays <= 2) dueDateBadge = { label: 'Due Soon', color: 'var(--accent-purple)' };
    }
    const isOverdue = dueDateBadge?.label === 'Overdue';

    return html`
      <div class="task-card-unified" 
        style="border-left: 4px solid ${borderCol}; margin-bottom: 1rem;"
        onClick=${(e) => {
          if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SELECT' && e.target.tagName !== 'OPTION' && !e.target.closest('button') && !e.target.closest('select')) {
            window.openTaskDetail && window.openTaskDetail(task.id);
          }
        }}
      >
        <!-- Card Header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;margin-bottom:0.5rem;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:1rem;color:var(--text-primary);display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              ${task.title}
              ${task.is_blocked ? html`<span class="tag" style="background:var(--accent-pink);color:white;font-size:0.65rem;">BLOCKED</span>` : null}
            </div>
            ${task.description && html`<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.35rem;line-height:1.45;white-space:pre-wrap;">${task.description}</div>`}
          </div>
          
          <div style="flex-shrink:0;">
            ${displayMode === 'pending' ? html`
              <div style="display:flex;gap:0.4rem;">
                <button class="btn" style="background:var(--accent-green);color:black;font-weight:600;padding:0.3rem 0.7rem;font-size:0.78rem;" onClick=${() => updateAcceptance(task, 'accepted')}><i class="fa-solid fa-check"></i> Accept</button>
                <button class="btn" style="color:var(--accent-orange);border:1px solid var(--accent-orange);padding:0.3rem 0.7rem;font-size:0.78rem;" onClick=${() => updateAcceptance(task, 'passed')}><i class="fa-solid fa-arrow-turn-up"></i> Pass</button>
              </div>
            ` : displayMode === 'rejected' ? html`
              <div style="display:flex;gap:0.4rem;">
                <button class="btn" style="background:var(--accent-purple);color:white;padding:0.3rem 0.7rem;font-size:0.78rem;" onClick=${() => { setFocusEditTask(task); setShowSelfAssignModal(true); }}><i class="fa-solid fa-rotate"></i> Resubmit</button>
                <button class="btn" style="color:var(--accent-pink);border:1px solid var(--accent-pink);padding:0.3rem 0.7rem;font-size:0.78rem;" onClick=${() => handleDeleteTask(task)}><i class="fa-solid fa-trash"></i> Delete</button>
              </div>
            ` : task.status === 'done' ? html`
              <span class="tag color-green" style="font-size:0.75rem;"><i class="fa-solid fa-check-double"></i> Done</span>
            ` : task.status === 'review' ? html`
              <span class="tag color-eval" style="font-size:0.75rem;"><i class="fa-solid fa-hourglass-half"></i> In Review</span>
            ` : html`
              <div style="display:flex;gap:0.4rem;align-items:center;">
                <select class="form-select" style="font-size:0.78rem;padding:0.2rem 1.5rem 0.2rem 0.5rem;min-width:115px;" value=${task.status} onChange=${e => handleStatusChange(task, e.target.value)}>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Submit for Review</option>
                </select>
                ${task.status === 'in_progress' && html`<button class="btn active" style="background:var(--accent-purple);padding:0.25rem 0.6rem;font-size:0.75rem;" onClick=${() => handleStatusChange(task, 'review')}>Submit</button>`}
              </div>
            `}
          </div>
        </div>

        <!-- Rejection Feedback Highlight -->
        ${task.rejection_reason && html`
          <div style="margin:0.75rem 0;padding:0.6rem 0.8rem;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:8px;font-size:0.8rem;">
            <strong style="color:var(--accent-pink);display:flex;align-items:center;gap:0.3rem;margin-bottom:0.15rem;">
              <i class="fa-solid fa-circle-exclamation"></i> Rejection Feedback:
            </strong>
            <span style="color:var(--text-primary);opacity:0.95;">${task.rejection_reason}</span>
          </div>
        `}

        <!-- Card Footer -->
        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-top:0.75rem;padding-top:0.6rem;border-top:1px solid rgba(255,255,255,0.04);">
          <span class="tag ${getPhaseClass(task.crisp_dm_phase)}" style="font-size:0.65rem;">${task.crisp_dm_phase}</span>
          ${proj && html`
            <span style="font-size:0.72rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.25rem;">
              <i class="fa-solid fa-folder-open" style="opacity:0.7;"></i> ${proj.id}
            </span>
          `}
          ${proj && proj.project_lead && html`
            <span class="lead-badge" style="background:rgba(234,179,8,0.15);color:var(--accent-yellow);padding:0.1rem 0.4rem;border-radius:4px;font-size:0.72rem;font-weight:600;display:inline-flex;align-items:center;gap:0.2rem;" title="Project Lead">
              <i class="fa-solid fa-star" style="font-size:0.65rem;"></i> Lead: ${proj.project_lead}
            </span>
          `}
          ${task.created_at && html`
            <span style="font-size:0.72rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.25rem;" title="Created">
              <i class="fa-regular fa-calendar-plus" style="opacity:0.7;"></i> ${task.created_at.split(' ')[0]}
            </span>
          `}
          ${task.start_date && html`
            <span style="font-size:0.72rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.25rem;">
              <i class="fa-solid fa-play" style="opacity:0.7;font-size:0.6rem;"></i> Start: ${task.start_date.split('T')[0]}
            </span>
          `}
          ${task.due_date && html`
            <span style="font-size:0.72rem;color:${isOverdue ? 'var(--accent-pink)' : 'var(--text-secondary)'};display:flex;align-items:center;gap:0.25rem;">
              <i class="fa-solid fa-calendar-day" style="opacity:0.7;"></i> Due: ${task.due_date.split('T')[0]}
            </span>
          `}
          ${dueDateBadge && html`
            <span class="tag" style="font-size:0.62rem;border:1px solid currentColor;color:${dueDateBadge.color};padding:0.05rem 0.35rem;">
              ${dueDateBadge.label}
            </span>
          `}
          
          <span class="tag" style="background:${STATUS_META[task.status]?.bg};color:${STATUS_META[task.status]?.color};font-size:0.65rem;margin-left:auto;text-transform:uppercase;letter-spacing:0.04em;">
            ${STATUS_META[task.status]?.label}
          </span>
        </div>
      </div>
    `;
  };

  return html`
    <div>
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid var(--border-color);">
        <div>
          <h2 class="page-title">My Tasks</h2>
          <p class="page-subtitle">Your personal daily workspace & task lifecycle tracker</p>
        </div>
        <button class="btn active" style="background:var(--accent-purple);padding:0.5rem 1.25rem;border-radius:10px;font-weight:600;display:flex;align-items:center;gap:0.4rem;"
          onClick=${() => { setFocusEditTask(null); setShowSelfAssignModal(true); }}>
          <i class="fa-solid fa-user-check"></i> Self-Assign Task
        </button>
      </div>

      <!-- Project Lead Banners -->
      ${projects.filter(p => p.project_lead_id === currentUser.id).map(proj => html`
        <div style="margin-bottom: 1.5rem; padding: 0.75rem 1rem; background: rgba(234, 179, 8, 0.08); border: 1px solid rgba(234, 179, 8, 0.25); border-left: 4px solid var(--accent-yellow); border-radius: 8px; display: flex; align-items: center; gap: 0.6rem;">
          <i class="fa-solid fa-star" style="color: var(--accent-yellow); font-size: 1rem;"></i>
          <span style="font-size: 0.88rem; color: var(--text-primary); font-weight: 500;">
            You are the Project Lead for <strong>${proj.title}</strong> (${proj.id})
          </span>
        </div>
      `)}

      <!-- KPI Stat Strip -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;margin-bottom:2rem;">
        <div class="metric-card" style="padding:1rem;border-top:3px solid var(--accent-orange);background:rgba(255,255,255,0.01);text-align:center;">
          <div style="font-size:1.8rem;font-weight:800;color:var(--accent-orange);">${pending.length}</div>
          <div style="font-size:0.68rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;letter-spacing:0.05em;">Pending Action</div>
        </div>
        <div class="metric-card" style="padding:1rem;border-top:3px solid var(--accent-blue);background:rgba(255,255,255,0.01);text-align:center;">
          <div style="font-size:1.8rem;font-weight:800;color:var(--accent-blue);">${activeWork.length}</div>
          <div style="font-size:0.68rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;letter-spacing:0.05em;">Active Work</div>
        </div>
        <div class="metric-card" style="padding:1rem;border-top:3px solid var(--accent-purple);background:rgba(255,255,255,0.01);text-align:center;">
          <div style="font-size:1.8rem;font-weight:800;color:var(--accent-purple);">${inReview.length}</div>
          <div style="font-size:0.68rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;letter-spacing:0.05em;">Submitted</div>
        </div>
        <div class="metric-card" style="padding:1rem;border-top:3px solid var(--accent-green);background:rgba(255,255,255,0.01);text-align:center;">
          <div style="font-size:1.8rem;font-weight:800;color:var(--accent-green);">${completed.length}</div>
          <div style="font-size:0.68rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;letter-spacing:0.05em;">Completed</div>
        </div>
        <div class="metric-card" style="padding:1rem;border-top:3px solid var(--accent-pink);background:rgba(255,255,255,0.01);text-align:center;">
          <div style="font-size:1.8rem;font-weight:800;color:var(--accent-pink);">${overdueActive.length}</div>
          <div style="font-size:0.68rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;letter-spacing:0.05em;">Overdue Alert</div>
        </div>
      </div>

      <!-- Main Layout Zones -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-bottom:2.5rem;">
        <!-- Left Column: Zone A (Pending Acceptance) & Zone C (In Review) -->
        <div style="display:flex;flex-direction:column;gap:1.5rem;">
          <!-- Zone A: Needs Action (Pending Acceptance & Rejected Self-Assigns) -->
          <div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
              <h3 style="margin:0;font-size:1.1rem;font-weight:700;color:var(--accent-orange);display:flex;align-items:center;gap:0.4rem;">
                <i class="fa-solid fa-bell"></i> Needs Action (${pending.length + rejectedSelfAssignments.length})
              </h3>
            </div>
            
            ${(pending.length === 0 && rejectedSelfAssignments.length === 0) ? html`
              <div class="info-block" style="opacity:0.5;text-align:center;padding:2rem;border-radius:10px;">No tasks requiring immediate action.</div>
            ` : html`
              <div>
                ${rejectedSelfAssignments.map(t => renderCard(t, 'var(--accent-pink)', 'rejected'))}
                ${pending.map(t => renderCard(t, 'var(--accent-orange)', 'pending'))}
              </div>
            `}
          </div>

          <!-- Zone C: Submitted for Review -->
          <div>
            <h3 style="margin-bottom:1rem;font-size:1.1rem;font-weight:700;color:var(--accent-purple);display:flex;align-items:center;gap:0.4rem;">
              <i class="fa-solid fa-paper-plane"></i> Submitted for Review (${inReview.length})
            </h3>
            ${inReview.length === 0 ? html`
              <div class="info-block" style="opacity:0.5;text-align:center;padding:2rem;border-radius:10px;">No submitted reviews.</div>
            ` : inReview.map(t => renderCard(t, 'var(--accent-purple)', 'review'))}
          </div>
        </div>

        <!-- Right Column: Zone B (Active Work) -->
        <div>
          <h3 style="margin-bottom:1rem;font-size:1.1rem;font-weight:700;color:var(--accent-blue);display:flex;align-items:center;gap:0.4rem;">
            <i class="fa-solid fa-person-digging"></i> Active Work (${activeWork.length})
          </h3>
          ${activeWork.length === 0 ? html`
            <div class="info-block" style="opacity:0.5;text-align:center;padding:2.5rem;border-radius:10px;">No active tasks in progress. Claim one from the Team Pool or create a self-assigned task!</div>
          ` : activeWork.map(t => renderCard(t, 'var(--accent-blue)', 'active'))}
        </div>
      </div>

      <!-- Zone D: Collapsible Task History -->
      ${(() => {
        if (completed.length === 0) return null;
        const ttrs = completed.filter(t => t.accepted_at && t.resolved_at).map(t => formatDuration(t.accepted_at, t.resolved_at).hours);
        const avgTTRHrs = ttrs.length ? (ttrs.reduce((a,b) => a+b, 0)/ttrs.length) : 0;
        const avgTTR = avgTTRHrs ? `${Math.floor(avgTTRHrs/24)}d ${Math.round(avgTTRHrs%24)}h` : '—';
        return html`
          <div style="margin-top:2.5rem;border-top:1px solid var(--border-color);padding-top:2rem;">
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.2rem;justify-content:space-between;">
              <h3 style="color:var(--accent-green);margin:0;font-size:1.1rem;font-weight:700;display:flex;align-items:center;gap:0.4rem;">
                <i class="fa-solid fa-clock-rotate-left"></i> Completed Task History (${completed.length})
              </h3>
              <span style="font-size:0.8rem;color:var(--text-secondary);background:rgba(255,255,255,0.03);padding:0.3rem 0.6rem;border-radius:6px;">
                Avg Resolution Time (TTR): <strong style="color:var(--accent-purple);">${avgTTR}</strong>
              </span>
            </div>
            <div style="overflow-x:auto;border:1px solid var(--border-color);border-radius:10px;background:rgba(0,0,0,0.15);">
              <table class="data-grid-table" style="margin:0;width:100%;border-collapse:collapse;">
                <thead>
                  <tr style="background:rgba(255,255,255,0.02);border-bottom:1px solid var(--border-color);">
                    <th style="padding:0.75rem 1rem;text-align:left;">Task</th>
                    <th style="padding:0.75rem 1rem;text-align:left;">Project</th>
                    <th style="padding:0.75rem 1rem;text-align:left;">Phase</th>
                    <th style="padding:0.75rem 1rem;text-align:left;">Accepted</th>
                    <th style="padding:0.75rem 1rem;text-align:left;">Completed</th>
                    <th style="padding:0.75rem 1rem;text-align:left;">TTR</th>
                    <th style="padding:0.75rem 1rem;text-align:left;">Note</th>
                  </tr>
                </thead>
                <tbody>
                  ${completed.map(t => {
                    const proj = projects.find(p => p.id === t.project_id);
                    const ttr = formatDuration(t.accepted_at, t.resolved_at);
                    const ttrClass = ttr.hours === null ? '' : ttr.hours > 168 ? 'sla-breach' : ttr.hours > 72 ? 'sla-warn' : 'sla-good';
                    return html`
                      <tr style="border-bottom:1px solid var(--border-color);transition:background 0.2s;cursor:pointer;" class="table-row-hover" onClick=${() => window.openTaskDetail && window.openTaskDetail(t.id)}>
                        <td style="padding:0.75rem 1rem;font-weight:600;color:var(--text-primary);">${t.title}</td>
                        <td style="padding:0.75rem 1rem;font-size:0.8rem;color:var(--text-secondary);">${proj ? html`<span title=${proj.title}>${t.project_id}</span>` : html`<span style="color:var(--text-secondary);">—</span>`}</td>
                        <td style="padding:0.75rem 1rem;"><span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span></td>
                        <td style="padding:0.75rem 1rem;font-size:0.78rem;color:var(--text-secondary);">${t.accepted_at ? t.accepted_at.split(' ')[0] : '—'}</td>
                        <td style="padding:0.75rem 1rem;font-size:0.78rem;color:var(--accent-green);">${t.resolved_at ? t.resolved_at.split(' ')[0] : '—'}</td>
                        <td style="padding:0.75rem 1rem;">${ttr.label !== '—' ? html`<span class="tag ${ttrClass}" style="font-size:0.72rem;">${ttr.label}</span>` : '—'}</td>
                        <td style="padding:0.75rem 1rem;font-size:0.78rem;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title=${t.resolution_note||''}>${t.resolution_note || '—'}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        `;
      })()}

      <${TaskFocusModal}
        open=${showSelfAssignModal}
        onClose=${() => { setShowSelfAssignModal(false); setFocusEditTask(null); }}
        projects=${projects}
        currentUser=${currentUser}
        isSelfAssign=${true}
        editingTask=${focusEditTask}
        users=${users}
        onSaved=${fetchTasks} />
    </div>
  `;
};
