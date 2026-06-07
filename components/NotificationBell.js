import { h } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import { apiFetch } from '../utils/core.js';
const html = htm.bind(h);

export const NotificationBell = ({ currentUser }) => {
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);

  const fetchNotifs = async () => {
    if (!currentUser) return;
    try {
      const res = await apiFetch('/api/notifications?user_id=' + encodeURIComponent(currentUser.username));
      if(res.ok) setNotifications(await res.json());
    } catch(e) {}
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 10000); // 10s polling
    return () => clearInterval(interval);
  }, [currentUser]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markRead = async (notif) => {
    if(notif.is_read) return;
    await apiFetch('/api/notifications/' + notif.id, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({is_read: 1})});
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
