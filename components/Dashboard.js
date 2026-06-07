import { calculateOverallProgress, calculateTimelineProgress, ProjectBadges, getHealthStatus, getPhaseClass, getTeamClass, hasPermission } from '../utils/core.js';
import { getPhases, getTeams } from '../utils/configStore.js';
import { DeepDiveDrawer } from './DeepDiveDrawer.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

export const Dashboard = ({ projects, tasks, currentUser }) => {
  const [activeFilter, setActiveFilter] = useState({ type: 'ALL', value: null });
  const [workloadView, setWorkloadView] = useState('projects');
  const [taskFilterMember, setTaskFilterMember] = useState('all');
  const [taskFilterProject, setTaskFilterProject] = useState('all');
  const [deepDiveItem, setDeepDiveItem] = useState(null);
  const [deepDiveType, setDeepDiveType] = useState('project');

  const allTeams = getTeams();
  const hasReadAll = hasPermission(currentUser, 'project.read_all') || hasPermission(currentUser, 'analytics.read_all') || (currentUser && currentUser.role === 'admin');
  const myTeams = currentUser ? (currentUser.teams || (currentUser.team ? [currentUser.team] : [])) : [];
  const teamsToRender = hasReadAll ? allTeams : allTeams.filter(t => myTeams.includes(t));

  const total = projects.length;
  const deployedCount = projects.filter(p => Boolean(Number(p.is_deployed))).length;
  const activeTotal = total;

  // Task workload by team
  const tasksByTeam = useMemo(() => {
    const map = {};
    teamsToRender.forEach(t => { map[t] = { total: 0, done: 0, inProgress: 0, blocked: 0, estHours: 0, actHours: 0 }; });
    (tasks || []).forEach(t => {
      // Respect project filter if active
      if (activeFilter.type === 'PROJECT' && t.project_id !== activeFilter.value) return;
      if (!map[t.team]) return;
      map[t.team].total++;
      if (t.status === 'done') map[t.team].done++;
      else if (t.status === 'in_progress') map[t.team].inProgress++;
      else if (t.status === 'blocked' || t.is_blocked) map[t.team].blocked++;
      map[t.team].estHours += (parseFloat(t.estimated_hours) || 0);
      map[t.team].actHours += (parseFloat(t.actual_hours) || 0);
    });
    return map;
  }, [tasks, projects, activeFilter, teamsToRender]);

  const teamStats = useMemo(() => {
    const stats = {};
    teamsToRender.forEach(t => { stats[t] = { preProd: 0, prodIter: 0 }; });
    projects.forEach(p => { 
      // Respect project filter if active
      if (activeFilter.type === 'PROJECT' && p.id !== activeFilter.value) return;
      if (stats[p.team] !== undefined) {
        if (Boolean(Number(p.is_deployed))) stats[p.team].prodIter++;
        else stats[p.team].preProd++;
      } 
    });
    return stats;
  }, [projects, activeFilter, teamsToRender]);

  const blockedCount = projects.filter(p => p.blockers && p.blockers.length > 0).length;
  const onTrackCount = activeTotal - blockedCount;

  const scheduleHealth = useMemo(() => {
    const active = projects.filter(p => p.start_date && p.target_date);
    let onT = 0, late = 0, ahead = 0;
    active.forEach(p => {
      const h = getHealthStatus(p, tasks);
      if (h.label === 'On Track') onT++;
      else if (h.label.startsWith('Ahead')) ahead++;
      else late++;
    });
    return { onTrack: onT, late, ahead, total: active.length };
  }, [projects]);

  const phaseDistribution = useMemo(() => {
    return getPhases().map(ph => ({
      phase: ph,
      count: projects.filter(p => p.phase === ph).length
    }));
  }, [projects]);

  const maxPhaseCount = Math.max(1, ...phaseDistribution.map(d => d.count));

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      if (activeFilter.type === 'ALL') return true;
      if (activeFilter.type === 'STATUS') {
        const isBlocked = p.blockers && p.blockers.length > 0;
        return activeFilter.value === 'Blocked' ? isBlocked : !isBlocked;
      }
      if (activeFilter.type === 'SCHED') {
        const h = getHealthStatus(p, tasks);
        if (activeFilter.value === 'On Track') return h.label === 'On Track';
        if (activeFilter.value === 'Ahead') return h.label.startsWith('Ahead');
        if (activeFilter.value === 'Late') return h.label.startsWith('Late');
        return true;
      }
      if (activeFilter.type === 'TEAM') return p.team === activeFilter.value;
      if (activeFilter.type === 'PHASE') return p.phase === activeFilter.value;
      if (activeFilter.type === 'PROJECT') return p.id === activeFilter.value;
      return true;
    });
  }, [projects, activeFilter]);

  const activeProjects = filteredProjects.filter(p => !Boolean(Number(p.is_deployed)));
  const productionProjects = filteredProjects.filter(p => Boolean(Number(p.is_deployed)));

  const toggleFilter = (type, value) => {
    if (activeFilter.type === type && activeFilter.value === value) setActiveFilter({ type: 'ALL', value: null });
    else setActiveFilter({ type, value });
  };
  const isActive = (type, value) => activeFilter.type === type && activeFilter.value === value;

  // Hero card style helper
  const heroCard = (clickType, clickVal, color) => {
    const selected = isActive(clickType, clickVal);
    const border = selected ? 'box-shadow:0 0 0 2px ' + color + ';' : '';
    return 'text-align:center;padding:1.25rem 1rem;cursor:pointer;transition:var(--transition);' + border;
  };

  // Feature row clickable row style
  const rowStyle = (type, val, rColor) => {
    const sel = isActive(type, val);
    if (sel) return 'cursor:pointer;padding:0.65rem 0.8rem;border-radius:8px;display:flex;justify-content:space-between;align-items:center;transition:var(--transition);background:' + rColor + ';';
    return 'cursor:pointer;padding:0.65rem 0.8rem;border-radius:8px;display:flex;justify-content:space-between;align-items:center;transition:var(--transition);background:rgba(255,255,255,0.03);';
  };

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title">Executive Dashboard</h2>
          <p class="page-subtitle">Managerial view of department velocity and risks</p>
        </div>
        <div style="display:flex;gap:0.75rem;align-items:center;">
           <span style="font-size:0.8rem;color:var(--text-secondary);font-weight:600;">Project Scope:</span>
           <select class="form-select" style="min-width:180px;" value=${activeFilter.type === 'PROJECT' ? activeFilter.value : 'all'} 
             onChange=${e => toggleFilter('PROJECT', e.target.value === 'all' ? null : e.target.value)}>
             <option value="all">All Projects</option>
             ${projects.map(p => html`<option value=${p.id}>${p.id} - ${p.title}</option>`)}
           </select>
        </div>
      </div>

      <!-- Hero Strip -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem;">
        <div class="metric-card" style="text-align:center;padding:1.25rem 1rem;">
          <div style="font-size:2.8rem;font-weight:800;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;line-height:1;">${activeTotal}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-top:0.5rem;">Total Initiatives</div>
        </div>
        <div class="metric-card" style="${heroCard('STATUS','On Track','var(--accent-green)')}" onClick=${() => toggleFilter('STATUS','On Track')}>
          <div style="font-size:2.8rem;font-weight:800;color:var(--accent-green);line-height:1;">${onTrackCount}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-top:0.5rem;">No Blockers</div>
        </div>
        <div class="metric-card" style="${heroCard('STATUS','Blocked','var(--accent-orange)')}" onClick=${() => toggleFilter('STATUS','Blocked')}>
          <div style="font-size:2.8rem;font-weight:800;color:var(--accent-orange);line-height:1;">${blockedCount}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-top:0.5rem;">Blocked</div>
        </div>
        <div class="metric-card" style="text-align:center;padding:1.25rem 1rem;">
          <div style="font-size:2.8rem;font-weight:800;color:var(--accent-green);line-height:1;">${deployedCount}</div>
          <div style="font-size:0.72rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.06em;margin-top:0.5rem;">In Production</div>
        </div>
      </div>

      <!-- Feature Cards Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:1.5rem;margin-bottom:1.5rem;">

        <!-- Schedule Health -->
        <div class="metric-card">
          <div class="metric-title"><i class="fa-solid fa-calendar-check" style="margin-right:0.4rem;"></i>Schedule Health</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;">${scheduleHealth.total} active project${scheduleHealth.total !== 1 ? 's' : ''} with dates tracked</div>
          <div style="display:flex;flex-direction:column;gap:0.6rem;">
            <div style="${rowStyle('SCHED','Ahead','rgba(16,185,129,0.15)')}" onClick=${() => toggleFilter('SCHED','Ahead')}>
              <span style="font-size:0.85rem;color:var(--accent-green);font-weight:500;"><i class="fa-solid fa-arrow-trend-up" style="margin-right:0.5rem;"></i>Ahead of schedule</span>
              <span style="font-size:1.4rem;font-weight:800;color:var(--accent-green);">${scheduleHealth.ahead}</span>
            </div>
            <div style="${rowStyle('SCHED','On Track','rgba(59,130,246,0.15)')}" onClick=${() => toggleFilter('SCHED','On Track')}>
              <span style="font-size:0.85rem;color:var(--accent-blue);font-weight:500;"><i class="fa-solid fa-circle-check" style="margin-right:0.5rem;"></i>On track</span>
              <span style="font-size:1.4rem;font-weight:800;color:var(--accent-blue);">${scheduleHealth.onTrack}</span>
            </div>
            <div style="${rowStyle('SCHED','Late','rgba(245,158,11,0.15)')}" onClick=${() => toggleFilter('SCHED','Late')}>
              <span style="font-size:0.85rem;color:var(--accent-orange);font-weight:500;"><i class="fa-solid fa-arrow-trend-down" style="margin-right:0.5rem;"></i>Running late</span>
              <span style="font-size:1.4rem;font-weight:800;color:var(--accent-orange);">${scheduleHealth.late}</span>
            </div>
          </div>
        </div>

        <!-- Team Workload -->
        <div class="metric-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
            <div class="metric-title" style="margin:0;"><i class="fa-solid fa-users" style="margin-right:0.4rem;"></i>Team Workload</div>
            <div style="display:flex;gap:0.25rem;">
              <button class="btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;${workloadView==='projects'?'background:var(--accent-blue);color:white;':''}"
                onClick=${() => setWorkloadView('projects')}>Projects</button>
              <button class="btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;${workloadView==='tasks'?'background:var(--accent-purple);color:white;':''}"
                onClick=${() => setWorkloadView('tasks')}>Tasks</button>
            </div>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;">
            ${workloadView === 'projects' ? 'Pre-Prod vs Production Iterations' : 'Task load by team — Done · In Progress · Blocked | Actual / Estimated Hours'}
          </div>
          <div style="display:flex;flex-direction:column;gap:1.1rem;">
            ${teamsToRender.map(team => {
              const sel = isActive('TEAM', team);
              if (workloadView === 'projects') {
                const preProdCount = teamStats[team]?.preProd || 0;
                const prodIterCount = teamStats[team]?.prodIter || 0;
                const tCount = preProdCount + prodIterCount;
                const preProdPct = total > 0 ? (preProdCount / total) * 100 : 0;
                const prodIterPct = total > 0 ? (prodIterCount / total) * 100 : 0;
                return html`
                  <div style="cursor:pointer;transition:var(--transition);padding:0.35rem 0.4rem;border-radius:6px;background:${sel ? 'rgba(255,255,255,0.07)' : 'transparent'};"
                    onClick=${() => toggleFilter('TEAM', team)}>
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
                      <span style="font-size:0.83rem;font-weight:500;">${team.replace(' Team','')}</span>
                      <span style="font-size:0.83rem;color:var(--text-secondary);">${tCount} (${preProdCount} pre, ${prodIterCount} prod)</span>
                    </div>
                    <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;display:flex;">
                      <div style="height:100%;width:${preProdPct}%;background:linear-gradient(90deg,var(--accent-blue),var(--accent-purple));"></div>
                      <div style="height:100%;width:${prodIterPct}%;background:var(--accent-green);opacity:0.8;"></div>
                    </div>
                  </div>
                `;
              } else {
                const td = tasksByTeam[team] || {};
                const maxT = Math.max(1, ...teamsToRender.map(t => (tasksByTeam[t]?.total || 0)));
                const barW = td.total ? Math.max(5, Math.round((td.total / maxT) * 100)) : 0;
                return html`
                  <div style="cursor:pointer;transition:var(--transition);padding:0.35rem 0.4rem;border-radius:6px;background:${sel ? 'rgba(255,255,255,0.07)' : 'transparent'};"
                    onClick=${() => toggleFilter('TEAM', team)}>
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem;">
                      <span style="font-size:0.83rem;font-weight:500;">${team.replace(' Team','')}</span>
                      <span style="font-size:0.83rem;color:var(--text-secondary);">
                        ${td.total || 0} tasks
                        <span style="color:var(--accent-green);"> ✓${td.done||0}</span>
                        <span style="color:var(--accent-orange);"> ⚡${td.inProgress||0}</span>
                        ${td.blocked > 0 ? html`<span style="color:var(--accent-pink);"> ⚠${td.blocked}</span>` : ''}
                      </span>
                    </div>
                    <div style="font-size:0.7rem;color:var(--text-secondary);margin-bottom:0.4rem;display:flex;justify-content:space-between;">
                      <span>Effort (Hours)</span>
                      <span><strong style="color:${(td.actHours||0) > (td.estHours||0) ? 'var(--accent-pink)' : 'var(--accent-green)'}">${td.actHours||0}</strong> / ${td.estHours||0}</span>
                    </div>
                    <div style="height:6px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;display:flex;">
                      ${td.total > 0 && html`
                        <div style="height:100%;width:${Math.round((td.done||0)/td.total*100)}%;background:var(--accent-green);"></div>
                        <div style="height:100%;width:${Math.round((td.inProgress||0)/td.total*100)}%;background:var(--accent-orange);"></div>
                        <div style="height:100%;width:${Math.round((td.blocked||0)/td.total*100)}%;background:var(--accent-pink);opacity:0.8;"></div>
                      `}
                    </div>
                  </div>
                `;
              }
            })}
          </div>
        </div>

        <!-- Phase Distribution -->
        <div class="metric-card">
          <div class="metric-title"><i class="fa-solid fa-layer-group" style="margin-right:0.4rem;"></i>Phase Distribution</div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;">Where active work is concentrated — click to filter</div>
          <div style="display:flex;flex-direction:column;gap:0.5rem;">
            ${phaseDistribution.map(d => {
              const sel = isActive('PHASE', d.phase);
              const barW = d.count === 0 ? 0 : Math.max(5, Math.round((d.count / maxPhaseCount) * 100));
              return html`
                <div style="cursor:pointer;transition:var(--transition);padding:0.3rem 0.4rem;border-radius:5px;background:${sel ? 'rgba(255,255,255,0.08)' : 'transparent'};"
                  onClick=${() => toggleFilter('PHASE', d.phase)}>
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.3rem;">
                    <span style="font-size:0.76rem;color:${d.count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:82%;">${d.phase}</span>
                    <span style="font-size:0.76rem;font-weight:700;color:${d.count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'};">${d.count}</span>
                  </div>
                  <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${barW}%;background:var(--accent-blue);border-radius:3px;opacity:${d.count === 0 ? 0.12 : 1};"></div>
                  </div>
                </div>
              `;
            })}
          </div>
        </div>

      </div>

      <!-- All Projects Pipeline — unified full-detail view -->
      <div class="metric-card" style="margin-bottom:1.5rem;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <div style="font-size:1rem;font-weight:600;"><i class="fa-solid fa-stopwatch" style="margin-right:0.5rem;"></i>Full Project Pipeline
            <span style="font-size:0.8rem;font-weight:400;color:var(--text-secondary);margin-left:0.75rem;">${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''}</span>
          </div>
          ${activeFilter.type !== 'ALL' && html`
            <button class="btn" style="font-size:0.8rem;padding:0.25rem 0.75rem;border:1px solid var(--border-color);" onClick=${() => { setActiveFilter({ type: 'ALL', value: null }); setTaskFilterProject('all'); }}>
              <i class="fa-solid fa-xmark" style="margin-right:0.4rem;"></i>Clear Filter
            </button>
          `}
        </div>

        ${filteredProjects.length === 0
          ? html`<div style="text-align:center;padding:2.5rem;color:var(--text-secondary);font-style:italic;">No projects match the current filter.</div>`
          : html`
            <!-- New Initiatives Section -->
            ${activeProjects.length > 0 && html`
              <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--accent-blue);margin-bottom:0.5rem;padding-left:0.5rem;">
                <i class="fa-solid fa-seedling" style="margin-right:0.4rem;"></i>New Initiatives (${activeProjects.length})
              </div>
              <table class="data-grid-table" style="margin-bottom:1.5rem;">
                <thead>
                  <tr>
                    <th>Project / Phase</th>
                    <th>Stakeholder</th>
                    <th style="min-width:220px;">Progress vs Timeline</th>
                    <th>Health</th>
                  </tr>
                </thead>
                <tbody>
                  ${activeProjects.map(p => {
                    const overall = p.computed_progress !== undefined ? p.computed_progress : calculateOverallProgress(p, tasks);
                    const timeline = calculateTimelineProgress(p);
                    const health = getHealthStatus(p, tasks);
                    const latestNote = p.history && p.history.length > 0 ? p.history[p.history.length - 1].note : 'No status notes yet.';
                    return html`
                      <tr style="border-top:1px solid var(--border-color);cursor:pointer;"
                        onClick=${() => { setDeepDiveItem(p); setDeepDiveType('project'); }}
                        onMouseEnter=${e => e.currentTarget.style.background='rgba(59,130,246,0.04)'}
                        onMouseLeave=${e => e.currentTarget.style.background=''}>
                        <td style="padding:0.75rem 0.5rem;">
                          <div style="font-weight:600;display:flex;align-items:center;gap:0.4rem;">
                            ${p.title}
                            ${p.blockers && p.blockers.length > 0 && html`<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-orange);font-size:0.8rem;"></i>`}
                          </div>
                          <div style="margin-top:0.25rem;display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
                            <span class="tag ${getPhaseClass(p.phase)}">${p.phase}</span>
                            <${ProjectBadges} project=${p} />
                          </div>
                          <!-- ACTIVE STREAMS -->
                          <div style="margin-top:0.6rem;display:flex;flex-direction:column;gap:0.3rem;">
                            ${(() => {
                              const streams = {};
                              const pTasks = (tasks || []).filter(t => t.project_id === p.id);
                              pTasks.forEach(t => {
                                const k = `${t.crisp_dm_phase}|${t.team}`;
                                if (!streams[k]) streams[k] = { phase: t.crisp_dm_phase, team: t.team, total: 0, done: 0 };
                                streams[k].total++;
                                if (t.status === 'done') streams[k].done++;
                              });
                              const activeStreams = Object.values(streams).filter(s => s.done < s.total);
                              return activeStreams.map(s => html`
                                <div style="display:flex;align-items:center;gap:0.4rem;font-size:0.68rem;">
                                  <span class="tag ${getPhaseClass(s.phase)}" style="padding:0.1rem 0.3rem;font-size:0.62rem;opacity:0.9;">${s.phase}</span>
                                  <span class="tag ${getTeamClass(s.team)}" style="padding:0.1rem 0.3rem;font-size:0.62rem;border:1px solid currentColor;">${s.team.replace(' Team','')}</span>
                                  <span style="color:var(--text-secondary);">${Math.round(s.done/s.total*100)}%</span>
                                </div>
                              `);
                            })()}
                          </div>
                        </td>
                        <td style="font-size:0.82rem;">
                          ${(() => {
                            const sh = Array.isArray(p.stakeholders) ? p.stakeholders : (p.stakeholders && p.stakeholders !== '[]' ? [p.stakeholders] : []);
                            return sh.length > 0 
                              ? sh.map(s => html`<div style="display:flex;align-items:center;gap:0.3rem;margin-bottom:0.15rem;"><i class="fa-solid fa-star" style="font-size:0.55rem;color:var(--accent-orange);"></i><span>${s}</span></div>`)
                              : html`<span style="color:var(--text-secondary);">—</span>`;
                          })()}
                        </td>
                        <td style="padding-right:2rem;">
                          <div style="font-size:0.75rem;display:flex;justify-content:space-between;margin-bottom:0.3rem;">
                            <span style="color:var(--accent-blue);font-weight:600;">Completion: ${overall}%</span>
                            <span style="color:var(--text-secondary);">Time elapsed: ${timeline}%</span>
                          </div>
                          <div style="width:100%;height:8px;background:rgba(255,255,255,0.05);border-radius:4px;position:relative;overflow:hidden;display:flex;">
                            ${(() => {
                              const pTasks = (tasks || []).filter(t => t.project_id === p.id);
                              if (pTasks.length === 0) return html`<div style="height:100%;width:${overall}%;background:${health.color};opacity:0.5;"></div>`;
                              
                              const teams = [...new Set(pTasks.map(t => t.team))];
                              return teams.map(team => {
                                const teamTasks = pTasks.filter(t => t.team === team);
                                const done = teamTasks.filter(t => t.status === 'done').length;
                                const width = (teamTasks.length / pTasks.length) * 100;
                                const pct = (done / teamTasks.length) * 100;
                                const teamColor = team.includes('Dev') ? 'var(--accent-blue)' : team.includes('Eng') ? 'var(--accent-purple)' : 'var(--accent-green)';
                                return html`
                                  <div style="height:100%;width:${width}%;background:rgba(255,255,255,0.05);position:relative;border-right:1px solid rgba(0,0,0,0.2);">
                                    <div style="height:100%;width:${pct}%;background:${teamColor};"></div>
                                  </div>
                                `;
                              });
                            })()}
                            <!-- Timeline marker -->
                            <div style="position:absolute;top:0;left:${timeline}%;height:100%;width:2px;background:white;opacity:0.4;z-index:2;" title="Timeline Position: ${timeline}%"></div>
                          </div>
                        </td>
                        <td><span style="color:${health.color};font-weight:bold;background:rgba(0,0,0,0.2);padding:0.2rem 0.6rem;border-radius:4px;white-space:nowrap;">${health.label}</span></td>
                      </tr>
                      <tr style="background:rgba(255,255,255,0.02);">
                        <td colspan="4" style="padding:0.75rem 1rem;border-left:2px solid var(--accent-blue);">
                          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;font-size:0.85rem;">
                            <div>
                              <div style="color:var(--text-secondary);font-size:0.75rem;text-transform:uppercase;font-weight:600;margin-bottom:0.25rem;">Description</div>
                              <div>${p.description || 'No description provided.'}</div>
                            </div>
                            <div>
                              <div style="color:var(--text-secondary);font-size:0.75rem;text-transform:uppercase;font-weight:600;margin-bottom:0.25rem;">Latest Status</div>
                              <div style="font-style:italic;">"${latestNote}"</div>
                              ${p.nextStep && html`<div style="margin-top:0.5rem;"><span style="color:var(--text-secondary);font-size:0.75rem;font-weight:600;text-transform:uppercase;">Next: </span><span style="color:var(--accent-green);font-weight:500;">${p.nextStep}</span></div>`}
                            </div>
                          </div>
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            `}

            <!-- Production / Iterating Projects Section -->
            ${productionProjects.length > 0 && html`
              <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#4ade80;margin-bottom:0.5rem;padding-left:0.5rem;">
                <i class="fa-solid fa-server" style="margin-right:0.4rem;"></i>Live Production Portfolio (${productionProjects.length})
              </div>
              <table class="data-grid-table">
                <thead>
                  <tr>
                    <th>Project / Phase</th>
                    <th>Stakeholder</th>
                    <th style="min-width:220px;">Progress vs Timeline</th>
                    <th>Health</th>
                  </tr>
                </thead>
                <tbody>
                  ${productionProjects.map(p => {
                    const overall = p.computed_progress !== undefined ? p.computed_progress : calculateOverallProgress(p, tasks);
                    const timeline = calculateTimelineProgress(p);
                    const health = getHealthStatus(p, tasks);
                    const latestNote = p.history && p.history.length > 0 ? p.history[p.history.length - 1].note : 'Successfully deployed.';
                    const iterNum = p.iteration || 1;
                    const isIter = p.is_iterating === 1;
                    return html`
                      <tr style="border-top:1px solid rgba(74,222,128,0.1);cursor:pointer;"
                        onClick=${() => { setDeepDiveItem(p); setDeepDiveType('project'); }}
                        onMouseEnter=${e => e.currentTarget.style.background='rgba(74,222,128,0.04)'}
                        onMouseLeave=${e => e.currentTarget.style.background=''}>
                        <td style="padding:0.75rem 0.5rem;">
                          <div style="font-weight:600;display:flex;align-items:center;gap:0.4rem;">
                            ${p.title}
                            ${p.blockers && p.blockers.length > 0 && html`<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-orange);font-size:0.8rem;"></i>`}
                          </div>
                          <div style="margin-top:0.25rem;display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;">
                            <span class="tag ${getPhaseClass(p.phase)}">${p.phase}</span>
                            <${ProjectBadges} project=${p} />
                          </div>
                        </td>
                        <td style="font-size:0.82rem;">
                          ${(() => {
                            const sh = Array.isArray(p.stakeholders) ? p.stakeholders : (p.stakeholders && p.stakeholders !== '[]' ? [p.stakeholders] : []);
                            return sh.length > 0 
                              ? sh.map(s => html`<div style="display:flex;align-items:center;gap:0.3rem;margin-bottom:0.15rem;"><i class="fa-solid fa-star" style="font-size:0.55rem;color:var(--accent-orange);"></i><span>${s}</span></div>`)
                              : html`<span style="color:var(--text-secondary);">—</span>`;
                          })()}
                        </td>
                        <td style="padding-right:2rem;">
                          <div style="font-size:0.75rem;display:flex;justify-content:space-between;margin-bottom:0.3rem;">
                            <span style="color:#4ade80;font-weight:600;">Completion: ${overall}%</span>
                            <span style="color:var(--text-secondary);">Time elapsed: ${timeline}%</span>
                          </div>
                          <div style="width:100%;height:6px;background:rgba(255,255,255,0.05);border-radius:4px;position:relative;">
                            <div style="position:absolute;top:0;left:0;height:100%;width:${timeline}%;background:var(--text-secondary);opacity:0.3;border-radius:4px;"></div>
                            <div style="position:absolute;top:0;left:0;height:100%;width:${overall}%;background:${health.color};border-radius:4px;box-shadow:0 0 4px ${health.color};"></div>
                          </div>
                        </td>
                        <td><span style="color:${health.color};font-weight:bold;background:rgba(0,0,0,0.2);padding:0.2rem 0.6rem;border-radius:4px;white-space:nowrap;">${health.label}</span></td>
                      </tr>
                      <tr style="background:rgba(74,222,128,0.03);">
                        <td colspan="4" style="padding:0.75rem 1rem;border-left:2px solid #4ade80;">
                          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;font-size:0.85rem;">
                            <div>
                              <div style="color:var(--text-secondary);font-size:0.75rem;text-transform:uppercase;font-weight:600;margin-bottom:0.25rem;">Description</div>
                              <div>${p.description || 'No description provided.'}</div>
                            </div>
                            <div>
                              <div style="color:var(--text-secondary);font-size:0.75rem;text-transform:uppercase;font-weight:600;margin-bottom:0.25rem;">Latest Status</div>
                              <div style="font-style:italic;">"${latestNote}"</div>
                              ${p.nextStep && html`<div style="margin-top:0.5rem;"><span style="color:var(--text-secondary);font-size:0.75rem;font-weight:600;text-transform:uppercase;">Next: </span><span style="color:#4ade80;font-weight:500;">${p.nextStep}</span></div>`}
                            </div>
                          </div>
                        </td>
                      </tr>
                    `;
                  })}
                </tbody>
              </table>
            `}
          `
        }
      </div>

    </div>

    <${DeepDiveDrawer}
      item=${deepDiveItem}
      type=${deepDiveType}
      tasks=${tasks}
      projects=${projects}
      onClose=${() => setDeepDiveItem(null)}
      onTaskClick=${t => { setDeepDiveItem(t); setDeepDiveType('task'); }}
    />
  `;
};


