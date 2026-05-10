import { AppDialogHost, useSmartPoll, parseMessageContent, getInitials, apiFetch } from '../utils/core.js';
import { PHASES, TEAMS } from '../utils/core.js';
import { LoginScreen } from './LoginScreen.js';
import { AdminPanel } from './AdminPanel.js';
import { CreateProjectTab, ProjectModal, PhaseSubmissionTab, ProjectsManagementTab } from './ProjectManagement.js';
import { KanbanBoard } from './KanbanBoard.js';
import { Dashboard } from './Dashboard.js';
import { TeamPoolView, TaskDetailModal, TeamDashboardView, MyTasksView, ApprovalsView } from './TaskManagement.js';
import { AuditLogTab } from './AuditLog.js';
import { ProjectAnalyticsTab, TaskMonitoringTab } from './Analytics.js';
import { NotificationBell } from './NotificationBell.js';
import { CommandPalette } from './CommandPalette.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);



export const CommunicationsTab = ({ currentUser, tasks, projects }) => {
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
    apiFetch('/api/users').then(r => r.ok ? r.json() : []).then(setAllUsers).catch(() => {});
  }, []);

  const fetchMessages = async () => {
    const res = await apiFetch('/api/messages?channel=' + encodeURIComponent(activeChannel));
    if (res.ok) setMessages(await res.json());
  };

  useSmartPoll(fetchMessages, 15000, 120000, [activeChannel]);

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!inputMsg.trim()) return;
    await apiFetch('/api/messages', {
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





export const App = () => {
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('currentUser')); } catch { return null; }
  });
  const [projectsList, setProjectsList] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [boardView, setBoardView] = useState('phase');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [usersList, setUsersList] = useState([]);
  
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const [tasksList, setTasksList] = useState([]);

  const fetchProjects = async () => { const d = await (await apiFetch('/api/projects')).json(); setProjectsList(Array.isArray(d) ? d : []); };
  const fetchUsers = async () => { const d = await (await apiFetch('/api/users')).json(); setUsersList(Array.isArray(d) ? d : []); };
  const fetchTasks = async () => {
    if (!currentUser) return;
    // Leaders and admins see all tasks; members see only their team
    const url = (currentUser.role === 'admin' || currentUser.role === 'leader')
      ? '/api/tasks?role=admin'
      : `/api/tasks?role=member&team=${encodeURIComponent(currentUser.team || '')}`;
    const d = await (await apiFetch(url)).json();
    if (Array.isArray(d)) setTasksList(d);
    else setTasksList([]);
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
          <button class="btn" onClick=${toggleTheme} title="Toggle Theme">
            <i class="fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}"></i>
          </button>
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
      <${CommandPalette} projects=${projectsList} tasks=${tasksList} setActiveTab=${setActiveTab} setSelectedProjectId=${setSelectedProjectId} />
      <${AppDialogHost} />
    </div>
  `;
};



