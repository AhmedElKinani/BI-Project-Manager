import { h, render } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import { PHASES, TEAMS } from './mockData.js';

const html = htm.bind(h);

// ─── Utils ───────────────────────────────────────────────────────────────────
const getInitials = (name) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

const formatDuration = (startStr, endStr) => {
  if (!startStr || !endStr) return { label: '—', days: null, hours: null };
  const ms = Math.max(0, new Date(endStr) - new Date(startStr));
  const hrs = ms / (1000 * 3600);
  const d = Math.floor(hrs / 24);
  const h = Math.round(hrs % 24);
  const label = d > 0 ? `${d}d ${h}h` : `${h}h`;
  return { label, days: hrs / 24, hours: hrs };
};
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


const markdownToHtml = (md) => {
  if (!md) return '';
  let htmlText = md.replace(/^### (.*$)/gim, '<h3>$1</h3>')
                   .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                   .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                   .replace(/^> (.*$)/gim, '<blockquote>$1</blockquote>')
                   .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
                   .replace(/\*(.*)\*/gim, '<i>$1</i>')
                   .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img alt='$1' src='$2' />")
                   .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>")
                   .replace(/\n$/gim, '<br />');
  return htmlText;
};

const sendNotification = async (user_id, message, related_task_id=null) => {
  if(!user_id) return;
  await fetch('/api/notifications', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, message, related_task_id })
  });
};

// Posts a system message to a team channel. Use [TASK:id:title] to embed clickable task links.
const sendChannelMessage = async (channelName, sender, content) => {
  if (!channelName || !content) return;
  await fetch('/api/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel_name: channelName, sender, content })
  });
};

// Parses a message and renders [TASK:id:title] tokens as clickable badges
const parseMessageContent = (content, onTaskClick) => {
  const parts = content.split(/(\[TASK:\d+:[^\]]+\])/g);
  return parts.map((part, i) => {
    const match = part.match(/^\[TASK:(\d+):([^\]]+)\]$/);
    if (match) {
      const [, taskId, taskTitle] = match;
      return html`<span key=${i} style="display:inline-flex;align-items:center;gap:0.3rem;background:rgba(59,130,246,0.2);border:1px solid rgba(59,130,246,0.4);border-radius:4px;padding:0.1rem 0.4rem;cursor:pointer;font-size:0.8rem;color:var(--accent-blue);"
        onClick=${() => onTaskClick && onTaskClick(Number(taskId))}>
        <i class="fa-solid fa-link" style="font-size:0.65rem;"></i> ${taskTitle}
      </span>`;
    }
    return html`<span key=${i}>${part}</span>`;
  });
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
const ROLE_META = {
  admin:  { label: 'Admin',       color: 'var(--accent-orange)', desc: 'Full system access. Can create/manage users, projects, see all data.' },
  leader: { label: 'Team Leader', color: 'var(--accent-blue)',   desc: 'Can assign tasks, submit phases, view team dashboard, approve self-assigns.' },
  member: { label: 'Member',      color: 'var(--accent-green)',  desc: 'Can view own tasks, claim pool tasks, self-assign (pending approval), use comms.' },
};

const AdminPanel = ({ users, fetchUsers }) => {
  // Create user state
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'member', team: TEAMS[0] });
  const [createMsg, setCreateMsg] = useState('');

  // Edit user state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await fetch('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm)
    });
    if (res.ok) {
      setCreateMsg('✓ Account created successfully');
      setCreateForm({ username: '', password: '', role: 'member', team: TEAMS[0] });
      fetchUsers();
      setTimeout(() => setCreateMsg(''), 3000);
    } else {
      setCreateMsg('✗ Error: username may already be taken');
    }
  };

  const handleEditSave = async () => {
    await fetch('/api/users/' + editingUser.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    });
    setEditingUser(null);
    fetchUsers();
  };

  const handleDelete = async (u) => {
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    await fetch('/api/users/' + u.id, { method: 'DELETE' });
    fetchUsers();
  };

  const startEdit = (u) => {
    setEditingUser(u);
    setEditForm({ role: u.role, team: u.team, password: '' });
  };

  return html`
    <div>
      <div class="page-header">
        <div><h2 class="page-title">Admin Control Panel</h2><p class="page-subtitle">Manage user accounts, roles, and system permissions</p></div>
      </div>

      <!-- Permissions Reference -->
      <div class="metric-card" style="margin-bottom:1.5rem;padding:1.25rem;">
        <div style="font-size:0.82rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);margin-bottom:1rem;"><i class="fa-solid fa-shield-halved" style="margin-right:0.4rem;"></i>Role Permissions Reference</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;">
          ${Object.entries(ROLE_META).map(([role, meta]) => {
            const perms = {
              admin:  ['✓ Create/Delete Users','✓ All Projects (View+Edit)','✓ All Tasks (View)','✓ Phase Submission (Any)','✓ Dashboard & Analytics','✓ Audit Logs','✓ Admin Panel'],
              leader: ['✗ User Management','✓ Own Team Projects','✓ Assign/Approve Tasks','✓ Team Phase Submission','✓ Team Dashboard','✓ Monitoring (Team)','✗ Audit Logs'],
              member: ['✗ User Management','✗ Project Editing','✓ My Tasks (Accept/Pass)','✓ Team Pool (Claim)','✓ Self-Assign (Approval Req.)','✓ Communications','✓ Monitoring (Own Tasks)'],
            }[role] || [];
            return html`
              <div style="background:rgba(0,0,0,0.15);border-radius:var(--radius-md);padding:1rem;border:1px solid ${meta.color}22;">
                <div style="font-weight:700;color:${meta.color};margin-bottom:0.5rem;font-size:0.9rem;">${meta.label}</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.75rem;">${meta.desc}</div>
                ${perms.map(p => html`<div style="font-size:0.75rem;color:${p.startsWith('✓') ? 'var(--accent-green)' : 'var(--text-secondary)'};margin-bottom:0.2rem;">${p}</div>`)}
              </div>
            `;
          })}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:380px 1fr;gap:1.5rem;">
        <!-- Create User Form -->
        <div class="info-block">
          <div class="section-title"><i class="fa-solid fa-user-plus"></i> Create New Account</div>
          ${createMsg && html`<div style="margin-bottom:1rem;padding:0.5rem 0.75rem;border-radius:6px;background:${createMsg.startsWith('✓') ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};color:${createMsg.startsWith('✓') ? 'var(--accent-green)' : 'var(--accent-orange)'};">${createMsg}</div>`}
          <form onSubmit=${handleCreate} style="display:flex;flex-direction:column;gap:0.85rem;">
            <div>
              <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.3rem;">Username *</label>
              <input placeholder="e.g. john_doe" class="form-input" value=${createForm.username} onInput=${e => setCreateForm({...createForm, username: e.target.value})} required />
            </div>
            <div>
              <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.3rem;">Password *</label>
              <input placeholder="••••••••" type="password" class="form-input" value=${createForm.password} onInput=${e => setCreateForm({...createForm, password: e.target.value})} required />
            </div>
            <div>
              <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.3rem;">Role</label>
              <select class="form-select" value=${createForm.role} onChange=${e => setCreateForm({...createForm, role: e.target.value})}>
                <option value="admin">Admin — Full Access</option>
                <option value="leader">Team Leader</option>
                <option value="member">Team Member</option>
              </select>
            </div>
            <div>
              <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.3rem;">Team</label>
              <select class="form-select" value=${createForm.team} onChange=${e => setCreateForm({...createForm, team: e.target.value})}>
                ${TEAMS.map(t => html`<option value=${t}>${t}</option>`)}
                <option value="Management">Management</option>
              </select>
            </div>
            <button type="submit" class="btn active" style="background:var(--accent-blue);margin-top:0.5rem;">
              <i class="fa-solid fa-user-plus"></i> Create Account
            </button>
          </form>
        </div>

        <!-- User Roster -->
        <div class="info-block" style="padding:0;overflow:hidden;">
          <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;">
            <div class="section-title" style="margin:0;"><i class="fa-solid fa-users"></i> User Roster (${users.length})</div>
          </div>
          <div style="overflow-y:auto;max-height:600px;">
            <table class="data-grid-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Team</th>
                  <th style="text-align:right;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${users.map(u => {
                  const isEditing = editingUser?.id === u.id;
                  const meta = ROLE_META[u.role] || ROLE_META.member;
                  return html`
                    <tr style="border-bottom:1px solid var(--border-color);background:${isEditing ? 'rgba(59,130,246,0.04)' : 'transparent'};">
                      <td style="padding:0.75rem 1rem;">
                        <div style="display:flex;align-items:center;gap:0.6rem;">
                          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.7rem;flex-shrink:0;">
                            ${getInitials(u.username)}
                          </div>
                          <div>
                            <div style="font-weight:600;">${u.username}</div>
                            <div style="font-size:0.68rem;color:var(--text-secondary);">ID: ${u.id}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        ${isEditing
                          ? html`<select class="form-select" style="font-size:0.8rem;" value=${editForm.role} onChange=${e => setEditForm({...editForm, role: e.target.value})}>
                              <option value="admin">Admin</option>
                              <option value="leader">Leader</option>
                              <option value="member">Member</option>
                            </select>`
                          : html`<span class="tag" style="background:${meta.color}22;color:${meta.color};font-size:0.72rem;">${meta.label}</span>`
                        }
                      </td>
                      <td>
                        ${isEditing
                          ? html`<select class="form-select" style="font-size:0.8rem;" value=${editForm.team} onChange=${e => setEditForm({...editForm, team: e.target.value})}>
                              ${TEAMS.map(t => html`<option value=${t}>${t}</option>`)}
                              <option value="Management">Management</option>
                            </select>`
                          : html`<span style="font-size:0.82rem;">${u.team || '—'}</span>`
                        }
                      </td>
                      <td style="text-align:right;padding-right:1rem;">
                        ${isEditing ? html`
                          <div style="display:flex;flex-direction:column;gap:0.4rem;align-items:flex-end;">
                            <input class="form-input" type="password" placeholder="New password (leave blank to keep)" style="font-size:0.75rem;width:180px;" value=${editForm.password} onInput=${e => setEditForm({...editForm, password: e.target.value})} />
                            <div style="display:flex;gap:0.4rem;">
                              <button class="btn" style="font-size:0.75rem;background:var(--accent-green);color:white;" onClick=${handleEditSave}><i class="fa-solid fa-check"></i> Save</button>
                              <button class="btn" style="font-size:0.75rem;" onClick=${() => setEditingUser(null)}>Cancel</button>
                            </div>
                          </div>
                        ` : html`
                          <div style="display:flex;gap:0.4rem;justify-content:flex-end;">
                            <button class="btn" style="font-size:0.75rem;color:var(--accent-blue);" onClick=${() => startEdit(u)}><i class="fa-solid fa-pen"></i> Edit</button>
                            <button class="btn" style="font-size:0.75rem;color:var(--accent-orange);" onClick=${() => handleDelete(u)}><i class="fa-solid fa-trash"></i></button>
                          </div>
                        `}
                      </td>
                    </tr>
                  `;
                })}
              </tbody>
            </table>
          </div>
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

// ─── CreateProjectTab ─────────────────────────────────────────────────────────
const CreateProjectTab = ({ onSave }) => {
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
const Dashboard = ({ projects, tasks }) => {
  const [activeFilter, setActiveFilter] = useState({ type: 'ALL', value: null });
  const [workloadView, setWorkloadView] = useState('projects'); // 'projects' | 'tasks'
  const [taskFilterMember, setTaskFilterMember] = useState('all');
  const [taskFilterProject, setTaskFilterProject] = useState('all');

  const total = projects.length;
  const deployedCount = projects.filter(p => Boolean(Number(p.is_deployed))).length;
  const activeTotal = total;

  // Task workload by team
  const tasksByTeam = useMemo(() => {
    const map = {};
    TEAMS.forEach(t => { map[t] = { total: 0, done: 0, inProgress: 0, blocked: 0 }; });
    (tasks || []).forEach(t => {
      // Respect project filter if active
      if (activeFilter.type === 'PROJECT' && t.project_id !== activeFilter.value) return;
      if (!map[t.team]) return;
      map[t.team].total++;
      if (t.status === 'done') map[t.team].done++;
      else if (t.status === 'in_progress') map[t.team].inProgress++;
      else if (t.status === 'blocked') map[t.team].blocked++;
    });
    return map;
  }, [tasks, projects, activeFilter]);

  const teamStats = useMemo(() => {
    const stats = {};
    TEAMS.forEach(t => { stats[t] = { preProd: 0, prodIter: 0 }; });
    projects.forEach(p => { 
      // Respect project filter if active
      if (activeFilter.type === 'PROJECT' && p.id !== activeFilter.value) return;
      if (stats[p.team] !== undefined) {
        if (Boolean(Number(p.is_deployed))) stats[p.team].prodIter++;
        else stats[p.team].preProd++;
      } 
    });
    return stats;
  }, [projects, activeFilter]);

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
      if (activeFilter.type === 'PROJECT') return p.id === activeFilter.value;
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
        <div style="display:flex;gap:0.75rem;align-items:center;">
           <span style="font-size:0.8rem;color:var(--text-secondary);font-weight:600;">Project Scope:</span>
           <select class="form-select" style="min-width:180px;" value=${activeFilter.type === 'PROJECT' ? activeFilter.value : 'all'} 
             onChange=${e => toggleFilter('PROJECT', e.target.value === 'all' ? null : e.target.value)}>
             <option value="all">All Projects</option>
             ${projects.map(p => html`<option value=${p.id}>${p.id} - ${p.title}</option>`)}
           </select>
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
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
            <div class="metric-title" style="margin:0;"><i class="fa-solid fa-users" style="margin-right:0.4rem;"></i>Team Workload</div>
            <div style="display:flex;gap:0.25rem;">
              <button class="btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;${workloadView==='projects'?'background:var(--accent-blue);color:white;':''}"
                onClick=${() => setWorkloadView('projects')}>Projects</button>
              <button class="btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;${workloadView==='tasks'?'background:var(--accent-purple);color:white;':''}"
                onClick=${() => setWorkloadView('tasks')}>Tasks</button>
            </div>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;">
            ${workloadView === 'projects' ? 'Pre-Prod vs Production Iterations' : 'Task load by team — Done · In Progress · Blocked'}
          </div>
          <div style="display:flex;flex-direction:column;gap:1.1rem;">
            ${TEAMS.map(team => {
              const sel = isActive('TEAM', team);
              if (workloadView === 'projects') {
                const preProdCount = teamStats[team]?.preProd || 0;
                const prodIterCount = teamStats[team]?.prodIter || 0;
                const tCount = preProdCount + prodIterCount;
                const preProdPct = total > 0 ? (preProdCount / total) * 100 : 0;
                const prodIterPct = total > 0 ? (prodIterCount / total) * 100 : 0;
                return html`
                  <div style="cursor:pointer;transition:var(--transition);padding:0.35rem 0.4rem;border-radius:6px;background:${sel ? 'rgba(255,255,255,0.07)' : 'transparent'};"
                    onClick=${() => toggleFilter('TEAM', team)}>
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
                      <span style="font-size:0.83rem;font-weight:500;">${team.replace(' Team','')}</span>
                      <span style="font-size:0.83rem;color:var(--text-secondary);">${tCount} (${preProdCount} pre, ${prodIterCount} prod)</span>
                    </div>
                    <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;display:flex;">
                      <div style="height:100%;width:${preProdPct}%;background:linear-gradient(90deg,var(--accent-blue),var(--accent-purple));"></div>
                      <div style="height:100%;width:${prodIterPct}%;background:var(--accent-green);opacity:0.8;"></div>
                    </div>
                  </div>
                `;
              } else {
                const td = tasksByTeam[team] || {};
                const maxT = Math.max(1, ...TEAMS.map(t => (tasksByTeam[t]?.total || 0)));
                const barW = td.total ? Math.max(5, Math.round((td.total / maxT) * 100)) : 0;
                return html`
                  <div style="cursor:pointer;transition:var(--transition);padding:0.35rem 0.4rem;border-radius:6px;background:${sel ? 'rgba(255,255,255,0.07)' : 'transparent'};"
                    onClick=${() => toggleFilter('TEAM', team)}>
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
                      <span style="font-size:0.83rem;font-weight:500;">${team.replace(' Team','')}</span>
                      <span style="font-size:0.83rem;color:var(--text-secondary);">
                        ${td.total || 0} tasks
                        <span style="color:var(--accent-green);"> ✓${td.done||0}</span>
                        <span style="color:var(--accent-orange);"> ⚡${td.inProgress||0}</span>
                        ${td.blocked > 0 ? html`<span style="color:var(--accent-pink);"> ⚠${td.blocked}</span>` : ''}
                      </span>
                    </div>
                    <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;display:flex;">
                      ${td.total > 0 && html`
                        <div style="height:100%;width:${Math.round((td.done||0)/td.total*100)}%;background:var(--accent-green);"></div>
                        <div style="height:100%;width:${Math.round((td.inProgress||0)/td.total*100)}%;background:var(--accent-orange);"></div>
                        <div style="height:100%;width:${Math.round((td.blocked||0)/td.total*100)}%;background:var(--accent-pink);opacity:0.8;"></div>
                      `}
                    </div>
                  </div>
                `;
              }
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
            <button class="btn" style="font-size:0.8rem;padding:0.25rem 0.75rem;border:1px solid var(--border-color);" onClick=${() => { setActiveFilter({ type: 'ALL', value: null }); setTaskFilterProject('all'); }}>
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
              <table class="data-grid-table" style="margin-bottom:1.5rem;">
                <thead>
                  <tr>
                    <th>Project / Phase</th>
                    <th>Stakeholder</th>
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
                        <td style="font-size:0.82rem;">
                          ${(() => {
                            const sh = Array.isArray(p.stakeholders) ? p.stakeholders : (p.stakeholders && p.stakeholders !== '[]' ? [p.stakeholders] : []);
                            return sh.length > 0 
                              ? sh.map(s => html`<div style="display:flex;align-items:center;gap:0.3rem;margin-bottom:0.15rem;"><i class="fa-solid fa-star" style="font-size:0.55rem;color:var(--accent-orange);"></i><span>${s}</span></div>`)
                              : html`<span style="color:var(--text-secondary);">—</span>`;
                          })()}
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
                        <td colspan="4" style="padding:0.75rem 1rem;border-left:2px solid var(--accent-blue);">
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
              <table class="data-grid-table">
                <thead>
                  <tr>
                    <th>Project / Phase</th>
                    <th>Stakeholder</th>
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
                        <td style="font-size:0.82rem;">
                          ${(() => {
                            const sh = Array.isArray(p.stakeholders) ? p.stakeholders : (p.stakeholders && p.stakeholders !== '[]' ? [p.stakeholders] : []);
                            return sh.length > 0 
                              ? sh.map(s => html`<div style="display:flex;align-items:center;gap:0.3rem;margin-bottom:0.15rem;"><i class="fa-solid fa-star" style="font-size:0.55rem;color:var(--accent-orange);"></i><span>${s}</span></div>`)
                              : html`<span style="color:var(--text-secondary);">—</span>`;
                          })()}
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
                        <td colspan="4" style="padding:0.75rem 1rem;border-left:2px solid #4ade80;">
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

// ─── TaskManagementTab ────────────────────────────────────────────────────────
const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done'];
const STATUS_META = {
  todo:        { label: 'To Do',      color: 'var(--text-secondary)',  bg: 'rgba(255,255,255,0.06)' },
  in_progress: { label: 'In Progress',color: 'var(--accent-blue)',     bg: 'rgba(59,130,246,0.12)' },
  review:      { label: 'In Review',  color: 'var(--accent-purple)',   bg: 'rgba(139,92,246,0.12)' },
  done:        { label: 'Done',       color: 'var(--accent-green)',    bg: 'rgba(16,185,129,0.12)' },
};

const TaskManagementTab = ({ projects, tasks, fetchTasks, currentUser }) => {
  
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
              <table class="data-grid-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Role</th>
                    <th>Action</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${displayed.map((log, i) => {
                    const meta = ACTION_ICON[log.action] || { icon: 'fa-circle-info', color: 'var(--text-secondary)' };
                    return html`
                      <tr>
                        <td style="color:var(--text-secondary);white-space:nowrap;">${log.timestamp}</td>
                        <td>
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
const NotificationBell = ({ currentUser }) => {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const fetchNotifs = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/notifications?user_id=' + encodeURIComponent(currentUser.username));
      if(res.ok) setNotifications(await res.json());
    } catch(e) {}
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 30000); // 30s polling
    return () => clearInterval(interval);
  }, [currentUser]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markRead = async (notif) => {
    if(notif.is_read) return;
    await fetch('/api/notifications/' + notif.id, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({is_read: 1})});
    fetchNotifs();
  };

  return html`
    <div style="position:relative;margin-right:1rem;">
      <button class="btn" style="position:relative;" onClick=${() => setOpen(!open)}>
        <i class="fa-solid fa-bell"></i>
        ${unreadCount > 0 && html`<span class="notif-badge">${unreadCount}</span>`}
      </button>
      ${open && html`
        <div class="notif-dropdown">
          <div style="padding:1rem;border-bottom:1px solid var(--border-color);font-weight:600;">Notifications</div>
          ${notifications.length === 0 ? html`<div style="padding:1rem;text-align:center;color:var(--text-secondary);">No notifications</div>` : 
            notifications.map(n => html`
              <div class="notif-item ${n.is_read ? '' : 'unread'}" onClick=${() => markRead(n)}>
                <div style="font-size:0.8rem;">${n.message}</div>
                <div style="font-size:0.65rem;color:var(--text-secondary);margin-top:0.25rem;">${n.created_at}</div>
              </div>
            `)
          }
        </div>
      `}
    </div>
  `;
};

// ─── Module: Task Manager ─────────────────────────────────────────────────────

const MyTasksView = ({ tasks, projects, fetchTasks, currentUser }) => {
  const myTasks = tasks.filter(t => t.assignee === currentUser.username && t.approval_status === 'approved' && t.acceptance_status !== 'passed');
  
  const pending = myTasks.filter(t => t.acceptance_status === 'pending_acceptance');
  const accepted = myTasks.filter(t => t.acceptance_status === 'accepted');

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
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    setShowSelfAssign(false);
    fetchTasks();
    alert('Task submitted for leader approval.');
  };

  const updateAcceptance = async (task, status) => {
    const payload = { ...task, acceptance_status: status };
    if (status === 'accepted') {
      const now = new Date().toISOString().split('.')[0].replace('T',' ');
      payload.accepted_at = now;
    } else if (status === 'passed') {
      payload.assignee = ''; // Send back to pool
    }
    await fetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
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
      const note = window.prompt("Task completed! Enter a resolution or completion note:", "");
      if (note === null) return; 
      resolution_note = note;
      completed_by = currentUser.username;
      payload.resolution_note = resolution_note;
      payload.completed_by = completed_by;
      payload.resolved_at = now;
    }
    
    await fetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    logAudit(currentUser, 'TASK_STATUS_CHANGED', `Moved task "${task.title}" to ${newStatus}`);
    fetchTasks();
  };

  const renderTask = (task, isPending) => {
    const proj = projects.find(p => p.id === task.project_id);
    const isOverdue = task.due_date && task.status !== 'done' && new Date(task.due_date) < new Date();
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
          ${task.due_date && html`<span style="font-size:0.73rem;color:${isOverdue ? 'var(--accent-pink)' : 'var(--text-secondary)'};"><i class="fa-solid fa-calendar" style="margin-right:0.25rem;"></i>${isOverdue ? '⚠ ' : ''}Due: ${task.due_date}</span>`}
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



const TeamPoolView = ({ tasks, projects, fetchTasks, currentUser }) => {
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
    await fetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
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


const ApprovalsView = ({ tasks, fetchTasks, currentUser, projects }) => {
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
      await fetch('/api/tasks/' + task.id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({...task, approval_status: 'approved'}) });
      sendNotification(task.created_by, `Your self-assigned task "${task.title}" was approved.`, task.id);
      sendChannelMessage(task.team, '🤖 System', `✅ Self-assigned task approved: [TASK:${task.id}:${task.title}] by @${task.created_by} is now active.`);
    } else {
      await fetch('/api/tasks/' + task.id, { method: 'DELETE' });
      sendNotification(task.created_by, `Your self-assigned task "${task.title}" was rejected.`);
      sendChannelMessage(task.team, '🤖 System', `❌ Self-assigned task rejected: "${task.title}" submitted by @${task.created_by}.`);
    }
    logAudit(currentUser, 'TASK_APPROVAL', `${isApproved ? 'Approved' : 'Rejected'} task "${task.title}" from ${task.created_by}`);
    fetchTasks();
  };

  const handleReviewAccept = async (task) => {
    await fetch('/api/tasks/' + task.id, { 
      method: 'PUT', headers: {'Content-Type':'application/json'}, 
      body: JSON.stringify({...task, acceptance_status: 'accepted'}) 
    });
    logAudit(currentUser, 'TASK_REVIEW_ACCEPTED', `Leader ${currentUser.username} accepted task "${task.title}" for verification.`);
    fetchTasks();
  };

  const handleReviewFinish = async (task, approved) => {
    if (approved) {
        const note = window.prompt("Verify completion. Add a closing note if needed:", task.resolution_note || "");
        if (note === null) return;
        const now = new Date().toISOString().split('.')[0].replace('T',' ');
        await fetch('/api/tasks/' + task.id, { 
          method: 'PUT', headers: {'Content-Type':'application/json'}, 
          body: JSON.stringify({...task, status: 'done', resolution_note: note, completed_by: task.assignee, resolved_at: now}) 
        });
        sendNotification(task.assignee, `Your task "${task.title}" has been verified and marked DONE.`, task.id);
    } else {
        const reason = window.prompt("Task rejected. Why does it need more work?", "");
        if (reason === null) return;
        await fetch('/api/tasks/' + task.id, { 
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
            <h3 style="font-size:0.95rem;font-weight:700;color:var(--accent-orange);margin:0;"><i class="fa-solid fa-plus-circle"></i> Creation Requests</h3>
            <span style="font-size:0.75rem;background:rgba(251,146,60,0.15);color:var(--accent-orange);padding:0.1rem 0.5rem;border-radius:10px;font-weight:700;">${creationApprovals.length}</span>
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

const TeamDashboardView = ({ tasks, projects, users, fetchTasks, currentUser }) => {
  const teamTasks = tasks.filter(t => t.team === currentUser.team && t.approval_status === 'approved');
  const teamMembers = users.filter(u => u.team === currentUser.team && u.role === 'member');
  
  const [showAssign, setShowAssign] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', project_id: '', crisp_dm_phase: (TEAM_PHASES[currentUser.team] || PHASES)[0], assignee: '', due_date: '' });

  const handleAssign = async (e) => {
    e.preventDefault();
    const payload = { ...form, team: currentUser.team, created_by: currentUser.username, approval_status: 'approved', acceptance_status: form.assignee ? 'pending_acceptance' : 'accepted' };
    const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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

  return html`
    <div>
      <div class="page-header">
        <div><h2 class="page-title">Team Oversight</h2><p class="page-subtitle">Manage workload, assign tasks, and submit phases</p></div>
        <button class="btn active" style="background:var(--accent-purple);" onClick=${() => setShowAssign(!showAssign)}><i class="fa-solid fa-user-plus"></i> Assign New Task</button>
      </div>

      <${PhaseSubmissionPanel} projects=${projects} currentUser=${currentUser} fetchProjects=${() => fetch('/api/projects').then(r=>r.json())} />

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
              <th>Task <span style="font-size:0.7rem;color:var(--text-secondary);font-weight:400;">(click to open)</span></th>
              <th>Assignee</th>
              <th>Status</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            ${teamTasks.map(t => html`
              <tr class="accordion-row" onClick=${() => setSelectedTask(t)}>
                <td>
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

      ${selectedTask && html`<${TaskDetailModal} task=${selectedTask} projects=${projects} currentUser=${currentUser} fetchTasks=${fetchTasks} onClose=${() => setSelectedTask(null)} />`}
    </div>
  `;
};


// ─── Module: Analytics & Monitoring ──────────────────────────────────────────────────

const TaskMonitoringTab = ({ tasks, projects, currentUser }) => {
  const isAdmin = currentUser.role === 'admin';
  const isLeader = currentUser.role === 'leader';

  // Role-scoped task set
  const scopedTasks = tasks.filter(t => {
    if (isAdmin) return true;
    if (isLeader) return t.team === currentUser.team;
    return t.assignee === currentUser.username;
  });

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [filterPhase, setFilterPhase] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);

  const filtered = scopedTasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterProject !== 'all' && t.project_id !== filterProject) return false;
    if (filterPhase !== 'all' && t.crisp_dm_phase !== filterPhase) return false;
    if (filterTeam !== 'all' && t.team !== filterTeam) return false;
    return true;
  });

  // Summary analytics over ALL scoped done tasks
  const doneTasks = scopedTasks.filter(t => t.status === 'done' && t.accepted_at && t.resolved_at);
  const ttrsHrs = doneTasks.map(t => formatDuration(t.accepted_at, t.resolved_at).hours);
  const tlcsHrs = doneTasks.map(t => formatDuration(t.created_at, t.resolved_at).hours);
  
  const avgTTRHrs = ttrsHrs.length ? (ttrsHrs.reduce((a,b) => a+b,0) / ttrsHrs.length) : 0;
  const avgTLCHrs = tlcsHrs.length ? (tlcsHrs.reduce((a,b) => a+b,0) / tlcsHrs.length) : 0;
  
  const avgTTR = avgTTRHrs ? `${Math.floor(avgTTRHrs/24)}d ${Math.round(avgTTRHrs%24)}h` : '—';
  const avgTLC = avgTLCHrs ? `${Math.floor(avgTLCHrs/24)}d ${Math.round(avgTLCHrs%24)}h` : '—';
  const onTimePct = doneTasks.length
    ? Math.round(doneTasks.filter(t => !t.due_date || new Date(t.resolved_at) <= new Date(t.due_date)).length / doneTasks.length * 100)
    : '—';

  const statusCounts = {};
  TASK_STATUSES.forEach(s => { statusCounts[s] = scopedTasks.filter(t => t.status === s).length; });
  const uniqueProjects = [...new Set(scopedTasks.map(t => t.project_id).filter(Boolean))];

  return html`
    <div>
      <div class="page-header">
        <div><h2 class="page-title">Task Monitoring</h2><p class="page-subtitle">Analytics, SLA metrics, and task status tracking ${isAdmin ? '(All Teams)' : isLeader ? `(${currentUser.team})` : '(My Tasks)'}</p></div>
      </div>

      <!-- Summary Cards -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;margin-bottom:1.5rem;">
        <div class="metric-card" style="text-align:center;padding:1rem;">
          <div style="font-size:2rem;font-weight:800;color:var(--accent-blue);">${scopedTasks.length}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Total Tasks</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1rem;">
          <div style="font-size:2rem;font-weight:800;color:var(--accent-green);">${statusCounts['done']||0}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Completed</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1rem;">
          <div style="font-size:2rem;font-weight:800;color:var(--accent-orange);">${statusCounts['in_progress']||0}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">In Progress</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1rem;">
          <div style="font-size:1.5rem;font-weight:800;color:var(--accent-purple);">${avgTTR}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Avg TTR</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1rem;">
          <div style="font-size:2rem;font-weight:800;color:${typeof onTimePct === 'number' && onTimePct < 70 ? 'var(--accent-orange)' : 'var(--accent-green)'};">
            ${typeof onTimePct === 'number' ? onTimePct + '%' : '—'}
          </div>
          <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">On-Time</div>
        </div>
      </div>

      <!-- Status Breakdown Bar -->
      <div class="metric-card" style="padding:1rem;margin-bottom:1.5rem;">
        <div style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.75rem;text-transform:uppercase;">Status Distribution</div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
          ${TASK_STATUSES.map(s => html`
            <div style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.3rem 0.6rem;border-radius:6px;background:${filterStatus===s?STATUS_META[s].bg:'transparent'};border:1px solid ${filterStatus===s?STATUS_META[s].color:'transparent'};transition:var(--transition);"
              onClick=${() => setFilterStatus(filterStatus === s ? 'all' : s)}>
              <span style="width:8px;height:8px;border-radius:50%;background:${STATUS_META[s].color};flex-shrink:0;"></span>
              <span style="font-size:0.82rem;color:${STATUS_META[s].color};font-weight:600;">${STATUS_META[s].label}</span>
              <span style="font-size:0.82rem;font-weight:700;color:var(--text-primary);">${statusCounts[s]||0}</span>
            </div>
          `)}
          <div style="font-size:0.78rem;color:var(--text-secondary);margin-left:auto;align-self:center;font-style:italic;">Click to filter</div>
        </div>
      </div>

      <!-- Filters -->
      <div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;">
        <span style="font-size:0.78rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;">Filters:</span>
        <select class="form-select" style="font-size:0.82rem;" value=${filterStatus} onChange=${e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          ${TASK_STATUSES.map(s => html`<option value=${s}>${STATUS_META[s].label}</option>`)}
        </select>
        <select class="form-select" style="font-size:0.82rem;" value=${filterProject} onChange=${e => setFilterProject(e.target.value)}>
          <option value="all">All Projects</option>
          ${uniqueProjects.map(id => html`<option value=${id}>${id}</option>`)}
        </select>
        <select class="form-select" style="font-size:0.82rem;" value=${filterPhase} onChange=${e => setFilterPhase(e.target.value)}>
          <option value="all">All Phases</option>
          ${PHASES.map(p => html`<option value=${p}>${p}</option>`)}
        </select>
        ${(isAdmin || isLeader) && html`
          <select class="form-select" style="font-size:0.82rem;" value=${filterTeam} onChange=${e => setFilterTeam(e.target.value)}>
            <option value="all">All Teams</option>
            ${TEAMS.map(t => html`<option value=${t}>${t}</option>`)}
          </select>
        `}
        ${(filterStatus !== 'all' || filterProject !== 'all' || filterPhase !== 'all' || filterTeam !== 'all') && html`
          <button class="btn" style="font-size:0.78rem;border:1px solid var(--border-color);"
            onClick=${() => { setFilterStatus('all'); setFilterProject('all'); setFilterPhase('all'); setFilterTeam('all'); }}>
            <i class="fa-solid fa-xmark"></i> Clear
          </button>
        `}
        <span style="font-size:0.78rem;color:var(--text-secondary);margin-left:auto;">${filtered.length} task${filtered.length !== 1 ? 's' : ''} shown</span>
      </div>

      <!-- Task Table -->
      <div style="overflow-x:auto;">
        <table class="data-grid-table">
          <thead>
            <tr>
              <th>Task <span style="font-size:0.7rem;font-weight:400;color:var(--text-secondary);">(click to open)</span></th>
              <th>Project</th>
              <th>Assignee / Team</th>
              <th>Status</th>
              <th>Due Date</th>
              <th>Accepted</th>
              <th>TTR (d)</th>
              <th>TLC (d)</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? html`<tr><td colspan="8" style="padding:2rem;text-align:center;color:var(--text-secondary);font-style:italic;">No tasks match the current filters.</td></tr>` :
              filtered.map(t => {
                const ttr = formatDuration(t.accepted_at, t.resolved_at);
                const tlc = formatDuration(t.created_at, t.resolved_at);
                const ttrClass = ttr.hours === null ? '' : ttr.hours > 168 ? 'sla-breach' : ttr.hours > 72 ? 'sla-warn' : 'sla-good';
                const tlcClass = tlc.hours === null ? '' : tlc.hours > 336 ? 'sla-breach' : tlc.hours > 168 ? 'sla-warn' : 'sla-good';
                const isOverdue = t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date();
                return html`
                  <tr class="accordion-row" style="border-bottom:1px solid var(--border-color);" onClick=${() => setSelectedTask(t)}>
                    <td style="padding:0.75rem 1rem;">
                      <div style="font-weight:600;">${t.title}</div>
                      <div style="font-size:0.7rem;margin-top:0.2rem;"><span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span></div>
                    </td>
                    <td style="font-size:0.78rem;">${t.project_id || '—'}</td>
                    <td>
                      <div style="font-weight:600;font-size:0.82rem;">${t.completed_by || t.assignee || '—'}</div>
                      <div style="font-size:0.7rem;color:var(--text-secondary);">${t.team || ''}</div>
                    </td>
                    <td><span class="tag" style="background:${STATUS_META[t.status].bg};color:${STATUS_META[t.status].color};font-size:0.72rem;">${STATUS_META[t.status].label}</span></td>
                    <td style="color:${isOverdue ? 'var(--accent-pink)' : 'var(--text-primary)'};font-size:0.8rem;">
                      ${t.due_date || '—'}${isOverdue ? html`<i class="fa-solid fa-triangle-exclamation" style="margin-left:0.3rem;font-size:0.7rem;"></i>` : ''}
                    </td>
                    <td style="font-size:0.78rem;color:var(--text-secondary);">${t.accepted_at ? t.accepted_at.split(' ')[0] : '—'}</td>
                    <td>${ttr.hours !== null ? html`<span class="tag ${ttrClass}" style="font-size:0.72rem;">${ttr.label}</span>` : html`<span style="color:var(--text-secondary);">—</span>`}</td>
                    <td>${tlc.hours !== null ? html`<span class="tag ${tlcClass}" style="font-size:0.72rem;">${tlc.label}</span>` : html`<span style="color:var(--text-secondary);">—</span>`}</td>
                  </tr>
                `;
              })
            }
          </tbody>
        </table>
      </div>

      ${selectedTask && html`<${TaskDetailModal} task=${selectedTask} projects=${projects||[]} currentUser=${currentUser} fetchTasks=${() => {}} onClose=${() => setSelectedTask(null)} />`}
    </div>
  `;
};



const ProjectAnalyticsTab = ({ projects, tasks, currentUser }) => {
  const [openProject, setOpenProject] = useState(null);
  const [openPhase, setOpenPhase] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskProjectFilter, setTaskProjectFilter] = useState('all');

  const getPhaseProgress = (p) => {
    if (p.phase === 'Deployed and in Use') return 100;
    const idx = PHASES.indexOf(p.phase);
    return idx === -1 ? 0 : Math.round(((idx + 1) / PHASES.length) * 100);
  };

  const avgProgress = projects.length
    ? Math.round(projects.reduce((s, p) => s + getPhaseProgress(p), 0) / projects.length)
    : 0;

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title">Project Analytics</h2>
          <p class="page-subtitle">Hierarchical view: Project → Phase → Team → Tasks (read-only)</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem;">
        <div class="metric-card" style="text-align:center;padding:1.25rem;">
          <div style="font-size:2.2rem;font-weight:800;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${projects.length}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Projects</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1.25rem;">
          <div style="font-size:2.2rem;font-weight:800;color:var(--accent-green);">${projects.filter(p=>Boolean(Number(p.is_deployed))).length}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">In Production</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1.25rem;">
          <div style="font-size:2.2rem;font-weight:800;color:var(--accent-purple);">${tasks.length}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Total Tasks</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1.25rem;">
          <div style="font-size:2.2rem;font-weight:800;color:var(--accent-blue);">${avgProgress}%</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Avg Phase Progress</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        ${projects.map(p => {
          const isOpen = openProject === p.id;
          const prog = getPhaseProgress(p);
          const health = getHealthStatus(p);
          const projTasks = tasks.filter(t => t.project_id === p.id);

          return html`
            <div class="info-block" style="padding:0;overflow:hidden;">
              <!-- Project Header -->
              <div class="accordion-row" style="padding:1rem 1.5rem;display:flex;align-items:center;gap:1rem;"
                onClick=${() => { setOpenProject(isOpen ? null : p.id); setOpenPhase(null); }}>
                <i class="fa-solid ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" style="color:var(--accent-blue);width:12px;flex-shrink:0;"></i>
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
                    <span style="font-weight:700;color:var(--accent-blue);">${p.id}</span>
                    <span style="font-weight:600;">${p.title}</span>
                    <span class="tag ${getPhaseClass(p.phase)}">${p.phase}</span>
                    ${Boolean(Number(p.is_deployed)) && html`<span class="tag color-green" style="font-size:0.6rem;">PRODUCTION</span>`}
                    ${p.blockers && p.blockers.length > 0 && html`<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-orange);font-size:0.8rem;" title="Has blockers"></i>`}
                  </div>
                </div>
                <div style="text-align:right;min-width:160px;">
                  <div style="font-size:0.7rem;color:${health.color};font-weight:600;margin-bottom:0.3rem;">${health.label}</div>
                  <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${prog}%;background:var(--accent-blue);transition:width 0.5s;"></div>
                  </div>
                  <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.2rem;">Tasks: ${projTasks.length} | Phase Progress: ${prog}%</div>
                </div>
              </div>

              ${isOpen && html`
                <div style="border-top:1px solid var(--border-color);padding:0;">
                  <!-- Phase Breakdown -->
                  ${PHASES.map(ph => {
                    const phTasks = projTasks.filter(t => t.crisp_dm_phase === ph);
                    if (phTasks.length === 0 && p.phase !== ph) return null;
                    const isPhaseOpen = openPhase === p.id + ph;
                    const isCurrent = p.phase === ph;
                    const donePh = phTasks.filter(t => t.status === 'done').length;
                    const teamGroups = {};
                    phTasks.forEach(t => { (teamGroups[t.team || 'Unassigned'] = teamGroups[t.team || 'Unassigned'] || []).push(t); });

                    return html`
                      <div style="border-bottom:1px solid var(--border-color);">
                        <div class="accordion-row" style="padding:0.6rem 1.5rem 0.6rem 2.5rem;display:flex;align-items:center;gap:0.75rem;background:${isCurrent ? 'rgba(59,130,246,0.05)' : 'transparent'};"
                          onClick=${() => setOpenPhase(isPhaseOpen ? null : p.id + ph)}>
                          <i class="fa-solid ${isPhaseOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size:0.7rem;color:var(--text-secondary);width:10px;"></i>
                          <span class="tag ${getPhaseClass(ph)}" style="font-size:0.65rem;">${ph}</span>
                          ${isCurrent && html`<span style="font-size:0.65rem;font-weight:700;color:var(--accent-blue);text-transform:uppercase;">● Active</span>`}
                          <span style="font-size:0.8rem;color:var(--text-secondary);margin-left:auto;">${phTasks.length} task${phTasks.length !== 1 ? 's' : ''} ${phTasks.length > 0 ? `(${donePh} done)` : ''}</span>
                        </div>

                        ${isPhaseOpen && phTasks.length > 0 && html`
                          <div style="padding:0.5rem 1.5rem 1rem 3.5rem;">
                            ${Object.entries(teamGroups).map(([team, tTasks]) => html`
                              <div style="margin-bottom:0.75rem;">
                                <div style="font-size:0.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.4rem;display:flex;align-items:center;gap:0.4rem;">
                                  <span class="tag ${getTeamClass(team)}" style="font-size:0.6rem;">${team}</span>
                                  ${tTasks.length} task${tTasks.length !== 1 ? 's' : ''}
                                </div>
                                <div style="display:flex;flex-direction:column;gap:0.35rem;">
                                  ${tTasks.map(t => html`
                                    <div class="task-card-clickable info-block" style="padding:0.6rem 0.9rem;display:flex;justify-content:space-between;align-items:center;"
                                      onClick=${() => setSelectedTask(t)}>
                                      <div>
                                        <div style="font-size:0.84rem;font-weight:600;">${t.title}</div>
                                        <div style="font-size:0.72rem;color:var(--text-secondary);">${t.assignee || 'Unassigned'} ${t.due_date ? '· Due: ' + t.due_date : ''}</div>
                                      </div>
                                      <span class="tag" style="background:${STATUS_META[t.status].bg};color:${STATUS_META[t.status].color};font-size:0.7rem;">${STATUS_META[t.status].label}</span>
                                    </div>
                                  `)}
                                </div>
                              </div>
                            `)}
                          </div>
                        `}
                        ${isPhaseOpen && phTasks.length === 0 && html`
                          <div style="padding:0.5rem 1.5rem 0.75rem 3.5rem;font-size:0.8rem;color:var(--text-secondary);font-style:italic;">No tasks in this phase.</div>
                        `}
                      </div>
                    `;
                  }).filter(Boolean)}
                </div>
              `}
            </div>
          `;
        })}
      </div>

      <!-- All Tasks Section -->
      <div style="margin-top:2rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">
          <h3 style="margin:0;font-size:1rem;font-weight:700;"><i class="fa-solid fa-list-check" style="color:var(--accent-purple);margin-right:0.5rem;"></i>All Tasks <span style="font-weight:400;color:var(--text-secondary);font-size:0.85rem;">— full visibility across all projects & teams</span></h3>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
            <span style="font-size:0.75rem;color:var(--text-secondary);">Filter:</span>
            <select class="form-select" style="font-size:0.8rem;" value=${taskStatusFilter} onChange=${e => setTaskStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              ${TASK_STATUSES.map(s => html`<option value=${s}>${STATUS_META[s].label}</option>`)}
            </select>
            <select class="form-select" style="font-size:0.8rem;" value=${taskProjectFilter} onChange=${e => setTaskProjectFilter(e.target.value)}>
              <option value="all">All Projects</option>
              ${projects.map(p => html`<option value=${p.id}>${p.id} — ${p.title}</option>`)}
            </select>
            ${(taskStatusFilter !== 'all' || taskProjectFilter !== 'all') && html`
              <button class="btn" style="font-size:0.75rem;border:1px solid var(--border-color);" onClick=${() => { setTaskStatusFilter('all'); setTaskProjectFilter('all'); }}>
                <i class="fa-solid fa-xmark"></i> Clear
              </button>
            `}
          </div>
        </div>
        ${(() => {
          const ft = tasks.filter(t => {
            if (taskStatusFilter !== 'all' && t.status !== taskStatusFilter) return false;
            if (taskProjectFilter !== 'all' && t.project_id !== taskProjectFilter) return false;
            return true;
          });
          return html`
            <div style="overflow-x:auto;">
              <table class="data-grid-table">
                <thead>
                  <tr>
                    <th>Task <span style="font-size:0.68rem;font-weight:400;color:var(--text-secondary);">(click to open)</span></th>
                    <th>Project</th>
                    <th>Phase</th>
                    <th>Assignee</th>
                    <th>Team</th>
                    <th>Status</th>
                    <th>TTR</th>
                  </tr>
                </thead>
                <tbody>
                  ${ft.length === 0
                    ? html`<tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--text-secondary);font-style:italic;">No tasks match the selected filters.</td></tr>`
                    : ft.map(t => {
                        const proj = projects.find(p => p.id === t.project_id);
                        const ttr = formatDuration(t.accepted_at, t.resolved_at);
                        const ttrClass = ttr.hours === null ? '' : ttr.hours > 168 ? 'sla-breach' : ttr.hours > 72 ? 'sla-warn' : 'sla-good';
                        return html`
                          <tr class="accordion-row" style="border-bottom:1px solid var(--border-color);" onClick=${() => setSelectedTask(t)}>
                            <td style="padding:0.65rem 1rem;font-weight:600;">${t.title}</td>
                            <td style="font-size:0.78rem;">${proj ? html`<span title=${proj.title}>${t.project_id}</span>` : (t.project_id || html`<span style="color:var(--text-secondary);">—</span>`)}</td>
                            <td><span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span></td>
                            <td style="font-size:0.8rem;">${t.assignee || html`<span style="color:var(--text-secondary);">Pool</span>`}</td>
                            <td style="font-size:0.78rem;color:var(--text-secondary);">${t.team}</td>
                            <td><span class="tag" style="background:${STATUS_META[t.status]?.bg};color:${STATUS_META[t.status]?.color};font-size:0.7rem;">${STATUS_META[t.status]?.label}</span></td>
                            <td>${ttr.hours !== null ? html`<span class="tag ${ttrClass}" style="font-size:0.7rem;">${ttr.label}</span>` : html`<span style="color:var(--text-secondary);">—</span>`}</td>
                          </tr>
                        `;
                      })
                  }
                </tbody>
              </table>
            </div>
          `;
        })()}
      </div>

      ${selectedTask && html`<${TaskDetailModal} task=${selectedTask} projects=${projects} currentUser=${currentUser} fetchTasks=${() => {}} onClose=${() => setSelectedTask(null)} />`}
    </div>
  `;
};


// ─── TaskCommentThread ─────────────────────────────────────────────────────────
const TaskCommentThread = ({ taskId, taskTitle, taskAssignee, taskTeam, currentUser }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const endRef = useRef(null);

  const fetchComments = async () => {
    try {
      const res = await fetch('/api/task-comments?task_id=' + taskId);
      if (res.ok) setComments(await res.json());
    } catch(e) {}
  };

  useEffect(() => { if (taskId) fetchComments(); }, [taskId]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' }); }, [comments]);

  const postComment = async () => {
    if (!newComment.trim() || posting) return;
    setPosting(true);
    await fetch('/api/task-comments', {
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

// ─── TaskDetailModal ───────────────────────────────────────────────────────────
const TaskDetailModal = ({ task, projects, currentUser, fetchTasks, onClose }) => {
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
      const note = window.prompt('Task completed! Enter a resolution note (optional):', '');
      if (note === null) return;
      const now = new Date().toISOString().split('.')[0].replace('T',' ');
      extra = { ...extra, resolution_note: note, completed_by: task.assignee || currentUser.username, resolved_at: now };
    }
    await fetch('/api/tasks/' + task.id, {
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

// ─── PhaseSubmissionPanel ──────────────────────────────────────────────────────
const PhaseSubmissionPanel = ({ projects, currentUser, fetchProjects }) => {
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
    await fetch('/api/projects', {
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

// ─── Phase Submission Tab (standalone) ────────────────────────────────────────
const PhaseSubmissionTab = ({ projects, tasks, currentUser, fetchProjects }) => {
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
    await fetch('/api/projects', {
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

// ─── Module: Communications ──────────────────────────────────────────────────


const CommunicationsTab = ({ currentUser, tasks, projects }) => {
  const isLeaderOrAdmin = currentUser.role === 'admin' || currentUser.role === 'leader';

  // Build channel list based on role
  const buildChannels = () => {
    const base = ['General', '📢 Broadcast'];
    if (currentUser.role === 'admin') base.push(...TEAMS);
    else if (currentUser.team) base.push(currentUser.team);
    return [...new Set(base)];
  };

  const [allUsers, setAllUsers] = useState([]);
  const [channels] = useState(buildChannels);
  const [activeChannel, setActiveChannel] = useState('General');
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [linkedTask, setLinkedTask] = useState(null);
  const chatEndRef = useRef(null);

  // Fetch all users for Members sidebar
  useEffect(() => {
    fetch('/api/users').then(r => r.ok ? r.json() : []).then(setAllUsers).catch(() => {});
  }, []);

  const fetchMessages = async () => {
    const res = await fetch('/api/messages?channel=' + encodeURIComponent(activeChannel));
    if (res.ok) setMessages(await res.json());
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [activeChannel]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;
    await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_name: activeChannel, sender: currentUser.username, content: inputMsg })
    });
    setInputMsg('');
    fetchMessages();
  };

  const openDM = (username) => {
    const dmChannel = 'DM:' + [currentUser.username, username].sort().join(':');
    setActiveChannel(dmChannel);
  };

  const handleTaskClick = (taskId) => {
    const t = (tasks || []).find(t => t.id === taskId);
    if (t) setLinkedTask(t);
  };

  const isSystem = (sender) => sender === '🤖 System' || sender === 'System';

  const getChannelIcon = (ch) => {
    if (ch === '📢 Broadcast') return 'fa-bullhorn';
    if (ch.startsWith('DM:')) return 'fa-user';
    if (ch === 'General') return 'fa-globe';
    return 'fa-hashtag';
  };

  const getChannelDisplayName = (ch) => {
    if (ch.startsWith('DM:')) {
      const parts = ch.split(':');
      return 'DM: ' + (parts[2] === currentUser.username ? parts[1] : parts[2]);
    }
    return ch.replace(' Team','');
  };

  // Group users by team for Members sidebar
  const membersByTeam = useMemo(() => {
    const groups = {};
    allUsers.forEach(u => {
      if (u.username === currentUser.username) return; // skip self
      const t = u.team || 'Other';
      if (!groups[t]) groups[t] = [];
      groups[t].push(u);
    });
    return groups;
  }, [allUsers, currentUser.username]);

  const ROLE_COLORS = { admin: 'var(--accent-orange)', leader: 'var(--accent-blue)', member: 'var(--accent-green)' };

  return html`
    <div class="chat-container">
      <!-- Sidebar: Channels + Members -->
      <div class="channel-sidebar" style="width:230px;flex-shrink:0;display:flex;flex-direction:column;overflow-y:auto;">
        <!-- Channels Section -->
        <div style="padding:0.75rem 1rem 0.4rem;font-weight:700;color:var(--text-secondary);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;">Channels</div>
        ${channels.map(c => {
          const isDM = c.startsWith('DM:');
          const isBroad = c === '📢 Broadcast';
          return html`
            <div class="channel-item ${c === activeChannel ? 'active' : ''}" style="${isBroad ? 'color:var(--accent-orange);' : ''}" onClick=${() => setActiveChannel(c)}>
              <i class="fa-solid ${getChannelIcon(c)}" style="font-size:0.75rem;"></i>
              <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${getChannelDisplayName(c)}</span>
              ${isBroad && html`<span style="font-size:0.62rem;background:var(--accent-orange);color:white;padding:0.1rem 0.35rem;border-radius:20px;">ADMIN</span>`}
            </div>
          `;
        })}

        <!-- Members Section -->
        <div style="padding:0.75rem 1rem 0.4rem;font-weight:700;color:var(--text-secondary);font-size:0.7rem;text-transform:uppercase;letter-spacing:0.08em;border-top:1px solid var(--border-color);margin-top:0.5rem;">Members</div>
        <div style="flex:1;">
          ${Object.entries(membersByTeam).map(([team, members]) => html`
            <div>
              <div style="padding:0.3rem 1rem;font-size:0.68rem;color:var(--text-secondary);font-style:italic;opacity:0.7;">${team.replace(' Team','')}</div>
              ${members.map(u => {
                const dmCh = 'DM:' + [currentUser.username, u.username].sort().join(':');
                const isActiveDM = activeChannel === dmCh;
                return html`
                  <div class="channel-item ${isActiveDM ? 'active' : ''}"
                    style="padding:0.4rem 1rem;gap:0.5rem;cursor:pointer;"
                    onClick=${() => openDM(u.username)}>
                    <div style="width:24px;height:24px;border-radius:50%;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));display:flex;align-items:center;justify-content:center;font-size:0.6rem;font-weight:700;flex-shrink:0;">${getInitials(u.username)}</div>
                    <span style="flex:1;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title=${u.username}>${u.username}</span>
                    <span style="font-size:0.6rem;color:${ROLE_COLORS[u.role] || 'var(--text-secondary)'};flex-shrink:0;">${u.role === 'leader' ? '⭐' : u.role === 'admin' ? '🔑' : ''}</span>
                  </div>
                `;
              })}
            </div>
          `)}
        </div>

        <div style="padding:0.75rem 1rem;border-top:1px solid var(--border-color);">
          <div style="font-size:0.7rem;color:var(--text-secondary);line-height:1.5;">
            <i class="fa-solid fa-circle-info" style="margin-right:0.3rem;"></i>
            Click a member to start a DM.
            ${isLeaderOrAdmin && html` <b style="color:var(--accent-orange);">📢 Broadcast</b> reaches all channels.`}
          </div>
        </div>
      </div>

      <!-- Chat Main -->
      <div class="chat-main">
        <div style="padding:0.875rem 1.25rem;border-bottom:1px solid var(--border-color);background:var(--bg-panel);font-weight:600;display:flex;align-items:center;gap:0.6rem;">
          <i class="fa-solid ${getChannelIcon(activeChannel)}" style="color:var(--accent-blue);"></i>
          <span>${getChannelDisplayName(activeChannel)}</span>
          ${activeChannel === '📢 Broadcast' && html`<span style="font-size:0.72rem;color:var(--accent-orange);margin-left:0.2rem;">Announcement channel — visible to all teams</span>`}
          ${activeChannel.startsWith('DM:') && html`<span style="font-size:0.72rem;color:var(--text-secondary);margin-left:0.2rem;">Private conversation</span>`}
          <span style="font-size:0.75rem;color:var(--text-secondary);font-weight:400;margin-left:auto;">${messages.length} message${messages.length !== 1 ? 's' : ''}</span>
        </div>

        <div class="chat-messages">
          ${messages.length === 0 && html`
            <div style="text-align:center;padding:2rem;color:var(--text-secondary);font-style:italic;">
              <i class="fa-solid fa-comment-slash" style="font-size:2rem;margin-bottom:0.75rem;display:block;opacity:0.3;"></i>
              No messages yet in ${getChannelDisplayName(activeChannel)}.
            </div>
          `}
          ${messages.map(m => {
            const sys = isSystem(m.sender);
            return html`
              <div style="display:flex;flex-direction:column;align-items:${sys ? 'center' : m.sender === currentUser.username ? 'flex-end' : 'flex-start'};">
                ${!sys && html`<div style="font-size:0.7rem;color:var(--text-secondary);margin-bottom:0.25rem;">${m.sender} · ${(m.timestamp||'').split(' ')[1]||''}</div>`}
                <div class="chat-bubble ${m.sender === currentUser.username && !sys ? 'own' : ''}"
                  style="${sys ? 'background:rgba(59,130,246,0.06);border:1px dashed rgba(59,130,246,0.25);border-radius:8px;font-size:0.82rem;color:var(--text-secondary);max-width:90%;text-align:center;padding:0.4rem 0.75rem;' : ''}">
                  ${sys
                    ? html`<i class="fa-solid fa-robot" style="margin-right:0.3rem;font-size:0.7rem;"></i>${parseMessageContent(m.content, handleTaskClick)}`
                    : parseMessageContent(m.content, handleTaskClick)
                  }
                </div>
              </div>
            `;
          })}
          <div ref=${chatEndRef}></div>
        </div>

        <form onSubmit=${sendMessage} style="padding:1rem;border-top:1px solid var(--border-color);display:flex;gap:0.5rem;background:var(--bg-color-secondary);">
          <input class="form-input" style="flex:1;" 
            placeholder=${activeChannel === '📢 Broadcast' && !isLeaderOrAdmin ? "Only leaders/admin can broadcast..." : `Message ${getChannelDisplayName(activeChannel)}...`}
            value=${inputMsg} 
            onInput=${e => setInputMsg(e.target.value)} 
            disabled=${activeChannel === '📢 Broadcast' && !isLeaderOrAdmin} />
          <button class="btn active" style="background:var(--accent-blue);" disabled=${activeChannel === '📢 Broadcast' && !isLeaderOrAdmin}><i class="fa-solid fa-paper-plane"></i></button>
        </form>
      </div>

      ${linkedTask && html`<${TaskDetailModal} task=${linkedTask} projects=${projects||[]} currentUser=${currentUser} fetchTasks=${() => {}} onClose=${() => setLinkedTask(null)} />`}
    </div>
  `;
};





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
    // Leaders and admins see all tasks; members see only their team
    const url = (currentUser.role === 'admin' || currentUser.role === 'leader')
      ? '/api/tasks?role=admin'
      : `/api/tasks?role=member&team=${encodeURIComponent(currentUser.team || '')}`;
    const d = await (await fetch(url)).json();
    setTasksList(d);
  };

  const handleLogin = (user) => { localStorage.setItem('currentUser', JSON.stringify(user)); setCurrentUser(user); };
  const handleLogout = () => { localStorage.removeItem('currentUser'); setCurrentUser(null); };

  useEffect(() => { if (currentUser) { fetchProjects(); fetchTasks(); if (currentUser.role === 'admin' || currentUser.role === 'leader') fetchUsers(); } }, [currentUser]);
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') setSelectedProjectId(null); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  const selectedProject = selectedProjectId ? projectsList.find(p => p.id === selectedProjectId) : null;

  if (!currentUser) return html`<${LoginScreen} onLogin=${handleLogin} />`;

  const isMember = currentUser.role === 'member';
  const isLeader = currentUser.role === 'leader';
  const isAdmin = currentUser.role === 'admin';
  const canManageTasks = isLeader || isAdmin;

  const nb = (tab) => `btn ${activeTab === tab ? 'active' : ''}`;

  return html`
    <div>
      <nav class="navbar">
        <div class="brand" style="margin-right:1.5rem;flex-shrink:0;">
          <i class="fa-solid fa-chart-network"></i> BI Project Manager
        </div>

        <div class="nav-links">
          <!-- Projects -->
          <span class="nav-group-label">Projects</span>
          <button class=${nb('dashboard')} onClick=${() => setActiveTab('dashboard')}><i class="fa-solid fa-gauge-high"></i> Dashboard</button>
          <button class=${nb('board')} onClick=${() => setActiveTab('board')}><i class="fa-solid fa-layer-group"></i> Pivot Board</button>

          <div class="nav-group-sep"></div>

          <!-- Tasks — available to all roles -->
          <span class="nav-group-label">Tasks</span>
          <button class=${nb('my_tasks')} onClick=${() => setActiveTab('my_tasks')}><i class="fa-solid fa-list-check"></i> My Tasks</button>
          <button class=${nb('team_pool')} onClick=${() => setActiveTab('team_pool')}><i class="fa-solid fa-inbox"></i> Team Pool</button>

          ${canManageTasks && html`
            <button class=${nb('team_dashboard')} onClick=${() => setActiveTab('team_dashboard')}><i class="fa-solid fa-people-group"></i> Team Dash</button>
            <button class=${nb('approvals')} onClick=${() => setActiveTab('approvals')}><i class="fa-solid fa-check-to-slot"></i> Approvals</button>
          `}

          <div class="nav-group-sep"></div>

          <!-- Analytics — visible to all, interactive for leaders/admins -->
          <span class="nav-group-label">Analytics</span>
          <button class=${nb('analytics')} onClick=${() => setActiveTab('analytics')}><i class="fa-solid fa-chart-pie"></i> Analytics</button>
          <button class=${nb('monitoring')} onClick=${() => setActiveTab('monitoring')}><i class="fa-solid fa-stopwatch"></i> Monitoring</button>
          ${canManageTasks && html`
            <button class=${nb('phase_submit')} style="color:var(--accent-purple);" onClick=${() => setActiveTab('phase_submit')}><i class="fa-solid fa-code-branch"></i> Projects</button>
          `}

          <div class="nav-group-sep"></div>

          <!-- System -->
          <span class="nav-group-label">System</span>
          <button class=${nb('comms')} onClick=${() => setActiveTab('comms')}><i class="fa-solid fa-comments"></i> Comms</button>
          ${isAdmin && html`
            <button class=${nb('audit')} style="color:var(--accent-purple);" onClick=${() => setActiveTab('audit')}><i class="fa-solid fa-file-shield"></i> Audit</button>
            <button class=${nb('manage')} style="color:var(--accent-orange);" onClick=${() => setActiveTab('manage')}><i class="fa-solid fa-server"></i> Manage</button>
            <button class=${nb('new-project')} style="color:var(--accent-green);" onClick=${() => setActiveTab('new-project')}><i class="fa-solid fa-plus"></i> New</button>
            <button class=${nb('admin')} onClick=${() => setActiveTab('admin')}><i class="fa-solid fa-shield"></i> Admin</button>
          `}
        </div>

        <div style="display:flex;align-items:center;margin-left:1rem;gap:0.5rem;flex-shrink:0;">
          <${NotificationBell} currentUser=${currentUser} />
          <div style="font-size:0.82rem;color:var(--text-secondary);text-align:right;">
            <div><strong>${currentUser.username}</strong></div>
            <div style="font-size:0.68rem;text-transform:uppercase;opacity:0.7;">${currentUser.role}</div>
          </div>
          <button class="btn" onClick=${handleLogout} title="Sign Out"><i class="fa-solid fa-arrow-right-from-bracket"></i></button>
        </div>
      </nav>

      <main class="main-content">
        ${activeTab === 'dashboard' && html`<${Dashboard} projects=${projectsList} tasks=${tasksList} />`}
        ${activeTab === 'board' && html`<${KanbanBoard} projects=${projectsList} tasks=${tasksList} viewMode=${boardView} setViewMode=${setBoardView} onProjectClick=${p => setSelectedProjectId(p.id)} onUpdate=${fetchTasks} />`}
        ${activeTab === 'audit' && isAdmin && html`<${AuditLogTab} />`}
        ${activeTab === 'manage' && isAdmin && html`<${ProjectsManagementTab} projects=${projectsList} fetchProjects=${fetchProjects} setEditId=${setSelectedProjectId} />`}
        ${activeTab === 'new-project' && isAdmin && html`<${CreateProjectTab} onSave=${() => { fetchProjects(); setActiveTab('dashboard'); }} />`}
        ${activeTab === 'admin' && isAdmin && html`<${AdminPanel} users=${usersList} fetchUsers=${fetchUsers} />`}

        ${activeTab === 'my_tasks' && html`<${MyTasksView} tasks=${tasksList} projects=${projectsList} fetchTasks=${fetchTasks} currentUser=${currentUser} />`}
        ${activeTab === 'team_pool' && html`<${TeamPoolView} tasks=${tasksList} projects=${projectsList} fetchTasks=${fetchTasks} currentUser=${currentUser} />`}
        ${activeTab === 'team_dashboard' && canManageTasks && html`<${TeamDashboardView} tasks=${tasksList} projects=${projectsList} users=${usersList} fetchTasks=${fetchTasks} currentUser=${currentUser} />`}
        ${activeTab === 'approvals' && canManageTasks && html`<${ApprovalsView} tasks=${tasksList} projects=${projectsList} fetchTasks=${fetchTasks} currentUser=${currentUser} />`}
        ${activeTab === 'monitoring' && html`<${TaskMonitoringTab} tasks=${tasksList} projects=${projectsList} currentUser=${currentUser} />`}
        ${activeTab === 'phase_submit' && canManageTasks && html`<${PhaseSubmissionTab} projects=${projectsList} tasks=${tasksList} currentUser=${currentUser} fetchProjects=${fetchProjects} />`}
        ${activeTab === 'analytics' && html`<${ProjectAnalyticsTab} projects=${projectsList} tasks=${tasksList} currentUser=${currentUser} />`}
        ${activeTab === 'comms' && html`<${CommunicationsTab} currentUser=${currentUser} tasks=${tasksList} projects=${projectsList} />`}
      </main>
      <${ProjectModal} project=${selectedProject} currentUser=${currentUser} onClose=${() => setSelectedProjectId(null)} onUpdate=${fetchProjects} />
    </div>
  `;
};

render(html`<${App} />`, document.getElementById('app'));
