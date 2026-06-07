import { formatDuration, getTeamClass, appPrompt, ProjectBadges, appConfirm, sendNotification, getPhaseClass, sendChannelMessage, appAlert, logAudit, apiFetch, hasPermission } from '../utils/core.js';
import { getPhases, getTeams, getTeamPhases, getUsers } from '../utils/configStore.js';
import { TaskFocusModal, PhaseSubmitModal } from './FocusModal.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
export const STATUS_META = {
  todo:        { label: 'To Do',      color: 'var(--text-secondary)',  bg: 'rgba(255,255,255,0.06)' },
  in_progress: { label: 'In Progress',color: 'var(--accent-blue)',     bg: 'rgba(59,130,246,0.12)' },
  review:      { label: 'In Review',  color: 'var(--accent-purple)',   bg: 'rgba(139,92,246,0.12)' },
  done:        { label: 'Done',       color: 'var(--accent-green)',    bg: 'rgba(16,185,129,0.12)' },
};

// Re-export modularized views to ensure zero disruption to importing components (like Communications.js)
import { MyTasksView } from './MyTasksView.js';
import { TeamPoolView } from './TeamPoolView.js';
import { ApprovalsView } from './ApprovalsView.js';
import { TeamDashboardView } from './TeamDashboardView.js';

export { MyTasksView, TeamPoolView, ApprovalsView, TeamDashboardView };

export const TaskManagementTab = ({ projects, tasks, fetchTasks, currentUser }) => {
  const isAdmin  = hasPermission(currentUser, 'admin.panel');
  const isMember = !hasPermission(currentUser, 'task.approve');
  const isLeader = hasPermission(currentUser, 'task.approve') && !hasPermission(currentUser, 'admin.panel');

  const canCreateTask = hasPermission(currentUser, 'task.create');
  const canUpdateTask = hasPermission(currentUser, 'task.update');
  const canDeleteTask = hasPermission(currentUser, 'task.delete');

  const [filterStatus,  setFilterStatus]  = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  // FocusModal state
  const [showFocusModal, setShowFocusModal] = useState(false);
  const [focusEditTask,  setFocusEditTask]  = useState(null);

  const handleDelete = async (task) => {
    const confirmed = await appConfirm(`Delete task "${task.title}"?`, 'Delete Task');
    if (!confirmed) return;
    await apiFetch('/api/tasks/' + task.id, { method: 'DELETE' });
    logAudit(currentUser, 'TASK_DELETED', `Deleted task: ${task.title} (ID ${task.id})`);
    fetchTasks();
  };

  const handleStatusChange = async (task, newStatus) => {
    if (task.is_blocked && newStatus !== task.status) {
        appAlert("This task is blocked. Unblock it first.");
        return;
    }
    // Business Rule: Members can't move to 'done' directly
    if (newStatus === 'done' && !hasPermission(currentUser, 'task.approve')) {
        newStatus = 'review';
    }

    const payload = { ...task, status: newStatus };
    delete payload.created_at; // strip for update

    if (newStatus === 'review') {
        payload.acceptance_status = 'pending_acceptance';
        sendChannelMessage(task.team, '🤖 System', `🔍 Task submitted for review: [TASK:${task.id}:${task.title}] by @${currentUser.username}.`);
    }

    if (newStatus === 'done' && task.status !== 'done') {
        const hours = await appPrompt('How many actual hours were spent on this task?', task.estimated_hours || '0', 'Actual Effort');
        if (hours === null) return;
        payload.actual_hours = parseFloat(hours) || 0;
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
        ${canCreateTask && html`
        <button class="btn active" style="background:var(--accent-green);color:white;"
          onClick=${() => { setFocusEditTask(null); setShowFocusModal(true); }}>
          <i class="fa-solid fa-plus"></i> New Task
        </button>
        `}
      </div>


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
                let dueDateBadge = null;
                if (task.due_date && task.status !== 'done') {
                  const d    = new Date(task.due_date.replace(' ', 'T'));
                  const now  = new Date();
                  const diff = Math.floor((d - now) / (1000 * 60 * 60 * 24));
                  if (diff < 0)      dueDateBadge = { label: 'Overdue',  color: 'var(--accent-pink)'   };
                  else if (diff === 0) dueDateBadge = { label: 'Due Today', color: 'var(--accent-orange)' };
                  else if (diff <= 2)  dueDateBadge = { label: 'Due Soon',  color: 'var(--accent-purple)' };
                }
                const isOverdue  = dueDateBadge?.label === 'Overdue';
                const borderCol  = task.is_blocked ? 'var(--accent-pink)' : (STATUS_META[task.status]?.color || 'var(--border-color)');

                return html`
                  <div class=${`bento-card ${task.is_blocked ? 'task-card-blocked' : ''}`}
                    style="padding:1.1rem;margin-bottom:0;border-left:4px solid ${borderCol};cursor:default;">

                    <!-- Card Header -->
                    <div style="font-weight:700;font-size:0.88rem;margin-bottom:0.35rem;line-height:1.35;display:flex;align-items:flex-start;gap:0.4rem;flex-wrap:wrap;">
                      ${task.title}
                      ${task.is_blocked ? html`<span class="tag" style="background:var(--accent-pink);color:white;font-size:0.6rem;flex-shrink:0;">BLOCKED</span>` : null}
                    </div>
                    ${task.description && html`<div style="font-size:0.76rem;color:var(--text-secondary);margin-bottom:0.4rem;line-height:1.4;">${task.description}</div>`}

                    <!-- Project row -->
                    ${proj && html`<div style="font-size:0.7rem;margin-bottom:0.5rem;display:flex;align-items:center;gap:0.35rem;">
                      <i class="fa-solid fa-folder-open" style="color:var(--accent-blue);opacity:0.8;"></i>
                      <span class="font-mono-data" style="color:var(--text-primary);font-weight:600;">${proj.id}</span>
                      <span style="color:var(--text-secondary);opacity:0.7;">— ${proj.title}</span>
                      <${ProjectBadges} project=${proj} />
                    </div>`}

                    <!-- Move controls -->
                    ${canUpdateTask && html`
                    <div style="display:flex;gap:0.25rem;margin-bottom:0.45rem;flex-wrap:wrap;">
                      ${(() => {
                        const isMember = !hasPermission(currentUser, 'task.approve');
                        return TASK_STATUSES.filter(s => s !== task.status).map(s => {
                          if (isMember && s === 'done') return null;
                          const label = (isMember && s === 'review') ? 'Submit' : STATUS_META[s].label;
                          return html`
                            <button class="btn" style="font-size:0.63rem;padding:0.12rem 0.38rem;color:${STATUS_META[s].color};" onClick=${() => handleStatusChange(task, s)}>
                              ${label}
                            </button>
                          `;
                        });
                      })()}
                    </div>
                    `}

                    <!-- Edit/Delete actions -->
                    <div style="display:flex;gap:0.35rem;border-top:1px solid rgba(255,255,255,0.04);padding-top:0.45rem;margin-bottom:0.45rem;">
                      <button class="btn" style="flex:1;font-size:0.7rem;color:var(--accent-blue);"
                        disabled=${!canUpdateTask}
                        title=${!canUpdateTask ? "You do not have permission to edit tasks" : ""}
                        onClick=${() => { setFocusEditTask(task); setShowFocusModal(true); }}>
                        <i class="fa-solid fa-pen"></i> ${canUpdateTask ? 'Edit' : 'Edit (Locked)'}
                      </button>
                      ${(isAdmin || task.created_by === currentUser.username) && canDeleteTask && html`
                        <button class="btn" style="font-size:0.7rem;color:var(--accent-orange);" onClick=${() => handleDelete(task)}>
                          <i class="fa-solid fa-trash"></i>
                        </button>
                      `}
                    </div>

                    <!-- Card footer metadata badges -->
                    <div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap;border-top:1px solid rgba(255,255,255,0.04);padding-top:0.45rem;">
                      <span class="tag ${getPhaseClass(task.crisp_dm_phase)}" style="font-size:0.6rem;">${task.crisp_dm_phase}</span>
                      ${task.assignee && html`
                        <span class="font-mono-data" style="font-size:0.68rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.2rem;">
                          <i class="fa-solid fa-user" style="opacity:0.65;"></i> @${task.assignee}
                        </span>
                      `}
                      ${task.team && html`
                        <span class="tag ${getTeamClass(task.team)}" style="font-size:0.6rem;">${task.team}</span>
                      `}
                      ${task.created_at && html`
                        <span class="font-mono-data" style="font-size:0.65rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.2rem;" title="Created">
                          <i class="fa-regular fa-calendar-plus" style="opacity:0.6;"></i> ${task.created_at.split(' ')[0]}
                        </span>
                      `}
                      ${task.start_date && html`
                        <span class="font-mono-data" style="font-size:0.65rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.2rem;">
                          <i class="fa-solid fa-play" style="opacity:0.6;font-size:0.55rem;"></i> ${task.start_date.split('T')[0]}
                        </span>
                      `}
                      ${task.due_date && html`
                        <span class="font-mono-data" style="font-size:0.65rem;color:${isOverdue ? 'var(--accent-pink)' : 'var(--text-secondary)'};display:flex;align-items:center;gap:0.2rem;">
                          <i class="fa-solid fa-calendar-day" style="opacity:0.65;"></i> ${task.due_date.split('T')[0]}
                        </span>
                      `}
                      ${dueDateBadge && html`
                        <span class="tag" style="font-size:0.58rem;border:1px solid currentColor;color:${dueDateBadge.color};padding:0.03rem 0.3rem;">
                          ${dueDateBadge.label}
                        </span>
                      `}
                    </div>
                  </div>
                `;
              })}
            </div>
          `;
        })}
      </div>
    </div>

    <${TaskFocusModal}
      open=${showFocusModal}
      onClose=${() => { setShowFocusModal(false); setFocusEditTask(null); }}
      projects=${projects}
      currentUser=${currentUser}
      editingTask=${focusEditTask}
      onSaved=${() => { fetchTasks(); }}
    />
  `;
};

export const TaskStateTimeline = ({ taskId }) => {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    if (taskId) {
      apiFetch('/api/task_logs/' + taskId).then(r => r.ok ? r.json() : []).then(setLogs).catch(() => {});
    }
  }, [taskId]);

  if (logs.length === 0) return null;

  return html`
    <div style="margin-top:1.25rem;">
      <div style="font-size:0.82rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.75rem;"><i class="fa-solid fa-clock-rotate-left"></i> State Timeline</div>
      <div style="display:flex;flex-direction:column;gap:0.4rem;padding-left:0.5rem;border-left:2px solid var(--border-color);">
        ${logs.map(log => html`
          <div style="position:relative;padding-left:1rem;">
            <div style="position:absolute;left:-1.25rem;top:0.3rem;width:8px;height:8px;border-radius:50%;background:var(--accent-blue);border:2px solid var(--bg-panel);"></div>
            <div style="font-size:0.75rem;color:var(--text-primary);"><strong style="color:var(--text-secondary);">${log.from_state || 'Created'}</strong> → <strong>${log.to_state}</strong></div>
            <div style="font-size:0.65rem;color:var(--text-secondary);">${log.entered_at} by User ID: ${log.actor_id}</div>
          </div>
        `)}
      </div>
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

  const canChangeStatus = hasPermission(currentUser, 'task.update') && (
    hasPermission(currentUser, 'admin.panel')
    || task.assignee === currentUser.username
    || (hasPermission(currentUser, 'task.approve') && task.team === currentUser.team)
  );

  const handleStatusChange = async (newStatus) => {
    let extra = {};
    
    // Business Rule: Members can't move to 'done' directly
    if (newStatus === 'done' && !hasPermission(currentUser, 'task.approve')) {
        newStatus = 'review';
    }

    if (newStatus === 'review') {
        extra.acceptance_status = 'pending_acceptance'; // Reset for leader to accept the review
        sendChannelMessage(task.team, '🤖 System', `🔍 Task submitted for review: [TASK:${task.id}:${task.title}] by @${currentUser.username}. Leaders, please verify.`);
    }

    if (newStatus === 'done' && localStatus !== 'done') {
      const note = await appPrompt('Task completed! Enter a resolution note (optional):', '', 'Completion Note');
      if (note === null) return;
      const hours = await appPrompt('How many actual hours were spent on this task?', task.estimated_hours || '0', 'Actual Effort');
      if (hours === null) return;
      const now = new Date().toISOString().split('.')[0].replace('T',' ');
      extra = { ...extra, resolution_note: note, completed_by: task.assignee || currentUser.username, resolved_at: now, actual_hours: parseFloat(hours) || 0 };
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
            <div style="font-size:1.2rem;font-weight:700;line-height:1.3;margin-bottom:0.5rem;">${task.title} ${task.is_blocked ? html`<span class="tag" style="background:var(--accent-pink);color:white;margin-left:0.5rem;">BLOCKED</span>` : null}</div>
            <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
              <span class="tag ${getPhaseClass(task.crisp_dm_phase)}">${task.crisp_dm_phase}</span>
              <span class="tag" style="background:${smeta.bg};color:${smeta.color};">${smeta.label}</span>
              ${task.team && html`<span class="tag ${getTeamClass(task.team)}" style="font-size:0.65rem;">${task.team}</span>`}
              ${task.is_blocked === 1 ? html`<span class="tag" style="background:var(--accent-pink);color:white;animation:pulse 2s infinite;"><i class="fa-solid fa-lock"></i> BLOCKED</span>` : null}
              <div style="display:flex;gap:0.75rem;font-size:0.73rem;color:var(--text-secondary);margin-top:0.25rem;">
                ${task.start_date && html`<span><i class="fa-solid fa-play" style="font-size:0.6rem;"></i> Start: ${task.start_date.replace('T',' ')}</span>`}
                ${task.due_date && html`<span style="color:${new Date(task.due_date)<new Date()&&localStatus!=='done'?'var(--accent-pink)':'var(--text-secondary)'};">
                  <i class="fa-solid fa-calendar-check"></i> Due: ${task.due_date.replace('T',' ')}
                </span>`}
              </div>
            </div>
          </div>
          <button class="btn" style="color:${task.is_blocked ? 'var(--text-primary)' : 'var(--accent-pink)'};border:1px solid ${task.is_blocked ? 'var(--text-secondary)' : 'var(--accent-pink)'};padding:0.25rem 0.5rem;font-size:0.75rem;" onClick=${async () => {
                    await apiFetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({...task, is_blocked: task.is_blocked ? 0 : 1}) });
                    fetchTasks();
                    onClose();
                  }}>
                    <i class="fa-solid ${task.is_blocked ? 'fa-unlock' : 'fa-lock'}"></i> ${task.is_blocked ? 'Unblock Task' : 'Mark as Blocked'}
                  </button>
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
                  const isMember = !hasPermission(currentUser, 'task.approve');
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

          <${TaskStateTimeline} taskId=${task.id} />
          <${TaskCommentThread} taskId=${task.id} taskTitle=${task.title} taskAssignee=${task.assignee} taskTeam=${task.team} currentUser=${currentUser} />
        </div>
      </div>
    </div>
  `;
};
