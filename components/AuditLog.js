import { apiFetch } from '../utils/core.js';
// AuditLog.js — no configStore functions are required here

import { h } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

export const ACTION_ICON = {
  TASK_CREATED:        { icon: 'fa-plus-circle',      color: 'var(--accent-green)' },
  TASK_UPDATED:        { icon: 'fa-pen-to-square',    color: 'var(--accent-blue)' },
  TASK_DELETED:        { icon: 'fa-trash-can',         color: 'var(--accent-orange)' },
  TASK_STATUS_CHANGED: { icon: 'fa-arrows-rotate',    color: 'var(--accent-purple)' },
  PROJECT_UPDATED:     { icon: 'fa-folder-gear',      color: 'var(--accent-blue)' },
  PROJECT_NOTE_ADDED:  { icon: 'fa-comment-dots',     color: 'var(--accent-purple)' },
};

export const AuditLogTab = () => {
  const [logs, setLogs] = useState([]);
  const [filterAction, setFilterAction] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    const d = await (await apiFetch('/api/audit-logs')).json();
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


