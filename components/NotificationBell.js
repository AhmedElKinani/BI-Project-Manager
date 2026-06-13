import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useCallback } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import { apiFetch } from '../utils/core.js';
const html = htm.bind(h);

// ── Category metadata ────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'all',     label: 'All',      icon: 'fa-bell' },
  { id: 'task',    label: 'Tasks',    icon: 'fa-list-check',    color: 'var(--accent-blue)' },
  { id: 'project', label: 'Projects', icon: 'fa-folder-tree',   color: 'var(--accent-purple)' },
  { id: 'comment', label: 'Comments', icon: 'fa-comment',       color: 'var(--accent-teal)' },
  { id: 'admin',   label: 'Admin',    icon: 'fa-shield-halved', color: 'var(--accent-pink)' },
  { id: 'general', label: 'General',  icon: 'fa-circle-info',   color: 'var(--text-secondary)' },
];

// ── Date grouping ────────────────────────────────────────────────────────────
const getDateGroup = (dateStr) => {
  if (!dateStr) return 'Older';
  try {
    const now = new Date();
    const d = new Date(dateStr.replace(' ', 'T'));
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 1) return 'Today';
    if (diffDays < 2) return 'Yesterday';
    if (diffDays < 7) return 'This Week';
    return 'Older';
  } catch { return 'Older'; }
};

const DATE_GROUP_ORDER = ['Today', 'Yesterday', 'This Week', 'Older'];

// ── Relative time ────────────────────────────────────────────────────────────
const relativeTime = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr.replace(' ', 'T'));
    const diffSec = Math.floor((Date.now() - d) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 172800) return 'Yesterday';
    return d.toLocaleDateString();
  } catch { return ''; }
};

// ── getCategoryMeta helper ───────────────────────────────────────────────────
const getCatMeta = (catId) => CATEGORIES.find(c => c.id === catId) || CATEGORIES[CATEGORIES.length - 1];

// ── Main Component ───────────────────────────────────────────────────────────
export const NotificationBell = ({ currentUser, onNavigate }) => {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen]         = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchNotifs = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await apiFetch('/api/notifications');
      if (res.ok) setNotifications(await res.json());
    } catch(e) {}
  }, [currentUser]);

  useEffect(() => {
    fetchNotifs();
    const iv = setInterval(fetchNotifs, 15000);
    return () => clearInterval(iv);
  }, [fetchNotifs]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // ── Per-item read ────────────────────────────────────────────────────────
  const markRead = async (notif) => {
    if (notif.is_read) return;
    setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: 1 } : n));
    await apiFetch('/api/notifications/' + notif.id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_read: 1 })
    });
  };

  // ── Click notification ───────────────────────────────────────────────────
  const handleNotifClick = async (notif) => {
    await markRead(notif);
    if (notif.related_task_id && onNavigate) {
      onNavigate('my_tasks', { taskId: notif.related_task_id });
      setOpen(false);
    }
  };

  // ── Mark all read ────────────────────────────────────────────────────────
  const markAllRead = async () => {
    setBulkLoading(true);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    await apiFetch('/api/notifications/mark-all-read', { method: 'PUT' });
    setBulkLoading(false);
    fetchNotifs();
  };

  // ── Clear all read ───────────────────────────────────────────────────────
  const clearAllRead = async () => {
    setBulkLoading(true);
    setNotifications(prev => prev.filter(n => !n.is_read));
    await apiFetch('/api/notifications/clear-read', { method: 'DELETE' });
    setBulkLoading(false);
    fetchNotifs();
  };

  // ── Delete single ────────────────────────────────────────────────────────
  const deleteNotif = async (e, notif) => {
    e.stopPropagation();
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    await apiFetch('/api/notifications/' + notif.id, { method: 'DELETE' });
  };

  // ── Filtered + grouped list ──────────────────────────────────────────────
  const filtered = activeTab === 'all'
    ? notifications
    : notifications.filter(n => n.category === activeTab);

  const grouped = DATE_GROUP_ORDER.reduce((acc, group) => {
    const items = filtered.filter(n => getDateGroup(n.created_at) === group);
    if (items.length > 0) acc[group] = items;
    return acc;
  }, {});

  // ── Unread counts per category ───────────────────────────────────────────
  const unreadPerCat = CATEGORIES.reduce((acc, cat) => {
    if (cat.id === 'all') {
      acc['all'] = notifications.filter(n => !n.is_read).length;
    } else {
      acc[cat.id] = notifications.filter(n => !n.is_read && n.category === cat.id).length;
    }
    return acc;
  }, {});

  const hasReadNotifs = notifications.some(n => n.is_read);

  return html`
    <div style="position:relative;margin-right:1rem;">

      <!-- Bell button -->
      <button class="btn" id="notif-bell-btn" style="position:relative;" onClick=${() => setOpen(!open)}>
        <i class="fa-solid fa-bell"></i>
        ${unreadCount > 0 && html`<span class="notif-badge">${unreadCount > 99 ? '99+' : unreadCount}</span>`}
      </button>

      ${open && html`
        <!-- Outside-click overlay -->
        <div class="notif-overlay" onClick=${() => setOpen(false)}></div>

        <!-- Panel -->
        <div class="notif-dropdown" id="notif-panel">

          <!-- Header -->
          <div class="notif-header">
            <span class="notif-title">
              <i class="fa-solid fa-bell" style="margin-right:0.4rem;color:var(--accent-blue);"></i>
              Notifications
            </span>
            <div class="notif-header-actions">
              ${unreadCount > 0 && html`
                <button class="notif-action-btn" id="notif-mark-all-btn"
                  onClick=${markAllRead} disabled=${bulkLoading}
                  title="Mark all as read">
                  <i class="fa-solid fa-check-double"></i>
                  <span>Mark all</span>
                </button>
              `}
              ${hasReadNotifs && html`
                <button class="notif-action-btn notif-action-danger" id="notif-clear-read-btn"
                  onClick=${clearAllRead} disabled=${bulkLoading}
                  title="Clear all read notifications">
                  <i class="fa-solid fa-trash-can"></i>
                  <span>Clear read</span>
                </button>
              `}
            </div>
          </div>

          <!-- Tab bar -->
          <div class="notif-tab-bar" id="notif-tab-bar">
            ${CATEGORIES.map(cat => html`
              <button
                key=${cat.id}
                class=${'notif-tab' + (activeTab === cat.id ? ' active' : '')}
                id=${'notif-tab-' + cat.id}
                onClick=${() => setActiveTab(cat.id)}>
                <i class=${'fa-solid ' + cat.icon} style=${cat.color ? 'color:' + cat.color : ''}></i>
                <span>${cat.label}</span>
                ${unreadPerCat[cat.id] > 0 && html`
                  <span class="notif-tab-badge">${unreadPerCat[cat.id]}</span>
                `}
              </button>
            `)}
          </div>

          <!-- Notification list -->
          <div class="notif-list" id="notif-list">
            ${filtered.length === 0
              ? html`
                <div class="notif-empty">
                  <i class="fa-solid fa-circle-check"></i>
                  <p>All caught up ✧</p>
                  <span>No ${activeTab === 'all' ? '' : (getCatMeta(activeTab).label + ' ')}notifications here.</span>
                </div>
              `
              : Object.entries(grouped).map(([group, items]) => html`
                <div key=${group}>
                  <div class="notif-group-label">${group}</div>
                  ${items.map(n => {
                    const meta = getCatMeta(n.category || 'general');
                    return html`
                      <div
                        key=${n.id}
                        class=${'notif-item' + (!n.is_read ? ' unread' : '')}
                        onClick=${() => handleNotifClick(n)}
                        title=${n.related_task_id ? 'Click to view task' : ''}
                        style=${n.related_task_id ? 'cursor:pointer' : ''}>
                        <div class="notif-item-icon" style=${'color:' + (meta.color || 'var(--text-secondary)')}>
                          <i class=${'fa-solid ' + meta.icon}></i>
                        </div>
                        <div class="notif-item-body">
                          <div class=${'notif-item-msg' + (!n.is_read ? ' bold' : '')}>${n.message}</div>
                          <div class="notif-item-time">${relativeTime(n.created_at)}</div>
                        </div>
                        <button
                          class="notif-item-delete"
                          onClick=${(e) => deleteNotif(e, n)}
                          title="Dismiss notification">
                          <i class="fa-solid fa-xmark"></i>
                        </button>
                      </div>
                    `;
                  })}
                </div>
              `)
            }
          </div>

        </div>
      `}
    </div>
  `;
};
