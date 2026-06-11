import { appConfirm, appPrompt, appAlert, getInitials, apiFetch } from '../utils/core.js';
import { getTeams, getRoles, loadConfig } from '../utils/configStore.js';
import { AdvancedDataGrid } from './DataGrid.js';
import { FocusModal } from './FocusModal.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

// Module-level constants (stable references, not recreated on each render)
const COLOR_PRESETS = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];
const COLOR_CLASSES = ['color-bu','color-du','color-dp','color-mod','color-eval','color-dep','color-green','color-purple','color-orange','color-live','color-cyan','color-teal','color-emerald','color-pink','color-rose','color-sky','color-yellow','color-lime','color-slate'];

const LoadingSkeleton = () => html`
  <div style="display:flex;flex-direction:column;gap:0.75rem;padding:1rem;">
    ${[1,2,3,4,5].map(i => html`
      <div key=${i} style="height:44px;border-radius:8px;background:linear-gradient(90deg,var(--bg-panel) 25%,var(--bg-color-secondary) 50%,var(--bg-panel) 75%);background-size:200% 100%;animation:shimmer 1.4s infinite;"></div>
    `)}
  </div>
  <style>.shimmer-row{animation:shimmer 1.4s infinite} @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}</style>
`;

export const AdminPanel = ({ users, fetchUsers, currentUser }) => {
  const [activeTab, setActiveTab] = useState('users');
  const nb = (t) => `btn ${activeTab === t ? 'active' : ''}`;

  return html`
    <div>
      <div class="page-header">
        <div><h2 class="page-title">Admin Control Panel</h2><p class="page-subtitle">Manage users, teams, phases, settings, and roles</p></div>
      </div>
      <div style="display:flex;gap:0.5rem;margin-bottom:1.5rem;border-bottom:1px solid var(--border-color);padding-bottom:1rem;">
        <button class=${nb('users')} onClick=${() => setActiveTab('users')}><i class="fa-solid fa-users"></i> Users</button>
        <button class=${nb('teams')} onClick=${() => setActiveTab('teams')}><i class="fa-solid fa-user-group"></i> Teams</button>
        <button class=${nb('phases')} onClick=${() => setActiveTab('phases')}><i class="fa-solid fa-list-ol"></i> Phases</button>
        <button class=${nb('roles')} onClick=${() => setActiveTab('roles')}><i class="fa-solid fa-shield-halved"></i> Roles</button>
        <button class=${nb('settings')} onClick=${() => setActiveTab('settings')}><i class="fa-solid fa-screwdriver-wrench"></i> Settings</button>
      </div>
      ${activeTab === 'users'  && html`<${UsersTab}  users=${users} fetchUsers=${fetchUsers} currentUser=${currentUser} />`}
      ${activeTab === 'teams'  && html`<${TeamsTab}  />`}
      ${activeTab === 'phases' && html`<${PhasesTab} />`}
      ${activeTab === 'roles'  && html`<${RolesTab}  />`}
      ${activeTab === 'settings' && html`<${SettingsTab} />`}
    </div>
  `;
};

/* ── USERS ───────────────────────────────────────────────── */
const UsersTab = ({ users, fetchUsers, currentUser }) => {
  const [form, setForm]         = useState({ username:'', password:'', role: getRoles()[0]?.name||'member', team: getTeams()[0]||'' });
  const [msg, setMsg]           = useState('');
  
  // Edit Modal State
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  // Bulk Actions Modal State
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkIds, setBulkIds] = useState([]);
  const [bulkForm, setBulkForm] = useState({ role:'', team:'' });

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/users', { method:'POST', body: JSON.stringify(form) });
      if (res.ok) { flash('\u2713 Account created'); setForm({ username:'', password:'', role: getRoles()[0]?.name||'member', team: getTeams()[0]||'' }); fetchUsers(); }
      else flash('\u2717 Error: username taken');
    } catch { flash('\u2717 Network error'); }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/users/' + editingUser.id, { method:'PUT', body: JSON.stringify(editForm) });
      if (!res.ok) { const err = await res.json(); flash('\u2717 ' + (err.error || 'Save failed')); return; }
      setEditingUser(null);
      fetchUsers();
    } catch { flash('\u2717 Network error'); }
    finally { setIsSaving(false); }
  };

  const handleDeleteUser = async (u) => {
    if (!await appConfirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    await apiFetch('/api/users/' + u.id, { method:'DELETE' }); 
    fetchUsers();
    setEditingUser(null);
  };

  const handleBulkUpdate = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload = {};
      if (bulkForm.role) payload.role = bulkForm.role;
      if (bulkForm.team) payload.team = bulkForm.team;
      if (Object.keys(payload).length > 0) {
        // Parallel updates — much faster than sequential
        await Promise.all(bulkIds.map(id =>
          apiFetch('/api/users/' + id, { method: 'PUT', body: JSON.stringify(payload) })
        ));
      }
      setShowBulkModal(false);
      fetchUsers();
    } catch { flash('\u2717 Bulk update failed — check connection'); }
    finally { setIsSaving(false); }
  };

  const columns = useMemo(() => [
    { id: 'user', header: 'User', accessor: 'username', sortable: true, searchable: true, render: (u) => html`
        <div style="display:flex;align-items:center;gap:0.5rem;font-weight:600;">
          <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));display:flex;align-items:center;justify-content:center;font-size:0.7rem;color:white;">${getInitials(u.username)}</div>
          <span>${u.username}</span>
          ${currentUser && u.id === currentUser.id && html`<span class="tag color-green" style="font-size:0.6rem;">You</span>`}
        </div>
      `
    },
    { id: 'role', header: 'Role', accessor: 'role', sortable: true, searchable: true, render: (u) => html`
        <span class="tag" style="background:var(--bg-color-secondary);border:1px solid var(--border-color);">${u.role}</span>
      `
    },
    { id: 'team', header: 'Team', accessor: 'team', sortable: true, searchable: true, render: (u) => u.team || '—' },
    { id: 'actions', header: '', sortable: false, render: (u) => html`
        <div class="no-row-click" style="text-align:right;">
          <button class="btn" style="color:var(--accent-blue);font-size:0.8rem;padding:0.4rem 0.6rem;" 
            onClick=${(e) => { e.stopPropagation(); setEditingUser(u); setEditForm({ role: u.role, team: u.team, password: '' }); }}>
            <i class="fa-solid fa-pen"></i> Edit
          </button>
        </div>
      `
    }
  ], [currentUser]);

  const bulkActions = useMemo(() => [
    { label: 'Bulk Edit Role/Team', icon: 'fa-pen', color: 'var(--accent-purple)', onClick: (ids) => {
        setBulkIds(ids);
        setBulkForm({ role:'', team:'' });
        setShowBulkModal(true);
      }
    }
  ], []);

  return html`
    <div style="display:grid;grid-template-columns:340px 1fr;gap:1.5rem;">
      <div class="info-block" style="align-self:start;">
        <div class="section-title"><i class="fa-solid fa-user-plus"></i> Create Account</div>
        ${msg && html`<div style="margin-bottom:0.75rem;padding:0.5rem;border-radius:6px;font-size:0.85rem;background:${msg.startsWith('✓')?'rgba(16,185,129,0.1)':'rgba(245,158,11,0.1)'};color:${msg.startsWith('✓')?'var(--accent-green)':'var(--accent-orange)'};">${msg}</div>`}
        <form onSubmit=${handleCreate} style="display:flex;flex-direction:column;gap:0.75rem;">
          <input placeholder="Username" class="form-input" value=${form.username} onInput=${e=>setForm({...form,username:e.target.value})} required />
          <input placeholder="Password" type="password" class="form-input" value=${form.password} onInput=${e=>setForm({...form,password:e.target.value})} required />
          <label style="font-size:0.78rem;color:var(--text-secondary);">Role</label>
          <select class="form-select" value=${form.role} onChange=${e=>setForm({...form,role:e.target.value})}>
            ${getRoles().filter(r=>r.is_active).map(r=>html`<option value=${r.name}>${r.label}</option>`)}
          </select>
          <label style="font-size:0.78rem;color:var(--text-secondary);">Primary Team</label>
          <select class="form-select" value=${form.team} onChange=${e=>setForm({...form,team:e.target.value})}>
            ${getTeams().map(t=>html`<option value=${t}>${t}</option>`)}
          </select>
          <button type="submit" class="btn active" style="background:var(--accent-blue);margin-top:0.5rem;"><i class="fa-solid fa-plus"></i> Create User</button>
        </form>
      </div>
      
      <div>
        <${AdvancedDataGrid} 
          data=${users} 
          columns=${columns} 
          keyField="id" 
          pageSize=${12} 
          bulkActions=${bulkActions}
          onRowClick=${(u) => { setEditingUser(u); setEditForm({ role: u.role, team: u.team, password: '' }); }}
        />
      </div>
    </div>

    <!-- Edit User Modal -->
    <${FocusModal}
      open=${!!editingUser}
      onClose=${() => setEditingUser(null)}
      title="Edit User Profile"
      subtitle=${editingUser ? 'Modifying settings for ' + editingUser.username : ''}
      icon="fa-user-pen"
      accentColor="var(--accent-blue)"
      footer=${html`
        ${editingUser?.id !== currentUser.id && html`
          <button type="button" class="btn" style="color:var(--accent-orange);margin-right:auto;" onClick=${() => handleDeleteUser(editingUser)}>
            <i class="fa-solid fa-trash"></i> Delete User
          </button>
        `}
        <button class="btn" onClick=${() => setEditingUser(null)} disabled=${isSaving}>Cancel</button>
        <button class="btn active" style="background:var(--accent-blue);" onClick=${handleSaveUser} disabled=${isSaving}>
          ${isSaving ? html`<i class="fa-solid fa-spinner fa-spin"></i> Saving...` : 'Save Changes'}
        </button>
      `}>
      
      ${editingUser && html`
        <form onSubmit=${handleSaveUser}>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
            <div>
              <label class="focus-label">Role</label>
              <select class="form-select" style="width:100%;" value=${editForm.role} onChange=${e=>setEditForm({...editForm,role:e.target.value})}>
                ${getRoles().filter(r=>r.is_active).map(r=>html`<option value=${r.name}>${r.label}</option>`)}
              </select>
            </div>
            <div>
              <label class="focus-label">Primary Team</label>
              <select class="form-select" style="width:100%;" value=${editForm.team} onChange=${e=>setEditForm({...editForm,team:e.target.value})}>
                ${getTeams().map(t=>html`<option value=${t}>${t}</option>`)}
              </select>
            </div>
            <div style="grid-column:1/-1;">
              <label class="focus-label">Reset Password <span style="font-weight:400;opacity:0.6;text-transform:none;">(leave blank to keep current)</span></label>
              <input class="form-input" type="password" style="width:100%;" placeholder="New password"
                value=${editForm.password} onInput=${e=>setEditForm({...editForm,password:e.target.value})} />
            </div>
          </div>
        </form>
      `}
    </${FocusModal}>

    <!-- Bulk Update Modal -->
    <${FocusModal}
      open=${showBulkModal}
      onClose=${() => setShowBulkModal(false)}
      title="Bulk Edit Users"
      subtitle=${'Updating ' + bulkIds.length + ' selected users'}
      icon="fa-users-gear"
      accentColor="var(--accent-purple)"
      footer=${html`
        <button class="btn" onClick=${() => setShowBulkModal(false)} disabled=${isSaving}>Cancel</button>
        <button class="btn active" style="background:var(--accent-purple);" onClick=${handleBulkUpdate} disabled=${isSaving}>
          ${isSaving ? html`<i class="fa-solid fa-spinner fa-spin"></i> Updating...` : 'Apply Bulk Changes'}
        </button>
      `}>
      
      <form onSubmit=${handleBulkUpdate}>
        <div style="margin-bottom:1.25rem;padding:0.75rem 1rem;background:rgba(139,92,246,0.08);border:1px solid rgba(139,92,246,0.2);border-radius:10px;font-size:0.85rem;">
          <i class="fa-solid fa-circle-info" style="color:var(--accent-purple);margin-right:0.4rem;"></i>
          Leave a field unselected to keep the existing value for each user.
        </div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;">
          <div>
            <label class="focus-label">Assign New Role</label>
            <select class="form-select" style="width:100%;" value=${bulkForm.role} onChange=${e=>setBulkForm({...bulkForm,role:e.target.value})}>
              <option value="">— No Change —</option>
              ${getRoles().filter(r=>r.is_active).map(r=>html`<option value=${r.name}>${r.label}</option>`)}
            </select>
          </div>
          <div>
            <label class="focus-label">Assign New Team</label>
            <select class="form-select" style="width:100%;" value=${bulkForm.team} onChange=${e=>setBulkForm({...bulkForm,team:e.target.value})}>
              <option value="">— No Change —</option>
              ${getTeams().map(t=>html`<option value=${t}>${t}</option>`)}
            </select>
          </div>
        </div>
      </form>
    </${FocusModal}>
  `;
};

/* ── TEAMS ───────────────────────────────────────────────── */
const TeamsTab = () => {
  const [teams, setTeams]     = useState([]);
  const [name, setName]       = useState('');
  const [color, setColor]     = useState('#6366f1');
  const [allPhases, setAllPhases] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tabError, setTabError] = useState('');

  // Edit/Modal State
  const [editingTeam, setEditingTeam] = useState(null);
  const [editForm, setEF] = useState({});
  const [selectedPhases, setSelectedPhases] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const refresh = async () => {
    try {
      const res = await apiFetch('/api/config/teams');
      if (res.ok) setTeams(await res.json());
      await loadConfig();
    } catch { setTabError('Failed to load teams. Check your connection.'); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { 
    refresh(); 
    apiFetch('/api/config/phases?all=true').then(r=>r.ok?r.json():[]).then(setAllPhases).catch(()=>{});
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/config/teams', { method:'POST', body: JSON.stringify({ name, color }) });
      if (!res.ok) { const err = await res.json(); return appAlert(err.error || 'Failed to create team'); }
      setName(''); setColor('#6366f1'); refresh();
    } catch { appAlert('Network error. Please try again.'); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/config/teams/' + editingTeam.id, { method:'PUT', body: JSON.stringify(editForm) });
      if (!res.ok) { const err = await res.json(); appAlert(err.error || 'Save failed'); return; }
      await apiFetch('/api/config/teams/' + editingTeam.id + '/phases', { method: 'POST', body: JSON.stringify({ phases: selectedPhases }) });
      setEditingTeam(null);
      refresh();
    } catch { appAlert('Network error. Please try again.'); }
    finally { setIsSaving(false); }
  };

  const handleDeactivate = async () => {
    if (!editingTeam) return;
    if (!await appConfirm(`${editingTeam.is_active ? 'Deactivate' : 'Reactivate'} team "${editingTeam.name}"?`)) return;
    setIsSaving(true);
    try {
      await apiFetch('/api/config/teams/' + editingTeam.id, { method: editingTeam.is_active ? 'DELETE' : 'PUT', body: JSON.stringify({ is_active: 1 }) });
      setEditingTeam(null);
      refresh();
    } catch { appAlert('Network error.'); }
    finally { setIsSaving(false); }
  };

  const openTeamEdit = async (t) => {
    setEditingTeam(t);
    setEF({ name: t.name, color: t.color || '#6366f1' });
    const res = await apiFetch('/api/config/teams/'+t.id+'/phases');
    if (res.ok) setSelectedPhases(await res.json());
    else setSelectedPhases([]);
  };

  const togglePhase = (pId) => {
    setSelectedPhases(prev => prev.includes(pId) ? prev.filter(id => id !== pId) : [...prev, pId]);
  };

  const COLOR_PRESETS_LOCAL = COLOR_PRESETS; // use module-level constant

  const columns = useMemo(() => [
    { id: 'color', header: 'Color', sortable: false, searchable: false, render: (t) => html`<div style="width:16px;height:16px;border-radius:50%;background:${t.color||'#6366f1'};"></div>` },
    { id: 'name', header: 'Name', accessor: 'name', sortable: true, searchable: true, render: (t) => html`<strong>${t.name}</strong>` },
    { id: 'status', header: 'Status', accessor: 'is_active', sortable: true, searchable: false, render: (t) => html`
      <span class="tag" style="background:${t.is_active?'var(--accent-green)':'var(--text-secondary)'}22;color:${t.is_active?'var(--accent-green)':'var(--text-secondary)'};">
        ${t.is_active ? 'Active' : 'Inactive'}
      </span>
    ` },
    { id: 'hint', header: '', sortable: false, render: () => html`<span style="font-size:0.7rem;color:var(--text-secondary);opacity:0.6;"><i class="fa-solid fa-pen" style="margin-right:0.3rem;"></i>Click to manage</span>` }
  ], []);

  return html`
    ${tabError && html`<div style="padding:0.75rem 1rem;color:var(--accent-orange);background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:8px;margin-bottom:1rem;font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:0.5rem;"></i>${tabError}</div>`}
    <div style="display:grid;grid-template-columns:320px 1fr;gap:1.5rem;">
      <div class="info-block" style="align-self:start;">
        <div class="section-title"><i class="fa-solid fa-plus"></i> Add Team</div>
        <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:1rem;">Teams are generic and can represent any department, squad, or unit.</p>
        <form onSubmit=${handleAdd} style="display:flex;flex-direction:column;gap:0.75rem;">
          <input placeholder="Team Name (e.g. Marketing, Analytics, DevOps)" class="form-input" value=${name} onInput=${e=>setName(e.target.value)} required />
          <label style="font-size:0.78rem;color:var(--text-secondary);">Team Color</label>
          <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
            ${COLOR_PRESETS.map(c => html`
              <div style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${color===c?'white':'transparent'};"
                onClick=${()=>setColor(c)}></div>`)}
            <input type="color" value=${color} onInput=${e=>setColor(e.target.value)} style="width:24px;height:24px;border:none;background:none;cursor:pointer;padding:0;" title="Custom color"/>
          </div>
          <button type="submit" class="btn active" style="background:var(--accent-blue);margin-top:0.5rem;"><i class="fa-solid fa-plus"></i> Add Team</button>
        </form>
      </div>
      <div>
        ${isLoading
          ? html`<${LoadingSkeleton} />`
          : html`<${AdvancedDataGrid} 
              data=${teams} 
              columns=${columns} 
              keyField="id" 
              pageSize=${12} 
              onRowClick=${openTeamEdit}
            />`
        }
      </div>
    </div>

    <!-- Edit Team Modal -->
    <${FocusModal}
      open=${!!editingTeam}
      onClose=${() => setEditingTeam(null)}
      title="Manage Team"
      subtitle=${editingTeam ? 'Modifying settings and phase assignments for ' + editingTeam.name : ''}
      icon="fa-users"
      accentColor="var(--accent-blue)"
      footer=${html`
        ${editingTeam && html`
          <button type="button" class="btn" style="color:${editingTeam.is_active?'var(--accent-orange)':'var(--accent-green)'};margin-right:auto;" onClick=${handleDeactivate}>
            <i class="fa-solid ${editingTeam.is_active?'fa-ban':'fa-circle-check'}"></i> ${editingTeam.is_active?'Deactivate':'Activate'} Team
          </button>
        `}
        <button class="btn" onClick=${() => setEditingTeam(null)} disabled=${isSaving}>Cancel</button>
        <button class="btn active" style="background:var(--accent-blue);" onClick=${handleSave} disabled=${isSaving}>
          ${isSaving ? html`<i class="fa-solid fa-spinner fa-spin"></i> Saving...` : 'Save Changes'}
        </button>
      `}>
      
      ${editingTeam && html`
        <form onSubmit=${handleSave}>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
            <!-- Left: Settings -->
            <div>
              <div style="font-weight:600;font-size:0.85rem;color:var(--accent-blue);margin-bottom:1rem;"><i class="fa-solid fa-gear" style="margin-right:0.4rem;"></i> General Settings</div>
              <label class="focus-label">Team Name</label>
              <input class="form-input" style="width:100%;margin-bottom:1rem;" value=${editForm.name} onInput=${e=>setEF({...editForm,name:e.target.value})} required />
              
              <label class="focus-label">Team Color</label>
              <div style="display:flex;gap:0.4rem;flex-wrap:wrap;background:var(--bg-panel);padding:0.5rem;border-radius:8px;border:1px solid var(--border-color);">
                ${COLOR_PRESETS.map(c=>html`<div style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${editForm.color===c?'white':'transparent'};"
                  onClick=${()=>setEF({...editForm,color:c})}></div>`)}
                <input type="color" value=${editForm.color} onInput=${e=>setEF({...editForm,color:e.target.value})} style="width:24px;height:24px;border:none;background:none;cursor:pointer;padding:0;" title="Custom color"/>
              </div>
            </div>

            <!-- Right: Phase Matrix -->
            <div>
              <div style="font-weight:600;font-size:0.85rem;color:var(--accent-purple);margin-bottom:1rem;"><i class="fa-solid fa-list-check" style="margin-right:0.4rem;"></i> Phase Assignments (Visual RBAC)</div>
              <div style="display:flex;flex-direction:column;gap:0.4rem;max-height:260px;overflow-y:auto;padding-right:0.5rem;">
                ${allPhases.map(p => html`
                  <label style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0.75rem;background:var(--bg-panel);border:1px solid ${selectedPhases.includes(p.id) ? 'var(--accent-purple)' : 'var(--border-color)'};border-radius:6px;cursor:pointer;transition:var(--transition);">
                    <div style="display:flex;align-items:center;gap:0.6rem;">
                      <input type="checkbox" checked=${selectedPhases.includes(p.id)} onChange=${()=>togglePhase(p.id)} style="width:16px;height:16px;" />
                      <span style="font-size:0.82rem;font-weight:${selectedPhases.includes(p.id) ? '600' : '400'};">${p.name}</span>
                    </div>
                    <span class="tag ${p.color_class}" style="font-size:0.65rem;opacity:${selectedPhases.includes(p.id) ? '1' : '0.5'};">${p.is_terminal?'Terminal':'Active'}</span>
                  </label>
                `)}
              </div>
            </div>
          </div>
        </form>
      `}
    </${FocusModal}>
  `;
};

/* ── PHASES ──────────────────────────────────────────────── */
const PhasesTab = () => {
  const [phases, setPhases]   = useState([]);
  const [form, setForm]       = useState({ name:'', display_order:0, color_class:'color-dep', is_terminal: false });
  const [isLoading, setIsLoading] = useState(true);
  const [tabError, setTabError] = useState('');
  
  // Edit Modal State
  const [editingPhase, setEditingPhase] = useState(null);
  const [editForm, setEF]     = useState({});
  const [isSaving, setIsSaving] = useState(false);

  const COLOR_CLASSES = ['color-bu','color-du','color-dp','color-mod','color-eval','color-dep','color-green','color-purple','color-orange','color-live','color-cyan','color-teal','color-emerald','color-pink','color-rose','color-sky','color-yellow','color-lime','color-slate'];

  const refresh = async () => {
    try {
      const res = await apiFetch('/api/config/phases?all=1');
      if (res.ok) setPhases(await res.json());
      await loadConfig();
    } catch { setTabError('Failed to load phases. Check your connection.'); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/config/phases', { method:'POST', body: JSON.stringify(form) });
      if (!res.ok) { const err = await res.json(); return appAlert(err.error || 'Failed'); }
      setForm({ name:'', display_order: phases.length, color_class:'color-dep', is_terminal:false }); refresh();
    } catch { appAlert('Network error. Please try again.'); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await apiFetch('/api/config/phases/' + editingPhase.id, { method:'PUT', body: JSON.stringify(editForm) });
      setEditingPhase(null);
      refresh();
    } catch { appAlert('Save failed. Please try again.'); }
    finally { setIsSaving(false); }
  };

  // Soft toggle: activate / deactivate (phase stays in DB)
  const handleDeactivate = async () => {
    if (!editingPhase) return;
    const action = editingPhase.is_active ? 'Deactivate' : 'Reactivate';
    if (!await appConfirm(`${action} phase "${editingPhase.name}"? ${editingPhase.is_active ? 'It will no longer appear in task/project dropdowns.' : 'It will become available again in all dropdowns.'}`, `${action} Phase`)) return;
    setIsSaving(true);
    try {
      // Soft deactivate = PUT with is_active:0 / Reactivate = PUT with is_active:1
      await apiFetch('/api/config/phases/' + editingPhase.id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: editingPhase.is_active ? 0 : 1 })
      });
      setEditingPhase(null);
      refresh();
    } catch { appAlert('Network error.'); }
    finally { setIsSaving(false); }
  };

  // Hard delete: permanently removes the phase from the database
  const handleDeletePhase = async () => {
    if (!editingPhase) return;
    if (!await appConfirm(
      `Permanently DELETE phase "${editingPhase.name}"? This cannot be undone and will remove all team assignments for this phase.`,
      'Delete Phase Permanently'
    )) return;
    setIsSaving(true);
    try {
      await apiFetch('/api/config/phases/' + editingPhase.id + '?hard=true', { method: 'DELETE' });
      setEditingPhase(null);
      refresh();
    } catch { appAlert('Network error.'); }
    finally { setIsSaving(false); }
  };

  const openPhaseEdit = (p) => {
    setEditingPhase(p);
    setEF({ name: p.name, display_order: p.display_order, color_class: p.color_class, is_terminal: p.is_terminal });
  };

  const sortedPhases = useMemo(() => [...phases].sort((a,b) => a.display_order - b.display_order), [phases]);

  const columns = useMemo(() => [
    { id: 'order', header: '#', accessor: 'display_order', sortable: true, searchable: false, render: (p) => html`<span style="color:var(--text-secondary);font-weight:600;">${p.display_order}</span>` },
    { id: 'name', header: 'Phase Name', accessor: 'name', sortable: true, searchable: true, render: (p) => html`
      <div style="display:flex;align-items:center;gap:0.6rem;">
        <div class="tag ${p.color_class}" style="padding:0.2rem 0.6rem;font-size:0.75rem;">${p.name}</div>
      </div>` },
    { id: 'type', header: 'Type', accessor: 'is_terminal', sortable: true, searchable: false, render: (p) => html`<span style="font-size:0.75rem;color:var(--text-secondary);">${p.is_terminal ? html`<i class="fa-solid fa-flag-checkered" style="margin-right:0.3rem;color:var(--accent-purple);"></i>Terminal` : html`<i class="fa-solid fa-arrows-rotate" style="margin-right:0.3rem;color:var(--accent-blue);"></i>Active stage`}</span>` },
    { id: 'status', header: 'Status', accessor: 'is_active', sortable: true, searchable: false, render: (p) => html`
      <span class="tag" style="background:${p.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(100,116,139,0.15)'};color:${p.is_active ? 'var(--accent-green)' : 'var(--text-secondary)'};border:1px solid ${p.is_active ? 'rgba(16,185,129,0.3)' : 'rgba(100,116,139,0.2)'}">
        <i class="fa-solid ${p.is_active ? 'fa-circle-check' : 'fa-circle-minus'}" style="margin-right:0.3rem;"></i>${p.is_active ? 'Active' : 'Inactive'}
      </span>` },
    { id: 'hint', header: '', sortable: false, render: () => html`<span style="font-size:0.7rem;color:var(--text-secondary);opacity:0.5;"><i class="fa-solid fa-pen" style="margin-right:0.3rem;"></i>Click to manage</span>` }
  ], []);

  return html`
    ${tabError && html`<div style="padding:0.75rem 1rem;color:var(--accent-orange);background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:8px;margin-bottom:1rem;font-size:0.85rem;"><i class="fa-solid fa-triangle-exclamation" style="margin-right:0.5rem;"></i>${tabError}</div>`}
    <div style="display:grid;grid-template-columns:320px 1fr;gap:1.5rem;">
      <div class="info-block" style="align-self:start;">
        <div class="section-title"><i class="fa-solid fa-plus"></i> Add Phase</div>
        <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:1rem;">Phases define your workflow stages — CRISP-DM, Agile sprints, or any custom process.</p>
        <form onSubmit=${handleAdd} style="display:flex;flex-direction:column;gap:0.75rem;">
          <input placeholder="Phase Name (e.g. Discovery, Sprint 1, Review)" class="form-input" value=${form.name} onInput=${e=>setForm({...form,name:e.target.value})} required />
          <input type="number" placeholder="Display Order" class="form-input" value=${form.display_order} onInput=${e=>setForm({...form,display_order:Number(e.target.value)})} required />
          <label style="font-size:0.78rem;color:var(--text-secondary);">Color Style</label>
          <select class="form-select" value=${form.color_class} onChange=${e=>setForm({...form,color_class:e.target.value})}>
            ${COLOR_CLASSES.map(c=>html`<option value=${c}>${c}</option>`)}
          </select>
          <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.82rem;cursor:pointer;">
            <input type="checkbox" checked=${form.is_terminal} onChange=${e=>setForm({...form,is_terminal:e.target.checked})} />
            Terminal phase (e.g. Deployed, Archived)
          </label>
          <button type="submit" class="btn active" style="background:var(--accent-blue);margin-top:0.5rem;"><i class="fa-solid fa-plus"></i> Add Phase</button>
        </form>
      </div>
      <div>
        ${isLoading
          ? html`<${LoadingSkeleton} />`
          : html`<${AdvancedDataGrid} 
              data=${sortedPhases} 
              columns=${columns} 
              keyField="id" 
              pageSize=${12} 
              onRowClick=${openPhaseEdit}
            />`
        }
      </div>
    </div>

    <!-- Edit Phase Modal -->
    <${FocusModal}
      open=${!!editingPhase}
      onClose=${() => setEditingPhase(null)}
      title="Manage Phase"
      subtitle=${editingPhase ? 'Modifying settings for ' + editingPhase.name : ''}
      icon="fa-list-ol"
      accentColor="var(--accent-blue)"
      footer=${html`
        ${editingPhase && html`
          <div style="display:flex;gap:0.5rem;margin-right:auto;">
            <button type="button" class="btn"
              style="color:${editingPhase.is_active ? 'var(--accent-orange)' : 'var(--accent-green)'};"
              onClick=${handleDeactivate} disabled=${isSaving}
              title=${editingPhase.is_active ? 'Removes from dropdowns but keeps in database' : 'Makes this phase available again'}>
              <i class="fa-solid ${editingPhase.is_active ? 'fa-ban' : 'fa-circle-check'}"></i>
              ${editingPhase.is_active ? 'Deactivate' : 'Activate'}
            </button>
            ${editingPhase.is_active === 0 && html`
              <button type="button" class="btn"
                style="color:var(--accent-pink);border-color:rgba(236,72,153,0.3);"
                onClick=${handleDeletePhase} disabled=${isSaving}
                title="Permanently remove this phase from the database">
                <i class="fa-solid fa-trash"></i> Delete
              </button>
            `}
          </div>
        `}
        <button class="btn" onClick=${() => setEditingPhase(null)} disabled=${isSaving}>Cancel</button>
        <button class="btn active" style="background:var(--accent-blue);" onClick=${handleSave} disabled=${isSaving}>
          ${isSaving ? html`<i class="fa-solid fa-spinner fa-spin"></i> Saving...` : 'Save Changes'}
        </button>
      `}>
      
      ${editingPhase && html`
        <form onSubmit=${handleSave}>
          <div style="display:grid;grid-template-columns:1fr;gap:1.25rem;">
            <div>
              <label class="focus-label">Phase Name</label>
              <input class="form-input" style="width:100%;" value=${editForm.name} onInput=${e=>setEF({...editForm,name:e.target.value})} required />
            </div>
            <div style="display:flex;gap:1rem;">
              <div style="flex:1;">
                <label class="focus-label">Display Order</label>
                <input type="number" class="form-input" style="width:100%;" value=${editForm.display_order} onInput=${e=>setEF({...editForm,display_order:Number(e.target.value)})} required />
              </div>
              <div style="flex:1;">
                <label class="focus-label">Color Style</label>
                <select class="form-select" style="width:100%;" value=${editForm.color_class} onChange=${e=>setEF({...editForm,color_class:e.target.value})}>
                  ${COLOR_CLASSES.map(c=>html`<option value=${c}>${c}</option>`)}
                </select>
              </div>
            </div>
            <div>
              <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.85rem;cursor:pointer;background:var(--bg-panel);padding:0.75rem;border-radius:6px;border:1px solid var(--border-color);">
                <input type="checkbox" checked=${editForm.is_terminal} onChange=${e=>setEF({...editForm,is_terminal:e.target.checked})} style="width:16px;height:16px;" />
                Terminal phase (e.g. Deployed, Archived)
              </label>
            </div>
          </div>
        </form>
      `}
    </${FocusModal}>
  `;
};

/* ── ROLES ───────────────────────────────────────────────── */
const RolesTab = () => {
  const [roles, setRoles]     = useState([]);
  const [form, setForm]       = useState({ name:'', label:'' });
  const [allPerms, setAllPerms] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tabError, setTabError] = useState('');

  // Edit/Modal State
  const [editingRole, setEditingRole] = useState(null);
  const [editForm, setEF] = useState({});
  const [selectedPerms, setSelectedPerms] = useState([]);
  const [isSaving, setIsSaving] = useState(false);

  const refresh = async () => {
    try {
      const res = await apiFetch('/api/config/roles');
      if (res.ok) setRoles(await res.json());
      await loadConfig();
    } catch { setTabError('Failed to load roles. Check your connection.'); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { 
    refresh(); 
    apiFetch('/api/config/permissions').then(r=>r.ok?r.json():[]).then(setAllPerms).catch(()=>{});
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!/^[a-z_]+$/.test(form.name)) return appAlert('Role code must be lowercase letters and underscores only (e.g. team_lead)');
    try {
      const res = await apiFetch('/api/config/roles', { method:'POST', body: JSON.stringify(form) });
      if (!res.ok) { const err = await res.json(); return appAlert(err.error || 'Failed'); }
      setForm({ name:'', label:'' }); refresh();
    } catch { appAlert('Network error. Please try again.'); }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Administrative Lockout Safeguard
    if (editingRole && editingRole.name === 'admin') {
      const adminPanelPerm = allPerms.find(p => p.code === 'admin.panel' || p.code === 'menu_access:AdminPanel');
      const userManagePerm = allPerms.find(p => p.code === 'user.manage' || p.code === 'can_manage:User');
      const missing = [];
      
      if (adminPanelPerm && !selectedPerms.includes(adminPanelPerm.id)) {
        missing.push('Access Admin Panel (menu_access:AdminPanel)');
      }
      if (userManagePerm && !selectedPerms.includes(userManagePerm.id)) {
        missing.push('Manage Users (can_manage:User)');
      }
      
      if (missing.length > 0) {
        setIsSaving(false);
        return appAlert(
          `Administrative Lockout Safeguard Activated:\n\nYou cannot remove the following critical permissions from the default Administrator role:\n- ${missing.join('\n- ')}\n\nDoing so would permanently lock you and other admins out of this administration console.`,
          'Action Blocked'
        );
      }
    }

    try {
      const res = await apiFetch('/api/config/roles/' + editingRole.id, { method:'PUT', body: JSON.stringify(editForm) });
      if (!res.ok) { const err = await res.json(); appAlert(err.error || 'Save failed'); return; }
      await apiFetch('/api/config/roles/' + editingRole.id + '/permissions', { method: 'POST', body: JSON.stringify({ permissions: selectedPerms }) });
      setEditingRole(null);
      refresh();
    } catch { appAlert('Save failed. Please try again.'); }
    finally { setIsSaving(false); }
  };

  const handleDeactivate = async () => {
    if (!editingRole) return;
    if (editingRole.is_system) return appAlert('System roles cannot be deactivated.');
    if (!await appConfirm(`${editingRole.is_active ? 'Deactivate' : 'Reactivate'} role "${editingRole.label}"?`)) return;
    setIsSaving(true);
    try {
      await apiFetch('/api/config/roles/' + editingRole.id, { method: editingRole.is_active ? 'DELETE' : 'PUT', body: JSON.stringify({ is_active: 1 }) });
      setEditingRole(null);
      refresh();
    } catch { appAlert('Network error.'); }
    finally { setIsSaving(false); }
  };

  const openRoleEdit = async (r) => {
    setEditingRole(r);
    setEF({ label: r.label });
    const res = await apiFetch('/api/config/roles/'+r.id+'/permissions');
    if (res.ok) setSelectedPerms(await res.json());
    else setSelectedPerms([]);
  };

  const togglePerm = (pId) => {
    setSelectedPerms(prev => prev.includes(pId) ? prev.filter(id => id !== pId) : [...prev, pId]);
  };

  const LEGACY_PERMISSION_MAP = {
    "task.create": ["can_create:Task"],
    "task.read": ["can_read:Task"],
    "task.update": ["can_write:Task"],
    "task.delete": ["can_delete:Task"],
    "task.approve": ["can_approve:Task"],
    "task.review_accept": ["can_accept:Task"],
    "task.review_finish": ["can_finish:Task"],
    "task.block": ["can_block:Task"],
    "project.create": ["can_create:Project"],
    "project.read": ["can_read:Project"],
    "project.read_all": ["can_read_all_projects:Project"],
    "project.read_team": ["can_read_team_projects:Project"],
    "project.read_own": ["can_read_own_projects:Project"],
    "project.update": ["can_write:Project"],
    "project.delete": ["can_delete:Project"],
    "project.manage": ["can_manage:Project"],
    "project.phase_submit": ["can_submit_phase:Project"],
    "project.phase_any": ["can_any_phase:Project"],
    "project.status_manage": ["can_manage_status:Project"],
    "user.manage": ["can_manage:User"],
    "audit.read": ["menu_access:AuditLog"],
    "analytics.read_all": ["can_read_all:Task", "can_read_all_tasks:Task", "can_read_all_projects:Project"],
    "analytics.read_team": ["can_read_team:Task", "can_read_team_tasks:Task", "can_read_team_projects:Project"],
    "analytics.read_own": ["can_read_own:Task", "can_read_own_tasks:Task", "can_read_own_projects:Project"],
    "admin.panel": ["menu_access:AdminPanel"],
    "config.manage": ["can_manage:Config"],
    "messages.read": ["menu_access:Comms"],
    "messages.create": ["can_create:Message"]
  };

  const getPermByCode = (code) => {
    let p = allPerms.find(perm => perm.code === code);
    if (p) return p;
    for (const [legacy, tokens] of Object.entries(LEGACY_PERMISSION_MAP)) {
      if (legacy === code) {
        const found = allPerms.find(perm => tokens.includes(perm.code));
        if (found) return found;
      }
      if (tokens.includes(code)) {
        const found = allPerms.find(perm => perm.code === legacy);
        if (found) return found;
      }
    }
    return null;
  };

  const renderCellCheckbox = (code, customLabel = '') => {
    const p = getPermByCode(code);
    if (!p) return html`<span style="opacity:0.25;font-size:0.75rem;">—</span>`;
    const isChecked = selectedPerms.includes(p.id);
    return html`
      <label class="matrix-cell-label" style="display:inline-flex;align-items:center;justify-content:${customLabel ? 'flex-start' : 'center'};gap:0.35rem;padding:0.25rem 0.45rem;border-radius:4px;border:1px solid ${isChecked ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.06)'};background:${isChecked ? 'rgba(139,92,246,0.08)' : 'transparent'};cursor:pointer;user-select:none;transition:var(--transition);font-size:0.75rem;min-height:26px;width:${customLabel ? 'auto' : '100%'};box-sizing:border-box;">
        <input type="checkbox" checked=${isChecked} onChange=${() => togglePerm(p.id)} style="width:14px;height:14px;accent-color:var(--accent-purple);margin:0;cursor:pointer;" />
        ${customLabel && html`<span style="font-weight:${isChecked ? '600' : '400'};color:${isChecked ? 'var(--text-primary)' : 'var(--text-secondary)'};font-size:0.72rem;">${customLabel}</span>`}
      </label>
    `;
  };

  const columns = useMemo(() => [
    { id: 'code', header: 'Code', accessor: 'name', sortable: true, searchable: true, render: (r) => html`<span style="font-family:monospace;color:var(--accent-blue);">${r.name}</span>` },
    { id: 'label', header: 'Label', accessor: 'label', sortable: true, searchable: true, render: (r) => html`<strong>${r.label}</strong>` },
    { id: 'type', header: 'Type', accessor: 'is_system', sortable: true, searchable: false, render: (r) => html`
      <span class="tag" style="background:${r.is_system?'var(--accent-orange)':'var(--accent-blue)'}22;color:${r.is_system?'var(--accent-orange)':'var(--accent-blue)'};">
        ${r.is_system ? '🔒 System' : '👤 Custom'}
      </span>
    ` },
    { id: 'status', header: 'Status', accessor: 'is_active', sortable: true, searchable: false, render: (r) => html`
      <span class="tag" style="background:${r.is_active?'var(--accent-green)':'var(--text-secondary)'}22;color:${r.is_active?'var(--accent-green)':'var(--text-secondary)'};">
        ${r.is_active ? 'Active' : 'Inactive'}
      </span>
    ` },
    { id: 'hint', header: '', sortable: false, render: () => html`<span style="font-size:0.7rem;color:var(--text-secondary);opacity:0.6;"><i class="fa-solid fa-pen" style="margin-right:0.3rem;"></i>Click to manage</span>` }
  ], []);

  return html`
    <div style="display:grid;grid-template-columns:320px 1fr;gap:1.5rem;">
      <div class="info-block" style="align-self:start;">
        <div class="section-title"><i class="fa-solid fa-plus"></i> Add Role</div>
        <p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:1rem;">Roles define what actions a user can perform. System roles (admin, leader, member) cannot be removed.</p>
        <form onSubmit=${handleAdd} style="display:flex;flex-direction:column;gap:0.75rem;">
          <input placeholder="Role Code (e.g. reviewer, analyst)" class="form-input" value=${form.name} onInput=${e=>setForm({...form,name:e.target.value.toLowerCase().replace(/[^a-z_]/g,'')})} required />
          <input placeholder="Display Label (e.g. Senior Analyst)" class="form-input" value=${form.label} onInput=${e=>setForm({...form,label:e.target.value})} required />
          <button type="submit" class="btn active" style="background:var(--accent-blue);margin-top:0.5rem;"><i class="fa-solid fa-plus"></i> Add Role</button>
        </form>
      </div>
      <div>
        <${AdvancedDataGrid} 
          data=${roles} 
          columns=${columns} 
          keyField="id" 
          pageSize=${12} 
          onRowClick=${openRoleEdit}
        />
      </div>
    </div>

    <!-- Edit Role Modal -->
    <${FocusModal}
      open=${!!editingRole}
      onClose=${() => setEditingRole(null)}
      title="Manage Role"
      subtitle=${editingRole ? 'Modifying settings and permissions for ' + editingRole.label : ''}
      icon="fa-shield-halved"
      accentColor="var(--accent-blue)"
      maxWidth="950px"
      footer=${html`
        ${editingRole && !editingRole.is_system && html`
          <button type="button" class="btn" style="color:${editingRole.is_active?'var(--accent-orange)':'var(--accent-green)'};margin-right:auto;" onClick=${handleDeactivate}>
            <i class="fa-solid ${editingRole.is_active?'fa-ban':'fa-circle-check'}"></i> ${editingRole.is_active?'Deactivate':'Activate'} Role
          </button>
        `}
        <button class="btn" onClick=${() => setEditingRole(null)} disabled=${isSaving}>Cancel</button>
        <button class="btn active" style="background:var(--accent-blue);" onClick=${handleSave} disabled=${isSaving}>
          ${isSaving ? html`<i class="fa-solid fa-spinner fa-spin"></i> Saving...` : 'Save Changes'}
        </button>
      `}>
      
      ${editingRole && html`
        <form onSubmit=${handleSave}>
          <div style="display:flex;flex-direction:column;gap:1.5rem;margin-top:0.5rem;">
            <!-- General Settings Row: side-by-side role info -->
            <div style="display:grid;grid-template-columns:1.5fr 2fr;gap:2rem;align-items:start;padding-bottom:1.25rem;border-bottom:1px solid var(--border-color);">
              <div>
                <div style="font-weight:600;font-size:0.85rem;color:var(--accent-blue);margin-bottom:0.75rem;"><i class="fa-solid fa-gear" style="margin-right:0.4rem;"></i> General Settings</div>
                <label class="focus-label">Display Label</label>
                <input class="form-input" style="width:100%;" value=${editForm.label} onInput=${e=>setEF({...editForm,label:e.target.value})} required />
              </div>
              <div>
                <label class="focus-label">Role Code</label>
                <input class="form-input" style="width:100%;font-family:monospace;background:var(--bg-panel);opacity:0.7;" value=${editingRole.name} disabled />
                ${editingRole.is_system && html`
                  <div style="margin-top:0.75rem;padding:0.5rem 0.75rem;background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:6px;font-size:0.78rem;color:var(--accent-orange);display:flex;align-items:center;gap:0.4rem;">
                    <i class="fa-solid fa-lock"></i>
                    <span>This is a system role. It cannot be deactivated or have its code changed.</span>
                  </div>
                `}
              </div>
            </div>

            <!-- Permissions Matrix: full width below -->
            <div>
              <div style="font-weight:600;font-size:0.88rem;color:var(--accent-purple);margin-bottom:1rem;display:flex;align-items:center;gap:0.5rem;">
                <i class="fa-solid fa-shield-halved"></i> System Capability Matrix (2D CRUD Grid)
              </div>
              <div style="overflow-x:auto;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:8px;padding:0.25rem;">
                <table class="data-grid-table" style="min-width:750px;width:100%;border-collapse:collapse;font-size:0.82rem;">
                  <thead>
                    <tr style="background:rgba(0,0,0,0.25);border-bottom:1.5px solid var(--border-color);">
                      <th style="padding:0.75rem 1rem;text-align:left;color:var(--text-secondary);font-weight:600;width:25%;">Entity / Domain</th>
                      <th style="padding:0.75rem 1rem;text-align:center;color:var(--text-secondary);font-weight:600;width:12%;">Create (C)</th>
                      <th style="padding:0.75rem 1rem;text-align:center;color:var(--text-secondary);font-weight:600;width:12%;">Read (R)</th>
                      <th style="padding:0.75rem 1rem;text-align:center;color:var(--text-secondary);font-weight:600;width:12%;">Update (U)</th>
                      <th style="padding:0.75rem 1rem;text-align:center;color:var(--text-secondary);font-weight:600;width:12%;">Delete (D)</th>
                      <th style="padding:0.75rem 1rem;text-align:left;color:var(--text-secondary);font-weight:600;width:27%;">Special Capabilities</th>
                    </tr>
                  </thead>
                  <tbody>
                    <!-- Row 1: Tasks -->
                    <tr style="border-bottom:1px solid var(--border-color);">
                      <td style="padding:0.75rem 1rem;vertical-align:top;">
                        <div style="display:flex;align-items:center;gap:0.4rem;font-weight:700;color:var(--accent-blue);font-size:0.85rem;"><i class="fa-solid fa-list-check"></i> Tasks</div>
                        <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.2rem;line-height:1.35;">Workflow, status changes, approvals & blockers.</div>
                      </td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">${renderCellCheckbox('can_create:Task')}</td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">
                        <div style="display:flex;flex-direction:column;gap:0.25rem;text-align:left;">
                          ${renderCellCheckbox('can_read:Task', 'Base Read')}
                          ${renderCellCheckbox('can_read_all_tasks:Task', 'Read All')}
                          ${renderCellCheckbox('can_read_team_tasks:Task', 'Read Team')}
                          ${renderCellCheckbox('can_read_own_tasks:Task', 'Read Own')}
                        </div>
                      </td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">${renderCellCheckbox('can_write:Task')}</td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">${renderCellCheckbox('can_delete:Task')}</td>
                      <td style="padding:0.75rem 1rem;vertical-align:middle;">
                        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                          ${renderCellCheckbox('can_approve:Task', 'Approve Status')}
                          ${renderCellCheckbox('can_finish:Task', 'Verify Done')}
                          ${renderCellCheckbox('can_block:Task', 'Block Tasks')}
                        </div>
                      </td>
                    </tr>

                    <!-- Row 2: Projects -->
                    <tr style="border-bottom:1px solid var(--border-color);">
                      <td style="padding:0.75rem 1rem;vertical-align:top;">
                        <div style="display:flex;align-items:center;gap:0.4rem;font-weight:700;color:var(--accent-green);font-size:0.85rem;"><i class="fa-solid fa-diagram-project"></i> Projects</div>
                        <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.2rem;line-height:1.35;">Initiative lifecycle phases & team-streams.</div>
                      </td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">${renderCellCheckbox('can_create:Project')}</td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">
                        <div style="display:flex;flex-direction:column;gap:0.25rem;text-align:left;">
                          ${renderCellCheckbox('can_read:Project', 'Base Read')}
                          ${renderCellCheckbox('can_read_all_projects:Project', 'Read All')}
                          ${renderCellCheckbox('can_read_team_projects:Project', 'Read Team')}
                          ${renderCellCheckbox('can_read_own_projects:Project', 'Read Own')}
                        </div>
                      </td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">${renderCellCheckbox('can_write:Project')}</td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">${renderCellCheckbox('can_delete:Project')}</td>
                      <td style="padding:0.75rem 1rem;vertical-align:middle;">
                        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                          ${renderCellCheckbox('can_manage:Project', 'Manage Streams')}
                          ${renderCellCheckbox('can_submit_phase:Project', 'Submit Phase')}
                          ${renderCellCheckbox('can_any_phase:Project', 'Phase Override')}
                          ${renderCellCheckbox('can_manage_status:Project', 'Status Control')}
                        </div>
                      </td>
                    </tr>

                    <!-- Row 3: Workflow Phases -->
                    <tr style="border-bottom:1px solid var(--border-color);">
                      <td style="padding:0.75rem 1rem;vertical-align:top;">
                        <div style="display:flex;align-items:center;gap:0.4rem;font-weight:700;color:var(--accent-orange);font-size:0.85rem;"><i class="fa-solid fa-code-branch"></i> Workflow Phases</div>
                        <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.2rem;line-height:1.35;">Restrict active phase views by team boundaries.</div>
                      </td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;opacity:0.25;">—</td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">
                        <div style="display:flex;flex-direction:column;gap:0.25rem;text-align:left;">
                          ${renderCellCheckbox('can_read_all_phases:Phase', 'All Phases')}
                          ${renderCellCheckbox('can_read_team_phases:Phase', 'Team Phases')}
                        </div>
                      </td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;opacity:0.25;">—</td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;opacity:0.25;">—</td>
                      <td style="padding:0.75rem 1rem;vertical-align:middle;opacity:0.25;">—</td>
                    </tr>

                    <!-- Row 4: System Operations -->
                    <tr>
                      <td style="padding:0.75rem 1rem;vertical-align:top;">
                        <div style="display:flex;align-items:center;gap:0.4rem;font-weight:700;color:var(--accent-purple);font-size:0.85rem;"><i class="fa-solid fa-server"></i> System Operations</div>
                        <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.2rem;line-height:1.35;">Admin panels, audit logs, messaging channels.</div>
                      </td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">${renderCellCheckbox('can_create:Message', 'Post Chat')}</td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;">
                        <div style="display:flex;flex-direction:column;gap:0.25rem;text-align:left;">
                          ${renderCellCheckbox('menu_access:Comms', 'Read Chat')}
                          ${renderCellCheckbox('menu_access:AuditLog', 'Read Audits')}
                        </div>
                      </td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;opacity:0.25;">—</td>
                      <td style="padding:0.75rem;text-align:center;vertical-align:middle;opacity:0.25;">—</td>
                      <td style="padding:0.75rem 1rem;vertical-align:middle;">
                        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
                          ${renderCellCheckbox('menu_access:AdminPanel', 'Admin Panel')}
                          ${renderCellCheckbox('can_manage:User', 'Manage Users')}
                          ${renderCellCheckbox('can_manage:Config', 'Manage Config')}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </form>
      `}
    </${FocusModal}>
  `;
};

const SettingsTab = () => {
  const [appName, setAppName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiFetch('/api/config/app-name')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.app_name) setAppName(data.app_name);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!appName.trim() || isSaving) return;
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/config/app-name', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_name: appName.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        if (window.updateGlobalAppName) {
          window.updateGlobalAppName(data.app_name);
        }
        if (window.showToast) {
          window.showToast("Application Name updated successfully!");
        }
      } else {
        const err = await res.json();
        appAlert("Failed to update application name: " + (err.detail || "Unknown error"));
      }
    } catch {
      appAlert("Server error while updating application name.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return html`<${LoadingSkeleton} />`;

  return html`
    <div class="info-block" style="max-width: 600px; padding: 2rem;">
      <h3 style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem; color: var(--text-primary);">
        <i class="fa-solid fa-screwdriver-wrench" style="color:var(--accent-blue);"></i> General System Settings
      </h3>
      <form onSubmit=${handleSave} style="display:flex; flex-direction:column; gap:1.5rem;">
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
          <label style="font-weight:600; font-size:0.9rem; color:var(--text-primary);">Application Name</label>
          <input class="form-input" 
                 value=${appName} 
                 onInput=${e => setAppName(e.target.value)} 
                 placeholder="BI Project Manager" 
                 required 
                 disabled=${isSaving} />
          <span style="font-size:0.75rem; color:var(--text-secondary);">This updates the main title, tab bar brand header, and the login page brand name across the platform.</span>
        </div>
        <button type="submit" class="btn active" style="align-self: flex-start; padding: 0.5rem 1.25rem; display:flex; align-items:center; gap:0.5rem;" disabled=${isSaving}>
          ${isSaving 
            ? html`<i class="fa-solid fa-spinner fa-spin"></i> Saving...` 
            : html`<i class="fa-solid fa-floppy-disk"></i> Save Settings`}
        </button>
      </form>
    </div>
  `;
};
