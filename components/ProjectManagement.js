import { getTeamClass, ProjectBadges, appConfirm, getHealthStatus, TEAM_PHASES, getPhaseClass, sendChannelMessage, appAlert, getDefaultTeamForPhase, logAudit, getInitials, apiFetch } from '../utils/core.js';
import { PHASES, TEAMS } from '../utils/core.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

export const ProjectsManagementTab = ({ projects, fetchProjects, setEditId }) => {
  const handleDelete = async (id, title) => {
    const confirmed = await appConfirm(`Delete project "${title}"? This removes all history and cannot be undone.`, 'Delete Project');
    if (!confirmed) return;
    const res = await apiFetch('/api/projects/' + id, { method: 'DELETE' });
    if (res.ok) fetchProjects();
    else await appAlert('Failed to delete project.', 'Delete Failed');
  };

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title">Project Management</h2>
          <p class="page-subtitle">View, edit, or delete any project in the system.</p>
        </div>
      </div>
      <div class="info-block" style="padding:0;">
        <table class="data-grid-table">
          <thead>
            <tr>
              <th>ID / Title</th>
              <th>Phase</th>
              <th>Team</th>
              <th>Stakeholder</th>
              <th>Dates</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>${projects.map(p => html`
            <tr>
              <td style="padding:1rem;">
                <div style="font-weight:700;">${p.id}</div>
                <div style="color:var(--text-secondary);margin-bottom:0.4rem;">${p.title}</div>
                <${ProjectBadges} project=${p} />
              </td>
              <td><span class="tag ${getPhaseClass(p.phase)}">${p.phase}</span></td>
              <td style="font-size:0.85rem;">${p.team}</td>
              <td style="font-size:0.8rem;color:var(--accent-orange);font-weight:600;">${Array.isArray(p.stakeholders) && p.stakeholders.length > 0 ? p.stakeholders.join(', ') : (p.stakeholders && p.stakeholders !== '[]' ? p.stakeholders : '—')}</td>
              <td style="font-size:0.8rem;color:var(--text-secondary);">${p.start_date || '-'} to ${p.target_date || '-'}</td>
              <td style="text-align:right;padding-right:1rem;">
                <button class="btn" style="color:var(--accent-blue);" onClick=${() => setEditId(p.id)}>
                  <i class="fa-solid fa-pen"></i> Edit
                </button>
                <button class="btn" style="color:var(--accent-orange);margin-left:0.5rem;" onClick=${() => handleDelete(p.id, p.title)}>
                  <i class="fa-solid fa-trash"></i> Delete
                </button>
              </td>
            </tr>
          `)}</tbody>
        </table>
      </div>
    </div>
  `;
};



export const CreateProjectTab = ({ onSave }) => {
  const [isDeployed, setIsDeployed] = useState(false);
  const [form, setForm] = useState({
    id: '', title: '', description: '', phase: 'Business Understanding',
    team: TEAMS[0], assignee: '', progress: 0, blockers: '',
    nextStep: '', start_date: '', target_date: '', stakeholder: ''
  });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!form.id || !form.title || !form.start_date || !form.target_date) {
      setError('Please fill all required fields including dates.'); return;
    }
    const payload = {
      ...form,
      is_deployed: isDeployed ? 1 : 0,
      blockers: form.blockers.split(',').map(s => s.trim()).filter(Boolean),
      stakeholders: form.stakeholder ? [form.stakeholder] : []
    };
    const res = await apiFetch('/api/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    if (!res.ok) { const err = await res.json(); setError(err.error || 'Failed to create project'); return; }
    onSave();
  };

  return html`
    <div>
      <div class="page-header"><h2 class="page-title">Initialize New Project</h2></div>
      <div class="info-block" style="max-width:640px;margin:0 auto;">
        <div style="margin-bottom:2rem;padding:1rem;border-radius:var(--radius-md);background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);display:flex;align-items:center;gap:1rem;">
          <input type="checkbox" id="deploy_mode" checked=${isDeployed} onChange=${e => setIsDeployed(e.target.checked)} style="transform:scale(1.5);accent-color:var(--accent-blue);cursor:pointer;" />
          <div>
            <label for="deploy_mode" style="font-weight:600;cursor:pointer;color:var(--accent-blue);font-size:1.05rem;display:block;">Mark Project as Deployed to Production</label>
            <span style="font-size:0.85rem;color:var(--text-secondary);">This allows the project to iterate through phases continuously post-launch (CI/CD / DataOps).</span>
          </div>
        </div>
        ${error && html`<div style="color:var(--accent-orange);margin-bottom:1rem;">${error}</div>`}
        <form onSubmit=${submit} style="display:flex;flex-direction:column;gap:1rem;">
          <label>Project ID (e.g. BI-042) *</label>
          <input class="form-input" value=${form.id} onInput=${e => setForm({...form, id: e.target.value})} required />
          <label>Project Title *</label>
          <input class="form-input" value=${form.title} onInput=${e => setForm({...form, title: e.target.value})} required />
          <label>Description</label>
          <textarea class="form-input" value=${form.description} onInput=${e => setForm({...form, description: e.target.value})}></textarea>
          <label>Stakeholder / Beneficiary <span style="font-size:0.78rem;color:var(--text-secondary);">(who this project serves)</span></label>
          <input class="form-input" placeholder="e.g. Finance Division, Marketing Dept., Executive Team..." value=${form.stakeholder} onInput=${e => setForm({...form, stakeholder: e.target.value})} />
          <div class="grid-2">
            <div><label>Start Date *</label><input type="date" class="form-input" style="width:100%;" value=${form.start_date} onInput=${e => setForm({...form, start_date: e.target.value})} required /></div>
            <div><label>Target End Date *</label><input type="date" class="form-input" style="width:100%;" value=${form.target_date} onInput=${e => setForm({...form, target_date: e.target.value})} required /></div>
          </div>
          <label>Phase Iteration</label>
          <select class="form-select" value=${form.phase} onChange=${e => setForm({...form, phase: e.target.value})}>${PHASES.map(p => html`<option value=${p}>${p}</option>`)}</select>
          <label>Owning Team</label>
          <select class="form-select" value=${form.team} onChange=${e => setForm({...form, team: e.target.value})}>
            ${TEAMS.map(t => html`<option value=${t}>${t}</option>`)}
          </select>
          <label>Primary Assignee</label>
          <input class="form-input" value=${form.assignee} onInput=${e => setForm({...form, assignee: e.target.value})} />
          <label>Blockers (comma-separated)</label>
          <input class="form-input" value=${form.blockers} onInput=${e => setForm({...form, blockers: e.target.value})} />
          <button type="submit" class="btn active" style="margin-top:1rem;background:var(--accent-blue);">
            Launch Project
          </button>
        </form>
      </div>
    </div>
  `;
};




export const ProjectCard = ({ project, viewMode, onClick }) => {
  const isPhaseView = viewMode === 'phase';
  const tagClass = isPhaseView ? getTeamClass(project.team) : getPhaseClass(project.phase);
  const tagLabel = isPhaseView ? project.team : project.phase;
  return html`
    <div class="project-card" onClick=${() => onClick(project)}>
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <span class="card-id">${project.id}</span>
        </div>
        ${project.blockers && project.blockers.length > 0 && html`<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-orange);font-size:0.8rem;"></i>`}
      </div>
      <h3 class="card-title" style="margin-bottom:0.25rem;">${project.title}</h3>
      <${ProjectBadges} project=${project} />
      <div class="card-tags" style="margin-top:0.75rem;"><span class="tag ${tagClass} ${isPhaseView ? 'tag-solid' : ''}">${tagLabel}</span></div>
      <div class="card-footer">
        <div class="assignee">
          <div class="avatar">${getInitials(project.assignee || '?')}</div>
          <span>${project.assignee}</span>
        </div>
        <span>${project.progress}%</span>
      </div>
      <div class="progress-container" style="background:rgba(255,255,255,0.05);height:4px;">
        <div class="progress-bar" style="width:${project.progress}%"></div>
      </div>
    </div>
  `;
};



// Guard wrapper so hooks are ALWAYS called (fixes Rules of Hooks violation)
export const ProjectModal = ({ project, currentUser, onClose, onUpdate }) => {
  if (!project) return null;
  return html`<${ProjectModalInner} project=${project} currentUser=${currentUser} onClose=${onClose} onUpdate=${onUpdate} />`;
};

export const ProjectModalInner = ({ project, currentUser, onClose, onUpdate }) => {
  
  const isMember = currentUser.role === 'member';
  const isLeader = currentUser.role === 'leader';

  const isAdmin = currentUser.role === 'admin';
  const isOwner = currentUser.team === project.team;
  const canEdit = isAdmin || isOwner;

  // All hooks at the very top — no conditionals above them
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ ...project });
  const [newComment, setNewComment] = useState('');

  // Reset form only when switching to a different project
  useEffect(() => {
    setEditForm({ ...project });
    setIsEditing(false);
    setNewComment('');
  }, [project.id]);

  const handleSave = async () => {
    const payload = {
      ...editForm,
      is_deployed: Number(editForm.is_deployed) ? 1 : 0,
      blockers: typeof editForm.blockers === 'string'
        ? editForm.blockers.split(',').map(s => s.trim()).filter(Boolean)
        : editForm.blockers
    };
    const res = await apiFetch('/api/projects', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) { await appAlert('Save failed — check server logs.', 'Save Failed'); return; }
    logAudit(currentUser, 'PROJECT_UPDATED',
      `Updated project ${project.id}. Production: ${payload.is_deployed ? 'YES' : 'NO'}`);
    setEditForm(payload);  // show committed state immediately in modal
    setIsEditing(false);
    onUpdate();            // refresh global projectsList so other views update
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    const newHistory = [...(project.history || []), { date: today, phase: project.phase, status: 'note', note: newComment }];
    await apiFetch('/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...project, history: newHistory }) });
    logAudit(currentUser, 'PROJECT_NOTE_ADDED', `Added status note to ${project.id}`);
    setNewComment(''); onUpdate();
  };

  const handleToggleDeploy = () => {
    if (!isAdmin || !isEditing) return;
    setEditForm(prev => ({
      ...prev,
      is_deployed: Boolean(Number(prev.is_deployed)) ? 0 : 1
    }));
  };

  const handleChangePhase = async (nextPhase) => {
    if (nextPhase === project.phase) return;
    const today = new Date().toISOString().split('T')[0];
    const previousIdx = PHASES.indexOf(project.phase);
    const nextIdx = PHASES.indexOf(nextPhase);
    
    // Determine note based on whether moving forward or backward
    const isBackward = nextIdx < previousIdx;
    let note = isBackward ? `Iterated back from ${project.phase} to ${nextPhase}` : `Advanced from ${project.phase} to ${nextPhase}`;

    const newHistory = [...(project.history || []), { date: today, phase: nextPhase, status: 'phase_change', note }];

    const resolvedTeam = getDefaultTeamForPhase(nextPhase);
    const autoDeployed = nextPhase === 'Deployed and in Use' ? 1 : project.is_deployed;
    
    // Check if this is a new iteration (e.g., from Deployed back to early phases)
    let is_iterating = project.is_iterating;
    let iteration = project.iteration || 1;
    if (project.phase === 'Deployed and in Use' && isBackward) {
        is_iterating = 1;
        iteration += 1;
        note = `⚠ Production Iteration started — re-entering CRISP-DM cycle at ${nextPhase}. Iteration ${iteration}.`;
        newHistory[newHistory.length - 1].note = note;
    }

    await apiFetch('/api/projects', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...project,
        phase: nextPhase,
        team: resolvedTeam,
        progress: 0,
        is_deployed: autoDeployed,
        is_iterating,
        iteration,
        history: newHistory
      })
    });
    logAudit(currentUser, 'PROJECT_PHASE_CHANGED', note);
    onUpdate(); onClose();
  };

  const blockersStr = Array.isArray(editForm.blockers) ? editForm.blockers.join(', ') : (editForm.blockers || '');
  const isLive = Boolean(Number(project.is_deployed));
  const isIterating = Boolean(Number(project.is_iterating));
  const iterationNum = project.iteration || 1;

  return html`
    <div class="modal-overlay" onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal-content">
        <div class="modal-header">
          <div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.25rem;">${project.id}</div>
            <h2 style="font-size:1.4rem;display:flex;align-items:center;gap:0.6rem;">
              ${project.title}
            </h2>
            <div style="margin-top:0.4rem; display:flex; align-items:center; gap:0.65rem;">
              <${ProjectBadges} project=${isEditing ? editForm : project} onToggleDeploy=${isEditing && isAdmin ? handleToggleDeploy : undefined} />
              ${isEditing && isAdmin && html`
                <span class="fade-in" style="font-size:0.7rem; color:var(--text-secondary); opacity:0.8; font-style:italic;">
                   <i class="fa-solid fa-arrow-left" style="margin-right:0.2rem;"></i> 
                   Click to ${Boolean(Number(editForm.is_deployed)) ? 'remove from' : 'join'} Production
                </span>
              `}
            </div>
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center;">
            ${canEdit && !isEditing && html`<button class="btn active" style="background:rgba(255,255,255,0.1);" onClick=${() => setIsEditing(true)}><i class="fa-solid fa-pen"></i> Edit</button>`}
            ${isEditing && html`
              <button class="btn active" style="background:var(--accent-green);" onClick=${handleSave}><i class="fa-solid fa-floppy-disk"></i> Save</button>
              <button class="btn" onClick=${() => setIsEditing(false)}>Cancel</button>
            `}
            <button class="modal-close" onClick=${onClose} style="font-size:1.4rem;line-height:1;">✕</button>
          </div>
        </div>

        <div class="modal-body">
          <div class="grid-2">
            <div>
              <div class="info-block" style="margin-bottom:1rem;">
                <div class="section-title"><i class="fa-solid fa-align-left"></i> Description</div>
                ${isEditing && canEdit
                  ? html`<textarea class="form-input" style="width:100%;min-height:80px;" value=${editForm.description} onInput=${e => setEditForm({...editForm, description: e.target.value})}></textarea>`
                  : html`<p>${project.description || 'No description.'}</p>`
                }
              </div>
              <div class="info-block warning-block" style="margin-bottom:1rem;">
                <div class="section-title"><i class="fa-solid fa-circle-exclamation"></i> Blockers</div>
                ${isEditing && canEdit
                  ? html`<input class="form-input" style="width:100%;" value=${blockersStr} onInput=${e => setEditForm({...editForm, blockers: e.target.value})} placeholder="Comma-separated" />`
                  : project.blockers && project.blockers.length > 0
                    ? html`<ul style="margin:0;padding-left:1.2rem;">${project.blockers.map(b => html`<li>${b}</li>`)}</ul>`
                    : html`<p style="color:var(--accent-green);">No active blockers.</p>`
                }
              </div>
              <div class="info-block action-block">
                <div class="section-title"><i class="fa-solid fa-forward-step"></i> Next Action</div>
                ${isEditing && canEdit
                  ? html`<input class="form-input" style="width:100%;" value=${editForm.nextStep || ''} onInput=${e => setEditForm({...editForm, nextStep: e.target.value})} placeholder="What is the next step?" />`
                  : html`<p style="font-weight:500;color:var(--accent-green);">${project.nextStep || 'Not defined yet.'}</p>`
                }
              </div>
            </div>

            <div>
              <div class="info-block" style="margin-bottom:1rem;">
                <div class="section-title"><i class="fa-solid fa-users"></i> Ownership</div>
                <div style="display:flex;flex-direction:column;gap:0.75rem;">
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:var(--text-secondary);font-size:0.85rem;">Start Date</span>
                    ${isEditing && isAdmin
                      ? html`<input type="date" class="form-input" style="font-size:0.85rem;" value=${editForm.start_date || ''} onInput=${e => setEditForm({...editForm, start_date: e.target.value})} />`
                      : html`<strong>${project.start_date || 'N/A'}</strong>`
                    }
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:var(--text-secondary);font-size:0.85rem;">Target Date</span>
                    ${isEditing && isAdmin
                      ? html`<input type="date" class="form-input" style="font-size:0.85rem;" value=${editForm.target_date || ''} onInput=${e => setEditForm({...editForm, target_date: e.target.value})} />`
                      : html`<strong>${project.target_date || 'N/A'}</strong>`
                    }
                  </div>
                  <div style="height:1px;background:var(--border-color);"></div>
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:var(--text-secondary);font-size:0.85rem;">Team</span>
                    ${isEditing && isAdmin
                      ? html`<select class="form-select" style="font-size:0.85rem;" value=${editForm.team} onChange=${e => setEditForm({...editForm, team: e.target.value})}>${TEAMS.map(t => html`<option value=${t}>${t}</option>`)}</select>`
                      : html`<span class="tag ${getTeamClass(project.team)} tag-solid">${project.team}</span>`
                    }
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:var(--text-secondary);font-size:0.85rem;">Assignee</span>
                    ${isEditing && canEdit
                      ? html`<input class="form-input" style="font-size:0.85rem;" value=${editForm.assignee || ''} onInput=${e => setEditForm({...editForm, assignee: e.target.value})} />`
                      : html`<strong>${project.assignee}</strong>`
                    }
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-star" style="font-size:0.7rem;margin-right:0.3rem;"></i>Stakeholder</span>
                    ${isEditing && canEdit
                      ? html`<input class="form-input" style="font-size:0.85rem;" placeholder="Who benefits from this project?" value=${Array.isArray(editForm.stakeholders) ? editForm.stakeholders.join(', ') : (editForm.stakeholders || '')} onInput=${e => setEditForm({...editForm, stakeholders: e.target.value ? [e.target.value] : []})} />`
                      : html`<strong style="color:var(--accent-orange);">${Array.isArray(project.stakeholders) && project.stakeholders.length > 0 ? project.stakeholders.join(', ') : (project.stakeholders && project.stakeholders !== '[]' ? project.stakeholders : '—')}</strong>`
                    }
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:var(--text-secondary);font-size:0.85rem;">Phase</span>
                    <span class="tag ${getPhaseClass(project.phase)}">${project.phase}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="color:var(--text-secondary);font-size:0.85rem;">Phase Progress</span>
                    ${isEditing && canEdit
                      ? html`<div style="display:flex;align-items:center;gap:0.5rem;"><input type="range" min="0" max="100" value=${editForm.progress} onInput=${e => setEditForm({...editForm, progress: parseInt(e.target.value)})} /><span>${editForm.progress}%</span></div>`
                      : html`<strong>${project.progress}%</strong>`
                    }
                  </div>
                </div>
              </div>

              ${!isEditing && canEdit && html`
                <div style="margin-bottom:1rem; border:1px solid rgba(255,255,255,0.1); border-radius:var(--radius-md); padding:0.75rem; background:rgba(0,0,0,0.15);">
                  <div style="font-size:0.8rem; font-weight:600; margin-bottom:0.5rem; color:var(--text-secondary); display:flex; align-items:center; gap:0.4rem;">
                    <i class="fa-solid fa-code-branch"></i> Phase Transition
                  </div>
                  <div style="display:flex; gap:0.5rem;">
                    <select class="form-select" style="flex:1;" id="phase_transition_select">
                      ${PHASES.map(p => html`<option value=${p} selected=${p === project.phase}>${p}</option>`)}
                    </select>
                    <button class="btn active" style="background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple)); padding:0.4rem 0.8rem;" 
                      onClick=${() => {
                        const sel = document.getElementById('phase_transition_select');
                        if (sel) handleChangePhase(sel.value);
                      }}>Move</button>
                  </div>
                </div>
              `}
            </div>
          </div>

          <!-- History/Comments -->
          <div class="info-block" style="margin-top:1.5rem;">
            <div class="section-title"><i class="fa-solid fa-clock-rotate-left"></i> Timeline & Activity</div>
            <div style="display:flex;gap:0.75rem;margin-bottom:1.5rem;">
              <input class="form-input" style="flex:1;" placeholder="Add status update or note..." value=${newComment} onInput=${e => setNewComment(e.target.value)} onKeyPress=${e => e.key === 'Enter' && handleAddComment()} />
              <button class="btn active" style="background:var(--accent-blue);" onClick=${handleAddComment}>Post Update</button>
            </div>
            <div class="timeline">
              ${(project.history || []).slice().reverse().map(item => html`
                <div class="timeline-item ${item.status === 'phase_change' ? 'completed' : ''}">
                  <div class="timeline-dot"></div>
                  <div class="timeline-content">
                    <div class="timeline-date">${item.date} - ${item.phase}</div>
                    <div>${item.note}</div>
                  </div>
                </div>
              `)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
};



export const PhaseSubmissionPanel = ({ projects, currentUser, fetchProjects }) => {
  const [selProject, setSelProject] = useState('');
  const [selPhase, setSelPhase] = useState('');
  const [note, setNote] = useState('');
  const teamPhases = TEAM_PHASES[currentUser.team] || [];
  const proj = projects.find(p => p.id === selProject);
  const availablePhases = teamPhases.filter(ph => ph !== proj?.phase);

  const submit = async () => {
    if (!proj || !selPhase) return;
    const today = new Date().toISOString().split('T')[0];
    const histNote = note.trim() || `Phase "${selPhase}" submitted by ${currentUser.username} (${currentUser.team})`;
    const newHistory = [...(proj.history || []), { date: today, phase: selPhase, status: 'phase_change', note: histNote }];
    await apiFetch('/api/projects', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...proj, phase: selPhase, progress: 0, history: newHistory })
    });
    logAudit(currentUser, 'PROJECT_PHASE_CHANGED', `Leader ${currentUser.username} submitted phase "${selPhase}" for ${selProject}`);
    setSelProject(''); setSelPhase(''); setNote('');
    fetchProjects();
  };

  if (teamPhases.length === 0) return null;

  return html`
    <div class="phase-submit-panel" style="margin-bottom:1.5rem;">
      <div class="section-title" style="margin-bottom:0.5rem;"><i class="fa-solid fa-code-branch"></i> Phase Submission</div>
      <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;">
        Advance any project to a phase your team (${currentUser.team}) is responsible for.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
        <div>
          <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Project</label>
          <select class="form-select" style="width:100%;" value=${selProject}
            onChange=${e => { setSelProject(e.target.value); setSelPhase(''); }}>
            <option value="">— Select Project —</option>
            ${projects.map(p => html`<option value=${p.id}>${p.id} — ${p.title} [${p.phase}]</option>`)}
          </select>
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Submit to Phase</label>
          <select class="form-select" style="width:100%;" value=${selPhase}
            onChange=${e => setSelPhase(e.target.value)} disabled=${!selProject}>
            <option value="">— Select Phase —</option>
            ${availablePhases.map(ph => html`<option value=${ph}>${ph}</option>`)}
          </select>
        </div>
        <div style="grid-column:1/-1;">
          <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Note (optional)</label>
          <input class="form-input" style="width:100%;" placeholder="e.g. Data preparation complete, models ready..."
            value=${note} onInput=${e => setNote(e.target.value)} />
        </div>
        <div style="grid-column:1/-1;text-align:right;">
          <button class="btn active" style="background:var(--accent-purple);"
            onClick=${submit} disabled=${!selProject || !selPhase}>
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Submit Phase
          </button>
        </div>
      </div>
    </div>
  `;
};



export const PhaseSubmissionTab = ({ projects, tasks, currentUser, fetchProjects }) => {
  const isAdmin = currentUser.role === 'admin';
  const isLeader = currentUser.role === 'leader';
  const [selProject, setSelProject] = useState('');
  const [selPhase, setSelPhase] = useState('');
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const teamPhases = TEAM_PHASES[currentUser.team] || [];
  const proj = projects.find(p => p.id === selProject);
  const availablePhases = teamPhases.filter(ph => ph !== proj?.phase);

  const submit = async () => {
    if (!proj || !selPhase) return;
    const today = new Date().toISOString().split('T')[0];
    const histNote = note.trim() || `Phase "${selPhase}" submitted by ${currentUser.username} (${currentUser.team})`;
    const newHistory = [...(proj.history || []), { date: today, phase: selPhase, status: 'phase_change', note: histNote }];
    await apiFetch('/api/projects', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...proj, phase: selPhase, progress: 0, history: newHistory })
    });
    logAudit(currentUser, 'PROJECT_PHASE_CHANGED', `Leader ${currentUser.username} submitted phase "${selPhase}" for ${selProject}`);
    sendChannelMessage(currentUser.team, '🤖 System', `🔄 Project ${selProject} phase advanced to "${selPhase}" by @${currentUser.username}`);
    setSelProject(''); setSelPhase(''); setNote('');
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 3000);
    fetchProjects();
  };

  // Show all projects with phase context for the current user's team responsibilities
  const PHASE_TEAM_MAP = {};
  Object.entries(TEAM_PHASES).forEach(([team, phases]) => {
    phases.forEach(ph => { PHASE_TEAM_MAP[ph] = (PHASE_TEAM_MAP[ph] || []).concat(team); });
  });

  const getResponsibleTeam = (phase) => PHASE_TEAM_MAP[phase] || [];
  const isResponsible = (project) => isAdmin || teamPhases.includes(project.phase);

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title">Phase Submission</h2>
          <p class="page-subtitle">Submit project phase completions and advance the CRISP-DM lifecycle</p>
        </div>
      </div>

      <!-- Submission Form -->
      ${(isLeader && teamPhases.length > 0 || isAdmin) && html`
        <div class="phase-submit-panel" style="margin-bottom:2rem;">
          <div class="section-title" style="margin-bottom:0.5rem;"><i class="fa-solid fa-code-branch"></i> Submit a Phase Completion</div>
          <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:1.25rem;">
            ${isAdmin
              ? 'As admin, you can submit any project to any phase.'
              : `Your team (${currentUser.team}) is responsible for: ${teamPhases.join(' · ')}`
            }
          </p>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
            <div>
              <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.3rem;">Project</label>
              <select class="form-select" style="width:100%;" value=${selProject}
                onChange=${e => { setSelProject(e.target.value); setSelPhase(''); }}>
                <option value="">— Select Project —</option>
                ${projects.map(p => html`<option value=${p.id}>${p.id} — ${p.title} [Currently: ${p.phase}]</option>`)}
              </select>
            </div>
            <div>
              <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.3rem;">
                Advance to Phase ${!isAdmin ? '(your team\'s phases only)' : ''}
              </label>
              <select class="form-select" style="width:100%;" value=${selPhase}
                onChange=${e => setSelPhase(e.target.value)} disabled=${!selProject}>
                <option value="">— Select Phase —</option>
                ${(isAdmin ? PHASES : availablePhases).map(ph => html`<option value=${ph}>${ph}</option>`)}
              </select>
            </div>
            <div style="grid-column:1/-1;">
              <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.3rem;">Note (optional)</label>
              <input class="form-input" style="width:100%;"
                placeholder="e.g. Data preparation complete, all pipelines validated and ready for modeling..."
                value=${note} onInput=${e => setNote(e.target.value)} />
            </div>
            <div style="grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;">
              ${submitted && html`<span style="color:var(--accent-green);font-size:0.85rem;"><i class="fa-solid fa-check-circle"></i> Phase submitted successfully!</span>`}
              ${!submitted && html`<span></span>`}
              <button class="btn active" style="background:var(--accent-purple);"
                onClick=${submit} disabled=${!selProject || !selPhase}>
                <i class="fa-solid fa-arrow-right-to-bracket"></i> Submit Phase Completion
              </button>
            </div>
          </div>
        </div>
      `}

      <!-- Project Status Overview Table -->
      <div class="section-title" style="margin-bottom:1rem;"><i class="fa-solid fa-table"></i> All Projects — Phase Status & Actions</div>
      <div style="overflow-x:auto;">
        <table class="data-grid-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Stakeholder</th>
              <th>Current Phase</th>
              <th>Responsible Team(s)</th>
              <th>Phase Tasks</th>
              <th>Done / Total</th>
              <th style="text-align:center;">Action for You</th>
            </tr>
          </thead>
          <tbody>
            ${projects.map(p => {
              const phaseTasks = tasks.filter(t => t.project_id === p.id && t.crisp_dm_phase === p.phase);
              const doneCount = phaseTasks.filter(t => t.status === 'done').length;
              const responsible = getResponsibleTeam(p.phase);
              const myAction = isAdmin ? 'Can submit any phase' : teamPhases.includes(p.phase) ? 'Submit when ready' : '—';
              const actionColor = myAction === '—' ? 'var(--text-secondary)' : 'var(--accent-green)';
              const health = getHealthStatus(p);
              return html`
                <tr style="border-bottom:1px solid var(--border-color);">
                  <td style="padding:0.75rem 1rem;">
                    <div style="font-weight:700;color:var(--accent-blue);">${p.id}</div>
                    <div style="font-size:0.83rem;">${p.title}</div>
                    <div style="font-size:0.7rem;color:${health.color};margin-top:0.2rem;">${health.label}</div>
                  </td>
                  <td style="font-size:0.8rem;color:var(--accent-orange);font-weight:600;">${Array.isArray(p.stakeholders) && p.stakeholders.length > 0 ? p.stakeholders.join(', ') : (p.stakeholders && p.stakeholders !== '[]' ? p.stakeholders : '—')}</td>
                  <td><span class="tag ${getPhaseClass(p.phase)}">${p.phase}</span></td>
                  <td>
                    ${responsible.length > 0
                      ? responsible.map(t => html`<span class="tag ${getTeamClass(t)}" style="font-size:0.65rem;display:block;margin-bottom:0.2rem;">${t.replace(' Team','')}</span>`)
                      : html`<span style="color:var(--text-secondary);">Any</span>`
                    }
                  </td>
                  <td style="text-align:center;font-size:0.85rem;">
                    ${phaseTasks.length > 0 ? phaseTasks.length : html`<span style="color:var(--text-secondary);">—</span>`}
                  </td>
                  <td style="text-align:center;">
                    ${phaseTasks.length > 0
                      ? html`<span style="font-weight:700;color:${doneCount===phaseTasks.length?'var(--accent-green)':'var(--accent-orange)'};">${doneCount}/${phaseTasks.length}</span>`
                      : html`<span style="color:var(--text-secondary);">—</span>`
                    }
                  </td>
                  <td style="text-align:center;">
                    ${(isAdmin || teamPhases.includes(p.phase)) ? html`
                      <button class="btn" style="font-size:0.78rem;color:var(--accent-purple);border:1px solid rgba(139,92,246,0.3);background:rgba(139,92,246,0.05);"
                        onClick=${() => { setSelProject(p.id); setSelPhase(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                        <i class="fa-solid fa-code-branch"></i> Submit Phase
                      </button>
                    ` : html`<span style="font-size:0.78rem;color:var(--text-secondary);">Not your team's phase</span>`}
                  </td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
    </div>
  `;
};


