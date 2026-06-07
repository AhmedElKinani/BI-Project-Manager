import { getPhaseClass, getHealthStatus, calculateOverallProgress, calculateTimelineProgress, getInitials, apiFetch } from '../utils/core.js';
import { getPhases } from '../utils/configStore.js';
import { STATUS_META } from './TaskManagement.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useRef, useMemo } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

/* ─── CSS injected once ─────────────────────────────────────── */
const DRAWER_STYLE = `
.deep-dive-overlay {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0); transition: background 0.3s ease;
  pointer-events: none;
}
.deep-dive-overlay.open {
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(3px);
  pointer-events: all;
}
.deep-dive-drawer {
  position: fixed; top: 0; right: 0; bottom: 0;
  width: min(660px, 95vw);
  background: var(--bg-color);
  border-left: 1px solid rgba(255,255,255,0.1);
  box-shadow: -12px 0 48px rgba(0,0,0,0.4);
  display: flex; flex-direction: column;
  transform: translateX(100%);
  transition: transform 0.35s cubic-bezier(0.16,1,0.3,1);
  z-index: 201;
}
.deep-dive-drawer.open { transform: translateX(0); }
.drawer-breadcrumb {
  display: flex; align-items: center; gap: 0.4rem;
  padding: 0.6rem 1.75rem;
  background: rgba(59,130,246,0.06);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.75rem; flex-shrink: 0;
}
.drawer-breadcrumb button {
  background: none; border: none; cursor: pointer;
  color: var(--accent-blue); font-size: 0.75rem; padding: 0;
  display: flex; align-items: center; gap: 0.3rem;
  transition: opacity 0.15s;
}
.drawer-breadcrumb button:hover { opacity: 0.7; }
.drawer-breadcrumb .crumb-sep { color: var(--text-secondary); }
.drawer-header {
  padding: 1.5rem 1.75rem 1.25rem;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  flex-shrink: 0;
}
.drawer-body {
  flex: 1; overflow-y: auto; padding: 1.5rem 1.75rem;
  overscroll-behavior: contain;
}
.drawer-section { margin-bottom: 1.75rem; }
.drawer-section-title {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--text-secondary);
  margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.4rem;
}
.timeline-entry {
  position: relative; padding: 0.6rem 0 0.6rem 1.5rem;
  border-left: 2px solid var(--border-color);
}
.timeline-entry:last-child { border-left-color: transparent; }
.timeline-dot {
  position: absolute; left: -5px; top: 0.8rem;
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent-blue);
  border: 2px solid var(--bg-color);
}
.phase-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.6rem 0.9rem; border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel); margin-bottom: 0.4rem;
  transition: var(--transition);
}
.phase-row:hover { border-color: var(--accent-blue); }
`;

let styleInjected = false;
const injectStyle = () => {
  if (styleInjected) return;
  const el = document.createElement('style');
  el.textContent = DRAWER_STYLE;
  document.head.appendChild(el);
  styleInjected = true;
};

/* ─── Project Deep Dive ─────────────────────────────────────── */
const ProjectDeepDive = ({ project, tasks, onTaskClick }) => {
  const pTasks   = (tasks || []).filter(t => t.project_id === project.id);
  const coreTasks = pTasks.filter(t => !t.post_production);
  const postProd  = pTasks.filter(t => t.post_production);
  const overall  = project.computed_progress !== undefined ? project.computed_progress : calculateOverallProgress(project, tasks);
  const timeline = calculateTimelineProgress(project);
  const health   = getHealthStatus(project, tasks);

  // Phase-by-phase breakdown — memoized to avoid recalculation on every render
  const phases = getPhases();
  const phaseData = useMemo(() => phases.map(ph => {
    const phTasks  = coreTasks.filter(t => t.crisp_dm_phase === ph);
    const done     = phTasks.filter(t => t.status === 'done').length;
    const pct      = phTasks.length > 0 ? Math.round(done / phTasks.length * 100) : null;
    const isCurrent = project.phase === ph;
    const teams    = [...new Set(phTasks.map(t => t.team).filter(Boolean))];
    const overdue  = phTasks.filter(t => t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date()).length;
    return { ph, phTasks, done, pct, isCurrent, teams, overdue };
  }), [coreTasks, project.phase]);

  const stakeholders = Array.isArray(project.stakeholders) ? project.stakeholders
    : (project.stakeholders && project.stakeholders !== '[]' ? JSON.parse(project.stakeholders || '[]') : []);

  return html`
    <!-- Identity -->
    <div class="drawer-section">
      <div class="drawer-section-title"><i class="fa-solid fa-circle-info"></i> Project Details</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.6rem;">
        ${[
          ['ID',          project.id,         'fa-fingerprint'],
          ['Owner',       project.assignee || '—', 'fa-user'],
          ['Start',       project.start_date || '—', 'fa-calendar'],
          ['Target',      project.target_date || '—', 'fa-flag'],
          ['Team',        project.team || '—', 'fa-people-group'],
          ['Iteration',   `v${project.iteration || 1}`, 'fa-code-branch'],
        ].map(([label, val, icon]) => html`
          <div style="background:var(--bg-panel);border:1px solid var(--border-color);border-radius:8px;padding:0.6rem 0.8rem;">
            <div style="font-size:0.65rem;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.2rem;">
              <i class="fa-solid ${icon}" style="margin-right:0.3rem;"></i>${label}
            </div>
            <div style="font-size:0.88rem;font-weight:600;">${val}</div>
          </div>`)}
      </div>
      ${project.description && html`
        <div style="margin-top:0.75rem;padding:0.75rem;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:8px;font-size:0.85rem;color:var(--text-secondary);line-height:1.5;">
          ${project.description}
        </div>`}
    </div>

    <!-- Progress vs Timeline -->
    <div class="drawer-section">
      <div class="drawer-section-title"><i class="fa-solid fa-chart-line"></i> Progress vs Timeline</div>
      <div style="margin-bottom:0.75rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.78rem;margin-bottom:0.4rem;">
          <span style="color:var(--accent-blue);font-weight:600;">Completion: ${overall}%</span>
          <span style="color:var(--text-secondary);">Time elapsed: ${timeline}%</span>
        </div>
        <div style="position:relative;height:10px;background:rgba(255,255,255,0.06);border-radius:5px;overflow:hidden;">
          <div style="position:absolute;top:0;left:0;height:100%;width:${timeline}%;background:var(--text-secondary);opacity:0.25;"></div>
          <div style="position:absolute;top:0;left:0;height:100%;width:${overall}%;background:${health.color};border-radius:5px;box-shadow:0 0 8px ${health.color}55;transition:width 0.5s;"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:0.72rem;margin-top:0.3rem;">
          <span style="color:${health.color};font-weight:700;">${health.label}</span>
          <span style="color:var(--text-secondary);">${coreTasks.filter(t=>t.status==='done').length} / ${coreTasks.length} core tasks done</span>
        </div>
      </div>
    </div>

    <!-- Phase Breakdown -->
    <div class="drawer-section">
      <div class="drawer-section-title"><i class="fa-solid fa-layer-group"></i> Phase Breakdown</div>
      ${phaseData.map(({ ph, phTasks, done, pct, isCurrent, teams, overdue }) => html`
        <div class="phase-row" style="${isCurrent ? 'border-color:var(--accent-blue);background:rgba(59,130,246,0.07);' : ''}">
          <span class="tag ${getPhaseClass(ph)}" style="font-size:0.62rem;flex-shrink:0;">${ph.split(' ').slice(0,2).join(' ')}</span>
          <div style="flex:1;min-width:0;">
            ${phTasks.length > 0 ? html`
              <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;margin-bottom:0.25rem;">
                <div style="height:100%;width:${pct}%;background:${isCurrent?'var(--accent-blue)':'var(--accent-green)'};border-radius:2px;"></div>
              </div>
              <div style="font-size:0.65rem;color:var(--text-secondary);">${done}/${phTasks.length} done · ${teams.join(', ')}</div>
            ` : html`<div style="font-size:0.65rem;color:var(--text-secondary);font-style:italic;">No tasks</div>`}
          </div>
          <div style="text-align:right;flex-shrink:0;">
            ${pct !== null ? html`<span style="font-size:0.8rem;font-weight:700;color:${isCurrent?'var(--accent-blue)':'var(--text-secondary)'};">${pct}%</span>` : ''}
            ${isCurrent ? html`<span style="display:block;font-size:0.6rem;color:var(--accent-blue);font-weight:700;">● ACTIVE</span>` : ''}
            ${overdue > 0 ? html`<span style="display:block;font-size:0.6rem;color:var(--accent-orange);">⚠ ${overdue} overdue</span>` : ''}
          </div>
        </div>`)}
    </div>

    <!-- Status History Timeline -->
    ${project.history && project.history.length > 0 && html`
      <div class="drawer-section">
        <div class="drawer-section-title"><i class="fa-solid fa-clock-rotate-left"></i> Status History (${project.history.length})</div>
        <div>
          ${[...project.history].reverse().map(h => html`
            <div class="timeline-entry">
              <div class="timeline-dot"></div>
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
                <div>
                  <div style="font-size:0.82rem;font-weight:600;margin-bottom:0.2rem;">${h.note || 'Status update'}</div>
                  <div style="font-size:0.7rem;color:var(--text-secondary);">
                    ${h.actor ? html`<i class="fa-solid fa-user" style="margin-right:0.25rem;"></i>${h.actor} ·` : ''} ${h.date}
                  </div>
                </div>
                ${h.phase && html`<span class="tag ${getPhaseClass(h.phase)}" style="font-size:0.6rem;flex-shrink:0;">${h.phase?.split(' ').slice(0,2).join(' ')}</span>`}
              </div>
            </div>`)}
        </div>
      </div>`}

    <!-- Blockers -->
    ${project.blockers && project.blockers.length > 0 && html`
      <div class="drawer-section">
        <div class="drawer-section-title"><i class="fa-solid fa-ban" style="color:var(--accent-orange);"></i> Active Blockers</div>
        ${project.blockers.map(b => html`
          <div style="padding:0.6rem 0.8rem;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:8px;margin-bottom:0.4rem;font-size:0.85rem;color:var(--accent-orange);">
            <i class="fa-solid fa-triangle-exclamation" style="margin-right:0.4rem;"></i>${b}
          </div>`)}
      </div>`}

    <!-- Stakeholders -->
    ${stakeholders.length > 0 && html`
      <div class="drawer-section">
        <div class="drawer-section-title"><i class="fa-solid fa-star"></i> Stakeholders</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.4rem;">
          ${stakeholders.map(s => html`
            <div style="display:flex;align-items:center;gap:0.4rem;padding:0.35rem 0.7rem;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);border-radius:20px;font-size:0.8rem;">
              <i class="fa-solid fa-star" style="font-size:0.6rem;color:var(--accent-orange);"></i>${s}
            </div>`)}
        </div>
      </div>`}

    <!-- Task list by phase -->
    ${coreTasks.length > 0 && html`
      <div class="drawer-section">
        <div class="drawer-section-title"><i class="fa-solid fa-list-check"></i> All Tasks (${coreTasks.length} core${postProd.length > 0 ? ` + ${postProd.length} post-prod` : ''})</div>
        ${coreTasks.map(t => {
          const meta = STATUS_META[t.status] || {};
          const isOverdue = t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date();
          return html`
            <div style="display:flex;align-items:center;gap:0.6rem;padding:0.55rem 0.75rem;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:8px;margin-bottom:0.35rem;cursor:pointer;transition:var(--transition);"
              onClick=${() => onTaskClick && onTaskClick(t)}
              onMouseEnter=${e => e.currentTarget.style.borderColor = 'var(--accent-blue)'}
              onMouseLeave=${e => e.currentTarget.style.borderColor = 'var(--border-color)'}>
              <span style="width:8px;height:8px;border-radius:50%;background:${meta.color};flex-shrink:0;"></span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:0.83rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${t.title}</div>
                <div style="font-size:0.68rem;color:var(--text-secondary);">${t.assignee || 'Unassigned'} · ${t.crisp_dm_phase}</div>
              </div>
              ${isOverdue && html`<span class="tag color-orange" style="font-size:0.58rem;flex-shrink:0;">LATE</span>`}
              <span class="tag" style="background:${meta.bg};color:${meta.color};font-size:0.65rem;flex-shrink:0;">${meta.label}</span>
            </div>`; })}
      </div>`}
  `;
};

/* ─── Task Deep Dive ─────────────────────────────────────────── */
const TaskDeepDive = ({ task, projects }) => {
  const [logs, setLogs] = useState([]);
  useEffect(() => {
    apiFetch(`/api/tasks/${task.id}/logs`).then(r => r.ok ? r.json() : []).then(setLogs).catch(() => {});
  }, [task.id]);

  const proj = (projects || []).find(p => p.id === task.project_id);
  const meta = STATUS_META[task.status] || {};
  const isOverdue = task.due_date && task.status !== 'done' && new Date(task.due_date) < new Date();

  const STATE_COLORS = {
    todo: 'var(--text-secondary)', in_progress: 'var(--accent-blue)',
    review: 'var(--accent-purple)', done: 'var(--accent-green)',
  };

  return html`
    <!-- Status & Priority -->
    <div class="drawer-section">
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:0.75rem;">
        <span class="tag" style="background:${meta.bg};color:${meta.color};">${meta.label}</span>
        <span class="tag" style="background:rgba(255,255,255,0.06);color:var(--text-primary);">
          <i class="fa-solid fa-flag" style="margin-right:0.25rem;font-size:0.65rem;"></i>${task.priority}
        </span>
        <span class="tag ${getPhaseClass(task.crisp_dm_phase)}">${task.crisp_dm_phase}</span>
        ${task.post_production && html`<span class="tag color-purple">Post-Production</span>`}
        ${isOverdue && html`<span class="tag color-orange">OVERDUE</span>`}
      </div>
      ${task.description && html`
        <div style="padding:0.75rem;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:8px;font-size:0.85rem;line-height:1.6;color:var(--text-secondary);">
          ${task.description}
        </div>`}
    </div>

    <!-- Details grid -->
    <div class="drawer-section">
      <div class="drawer-section-title"><i class="fa-solid fa-circle-info"></i> Task Details</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;">
        ${[
          ['Project',   proj ? proj.title : (task.project_id || '—'), 'fa-folder'],
          ['Assignee',  task.assignee || 'Unassigned', 'fa-user'],
          ['Team',      task.team || '—', 'fa-people-group'],
          ['Created by',task.created_by || '—', 'fa-pen'],
          ['Created',   task.created_at?.split(' ')[0] || '—', 'fa-calendar-plus'],
          ['Due',       task.due_date || '—', 'fa-calendar-check'],
          ['Est. Hours',task.estimated_hours ? `${task.estimated_hours}h` : '—', 'fa-clock'],
          ['Actual Hrs',task.actual_hours ? `${task.actual_hours}h` : '—', 'fa-stopwatch'],
        ].map(([label, val, icon]) => html`
          <div style="background:var(--bg-panel);border:1px solid var(--border-color);border-radius:8px;padding:0.55rem 0.75rem;">
            <div style="font-size:0.62rem;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.15rem;">
              <i class="fa-solid ${icon}" style="margin-right:0.25rem;"></i>${label}
            </div>
            <div style="font-size:0.85rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title=${val}>${val}</div>
          </div>`)}
      </div>
    </div>

    <!-- Resolution -->
    ${task.resolution_note && html`
      <div class="drawer-section">
        <div class="drawer-section-title"><i class="fa-solid fa-circle-check" style="color:var(--accent-green);"></i> Resolution</div>
        <div style="padding:0.75rem;background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.2);border-radius:8px;font-size:0.85rem;line-height:1.5;">
          ${task.resolution_note}
        </div>
      </div>`}

    <!-- State History Timeline -->
    <div class="drawer-section">
      <div class="drawer-section-title"><i class="fa-solid fa-clock-rotate-left"></i> State History${logs.length > 0 ? ` (${logs.length})` : ''}</div>
      ${logs.length === 0
        ? html`<div style="color:var(--text-secondary);font-style:italic;font-size:0.85rem;">No state change history yet.</div>`
        : html`<div>
            ${logs.map((log, i) => html`
              <div class="timeline-entry">
                <div class="timeline-dot" style="background:${STATE_COLORS[log.to_state] || 'var(--accent-blue)'}"></div>
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem;">
                  <div>
                    <div style="font-size:0.82rem;display:flex;align-items:center;gap:0.4rem;">
                      ${log.from_state ? html`
                        <span style="color:${STATE_COLORS[log.from_state]};font-weight:600;font-size:0.75rem;">${STATUS_META[log.from_state]?.label || log.from_state}</span>
                        <i class="fa-solid fa-arrow-right" style="font-size:0.6rem;color:var(--text-secondary);"></i>` : ''}
                      <span style="color:${STATE_COLORS[log.to_state]};font-weight:700;">${STATUS_META[log.to_state]?.label || log.to_state}</span>
                    </div>
                    <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.15rem;">
                      ${log.actor ? html`<i class="fa-solid fa-user" style="margin-right:0.25rem;"></i>${log.actor_name || `User #${log.actor_id}`} ·` : ''}
                      ${log.entered_at || ''}
                    </div>
                  </div>
                </div>
              </div>`)}
          </div>`}
    </div>
  `;
};

/* ─── Main DeepDiveDrawer ────────────────────────────────────── */
export const DeepDiveDrawer = ({ item, type, tasks, projects, onClose, onTaskClick }) => {
  // navStack: array of { item, type } — current view is the last entry
  const [navStack, setNavStack] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const overlayRef = useRef(null);
  const bodyRef = useRef(null);

  useEffect(() => { injectStyle(); }, []);

  // When the outer item/type changes, reset the stack
  useEffect(() => {
    if (item) {
      setNavStack([{ item, type }]);
      requestAnimationFrame(() => setIsOpen(true));
    } else {
      setIsOpen(false);
      setTimeout(() => setNavStack([]), 350);
    }
  }, [item, type]);

  // Scroll lock: prevent background scroll when open, compensate scrollbar width
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.paddingRight = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isOpen]);

  // Escape key
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [isOpen]);

  // Reset drawer body scroll when navigating
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [navStack.length]);

  if (navStack.length === 0) return null;

  const current = navStack[navStack.length - 1];
  const isProject = current.type === 'project';
  const icon      = isProject ? 'fa-folder-open' : 'fa-list-check';
  const accentColor = isProject ? 'var(--accent-blue)' : 'var(--accent-purple)';
  const subtitle  = isProject
    ? 'Project — ' + current.item.id
    : 'Task in ' + (current.item.project_id || 'unlinked');

  const pushTask = (t) => setNavStack(prev => [...prev, { item: t, type: 'task' }]);
  const pushProject = (p) => setNavStack(prev => [...prev, { item: p, type: 'project' }]);
  const popNav = () => {
    if (navStack.length > 1) setNavStack(prev => prev.slice(0, -1));
    else onClose();
  };

  // Breadcrumb: show ancestry
  const crumbs = navStack.map((entry, i) => ({
    label: entry.type === 'project'
      ? (entry.item.title?.length > 22 ? entry.item.title.slice(0, 22) + '…' : entry.item.title)
      : (entry.item.title?.length > 22 ? entry.item.title.slice(0, 22) + '…' : entry.item.title),
    icon: entry.type === 'project' ? 'fa-folder' : 'fa-list-check',
    isCurrent: i === navStack.length - 1,
    idx: i,
  }));

  // When a task is clicked from the project view, push internally
  const handleTaskClick = (t) => {
    pushTask(t);
    if (onTaskClick) onTaskClick(t); // notify parent too (for state sync)
  };

  // When "Go to Project" is clicked from a task view
  const handleGoToProject = () => {
    const proj = (projects || []).find(p => p.id === current.item.project_id);
    if (proj) pushProject(proj);
  };

  return html`
    <div class=${`deep-dive-overlay ${isOpen ? 'open' : ''}`}
      onClick=${e => { if (e.target === overlayRef.current) onClose(); }}
      ref=${overlayRef}>

      <div class=${`deep-dive-drawer ${isOpen ? 'open' : ''}`}>

        <!-- Breadcrumb nav (only when stack depth > 1) -->
        ${navStack.length > 1 && html`
          <div class="drawer-breadcrumb">
            ${crumbs.map((c, i) => html`
              ${i > 0 && html`<span class="crumb-sep"><i class="fa-solid fa-chevron-right" style="font-size:0.6rem;"></i></span>`}
              ${c.isCurrent
                ? html`<span style="color:var(--text-primary);font-weight:600;"><i class="fa-solid ${c.icon}" style="margin-right:0.3rem;font-size:0.65rem;"></i>${c.label}</span>`
                : html`<button onClick=${() => setNavStack(prev => prev.slice(0, c.idx + 1))}>
                    <i class="fa-solid ${c.icon}" style="font-size:0.65rem;"></i>${c.label}
                  </button>`
              }
            `)}
          </div>
        `}

        <!-- Header -->
        <div class="drawer-header">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.4rem;">
                ${navStack.length > 1 && html`
                  <button style="background:transparent;border:none;color:var(--accent-blue);cursor:pointer;padding:0.2rem 0.5rem 0.2rem 0;font-size:0.8rem;display:flex;align-items:center;gap:0.3rem;"
                    onClick=${popNav} aria-label="Go back">
                    <i class="fa-solid fa-arrow-left"></i>
                  </button>
                `}
                <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,${accentColor},${isProject?'var(--accent-purple)':'var(--accent-pink)'});display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                  <i class="fa-solid ${icon}" style="color:white;font-size:0.85rem;"></i>
                </div>
                <div style="font-size:0.68rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;">${subtitle}</div>
              </div>
              <h3 style="margin:0;font-size:1.1rem;font-weight:700;line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${current.item.title}</h3>

              <!-- Task: link up to parent project -->
              ${!isProject && html`
                <div style="margin-top:0.5rem;">
                  ${(projects || []).find(p => p.id === current.item.project_id)
                    ? html`<button style="background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.25);border-radius:6px;color:var(--accent-blue);font-size:0.72rem;cursor:pointer;padding:0.25rem 0.6rem;display:inline-flex;align-items:center;gap:0.35rem;"
                        onClick=${handleGoToProject}>
                        <i class="fa-solid fa-folder"></i>
                        ${(projects || []).find(p => p.id === current.item.project_id)?.title}
                        <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.6rem;"></i>
                      </button>`
                    : html`<span style="font-size:0.72rem;color:var(--text-secondary);">Project: ${current.item.project_id || '—'}</span>`
                  }
                </div>
              `}
            </div>
            <button style="background:transparent;border:none;color:var(--text-secondary);font-size:1.3rem;cursor:pointer;padding:0.25rem;flex-shrink:0;transition:var(--transition);"
              onMouseEnter=${e => e.target.style.color='var(--text-primary)'}
              onMouseLeave=${e => e.target.style.color='var(--text-secondary)'}
              onClick=${onClose} aria-label="Close panel">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Body -->
        <div class="drawer-body" ref=${bodyRef}>
          ${isProject
            ? html`<${ProjectDeepDive} project=${current.item} tasks=${tasks} onTaskClick=${handleTaskClick} />`
            : html`<${TaskDeepDive} task=${current.item} projects=${projects} onProjectClick=${handleGoToProject} />`}
        </div>
      </div>
    </div>`;
};
