import { h, render } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import { PHASES, TEAMS } from './mockData.js';

const html = htm.bind(h);

// ─── Utils ───────────────────────────────────────────────────────────────────
const getInitials = (name) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

const getTeamClass = (team) => {
  if (!team) return '';
  if (team.includes('Dev')) return 'color-dev';
  if (team.includes('Eng')) return 'color-de';
  if (team.includes('Sci')) return 'color-ds';
  return '';
};

const getPhaseClass = (phase) => {
  const map = {
    'Business Understanding':      'color-bu',
    'Data Understanding':          'color-du',
    'Data Preparation':            'color-dp',
    'Modeling':                    'color-mod',
    'Evaluation':                  'color-eval',
    'Deployment':                  'color-dep',
    'Waiting for Stakeholder Approval': 'color-bu',
    'Deployed and in Use':         'color-green'
  };
  return map[phase] || 'color-dep';
};

// Determines the primary team responsible for a given phase
const getDefaultTeamForPhase = (phase) => {
  if (phase === 'Data Preparation') return 'Data Engineering Team';
  if (['Deployment', 'Waiting for Stakeholder Approval', 'Deployed and in Use'].includes(phase)) return 'Development Team';
  return 'Data Science/Analysis Team';
};

// ALL PHASES that each team is authorised to work in (scoped task creation).
const TEAM_PHASES = {
  'Data Engineering Team':        ['Data Understanding', 'Data Preparation', 'Deployment'],
  'Development Team':             ['Deployment', 'Waiting for Stakeholder Approval', 'Deployed and in Use'],
  'Data Science/Analysis Team':   ['Business Understanding', 'Data Understanding', 'Data Preparation',
                                   'Modeling', 'Evaluation', 'Waiting for Stakeholder Approval',
                                   'Deployed and in Use'] // Post-production analysis is done here
};

// ─── Math Engine ─────────────────────────────────────────────────────────────
const calculateOverallProgress = (project) => {
  if (project.phase === 'Deployed and in Use') return 100;
  const idx = PHASES.indexOf(project.phase);
  if (idx === -1) return 0;
  const base = (idx / PHASES.length) * 100;
  const intra = (project.progress / 100) * (100 / PHASES.length);
  return Math.min(100, Math.round(base + intra));
};

const calculateTimelineProgress = (project) => {
  if (!project.start_date || !project.target_date) return 0;
  const start = new Date(project.start_date).getTime();
  const end = new Date(project.target_date).getTime();
  const now = new Date().getTime();
  if (end <= start) return 100;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
};

const getHealthStatus = (project) => {
  if (!project.start_date || !project.target_date) {
    return { label: 'No Dates Set', color: 'var(--text-secondary)' };
  }
  const overallPct = calculateOverallProgress(project) / 100;
  const start = new Date(project.start_date).getTime();
  const end = new Date(project.target_date).getTime();
  const now = new Date().getTime();
  if (end <= start) return { label: 'Invalid Dates', color: 'var(--text-secondary)' };
  const msPerDay = 86400000;
  const totalDays = (end - start) / msPerDay;
  const elapsedDays = Math.max(0, (now - start) / msPerDay);
  const expectedDays = totalDays * overallPct;
  const delta = expectedDays - elapsedDays;
  if (Math.abs(delta) < 1) return { label: 'On Track', color: 'var(--accent-blue)' };
  if (delta >= 1) return { label: 'Ahead by ' + Math.round(delta) + ' days', color: 'var(--accent-green)' };
  return { label: 'Late by ' + Math.round(Math.abs(delta)) + ' days', color: 'var(--accent-orange)' };
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const ProjectBadges = ({ project, onToggleDeploy }) => {
  const isLive = Boolean(Number(project.is_deployed));
  const isIterating = Boolean(Number(project.is_iterating));
  const iterationNum = project.iteration || 1;
  
  const baseStyle = "padding:0.15rem 0.3rem;font-size:0.6rem;border:1px solid currentColor;line-height:1;";
  const interactiveStyle = onToggleDeploy ? baseStyle + "cursor:pointer;transition:transform 0.1s ease-in-out;" : baseStyle;
  
  return html`
    <div style="display:flex;align-items:center;gap:0.3rem;margin-top:0.1rem;">
      <span class="tag ${isLive ? 'color-green' : 'color-bu'}" 
            style=${interactiveStyle}
            title=${onToggleDeploy ? "Click to toggle production status" : ""}
            onClick=${(e) => { if (onToggleDeploy) { e.preventDefault(); e.stopPropagation(); onToggleDeploy(); } }}
            onMouseOver=${(e) => { if (onToggleDeploy) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseOut=${(e) => { if (onToggleDeploy) e.currentTarget.style.transform = 'scale(1)'; }}>
        ${isLive ? 'PRODUCTION' : 'NEW'}
      </span>
      ${isIterating && html`<span class="tag color-ds" style="padding:0.15rem 0.3rem;font-size:0.6rem;border:1px solid currentColor;line-height:1;">ITERATION v${iterationNum}</span>`}
    </div>
  `;
};

// ─── Audit Helper ────────────────────────────────────────────────────────────
const logAudit = (currentUser, action, details) => {
  if (!currentUser) return;
  fetch('/api/audit-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: currentUser.username,
      user_role: currentUser.role,
      action,
      details
    })
  }).catch(() => {});
};

// ─── LoginScreen ──────────────────────────────────────────────────────────────
const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) { onLogin(await res.json()); }
      else { const err = await res.json(); setError(err.error || 'Login failed'); }
    } catch { setError('Server error. Is the backend running?'); }
  };

  return html`
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;">
      <div style="width:100%;max-width:420px;padding:2rem;">
        <div style="text-align:center;margin-bottom:2rem;">
          <div style="font-size:2.5rem;font-weight:800;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;">BI Project Manager</div>
          <p style="color:var(--text-secondary);margin-top:0.5rem;">Sign in to your dashboard</p>
        </div>
        <div class="info-block">
          ${error && html`<div style="color:var(--accent-orange);margin-bottom:1rem;padding:0.75rem;background:rgba(245,158,11,0.1);border-radius:var(--radius-md);">${error}</div>`}
          <form onSubmit=${handleSubmit} style="display:flex;flex-direction:column;gap:1rem;">
            <input class="form-input" placeholder="Username" value=${username} onInput=${e => setUsername(e.target.value)} required />
            <input class="form-input" type="password" placeholder="Password" value=${password} onInput=${e => setPassword(e.target.value)} required />
            <button type="submit" class="btn active" style="background:var(--accent-blue);color:white;padding:0.75rem;">Sign In</button>
          </form>
        </div>
      </div>
    </div>
  `;
};

// ─── AdminPanel ───────────────────────────────────────────────────────────────
const AdminPanel = ({ users, fetchUsers }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('member');
  const [team, setTeam] = useState(TEAMS[0]);
  const [msg, setMsg] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, team })
    });
    if (res.ok) { setMsg('User created successfully'); setUsername(''); setPassword(''); fetchUsers(); }
    else { setMsg('Error creating user (username may be taken)'); }
  };

  return html`
    <div>
      <div class="page-header"><h2 class="page-title">Admin Control Panel</h2></div>
      <div class="grid-2">
        <div class="info-block">
          <div class="section-title">Create New User</div>
          ${msg && html`<div style="color:var(--accent-green);margin-bottom:1rem;">${msg}</div>`}
          <form onSubmit=${handleCreate} style="display:flex;flex-direction:column;gap:1rem;">
            <input placeholder="Username" class="form-input" value=${username} onInput=${e => setUsername(e.target.value)} required />
            <input placeholder="Password" type="password" class="form-input" value=${password} onInput=${e => setPassword(e.target.value)} required />
            <select class="form-select" value=${role} onChange=${e => setRole(e.target.value)}>
              <option value="admin">Admin</option>
              <option value="member">Team Member</option>
            </select>
            <select class="form-select" value=${team} onChange=${e => setTeam(e.target.value)}>
              ${TEAMS.map(t => html`<option value=${t}>${t}</option>`)}
              <option value="Management">Management</option>
            </select>
            <button type="submit" class="btn active">Create Account</button>
          </form>
        </div>
        <div class="info-block" style="max-height:400px;overflow-y:auto;">
          <div class="section-title">User Roster</div>
          <table style="width:100%;border-collapse:collapse;text-align:left;font-size:0.9rem;">
            <thead><tr style="border-bottom:1px solid var(--border-color);">
              <th style="padding:0.5rem 0;">ID</th><th>Username</th><th>Role</th><th>Team</th>
            </tr></thead>
            <tbody>${users.map(u => html`
              <tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:0.5rem 0;">${u.id}</td>
                <td>${u.username}</td>
                <td><span class="tag" style="background:${u.role==='admin'?'var(--accent-orange)':'var(--bg-color)'}">${u.role}</span></td>
                <td>${u.team}</td>
              </tr>
            `)}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
};

// ─── ProjectsManagementTab ────────────────────────────────────────────────────
const ProjectsManagementTab = ({ projects, fetchProjects, setEditId }) => {
  const handleDelete = async (id, title) => {
    if (!confirm('Delete project "' + title + '"?\nThis removes all history and cannot be undone.')) return;
    const res = await fetch('/api/projects/' + id, { method: 'DELETE' });
    if (res.ok) fetchProjects();
    else alert('Failed to delete project.');
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
        <table style="width:100%;border-collapse:collapse;text-align:left;font-size:0.9rem;">
          <thead>
            <tr style="border-bottom:1px solid var(--border-color);background:rgba(0,0,0,0.2);">
              <th style="padding:1rem;">ID / Title</th>
              <th>Phase</th><th>Team</th><th>Dates</th>
              <th style="text-align:right;padding-right:1rem;">Actions</th>
            </tr>
          </thead>
          <tbody>${projects.map(p => html`
            <tr style="border-bottom:1px solid var(--border-color);">
              <td style="padding:1rem;">
                <div style="font-weight:700;">${p.id}</div>
                <div style="color:var(--text-secondary);margin-bottom:0.4rem;">${p.title}</div>
                <${ProjectBadges} project=${p} />
              </td>
              <td><span class="tag ${getPhaseClass(p.phase)}">${p.phase}</span></td>
              <td style="font-size:0.85rem;">${p.team}</td>
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

// ─── CreateProjectTab ─────────────────────────────────────────────────────────
const CreateProjectTab = ({ onSave }) => {
  const [isDeployed, setIsDeployed] = useState(false);
  const [form, setForm] = useState({
    id: '', title: '', description: '', phase: 'Business Understanding',
    team: TEAMS[0], assignee: '', progress: 0, blockers: '',
    nextStep: '', start_date: '', target_date: ''
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
      blockers: form.blockers.split(',').map(s => s.trim()).filter(Boolean)
    };
    const res = await fetch('/api/projects', {
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

// ─── ProjectCard ──────────────────────────────────────────────────────────────
const ProjectCard = ({ project, viewMode, onClick }) => {
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

// ─── KanbanBoard ──────────────────────────────────────────────────────────────
const KanbanBoard = ({ projects, tasks, viewMode, setViewMode, onProjectClick, onUpdate }) => {
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
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;min-width:1000px;">
            <thead>
              <tr style="background:rgba(0,0,0,0.2);border-bottom:1px solid var(--border-color);">
                <th style="padding:1rem;text-align:left;position:sticky;left:0;background:var(--bg-panel);z-index:2;width:250px;">Project</th>
                ${PHASES.map(ph => html`<th style="padding:1rem;text-align:center;min-width:120px;">${ph.replace(' Understanding','')}</th>`)}
              </tr>
            </thead>
            <tbody>
              ${projects.slice().sort((a,b) => (a.is_deployed === b.is_deployed ? 0 : a.is_deployed ? 1 : -1)).map(p => html`
                <tr style="border-bottom:1px solid var(--border-color);transition:var(--transition);hover:background:rgba(255,255,255,0.02);">
                  <td style="padding:1rem;position:sticky;left:0;background:var(--bg-panel);z-index:1;border-right:1px solid var(--border-color);">
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

const PhaseDrillDown = ({ project, phase, tasks, onClose, onUpdate }) => {
  const [currentUser] = useState(() => JSON.parse(localStorage.getItem('currentUser')));
  
  const handleStatusChange = async (task, newStatus) => {
    let resolution_note = task.resolution_note || '';
    let completed_by = task.completed_by || '';

    if (newStatus === 'done' && task.status !== 'done') {
      const note = window.prompt("Task completed! Enter a resolution or completion note:", "");
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

    await fetch('/api/tasks/' + task.id, {
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
              ${tasks.map(task => html`
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
              `)}
            </div>
          `}
        </div>
      </div>
    </div>
  `;
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
const Dashboard = ({ projects }) => {
  const [activeFilter, setActiveFilter] = useState({ type: 'ALL', value: null });

  const total = projects.length;
  const deployedCount = projects.filter(p => Boolean(Number(p.is_deployed))).length;
  const activeTotal = total; // All projects are active now, some in prod iteration, some pre-prod.

  const teamStats = useMemo(() => {
    const stats = {};
    TEAMS.forEach(t => { stats[t] = { preProd: 0, prodIter: 0 }; });
    projects.forEach(p => { 
      if (stats[p.team] !== undefined) {
        if (Boolean(Number(p.is_deployed))) stats[p.team].prodIter++;
        else stats[p.team].preProd++;
      } 
    });
    return stats;
  }, [projects]);

  const blockedCount = projects.filter(p => p.blockers && p.blockers.length > 0).length;
  const onTrackCount = activeTotal - blockedCount;

  const scheduleHealth = useMemo(() => {
    const active = projects.filter(p => p.start_date && p.target_date);
    let onT = 0, late = 0, ahead = 0;
    active.forEach(p => {
      const h = getHealthStatus(p);
      if (h.label === 'On Track') onT++;
      else if (h.label.startsWith('Ahead')) ahead++;
      else late++;
    });
    return { onTrack: onT, late, ahead, total: active.length };
  }, [projects]);

  const phaseDistribution = useMemo(() => {
    return PHASES.map(ph => ({
      phase: ph,
      count: projects.filter(p => p.phase === ph).length
    }));
  }, [projects]);

  const maxPhaseCount = Math.max(1, ...phaseDistribution.map(d => d.count));

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (activeFilter.type === 'ALL') return true;
      if (activeFilter.type === 'STATUS') {
        const isBlocked = p.blockers && p.blockers.length > 0;
        return activeFilter.value === 'Blocked' ? isBlocked : !isBlocked;
      }
      if (activeFilter.type === 'SCHED') {
        const h = getHealthStatus(p);
        if (activeFilter.value === 'On Track') return h.label === 'On Track';
        if (activeFilter.value === 'Ahead') return h.label.startsWith('Ahead');
        if (activeFilter.value === 'Late') return h.label.startsWith('Late');
        return true;
      }
      if (activeFilter.type === 'TEAM') return p.team === activeFilter.value;
      if (activeFilter.type === 'PHASE') return p.phase === activeFilter.value;
      return true;
    });
  }, [projects, activeFilter]);

  const activeProjects = filteredProjects.filter(p => !Boolean(Number(p.is_deployed)));
  const productionProjects = filteredProjects.filter(p => Boolean(Number(p.is_deployed)));

  const toggleFilter = (type, value) => {
    if (activeFilter.type === type && activeFilter.value === value) setActiveFilter({ type: 'ALL', value: null });
    else setActiveFilter({ type, value });
  };
  const isActive = (type, value) => activeFilter.type === type && activeFilter.value === value;

  // Hero card style helper
  const heroCard = (clickType, clickVal, color) => {
    const selected = isActive(clickType, clickVal);
    const border = selected ? 'box-shadow:0 0 0 2px ' + color + ';' : '';
    return 'text-align:center;padding:1.25rem 1rem;cursor:pointer;transition:var(--transition);' + border;
  };

  // Feature row clickable row style
  const rowStyle = (type, val, rColor) => {
    const sel = isActive(type, val);
    if (sel) return 'cursor:pointer;padding:0.65rem 0.8rem;border-radius:8px;display:flex;justify-content:space-between;align-items:center;transition:var(--transition);background:' + rColor + ';';
    return 'cursor:pointer;padding:0.65rem 0.8rem;border-radius:8px;display:flex;justify-content:space-between;align-items:center;transition:var(--transition);background:rgba(255,255,255,0.03);';
  };

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title">Executive Dashboard</h2>
          <p class="page-subtitle">Managerial view of department velocity and risks</p>
        </div>
      </div>

      <!-- Hero Strip -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem;">
        <div class="metric-card" style="text-align:center;padding:1.25rem 1rem;">
          <div style="font-size:2.8rem;font-weight:800;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;">${activeTotal}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-top:0.5rem;">Total Initiatives</div>
        </div>
        <div class="metric-card" style="${heroCard('STATUS','On Track','var(--accent-green)')}" onClick=${() => toggleFilter('STATUS','On Track')}>
          <div style="font-size:2.8rem;font-weight:800;color:var(--accent-green);line-height:1;">${onTrackCount}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-top:0.5rem;">No Blockers</div>
        </div>
        <div class="metric-card" style="${heroCard('STATUS','Blocked','var(--accent-orange)')}" onClick=${() => toggleFilter('STATUS','Blocked')}>
          <div style="font-size:2.8rem;font-weight:800;color:var(--accent-orange);line-height:1;">${blockedCount}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-top:0.5rem;">Blocked</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1.25rem 1rem;">
          <div style="font-size:2.8rem;font-weight:800;color:var(--accent-green);line-height:1;">${deployedCount}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-top:0.5rem;">In Production</div>
        </div>
      </div>

      <!-- Feature Cards Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:1.5rem;margin-bottom:1.5rem;">

        <!-- Schedule Health -->
        <div class="metric-card">
          <div class="metric-title"><i class="fa-solid fa-calendar-check" style="margin-right:0.4rem;"></i>Schedule Health</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;">${scheduleHealth.total} active project${scheduleHealth.total !== 1 ? 's' : ''} with dates tracked</div>
          <div style="display:flex;flex-direction:column;gap:0.6rem;">
            <div style="${rowStyle('SCHED','Ahead','rgba(16,185,129,0.15)')}" onClick=${() => toggleFilter('SCHED','Ahead')}>
              <span style="font-size:0.85rem;color:var(--accent-green);font-weight:500;"><i class="fa-solid fa-arrow-trend-up" style="margin-right:0.5rem;"></i>Ahead of schedule</span>
              <span style="font-size:1.4rem;font-weight:800;color:var(--accent-green);">${scheduleHealth.ahead}</span>
            </div>
            <div style="${rowStyle('SCHED','On Track','rgba(59,130,246,0.15)')}" onClick=${() => toggleFilter('SCHED','On Track')}>
              <span style="font-size:0.85rem;color:var(--accent-blue);font-weight:500;"><i class="fa-solid fa-circle-check" style="margin-right:0.5rem;"></i>On track</span>
              <span style="font-size:1.4rem;font-weight:800;color:var(--accent-blue);">${scheduleHealth.onTrack}</span>
            </div>
            <div style="${rowStyle('SCHED','Late','rgba(245,158,11,0.15)')}" onClick=${() => toggleFilter('SCHED','Late')}>
              <span style="font-size:0.85rem;color:var(--accent-orange);font-weight:500;"><i class="fa-solid fa-arrow-trend-down" style="margin-right:0.5rem;"></i>Running late</span>
              <span style="font-size:1.4rem;font-weight:800;color:var(--accent-orange);">${scheduleHealth.late}</span>
            </div>
          </div>
        </div>

        <!-- Team Workload -->
        <div class="metric-card">
          <div class="metric-title"><i class="fa-solid fa-users" style="margin-right:0.4rem;"></i>Team Workload</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;">Pre-Prod Initiatives vs Production Iterations</div>
          <div style="display:flex;flex-direction:column;gap:1.1rem;">
            ${TEAMS.map(team => {
              const preProdCount = teamStats[team]?.preProd || 0;
              const prodIterCount = teamStats[team]?.prodIter || 0;
              const tCount = preProdCount + prodIterCount;
              const preProdPct = total > 0 ? (preProdCount / total) * 100 : 0;
              const prodIterPct = total > 0 ? (prodIterCount / total) * 100 : 0;
              
              const sel = isActive('TEAM', team);
              return html`
                <div style="cursor:pointer;transition:var(--transition);padding:0.35rem 0.4rem;border-radius:6px;background:${sel ? 'rgba(255,255,255,0.07)' : 'transparent'};"
                  onClick=${() => toggleFilter('TEAM', team)}>
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
                    <span style="font-size:0.83rem;font-weight:500;">${team.replace(' Team','')}</span>
                    <span style="font-size:0.83rem;color:var(--text-secondary);">${tCount} total (${preProdCount} pre-prod, ${prodIterCount} prod)</span>
                  </div>
                  <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;display:flex;">
                    <div style="height:100%;width:${preProdPct}%;background:linear-gradient(90deg,var(--accent-blue),var(--accent-purple));"></div>
                    <div style="height:100%;width:${prodIterPct}%;background:var(--accent-green);opacity:0.8;"></div>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>

        <!-- Phase Distribution -->
        <div class="metric-card">
          <div class="metric-title"><i class="fa-solid fa-layer-group" style="margin-right:0.4rem;"></i>Phase Distribution</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;">Where active work is concentrated — click to filter</div>
          <div style="display:flex;flex-direction:column;gap:0.5rem;">
            ${phaseDistribution.map(d => {
              const sel = isActive('PHASE', d.phase);
              const barW = d.count === 0 ? 0 : Math.max(5, Math.round((d.count / maxPhaseCount) * 100));
              return html`
                <div style="cursor:pointer;transition:var(--transition);padding:0.3rem 0.4rem;border-radius:5px;background:${sel ? 'rgba(255,255,255,0.08)' : 'transparent'};"
                  onClick=${() => toggleFilter('PHASE', d.phase)}>
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.3rem;">
                    <span style="font-size:0.76rem;color:${d.count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:82%;">${d.phase}</span>
                    <span style="font-size:0.76rem;font-weight:700;color:${d.count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'};">${d.count}</span>
                  </div>
                  <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${barW}%;background:var(--accent-blue);border-radius:3px;opacity:${d.count === 0 ? 0.12 : 1};"></div>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>

      </div>

      <!-- All Projects Pipeline — unified full-detail view -->
      <div class="metric-card" style="margin-bottom:1.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <div style="font-size:1rem;font-weight:600;"><i class="fa-solid fa-stopwatch" style="margin-right:0.5rem;"></i>Full Project Pipeline
            <span style="font-size:0.8rem;font-weight:400;color:var(--text-secondary);margin-left:0.75rem;">${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''}</span>
          </div>
          ${activeFilter.type !== 'ALL' && html`
            <button class="btn" style="font-size:0.8rem;padding:0.25rem 0.75rem;border:1px solid var(--border-color);" onClick=${() => setActiveFilter({ type: 'ALL', value: null })}>
              <i class="fa-solid fa-xmark" style="margin-right:0.4rem;"></i>Clear Filter
            </button>
          `}
        </div>

        ${filteredProjects.length === 0
          ? html`<div style="text-align:center;padding:2.5rem;color:var(--text-secondary);font-style:italic;">No projects match the current filter.</div>`
          : html`
            <!-- New Initiatives Section -->
            ${activeProjects.length > 0 && html`
              <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);margin-bottom:0.5rem;padding-left:0.5rem;">
                <i class="fa-solid fa-seedling" style="margin-right:0.4rem;"></i>New Initiatives (${activeProjects.length})
              </div>
              <table style="width:100%;border-collapse:collapse;text-align:left;font-size:0.9rem;margin-bottom:1.5rem;">
                <thead>
                  <tr style="border-bottom:1px solid var(--border-color);">
                    <th style="padding:0.75rem 0.5rem;">Project / Phase</th>
                    <th style="min-width:220px;">Progress vs Timeline</th>
                    <th>Health</th>
                  </tr>
                </thead>
                <tbody>
                  ${activeProjects.map(p => {
                    const overall = calculateOverallProgress(p);
                    const timeline = calculateTimelineProgress(p);
                    const health = getHealthStatus(p);
                    const latestNote = p.history && p.history.length > 0 ? p.history[p.history.length - 1].note : 'No status notes yet.';
                    return html`
                      <tr style="border-top:1px solid var(--border-color);">
                        <td style="padding:0.75rem 0.5rem;">
                          <div style="font-weight:600;display:flex;align-items:center;gap:0.4rem;">
                            ${p.title}
                            ${p.blockers && p.blockers.length > 0 && html`<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-orange);font-size:0.8rem;"></i>`}
                          </div>
                          <div style="margin-top:0.25rem;display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
                            <span class="tag ${getPhaseClass(p.phase)}">${p.phase}</span>
                            <${ProjectBadges} project=${p} />
                          </div>
                        </td>
                        <td style="padding-right:2rem;">
                          <div style="font-size:0.75rem;display:flex;justify-content:space-between;margin-bottom:0.3rem;">
                            <span style="color:var(--accent-blue);font-weight:600;">Completion: ${overall}%</span>
                            <span style="color:var(--text-secondary);">Time elapsed: ${timeline}%</span>
                          </div>
                          <div style="width:100%;height:6px;background:rgba(255,255,255,0.05);border-radius:4px;position:relative;">
                            <div style="position:absolute;top:0;left:0;height:100%;width:${timeline}%;background:var(--text-secondary);opacity:0.3;border-radius:4px;"></div>
                            <div style="position:absolute;top:0;left:0;height:100%;width:${overall}%;background:${health.color};border-radius:4px;box-shadow:0 0 4px ${health.color};"></div>
                          </div>
                        </td>
                        <td><span style="color:${health.color};font-weight:bold;background:rgba(0,0,0,0.2);padding:0.2rem 0.6rem;border-radius:4px;white-space:nowrap;">${health.label}</span></td>
                      </tr>
                      <tr style="background:rgba(255,255,255,0.02);">
                        <td colspan="3" style="padding:0.75rem 1rem;border-left:2px solid var(--accent-blue);">
                          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;font-size:0.85rem;">
                            <div>
                              <div style="color:var(--text-secondary);font-size:0.75rem;text-transform:uppercase;font-weight:600;margin-bottom:0.25rem;">Description</div>
                              <div>${p.description || 'No description provided.'}</div>
                            </div>
                            <div>
                              <div style="color:var(--text-secondary);font-size:0.75rem;text-transform:uppercase;font-weight:600;margin-bottom:0.25rem;">Latest Status</div>
                              <div style="font-style:italic;">"${latestNote}"</div>
                              ${p.nextStep && html`<div style="margin-top:0.5rem;"><span style="color:var(--text-secondary);font-size:0.75rem;font-weight:600;text-transform:uppercase;">Next: </span><span style="color:var(--accent-green);font-weight:500;">${p.nextStep}</span></div>`}
                            </div>
                          </div>
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            `}

            <!-- Production / Iterating Projects Section -->
            ${productionProjects.length > 0 && html`
              <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#4ade80;margin-bottom:0.5rem;padding-left:0.5rem;">
                <i class="fa-solid fa-server" style="margin-right:0.4rem;"></i>Live Production Portfolio (${productionProjects.length})
              </div>
              <table style="width:100%;border-collapse:collapse;text-align:left;font-size:0.9rem;">
                <thead>
                  <tr style="border-bottom:1px solid rgba(74,222,128,0.2);">
                    <th style="padding:0.75rem 0.5rem;">Project / Phase</th>
                    <th style="min-width:220px;">Progress vs Timeline</th>
                    <th>Health</th>
                  </tr>
                </thead>
                <tbody>
                  ${productionProjects.map(p => {
                    const overall = calculateOverallProgress(p);
                    const timeline = calculateTimelineProgress(p);
                    const health = getHealthStatus(p);
                    const latestNote = p.history && p.history.length > 0 ? p.history[p.history.length - 1].note : 'Successfully deployed.';
                    const iterNum = p.iteration || 1;
                    const isIter = p.is_iterating === 1;
                    return html`
                      <tr style="border-top:1px solid rgba(74,222,128,0.1);">
                        <td style="padding:0.75rem 0.5rem;">
                          <div style="font-weight:600;display:flex;align-items:center;gap:0.4rem;">
                            ${p.title}
                            ${p.blockers && p.blockers.length > 0 && html`<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-orange);font-size:0.8rem;"></i>`}
                          </div>
                          <div style="margin-top:0.25rem;display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
                            <span class="tag ${getPhaseClass(p.phase)}">${p.phase}</span>
                            <${ProjectBadges} project=${p} />
                          </div>
                        </td>
                        <td style="padding-right:2rem;">
                          <div style="font-size:0.75rem;display:flex;justify-content:space-between;margin-bottom:0.3rem;">
                            <span style="color:#4ade80;font-weight:600;">Completion: ${overall}%</span>
                            <span style="color:var(--text-secondary);">Time elapsed: ${timeline}%</span>
                          </div>
                          <div style="width:100%;height:6px;background:rgba(255,255,255,0.05);border-radius:4px;position:relative;">
                            <div style="position:absolute;top:0;left:0;height:100%;width:${timeline}%;background:var(--text-secondary);opacity:0.3;border-radius:4px;"></div>
                            <div style="position:absolute;top:0;left:0;height:100%;width:${overall}%;background:${health.color};border-radius:4px;box-shadow:0 0 4px ${health.color};"></div>
                          </div>
                        </td>
                        <td><span style="color:${health.color};font-weight:bold;background:rgba(0,0,0,0.2);padding:0.2rem 0.6rem;border-radius:4px;white-space:nowrap;">${health.label}</span></td>
                      </tr>
                      <tr style="background:rgba(74,222,128,0.03);">
                        <td colspan="3" style="padding:0.75rem 1rem;border-left:2px solid #4ade80;">
                          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;font-size:0.85rem;">
                            <div>
                              <div style="color:var(--text-secondary);font-size:0.75rem;text-transform:uppercase;font-weight:600;margin-bottom:0.25rem;">Description</div>
                              <div>${p.description || 'No description provided.'}</div>
                            </div>
                            <div>
                              <div style="color:var(--text-secondary);font-size:0.75rem;text-transform:uppercase;font-weight:600;margin-bottom:0.25rem;">Latest Status</div>
                              <div style="font-style:italic;">"${latestNote}"</div>
                              ${p.nextStep && html`<div style="margin-top:0.5rem;"><span style="color:var(--text-secondary);font-size:0.75rem;font-weight:600;text-transform:uppercase;">Next: </span><span style="color:#4ade80;font-weight:500;">${p.nextStep}</span></div>`}
                            </div>
                          </div>
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            `}
          `
        }
      </div>

    </div>
  `;
};

// ─── ProjectModal ─────────────────────────────────────────────────────────────
// Guard wrapper so hooks are ALWAYS called (fixes Rules of Hooks violation)
const ProjectModal = ({ project, currentUser, onClose, onUpdate }) => {
  if (!project) return null;
  return html`<${ProjectModalInner} project=${project} currentUser=${currentUser} onClose=${onClose} onUpdate=${onUpdate} />`;
};

const ProjectModalInner = ({ project, currentUser, onClose, onUpdate }) => {
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
    const res = await fetch('/api/projects', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) { alert('Save failed — check server logs.'); return; }
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
    await fetch('/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...project, history: newHistory }) });
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

    await fetch('/api/projects', {
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

// ─── TaskManagementTab ────────────────────────────────────────────────────────
const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
const STATUS_META = {
  todo:        { label: 'To Do',      color: 'var(--text-secondary)',  bg: 'rgba(255,255,255,0.06)' },
  in_progress: { label: 'In Progress',color: 'var(--accent-blue)',     bg: 'rgba(59,130,246,0.12)' },
  review:      { label: 'In Review',  color: 'var(--accent-purple)',   bg: 'rgba(139,92,246,0.12)' },
  done:        { label: 'Done',       color: 'var(--accent-green)',    bg: 'rgba(16,185,129,0.12)' },
};

const TaskManagementTab = ({ projects, tasks, fetchTasks, currentUser }) => {
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
      await fetch('/api/tasks/' + editingTask.id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      logAudit(currentUser, 'TASK_UPDATED', `Updated task: ${form.title} (ID ${editingTask.id})`);
    } else {
      await fetch('/api/tasks', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      logAudit(currentUser, 'TASK_CREATED', `Created task: ${form.title} in project ${form.project_id || 'N/A'}`);
    }
    resetForm();
    fetchTasks();
  };

  const handleDelete = async (task) => {
    if (!confirm(`Delete task "${task.title}"?`)) return;
    await fetch('/api/tasks/' + task.id, { method: 'DELETE' });
    logAudit(currentUser, 'TASK_DELETED', `Deleted task: ${task.title} (ID ${task.id})`);
    fetchTasks();
  };

  const handleStatusChange = async (task, newStatus) => {
    const payload = { ...task, status: newStatus };
    delete payload.created_at; // strip for update
    await fetch('/api/tasks/' + task.id, {
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
                      ${TASK_STATUSES.filter(s => s !== status).map(s => html`
                        <button class="btn" style="font-size:0.65rem;padding:0.15rem 0.4rem;color:${STATUS_META[s].color};" onClick=${() => handleStatusChange(task, s)}>
                          ${STATUS_META[s].label}
                        </button>
                      `)}
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

// ─── AuditLogTab ──────────────────────────────────────────────────────────────
const ACTION_ICON = {
  TASK_CREATED:        { icon: 'fa-plus-circle',      color: 'var(--accent-green)' },
  TASK_UPDATED:        { icon: 'fa-pen-to-square',    color: 'var(--accent-blue)' },
  TASK_DELETED:        { icon: 'fa-trash-can',         color: 'var(--accent-orange)' },
  TASK_STATUS_CHANGED: { icon: 'fa-arrows-rotate',    color: 'var(--accent-purple)' },
  PROJECT_UPDATED:     { icon: 'fa-folder-gear',      color: 'var(--accent-blue)' },
  PROJECT_NOTE_ADDED:  { icon: 'fa-comment-dots',     color: 'var(--accent-purple)' },
};

const AuditLogTab = () => {
  const [logs, setLogs] = useState([]);
  const [filterAction, setFilterAction] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    const d = await (await fetch('/api/audit-logs')).json();
    setLogs(d);
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const uniqueUsers = [...new Set(logs.map(l => l.username).filter(Boolean))];
  const uniqueActions = [...new Set(logs.map(l => l.action).filter(Boolean))];

  const displayed = logs.filter(l => {
    if (filterAction !== 'all' && l.action !== filterAction) return false;
    if (filterUser !== 'all' && l.username !== filterUser) return false;
    return true;
  });

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title"><i class="fa-solid fa-file-shield" style="margin-right:0.5rem;"></i>System Audit Log</h2>
          <p class="page-subtitle">Read-only record of all user actions in the system</p>
        </div>
        <button class="btn" onClick=${fetchLogs}><i class="fa-solid fa-rotate-right"></i> Refresh</button>
      </div>

      <div style="display:flex;gap:0.75rem;margin-bottom:1.5rem;flex-wrap:wrap;align-items:center;">
        <select class="form-select" style="font-size:0.8rem;padding:0.3rem 0.6rem;" value=${filterAction} onChange=${e => setFilterAction(e.target.value)}>
          <option value="all">All Actions</option>
          ${uniqueActions.map(a => html`<option value=${a}>${a}</option>`)}
        </select>
        <select class="form-select" style="font-size:0.8rem;padding:0.3rem 0.6rem;" value=${filterUser} onChange=${e => setFilterUser(e.target.value)}>
          <option value="all">All Users</option>
          ${uniqueUsers.map(u => html`<option value=${u}>${u}</option>`)}
        </select>
        <span style="font-size:0.8rem;color:var(--text-secondary);margin-left:auto;">${displayed.length} event${displayed.length !== 1 ? 's' : ''}</span>
      </div>

      <div class="info-block" style="padding:0;overflow:hidden;">
        ${loading
          ? html`<div style="padding:2rem;text-align:center;color:var(--text-secondary);">Loading audit events...</div>`
          : displayed.length === 0
            ? html`<div style="padding:2rem;text-align:center;color:var(--text-secondary);font-style:italic;">No audit events yet. Actions in the Task Management tab will appear here.</div>`
            : html`
              <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
                <thead>
                  <tr style="background:rgba(0,0,0,0.2);border-bottom:1px solid var(--border-color);">
                    <th style="padding:0.75rem 1rem;text-align:left;">Timestamp</th>
                    <th style="padding:0.75rem 0.5rem;">User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th style="padding-right:1rem;">Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${displayed.map((log, i) => {
                    const meta = ACTION_ICON[log.action] || { icon: 'fa-circle-info', color: 'var(--text-secondary)' };
                    return html`
                      <tr style="border-top:1px solid var(--border-color);background:${i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'};">
                        <td style="padding:0.7rem 1rem;color:var(--text-secondary);white-space:nowrap;">${log.timestamp}</td>
                        <td style="padding:0.7rem 0.5rem;">
                          <div style="display:flex;align-items:center;gap:0.5rem;">
                            <div class="avatar" style="width:26px;height:26px;font-size:0.6rem;">${(log.username||'?').substring(0,2).toUpperCase()}</div>
                            <strong>${log.username}</strong>
                          </div>
                        </td>
                        <td>
                          <span class="tag" style="background:${log.user_role==='admin'?'rgba(245,158,11,0.15)':'rgba(59,130,246,0.1)'};color:${log.user_role==='admin'?'var(--accent-orange)':'var(--accent-blue)'};">${log.user_role}</span>
                        </td>
                        <td>
                          <span style="color:${meta.color};font-weight:600;display:flex;align-items:center;gap:0.35rem;white-space:nowrap;">
                            <i class="fa-solid ${meta.icon}"></i>${log.action.replace(/_/g,' ')}
                          </span>
                        </td>
                        <td style="color:var(--text-secondary);padding-right:1rem;max-width:320px;">${log.details}</td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            `
        }
      </div>
    </div>
  `;
};

// ─── App Root ─────────────────────────────────────────────────────────────────
const App = () => {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('currentUser')); } catch { return null; }
  });
  const [projectsList, setProjectsList] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [boardView, setBoardView] = useState('phase');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [usersList, setUsersList] = useState([]);

  const [tasksList, setTasksList] = useState([]);

  const fetchProjects = async () => { const d = await (await fetch('/api/projects')).json(); setProjectsList(d); };
  const fetchUsers = async () => { const d = await (await fetch('/api/users')).json(); setUsersList(d); };
  const fetchTasks = async () => {
    if (!currentUser) return;
    const team = encodeURIComponent(currentUser.team || '');
    const url = currentUser.role === 'admin'
      ? '/api/tasks?role=admin'
      : `/api/tasks?role=member&team=${team}`;
    const d = await (await fetch(url)).json();
    setTasksList(d);
  };

  const handleLogin = (user) => { localStorage.setItem('currentUser', JSON.stringify(user)); setCurrentUser(user); };
  const handleLogout = () => { localStorage.removeItem('currentUser'); setCurrentUser(null); };

  useEffect(() => { if (currentUser) { fetchProjects(); fetchTasks(); if (currentUser.role === 'admin') fetchUsers(); } }, [currentUser]);
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') setSelectedProjectId(null); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const selectedProject = selectedProjectId ? projectsList.find(p => p.id === selectedProjectId) : null;

  if (!currentUser) return html`<${LoginScreen} onLogin=${handleLogin} />`;

  const isAdmin = currentUser.role === 'admin';

  return html`
    <div>
      <nav class="navbar">
        <div class="brand"><i class="fa-solid fa-chart-network"></i> BI Project Manager</div>
        <div class="nav-links">
          <button class="btn ${activeTab === 'dashboard' ? 'active' : ''}" onClick=${() => setActiveTab('dashboard')}><i class="fa-solid fa-gauge-high"></i> Dashboard</button>
          <button class="btn ${activeTab === 'board' ? 'active' : ''}" onClick=${() => setActiveTab('board')}><i class="fa-solid fa-layer-group"></i> Pivot Board</button>
          <button class="btn ${activeTab === 'tasks' ? 'active' : ''}" onClick=${() => setActiveTab('tasks')}><i class="fa-solid fa-list-check"></i> Tasks</button>
          ${isAdmin && html`
            <button class="btn ${activeTab === 'audit' ? 'active' : ''}" style="color:var(--accent-purple);" onClick=${() => setActiveTab('audit')}><i class="fa-solid fa-file-shield"></i> Audit Log</button>
            <button class="btn ${activeTab === 'manage' ? 'active' : ''}" style="color:var(--accent-orange);" onClick=${() => setActiveTab('manage')}><i class="fa-solid fa-server"></i> Manage</button>
            <button class="btn ${activeTab === 'new-project' ? 'active' : ''}" style="color:var(--accent-green);" onClick=${() => setActiveTab('new-project')}><i class="fa-solid fa-plus"></i> New Project</button>
            <button class="btn ${activeTab === 'admin' ? 'active' : ''}" onClick=${() => setActiveTab('admin')}><i class="fa-solid fa-shield"></i> Admin Panel</button>
          `}
        </div>
        <div style="display:flex;align-items:center;gap:1rem;">
          <div style="font-size:0.85rem;color:var(--text-secondary);">
            Logged in as <strong>${currentUser.username}</strong>
            <div style="font-size:0.7rem;">${currentUser.team}</div>
          </div>
          <button class="btn" onClick=${handleLogout}><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
        </div>
      </nav>
      <main class="main-content">
        ${activeTab === 'dashboard' && html`<${Dashboard} projects=${projectsList} />`}
        ${activeTab === 'board' && html`<${KanbanBoard} projects=${projectsList} tasks=${tasksList} viewMode=${boardView} setViewMode=${setBoardView} onProjectClick=${p => setSelectedProjectId(p.id)} onUpdate=${fetchTasks} />`}
        ${activeTab === 'tasks' && html`<${TaskManagementTab} projects=${projectsList} tasks=${tasksList} fetchTasks=${fetchTasks} currentUser=${currentUser} />`}
        ${activeTab === 'audit' && isAdmin && html`<${AuditLogTab} />`}
        ${activeTab === 'manage' && isAdmin && html`<${ProjectsManagementTab} projects=${projectsList} fetchProjects=${fetchProjects} setEditId=${setSelectedProjectId} />`}
        ${activeTab === 'new-project' && isAdmin && html`<${CreateProjectTab} onSave=${() => { fetchProjects(); setActiveTab('dashboard'); }} />`}
        ${activeTab === 'admin' && isAdmin && html`<${AdminPanel} users=${usersList} fetchUsers=${fetchUsers} />`}
      </main>
      <${ProjectModal} project=${selectedProject} currentUser=${currentUser} onClose=${() => setSelectedProjectId(null)} onUpdate=${fetchProjects} />
    </div>
  `;
};

render(html`<${App} />`, document.getElementById('app'));
