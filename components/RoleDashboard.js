import { apiFetch, getInitials, getPhaseClass, calculateOverallProgress, getHealthStatus, hasPermission } from '../utils/core.js';
import { FocusModal } from './FocusModal.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

/* ─────────────────────────────────────────────────────────────────
   GLOBAL ROLE DEFAULTS FOR WIDGETS AND THEIR SEQUENCE
   ───────────────────────────────────────────────────────────────── */
const MEMBER_DEFAULTS = {
  widgets: {
    overdue_alert: true,
    kpi_strip: true,
    pending_acceptance: true,
    active_tasks: true,
    my_projects: true,
    in_review: true,
    task_velocity: false,
    shortcuts: true
  },
  widgetOrder: ['overdue_alert', 'kpi_strip', 'pending_acceptance', 'active_tasks', 'my_projects', 'in_review', 'task_velocity', 'shortcuts']
};

const LEADER_DEFAULTS = {
  widgets: {
    sla_warnings: true,
    kpi_strip: true,
    creation_requests: true,
    review_queue: true,
    team_members: true,
    team_projects: true,
    shortcuts: true
  },
  widgetOrder: ['sla_warnings', 'kpi_strip', 'creation_requests', 'review_queue', 'team_members', 'team_projects', 'shortcuts']
};

const ADMIN_DEFAULTS = {
  widgets: {
    sla_warnings: true,
    quick_actions: true,
    kpi_strip: true,
    portfolio_health: true,
    user_overview: true,
    shortcuts: true
  },
  widgetOrder: ['sla_warnings', 'quick_actions', 'kpi_strip', 'portfolio_health', 'user_overview', 'shortcuts']
};

/* ─────────────────────────────────────────────────────────────────
   SLA BREACH WARNINGS — shared alert banner/cards for Admin and Leader
   ───────────────────────────────────────────────────────────────── */
const SLABreachWarnings = ({ currentUser, projects }) => {
  const [breaches, setBreaches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const loadBreaches = async () => {
      try {
        const res = await apiFetch('/api/sla/breaches');
        if (res.ok) {
          const data = await res.json();
          if (active) {
            const filtered = data.filter(b => {
              if (hasPermission(currentUser, 'admin.panel')) return true;
              if (hasPermission(currentUser, 'task.approve')) return b.team === currentUser.team;
              return false;
            });
            setBreaches(filtered);
            setLoading(false);
          }
        } else {
          if (active) setLoading(false);
        }
      } catch (err) {
        console.error('Error fetching SLA breaches:', err);
        if (active) setLoading(false);
      }
    };

    loadBreaches();
    const interval = setInterval(loadBreaches, 60000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [currentUser]);

  if (loading) {
    return html`
      <div class="metric-card" style="margin-bottom:1.5rem;padding:1.5rem;text-align:center;">
        <span style="color:var(--text-secondary);font-size:0.85rem;">
          <i class="fa-solid fa-spinner fa-spin" style="margin-right:0.5rem;color:var(--accent-pink);"></i>
          Loading active SLA status...
        </span>
      </div>`;
  }

  if (breaches.length === 0) return null;

  return html`
    <div class="metric-card" style="margin-bottom:1.5rem;border-left:4px solid var(--accent-pink);background:linear-gradient(135deg, rgba(236,72,153,0.06), rgba(236,72,153,0.01));">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem;">
        <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:var(--accent-pink);display:flex;align-items:center;gap:0.4rem;">
          <i class="fa-solid fa-triangle-exclamation"></i>
          Active SLA Breaches & Warnings (${breaches.length})
        </h3>
        <span style="font-size:0.7rem;color:var(--text-secondary);">Escalation notifications active</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:0.75rem;">
        ${breaches.map(b => {
          const isBreach = b.sla_status === 'breach';
          const badgeColor = isBreach ? 'var(--accent-pink)' : 'var(--accent-orange)';
          const badgeBg = isBreach ? 'rgba(236,72,153,0.12)' : 'rgba(245,158,11,0.12)';
          const borderStyle = isBreach ? '1px solid rgba(236,72,153,0.25)' : '1px solid rgba(245,158,11,0.25)';

          return html`
            <div class="task-card-unified"
                 style="border-left: 4px solid ${badgeColor};"
                 onClick=${() => window.openTaskDetail && window.openTaskDetail(b.id)}>
              <div>
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
                  <div style="font-weight:700;font-size:0.88rem;color:var(--text-primary);line-height:1.3;">${b.title}</div>
                  <span style="font-size:0.62rem;font-weight:800;color:${badgeColor};background:${badgeBg};padding:0.15rem 0.4rem;border-radius:6px;text-transform:uppercase;letter-spacing:0.04em;flex-shrink:0;">
                    ${b.sla_status}
                  </span>
                </div>
                <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.4rem;">
                  Assignee: <strong style="color:var(--text-primary);">${b.assignee || 'Unassigned'}</strong>
                </div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.85rem;padding-top:0.6rem;border-top:1px solid var(--border-color);font-size:0.68rem;color:var(--text-secondary);">
                <span class="tag ${getPhaseClass(b.crisp_dm_phase)}" style="font-size:0.62rem;">${b.crisp_dm_phase}</span>
                ${b.due_date && html`<span style="color:var(--accent-pink);font-weight:600;"><i class="fa-regular fa-clock" style="margin-right:0.25rem;"></i>Due ${b.due_date}</span>`}
              </div>
            </div>`;
        })}
      </div>
    </div>`;
};

/* ─────────────────────────────────────────────────────────────────
   SHORTCUTS MANAGER — shared quick links widget
   ───────────────────────────────────────────────────────────────── */
export const ShortcutsManager = ({ currentUser, dbConfig, saveConfig, teamsList }) => {
  const [publishedShortcuts, setPublishedShortcuts] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  
  // Add form fields (supports multiple links)
  const [type, setType] = useState('personal'); 
  const [teamName, setTeamName] = useState(teamsList && teamsList.length > 0 ? teamsList[0] : '');
  const [links, setLinks] = useState([{ title: '', url: '', icon: 'fa-solid fa-link' }]);

  const isAdmin = hasPermission(currentUser, 'admin.panel');
  const isLeader = hasPermission(currentUser, 'task.approve');

  const fetchPublished = async () => {
    try {
      const res = await apiFetch('/api/shortcuts/published');
      if (res.ok) {
        setPublishedShortcuts(await res.json());
      }
    } catch (e) {
      console.error("Error fetching published shortcuts:", e);
    }
  };

  useEffect(() => {
    fetchPublished();
  }, []);

  const handleAdd = async (e) => {
    if (e) e.preventDefault();
    if (links.some(lnk => !lnk.title || !lnk.url)) return;

    if (type === 'personal') {
      const personal = dbConfig.personal_shortcuts || [];
      const newShortcuts = links.map((lnk, idx) => ({
        id: 'pers_' + Date.now() + '_' + idx,
        title: lnk.title,
        url: /^https?:\/\//i.test(lnk.url) ? lnk.url : 'http://' + lnk.url,
        icon: lnk.icon
      }));
      const updated = {
        ...dbConfig,
        personal_shortcuts: [...personal, ...newShortcuts]
      };
      await saveConfig(updated);
    } else {
      try {
        const promises = links.map(lnk => {
          const finalUrl = /^https?:\/\//i.test(lnk.url) ? lnk.url : 'http://' + lnk.url;
          const body = {
            title: lnk.title,
            url: finalUrl,
            icon: lnk.icon,
            team: type === 'global' ? 'Global' : teamName
          };
          return apiFetch('/api/shortcuts/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
        });
        await Promise.all(promises);
        fetchPublished();
      } catch (err) {
        console.error("Error publishing shortcuts:", err);
      }
    }
    
    // Reset fields
    setLinks([{ title: '', url: '', icon: 'fa-solid fa-link' }]);
    setShowAddModal(false);
  };

  const handleDeletePersonal = async (id) => {
    const personal = dbConfig.personal_shortcuts || [];
    const updated = {
      ...dbConfig,
      personal_shortcuts: personal.filter(s => s.id !== id)
    };
    await saveConfig(updated);
  };

  const handleDeletePublished = async (id) => {
    try {
      const res = await apiFetch(`/api/shortcuts/published/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchPublished();
      }
    } catch (e) {
      console.error("Error deleting shared shortcut:", e);
    }
  };

  const addLinkRow = () => {
    setLinks([...links, { title: '', url: '', icon: 'fa-solid fa-link' }]);
  };

  const removeLinkRow = (index) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const updateLinkRow = (index, field, value) => {
    setLinks(links.map((lnk, i) => i === index ? { ...lnk, [field]: value } : lnk));
  };

  const getIconClass = (iconName) => {
    if (!iconName) return 'fa-solid fa-link';
    if (iconName.startsWith('fa-solid ') || iconName.startsWith('fa-brands ') || iconName.startsWith('fa-regular ')) {
      return iconName;
    }
    if (['github', 'slack', 'jira', 'confluence', 'figma'].some(x => iconName.includes(x))) {
      return `fa-brands ${iconName}`;
    }
    return `fa-solid ${iconName}`;
  };

  const personalList = dbConfig.personal_shortcuts || [];

  return html`
    <!-- Floating Trigger Button -->
    <button 
      class="floating-shortcut-btn" 
      onClick=${() => setPanelOpen(!panelOpen)}
      title="Quick Shortcuts"
      style="${panelOpen ? 'transform: scale(1.1) rotate(45deg);' : ''}"
    >
      <i class="fa-solid ${panelOpen ? 'fa-xmark' : 'fa-link'}"></i>
    </button>

    <!-- Floating Shortcuts Panel -->
    ${panelOpen && html`
      <div class="floating-shortcut-panel">
        <div class="floating-shortcut-header">
          <h3 style="margin:0;font-size:0.95rem;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:0.4rem;">
            <i class="fa-solid fa-link" style="color:var(--accent-blue);"></i>
            Quick Shortcuts
          </h3>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <button class="btn active" style="padding:0.3rem 0.6rem;font-size:0.75rem;background:var(--accent-blue);color:#ffffff;border:none;" onClick=${() => setShowAddModal(true)}>
              <i class="fa-solid fa-plus"></i> Add
            </button>
            <button style="background:transparent;border:none;color:var(--text-secondary);cursor:pointer;font-size:1rem;" onClick=${() => setPanelOpen(false)}>
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <div class="floating-shortcut-body">
          <!-- Personal shortcuts -->
          <div>
            <h4 style="font-size:0.8rem;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.75rem;letter-spacing:0.04em;">My Shortcuts (${personalList.length})</h4>
            ${personalList.length === 0 ? html`
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem 1rem;background:rgba(255,255,255,0.01);border:1px dashed var(--border-color);border-radius:10px;text-align:center;color:var(--text-secondary);">
                <i class="fa-solid fa-link-slash" style="font-size:1.2rem;margin-bottom:0.5rem;opacity:0.4;"></i>
                <span style="font-size:0.75rem;">No personal shortcuts yet.</span>
              </div>
            ` : html`
              <div style="display:flex;flex-direction:column;gap:0.5rem;">
                ${personalList.map(s => html`
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:10px;" class="task-card-clickable" key=${s.id}>
                    <a href=${s.url} target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:0.5rem;text-decoration:none;color:var(--text-primary);font-size:0.82rem;font-weight:600;min-width:0;flex:1;">
                      <i class=${getIconClass(s.icon)} style="color:var(--accent-blue);flex-shrink:0;font-size:0.95rem;"></i>
                      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.title}</span>
                    </a>
                    <button onClick=${() => handleDeletePersonal(s.id)} style="background:none;border:none;color:var(--accent-pink);cursor:pointer;padding:0.2rem;font-size:0.75rem;display:flex;align-items:center;justify-content:center;" title="Delete Personal Shortcut">
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  </div>
                `)}
              </div>
            `}
          </div>

          <!-- Shared Published shortcuts -->
          <div>
            <h4 style="font-size:0.8rem;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.75rem;letter-spacing:0.04em;">Shared Shortcuts (${publishedShortcuts.length})</h4>
            ${publishedShortcuts.length === 0 ? html`
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem 1rem;background:rgba(255,255,255,0.01);border:1px dashed var(--border-color);border-radius:10px;text-align:center;color:var(--text-secondary);">
                <i class="fa-solid fa-folder-open" style="font-size:1.2rem;margin-bottom:0.5rem;opacity:0.4;"></i>
                <span style="font-size:0.75rem;">No shared shortcuts yet.</span>
              </div>
            ` : html`
              <div style="display:flex;flex-direction:column;gap:0.5rem;">
                ${publishedShortcuts.map(s => {
                  const isGlobal = !s.team_id;
                  const badgeText = isGlobal ? 'Global' : 'Team';
                  const badgeBg = isGlobal ? 'rgba(59,130,246,0.12)' : 'rgba(16,185,129,0.12)';
                  const badgeColor = isGlobal ? 'var(--accent-blue)' : 'var(--accent-green)';
                  const canDelete = isAdmin || (isLeader && s.team_id);
                  return html`
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:10px;" class="task-card-clickable" key=${s.id}>
                      <a href=${s.url} target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:0.5rem;text-decoration:none;color:var(--text-primary);font-size:0.82rem;font-weight:600;min-width:0;flex:1;">
                        <i class=${getIconClass(s.icon)} style="color:var(--accent-purple);flex-shrink:0;font-size:0.95rem;"></i>
                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.title}</span>
                      </a>
                      <div style="display:flex;align-items:center;gap:0.35rem;flex-shrink:0;">
                        <span style=${`font-size:0.58rem;font-weight:700;color:${badgeColor};background:${badgeBg};padding:0.1rem 0.3rem;border-radius:4px;`}>
                          ${badgeText}
                        </span>
                        ${canDelete && html`
                          <button onClick=${() => handleDeletePublished(s.id)} style="background:none;border:none;color:var(--accent-pink);cursor:pointer;padding:0.15rem;font-size:0.75rem;display:flex;align-items:center;justify-content:center;" title="Delete Shared Shortcut">
                            <i class="fa-solid fa-trash-can"></i>
                          </button>
                        `}
                      </div>
                    </div>
                  `;
                })}
              </div>
            `}
          </div>
        </div>
      </div>
    `}

    <!-- Add Modal (Supports Multiple Links) -->
    <${FocusModal}
      open=${showAddModal}
      onClose=${() => setShowAddModal(false)}
      title="Add Quick Shortcuts"
      subtitle="Create personal or team/global shared links"
      icon="fa-link"
      accentColor="var(--accent-blue)"
      footer=${html`
        <button type="button" class="btn" style="background:transparent;border:1px solid var(--border-color);color:var(--text-secondary);" onClick=${() => setShowAddModal(false)}>Cancel</button>
        <button type="submit" form="add-shortcut-form" class="btn active" style="background:var(--accent-blue);">Add Shortcuts</button>
      `}
      maxWidth="760px"
    >
      <form id="add-shortcut-form" onSubmit=${handleAdd} style="display:flex;flex-direction:column;gap:1.25rem;padding:0.5rem 0;">
        
        <!-- Scope selector at the top -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;background:rgba(255,255,255,0.02);padding:1rem;border:1px solid var(--border-color);border-radius:10px;">
          <div style="display:flex;flex-direction:column;gap:0.4rem;">
            <label style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);">Publish Scope</label>
            <select class="form-select" style="width:100%;" value=${type} onChange=${e => setType(e.target.value)}>
              <option value="personal">Personal (Just Me)</option>
              ${hasPermission(currentUser, 'admin.panel') && html`<option value="global">Global Shared (All Users)</option>`}
              ${(hasPermission(currentUser, 'admin.panel') || hasPermission(currentUser, 'task.approve')) && html`<option value="team">Team Shared</option>`}
            </select>
          </div>
          
          ${type === 'team' ? html`
            <div style="display:flex;flex-direction:column;gap:0.4rem;">
              <label style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);">Target Team</label>
              <select class="form-select" style="width:100%;" value=${teamName} onChange=${e => setTeamName(e.target.value)}>
                ${(teamsList || []).map(t => html`<option value=${t}>${t}</option>`)}
              </select>
            </div>
          ` : html`
            <div style="display:flex;align-items:center;color:var(--text-secondary);font-size:0.78rem;padding-top:1.2rem;">
              <i class="fa-solid fa-circle-info" style="margin-right:0.4rem;color:var(--accent-blue);"></i>
              ${type === 'personal' ? 'Available only to your account.' : 'Available to all platform users.'}
            </div>
          `}
        </div>

        <!-- Shortcuts list -->
        <div style="display:flex;flex-direction:column;gap:0.75rem;max-height:40vh;overflow-y:auto;padding-right:0.25rem;">
          <label style="font-size:0.8rem;font-weight:700;color:var(--text-primary);margin-bottom:0.25rem;display:flex;justify-content:space-between;align-items:center;">
            <span>Links List</span>
            <span style="font-size:0.7rem;font-weight:400;color:var(--text-secondary);">${links.length} link(s)</span>
          </label>
          
          ${links.map((lnk, idx) => html`
            <div style="display:grid;grid-template-columns:1.2fr 2fr 1.2fr auto;gap:0.75rem;align-items:center;background:rgba(255,255,255,0.02);padding:0.75rem;border:1px solid var(--border-color);border-radius:10px;" key=${idx}>
              <div style="display:flex;flex-direction:column;gap:0.3rem;">
                <input type="text" class="form-input" style="width:100%;font-size:0.82rem;" required 
                  value=${lnk.title} 
                  onInput=${e => updateLinkRow(idx, 'title', e.target.value)} 
                  placeholder="Title (e.g. Slack)" />
              </div>
              
              <div style="display:flex;flex-direction:column;gap:0.3rem;">
                <input type="text" class="form-input" style="width:100%;font-size:0.82rem;" required 
                  value=${lnk.url} 
                  onInput=${e => updateLinkRow(idx, 'url', e.target.value)} 
                  placeholder="URL (e.g. https://slack.com/chan)" />
              </div>

              <div style="display:flex;flex-direction:column;gap:0.3rem;">
                <select class="form-select" style="width:100%;font-size:0.82rem;padding-top:0.35rem;padding-bottom:0.35rem;" 
                  value=${lnk.icon} 
                  onChange=${e => updateLinkRow(idx, 'icon', e.target.value)}>
                  <option value="fa-solid fa-link">🔗 Link Chain</option>
                  <option value="fa-solid fa-chart-line">📈 Metrics Chart</option>
                  <option value="fa-solid fa-book">📖 Documentation</option>
                  <option value="fa-solid fa-envelope">✉️ Email / Comms</option>
                  <option value="fa-brands fa-github">GitHub Logo</option>
                  <option value="fa-brands fa-slack">Slack Logo</option>
                  <option value="fa-brands fa-jira">Jira Logo</option>
                  <option value="fa-brands fa-confluence">Confluence Logo</option>
                  <option value="fa-brands fa-figma">Figma Logo</option>
                  <option value="fa-solid fa-chart-pie">📊 Tableau / PowerBI</option>
                  <option value="fa-solid fa-table">📅 Excel / Sheets</option>
                  <option value="fa-solid fa-database">🗄️ Database</option>
                  <option value="fa-solid fa-server">🖥️ Server Status</option>
                </select>
              </div>

              <button type="button" class="btn" 
                disabled=${links.length === 1}
                style="background:transparent;border:none;color:${links.length === 1 ? 'var(--text-muted)' : 'var(--accent-pink)'};cursor:${links.length === 1 ? 'not-allowed' : 'pointer'};padding:0.4rem;display:flex;align-items:center;justify-content:center;opacity:${links.length === 1 ? '0.4' : '1'};" 
                onClick=${() => removeLinkRow(idx)}
                title="Remove Row">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          `)}
        </div>

        <button type="button" class="btn" style="background:transparent;border:1px dashed var(--accent-blue);color:var(--accent-blue);width:100%;padding:0.6rem;font-size:0.8rem;font-weight:600;display:flex;align-items:center;justify-content:center;gap:0.4rem;border-radius:10px;" 
          onClick=${addLinkRow}>
          <i class="fa-solid fa-plus"></i> Add Another Link
        </button>
      </form>
    </${FocusModal}>
  `;
};

/* ─────────────────────────────────────────────────────────────────
   MEMBER HOME — focused personal task view + quick stats
   ───────────────────────────────────────────────────────────────── */
const MemberHome = ({ currentUser, tasks, projects, setActiveTab, dbConfig, saveConfig, teamsList }) => {
  const [showSettings, setShowSettings] = useState(false);
  const [velocityDays, setVelocityDays] = useState(7);

  const widgets = dbConfig.widgets || MEMBER_DEFAULTS.widgets;
  const widgetOrder = dbConfig.widgetOrder || MEMBER_DEFAULTS.widgetOrder;

  const toggleWidget = (key) => {
    const updatedWidgets = { ...widgets, [key]: !widgets[key] };
    saveConfig({
      ...dbConfig,
      widgets: updatedWidgets
    });
  };

  const moveWidget = (index, direction) => {
    const newOrder = [...widgetOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    saveConfig({
      ...dbConfig,
      widgetOrder: newOrder
    });
  };

  const resetDefaults = () => {
    saveConfig({
      ...dbConfig,
      widgets: MEMBER_DEFAULTS.widgets,
      widgetOrder: MEMBER_DEFAULTS.widgetOrder
    });
  };

  const myTasks = useMemo(() =>
    (tasks || []).filter(t => t.assignee === currentUser.username),
    [tasks, currentUser]);

  const todo      = myTasks.filter(t => t.status === 'todo');
  const inProg    = myTasks.filter(t => t.status === 'in_progress');
  const inReview  = myTasks.filter(t => t.status === 'review');
  const done      = myTasks.filter(t => t.status === 'done');
  const overdue   = myTasks.filter(t => t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date());

  const StatCard = ({ label, value, color, icon, tab }) => html`
    <div class="bento-card" style="cursor:${tab?'pointer':'default'};text-align:center;padding:1.25rem 1rem;"
      onClick=${tab ? () => setActiveTab(tab) : undefined}>
      <div class="metric-value" style="color:${color};line-height:1;">${value}</div>
      <div class="metric-label" style="margin-top:0.4rem;">
        <i class="fa-solid ${icon}" style="margin-right:0.3rem;"></i>${label}
      </div>
    </div>`;

  // Calculate velocity data dynamically
  const completedTasks = myTasks.filter(t => t.status === 'done' && t.resolved_at);
  const daysArray = Array.from({ length: velocityDays }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().slice(0, 10);
  }).reverse();

  const velocityData = daysArray.map(dateStr => {
    const count = completedTasks.filter(t => t.resolved_at.startsWith(dateStr)).length;
    const d = new Date(dateStr + 'T00:00:00');
    const label = velocityDays > 7 
      ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : d.toLocaleDateString('en-US', { weekday: 'short' });
    return { dateStr, label, count };
  });

  const maxCount = Math.max(...velocityData.map(d => d.count), 1);

  const exportVelocityCSV = () => {
    const headers = 'Date,Completed Tasks Count\n';
    const rows = velocityData.map(d => `${d.dateStr},${d.count}`).join('\n');
    const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(headers + rows);
    const link = document.createElement('a');
    link.setAttribute('href', csvContent);
    link.setAttribute('download', `task_velocity_${velocityDays}_days.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const pendingAcceptanceTasks = myTasks.filter(t => t.acceptance_status === 'pending_acceptance' && t.status !== 'review');
  const inReviewTasks = myTasks.filter(t => t.status === 'review');

  const renderWidget = (key) => {
    if (!widgets[key]) return null;

    switch (key) {
      case 'overdue_alert':
        return overdue.length > 0 ? html`
          <div style="background:linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05));border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:1rem 1.25rem;margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between;animation:pulseBorder 2s infinite alternate;">
            <div style="display:flex;align-items:center;gap:0.75rem;">
              <div style="width:36px;height:36px;border-radius:50%;background:rgba(239,68,68,0.2);display:flex;align-items:center;justify-content:center;color:var(--accent-orange);">
                <i class="fa-solid fa-triangle-exclamation" style="font-size:1.1rem;"></i>
              </div>
              <div>
                <div style="font-weight:700;font-size:0.95rem;color:var(--text-primary);">Attention: You have ${overdue.length} overdue task${overdue.length > 1 ? 's' : ''}!</div>
                <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.15rem;">Please review and update the due dates or submit them for review to keep the project on track.</div>
              </div>
            </div>
            <button class="btn" style="background:rgba(239,68,68,0.2);color:white;border:1px solid rgba(239,68,68,0.4);" onClick=${() => setActiveTab('my_tasks')}>
              View Tasks
            </button>
          </div>
        ` : null;

      case 'kpi_strip':
        return html`
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;margin-bottom:1.5rem;">
            <${StatCard} label="To Do"      value=${todo.length}     color="var(--text-secondary)"  icon="fa-circle"         tab="my_tasks" />
            <${StatCard} label="In Progress" value=${inProg.length}   color="var(--accent-blue)"     icon="fa-bolt"           tab="my_tasks" />
            <${StatCard} label="In Review"   value=${inReview.length} color="var(--accent-purple)"   icon="fa-magnifying-glass" tab="my_tasks" />
            <${StatCard} label="Done"        value=${done.length}     color="var(--accent-green)"    icon="fa-circle-check"   tab="my_tasks" />
            <${StatCard} label="Overdue"     value=${overdue.length}  color="var(--accent-orange)"   icon="fa-triangle-exclamation" tab="my_tasks" />
          </div>
        `;

      case 'pending_acceptance':
        return pendingAcceptanceTasks.length > 0 ? html`
          <div class="metric-card" style="margin-bottom:1.5rem;border-left:4px solid var(--accent-orange);">
            <div class="metric-title" style="display:flex;justify-content:space-between;align-items:center;">
              <span><i class="fa-solid fa-bell-concierge" style="margin-right:0.4rem;color:var(--accent-orange);"></i>Awaiting Your Acceptance (${pendingAcceptanceTasks.length})</span>
              <button class="btn" style="font-size:0.72rem;color:var(--accent-orange);" onClick=${() => setActiveTab('my_tasks')}>Manage →</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:0.75rem;margin-top:0.75rem;">
              ${pendingAcceptanceTasks.map(t => {
                const proj = (projects||[]).find(p => p.id === t.project_id);
                return html`
                  <div class="task-card-unified"
                       style="border-left: 4px solid var(--accent-orange);"
                       onClick=${() => window.openTaskDetail && window.openTaskDetail(t.id)}>
                    <div style="font-weight:600;font-size:0.85rem;">${t.title}</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.5rem;">
                      <span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span>
                      ${proj && html`<span style="font-size:0.7rem;color:var(--text-secondary);font-weight:500;">${proj.title}</span>`}
                    </div>
                  </div>`;
              })}
            </div>
          </div>
        ` : null;

      case 'in_review':
        return inReviewTasks.length > 0 ? html`
          <div class="metric-card" style="margin-bottom:1.5rem;border-left:4px solid var(--accent-purple);">
            <div class="metric-title" style="display:flex;justify-content:space-between;align-items:center;">
              <span><i class="fa-solid fa-magnifying-glass" style="margin-right:0.4rem;color:var(--accent-purple);"></i>Submitted for Review (${inReviewTasks.length})</span>
              <button class="btn" style="font-size:0.72rem;color:var(--accent-purple);" onClick=${() => setActiveTab('my_tasks')}>View History →</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:0.75rem;margin-top:0.75rem;">
              ${inReviewTasks.map(t => {
                const proj = (projects||[]).find(p => p.id === t.project_id);
                return html`
                  <div class="task-card-unified"
                       style="border-left: 4px solid var(--accent-purple);"
                       onClick=${() => window.openTaskDetail && window.openTaskDetail(t.id)}>
                    <div style="font-weight:600;font-size:0.85rem;">${t.title}</div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.5rem;">
                      <span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span>
                      ${proj && html`<span style="font-size:0.7rem;color:var(--text-secondary);font-weight:500;">${proj.title}</span>`}
                    </div>
                    ${t.review_submitted_at && html`
                      <div style="font-size:0.65rem;color:var(--text-secondary);margin-top:0.4rem;text-align:right;">
                        Submitted ${new Date(t.review_submitted_at).toLocaleDateString()}
                      </div>`}
                  </div>`;
              })}
            </div>
          </div>
        ` : null;

      case 'task_velocity':
        return html`
          <div class="metric-card" style="margin-bottom:1.5rem;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
              <div class="metric-title" style="margin:0;"><i class="fa-solid fa-chart-bar" style="margin-right:0.4rem;color:var(--accent-green);"></i>Your Task Velocity</div>
              <div style="display:flex;align-items:center;gap:0.5rem;">
                <select class="text-input" style="padding:0.2rem 0.5rem;font-size:0.75rem;width:auto;" value=${velocityDays} onChange=${e => setVelocityDays(parseInt(e.target.value))}>
                  <option value="7">Last 7 Days</option>
                  <option value="14">Last 14 Days</option>
                  <option value="30">Last 30 Days</option>
                </select>
                <button class="btn" style="padding:0.2rem 0.5rem;font-size:0.75rem;background:rgba(255,255,255,0.05);border:1px solid var(--border-color);" onClick=${exportVelocityCSV}>
                  <i class="fa-solid fa-download"></i> CSV
                </button>
              </div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:flex-end;height:120px;padding:1rem 2rem 0;margin-top:0.5rem;background:rgba(255,255,255,0.01);border-radius:10px;">
              ${velocityData.map(d => {
                const pct = (d.count / maxCount) * 100;
                return html`
                  <div style="display:flex;flex-direction:column;align-items:center;flex:1;height:100%;justify-content:flex-end;">
                    <span style="font-size:0.75rem;font-weight:700;color:var(--accent-green);margin-bottom:0.25rem;visibility:${d.count > 0 ? 'visible' : 'hidden'};">${d.count}</span>
                    <div style="width:24px;height:${pct === 0 ? '4px' : pct + '%'};background:${pct === 0 ? 'rgba(255,255,255,0.05)' : 'linear-gradient(to top, var(--accent-green), #10b981)'};border-radius:4px 4px 0 0;transition:height 0.5s ease-out;position:relative;"
                         title="${d.count} tasks completed on ${d.dateStr}">
                    </div>
                    <span style="font-size:0.6rem;color:var(--text-secondary);margin-top:0.4rem;font-weight:500;">${d.label}</span>
                  </div>`;
              })}
            </div>
          </div>
        `;

      case 'active_tasks':
        return html`
          <div class="metric-card" style="margin-bottom:0;">
            <div class="metric-title"><i class="fa-solid fa-bolt" style="margin-right:0.4rem;color:var(--accent-blue);"></i>Active Tasks</div>
            ${inProg.length === 0 && todo.length === 0
              ? html`<div style="color:var(--text-secondary);font-style:italic;padding:1rem 0;">No active tasks — you're all caught up! 🎉</div>`
              : [...inProg, ...todo].slice(0, 8).map(t => {
                  const proj = (projects||[]).find(p => p.id === t.project_id);
                  const isOverdue = t.due_date && new Date(t.due_date) < new Date();
                  return html`
                    <div class="task-card-unified"
                         style="border-left: 4px solid ${t.status==='in_progress'?'var(--accent-blue)':'var(--border-color)'}; margin-bottom: 0.5rem;"
                         onClick=${() => window.openTaskDetail && window.openTaskDetail(t.id)}>
                      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                        <div style="font-weight:600;font-size:0.88rem;">${t.title}</div>
                        ${isOverdue && html`<span class="tag color-orange" style="font-size:0.62rem;flex-shrink:0;">OVERDUE</span>`}
                      </div>
                      <div style="display:flex;gap:0.4rem;margin-top:0.4rem;flex-wrap:wrap;align-items:center;">
                        <span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.65rem;">${t.crisp_dm_phase}</span>
                        ${proj && html`<span style="font-size:0.7rem;color:var(--text-secondary);">${proj.title}</span>`}
                        ${t.due_date && html`<span style="font-size:0.7rem;color:${isOverdue?'var(--accent-orange)':'var(--text-secondary)'};">Due ${t.due_date}</span>`}
                      </div>
                    </div>`;
                })}
          </div>
        `;

      case 'my_projects':
        return html`
          <div class="metric-card" style="margin-bottom:0;">
            <div class="metric-title"><i class="fa-solid fa-folder-open" style="margin-right:0.4rem;color:var(--accent-purple);"></i>My Projects</div>
            ${(() => {
              const myProjectIds = [...new Set(myTasks.map(t => t.project_id))];
              const myProjects = (projects||[]).filter(p => myProjectIds.includes(p.id));
              if (myProjects.length === 0) return html`<div style="color:var(--text-secondary);font-style:italic;padding:1rem 0;">No projects assigned yet.</div>`;
              return myProjects.slice(0, 6).map(p => {
                const pct = p.computed_progress || 0;
                const health = getHealthStatus(p, tasks);
                return html`
                  <div style="padding:0.75rem;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:8px;margin-bottom:0.5rem;cursor:pointer;transition:var(--transition);"
                       class="task-card-clickable"
                       onClick=${() => window.openProjectDetail && window.openProjectDetail(p.id)}>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
                      <div style="font-weight:600;font-size:0.88rem;">${p.title}</div>
                      <span style="color:${health.color};font-size:0.72rem;font-weight:700;">${health.label}</span>
                    </div>
                    <div style="width:100%;height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;">
                      <div style="height:100%;width:${pct}%;background:var(--accent-blue);border-radius:3px;"></div>
                    </div>
                    <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.3rem;">${pct}% complete · ${p.phase}</div>
                  </div>`;
              });
            })()}
          </div>
        `;

      case 'shortcuts':
        return html`<${ShortcutsManager} currentUser=${currentUser} dbConfig=${dbConfig} saveConfig=${saveConfig} teamsList=${teamsList} />`;

      default:
        return null;
    }
  };

  return html`
    <div>
      <style>
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseBorder {
          from { border-color: rgba(239,68,68,0.3); box-shadow: 0 0 0 rgba(239,68,68,0); }
          to { border-color: rgba(239,68,68,0.6); box-shadow: 0 0 10px rgba(239,68,68,0.1); }
        }
      </style>

      <div class="page-header">
        <div>
          <h2 class="page-title">
            <i class="fa-solid fa-hand-wave" style="color:var(--accent-yellow);margin-right:0.6rem;"></i>
            Welcome back, ${currentUser.username}
          </h2>
          <p class="page-subtitle">Your personal workspace — tasks, progress, and shortcuts</p>
        </div>
        <div style="display:flex;gap:0.5rem;">
          <button class="btn" style="background:rgba(255,255,255,0.05);border:1px solid var(--border-color);color:var(--text-secondary);" onClick=${() => setShowSettings(!showSettings)}>
            <i class="fa-solid fa-cog ${showSettings ? 'fa-spin' : ''}" style="margin-right:0.3rem;"></i> Customize
          </button>
          <button class="btn active" style="background:var(--accent-green);" onClick=${() => setActiveTab('my_tasks')}>
            <i class="fa-solid fa-plus"></i> New Task
          </button>
        </div>
      </div>

      <!-- Settings Panel -->
      ${showSettings && html`
        <div style="background:var(--bg-panel);border:1px solid var(--border-color);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;animation:slideDown 0.3s ease-out;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1px solid var(--border-color);padding-bottom:0.75rem;">
            <h3 style="margin:0;font-size:1.1rem;font-weight:700;"><i class="fa-solid fa-sliders" style="margin-right:0.5rem;color:var(--accent-blue);"></i>Customize Landing Page Widgets</h3>
            <button class="btn" style="padding:0.25rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);" onClick=${resetDefaults}>Reset to Default</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:0.75rem;">
            ${widgetOrder.map((key, index) => {
              const widgetMeta = {
                overdue_alert: { label: 'Overdue Alert Banner', desc: 'Warns if you have overdue tasks' },
                kpi_strip: { label: 'KPI Statistics Strip', desc: 'Summary of task counts' },
                pending_acceptance: { label: 'Pending Acceptance', desc: 'Tasks waiting for your accept/pass' },
                active_tasks: { label: 'Active Tasks', desc: 'Tasks currently in progress or todo' },
                my_projects: { label: 'My Projects', desc: 'Snapshot of assigned project progress' },
                in_review: { label: 'Submitted for Review', desc: 'Tasks you submitted for verification' },
                task_velocity: { label: 'Task Velocity Chart', desc: 'Tasks completed per day' },
                shortcuts: { label: 'Shortcuts Manager', desc: 'Quick links and published shortcuts' }
              }[key];
              if (!widgetMeta) return null;
              return html`
                <div style="display:flex;flex-direction:column;background:rgba(255,255,255,0.02);padding:0.75rem 1rem;border:1px solid ${widgets[key] ? 'rgba(52,211,153,0.3)' : 'var(--border-color)'};border-radius:10px;box-shadow:0 2px 4px rgba(0,0,0,0.1);gap:0.5rem;">
                  <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onClick=${() => toggleWidget(key)}>
                    <div style="flex:1;padding-right:0.5rem;">
                      <div style="font-weight:600;font-size:0.85rem;color:var(--text-primary);">${widgetMeta.label}</div>
                      <div style="font-size:0.68rem;color:var(--text-secondary);margin-top:0.15rem;line-height:1.2;">${widgetMeta.desc}</div>
                    </div>
                    <div style="position:relative;width:38px;height:20px;background:${widgets[key] ? 'var(--accent-green)' : 'rgba(255,255,255,0.15)'};border-radius:20px;transition:all 0.2s;flex-shrink:0;">
                      <div style="position:absolute;top:2px;left:${widgets[key] ? '20px' : '2px'};width:16px;height:16px;background:white;border-radius:50%;transition:all 0.2s;"></div>
                    </div>
                  </div>
                  <div style="display:flex;gap:0.25rem;border-top:1px solid var(--border-color);padding-top:0.4rem;margin-top:0.2rem;">
                    <button class="btn" style="flex:1;padding:0.15rem;font-size:0.65rem;" disabled=${index === 0} onClick=${() => moveWidget(index, -1)}>
                      <i class="fa-solid fa-arrow-up"></i> Move Up
                    </button>
                    <button class="btn" style="flex:1;padding:0.15rem;font-size:0.65rem;" disabled=${index === widgetOrder.length - 1} onClick=${() => moveWidget(index, 1)}>
                      <i class="fa-solid fa-arrow-down"></i> Move Down
                    </button>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
      `}

      <!-- Dynamic Render List -->
      <div style="display:flex;flex-direction:column;gap:1.5rem;">
        ${widgetOrder.map(key => renderWidget(key))}
      </div>
    </div>`;
};

/* ─────────────────────────────────────────────────────────────────
   LEADER HOME — team hub with pending approvals + team status
   ───────────────────────────────────────────────────────────────── */
const LeaderHome = ({ currentUser, tasks, projects, users, setActiveTab, openPhaseModal, dbConfig, saveConfig, teamsList }) => {
  const [showSettings, setShowSettings] = useState(false);

  const widgets = dbConfig.widgets || LEADER_DEFAULTS.widgets;
  const widgetOrder = dbConfig.widgetOrder || LEADER_DEFAULTS.widgetOrder;

  const toggleWidget = (key) => {
    const updatedWidgets = { ...widgets, [key]: !widgets[key] };
    saveConfig({
      ...dbConfig,
      widgets: updatedWidgets
    });
  };

  const moveWidget = (index, direction) => {
    const newOrder = [...widgetOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    saveConfig({
      ...dbConfig,
      widgetOrder: newOrder
    });
  };

  const resetDefaults = () => {
    saveConfig({
      ...dbConfig,
      widgets: LEADER_DEFAULTS.widgets,
      widgetOrder: LEADER_DEFAULTS.widgetOrder
    });
  };

  const teamTasks    = useMemo(() => (tasks||[]).filter(t => t.team === currentUser.team), [tasks, currentUser]);
  const blocked      = teamTasks.filter(t => t.is_blocked);
  const done         = teamTasks.filter(t => t.status === 'done');
  const teamProjects = useMemo(() => {
    const ids = [...new Set(teamTasks.map(t => t.project_id))];
    return (projects||[]).filter(p => ids.includes(p.id) || p.team === currentUser.team);
  }, [teamTasks, projects, currentUser]);

  const teamMembers = useMemo(() => (users||[]).filter(u => u.team === currentUser.team), [users, currentUser]);

  const creationRequests = teamTasks.filter(t => t.approval_status === 'pending_team_lead_approval' && t.created_by !== currentUser.username);
  const reviewQueue      = teamTasks.filter(t => t.status === 'review' && t.assignee !== currentUser.username);
  const totalActionable  = creationRequests.length + reviewQueue.length;

  const renderWidget = (key) => {
    if (!widgets[key]) return null;

    switch (key) {
      case 'sla_warnings':
        return html`<${SLABreachWarnings} currentUser=${currentUser} projects=${projects} />`;

      case 'kpi_strip':
        return html`
          <div class="bento-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:1.5rem;">
            ${[
              { label:'Team Tasks',    value: teamTasks.length,         color:'var(--text-primary)',    icon:'fa-list-check',      tab: 'team_pool' },
              { label:'Approvals',     value: creationRequests.length,  color:'var(--accent-orange)',   icon:'fa-user-plus',       tab:'approvals', pulse: creationRequests.length > 0 },
              { label:'In Review',     value: reviewQueue.length,       color:'var(--accent-purple)',   icon:'fa-magnifying-glass', tab:'approvals' },
              { label:'Blocked',       value: blocked.length,           color:'var(--accent-pink)',     icon:'fa-ban',             tab: 'team_pool' },
              { label:'Done',          value: done.length,              color:'var(--accent-green)',    icon:'fa-circle-check',    tab: 'team_dashboard' },
            ].map(s => html`
              <div class="bento-card" style="cursor:${s.tab?'pointer':'default'};text-align:center;padding:1.25rem;${s.pulse?'border-top:3px solid var(--accent-orange);':''}"
                onClick=${s.tab ? () => setActiveTab(s.tab) : undefined}>
                <div class="metric-value" style="color:${s.color};line-height:1;">${s.value}</div>
                <div class="metric-label" style="margin-top:0.4rem;">
                  <i class="fa-solid ${s.icon}" style="margin-right:0.3rem;"></i>${s.label}
                </div>
              </div>`)}
          </div>
        `;

      case 'creation_requests':
        return creationRequests.length > 0 ? html`
          <div class="metric-card" style="margin-bottom:1.5rem;border-left:4px solid var(--accent-orange);">
            <div class="metric-title" style="display:flex;justify-content:space-between;align-items:center;">
              <span>
                <i class="fa-solid fa-user-plus" style="margin-right:0.4rem;color:var(--accent-orange);"></i>
                Pending Self-Assign Approvals
                <span style="background:var(--accent-orange);color:white;border-radius:10px;padding:0.1rem 0.4rem;font-size:0.7rem;margin-left:0.4rem;">${creationRequests.length}</span>
              </span>
              <button class="btn" style="font-size:0.72rem;color:var(--accent-orange);" onClick=${() => setActiveTab('approvals')}>Go to Approvals →</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:0.75rem;margin-top:0.75rem;">
              ${creationRequests.map(t => html`
                <div class="task-card-unified"
                     style="border-left: 4px solid var(--accent-orange);"
                     onClick=${() => window.openTaskDetail && window.openTaskDetail(t.id)}>
                  <div style="font-weight:600;font-size:0.85rem;">${t.title}</div>
                  <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.25rem;">
                    Requested by <strong style="color:var(--text-primary);">${t.assignee || '—'}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.5rem;font-size:0.68rem;color:var(--text-secondary);">
                    <span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span>
                    ${t.created_at && html`<span>Requested ${new Date(t.created_at).toLocaleDateString()}</span>`}
                  </div>
                </div>`)}
            </div>
          </div>
        ` : null;

      case 'review_queue':
        return reviewQueue.length > 0 ? html`
          <div class="metric-card" style="margin-bottom:1.5rem;border-left:4px solid var(--accent-purple);">
            <div class="metric-title" style="display:flex;justify-content:space-between;align-items:center;">
              <span>
                <i class="fa-solid fa-inbox" style="margin-right:0.4rem;color:var(--accent-purple);"></i>
                Review Queue
                <span style="background:var(--accent-purple);color:white;border-radius:10px;padding:0.1rem 0.4rem;font-size:0.7rem;margin-left:0.4rem;">${reviewQueue.length}</span>
              </span>
              <button class="btn" style="font-size:0.72rem;color:var(--accent-purple);" onClick=${() => setActiveTab('approvals')}>Verify Reviews →</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:0.75rem;margin-top:0.75rem;">
              ${reviewQueue.map(t => html`
                <div class="task-card-unified"
                     style="border-left: 4px solid var(--accent-purple);"
                     onClick=${() => window.openTaskDetail && window.openTaskDetail(t.id)}>
                  <div style="font-weight:600;font-size:0.85rem;">${t.title}</div>
                  <div style="font-size:0.72rem;color:var(--text-secondary);margin-top:0.25rem;">
                    Submitted by <strong style="color:var(--text-primary);">${t.assignee || '—'}</strong>
                  </div>
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.5rem;font-size:0.68rem;color:var(--text-secondary);">
                    <span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span>
                    ${t.review_submitted_at && html`<span>Submitted ${new Date(t.review_submitted_at).toLocaleDateString()}</span>`}
                  </div>
                </div>`)}
            </div>
          </div>
        ` : null;

      case 'team_members':
        return html`
          <div class="metric-card" style="margin-bottom:1.5rem;">
            <div class="metric-title"><i class="fa-solid fa-users" style="margin-right:0.4rem;color:var(--accent-blue);"></i>Team Members Workload</div>
            ${teamMembers.length === 0
              ? html`<div style="color:var(--text-secondary);font-style:italic;padding:1rem 0;">No members found.</div>`
              : teamMembers.map(u => {
                  const uTasks = teamTasks.filter(t => t.assignee === u.username);
                  const uDone  = uTasks.filter(t => t.status === 'done').length;
                  const pct    = uTasks.length > 0 ? Math.round(uDone / uTasks.length * 100) : 0;
                  return html`
                    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border-color);cursor:pointer;"
                         class="table-row-hover"
                         onClick=${() => setActiveTab('team_dashboard')}
                         title="View member workload on Team Dashboard">
                      <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;flex-shrink:0;">${getInitials(u.username)}</div>
                      <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:0.85rem;">${u.username}</div>
                        <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.25rem;">
                          <div style="flex:1;height:4px;background:rgba(255,255,255,0.07);border-radius:2px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:var(--accent-green);"></div>
                          </div>
                          <span style="font-size:0.68rem;color:var(--text-secondary);flex-shrink:0;">${uDone}/${uTasks.length}</span>
                        </div>
                      </div>
                    </div>`;
                })}
          </div>
        `;

      case 'team_projects':
        return html`
          <div class="metric-card" style="padding:0;overflow:hidden;margin-bottom:1.5rem;">
            <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
              <div style="font-weight:600;"><i class="fa-solid fa-folder-open" style="margin-right:0.4rem;color:var(--accent-purple);"></i>Team Projects (${teamProjects.length})</div>
            </div>
            <table class="data-grid-table">
              <thead><tr><th>Project</th><th>Phase</th><th>Progress</th><th>Health</th></tr></thead>
              <tbody>
                ${teamProjects.length === 0 
                  ? html`<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);font-style:italic;padding:1.5rem;">No team projects assigned.</td></tr>`
                  : teamProjects.slice(0, 6).map(p => {
                      const pct    = p.computed_progress || 0;
                      const health = getHealthStatus(p, tasks);
                      return html`
                        <tr style="cursor:pointer;" class="table-row-hover" onClick=${() => window.openProjectDetail && window.openProjectDetail(p.id)}>
                          <td style="padding:0.6rem 1rem;font-weight:600;font-size:0.85rem;">${p.title}</td>
                          <td><span class="tag ${getPhaseClass(p.phase)}" style="font-size:0.65rem;">${p.phase}</span></td>
                          <td style="padding-right:1.5rem;">
                            <div style="display:flex;align-items:center;gap:0.5rem;">
                              <div style="flex:1;height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;">
                                <div style="height:100%;width:${pct}%;background:var(--accent-blue);"></div>
                              </div>
                              <span style="font-size:0.72rem;color:var(--text-secondary);flex-shrink:0;">${pct}%</span>
                            </div>
                          </td>
                          <td><span style="color:${health.color};font-size:0.75rem;font-weight:700;">${health.label}</span></td>
                        </tr>`;
                    })}
              </tbody>
            </table>
          </div>
        `;

      case 'shortcuts':
        return html`<${ShortcutsManager} currentUser=${currentUser} dbConfig=${dbConfig} saveConfig=${saveConfig} teamsList=${teamsList} />`;

      default:
        return null;
    }
  };

  return html`
    <div>
      <style>
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>

      <div class="page-header">
        <div>
          <h2 class="page-title">
            <i class="fa-solid fa-people-group" style="color:var(--accent-blue);margin-right:0.6rem;"></i>
            Team Hub — ${currentUser.team || 'Your Team'}
          </h2>
          <p class="page-subtitle">Approvals, team workload, and project health at a glance</p>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <button class="btn" style="background:rgba(255,255,255,0.05);border:1px solid var(--border-color);color:var(--text-secondary);" onClick=${() => setShowSettings(!showSettings)}>
            <i class="fa-solid fa-cog ${showSettings ? 'fa-spin' : ''}" style="margin-right:0.3rem;"></i> Customize
          </button>
          <button class="btn active" style="background:var(--accent-purple);position:relative;" onClick=${() => setActiveTab('approvals')}>
            <i class="fa-solid fa-check-to-slot"></i> Approvals
            ${totalActionable > 0 ? html`
              <span style="background:var(--accent-orange);color:white;border-radius:10px;padding:0.1rem 0.45rem;font-size:0.68rem;margin-left:0.35rem;font-weight:800;letter-spacing:0.02em;vertical-align:middle;">
                ${totalActionable}
              </span>
            ` : ''}
          </button>
          <button class="btn active" style="background:var(--accent-blue);" onClick=${() => openPhaseModal()}>
            <i class="fa-solid fa-code-branch"></i> Submit Phase
          </button>
        </div>
      </div>

      <!-- Settings Panel -->
      ${showSettings && html`
        <div style="background:var(--bg-panel);border:1px solid var(--border-color);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;animation:slideDown 0.3s ease-out;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1px solid var(--border-color);padding-bottom:0.75rem;">
            <h3 style="margin:0;font-size:1.1rem;font-weight:700;"><i class="fa-solid fa-sliders" style="margin-right:0.5rem;color:var(--accent-blue);"></i>Customize Landing Page Widgets</h3>
            <button class="btn" style="padding:0.25rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);" onClick=${resetDefaults}>Reset to Default</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:0.75rem;">
            ${widgetOrder.map((key, index) => {
              const widgetMeta = {
                sla_warnings: { label: 'SLA Breach Warnings', desc: 'Displays active SLA breaches for team' },
                kpi_strip: { label: 'KPI Statistics Strip', desc: 'Summary of team task counts' },
                creation_requests: { label: 'Self-Assign Requests', desc: 'Pending approvals for self-assigned tasks' },
                review_queue: { label: 'Review Queue', desc: 'Tasks submitted for verification review' },
                team_members: { label: 'Team Members Workload', desc: 'Progress and workload for team' },
                team_projects: { label: 'Team Projects Health', desc: 'Health status and progress of team initiatives' },
                shortcuts: { label: 'Shortcuts Manager', desc: 'Quick links and team published shortcuts' }
              }[key];
              if (!widgetMeta) return null;
              return html`
                <div style="display:flex;flex-direction:column;background:rgba(255,255,255,0.02);padding:0.75rem 1rem;border:1px solid ${widgets[key] ? 'rgba(52,211,153,0.3)' : 'var(--border-color)'};border-radius:10px;box-shadow:0 2px 4px rgba(0,0,0,0.1);gap:0.5rem;">
                  <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onClick=${() => toggleWidget(key)}>
                    <div style="flex:1;padding-right:0.5rem;">
                      <div style="font-weight:600;font-size:0.85rem;color:var(--text-primary);">${widgetMeta.label}</div>
                      <div style="font-size:0.68rem;color:var(--text-secondary);margin-top:0.15rem;line-height:1.2;">${widgetMeta.desc}</div>
                    </div>
                    <div style="position:relative;width:38px;height:20px;background:${widgets[key] ? 'var(--accent-green)' : 'rgba(255,255,255,0.15)'};border-radius:20px;transition:all 0.2s;flex-shrink:0;">
                      <div style="position:absolute;top:2px;left:${widgets[key] ? '20px' : '2px'};width:16px;height:16px;background:white;border-radius:50%;transition:all 0.2s;"></div>
                    </div>
                  </div>
                  <div style="display:flex;gap:0.25rem;border-top:1px solid var(--border-color);padding-top:0.4rem;margin-top:0.2rem;">
                    <button class="btn" style="flex:1;padding:0.15rem;font-size:0.65rem;" disabled=${index === 0} onClick=${() => moveWidget(index, -1)}>
                      <i class="fa-solid fa-arrow-up"></i> Move Up
                    </button>
                    <button class="btn" style="flex:1;padding:0.15rem;font-size:0.65rem;" disabled=${index === widgetOrder.length - 1} onClick=${() => moveWidget(index, 1)}>
                      <i class="fa-solid fa-arrow-down"></i> Move Down
                    </button>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
      `}

      <!-- Dynamic Render List -->
      <div style="display:flex;flex-direction:column;gap:1.5rem;">
        ${widgetOrder.map(key => renderWidget(key))}
      </div>
    </div>`;
};

/* ─────────────────────────────────────────────────────────────────
   ADMIN HOME — executive command center
   ───────────────────────────────────────────────────────────────── */
const AdminHome = ({ currentUser, tasks, projects, users, setActiveTab, dbConfig, saveConfig, teamsList }) => {
  const [showSettings, setShowSettings] = useState(false);

  const widgets = dbConfig.widgets || ADMIN_DEFAULTS.widgets;
  const widgetOrder = dbConfig.widgetOrder || ADMIN_DEFAULTS.widgetOrder;

  const toggleWidget = (key) => {
    const updatedWidgets = { ...widgets, [key]: !widgets[key] };
    saveConfig({
      ...dbConfig,
      widgets: updatedWidgets
    });
  };

  const moveWidget = (index, direction) => {
    const newOrder = [...widgetOrder];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    const temp = newOrder[index];
    newOrder[index] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;
    saveConfig({
      ...dbConfig,
      widgetOrder: newOrder
    });
  };

  const resetDefaults = () => {
    saveConfig({
      ...dbConfig,
      widgets: ADMIN_DEFAULTS.widgets,
      widgetOrder: ADMIN_DEFAULTS.widgetOrder
    });
  };

  const pendingReview = tasks.filter(t => t.status === 'review').length;
  const blocked       = tasks.filter(t => t.is_blocked).length;
  const unassigned = tasks.filter(t => !t.assignee || t.assignee === '').length;
  const activeProjects    = projects.filter(p => !p.is_deployed);
  const productionProjects = projects.filter(p => p.is_deployed);

  const QUICK_ACTIONS = [
    { label:'New Project',   icon:'fa-plus',          tab:'new-project', color:'var(--accent-green)' },
    { label:'Admin Panel',   icon:'fa-shield',         tab:'admin',       color:'var(--accent-blue)' },
    { label:'Approvals',     icon:'fa-check-to-slot',  tab:'approvals',   color:'var(--accent-purple)' },
    { label:'Team Pool',     icon:'fa-inbox',          tab:'team_pool',   color:'var(--accent-orange)' },
    { label:'Analytics',     icon:'fa-chart-pie',      tab:'analytics',   color:'var(--accent-pink)' },
    { label:'Audit Log',     icon:'fa-file-shield',    tab:'audit',       color:'var(--text-secondary)' },
  ];

  const renderWidget = (key) => {
    if (!widgets[key]) return null;

    switch (key) {
      case 'sla_warnings':
        return html`<${SLABreachWarnings} currentUser=${currentUser} projects=${projects} />`;

      case 'quick_actions':
        return html`
          <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:0.75rem;margin-bottom:1.5rem;">
            ${QUICK_ACTIONS.map(a => html`
              <button class="metric-card" style="cursor:pointer;text-align:center;padding:1rem 0.5rem;border:1px solid var(--border-color);background:var(--bg-panel);transition:var(--transition);"
                onClick=${() => setActiveTab(a.tab)}
                onMouseEnter=${e => e.currentTarget.style.borderColor = a.color}
                onMouseLeave=${e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
                <i class="fa-solid ${a.icon}" style="font-size:1.4rem;color:${a.color};margin-bottom:0.5rem;display:block;"></i>
                <div style="font-size:0.72rem;font-weight:600;color:var(--text-secondary);">${a.label}</div>
              </button>`)}
          </div>
        `;

      case 'kpi_strip':
        return html`
          <div class="bento-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:1.5rem;">
            ${[
              { label:'Total Projects',   value: projects.length,       color:'var(--accent-blue)',   icon:'fa-folder',            tab: 'dashboard' },
              { label:'In Production',    value: productionProjects.length, color:'var(--accent-green)', icon:'fa-server',         tab: 'dashboard' },
              { label:'Pending Review',   value: pendingReview,          color:'var(--accent-purple)', icon:'fa-magnifying-glass', tab: 'approvals' },
              { label:'Blocked Tasks',    value: blocked,                color:'var(--accent-orange)', icon:'fa-ban',             tab: 'team_pool' },
              { label:'Unassigned Tasks', value: unassigned,             color:'var(--accent-pink)',   icon:'fa-user-slash',        tab: 'team_pool' },
            ].map(s => html`
              <div class="bento-card" style="cursor:${s.tab?'pointer':'default'};text-align:center;padding:1.25rem 1rem;"
                   onClick=${s.tab ? () => setActiveTab(s.tab) : undefined}>
                <div class="metric-value" style="color:${s.color};line-height:1;">${s.value}</div>
                <div class="metric-label" style="margin-top:0.4rem;">
                  <i class="fa-solid ${s.icon}" style="margin-right:0.25rem;"></i>${s.label}
                </div>
              </div>`)}
          </div>
        `;

      case 'portfolio_health':
        return html`
          <div class="metric-card" style="padding:0;overflow:hidden;margin-bottom:1.5rem;">
            <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">
              <div style="font-weight:600;"><i class="fa-solid fa-seedling" style="margin-right:0.4rem;color:var(--accent-blue);"></i>Active Initiatives (${activeProjects.length})</div>
              <button class="btn" style="font-size:0.72rem;" onClick=${() => setActiveTab('dashboard')}>Full Dashboard →</button>
            </div>
            <table class="data-grid-table">
              <thead><tr><th>Project</th><th>Phase</th><th>Progress</th><th>Health</th></tr></thead>
              <tbody>
                ${activeProjects.slice(0,8).map(p => {
                  const pct    = p.computed_progress || 0;
                  const health = getHealthStatus(p, tasks);
                  return html`
                    <tr style="cursor:pointer;" class="table-row-hover" onClick=${() => window.openProjectDetail && window.openProjectDetail(p.id)}>
                      <td style="padding:0.6rem 1rem;font-weight:600;font-size:0.85rem;">${p.title}</td>
                      <td><span class="tag ${getPhaseClass(p.phase)}" style="font-size:0.65rem;">${p.phase}</span></td>
                      <td style="padding-right:1.5rem;">
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                          <div style="flex:1;height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;">
                            <div style="height:100%;width:${pct}%;background:var(--accent-blue);"></div>
                          </div>
                          <span style="font-size:0.72rem;color:var(--text-secondary);flex-shrink:0;">${pct}%</span>
                        </div>
                      </td>
                      <td><span style="color:${health.color};font-size:0.75rem;font-weight:700;">${health.label}</span></td>
                    </tr>`; })}
              </tbody>
            </table>
          </div>
        `;

      case 'user_overview':
        return html`
          <div class="metric-card" style="margin-bottom:1.5rem;">
            <div class="metric-title"><i class="fa-solid fa-users" style="margin-right:0.4rem;color:var(--accent-blue);"></i>Team Overview</div>
            ${(users||[]).slice(0,10).map(u => {
              const uTasks = tasks.filter(t => t.assignee === u.username);
              const uDone  = uTasks.filter(t => t.status === 'done').length;
              const uRev   = uTasks.filter(t => t.status === 'review').length;
              const ROLE_COLOR = { admin:'var(--accent-orange)', leader:'var(--accent-blue)', member:'var(--accent-green)' };
              return html`
                <div style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0;border-bottom:1px solid var(--border-color);cursor:pointer;"
                     class="table-row-hover"
                     onClick=${() => setActiveTab('admin')}
                     title="Manage users in Admin Panel">
                  <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;flex-shrink:0;">${getInitials(u.username)}</div>
                  <div style="flex:1;min-width:0;">
                    <div style="font-size:0.82rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.username}</div>
                    <div style="font-size:0.68rem;color:${ROLE_COLOR[u.role]||'var(--text-secondary)'};">${u.role} · ${u.team || '—'}</div>
                  </div>
                  <div style="text-align:right;flex-shrink:0;">
                    <div style="font-size:0.72rem;color:var(--accent-green);font-weight:600;">${uDone} done</div>
                    ${uRev > 0 && html`<div style="font-size:0.68rem;color:var(--accent-purple);">${uRev} review</div>`}
                  </div>
                </div>`; })}
          </div>
        `;

      case 'shortcuts':
        return html`<${ShortcutsManager} currentUser=${currentUser} dbConfig=${dbConfig} saveConfig=${saveConfig} teamsList=${teamsList} />`;

      default:
        return null;
    }
  };

  return html`
    <div>
      <style>
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      </style>

      <div class="page-header">
        <div>
          <h2 class="page-title">
            <i class="fa-solid fa-gauge-high" style="color:var(--accent-orange);margin-right:0.6rem;"></i>
            Admin Command Center
          </h2>
          <p class="page-subtitle">Full enterprise overview — portfolio health, team status, and shortcuts</p>
        </div>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <button class="btn" style="background:rgba(255,255,255,0.05);border:1px solid var(--border-color);color:var(--text-secondary);" onClick=${() => setShowSettings(!showSettings)}>
            <i class="fa-solid fa-cog ${showSettings ? 'fa-spin' : ''}" style="margin-right:0.3rem;"></i> Customize
          </button>
        </div>
      </div>

      <!-- Settings Panel -->
      ${showSettings && html`
        <div style="background:var(--bg-panel);border:1px solid var(--border-color);border-radius:12px;padding:1.5rem;margin-bottom:1.5rem;animation:slideDown 0.3s ease-out;box-shadow:0 10px 25px -5px rgba(0,0,0,0.3);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;border-bottom:1px solid var(--border-color);padding-bottom:0.75rem;">
            <h3 style="margin:0;font-size:1.1rem;font-weight:700;"><i class="fa-solid fa-sliders" style="margin-right:0.5rem;color:var(--accent-blue);"></i>Customize Landing Page Widgets</h3>
            <button class="btn" style="padding:0.25rem 0.5rem;font-size:0.75rem;color:var(--text-secondary);" onClick=${resetDefaults}>Reset to Default</button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(280px, 1fr));gap:0.75rem;">
            ${widgetOrder.map((key, index) => {
              const widgetMeta = {
                sla_warnings: { label: 'SLA Breach Warnings', desc: 'Displays active SLA breaches across all teams' },
                quick_actions: { label: 'Quick Actions', desc: 'Shortcut buttons to administrative tasks' },
                kpi_strip: { label: 'KPI Statistics Strip', desc: 'Overview of system-wide metrics' },
                portfolio_health: { label: 'Active Initiatives', desc: 'Progress and health of active projects' },
                user_overview: { label: 'Team Overview', desc: 'Activity metrics and task counts per user' },
                shortcuts: { label: 'Shortcuts Manager', desc: 'Quick links and published global shortcuts' }
              }[key];
              if (!widgetMeta) return null;
              return html`
                <div style="display:flex;flex-direction:column;background:rgba(255,255,255,0.02);padding:0.75rem 1rem;border:1px solid ${widgets[key] ? 'rgba(52,211,153,0.3)' : 'var(--border-color)'};border-radius:10px;box-shadow:0 2px 4px rgba(0,0,0,0.1);gap:0.5rem;">
                  <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;" onClick=${() => toggleWidget(key)}>
                    <div style="flex:1;padding-right:0.5rem;">
                      <div style="font-weight:600;font-size:0.85rem;color:var(--text-primary);">${widgetMeta.label}</div>
                      <div style="font-size:0.68rem;color:var(--text-secondary);margin-top:0.15rem;line-height:1.2;">${widgetMeta.desc}</div>
                    </div>
                    <div style="position:relative;width:38px;height:20px;background:${widgets[key] ? 'var(--accent-green)' : 'rgba(255,255,255,0.15)'};border-radius:20px;transition:all 0.2s;flex-shrink:0;">
                      <div style="position:absolute;top:2px;left:${widgets[key] ? '20px' : '2px'};width:16px;height:16px;background:white;border-radius:50%;transition:all 0.2s;"></div>
                    </div>
                  </div>
                  <div style="display:flex;gap:0.25rem;border-top:1px solid var(--border-color);padding-top:0.4rem;margin-top:0.2rem;">
                    <button class="btn" style="flex:1;padding:0.15rem;font-size:0.65rem;" disabled=${index === 0} onClick=${() => moveWidget(index, -1)}>
                      <i class="fa-solid fa-arrow-up"></i> Move Up
                    </button>
                    <button class="btn" style="flex:1;padding:0.15rem;font-size:0.65rem;" disabled=${index === widgetOrder.length - 1} onClick=${() => moveWidget(index, 1)}>
                      <i class="fa-solid fa-arrow-down"></i> Move Down
                    </button>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>
      `}

      <!-- Dynamic Render List -->
      <div style="display:flex;flex-direction:column;gap:1.5rem;">
        ${widgetOrder.map(key => renderWidget(key))}
      </div>
    </div>`;
};

const ProjectLeadSummaryWidget = ({ ledProjects, tasks, currentUser, setActiveTab }) => {
  const pendingApprovalsCount = (tasks || []).filter(t => {
    const proj = ledProjects.find(p => p.id === t.project_id);
    return proj && t.approval_status === 'pending_lead_approval';
  }).length;

  return html`
    <div class="metric-card" style="padding: 1.5rem; margin-top: 1.5rem; margin-bottom: 1.5rem; border-left: 4px solid var(--accent-yellow); background: linear-gradient(135deg, rgba(234, 179, 8, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%); display: flex; justify-content: space-between; align-items: center; gap: 1.5rem; flex-wrap: wrap; border-radius: 8px;">
      <div style="display: flex; align-items: center; gap: 1.25rem;">
        <div style="width: 3rem; height: 3rem; border-radius: 50%; background: rgba(234, 179, 8, 0.15); display: flex; align-items: center; justify-content: center; color: var(--accent-yellow); font-size: 1.5rem; flex-shrink: 0; box-shadow: 0 4px 12px rgba(234, 179, 8, 0.1);">
          <i class="fa-solid fa-crown"></i>
        </div>
        <div>
          <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-primary); margin: 0 0 0.25rem 0; display: flex; align-items: center; gap: 0.5rem;">
            Project Lead View
          </h3>
          <p style="font-size: 0.82rem; color: var(--text-secondary); margin: 0; line-height: 1.4;">
            You are directing <strong style="color: var(--text-primary);">${ledProjects.length}</strong> project${ledProjects.length > 1 ? 's' : ''}. 
            ${pendingApprovalsCount > 0 
              ? html`There ${pendingApprovalsCount === 1 ? 'is' : 'are'} <strong style="color: var(--accent-yellow);">${pendingApprovalsCount}</strong> pending task assignment${pendingApprovalsCount === 1 ? '' : 's'} awaiting your review.`
              : 'All task assignments are currently approved.'
            }
          </p>
        </div>
      </div>
      <button class="btn" style="background: var(--accent-yellow); color: #0f172a; font-weight: 700; padding: 0.6rem 1.2rem; font-size: 0.82rem; display: flex; align-items: center; gap: 0.5rem; border: none; border-radius: 6px; box-shadow: 0 4px 10px rgba(234, 179, 8, 0.2); transition: all 0.2s;" onClick=${() => setActiveTab('lead_dashboard')}>
        Go to Lead Dashboard <i class="fa-solid fa-arrow-right"></i>
      </button>
    </div>
  `;
};

/* ─────────────────────────────────────────────────────────────────
   EXPORT: RoleDashboard — picks the right view based on role
   ───────────────────────────────────────────────────────────────── */
export const RoleDashboard = ({ currentUser, tasks, projects, users, setActiveTab, openPhaseModal }) => {
  const [configLoading, setConfigLoading] = useState(true);
  const [dbConfig, setDbConfig] = useState({
    widgets: {},
    widgetOrder: [],
    personal_shortcuts: []
  });
  const [savedIndicator, setSavedIndicator] = useState(false);
  const [teamsList, setTeamsList] = useState([]);

  useEffect(() => {
    let active = true;
    const fetchConfig = async () => {
      try {
        const res = await apiFetch('/api/users/me/config');
        if (res.ok && active) {
          const data = await res.json();
          const config = data.dashboard_config || {};
          
          // Determine default fallbacks based on user role
          let defaultWidgets = {};
          let defaultOrder = [];
          
          if (hasPermission(currentUser, 'admin.panel')) {
            defaultWidgets = ADMIN_DEFAULTS.widgets;
            defaultOrder = ADMIN_DEFAULTS.widgetOrder;
          } else if (hasPermission(currentUser, 'task.approve')) {
            defaultWidgets = LEADER_DEFAULTS.widgets;
            defaultOrder = LEADER_DEFAULTS.widgetOrder;
          } else {
            defaultWidgets = MEMBER_DEFAULTS.widgets;
            defaultOrder = MEMBER_DEFAULTS.widgetOrder;
          }

          setDbConfig({
            widgets: { ...defaultWidgets, ...(config.widgets || {}) },
            widgetOrder: config.widgetOrder && config.widgetOrder.length > 0 ? config.widgetOrder : defaultOrder,
            personal_shortcuts: config.personal_shortcuts || []
          });

          if (data.teams) {
            setTeamsList(data.teams);
          } else if (data.team) {
            setTeamsList([data.team]);
          }
        }
      } catch (err) {
        console.error("Error fetching dashboard config:", err);
      } finally {
        if (active) setConfigLoading(false);
      }
    };

    fetchConfig();
    return () => { active = false; };
  }, [currentUser]);

  const saveConfig = async (newConfig) => {
    setDbConfig(newConfig);
    try {
      const res = await apiFetch('/api/users/me/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dashboard_config: newConfig })
      });
      if (res.ok) {
        setSavedIndicator(true);
        setTimeout(() => setSavedIndicator(false), 2000);
      }
    } catch (err) {
      console.error("Error saving dashboard config:", err);
    }
  };

  if (configLoading) {
    return html`
      <div style="display:flex;align-items:center;justify-content:center;height:50vh;color:var(--text-secondary);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem;margin-right:1rem;color:var(--accent-blue);"></i>
        Loading custom dashboard...
      </div>`;
  }

  const isAdmin = hasPermission(currentUser, 'admin.panel');
  const isLeader = hasPermission(currentUser, 'task.approve');
  const isMember = !isLeader && !isAdmin;

  return html`
    <div style="position:relative;">
      <!-- Floating settings saved indicator -->
      ${savedIndicator && html`
        <div style="position:fixed;bottom:2rem;right:2rem;background:#10b981;color:white;padding:0.75rem 1.5rem;border-radius:8px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);z-index:9999;display:flex;align-items:center;gap:0.5rem;font-weight:600;font-size:0.88rem;animation:slideDown 0.2s ease-out;">
          <i class="fa-solid fa-circle-check"></i>
          Settings Saved
        </div>
      `}

      ${isMember && html`
        <div>
          <${MemberHome} 
            currentUser=${currentUser} 
            tasks=${tasks} 
            projects=${projects} 
            setActiveTab=${setActiveTab}
            dbConfig=${dbConfig}
            saveConfig=${saveConfig}
            teamsList=${teamsList}
          />
          ${(projects || []).filter(p => p.project_lead_id === currentUser.id).length > 0 && html`
            <div class="dashboard-divider" style="margin: 2rem 0; border-top: 1px dashed var(--border-color); position: relative; text-align: center;">
              <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: var(--bg-primary); padding: 0 1rem; color: var(--text-secondary); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Project Lead View</span>
            </div>
            <${ProjectLeadSummaryWidget} 
              ledProjects=${(projects || []).filter(p => p.project_lead_id === currentUser.id)} 
              tasks=${tasks} 
              currentUser=${currentUser} 
              setActiveTab=${setActiveTab} 
            />
          `}
        </div>
      `}

      ${(isLeader && !isAdmin) && html`
        <${LeaderHome} 
          currentUser=${currentUser} 
          tasks=${tasks} 
          projects=${projects} 
          users=${users} 
          setActiveTab=${setActiveTab} 
          openPhaseModal=${openPhaseModal}
          dbConfig=${dbConfig}
          saveConfig=${saveConfig}
          teamsList=${teamsList}
        />
      `}

      ${(isLeader && isAdmin) && html`
        <div>
          <div class="sticky-section-header team-view-header">
            <i class="fa-solid fa-people-group"></i> Your Team View
          </div>
          <div style="margin-bottom: 2.5rem;">
            <${LeaderHome} 
              currentUser=${currentUser} 
              tasks=${tasks} 
              projects=${projects} 
              users=${users} 
              setActiveTab=${setActiveTab} 
              openPhaseModal=${openPhaseModal}
              dbConfig=${dbConfig}
              saveConfig=${saveConfig}
              teamsList=${teamsList}
            />
          </div>
          
          <div class="dashboard-divider">
            <span>Executive Dashboard Divider</span>
          </div>

          <div class="sticky-section-header admin-view-header">
            <i class="fa-solid fa-gauge-high"></i> Admin Overview
          </div>
          <div>
            <${AdminHome} 
              currentUser=${currentUser} 
              tasks=${tasks} 
              projects=${projects} 
              users=${users} 
              setActiveTab=${setActiveTab}
              dbConfig=${dbConfig}
              saveConfig=${saveConfig}
              teamsList=${teamsList}
            />
          </div>
        </div>
      `}

      ${(isAdmin && !isLeader) && html`
        <${AdminHome} 
          currentUser=${currentUser} 
          tasks=${tasks} 
          projects=${projects} 
          users=${users} 
          setActiveTab=${setActiveTab}
          dbConfig=${dbConfig}
          saveConfig=${saveConfig}
          teamsList=${teamsList}
        />
      `}
    </div>
  `;
};
