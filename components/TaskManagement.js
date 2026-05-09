import { formatDuration, getTeamClass, appPrompt, ProjectBadges, appConfirm, TEAM_PHASES, sendNotification, getPhaseClass, sendChannelMessage, appAlert, logAudit, apiFetch } from '../utils/core.js';
import { PHASES, TEAMS } from '../utils/core.js';
import { PhaseSubmissionPanel } from './ProjectManagement.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
export const STATUS_META = {
  todo:        { label: 'To Do',      color: 'var(--text-secondary)',  bg: 'rgba(255,255,255,0.06)' },
  in_progress: { label: 'In Progress',color: 'var(--accent-blue)',     bg: 'rgba(59,130,246,0.12)' },
  review:      { label: 'In Review',  color: 'var(--accent-purple)',   bg: 'rgba(139,92,246,0.12)' },
  done:        { label: 'Done',       color: 'var(--accent-green)',    bg: 'rgba(16,185,129,0.12)' },
};

export const TaskManagementTab = ({ projects, tasks, fetchTasks, currentUser }) => {
  
  const isMember = currentUser.role === 'member';
  const isLeader = currentUser.role === 'leader';

  const isAdmin = currentUser.role === 'admin';
  const allowedPhases = isAdmin ? PHASES : (TEAM_PHASES[currentUser.team] || PHASES);
  const defaultPhase = allowedPhases[0];

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [form, setForm] = useState({
    project_id: '', title: '', description: '',
    crisp_dm_phase: defaultPhase,
    assignee: '', team: currentUser.team || TEAMS[0],
    status: 'todo'
  });

  const resetForm = () => {
    setForm({ project_id:'', title:'', description:'', crisp_dm_phase: defaultPhase, assignee:'', team: currentUser.team||TEAMS[0], status:'todo' });
    setEditingTask(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title) return;
    const payload = { ...form, created_by: currentUser.username };

    if (editingTask) {
      await apiFetch('/api/tasks/' + editingTask.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      logAudit(currentUser, 'TASK_UPDATED', `Updated task: ${form.title} (ID ${editingTask.id})`);
    } else {
      await apiFetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      logAudit(currentUser, 'TASK_CREATED', `Created task: ${form.title} in project ${form.project_id || 'N/A'}`);
    }
    resetForm();
    fetchTasks();
  };

  const handleDelete = async (task) => {
    const confirmed = await appConfirm(`Delete task "${task.title}"?`, 'Delete Task');
    if (!confirmed) return;
    await apiFetch('/api/tasks/' + task.id, { method: 'DELETE' });
    logAudit(currentUser, 'TASK_DELETED', `Deleted task: ${task.title} (ID ${task.id})`);
    fetchTasks();
  };

  const handleStatusChange = async (task, newStatus) => {
    // Business Rule: Members can't move to 'done' directly
    if (newStatus === 'done' && currentUser.role === 'member') {
        newStatus = 'review';
    }

    const payload = { ...task, status: newStatus };
    delete payload.created_at; // strip for update

    if (newStatus === 'review') {
        payload.acceptance_status = 'pending_acceptance';
        sendChannelMessage(task.team, '🤖 System', `🔍 Task submitted for review: [TASK:${task.id}:${task.title}] by @${currentUser.username}.`);
    }

    if (newStatus === 'done' && task.status !== 'done') {
        const now = new Date().toISOString().split('.')[0].replace('T',' ');
        payload.resolved_at = now;
        payload.completed_by = task.assignee || currentUser.username;
    }

    await apiFetch('/api/tasks/' + task.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    logAudit(currentUser, 'TASK_STATUS_CHANGED', `Moved task "${task.title}" to ${STATUS_META[newStatus].label}`);
    fetchTasks();
  };

  const handleEdit = (task) => {
    setEditingTask(task);
    setForm({ ...task });
    setShowForm(true);
  };

  const displayed = tasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterProject !== 'all' && t.project_id !== filterProject) return false;
    return true;
  });

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title"><i class="fa-solid fa-list-check" style="margin-right:0.6rem;"></i>Task Management</h2>
          <p class="page-subtitle">Granular action items mapped to CRISP-DM phases</p>
        </div>
        <button class="btn active" style="background:var(--accent-green);color:white;" onClick=${() => { resetForm(); setShowForm(true); }}>
          <i class="fa-solid fa-plus"></i> New Task
        </button>
      </div>

      ${showForm && html`
        <div class="info-block" style="margin-bottom:1.5rem;border:1px solid var(--accent-blue);">
          <div class="section-title">${editingTask ? 'Edit Task' : 'Create New Task'}</div>
          <form onSubmit=${handleSubmit} style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
            <div style="grid-column:1/-2;">
              <label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Task Title *</label>
              <input class="form-input" style="width:100%;" value=${form.title} onInput=${e => setForm({...form, title: e.target.value})} required />
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">CRISP-DM Phase</label>
              <select class="form-select" style="width:100%;" value=${form.crisp_dm_phase} onChange=${e => setForm({...form, crisp_dm_phase: e.target.value})}>
                ${allowedPhases.map(p => html`<option value=${p}>${p}</option>`)}
              </select>
            </div>
            <div style="grid-column:1/-1;">
              <label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Description</label>
              <textarea class="form-input" style="width:100%;min-height:60px;" value=${form.description} onInput=${e => setForm({...form, description: e.target.value})}></textarea>
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Linked Project</label>
              <select class="form-select" style="width:100%;" value=${form.project_id} onChange=${e => setForm({...form, project_id: e.target.value})}>
                <option value="">— No Project —</option>
                ${projects.map(p => html`<option value=${p.id}>${p.id} - ${p.title}</option>`)}
              </select>
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Assignee</label>
              <input class="form-input" style="width:100%;" value=${form.assignee} onInput=${e => setForm({...form, assignee: e.target.value})} placeholder="Person responsible" />
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Team</label>
              ${isAdmin
                ? html`<select class="form-select" style="width:100%;" value=${form.team} onChange=${e => setForm({...form, team: e.target.value})}>
                    ${TEAMS.map(t => html`<option value=${t}>${t}</option>`)}
                  </select>`
                : html`<input class="form-input" style="width:100%;opacity:0.6;" value=${currentUser.team} disabled />`
              }
            </div>
            <div>
              <label style="font-size:0.8rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Status</label>
              <select class="form-select" style="width:100%;" value=${form.status} onChange=${e => setForm({...form, status: e.target.value})}>
                ${TASK_STATUSES.map(s => html`<option value=${s}>${STATUS_META[s].label}</option>`)}
              </select>
            </div>
            <div style="grid-column:1/-1;display:flex;gap:0.75rem;justify-content:flex-end;margin-top:0.5rem;">
              <button type="button" class="btn" onClick=${resetForm}>Cancel</button>
              <button type="submit" class="btn active" style="background:var(--accent-blue);">${editingTask ? 'Save Changes' : 'Create Task'}</button>
            </div>
          </form>
        </div>
      `}

      <!-- Filter Bar -->
      <div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;">
        <span style="font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Filter by:</span>
        <select class="form-select" style="font-size:0.8rem;padding:0.3rem 0.6rem;" value=${filterStatus} onChange=${e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          ${TASK_STATUSES.map(s => html`<option value=${s}>${STATUS_META[s].label}</option>`)}
        </select>
        <select class="form-select" style="font-size:0.8rem;padding:0.3rem 0.6rem;" value=${filterProject} onChange=${e => setFilterProject(e.target.value)}>
          <option value="all">All Projects</option>
          ${projects.map(p => html`<option value=${p.id}>${p.id} - ${p.title}</option>`)}
        </select>
        <span style="font-size:0.8rem;color:var(--text-secondary);margin-left:auto;">${displayed.length} task${displayed.length !== 1 ? 's' : ''}</span>
      </div>

      <!-- Kanban-style 4-column board -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;">
        ${TASK_STATUSES.map(status => {
          const meta = STATUS_META[status];
          const colTasks = displayed.filter(t => t.status === status);
          return html`
            <div style="display:flex;flex-direction:column;gap:0.75rem;">
              <div style="padding:0.6rem 0.8rem;border-radius:var(--radius-md);background:${meta.bg};display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;font-size:0.85rem;color:${meta.color};">${meta.label}</span>
                <span style="font-size:0.75rem;background:rgba(255,255,255,0.1);padding:0.1rem 0.45rem;border-radius:999px;">${colTasks.length}</span>
              </div>
              ${colTasks.length === 0 && html`
                <div style="padding:1.5rem;text-align:center;color:var(--text-secondary);font-size:0.8rem;font-style:italic;border:1px dashed var(--border-color);border-radius:var(--radius-md);">No tasks</div>
              `}
              ${colTasks.map(task => {
                const proj = projects.find(p => p.id === task.project_id);
                return html`
                  <div class="info-block" style="padding:0.85rem;cursor:default;position:relative;">
                    <div style="font-weight:600;font-size:0.88rem;margin-bottom:0.4rem;line-height:1.3;">${task.title}</div>
                    ${task.description && html`<div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.5rem;">${task.description}</div>`}
                    ${proj && html`<div style="font-size:0.72rem;margin-bottom:0.4rem;display:flex;align-items:center;gap:0.4rem;">
                      <i class="fa-solid fa-folder-open" style="color:var(--accent-blue);"></i>
                      <span>${proj.id} - ${proj.title}</span>
                      <${ProjectBadges} project=${proj} />
                    </div>`}
                    <div style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:0.6rem;">
                      <span class="tag ${getPhaseClass(task.crisp_dm_phase)}" style="font-size:0.65rem;">${task.crisp_dm_phase}</span>
                      ${task.assignee && html`<span style="margin-left:0.5rem;"><i class="fa-solid fa-user" style="margin-right:0.25rem;"></i>${task.assignee}</span>`}
                    </div>
                    <!-- Move controls -->
                    <div style="display:flex;gap:0.3rem;margin-bottom:0.5rem;flex-wrap:wrap;">
                      ${(() => {
                        const isMember = currentUser.role === 'member';
                        return TASK_STATUSES.filter(s => s !== status).map(s => {
                          if (isMember && s === 'done') return null;
                          const label = (isMember && s === 'review') ? 'Submit' : STATUS_META[s].label;
                          return html`
                            <button class="btn" style="font-size:0.65rem;padding:0.15rem 0.4rem;color:${STATUS_META[s].color};" onClick=${() => handleStatusChange(task, s)}>
                              ${label}
                            </button>
                          `;
                        });
                      })()}
                    </div>
                    <div style="display:flex;gap:0.4rem;border-top:1px solid var(--border-color);padding-top:0.5rem;">
                      <button class="btn" style="flex:1;font-size:0.72rem;color:var(--accent-blue);" onClick=${() => handleEdit(task)}><i class="fa-solid fa-pen"></i> Edit</button>
                      ${(isAdmin || task.created_by === currentUser.username) && html`
                        <button class="btn" style="font-size:0.72rem;color:var(--accent-orange);" onClick=${() => handleDelete(task)}><i class="fa-solid fa-trash"></i></button>
                      `}
                    </div>
                    <div style="font-size:0.66rem;color:var(--text-secondary);margin-top:0.4rem;opacity:0.6;">${task.team}${task.created_at ? ' · ' + task.created_at.split(' ')[0] : ''}</div>
                  </div>
                `;
              })}
            </div>
          `;
        })}
      </div>
    </div>
  `;
};




export const MyTasksView = ({ tasks, projects, fetchTasks, currentUser }) => {
  const myTasks = tasks.filter(t => t.assignee === currentUser.username && t.approval_status === 'approved' && t.acceptance_status !== 'passed');
  
  const pending = myTasks.filter(t => t.acceptance_status === 'pending_acceptance');
  const accepted = myTasks.filter(t => t.acceptance_status === 'accepted' && t.status !== 'done');

  const [showSelfAssign, setShowSelfAssign] = useState(false);
  const [selfForm, setSelfForm] = useState({ 
    title: '', 
    description: '', 
    project_id: '', 
    crisp_dm_phase: (TEAM_PHASES[currentUser.team] || PHASES)[0], 
    start_date: new Date().toISOString().slice(0, 16),
    due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 16) 
  });

  const handleSelfAssign = async (e) => {
    e.preventDefault();
    const payload = { ...selfForm, assignee: currentUser.username, team: currentUser.team, created_by: currentUser.username, approval_status: 'pending_approval', acceptance_status: 'accepted' };
    await apiFetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setShowSelfAssign(false);
    fetchTasks();
    await appAlert('Task submitted for leader approval.', 'Submitted');
  };

  const updateAcceptance = async (task, status) => {
    const payload = { ...task, acceptance_status: status };
    if (status === 'accepted') {
      const now = new Date().toISOString().split('.')[0].replace('T',' ');
      payload.accepted_at = now;
    } else if (status === 'passed') {
      payload.assignee = ''; // Send back to pool
    }
    await apiFetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    if(status === 'passed') {
        logAudit(currentUser, 'TASK_PASSED', `Passed on task: ${task.title}`);
        // Notify leader? We don't have leader directly, so just team broadcast could work, but passing is normal.
    }
    fetchTasks();
  };

  const handleStatusChange = async (task, newStatus) => {
    let resolution_note = task.resolution_note || '';
    let completed_by = task.completed_by || '';
    const now = new Date().toISOString().split('.')[0].replace('T',' ');
    
    // Business Rule: Members can't move to 'done' directly
    if (newStatus === 'done' && currentUser.role === 'member') {
        newStatus = 'review';
    }

    const payload = { ...task, status: newStatus };
    
    if (newStatus === 'review') {
        payload.acceptance_status = 'pending_acceptance'; // Reset for leader to accept the review
        logAudit(currentUser, 'TASK_SUBMITTED_FOR_REVIEW', `Submitted task "${task.title}" for leader review.`);
        sendChannelMessage(task.team, '🤖 System', `🔍 Task submitted for review: [TASK:${task.id}:${task.title}] by @${currentUser.username}. Leaders, please verify.`);
    }

    if (newStatus === 'done' && task.status !== 'done') {
      const note = await appPrompt("Task completed! Enter a resolution or completion note:", "", 'Completion Note');
      if (note === null) return; 
      resolution_note = note;
      completed_by = currentUser.username;
      payload.resolution_note = resolution_note;
      payload.completed_by = completed_by;
      payload.resolved_at = now;
    }
    
    await apiFetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    logAudit(currentUser, 'TASK_STATUS_CHANGED', `Moved task "${task.title}" to ${newStatus}`);
    fetchTasks();
  };

  const renderTask = (task, isPending) => {
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
      <div class="info-block task-card-clickable" style="padding:1rem;margin-bottom:0.75rem;border-left:4px solid ${isPending ? 'var(--accent-orange)' : 'var(--accent-blue)'};">
        <!-- Top row: title + actions -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:0.95rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${task.title}</div>
            ${task.description && html`<div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem;line-height:1.4;">${task.description}</div>`}
          </div>
          <div style="flex-shrink:0;">
            ${isPending ? html`
              <div style="display:flex;gap:0.5rem;">
                <button class="btn" style="background:var(--accent-green);color:white;padding:0.35rem 0.75rem;font-size:0.82rem;white-space:nowrap;" onClick=${() => updateAcceptance(task, 'accepted')}><i class="fa-solid fa-check"></i> Accept</button>
                <button class="btn" style="color:var(--accent-orange);border:1px solid var(--accent-orange);padding:0.35rem 0.75rem;font-size:0.82rem;white-space:nowrap;" onClick=${() => updateAcceptance(task, 'passed')}><i class="fa-solid fa-xmark"></i> Pass</button>
              </div>
            ` : task.status === 'done' ? html`<span class="tag color-green" style="font-size:0.75rem;"><i class="fa-solid fa-check-double"></i> Done</span>` 
              : task.status === 'review' ? html`<span class="tag color-eval" style="font-size:0.75rem;"><i class="fa-solid fa-hourglass-half"></i> In Review</span>`
              : html`
              <div style="display:flex;gap:0.4rem;align-items:center;">
                <select class="form-select" style="font-size:0.8rem;min-width:130px;" value=${task.status} onChange=${e => handleStatusChange(task, e.target.value)}>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Submit for Review</option>
                </select>
                ${task.status === 'in_progress' && html`<button class="btn" style="background:var(--accent-purple);padding:0.3rem 0.6rem;font-size:0.75rem;" onClick=${() => handleStatusChange(task, 'review')}>Submit</button>`}
              </div>
            `}
          </div>
        </div>
        <!-- Bottom row: metadata tags -->
        <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin-top:0.6rem;">
          <span class="tag ${getPhaseClass(task.crisp_dm_phase)}" style="font-size:0.68rem;">${task.crisp_dm_phase}</span>
          ${proj && html`<span style="font-size:0.73rem;color:var(--text-secondary);"><i class="fa-solid fa-folder-open" style="margin-right:0.25rem;"></i>${proj.id}</span>`}
          ${task.due_date && html`
            <span style="font-size:0.73rem;color:${isOverdue ? 'var(--accent-pink)' : 'var(--text-secondary)'};">
              <i class="fa-solid fa-calendar" style="margin-right:0.25rem;"></i>Due: ${task.due_date}
            </span>
          `}
          ${dueDateBadge && html`<span class="tag" style="font-size:0.65rem;border:1px solid currentColor;color:${dueDateBadge.color};">${dueDateBadge.label}</span>`}
          ${!isPending && html`<span class="tag" style="background:${STATUS_META[task.status]?.bg};color:${STATUS_META[task.status]?.color};font-size:0.68rem;margin-left:auto;">${STATUS_META[task.status]?.label}</span>`}
        </div>
      </div>
    `;
  };


  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title">My Tasks</h2>
          <p class="page-subtitle">Your personal daily workspace</p>
        </div>
        <button class="btn active" style="background:var(--accent-blue);" onClick=${() => setShowSelfAssign(!showSelfAssign)}><i class="fa-solid fa-plus"></i> Self-Assign Task</button>
      </div>

      ${showSelfAssign && html`
        <div class="info-block" style="margin-bottom:1.5rem;border:1px solid var(--accent-blue);">
          <div class="section-title">Create Self-Assigned Task (Requires Approval)</div>
          <form onSubmit=${handleSelfAssign} style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <input class="form-input" placeholder="Task Title" value=${selfForm.title} onInput=${e => setSelfForm({...selfForm, title: e.target.value})} required />
            <select class="form-select" value=${selfForm.project_id} onChange=${e => setSelfForm({...selfForm, project_id: e.target.value})}>
              <option value="">— No Project —</option>
              ${projects.map(p => html`<option value=${p.id}>${p.id} - ${p.title}</option>`)}
            </select>
            <textarea class="form-input" style="grid-column:1/-1;" placeholder="Description" value=${selfForm.description} onInput=${e => setSelfForm({...selfForm, description: e.target.value})}></textarea>
            <select class="form-select" value=${selfForm.crisp_dm_phase} onChange=${e => setSelfForm({...selfForm, crisp_dm_phase: e.target.value})}>
              ${(TEAM_PHASES[currentUser.team] || PHASES).map(p => html`<option value=${p}>${p}</option>`)}
            </select>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;grid-column:1/-1;">
              <div><label style="font-size:0.7rem;color:var(--text-secondary);">Start Date</label><input class="form-input" type="datetime-local" value=${selfForm.start_date} onInput=${e => setSelfForm({...selfForm, start_date: e.target.value})} required /></div>
              <div><label style="font-size:0.7rem;color:var(--text-secondary);">End Date</label><input class="form-input" type="datetime-local" value=${selfForm.due_date} onInput=${e => setSelfForm({...selfForm, due_date: e.target.value})} required /></div>
            </div>
            <div style="grid-column:1/-1;text-align:right;"><button type="submit" class="btn active" style="background:var(--accent-green);">Submit for Approval</button></div>
          </form>
        </div>
      `}

      <div class="grid-2">
        <div>
          <h3 style="margin-bottom:1rem;color:var(--accent-orange);"><i class="fa-solid fa-bell"></i> Pending Acceptance (${pending.length})</h3>
          ${pending.length === 0 ? html`<div class="info-block" style="opacity:0.5;text-align:center;">No pending tasks.</div>` : pending.map(t => renderTask(t, true))}
        </div>
        <div>
          <h3 style="margin-bottom:1rem;color:var(--accent-blue);"><i class="fa-solid fa-person-digging"></i> Active Work (${accepted.length})</h3>
          ${accepted.length === 0 ? html`<div class="info-block" style="opacity:0.5;text-align:center;">No active tasks.</div>` : accepted.map(t => renderTask(t, false))}
        </div>
      </div>

      <!-- Historical Analytics -->
      ${(() => {
        const done = tasks.filter(t => t.assignee === currentUser.username && t.status === 'done');
        if (done.length === 0) return null;
        const ttrs = done.filter(t => t.accepted_at && t.resolved_at).map(t => formatDuration(t.accepted_at, t.resolved_at).hours);
        const avgTTRHrs = ttrs.length ? (ttrs.reduce((a,b) => a+b, 0)/ttrs.length) : 0;
        const avgTTR = avgTTRHrs ? `${Math.floor(avgTTRHrs/24)}d ${Math.round(avgTTRHrs%24)}h` : '—';
        return html`
          <div style="margin-top:2rem;">
            <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1rem;justify-content:space-between;">
              <h3 style="color:var(--accent-green);margin:0;"><i class="fa-solid fa-chart-line"></i> Task History & Analytics (${done.length} completed)</h3>
              <span style="font-size:0.8rem;color:var(--text-secondary);">Avg TTR: <strong style="color:var(--accent-purple);">${avgTTR}</strong></span>
            </div>
            <div style="overflow-x:auto;">
              <table class="data-grid-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Project</th>
                    <th>Phase</th>
                    <th>Accepted</th>
                    <th>Completed</th>
                    <th>TTR</th>
                    <th>TLC</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  ${done.map(t => {
                    const proj = projects.find(p => p.id === t.project_id);
                    const ttr = formatDuration(t.accepted_at, t.resolved_at);
                    const tlc = formatDuration(t.created_at, t.resolved_at);
                    const ttrClass = ttr.hours === null ? '' : ttr.hours > 168 ? 'sla-breach' : ttr.hours > 72 ? 'sla-warn' : 'sla-good';
                    return html`
                      <tr style="border-bottom:1px solid var(--border-color);">
                        <td style="padding:0.6rem 0.9rem;font-weight:600;">${t.title}</td>
                        <td style="font-size:0.78rem;">${proj ? html`<span title=${proj.title}>${t.project_id}</span>` : html`<span style="color:var(--text-secondary);">—</span>`}</td>
                        <td><span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span></td>
                        <td style="font-size:0.78rem;color:var(--text-secondary);">${t.accepted_at ? t.accepted_at.split(' ')[0] : '—'}</td>
                        <td style="font-size:0.78rem;color:var(--accent-green);">${t.resolved_at ? t.resolved_at.split(' ')[0] : '—'}</td>
                        <td>${ttr.label !== '—' ? html`<span class="tag ${ttrClass}" style="font-size:0.72rem;">${ttr.label}</span>` : '—'}</td>
                        <td style="font-size:0.78rem;color:var(--text-secondary);">${tlc.label}</td>
                        <td style="font-size:0.78rem;color:var(--text-secondary);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title=${t.resolution_note||''}>${t.resolution_note || '—'}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        `;
      })()}
    </div>
  `;
};



export const TeamPoolView = ({ tasks, projects, fetchTasks, currentUser }) => {
  const isAdmin = currentUser.role === 'admin';
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
                  <div style="font-weight:600;font-size:1.05rem;margin-bottom:0.25rem;">${task.title}</div>
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


export const ApprovalsView = ({ tasks, fetchTasks, currentUser, projects }) => {
  const isAdmin = currentUser.role === 'admin';
  const myTeam = currentUser.team;

  // 1. Creation Approvals (for self-assigned tasks)
  const creationApprovals = tasks.filter(t => (isAdmin || t.team === myTeam) && t.approval_status === 'pending_approval');
  
  // 2. Task Reviews (Submitted by members)
  const reviewTasks = tasks.filter(t => (isAdmin || t.team === myTeam) && t.status === 'review');
  const reviewPool = reviewTasks.filter(t => t.acceptance_status === 'pending_acceptance');
  const activeReviews = reviewTasks.filter(t => t.acceptance_status === 'accepted');

  const processApproval = async (task, isApproved) => {
    if (isApproved) {
      await apiFetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({...task, approval_status: 'approved'}) });
      sendNotification(task.created_by, `Your self-assigned task "${task.title}" was approved.`, task.id);
      sendChannelMessage(task.team, '🤖 System', `✅ Self-assigned task approved: [TASK:${task.id}:${task.title}] by @${task.created_by} is now active.`);
    } else {
      await apiFetch('/api/tasks/' + task.id, { method: 'DELETE' });
      sendNotification(task.created_by, `Your self-assigned task "${task.title}" was rejected.`);
      sendChannelMessage(task.team, '🤖 System', `❌ Self-assigned task rejected: "${task.title}" submitted by @${task.created_by}.`);
    }
    logAudit(currentUser, 'TASK_APPROVAL', `${isApproved ? 'Approved' : 'Rejected'} task "${task.title}" from ${task.created_by}`);
    fetchTasks();
  };

  const handleReviewAccept = async (task) => {
    await apiFetch('/api/tasks/' + task.id, { 
      method: 'PUT', headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({...task, acceptance_status: 'accepted'}) 
    });
    logAudit(currentUser, 'TASK_REVIEW_ACCEPTED', `Leader ${currentUser.username} accepted task "${task.title}" for verification.`);
    fetchTasks();
  };

  const handleReviewFinish = async (task, approved) => {
    if (approved) {
        const note = await appPrompt("Verify completion. Add a closing note if needed:", task.resolution_note || "", 'Verify Completion');
        if (note === null) return;
        const now = new Date().toISOString().split('.')[0].replace('T',' ');
        await apiFetch('/api/tasks/' + task.id, { 
          method: 'PUT', headers: {'Content-Type':'application/json'}, 
          body: JSON.stringify({...task, status: 'done', resolution_note: note, completed_by: task.assignee, resolved_at: now}) 
        });
        sendNotification(task.assignee, `Your task "${task.title}" has been verified and marked DONE.`, task.id);
    } else {
        const reason = await appPrompt("Task rejected. Why does it need more work?", "", 'Return to In Progress');
        if (reason === null) return;
        await apiFetch('/api/tasks/' + task.id, { 
          method: 'PUT', headers: {'Content-Type':'application/json'}, 
          body: JSON.stringify({...task, status: 'in_progress', acceptance_status: 'accepted'}) 
        });
        sendNotification(task.assignee, `Changes requested for "${task.title}": ${reason}`, task.id);
    }
    fetchTasks();
  };

  const renderTask = (t, type) => {
    const proj = (projects||[]).find(p => p.id === t.project_id);
    return html`
      <div class="info-block" style="padding:1rem;margin-bottom:0.75rem;border-left:4px solid ${type==='creation'?'var(--accent-orange)':type==='pool'?'var(--accent-purple)':'var(--accent-green)'};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:0.95rem;">${t.title}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem;">By: <strong>@${t.assignee || t.created_by}</strong> ${proj ? ` | Project: ${proj.id}` : ''}</div>
          </div>
          <div style="flex-shrink:0;display:flex;gap:0.4rem;">
            ${type === 'creation' && html`
               <button class="btn" style="background:var(--accent-green);color:white;padding:0.3rem 0.6rem;font-size:0.75rem;" onClick=${() => processApproval(t, true)}>Approve</button>
               <button class="btn" style="border:1px solid var(--accent-orange);color:var(--accent-orange);padding:0.3rem 0.6rem;font-size:0.75rem;" onClick=${() => processApproval(t, false)}>Reject</button>
            `}
            ${type === 'pool' && html`
               <button class="btn active" style="background:var(--accent-purple);padding:0.35rem 0.75rem;font-size:0.82rem;" onClick=${() => handleReviewAccept(t)}>Accept Review</button>
            `}
            ${type === 'active' && html`
               <button class="btn" style="background:var(--accent-green);color:white;padding:0.3rem 0.6rem;font-size:0.75rem;" onClick=${() => handleReviewFinish(t, true)}>Verify Done</button>
               <button class="btn" style="border:1px solid var(--accent-orange);color:var(--accent-orange);padding:0.3rem 0.6rem;font-size:0.75rem;" onClick=${() => handleReviewFinish(t, false)}>Reject</button>
            `}
          </div>
        </div>
      </div>
    `;
  };

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title"><i class="fa-solid fa-stamp" style="margin-right:0.6rem;color:var(--accent-orange);"></i>Management Approvals</h2>
          <p class="page-subtitle">Verify task completions, manage team workload, and approve new initiatives</p>
        </div>
      </div>

      <div class="grid-3" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1.5rem;">
        <!-- Column 1: Creation Requests -->
        <div class="metric-card" style="padding:1.25rem;border-top:3px solid var(--accent-orange);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;">
               <h3 style="font-size:0.95rem;font-weight:700;color:var(--accent-orange);margin:0;"><i class="fa-solid fa-plus-circle"></i> Creation Requests</h3>
               <span style="font-size:0.75rem;background:rgba(251,146,60,0.15);color:var(--accent-orange);padding:0.1rem 0.5rem;border-radius:10px;font-weight:700;">${creationApprovals.length}</span>
            </div>
            ${creationApprovals.length > 0 && html`
               <button class="btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;background:var(--accent-green);color:white;" onClick=${async () => {
                 for (const t of creationApprovals) await processApproval(t, true);
               }}><i class="fa-solid fa-check-double"></i> Bulk Approve</button>
            `}
          </div>
          ${creationApprovals.length === 0 
            ? html`<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-style:italic;font-size:0.85rem;border:1px dashed var(--border-color);border-radius:8px;">Queue is clear.</div>` 
            : creationApprovals.map(t => renderTask(t, 'creation'))
          }
        </div>

        <!-- Column 2: Review Pool -->
        <div class="metric-card" style="padding:1.25rem;border-top:3px solid var(--accent-purple);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
            <h3 style="font-size:0.95rem;font-weight:700;color:var(--accent-purple);margin:0;"><i class="fa-solid fa-inbox"></i> Review Pool</h3>
            <span style="font-size:0.75rem;background:rgba(167,139,250,0.15);color:var(--accent-purple);padding:0.1rem 0.5rem;border-radius:10px;font-weight:700;">${reviewPool.length}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;font-style:italic;">Tasks submitted by members awaiting leader acceptance.</div>
          ${reviewPool.length === 0 
            ? html`<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-style:italic;font-size:0.85rem;border:1px dashed var(--border-color);border-radius:8px;">No tasks pending review.</div>` 
            : reviewPool.map(t => renderTask(t, 'pool'))
          }
        </div>

        <!-- Column 3: Active Reviews -->
        <div class="metric-card" style="padding:1.25rem;border-top:3px solid var(--accent-green);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
            <h3 style="font-size:0.95rem;font-weight:700;color:var(--accent-green);margin:0;"><i class="fa-solid fa-magnifying-glass-chart"></i> Active Reviews</h3>
            <span style="font-size:0.75rem;background:rgba(74,222,128,0.15);color:var(--accent-green);padding:0.1rem 0.5rem;border-radius:10px;font-weight:700;">${activeReviews.length}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;font-style:italic;">Your current verification workload.</div>
          ${activeReviews.length === 0 
            ? html`<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-style:italic;font-size:0.85rem;border:1px dashed var(--border-color);border-radius:8px;">No active reviews.</div>` 
            : activeReviews.map(t => renderTask(t, 'active'))
          }
        </div>
      </div>
    </div>
  `;
};

export const TeamDashboardView = ({ tasks, projects, users, fetchTasks, currentUser }) => {
  const teamTasks = tasks.filter(t => t.team === currentUser.team && t.approval_status === 'approved');
  const teamMembers = users.filter(u => u.team === currentUser.team && u.role === 'member');
  
  const [showAssign, setShowAssign] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', project_id: '', crisp_dm_phase: (TEAM_PHASES[currentUser.team] || PHASES)[0], assignee: '', due_date: '' });

  const handleAssign = async (e) => {
    e.preventDefault();
    const payload = { ...form, team: currentUser.team, created_by: currentUser.username, approval_status: 'approved', acceptance_status: form.assignee ? 'pending_acceptance' : 'accepted' };
    const res = await apiFetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const created = await res.json();
    const taskId = created.id || '';
    if (form.assignee) {
      sendNotification(form.assignee, `You have been assigned a new task: "${form.title}"`, taskId);
      sendChannelMessage(currentUser.team, '🤖 System', `📋 Task assigned to @${form.assignee}: [TASK:${taskId}:${form.title}] — Phase: ${form.crisp_dm_phase}`);
    } else {
      sendChannelMessage(currentUser.team, '🤖 System', `📥 New task added to the team pool: [TASK:${taskId}:${form.title}] — Phase: ${form.crisp_dm_phase}. Available for anyone to claim.`);
    }
    logAudit(currentUser, 'TASK_ASSIGNED', `Leader ${currentUser.username} assigned task "${form.title}" to ${form.assignee || 'pool'}`);
    setShowAssign(false);
    setForm({ 
      title: '', 
      description: '', 
      project_id: '', 
      crisp_dm_phase: (TEAM_PHASES[currentUser.team] || PHASES)[0], 
      assignee: '', 
      start_date: new Date().toISOString().slice(0, 16),
      due_date: new Date(Date.now() + 86400000).toISOString().slice(0, 16) 
    });
    fetchTasks();
  };

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

  return html`
    <div>
      <div class="page-header">
        <div><h2 class="page-title">Team Oversight</h2><p class="page-subtitle">Manage workload, assign tasks, and submit phases</p></div>
        <button class="btn active" style="background:var(--accent-purple);" onClick=${() => setShowAssign(!showAssign)}><i class="fa-solid fa-user-plus"></i> Assign New Task</button>
      </div>

      <${PhaseSubmissionPanel} projects=${projects} currentUser=${currentUser} fetchProjects=${() => apiFetch('/api/projects').then(r=>r.json())} />

      ${showAssign && html`
        <div class="info-block" style="margin-bottom:1.5rem;border:1px solid var(--accent-purple);">
          <div class="section-title">Assign Task</div>
          <form onSubmit=${handleAssign} style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <input class="form-input" placeholder="Task Title" value=${form.title} onInput=${e => setForm({...form, title: e.target.value})} required />
            <select class="form-select" value=${form.project_id} onChange=${e => setForm({...form, project_id: e.target.value})}>
              <option value="">— No Project —</option>
              ${projects.map(p => html`<option value=${p.id}>${p.id} - ${p.title}</option>`)}
            </select>
            <textarea class="form-input" style="grid-column:1/-1;" placeholder="Description" value=${form.description} onInput=${e => setForm({...form, description: e.target.value})}></textarea>
            <select class="form-select" value=${form.crisp_dm_phase} onChange=${e => setForm({...form, crisp_dm_phase: e.target.value})}>
              ${(TEAM_PHASES[currentUser.team] || PHASES).map(p => html`<option value=${p}>${p}</option>`)}
            </select>
            <select class="form-select" value=${form.assignee} onChange=${e => setForm({...form, assignee: e.target.value})}>
              <option value="">— Unassigned (Send to Pool) —</option>
              ${teamMembers.map(m => html`<option value=${m.username}>${m.username}</option>`)}
            </select>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;grid-column:1/-1;">
              <div><label style="font-size:0.7rem;color:var(--text-secondary);">Start Date</label><input class="form-input" type="datetime-local" value=${form.start_date} onInput=${e => setForm({...form, start_date: e.target.value})} required /></div>
              <div><label style="font-size:0.7rem;color:var(--text-secondary);">End Date</label><input class="form-input" type="datetime-local" value=${form.due_date} onInput=${e => setForm({...form, due_date: e.target.value})} required /></div>
            </div>
            <div style="grid-column:1/-1;text-align:right;"><button type="submit" class="btn active" style="background:var(--accent-purple);">Create Assignment</button></div>
          </form>
        </div>
      `}

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
            ${teamTasks.map(t => html`
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
                <td style="color:${new Date(t.due_date)<new Date()&&t.status!=='done'?'var(--accent-pink)':'var(--text-primary)'}">${t.due_date}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>

      ${selectedTasksForBulk.size > 0 && html`
        <div style="position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);background:var(--bg-panel);backdrop-filter:blur(10px);padding:1rem 2rem;border-radius:999px;border:1px solid var(--border-color);box-shadow:var(--shadow-lg);display:flex;align-items:center;gap:1.5rem;z-index:100;">
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

      ${selectedTask && html`<${TaskDetailModal} task=${selectedTask} projects=${projects} currentUser=${currentUser} fetchTasks=${fetchTasks} onClose=${() => setSelectedTask(null)} />`}
    </div>
  `;
};




export const TaskCommentThread = ({ taskId, taskTitle, taskAssignee, taskTeam, currentUser }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const endRef = useRef(null);

  const fetchComments = async () => {
    try {
      const res = await apiFetch('/api/task-comments?task_id=' + taskId);
      if (res.ok) setComments(await res.json());
    } catch(e) {}
  };

  useEffect(() => { if (taskId) fetchComments(); }, [taskId]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }); }, [comments]);

  const postComment = async () => {
    if (!newComment.trim() || posting) return;
    setPosting(true);
    await apiFetch('/api/task-comments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, author: currentUser.username, content: newComment.trim() })
    });
    // Notify assignee if comment is from someone else
    if (taskAssignee && taskAssignee !== currentUser.username) {
      sendNotification(taskAssignee, `@${currentUser.username} commented on your task "${taskTitle || 'Task #'+taskId}": "${newComment.trim().substring(0,80)}"`, taskId);
    }
    // Also notify in team channel
    if (taskTeam) {
      sendChannelMessage(taskTeam, currentUser.username, `\ud83d\udcac Comment on [TASK:${taskId}:${taskTitle || 'Task'}]: "${newComment.trim().substring(0,100)}"${newComment.trim().length > 100 ? '...' : ''}`);
    }
    setNewComment('');
    await fetchComments();
    setPosting(false);
  };

  return html`
    <div style="margin-top:1.25rem;">
      <div style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.75rem;display:flex;align-items:center;gap:0.4rem;">
        <i class="fa-solid fa-comments"></i> Comments <span style="opacity:0.6;">(${comments.length})</span>
      </div>
      <div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.75rem;padding-right:0.25rem;">
        ${comments.length === 0 ? html`
          <div style="font-size:0.8rem;color:var(--text-secondary);font-style:italic;padding:0.5rem 0;">
            No comments yet. Start the conversation.
          </div>
        ` : comments.map(c => html`
          <div class="comment-bubble ${c.author === currentUser.username ? 'mine' : ''}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem;">
              <div style="display:flex;align-items:center;gap:0.4rem;">
                <div class="avatar" style="width:18px;height:18px;font-size:0.5rem;">${c.author.substring(0,2).toUpperCase()}</div>
                <span style="font-size:0.75rem;font-weight:600;">${c.author}</span>
              </div>
              <span style="font-size:0.65rem;color:var(--text-secondary);">${(c.created_at||'').replace('T',' ').substring(0,16)}</span>
            </div>
            <div style="font-size:0.82rem;color:var(--text-primary);white-space:pre-wrap;">${c.content}</div>
          </div>
        `)}
        <div ref=${endRef}></div>
      </div>
      <div style="display:flex;gap:0.5rem;">
        <input class="form-input" style="flex:1;font-size:0.82rem;padding:0.4rem 0.7rem;"
          placeholder="Add a comment... (Enter to send)"
          value=${newComment}
          onInput=${e => setNewComment(e.target.value)}
          onKeyPress=${e => e.key === 'Enter' && !e.shiftKey && postComment()} />
        <button class="btn active" style="background:var(--accent-blue);padding:0.4rem 0.8rem;flex-shrink:0;"
          onClick=${postComment} disabled=${posting}>
          <i class="fa-solid fa-paper-plane"></i>
        </button>
      </div>
    </div>
  `;
};



export const TaskDetailModal = ({ task, projects, currentUser, fetchTasks, onClose }) => {
  if (!task) return null;
  const proj = projects.find(p => p.id === task.project_id);
  const [localStatus, setLocalStatus] = useState(task.status);

  useEffect(() => setLocalStatus(task.status), [task.id]);

  const canChangeStatus = currentUser.role === 'admin'
    || task.assignee === currentUser.username
    || (currentUser.role === 'leader' && task.team === currentUser.team);

  const handleStatusChange = async (newStatus) => {
    let extra = {};
    
    // Business Rule: Members can't move to 'done' directly
    if (newStatus === 'done' && currentUser.role === 'member') {
        newStatus = 'review';
    }

    if (newStatus === 'review') {
        extra.acceptance_status = 'pending_acceptance'; // Reset for leader to accept the review
        sendChannelMessage(task.team, '🤖 System', `🔍 Task submitted for review: [TASK:${task.id}:${task.title}] by @${currentUser.username}. Leaders, please verify.`);
    }

    if (newStatus === 'done' && localStatus !== 'done') {
      const note = await appPrompt('Task completed! Enter a resolution note (optional):', '', 'Completion Note');
      if (note === null) return;
      const now = new Date().toISOString().split('.')[0].replace('T',' ');
      extra = { ...extra, resolution_note: note, completed_by: task.assignee || currentUser.username, resolved_at: now };
    }
    await apiFetch('/api/tasks/' + task.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...task, status: newStatus, ...extra })
    });
    logAudit(currentUser, 'TASK_STATUS_CHANGED', `Moved task "${task.title}" to ${newStatus}`);
    setLocalStatus(newStatus);
    fetchTasks();
  };

  const smeta = STATUS_META[localStatus] || STATUS_META['todo'];

  return html`
    <div class="modal-overlay" onClick=${e => e.target === e.currentTarget && onClose()}>
      <div class="modal-content" style="max-width:640px;">
        <div class="modal-header">
          <div style="flex:1;min-width:0;">
            <div style="font-size:0.73rem;color:var(--text-secondary);margin-bottom:0.2rem;">
              ${proj ? proj.id + ' — ' + proj.title : 'No linked project'}
            </div>
            <div style="font-size:1.2rem;font-weight:700;line-height:1.3;margin-bottom:0.5rem;">${task.title}</div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
              <span class="tag ${getPhaseClass(task.crisp_dm_phase)}">${task.crisp_dm_phase}</span>
              <span class="tag" style="background:${smeta.bg};color:${smeta.color};">${smeta.label}</span>
              ${task.team && html`<span class="tag ${getTeamClass(task.team)}" style="font-size:0.65rem;">${task.team}</span>`}
              <div style="display:flex;gap:0.75rem;font-size:0.73rem;color:var(--text-secondary);margin-top:0.25rem;">
                ${task.start_date && html`<span><i class="fa-solid fa-play" style="font-size:0.6rem;"></i> Start: ${task.start_date.replace('T',' ')}</span>`}
                ${task.due_date && html`<span style="color:${new Date(task.due_date)<new Date()&&localStatus!=='done'?'var(--accent-pink)':'var(--text-secondary)'};">
                  <i class="fa-solid fa-calendar-check"></i> Due: ${task.due_date.replace('T',' ')}
                </span>`}
              </div>
            </div>
          </div>
          <button class="modal-close" onClick=${onClose} style="flex-shrink:0;margin-left:1rem;">✕</button>
        </div>

        <div class="modal-body" style="padding:1.5rem;">
          <div class="grid-2" style="gap:1rem;margin-bottom:1rem;">
            <div class="info-block" style="padding:1rem;">
              <div class="section-title" style="font-size:0.82rem;margin-bottom:0.5rem;"><i class="fa-solid fa-align-left"></i> Description</div>
              <div style="font-size:0.84rem;color:var(--text-secondary);line-height:1.5;">${task.description || 'No description provided.'}</div>
            </div>
            <div class="info-block" style="padding:1rem;">
              <div class="section-title" style="font-size:0.82rem;margin-bottom:0.5rem;"><i class="fa-solid fa-circle-info"></i> Details</div>
              <div style="display:flex;flex-direction:column;gap:0.35rem;font-size:0.82rem;">
                <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Assignee</span><strong>${task.assignee || '—'}</strong></div>
                <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Created by</span><strong>${task.created_by || '—'}</strong></div>
                ${task.created_at && html`<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Created</span><span>${task.created_at}</span></div>`}
                ${task.start_date && html`<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Start Date</span><span>${task.start_date.replace('T',' ')}</span></div>`}
                ${task.status === 'done' && task.completed_by && html`<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Completed by</span><strong style="color:var(--accent-green);">${task.completed_by}</strong></div>`}
                ${task.resolved_at && html`<div style="display:flex;justify-content:space-between;"><span style="color:var(--text-secondary);">Resolved</span><span>${task.resolved_at}</span></div>`}
              </div>
            </div>
          </div>

          ${task.resolution_note && task.status === 'done' && html`
            <div class="info-block action-block" style="padding:0.75rem 1rem;margin-bottom:1rem;">
              <div style="font-size:0.75rem;font-weight:600;color:var(--accent-green);margin-bottom:0.25rem;"><i class="fa-solid fa-check-double"></i> Resolution Note</div>
              <div style="font-size:0.84rem;">${task.resolution_note}</div>
            </div>
          `}

          ${canChangeStatus && localStatus !== 'done' && html`
            <div style="margin-bottom:1rem;">
              <div style="font-size:0.78rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em;">Move to Status</div>
              <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                ${(() => {
                  const available = TASK_STATUSES.filter(s => s !== localStatus);
                  const isMember = currentUser.role === 'member';
                  return available.map(s => {
                    // Hide 'done' for members
                    if (isMember && s === 'done') return null;
                    // Label 'review' as 'Submit for Review' for members
                    const label = (isMember && s === 'review') ? 'Submit for Review' : STATUS_META[s].label;
                    return html`
                      <button class="btn" style="font-size:0.78rem;color:${STATUS_META[s].color};border:1px solid ${STATUS_META[s].color}30;background:${STATUS_META[s].bg};"
                        onClick=${() => handleStatusChange(s)}>
                        <i class="fa-solid fa-arrow-right"></i> ${label}
                      </button>
                    `;
                  });
                })()}
              </div>
            </div>
          `}

          <${TaskCommentThread} taskId=${task.id} taskTitle=${task.title} taskAssignee=${task.assignee} taskTeam=${task.team} currentUser=${currentUser} />
        </div>
      </div>
    </div>
  `;
};


