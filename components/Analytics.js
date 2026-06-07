import { formatDuration, getTeamClass, getHealthStatus, getPhaseClass, hasPermission } from '../utils/core.js';
import { getPhases, getTeams } from '../utils/configStore.js';
import { TaskDetailModal, TASK_STATUSES, STATUS_META } from './TaskManagement.js';
import { DeepDiveDrawer } from './DeepDiveDrawer.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);


export const TaskMonitoringTab = ({ tasks, projects, currentUser }) => {
  const hasReadAll = hasPermission(currentUser, 'project.read_all') || hasPermission(currentUser, 'analytics.read_all') || hasPermission(currentUser, 'admin.panel');
  const hasReadTeam = hasPermission(currentUser, 'project.read_team') || hasPermission(currentUser, 'analytics.read_team');
  const myTeams = currentUser ? (currentUser.teams || (currentUser.team ? [currentUser.team] : [])) : [];

  // Role-scoped task set
  const scopedTasks = tasks.filter(t => {
    if (hasReadAll) return true;
    if (hasReadTeam) return myTeams.includes(t.team);
    return t.assignee === currentUser.username;
  });

  const isAdmin = hasReadAll;
  const isLeader = hasReadTeam;

  const [filterStatus, setFilterStatus] = useState('all');
  const [filterProject, setFilterProject] = useState('all');
  const [filterPhase, setFilterPhase] = useState('all');
  const [filterTeam, setFilterTeam] = useState('all');
  const [selectedTask, setSelectedTask] = useState(null);
  const [deepDiveItem, setDeepDiveItem] = useState(null);
  const [deepDiveType, setDeepDiveType] = useState('task');

  const filtered = scopedTasks.filter(t => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false;
    if (filterProject !== 'all' && t.project_id !== filterProject) return false;
    if (filterPhase !== 'all' && t.crisp_dm_phase !== filterPhase) return false;
    if (filterTeam !== 'all' && t.team !== filterTeam) return false;
    return true;
  });

  // Summary analytics over ALL scoped done tasks
  const doneTasks = scopedTasks.filter(t => t.status === 'done' && t.accepted_at && t.resolved_at);
  const ttrsHrs = doneTasks.map(t => formatDuration(t.accepted_at, t.resolved_at).hours);
  const tlcsHrs = doneTasks.map(t => formatDuration(t.created_at, t.resolved_at).hours);
  
  const avgTTRHrs = ttrsHrs.length ? (ttrsHrs.reduce((a,b) => a+b,0) / ttrsHrs.length) : 0;
  const avgTLCHrs = tlcsHrs.length ? (tlcsHrs.reduce((a,b) => a+b,0) / tlcsHrs.length) : 0;
  
  const avgTTR = avgTTRHrs ? `${Math.floor(avgTTRHrs/24)}d ${Math.round(avgTTRHrs%24)}h` : '—';
  const avgTLC = avgTLCHrs ? `${Math.floor(avgTLCHrs/24)}d ${Math.round(avgTLCHrs%24)}h` : '—';
  const onTimePct = doneTasks.length
    ? Math.round(doneTasks.filter(t => !t.due_date || new Date(t.resolved_at) <= new Date(t.due_date)).length / doneTasks.length * 100)
    : '—';

  const statusCounts = {};
  TASK_STATUSES.forEach(s => { statusCounts[s] = scopedTasks.filter(t => t.status === s).length; });
  const uniqueProjects = [...new Set(scopedTasks.map(t => t.project_id).filter(Boolean))];

  return html`
    <div>
      <div class="page-header">
        <div><h2 class="page-title">Task Monitoring</h2><p class="page-subtitle">Analytics, SLA metrics, and task status tracking ${isAdmin ? '(All Teams)' : isLeader ? `(${currentUser.team})` : '(My Tasks)'}</p></div>
      </div>

      <!-- Summary Cards -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;margin-bottom:1.5rem;">
        <div class="metric-card" style="text-align:center;padding:1rem;">
          <div style="font-size:2rem;font-weight:800;color:var(--accent-blue);">${scopedTasks.length}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Total Tasks</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1rem;">
          <div style="font-size:2rem;font-weight:800;color:var(--accent-green);">${statusCounts['done']||0}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Completed</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1rem;">
          <div style="font-size:2rem;font-weight:800;color:var(--accent-orange);">${statusCounts['in_progress']||0}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">In Progress</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1rem;">
          <div style="font-size:1.5rem;font-weight:800;color:var(--accent-purple);">${avgTTR}</div>
          <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Avg TTR</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1rem;">
          <div style="font-size:2rem;font-weight:800;color:${typeof onTimePct === 'number' && onTimePct < 70 ? 'var(--accent-orange)' : 'var(--accent-green)'};">
            ${typeof onTimePct === 'number' ? onTimePct + '%' : '—'}
          </div>
          <div style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">On-Time</div>
        </div>
      </div>

      <!-- Status Breakdown Bar -->
      <div class="metric-card" style="padding:1rem;margin-bottom:1.5rem;">
        <div style="font-size:0.8rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.75rem;text-transform:uppercase;">Status Distribution</div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
          ${TASK_STATUSES.map(s => html`
            <div style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.3rem 0.6rem;border-radius:6px;background:${filterStatus===s?STATUS_META[s].bg:'transparent'};border:1px solid ${filterStatus===s?STATUS_META[s].color:'transparent'};transition:var(--transition);"
              onClick=${() => setFilterStatus(filterStatus === s ? 'all' : s)}>
              <span style="width:8px;height:8px;border-radius:50%;background:${STATUS_META[s].color};flex-shrink:0;"></span>
              <span style="font-size:0.82rem;color:${STATUS_META[s].color};font-weight:600;">${STATUS_META[s].label}</span>
              <span style="font-size:0.82rem;font-weight:700;color:var(--text-primary);">${statusCounts[s]||0}</span>
            </div>
          `)}
          <div style="font-size:0.78rem;color:var(--text-secondary);margin-left:auto;align-self:center;font-style:italic;">Click to filter</div>
        </div>
      </div>

      <!-- Filters -->
      <div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center;">
        <span style="font-size:0.78rem;color:var(--text-secondary);font-weight:600;text-transform:uppercase;">Filters:</span>
        <select class="form-select" style="font-size:0.82rem;" value=${filterStatus} onChange=${e => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          ${TASK_STATUSES.map(s => html`<option value=${s}>${STATUS_META[s].label}</option>`)}
        </select>
        <select class="form-select" style="font-size:0.82rem;" value=${filterProject} onChange=${e => setFilterProject(e.target.value)}>
          <option value="all">All Projects</option>
          ${uniqueProjects.map(id => html`<option value=${id}>${id}</option>`)}
        </select>
        <select class="form-select" style="font-size:0.82rem;" value=${filterPhase} onChange=${e => setFilterPhase(e.target.value)}>
          <option value="all">All Phases</option>
          ${getPhases().map(p => html`<option value=${p}>${p}</option>`)}
        </select>
        ${(isAdmin || isLeader) && html`
          <select class="form-select" style="font-size:0.82rem;" value=${filterTeam} onChange=${e => setFilterTeam(e.target.value)}>
            <option value="all">All Teams</option>
            ${getTeams().map(t => html`<option value=${t}>${t}</option>`)}
          </select>
        `}
        ${(filterStatus !== 'all' || filterProject !== 'all' || filterPhase !== 'all' || filterTeam !== 'all') && html`
          <button class="btn" style="font-size:0.78rem;border:1px solid var(--border-color);"
            onClick=${() => { setFilterStatus('all'); setFilterProject('all'); setFilterPhase('all'); setFilterTeam('all'); }}>
            <i class="fa-solid fa-xmark"></i> Clear
          </button>
        `}
        <span style="font-size:0.78rem;color:var(--text-secondary);margin-left:auto;">${filtered.length} task${filtered.length !== 1 ? 's' : ''} shown</span>
      </div>

      <!-- Task Table -->
      <div style="overflow-x:auto;">
        <table class="data-grid-table">
          <thead>
            <tr>
              <th>Task <span style="font-size:0.7rem;font-weight:400;color:var(--text-secondary);">(click to open)</span></th>
              <th>Project</th>
              <th>Assignee / Team</th>
              <th>Status</th>
              <th>Due Date</th>
              <th>Accepted</th>
              <th>TTR (d)</th>
              <th>TLC (d)</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? html`<tr><td colspan="8" style="padding:2rem;text-align:center;color:var(--text-secondary);font-style:italic;">No tasks match the current filters.</td></tr>` :
              filtered.map(t => {
                const ttr = formatDuration(t.accepted_at, t.resolved_at);
                const tlc = formatDuration(t.created_at, t.resolved_at);
                const ttrClass = ttr.hours === null ? '' : ttr.hours > 168 ? 'sla-breach' : ttr.hours > 72 ? 'sla-warn' : 'sla-good';
                const tlcClass = tlc.hours === null ? '' : tlc.hours > 336 ? 'sla-breach' : tlc.hours > 168 ? 'sla-warn' : 'sla-good';
                const isOverdue = t.due_date && t.status !== 'done' && new Date(t.due_date) < new Date();
                return html`
                  <tr class="accordion-row" style="border-bottom:1px solid var(--border-color);"
                    onClick=${() => { setDeepDiveItem(t); setDeepDiveType('task'); }}>
                    <td style="padding:0.75rem 1rem;">
                      <div style="font-weight:600;">${t.title}</div>
                      <div style="font-size:0.7rem;margin-top:0.2rem;"><span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span></div>
                    </td>
                    <td style="font-size:0.78rem;">${t.project_id || '—'}</td>
                    <td>
                      <div style="font-weight:600;font-size:0.82rem;">${t.completed_by || t.assignee || '—'}</div>
                      <div style="font-size:0.7rem;color:var(--text-secondary);">${t.team || ''}</div>
                    </td>
                    <td><span class="tag" style="background:${STATUS_META[t.status].bg};color:${STATUS_META[t.status].color};font-size:0.72rem;">${STATUS_META[t.status].label}</span></td>
                    <td style="color:${isOverdue ? 'var(--accent-pink)' : 'var(--text-primary)'};font-size:0.8rem;">
                      ${t.due_date || '—'}${isOverdue ? html`<i class="fa-solid fa-triangle-exclamation" style="margin-left:0.3rem;font-size:0.7rem;"></i>` : ''}
                    </td>
                    <td style="font-size:0.78rem;color:var(--text-secondary);">${t.accepted_at ? t.accepted_at.split(' ')[0] : '—'}</td>
                    <td>${ttr.hours !== null ? html`<span class="tag ${ttrClass}" style="font-size:0.72rem;">${ttr.label}</span>` : html`<span style="color:var(--text-secondary);">—</span>`}</td>
                    <td>${tlc.hours !== null ? html`<span class="tag ${tlcClass}" style="font-size:0.72rem;">${tlc.label}</span>` : html`<span style="color:var(--text-secondary);">—</span>`}</td>
                  </tr>
                `;
              })
            }
          </tbody>
        </table>
      </div>

      ${deepDiveItem && html`<${DeepDiveDrawer} item=${deepDiveItem} type=${deepDiveType} tasks=${tasks} projects=${projects} onClose=${() => setDeepDiveItem(null)} />`}
    </div>
  `;
};



export const ProjectAnalyticsTab = ({ projects, tasks, currentUser }) => {
  const [openProject, setOpenProject] = useState(null);
  const [openPhase, setOpenPhase] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [deepDiveItem, setDeepDiveItem] = useState(null);
  const [deepDiveType, setDeepDiveType] = useState('project');
  const [taskStatusFilter, setTaskStatusFilter] = useState('all');
  const [taskProjectFilter, setTaskProjectFilter] = useState('all');

  const getPhaseProgress = (p) => {
    if (p.phase === 'Deployed and in Use') return 100;
    const idx = getPhases().indexOf(p.phase);
    return idx === -1 ? 0 : Math.round(((idx + 1) / getPhases().length) * 100);
  };

  const avgProgress = projects.length
    ? Math.round(projects.reduce((s, p) => s + getPhaseProgress(p), 0) / projects.length)
    : 0;

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title">Project Analytics</h2>
          <p class="page-subtitle">Hierarchical view: Project → Phase → Team → Tasks (read-only)</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:1rem;margin-bottom:1.5rem;">
        <div class="metric-card" style="text-align:center;padding:1.25rem;">
          <div style="font-size:2.2rem;font-weight:800;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${projects.length}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Projects</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1.25rem;">
          <div style="font-size:2.2rem;font-weight:800;color:var(--accent-green);">${projects.filter(p=>Boolean(Number(p.is_deployed))).length}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">In Production</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1.25rem;">
          <div style="font-size:2.2rem;font-weight:800;color:var(--accent-purple);">${tasks.length}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Total Tasks</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1.25rem;">
          <div style="font-size:2.2rem;font-weight:800;color:var(--accent-blue);">${avgProgress}%</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Avg Phase Progress</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1.25rem;">
          <div style="font-size:1.1rem;font-weight:800;color:var(--accent-orange);">
            ${(() => {
              const counts = {};
              tasks.filter(t => t.status !== 'done').forEach(t => { counts[t.crisp_dm_phase] = (counts[t.crisp_dm_phase] || 0) + 1; });
              const top = Object.entries(counts).sort((a,b) => b[1] - a[1])[0];
              return top ? top[0].split(' ')[0] : 'None';
            })()}
          </div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;margin-top:0.25rem;">Top Bottleneck Phase</div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        ${projects.map(p => {
          const isOpen = openProject === p.id;
          const prog = getPhaseProgress(p);
          const health = getHealthStatus(p, tasks);
          const projTasks = tasks.filter(t => t.project_id === p.id);

          return html`
            <div class="info-block" style="padding:0;overflow:hidden;">
              <!-- Project Header -->
              <div class="accordion-row" style="padding:1rem 1.5rem;display:flex;align-items:center;gap:1rem;"
                onClick=${() => { setOpenProject(isOpen ? null : p.id); setOpenPhase(null); }}>
                <i class="fa-solid ${isOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" style="color:var(--accent-blue);width:12px;flex-shrink:0;"></i>
                <div style="flex:1;min-width:0;">
                  <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;">
                    <span style="font-weight:700;color:var(--accent-blue);">${p.id}</span>
                    <span style="font-weight:600;">${p.title}</span>
                    <span class="tag ${getPhaseClass(p.phase)}">${p.phase}</span>
                    ${Boolean(Number(p.is_deployed)) && html`<span class="tag color-green" style="font-size:0.6rem;">PRODUCTION</span>`}
                    ${p.blockers && p.blockers.length > 0 && html`<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-orange);font-size:0.8rem;" title="Has blockers"></i>`}
                  </div>
                </div>
                <button style="background:transparent;border:1px solid var(--border-color);border-radius:6px;color:var(--accent-blue);font-size:0.72rem;padding:0.25rem 0.6rem;cursor:pointer;"
                  onClick=${e => { e.stopPropagation(); setDeepDiveItem(p); setDeepDiveType('project'); }}>
                  <i class="fa-solid fa-up-right-from-square" style="margin-right:0.25rem;"></i>Deep Dive
                </button>
                <div style="text-align:right;min-width:160px;">
                  <div style="font-size:0.7rem;color:${health.color};font-weight:600;margin-bottom:0.3rem;">${health.label}</div>
                  <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${prog}%;background:var(--accent-blue);transition:width 0.5s;"></div>
                  </div>
                  <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:0.2rem;">Tasks: ${projTasks.length} | Phase Progress: ${prog}%</div>
                </div>
              </div>

              ${isOpen && html`
                <div style="border-top:1px solid var(--border-color);padding:0;">
                  <!-- Phase Breakdown -->
                  ${getPhases().map(ph => {
                    const phTasks = projTasks.filter(t => t.crisp_dm_phase === ph);
                    if (phTasks.length === 0 && p.phase !== ph) return null;
                    const isPhaseOpen = openPhase === p.id + ph;
                    const isCurrent = p.phase === ph;
                    const donePh = phTasks.filter(t => t.status === 'done').length;
                    const teamGroups = {};
                    phTasks.forEach(t => { (teamGroups[t.team || 'Unassigned'] = teamGroups[t.team || 'Unassigned'] || []).push(t); });

                    return html`
                      <div style="border-bottom:1px solid var(--border-color);">
                        <div class="accordion-row" style="padding:0.6rem 1.5rem 0.6rem 2.5rem;display:flex;align-items:center;gap:0.75rem;background:${isCurrent ? 'rgba(59,130,246,0.05)' : 'transparent'};"
                          onClick=${() => setOpenPhase(isPhaseOpen ? null : p.id + ph)}>
                          <i class="fa-solid ${isPhaseOpen ? 'fa-chevron-down' : 'fa-chevron-right'}" style="font-size:0.7rem;color:var(--text-secondary);width:10px;"></i>
                          <span class="tag ${getPhaseClass(ph)}" style="font-size:0.65rem;">${ph}</span>
                          ${isCurrent && html`<span style="font-size:0.65rem;font-weight:700;color:var(--accent-blue);text-transform:uppercase;">● Active</span>`}
                          <span style="font-size:0.8rem;color:var(--text-secondary);margin-left:auto;">${phTasks.length} task${phTasks.length !== 1 ? 's' : ''} ${phTasks.length > 0 ? `(${donePh} done)` : ''}</span>
                        </div>

                        ${isPhaseOpen && phTasks.length > 0 && html`
                          <div style="padding:0.5rem 1.5rem 1rem 3.5rem;">
                            ${Object.entries(teamGroups).map(([team, tTasks]) => html`
                              <div style="margin-bottom:0.75rem;">
                                <div style="font-size:0.72rem;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.4rem;display:flex;align-items:center;gap:0.4rem;">
                                  <span class="tag ${getTeamClass(team)}" style="font-size:0.6rem;">${team}</span>
                                  ${tTasks.length} task${tTasks.length !== 1 ? 's' : ''}
                                </div>
                                <div style="display:flex;flex-direction:column;gap:0.35rem;">
                                  ${tTasks.map(t => html`
                                    <div class="task-card-clickable info-block" style="padding:0.6rem 0.9rem;display:flex;justify-content:space-between;align-items:center;"
                                      onClick=${() => setSelectedTask(t)}>
                                      <div>
                                        <div style="font-size:0.84rem;font-weight:600;">${t.title}</div>
                                        <div style="font-size:0.72rem;color:var(--text-secondary);">${t.assignee || 'Unassigned'} ${t.due_date ? '· Due: ' + t.due_date : ''}</div>
                                      </div>
                                      <span class="tag" style="background:${STATUS_META[t.status].bg};color:${STATUS_META[t.status].color};font-size:0.7rem;">${STATUS_META[t.status].label}</span>
                                    </div>
                                  `)}
                                </div>
                              </div>
                            `)}
                          </div>
                        `}
                        ${isPhaseOpen && phTasks.length === 0 && html`
                          <div style="padding:0.5rem 1.5rem 0.75rem 3.5rem;font-size:0.8rem;color:var(--text-secondary);font-style:italic;">No tasks in this phase.</div>
                        `}
                      </div>
                    `;
                  }).filter(Boolean)}
                </div>
              `}
            </div>
          `;
        })}
      </div>

      <!-- All Tasks Section -->
      <div style="margin-top:2rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1rem;">
          <h3 style="margin:0;font-size:1rem;font-weight:700;"><i class="fa-solid fa-list-check" style="color:var(--accent-purple);margin-right:0.5rem;"></i>All Tasks <span style="font-weight:400;color:var(--text-secondary);font-size:0.85rem;">— full visibility across all projects & teams</span></h3>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:center;">
            <span style="font-size:0.75rem;color:var(--text-secondary);">Filter:</span>
            <select class="form-select" style="font-size:0.8rem;" value=${taskStatusFilter} onChange=${e => setTaskStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              ${TASK_STATUSES.map(s => html`<option value=${s}>${STATUS_META[s].label}</option>`)}
            </select>
            <select class="form-select" style="font-size:0.8rem;" value=${taskProjectFilter} onChange=${e => setTaskProjectFilter(e.target.value)}>
              <option value="all">All Projects</option>
              ${projects.map(p => html`<option value=${p.id}>${p.id} — ${p.title}</option>`)}
            </select>
            ${(taskStatusFilter !== 'all' || taskProjectFilter !== 'all') && html`
              <button class="btn" style="font-size:0.75rem;border:1px solid var(--border-color);" onClick=${() => { setTaskStatusFilter('all'); setTaskProjectFilter('all'); }}>
                <i class="fa-solid fa-xmark"></i> Clear
              </button>
            `}
          </div>
        </div>
        ${(() => {
          const ft = tasks.filter(t => {
            if (taskStatusFilter !== 'all' && t.status !== taskStatusFilter) return false;
            if (taskProjectFilter !== 'all' && t.project_id !== taskProjectFilter) return false;
            return true;
          });
          return html`
            <div style="overflow-x:auto;">
              <table class="data-grid-table">
                <thead>
                  <tr>
                    <th>Task <span style="font-size:0.68rem;font-weight:400;color:var(--text-secondary);">(click to open)</span></th>
                    <th>Project</th>
                    <th>Phase</th>
                    <th>Assignee</th>
                    <th>Team</th>
                    <th>Status</th>
                    <th>TTR</th>
                  </tr>
                </thead>
                <tbody>
                  ${ft.length === 0
                    ? html`<tr><td colspan="7" style="padding:2rem;text-align:center;color:var(--text-secondary);font-style:italic;">No tasks match the selected filters.</td></tr>`
                    : ft.map(t => {
                        const proj = projects.find(p => p.id === t.project_id);
                        const ttr = formatDuration(t.accepted_at, t.resolved_at);
                        const ttrClass = ttr.hours === null ? '' : ttr.hours > 168 ? 'sla-breach' : ttr.hours > 72 ? 'sla-warn' : 'sla-good';
                        return html`
                          <tr class="accordion-row" style="border-bottom:1px solid var(--border-color);"
                            onClick=${() => { setDeepDiveItem(t); setDeepDiveType('task'); }}>
                            <td style="padding:0.65rem 1rem;font-weight:600;">${t.title}</td>
                            <td style="font-size:0.78rem;">${proj ? html`<span title=${proj.title}>${t.project_id}</span>` : (t.project_id || html`<span style="color:var(--text-secondary);">—</span>`)}</td>
                            <td><span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;">${t.crisp_dm_phase}</span></td>
                            <td style="font-size:0.8rem;">${t.assignee || html`<span style="color:var(--text-secondary);">Pool</span>`}</td>
                            <td style="font-size:0.78rem;color:var(--text-secondary);">${t.team}</td>
                            <td><span class="tag" style="background:${STATUS_META[t.status]?.bg};color:${STATUS_META[t.status]?.color};font-size:0.7rem;">${STATUS_META[t.status]?.label}</span></td>
                            <td>${ttr.hours !== null ? html`<span class="tag ${ttrClass}" style="font-size:0.7rem;">${ttr.label}</span>` : html`<span style="color:var(--text-secondary);">—</span>`}</td>
                          </tr>
                        `;
                      })
                  }
                </tbody>
              </table>
            </div>
          `;
        })()}
      </div>

      ${deepDiveItem && html`
        <${DeepDiveDrawer}
          item=${deepDiveItem} type=${deepDiveType}
          tasks=${tasks} projects=${projects}
          onClose=${() => setDeepDiveItem(null)}
          onTaskClick=${t => { setDeepDiveItem(t); setDeepDiveType('task'); }}
        />`}
    </div>
  `;
};



