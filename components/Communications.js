import { AppDialogHost, useSmartPoll, parseMessageContent, getInitials, apiFetch, hasPermission } from '../utils/core.js';
import { loadConfig, getTeams } from '../utils/configStore.js';
import { LoginScreen } from './LoginScreen.js';
import { AdminPanel } from './AdminPanel.js';
import { CreateProjectTab, ProjectModal, PhaseSubmissionTab, ProjectsManagementTab, ProjectDetailInline, ProjectDocumentView } from './ProjectManagement.js';
import { KanbanBoard } from './KanbanBoard.js';
import { Dashboard } from './Dashboard.js';
import { RoleDashboard } from './RoleDashboard.js';
import { TaskFocusModal, PhaseSubmitModal } from './FocusModal.js';
import { TeamPoolView, TaskDetailModal, TeamDashboardView, MyTasksView, ApprovalsView } from './TaskManagement.js';
import { AuditLogTab } from './AuditLog.js';
import { ProjectAnalyticsTab, TaskMonitoringTab } from './Analytics.js';
import { NotificationBell } from './NotificationBell.js';
import { ProjectLeadDashboard } from './ProjectLeadDashboard.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);



export const CommunicationsTab = ({ currentUser, tasks, projects }) => {
  const isLeaderOrAdmin = currentUser.role === 'admin' || currentUser.role === 'leader';

  // Build channel list based on role
  const buildChannels = () => {
    const base = ['General', '📢 Broadcast'];
    if (currentUser.role === 'admin') base.push(...getTeams());
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

      ${linkedTask && html`<${TaskDetailModal} task=${linkedTask} projects=${projects||[]} currentUser=${currentUser} fetchTasks=${fetchTasks} onClose=${() => setLinkedTask(null)} />`}
    </div>
  `;
};





export const App = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [projectsList, setProjectsList] = useState([]);
  const [openTabs, setOpenTabs] = useState(() => {
    const saved = sessionStorage.getItem('bi_open_tabs');
    return saved ? JSON.parse(saved) : [{ id: 'home', label: 'Home', icon: 'fa-house', pinned: true }];
  });
  const [activeTabId, setActiveTabId] = useState(() => {
    return sessionStorage.getItem('bi_active_tab') || 'home';
  });
  const [sidebarPinned, setSidebarPinned] = useState(false);
  const skipClose = useRef(false);
  const [editFavorites, setEditFavorites] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const sidebarRef = useRef(null);

  const [boardView, setBoardView] = useState('phase');
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [usersList, setUsersList] = useState([]);
  const [globalSelectedTaskId, setGlobalSelectedTaskId] = useState(null);
  const [tasksList, setTasksList] = useState([]);

  // Global Focus Modals state
  const [showTaskModal,  setShowTaskModal]  = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);
  const [preselectedPhaseProject, setPreselectedPhaseProject] = useState('');
  const [toastMsg, setToastMsg] = useState(null);

  const [contextMenu, setContextMenu] = useState(null);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const handleTabContextMenu = (e, tabId) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tabId
    });
  };

  const toggleTabPin = (id) => {
    setOpenTabs(prev => prev.map(t => t.id === id ? { ...t, pinned: !t.pinned } : t));
  };

  const closeOtherTabs = (id) => {
    const targetTab = openTabs.find(t => t.id === id);
    if (!targetTab) return;
    const newTabs = openTabs.filter(t => t.id === id || t.pinned);
    setOpenTabs(newTabs);
    if (!newTabs.some(t => t.id === activeTabId)) {
      setActiveTabId(id);
    }
  };

  const closeAllTabs = () => {
    const newTabs = openTabs.filter(t => t.pinned);
    setOpenTabs(newTabs);
    if (!newTabs.some(t => t.id === activeTabId)) {
      if (newTabs.length > 0) {
        setActiveTabId(newTabs[0].id);
      }
    }
  };

  useEffect(() => {
    sessionStorage.setItem('bi_open_tabs', JSON.stringify(openTabs));
  }, [openTabs]);

  useEffect(() => {
    sessionStorage.setItem('bi_active_tab', activeTabId);
  }, [activeTabId]);

  useEffect(() => {
    if (!currentUser) {
      sessionStorage.removeItem('bi_open_tabs');
      sessionStorage.removeItem('bi_active_tab');
      setOpenTabs([{ id: 'home', label: 'Home', icon: 'fa-house', pinned: true }]);
      setActiveTabId('home');
      setFavorites([]);
      setEditFavorites(false);
    } else {
      try {
        const config = typeof currentUser.dashboard_config === 'string'
          ? JSON.parse(currentUser.dashboard_config)
          : (currentUser.dashboard_config || {});
        setFavorites(config.favorites || []);
      } catch {
        setFavorites([]);
      }
    }
  }, [currentUser]);

  const openTab = (id, label, icon, type = 'module', data = null) => {
    const existing = openTabs.find(t => t.id === id);
    if (existing) {
      setActiveTabId(id);
      return;
    }
    if (openTabs.length >= 10) {
      window.showToast ? window.showToast("Please close a tab first (max 10 open)") : alert("Please close a tab first (max 10 open)");
      return;
    }
    const newTab = { id, label, icon, type, data };
    setOpenTabs([...openTabs, newTab]);
    setActiveTabId(id);
  };

  const closeTab = (id) => {
    const tab = openTabs.find(t => t.id === id);
    if (!tab || tab.pinned) return;

    const newTabs = openTabs.filter(t => t.id !== id);
    setOpenTabs(newTabs);

    if (activeTabId === id) {
      const idx = openTabs.findIndex(t => t.id === id);
      const nextActive = newTabs[idx - 1] || newTabs[idx] || newTabs[0];
      if (nextActive) {
        setActiveTabId(nextActive.id);
      }
    }
  };

  const toggleFavorite = async (tabId) => {
    const newFavs = favorites.includes(tabId)
      ? favorites.filter(id => id !== tabId)
      : [...favorites, tabId];
    
    setFavorites(newFavs);

    try {
      let currentConfig = {};
      try {
        currentConfig = typeof currentUser.dashboard_config === 'string'
          ? JSON.parse(currentUser.dashboard_config)
          : (currentUser.dashboard_config || {});
      } catch {}
      currentConfig.favorites = newFavs;

      const res = await apiFetch('/api/users/me/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboard_config: currentConfig })
      });
      if (res.ok) {
        currentUser.dashboard_config = JSON.stringify(currentConfig);
      }
    } catch (e) {
      console.error("Failed to save favorites:", e);
    }
  };

  const getTabLabel = (id) => {
    switch (id) {
      case 'home': return 'Home';
      case 'dashboard': return 'Dashboard';
      case 'board': return 'Pivot Board';
      case 'my_tasks': return 'My Tasks';
      case 'team_pool': return 'Team Pool';
      case 'team_dashboard': return 'Team Dash';
      case 'approvals': return 'Approvals';
      case 'analytics': return 'Analytics';
      case 'monitoring': return 'Monitoring';
      case 'phase_submit': return 'Projects';
      case 'comms': return 'Comms';
      case 'audit': return 'Audit';
      case 'manage': return 'Manage';
      case 'new-project': return 'New Project';
      case 'admin': return 'Admin';
      case 'lead_dashboard': return 'My Lead Projects';
      default: return id;
    }
  };

  const getTabIcon = (id) => {
    switch (id) {
      case 'home': return 'fa-house';
      case 'dashboard': return 'fa-gauge-high';
      case 'board': return 'fa-layer-group';
      case 'my_tasks': return 'fa-list-check';
      case 'team_pool': return 'fa-inbox';
      case 'team_dashboard': return 'fa-people-group';
      case 'approvals': return 'fa-check-to-slot';
      case 'analytics': return 'fa-chart-pie';
      case 'monitoring': return 'fa-stopwatch';
      case 'phase_submit': return 'fa-code-branch';
      case 'comms': return 'fa-comments';
      case 'audit': return 'fa-file-shield';
      case 'manage': return 'fa-server';
      case 'new-project': return 'fa-plus';
      case 'admin': return 'fa-shield';
      case 'lead_dashboard': return 'fa-crown';
      default: return 'fa-circle';
    }
  };

  const getProjectTitle = (projectId) => {
    const proj = projectsList.find(p => p.id === projectId);
    return proj ? proj.title : projectId;
  };
  
  useEffect(() => {
    window.openTaskDetail = (id) => {
      setGlobalSelectedTaskId(Number(id));
    };
    window.openProjectDetail = (id) => {
      openTab('project:' + id, getProjectTitle(id), 'fa-folder', 'project', id);
    };
    window.openProjectDocument = (id) => {
      openTab('project_doc:' + id, '📄 Doc: ' + getProjectTitle(id), 'fa-file-lines', 'project_document', id);
    };
    window.navigateToTab = (tab) => {
      openTab(tab, getTabLabel(tab), getTabIcon(tab));
    };
    window.showToast = (msg) => {
      setToastMsg(msg);
      setTimeout(() => setToastMsg(null), 3000);
    };
    return () => {
      delete window.openTaskDetail;
      delete window.openProjectDetail;
      delete window.openProjectDocument;
      delete window.navigateToTab;
      delete window.showToast;
    };
  }, [tasksList, projectsList, openTabs]);
  
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'high-contrast') return 'light';
    if (saved) return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
    return 'dark';
  });
  const [highContrast, setHighContrast] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    const savedContrast = localStorage.getItem('high-contrast');
    if (savedTheme === 'high-contrast') return true;
    return savedContrast === 'true';
  });
  const [appName, setAppName] = useState('BI Project Manager');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-contrast', highContrast ? 'true' : 'false');
    localStorage.setItem('high-contrast', highContrast ? 'true' : 'false');
  }, [highContrast]);

  useEffect(() => {
    apiFetch('/api/config/app-name')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.app_name) {
          setAppName(data.app_name);
          document.title = data.app_name + " - Dashboard";
        }
      })
      .catch(() => {});
    
    window.updateGlobalAppName = (newName) => {
      setAppName(newName);
      document.title = newName + " - Dashboard";
    };
    
    return () => {
      delete window.updateGlobalAppName;
    };
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const toggleContrast = () => {
    setHighContrast(prev => !prev);
  };

  const fetchProjects = async () => { try { const res = await apiFetch('/api/projects'); if(res.ok) setProjectsList(await res.json()); } catch {} };
  const fetchUsers = async () => { try { const res = await apiFetch('/api/users'); if(res.ok) setUsersList(await res.json()); } catch {} };
  const fetchTasks = async () => {
    if (!currentUser) return;
    try {
      const res = await apiFetch('/api/tasks');
      if (res.ok) setTasksList(await res.json());
    } catch {}
  };
  const fetchAll = async () => { await Promise.all([fetchProjects(), fetchTasks(), fetchUsers()]); };

  useEffect(() => {
    apiFetch('/api/me').then(res => {
      if (res.ok) return res.json();
      throw new Error();
    }).then(async data => {
      await loadConfig();
      setCurrentUser(data);
      setAuthChecked(true);
    }).catch(() => setAuthChecked(true));
  }, []);

  const handleLogin = async (user) => { 
    await loadConfig();
    setCurrentUser(user); 
  };
  
  const handleLogout = async () => { 
    await apiFetch('/api/logout', { method: 'POST' });
    setCurrentUser(null); 
  };

  useEffect(() => { if (currentUser) { fetchAll(); } }, [currentUser]);
  useSmartPoll(() => { if (currentUser) fetchAll(); }, 30000, 120000, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;

    let ws;
    let reconnectTimeout;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('WebSocket state sync established.');
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          console.log('WebSocket update received:', payload);
          fetchAll();
        } catch (e) {
          console.error('Failed to parse WebSocket packet:', e);
        }
      };

      ws.onclose = () => {
        console.warn('WebSocket connection lost. Reconnecting in 3s...');
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error details:', err);
        ws.close();
      };
    };

    connect();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, [currentUser]);

  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') setSelectedProjectId(null); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (skipClose.current) {
        skipClose.current = false;
        return;
      }
      if (sidebarPinned && sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setSidebarPinned(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sidebarPinned]);

  const selectedProject = selectedProjectId ? projectsList.find(p => p.id === selectedProjectId) : null;
  const globalSelectedTask = globalSelectedTaskId ? tasksList.find(t => t.id === globalSelectedTaskId) : null;

  if (!authChecked) return html`<div style="padding:2rem;text-align:center;">Loading...</div>`;
  if (!currentUser) return html`<${LoginScreen} onLogin=${handleLogin} />`;

  const isLeaderOrAdmin = currentUser.role === 'admin' || currentUser.role === 'leader';
  const canReadProjects = hasPermission(currentUser, 'project.read') || hasPermission(currentUser, 'analytics.read_all');
  const canReadAnalytics = hasPermission(currentUser, 'analytics.read_team') || hasPermission(currentUser, 'analytics.read_all');
  const canApproveTasks = hasPermission(currentUser, 'task.approve') || hasPermission(currentUser, 'task.review_accept') || hasPermission(currentUser, 'task.review_finish');
  const canReadComms = hasPermission(currentUser, 'messages.read');
  const canReadAudit = hasPermission(currentUser, 'audit.read');
  const canAccessAdminPanel = hasPermission(currentUser, 'admin.panel');
  const canCreateTask = hasPermission(currentUser, 'task.create');
  const canSubmitPhase = hasPermission(currentUser, 'project.phase_submit');

  const getSidebarGroups = () => {
    const groups = [];
    const isProjectLeadOnAny = (projectsList || []).some(p => p.project_lead_id === currentUser.id);

    if (canReadProjects) {
      groups.push({
        heading: 'Projects',
        items: [
          { id: 'home', label: 'Home', icon: 'fa-house' },
          { id: 'dashboard', label: 'Dashboard', icon: 'fa-gauge-high' },
          { id: 'board', label: 'Pivot Board', icon: 'fa-layer-group' }
        ]
      });
    }
    if (hasPermission(currentUser, 'task.read')) {
      const items = [
        { id: 'my_tasks', label: 'My Tasks', icon: 'fa-list-check' },
        { id: 'team_pool', label: 'Team Pool', icon: 'fa-inbox' }
      ];
      if (canReadAnalytics && isLeaderOrAdmin) {
        items.push({ id: 'team_dashboard', label: 'Team Dash', icon: 'fa-people-group' });
      }
      if (isLeaderOrAdmin) {
        if (canApproveTasks || isProjectLeadOnAny) {
          items.push({ id: 'approvals', label: 'Approvals', icon: 'fa-check-to-slot' });
        }
      }
      groups.push({ heading: 'Tasks', items });
    }
    if (isProjectLeadOnAny) {
      groups.push({
        heading: 'Project Lead',
        items: [
          { id: 'lead_dashboard', label: 'My Lead Projects', icon: 'fa-crown' }
        ]
      });
    }
    if (canReadAnalytics || hasPermission(currentUser, 'analytics.read_own')) {
      const items = [
        { id: 'analytics', label: 'Analytics', icon: 'fa-chart-pie' },
        { id: 'monitoring', label: 'Monitoring', icon: 'fa-stopwatch' }
      ];
      if (canSubmitPhase) {
        items.push({ id: 'phase_submit', label: 'Projects', icon: 'fa-code-branch' });
      }
      groups.push({ heading: 'Analytics', items });
    }
    const sysItems = [];
    if (canReadComms) sysItems.push({ id: 'comms', label: 'Comms', icon: 'fa-comments' });
    if (canReadAudit) sysItems.push({ id: 'audit', label: 'Audit', icon: 'fa-file-shield' });
    if (hasPermission(currentUser, 'project.update')) sysItems.push({ id: 'manage', label: 'Manage', icon: 'fa-server' });
    if (hasPermission(currentUser, 'project.create')) sysItems.push({ id: 'new-project', label: 'New Project', icon: 'fa-plus' });
    if (canAccessAdminPanel) sysItems.push({ id: 'admin', label: 'Admin', icon: 'fa-shield' });
    if (sysItems.length > 0) {
      groups.push({ heading: 'System', items: sysItems });
    }
    return groups;
  };

  const favoriteItems = useMemo(() => {
    const allItems = getSidebarGroups().flatMap(g => g.items);
    return favorites.map(favId => allItems.find(item => item.id === favId)).filter(Boolean);
  }, [favorites, currentUser]);

  const getTabContent = (tab) => {
    const id = tab.id;
    const type = tab.type;
    
    if (type === 'project') {
      const proj = projectsList.find(p => p.id === tab.data);
      return html`<${ProjectDetailInline} project=${proj} currentUser=${currentUser} tasks=${tasksList} onClose=${() => closeTab(id)} onUpdate=${fetchProjects} />`;
    }
    
    if (type === 'project_document') {
      return html`<${ProjectDocumentView} projectId=${tab.data} currentUser=${currentUser} onClose=${() => closeTab(id)} />`;
    }
    
    switch (id) {
      case 'home':
        return html`<${RoleDashboard} currentUser=${currentUser} tasks=${tasksList} projects=${projectsList} users=${usersList} setActiveTab=${(tabName) => openTab(tabName, getTabLabel(tabName), getTabIcon(tabName))} openPhaseModal=${projectId => { setPreselectedPhaseProject(projectId || ''); setShowPhaseModal(true); }} />`;
      case 'dashboard':
        return html`<${Dashboard} projects=${projectsList} tasks=${tasksList} currentUser=${currentUser} />`;
      case 'board':
        return html`<${KanbanBoard} projects=${projectsList} tasks=${tasksList} viewMode=${boardView} setViewMode=${setBoardView} onProjectClick=${p => openTab('project:' + p.id, p.title, 'fa-folder', 'project', p.id)} onUpdate=${fetchTasks} currentUser=${currentUser} />`;
      case 'audit':
        return html`<${AuditLogTab} />`;
      case 'manage':
        return html`<${ProjectsManagementTab} projects=${projectsList} fetchProjects=${fetchProjects} setEditId=${projectId => openTab('project:' + projectId, getProjectTitle(projectId), 'fa-folder', 'project', projectId)} currentUser=${currentUser} />`;
      case 'new-project':
        return html`<${CreateProjectTab} onSave=${() => { fetchProjects(); closeTab('new-project'); openTab('dashboard', 'Dashboard', 'fa-gauge-high'); }} onCancel=${() => closeTab('new-project')} currentUser=${currentUser} />`;
      case 'admin':
        return html`<${AdminPanel} users=${usersList} fetchUsers=${fetchUsers} currentUser=${currentUser} />`;
      case 'my_tasks':
        return html`<${MyTasksView} tasks=${tasksList} projects=${projectsList} users=${usersList} fetchTasks=${fetchTasks} currentUser=${currentUser} />`;
      case 'team_pool':
        return html`<${TeamPoolView} tasks=${tasksList} projects=${projectsList} users=${usersList} fetchTasks=${fetchTasks} currentUser=${currentUser} />`;
      case 'team_dashboard':
        return html`<${TeamDashboardView} tasks=${tasksList} projects=${projectsList} users=${usersList} fetchTasks=${fetchTasks} currentUser=${currentUser} />`;
      case 'approvals':
        return html`<${ApprovalsView} tasks=${tasksList} projects=${projectsList} fetchTasks=${fetchTasks} currentUser=${currentUser} />`;
      case 'monitoring':
        return html`<${TaskMonitoringTab} tasks=${tasksList} projects=${projectsList} currentUser=${currentUser} />`;
      case 'phase_submit':
        return html`<${PhaseSubmissionTab} projects=${projectsList} tasks=${tasksList} currentUser=${currentUser} openPhaseModal=${projectId => { setPreselectedPhaseProject(projectId || ''); setShowPhaseModal(true); }} />`;
      case 'analytics':
        return html`<${ProjectAnalyticsTab} projects=${projectsList} tasks=${tasksList} currentUser=${currentUser} />`;
      case 'comms':
        return html`<${CommunicationsTab} currentUser=${currentUser} tasks=${tasksList} projects=${projectsList} />`;
      case 'lead_dashboard':
        return html`<${ProjectLeadDashboard} projects=${projectsList} tasks=${tasksList} users=${usersList} currentUser=${currentUser} fetchTasks=${fetchTasks} fetchProjects=${fetchProjects} setActiveTab=${(tabName) => openTab(tabName, getTabLabel(tabName), getTabIcon(tabName))} openTab=${openTab} />`;
      default:
        return html`<div style="padding:2rem;">Tab content not found: ${id}</div>`;
    }
  };

  const isExpanded = sidebarPinned;

  return html`
    <div class="app-shell">
      <aside class="sidebar ${isExpanded ? 'expanded' : ''}" ref=${sidebarRef}>
        <!-- Hamburger Toggle Button at absolute top-left -->
        <button class="sidebar-toggle-btn" 
          onClick=${() => { skipClose.current = true; setSidebarPinned(!sidebarPinned); }} 
          title=${sidebarPinned ? "Unpin Menu" : "Pin Menu"}>
          <i class="fa-solid fa-bars"></i>
        </button>
        <div class="sidebar-nav">
          <div class="sidebar-group">
            <div class="sidebar-group-header" style="display:flex; justify-content:space-between; align-items:center; width:100%; padding-right:0.5rem; gap:0.5rem;">
              <span>★ Favorites</span>
              ${isExpanded && html`
                <button type="button" onClick=${(e) => { e.stopPropagation(); setEditFavorites(!editFavorites); }} 
                  style="background:transparent; border:none; color:${editFavorites ? 'var(--accent-yellow)' : 'var(--text-secondary)'}; cursor:pointer; font-size:0.85rem; padding:0; display:flex; align-items:center;"
                  title=${editFavorites ? "Done Editing" : "Edit Favorites"}>
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
              `}
            </div>
            ${favoriteItems.length === 0 
              ? (isExpanded && html`<div style="font-size:0.72rem;color:var(--text-secondary);padding:0.5rem 1rem;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="No favorites yet">No favorites yet</div>`)
              : favoriteItems.map(item => html`
                <div class="sidebar-item ${activeTabId === item.id ? 'active' : ''}" onClick=${() => openTab(item.id, item.label, item.icon)}>
                  <i class="fa-solid ${item.icon}"></i>
                  <span class="label">${item.label}</span>
                  ${!isExpanded && html`<div class="sidebar-tooltip">${item.label}</div>`}
                  ${editFavorites && html`
                    <button class="sidebar-pin-btn pinned" onClick=${(e) => { e.stopPropagation(); toggleFavorite(item.id); }}>
                      <i class="fa-solid fa-star"></i>
                    </button>
                  `}
                </div>
              `)
            }
          </div>
          
          <div style="height:1px;background:rgba(255,255,255,0.05);margin:0.5rem 0;"></div>
          
          ${getSidebarGroups().map(group => html`
            <div class="sidebar-group">
              <div class="sidebar-group-header">
                <span>${group.heading}</span>
              </div>
              ${group.items.map(item => {
                const isPinned = favorites.includes(item.id);
                return html`
                  <div class="sidebar-item ${activeTabId === item.id ? 'active' : ''}" onClick=${() => openTab(item.id, item.label, item.icon)}>
                    <i class="fa-solid ${item.icon}"></i>
                    <span class="label">${item.label}</span>
                    ${!isExpanded && html`<div class="sidebar-tooltip">${item.label}</div>`}
                    ${isExpanded && (editFavorites || isPinned) && html`
                      <button class="sidebar-pin-btn ${isPinned ? 'pinned' : ''}" onClick=${(e) => { e.stopPropagation(); toggleFavorite(item.id); }} title=${isPinned ? "Remove from Favorites" : "Add to Favorites"}>
                        <i class="fa-solid fa-star"></i>
                      </button>
                    `}
                  </div>
                `;
              })}
            </div>
          `)}
        </div>
      </aside>
      
      <div class="content-shell">
        <header class="content-header">
          <div class="content-header-top">
            <!-- Brand name outside drawer -->
            <span style="font-weight:800;font-size:0.98rem;color:var(--text-primary);white-space:nowrap;display:flex;align-items:center;gap:0.4rem;cursor:pointer;margin-right:1rem;" 
              onClick=${() => openTab('home', 'Home', 'fa-house')}>
              <i class="fa-solid fa-chart-network" style="color:var(--accent-blue);"></i>
              ${appName}
            </span>
            
            <div class="user-strip">
              ${canCreateTask && html`
                <button class="btn active" style="background:var(--accent-green);font-size:0.78rem;padding:0.35rem 0.75rem;"
                  onClick=${() => setShowTaskModal(true)} title="New Task (Global)">
                  <i class="fa-solid fa-plus"></i> Task
                </button>
              `}
              ${canSubmitPhase && html`
                <button class="btn active" style="background:var(--accent-purple);font-size:0.78rem;padding:0.35rem 0.75rem;"
                  onClick=${() => { setPreselectedPhaseProject(''); setShowPhaseModal(true); }} title="Submit Phase">
                  <i class="fa-solid fa-code-branch"></i> Phase
                </button>
              `}
              <button class="btn" style="padding:0.35rem 0.6rem;background:transparent;border:1px solid rgba(255,255,255,0.15);"
                onClick=${toggleTheme} title=${theme === 'dark' ? "Switch to Light Theme" : "Switch to Dark Theme"}>
                <i class="fa-solid ${theme === 'dark' ? 'fa-moon' : 'fa-sun'}"></i>
              </button>
              <button class="btn ${highContrast ? 'active' : ''}" style="padding:0.35rem 0.6rem;border:1px solid rgba(255,255,255,0.15);${highContrast ? 'background:var(--accent-blue);color:white;' : 'background:transparent;'}"
                onClick=${toggleContrast} title=${highContrast ? "Disable High Contrast" : "Enable High Contrast (Accessibility)"}>
                <i class="fa-solid fa-universal-access"></i>
              </button>
              <${NotificationBell} currentUser=${currentUser} />
              <div style="line-height:1.2;font-size:0.82rem;text-align:right;">
                <div><strong>${currentUser.username}</strong></div>
                <div style="font-size:0.68rem;text-transform:uppercase;opacity:0.7;">${currentUser.role}</div>
              </div>
              <button class="btn" style="padding:0.35rem 0.6rem;background:transparent;border:1px solid rgba(255,255,255,0.15);"
                onClick=${handleLogout} title="Log Out">
                <i class="fa-solid fa-right-from-bracket"></i>
              </button>
            </div>
          </div>
          <div style="display:flex; align-items:flex-end; width:100%;">
            <div class="tab-bar" style="margin-right:0.5rem;">
              ${openTabs.map(tab => html`
                <div class="tab-pill ${activeTabId === tab.id ? 'active' : ''} ${tab.pinned ? 'pinned' : ''}" 
                  onClick=${() => setActiveTabId(tab.id)} 
                  onContextMenu=${(e) => handleTabContextMenu(e, tab.id)}
                  title=${tab.type === 'project' ? `Project: ${tab.label} (ID: ${tab.data})` : tab.label}>
                  <i class="fa-solid ${tab.icon}" style="font-size:0.75rem;"></i>
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:110px;">${tab.label}</span>
                  ${tab.pinned ? html`
                    <span class="tab-pin-icon" style="margin-left:0.25rem; font-size:0.68rem; opacity:0.8; color: var(--accent-blue);" title="Pinned Tab">
                      <i class="fa-solid fa-thumbtack"></i>
                    </span>
                  ` : html`
                    <button class="tab-close" onClick=${(e) => { e.stopPropagation(); closeTab(tab.id); }} title="Close Tab">
                      <i class="fa-solid fa-xmark"></i>
                    </button>
                  `}
                </div>
              `)}
            </div>
            <div style="align-self:center; display:flex; align-items:center; padding:0.25rem 0.75rem; font-size:0.72rem; font-weight:700; color:${openTabs.length >= 9 ? 'var(--accent-pink)' : 'var(--text-secondary)'}; gap:0.25rem; white-space:nowrap; margin-bottom:2px;" title="Open Tabs limit: 10 max">
              <i class="fa-solid fa-folder-tree"></i>
              <span>${openTabs.length}/10</span>
            </div>
          </div>
        </header>
        
        <main class="content-area">
          ${openTabs.map(tab => {
            const isTabActive = activeTabId === tab.id;
            return html`
              <div key=${tab.id} style="display:${isTabActive ? 'block' : 'none'};">
                ${getTabContent(tab)}
              </div>
            `;
          })}
        </main>
      </div>
      
      <${ProjectModal} project=${selectedProject} currentUser=${currentUser} tasks=${tasksList} onClose=${() => setSelectedProjectId(null)} onUpdate=${fetchProjects} />
      <${AppDialogHost} />
      
      <${TaskFocusModal}
        open=${showTaskModal}
        onClose=${() => setShowTaskModal(false)}
        projects=${projectsList}
        currentUser=${currentUser}
        editingTask=${null}
        users=${usersList}
        onSaved=${fetchTasks}
      />
      <${TaskFocusModal}
        open=${Boolean(globalSelectedTaskId)}
        onClose=${() => setGlobalSelectedTaskId(null)}
        projects=${projectsList}
        currentUser=${currentUser}
        editingTask=${globalSelectedTask}
        users=${usersList}
        onSaved=${async () => { await fetchTasks(); setGlobalSelectedTaskId(null); }}
      />
      <${PhaseSubmitModal}
        open=${showPhaseModal}
        onClose=${() => setShowPhaseModal(false)}
        projects=${projectsList}
        tasks=${tasksList}
        currentUser=${currentUser}
        onSaved=${async () => {
          await fetchProjects();
          if (activeTabId === 'phase_submit') {
            window.showToast ? window.showToast("Phase submitted successfully! Closing tab...") : null;
            setTimeout(() => closeTab('phase_submit'), 3000);
          }
        }}
        preselectedProjectId=${preselectedPhaseProject}
      />
      ${contextMenu && html`
        <div class="tab-context-menu" style=${`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}>
          <button class="tab-context-menu-item" onClick=${() => { toggleTabPin(contextMenu.tabId); setContextMenu(null); }}>
            <i class="fa-solid fa-thumbtack"></i>
            <span>${openTabs.find(t => t.id === contextMenu.tabId)?.pinned ? 'Unpin Tab' : 'Pin Tab'}</span>
          </button>
          <button class="tab-context-menu-item" disabled=${openTabs.find(t => t.id === contextMenu.tabId)?.pinned} onClick=${() => { closeTab(contextMenu.tabId); setContextMenu(null); }}>
            <i class="fa-solid fa-xmark"></i>
            <span>Close Tab</span>
          </button>
          <button class="tab-context-menu-item" onClick=${() => { closeOtherTabs(contextMenu.tabId); setContextMenu(null); }}>
            <i class="fa-solid fa-clone"></i>
            <span>Close Others</span>
          </button>
          <button class="tab-context-menu-item" onClick=${() => { closeAllTabs(); setContextMenu(null); }}>
            <i class="fa-solid fa-square-xmark"></i>
            <span>Close All Tabs</span>
          </button>
        </div>
      `}
      ${toastMsg && html`
        <div class="premium-toast">
          <i class="fa-solid fa-circle-check" style="color:var(--accent-green);"></i>
          <span>${toastMsg}</span>
        </div>
      `}
    </div>
  `;
};



