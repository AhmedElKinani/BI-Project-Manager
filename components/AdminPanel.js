import { appConfirm, getInitials, apiFetch } from '../utils/core.js';
import { PHASES, TEAMS } from '../utils/core.js';
import { Dashboard } from './Dashboard.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

export const ROLE_META = {
  admin:  { label: 'Admin',       color: 'var(--accent-orange)', desc: 'Full system access. Can create/manage users, projects, see all data.' },
  leader: { label: 'Team Leader', color: 'var(--accent-blue)',   desc: 'Can assign tasks, submit phases, view team dashboard, approve self-assigns.' },
  member: { label: 'Member',      color: 'var(--accent-green)',  desc: 'Can view own tasks, claim pool tasks, self-assign (pending approval), use comms.' },
};

export const AdminPanel = ({ users, fetchUsers }) => {
  // Create user state
  const [createForm, setCreateForm] = useState({ username: '', password: '', role: 'member', team: TEAMS[0] });
  const [createMsg, setCreateMsg] = useState('');

  // Edit user state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});

  const handleCreate = async (e) => {
    e.preventDefault();
    const res = await apiFetch('/api/users', {
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
    await apiFetch('/api/users/' + editingUser.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm)
    });
    setEditingUser(null);
    fetchUsers();
  };

  const handleDelete = async (u) => {
    const confirmed = await appConfirm(`Delete user "${u.username}"? This cannot be undone.`, 'Delete User');
    if (!confirmed) return;
    await apiFetch('/api/users/' + u.id, { method: 'DELETE' });
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




