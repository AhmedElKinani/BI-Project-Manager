import { h, render } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
import { getPhases, getPhasesObj, getTeams, getTeamPhases } from './configStore.js';

export const html = htm.bind(h);

export const apiFetch = (url, opts = {}) => {
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
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

  // Determine visual variant
  const isDanger = /delete|permanently|cannot be undone|remove/i.test(config.title + ' ' + config.message);
  const isAlert  = config.type === 'alert';
  const isPrompt = config.type === 'prompt';

  const accentColor = isDanger && !isAlert
    ? 'var(--accent-pink)'
    : isAlert
      ? 'var(--accent-orange)'
      : isPrompt
        ? 'var(--accent-blue)'
        : 'var(--accent-blue)';

  const iconClass = isDanger && !isAlert
    ? 'fa-triangle-exclamation'
    : isAlert
      ? 'fa-circle-info'
      : isPrompt
        ? 'fa-pen-to-square'
        : 'fa-circle-question';

  const confirmBtnStyle = isDanger
    ? 'background:var(--accent-pink);color:white;'
    : isAlert
      ? 'background:var(--accent-orange);color:white;'
      : 'background:var(--accent-blue);color:white;';

  return html`
    <div class="modal-overlay" onClick=${(e) => e.target === e.currentTarget && close(isPrompt ? null : false)}>
      <div class="modal-content" style="max-width:480px;animation:slideUpIn 0.18s cubic-bezier(0.34,1.56,0.64,1);">
        <!-- Header -->
        <div style="padding:1.5rem 1.5rem 0;display:flex;align-items:flex-start;gap:1rem;">
          <div style="flex-shrink:0;width:40px;height:40px;border-radius:10px;background:${accentColor}18;border:1px solid ${accentColor}30;display:flex;align-items:center;justify-content:center;">
            <i class="fa-solid ${iconClass}" style="color:${accentColor};font-size:1rem;"></i>
          </div>
          <div style="flex:1;min-width:0;">
            <h3 style="margin:0 0 0.35rem;font-size:1rem;font-weight:700;color:var(--text-primary);line-height:1.3;">${config.title}</h3>
            <p style="margin:0;font-size:0.83rem;color:var(--text-secondary);line-height:1.5;white-space:pre-line;">${config.message}</p>
          </div>
          <button style="flex-shrink:0;background:transparent;border:none;color:var(--text-secondary);cursor:pointer;padding:0.1rem;font-size:1rem;line-height:1;margin-top:-0.2rem;transition:color 0.15s;"
            onMouseEnter=${e => e.target.style.color='var(--text-primary)'}
            onMouseLeave=${e => e.target.style.color='var(--text-secondary)'}
            onClick=${() => close(isPrompt ? null : false)}
            aria-label="Close dialog">✕</button>
        </div>

        <!-- Prompt input -->
        ${isPrompt && html`
          <div style="padding:1rem 1.5rem 0;">
            <input
              class="form-input"
              style="width:100%;"
              value=${promptValue}
              onInput=${(e) => setPromptValue(e.target.value)}
              onKeyDown=${(e) => {
                if (e.key === 'Enter') close(promptValue);
                if (e.key === 'Escape') close(null);
              }}
              autofocus
            />
          </div>
        `}

        <!-- Footer -->
        <div style="padding:1.25rem 1.5rem;display:flex;justify-content:flex-end;gap:0.6rem;margin-top:0.25rem;">
          ${config.type !== 'alert' && html`
            <button class="btn" style="min-width:80px;" onClick=${() => close(isPrompt ? null : false)}>Cancel</button>
          `}
          <button
            class="btn active"
            style="${confirmBtnStyle}min-width:80px;"
            onClick=${() => close(isPrompt ? promptValue : true)}
          >
            ${isAlert ? 'OK' : isPrompt ? 'Submit' : isDanger ? html`<i class="fa-solid fa-trash" style="margin-right:0.3rem;"></i>Confirm` : 'Confirm'}
          </button>
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
  const phasesObj = getPhasesObj();
  const found = phasesObj.find(p => p.name === phase);
  return found ? found.color_class : 'color-dep';
};

// Determines the primary team responsible for a given phase
export const getDefaultTeamForPhase = (phase) => {
  const teams = getTeams();
  for (const team of teams) {
    const phases = getTeamPhases(team);
    if (phases.includes(phase)) return team;
  }
  return teams[0] || '';
};



export const calculateOverallProgress = (project, tasks = []) => {
  if (project.phase === 'Deployed and in Use' || Boolean(Number(project.is_deployed))) return 100;
  
  const PHASES = getPhases();
  const currentPhaseIdx = PHASES.indexOf(project.phase);
  if (currentPhaseIdx === -1) return project.computed_progress || project.progress || 0;

  const coreTasks = tasks.filter(t => t.project_id === project.id && !t.post_production);

  if (coreTasks.length === 0) {
    const base = (currentPhaseIdx / PHASES.length) * 100;
    return Math.min(100, Math.round(base));
  }

  let totalPct = 0;
  const phaseWeight = 100 / PHASES.length;

  PHASES.forEach((phase, idx) => {
    const phaseTasks = coreTasks.filter(t => t.crisp_dm_phase === phase);
    let phaseProgress = 0;

    if (phaseTasks.length > 0) {
      const done = phaseTasks.filter(t => t.status === 'done').length;
      phaseProgress = (done / phaseTasks.length) * 100;
    } else {
      if (idx < currentPhaseIdx) phaseProgress = 100;
      else phaseProgress = 0;
    }

    totalPct += (phaseProgress / 100) * phaseWeight;
  });

  return Math.min(100, Math.round(totalPct));
};

// NEW: per-stream progress (team work on a specific phase)
export const getStreamProgress = (projectId, phaseName, teamName, tasks = []) => {
  const streamTasks = tasks.filter(t =>
    t.project_id === projectId &&
    t.crisp_dm_phase === phaseName &&
    t.team === teamName
  );
  if (streamTasks.length === 0) return null;
  const done = streamTasks.filter(t => t.status === 'done').length;
  return { 
    total: streamTasks.length, 
    done, 
    pct: Math.round((done / streamTasks.length) * 100) 
  };
};

export const calculateTimelineProgress = (project) => {
  if (!project.start_date || !project.target_date) return 0;
  const start = new Date(project.start_date).getTime();
  const end = new Date(project.target_date).getTime();
  const now = project.is_launched ? end : new Date().getTime();
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

export const getHealthStatus = (project, tasks = []) => {
  if (!project.start_date || !project.target_date) {
    return { label: 'No Dates Set', color: 'var(--text-secondary)' };
  }
  if (project.is_launched) {
    return { label: 'Launched', color: 'var(--accent-green)' };
  }
  const progress = project.computed_progress !== undefined ? project.computed_progress : calculateOverallProgress(project, tasks);
  const timeProgress = calculateTimelineProgress(project);
  
  const start = new Date(project.start_date).getTime();
  const end = new Date(project.target_date).getTime();
  if (end <= start) return { label: 'Invalid Dates', color: 'var(--text-secondary)' };

  const delta = progress - timeProgress; // Performance vs Time elapsed
  
  if (Math.abs(delta) < 5) return { label: 'On Track', color: 'var(--accent-blue)' };
  if (delta >= 5) return { label: 'Ahead by ' + Math.round(delta) + '%', color: 'var(--accent-green)' };
  return { label: 'Late by ' + Math.round(Math.abs(delta)) + '%', color: 'var(--accent-orange)' };
};



export const ProjectBadges = ({ project, onToggleDeploy, onToggleLaunched }) => {
  const isLive = Boolean(Number(project.is_deployed));
  const isLaunched = Boolean(project.is_launched);
  const isIterating = Boolean(Number(project.is_iterating));
  const iterationNum = project.iteration || 1;
  
  const baseStyle = "padding:0.15rem 0.3rem;font-size:0.6rem;border:1px solid currentColor;line-height:1;";
  const interactiveStyle = onToggleDeploy ? baseStyle + "cursor:pointer;transition:transform 0.1s ease-in-out;" : baseStyle;
  const launchInteractiveStyle = onToggleLaunched ? baseStyle + "cursor:pointer;transition:transform 0.1s ease-in-out;" : baseStyle;
  
  return html`
    <div style="display:flex;align-items:center;gap:0.3rem;margin-top:0.1rem;flex-wrap:wrap;">
      <span class="tag ${isLive ? 'color-green' : 'color-bu'}" 
            style=${interactiveStyle}
            title=${onToggleDeploy ? "Click to toggle production status" : ""}
            onClick=${(e) => { if (onToggleDeploy) { e.preventDefault(); e.stopPropagation(); onToggleDeploy(); } }}
            onMouseOver=${(e) => { if (onToggleDeploy) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseOut=${(e) => { if (onToggleDeploy) e.currentTarget.style.transform = 'scale(1)'; }}>
        ${isLive ? 'PRODUCTION' : 'NEW'}
      </span>
      ${isLaunched && html`<span class="tag color-purple" 
            style=${launchInteractiveStyle}
            title=${onToggleLaunched ? "Click to toggle launched (historical) status" : "Launched (historical) project"}
            onClick=${(e) => { if (onToggleLaunched) { e.preventDefault(); e.stopPropagation(); onToggleLaunched(); } }}
            onMouseOver=${(e) => { if (onToggleLaunched) e.currentTarget.style.transform = 'scale(1.05)'; }}
            onMouseOut=${(e) => { if (onToggleLaunched) e.currentTarget.style.transform = 'scale(1)'; }}>
        LAUNCHED
      </span>`}
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
  "analytics.read_all": ["can_read_all:Task", "can_read_all_tasks:Task"],
  "analytics.read_team": ["can_read_team:Task", "can_read_team_tasks:Task"],
  "analytics.read_own": ["can_read_own:Task", "can_read_own_tasks:Task"],
  "admin.panel": ["menu_access:AdminPanel"],
  "config.manage": ["can_manage:Config"],
  "messages.read": ["menu_access:Comms"],
  "messages.create": ["can_create:Message"]
};

export const hasPermission = (user, code) => {
  if (!user || !user.permissions) return false;
  const mappedCodes = new Set([code]);
  
  if (LEGACY_PERMISSION_MAP[code]) {
    LEGACY_PERMISSION_MAP[code].forEach(c => mappedCodes.add(c));
  }
  
  for (const [legacy, tokens] of Object.entries(LEGACY_PERMISSION_MAP)) {
    if (tokens.includes(code)) {
      mappedCodes.add(legacy);
      tokens.forEach(c => mappedCodes.add(c));
    }
  }
  
  return Array.from(mappedCodes).some(c => user.permissions.includes(c));
};


