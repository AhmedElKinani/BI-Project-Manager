import { h, render } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import { PHASES, TEAMS } from '../mockData.js';
export { PHASES, TEAMS };

export const html = htm.bind(h);

export const apiFetch = (url, opts = {}) => {
  const cu = (() => { try { return JSON.parse(localStorage.getItem('currentUser')); } catch { return {}; } })();
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-User': cu?.username || '',
      'X-Role': cu?.role || '',
      ...(opts.headers || {})
    }
  });
};

export const useSmartPoll = (fetchFn, activeInterval = 15000, hiddenInterval = 120000, deps = []) => {
  useEffect(() => {
    let timer;
    const executePoll = async () => {
      await fetchFn();
      const nextInterval = document.visibilityState === 'visible' ? activeInterval : hiddenInterval;
      timer = setTimeout(executePoll, nextInterval);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        executePoll(); // Immediate fetch on focus
      }
    };

    // Initial execution
    executePoll();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, deps);
};

export const APP_DIALOG_EVENT = 'bi:app-dialog';

export const openAppDialog = (config) => {
  if (typeof window === 'undefined') {
    return Promise.resolve(config?.type === 'prompt' ? null : false);
  }
  return new Promise((resolve) => {
    window.dispatchEvent(new CustomEvent(APP_DIALOG_EVENT, { detail: { config, resolve } }));
  });
};

export const appConfirm = (message, title = 'Please Confirm') =>
  openAppDialog({ type: 'confirm', title, message });

export const appAlert = (message, title = 'Notice') =>
  openAppDialog({ type: 'alert', title, message });

export const appPrompt = (message, defaultValue = '', title = 'Input Required') =>
  openAppDialog({ type: 'prompt', title, message, defaultValue });

export const AppDialogHost = () => {
  const [dialogReq, setDialogReq] = useState(null);
  const [promptValue, setPromptValue] = useState('');

  useEffect(() => {
    const handleDialog = (event) => {
      const req = event.detail;
      setDialogReq(req);
      setPromptValue(req?.config?.defaultValue ?? '');
    };
    window.addEventListener(APP_DIALOG_EVENT, handleDialog);
    return () => window.removeEventListener(APP_DIALOG_EVENT, handleDialog);
  }, []);

  if (!dialogReq) return null;

  const { config, resolve } = dialogReq;
  const close = (value) => {
    resolve(value);
    setDialogReq(null);
  };

  const titleColor = config.type === 'alert'
    ? 'var(--accent-orange)'
    : config.type === 'prompt'
      ? 'var(--accent-blue)'
      : 'var(--accent-purple)';

  return html`
    <div class="modal-overlay" onClick=${(e) => e.target === e.currentTarget && close(config.type === 'prompt' ? null : false)}>
      <div class="modal-content" style="max-width:520px;">
        <div class="modal-header">
          <div>
            <h3 style="margin:0;font-size:1.1rem;color:${titleColor};">${config.title}</h3>
            <p style="margin:0.5rem 0 0 0;font-size:0.82rem;color:var(--text-secondary);">${config.message}</p>
          </div>
          <button class="modal-close" onClick=${() => close(config.type === 'prompt' ? null : false)}>x</button>
        </div>
        <div class="modal-body" style="padding:1.2rem 1.5rem;">
          ${config.type === 'prompt' && html`
            <input
              class="form-input"
              style="width:100%;margin-bottom:1rem;"
              value=${promptValue}
              onInput=${(e) => setPromptValue(e.target.value)}
              onKeyDown=${(e) => {
                if (e.key === 'Enter') close(promptValue);
                if (e.key === 'Escape') close(null);
              }}
              autofocus
            />
          `}
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;">
            ${config.type !== 'alert' && html`
              <button class="btn" onClick=${() => close(config.type === 'prompt' ? null : false)}>Cancel</button>
            `}
            <button
              class="btn active"
              style="background:${config.type === 'alert' ? 'var(--accent-orange)' : 'var(--accent-blue)'};color:white;"
              onClick=${() => close(config.type === 'prompt' ? promptValue : true)}
            >
              ${config.type === 'alert' ? 'OK' : 'Confirm'}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
};



export const getInitials = (name) => name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

export const formatDuration = (startStr, endStr) => {
  if (!startStr || !endStr) return { label: '—', days: null, hours: null };
  const ms = Math.max(0, new Date(endStr) - new Date(startStr));
  const hrs = ms / (1000 * 3600);
  const d = Math.floor(hrs / 24);
  const h = Math.round(hrs % 24);
  const label = d > 0 ? `${d}d ${h}h` : `${h}h`;
  return { label, days: hrs / 24, hours: hrs };
};
export const getTeamClass = (team) => {
  if (!team) return '';
  if (team.includes('Dev')) return 'color-dev';
  if (team.includes('Eng')) return 'color-de';
  if (team.includes('Sci')) return 'color-ds';
  return '';
};

export const getPhaseClass = (phase) => {
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
export const getDefaultTeamForPhase = (phase) => {
  if (phase === 'Data Preparation') return 'Data Engineering Team';
  if (['Deployment', 'Waiting for Stakeholder Approval', 'Deployed and in Use'].includes(phase)) return 'Development Team';
  return 'Data Science/Analysis Team';
};

// ALL PHASES that each team is authorised to work in (scoped task creation).
export const TEAM_PHASES = {
  'Data Engineering Team':        ['Data Understanding', 'Data Preparation', 'Deployment'],
  'Development Team':             ['Deployment', 'Waiting for Stakeholder Approval', 'Deployed and in Use'],
  'Data Science/Analysis Team':   ['Business Understanding', 'Data Understanding', 'Data Preparation',
                                   'Modeling', 'Evaluation', 'Waiting for Stakeholder Approval',
                                   'Deployed and in Use'] // Post-production analysis is done here
};



export const calculateOverallProgress = (project) => {
  if (project.phase === 'Deployed and in Use') return 100;
  const idx = PHASES.indexOf(project.phase);
  if (idx === -1) return 0;
  const base = (idx / PHASES.length) * 100;
  const intra = (project.progress / 100) * (100 / PHASES.length);
  return Math.min(100, Math.round(base + intra));
};

export const calculateTimelineProgress = (project) => {
  if (!project.start_date || !project.target_date) return 0;
  const start = new Date(project.start_date).getTime();
  const end = new Date(project.target_date).getTime();
  const now = new Date().getTime();
  if (end <= start) return 100;
  if (now <= start) return 0;
  if (now >= end) return 100;
  return Math.round(((now - start) / (end - start)) * 100);
};


export const markdownToHtml = (md) => {
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

export const sendNotification = async (user_id, message, related_task_id=null) => {
  if(!user_id) return;
  await apiFetch('/api/notifications', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id, message, related_task_id })
  });
};

// Posts a system message to a team channel. Use [TASK:id:title] to embed clickable task links.
export const sendChannelMessage = async (channelName, sender, content) => {
  if (!channelName || !content) return;
  await apiFetch('/api/messages', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel_name: channelName, sender, content })
  });
};

// Parses a message and renders [TASK:id:title] tokens as clickable badges
export const parseMessageContent = (content, onTaskClick) => {
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

export const getHealthStatus = (project) => {
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



export const ProjectBadges = ({ project, onToggleDeploy }) => {
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



export const logAudit = (currentUser, action, details) => {
  if (!currentUser) return;
  apiFetch('/api/audit-logs', {
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


