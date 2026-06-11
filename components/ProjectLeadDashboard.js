import { apiFetch, getInitials, getPhaseClass, getHealthStatus, hasPermission, appPrompt, appConfirm, appAlert, getDefaultTeamForPhase } from '../utils/core.js';
import { getPhases } from '../utils/configStore.js';
import { ShortcutsManager } from './RoleDashboard.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
const html = htm.bind(h);

const detectUrlIcon = (url) => {
  const lowercaseUrl = url.toLowerCase();
  if (lowercaseUrl.includes('github.com')) {
    return 'fa-brands fa-github';
  } else if (lowercaseUrl.includes('gitlab.com')) {
    return 'fa-brands fa-gitlab';
  } else if (lowercaseUrl.includes('docs.google.com') || lowercaseUrl.includes('drive.google.com') || lowercaseUrl.includes('sheets') || lowercaseUrl.includes('slides')) {
    return 'fa-solid fa-file-lines';
  } else if (lowercaseUrl.includes('confluence') || lowercaseUrl.includes('wiki') || lowercaseUrl.includes('notion')) {
    return 'fa-solid fa-book';
  } else if (lowercaseUrl.includes('figma.com')) {
    return 'fa-brands fa-figma';
  } else if (lowercaseUrl.includes('slack.com')) {
    return 'fa-brands fa-slack';
  } else if (lowercaseUrl.includes('jira') || lowercaseUrl.includes('atlassian')) {
    return 'fa-brands fa-jira';
  } else if (lowercaseUrl.includes('trello')) {
    return 'fa-brands fa-trello';
  } else if (lowercaseUrl.includes('youtube') || lowercaseUrl.includes('vimeo')) {
    return 'fa-brands fa-youtube';
  }
  return 'fa-solid fa-link';
};

export const ProjectLeadDashboard = ({ projects, tasks, users, currentUser, fetchTasks, fetchProjects, setActiveTab, openTab }) => {
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [dbConfig, setDbConfig] = useState({ widgets: {}, widgetOrder: [], personal_shortcuts: [] });
  const [allUsers, setAllUsers] = useState(users || []);
  const [editingPhasesUserId, setEditingPhasesUserId] = useState(null);
  const [editingPhases, setEditingPhases] = useState([]);
  
  // Led projects
  const ledProjects = useMemo(() => (projects || []).filter(p => p.project_lead_id === currentUser.id), [projects, currentUser]);
  
  // Default selected project for roster management
  useEffect(() => {
    if (ledProjects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(ledProjects[0].id);
    }
  }, [ledProjects, selectedProjectId]);

  // Fetch dashboard config for shortcuts
  useEffect(() => {
    apiFetch('/api/users/me/config')
      .then(r => r.ok ? r.json() : {})
      .then(data => {
        setDbConfig(data.dashboard_config || { widgets: {}, widgetOrder: [], personal_shortcuts: [] });
      })
      .catch(e => console.error("Error loading config:", e));
  }, []);

  // Fetch users if not passed
  useEffect(() => {
    if (!users || users.length === 0) {
      apiFetch('/api/users')
        .then(r => r.ok ? r.json() : [])
        .then(setAllUsers)
        .catch(e => console.error(e));
    } else {
      setAllUsers(users);
    }
  }, [users]);

  // Filter lead project tasks that are pending lead approval for the selected project
  const leadPendingApprovals = useMemo(() => {
    if (!selectedProjectId) return [];
    return (tasks || []).filter(t => {
      return t.project_id === selectedProjectId && t.approval_status === 'pending_lead_approval';
    });
  }, [tasks, selectedProjectId]);

  // Filter lead project tasks in 'review' state for the selected project
  const leadReviewQueue = useMemo(() => {
    if (!selectedProjectId) return [];
    return (tasks || []).filter(t => {
      return t.project_id === selectedProjectId && t.status === 'review';
    });
  }, [tasks, selectedProjectId]);

  const activeProject = useMemo(() => {
    return ledProjects.find(p => p.id === selectedProjectId);
  }, [ledProjects, selectedProjectId]);

  // Roster members for the active project
  const rosterMembers = useMemo(() => {
    return activeProject ? (activeProject.members || []) : [];
  }, [activeProject]);

  // Available users to add (excl. current members)
  const addableUsers = useMemo(() => {
    const memberIds = rosterMembers.map(m => m.user_id);
    return allUsers.filter(u => !memberIds.includes(u.id));
  }, [allUsers, rosterMembers]);

  // Approvals & review queue handlers
  const handleLeadApprove = async (task) => {
    try {
      const res = await apiFetch(`/api/tasks/${task.id}/approve-lead`, { method: 'POST' });
      if (res.ok) {
        window.showToast ? window.showToast("Task assignment approved successfully!") : null;
        fetchTasks();
        fetchProjects();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLeadReject = async (task) => {
    try {
      const reason = await appPrompt("Reject task assignment. Why is it rejected?", "", 'Reject Task Assignment');
      if (reason === null) return;
      const res = await apiFetch(`/api/tasks/${task.id}/reject-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      if (res.ok) {
        window.showToast ? window.showToast("Task assignment rejected.") : null;
        fetchTasks();
        fetchProjects();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReviewVerify = async (task) => {
    try {
      const note = await appPrompt("Verify completion. Add a closing note if needed:", task.resolution_note || "", 'Verify Completion');
      if (note === null) return;
      const now = new Date().toISOString().split('.')[0].replace('T', ' ');
      const res = await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...task,
          status: 'done',
          resolution_note: note,
          completed_by: task.assignee,
          resolved_at: now,
          reviewed_by: currentUser.username,
          review_accepted_at: now
        })
      });
      if (res.ok) {
        window.showToast ? window.showToast("Task verified and marked Done.") : null;
        fetchTasks();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReviewRequestChanges = async (task) => {
    try {
      const reason = await appPrompt("Task rejected. Why does it need more work?", "", 'Return to In Progress');
      if (reason === null) return;
      const res = await apiFetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...task,
          status: 'in_progress',
          acceptance_status: 'pending_acceptance',
          rejection_reason: reason
        })
      });
      if (res.ok) {
        window.showToast ? window.showToast("Changes requested. Task returned to In Progress.") : null;
        fetchTasks();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Roster handlers
  const handleAddMember = async (e) => {
    const userId = e.target.value;
    if (!userId || !selectedProjectId) return;
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: parseInt(userId), assigned_phases: [] })
      });
      if (res.ok) {
        window.showToast ? window.showToast("Member added to roster.") : null;
        fetchProjects();
        e.target.value = ''; // Reset select
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleRemoveMember = async (memberUserId) => {
    if (!selectedProjectId) return;
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/members/${memberUserId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        window.showToast ? window.showToast("Member removed from roster.") : null;
        fetchProjects();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startEditPhases = (member) => {
    setEditingPhasesUserId(member.user_id);
    setEditingPhases(member.assigned_phases || []);
  };

  const togglePhaseSelection = (phaseName) => {
    setEditingPhases(prev =>
      prev.includes(phaseName)
        ? prev.filter(p => p !== phaseName)
        : [...prev, phaseName]
    );
  };

  const handleSavePhases = async (memberUserId) => {
    if (!selectedProjectId) return;
    try {
      const res = await apiFetch(`/api/projects/${selectedProjectId}/members/${memberUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_phases: editingPhases })
      });
      if (res.ok) {
        window.showToast ? window.showToast("Phase restrictions updated.") : null;
        setEditingPhasesUserId(null);
        fetchProjects();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title"><i class="fa-solid fa-crown" style="margin-right:0.6rem;color:var(--accent-yellow);"></i>Project Lead Panel</h2>
          <p class="page-subtitle">Track project health, approve team-leader task submissions, perform QA reviews, and manage membership access controls</p>
        </div>
      </div>

      <!-- 1. Led Projects Overview Grid -->
      <div style="margin-bottom: 2.5rem;">
        <div class="sticky-section-header" style="margin-bottom:1.25rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
          <span style="font-size:1.1rem; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:0.5rem;">
            <i class="fa-solid fa-folder-open" style="color:var(--accent-blue);"></i> Led Projects Overview
          </span>
        </div>
        
        ${ledProjects.length === 0 ? html`
          <div style="text-align:center; padding:3rem 2rem; color:var(--text-secondary); font-style:italic; border:1px dashed var(--border-color); border-radius:8px;">
            You are not currently designated as the Lead for any project.
          </div>
        ` : html`
          <div class="grid-3" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:1.5rem;">
            ${ledProjects.map(p => {
              const pct = p.progress || 0;
              const health = getHealthStatus(p, tasks);
              const isSelected = selectedProjectId === p.id;
              
              return html`
                <div class="metric-card" 
                  style="padding:1.25rem; border:1px solid ${isSelected ? 'var(--accent-yellow)' : 'var(--border-color)'}; border-top:3px solid ${isSelected ? 'var(--accent-yellow)' : 'var(--border-color)'}; background:${isSelected ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.01)'}; box-shadow:${isSelected ? '0 4px 12px rgba(234,179,8,0.15)' : 'none'}; transition:all 0.2s; position:relative; cursor:pointer;"
                  onClick=${() => setSelectedProjectId(p.id)}
                >
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem; gap: 0.5rem;">
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                      <span style="font-weight:700; font-size:1.05rem; color:${isSelected ? 'var(--accent-yellow)' : 'var(--text-primary)'};">
                        ${p.title}
                      </span>
                      ${isSelected && html`
                        <span class="tag" style="background:rgba(234,179,8,0.15); color:var(--accent-yellow); border:1px solid rgba(234,179,8,0.3); font-size:0.62rem; padding: 0.1rem 0.35rem; font-weight:800; display:inline-flex; align-items:center; gap:0.2rem;">
                          <i class="fa-solid fa-filter"></i> Active
                        </span>
                      `}
                    </div>
                    <div style="display:flex; align-items:center; gap:0.4rem; flex-shrink:0;" onClick=${(e) => e.stopPropagation()}>
                      <span style="color:${health.color}; font-size:0.72rem; font-weight:700; text-transform:uppercase;">${health.label}</span>
                      <button class="btn" style="padding:0.15rem 0.4rem; font-size:0.7rem; background:rgba(255,255,255,0.05); border:1px solid var(--border-color);" 
                        onClick=${() => openTab('project:' + p.id, p.title, 'fa-folder', 'project', p.id)}
                        title="View Full Details">
                        <i class="fa-solid fa-expand"></i> Details
                      </button>
                    </div>
                  </div>
                  
                  <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:1rem; min-height: 2.2rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                    ${p.description || 'No description provided.'}
                  </div>
                  
                  <div style="width:100%; height:5px; background:rgba(255,255,255,0.07); border-radius:3px; overflow:hidden; margin-bottom:0.5rem;">
                    <div style="height:100%; width:${pct}%; background:var(--accent-blue); border-radius:3px;"></div>
                  </div>
                  
                  <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; color:var(--text-secondary);">
                    <span>${pct}% complete · ${p.phase}</span>
                    <span>${p.members ? p.members.length : 0} members</span>
                  </div>
                  
                  <!-- Direct Phase Transition -->
                  <div style="margin-top: 0.75rem; display:flex; align-items:center; gap:0.5rem; justify-content:space-between; border-top:1px dashed rgba(255,255,255,0.05); padding-top:0.75rem;" onClick=${(e) => e.stopPropagation()}>
                    <span style="font-size:0.72rem; color:var(--text-secondary);"><i class="fa-solid fa-code-branch" style="color:var(--accent-purple);margin-right:0.2rem;"></i>Move Phase:</span>
                    <select class="form-select" style="font-size:0.72rem; padding:0.15rem 0.4rem; background:rgba(0,0,0,0.3); border-color:rgba(255,255,255,0.1); max-width:180px; height: 26px;" 
                      value=${p.phase} 
                      onChange=${async (e) => {
                        const nextPhase = e.target.value;
                        if (nextPhase === p.phase) return;
                        
                        const confirmed = await appConfirm(`Are you sure you want to transition project "${p.title}" from phase "${p.phase}" to "${nextPhase}"?`, "Change Phase");
                        if (!confirmed) {
                          e.target.value = p.phase;
                          return;
                        }
                        
                        const today = new Date().toISOString().split('T')[0];
                        const previousIdx = getPhases().indexOf(p.phase);
                        const nextIdx = getPhases().indexOf(nextPhase);
                        const isBackward = nextIdx < previousIdx;
                        let note = isBackward ? `Iterated back from ${p.phase} to ${nextPhase}` : `Advanced from ${p.phase} to ${nextPhase}`;
                        
                        let is_iterating = p.is_iterating;
                        let iteration = p.iteration || 1;
                        if (p.phase === 'Deployed and in Use' && isBackward) {
                            is_iterating = 1;
                            iteration += 1;
                            note = `⚠ Production Iteration started — re-entering CRISP-DM cycle at ${nextPhase}. Iteration ${iteration}.`;
                        }
                        
                        const newHistory = [...(p.history || []), { date: today, phase: nextPhase, status: 'phase_change', note }];
                        const resolvedTeam = getDefaultTeamForPhase(nextPhase);
                        const autoDeployed = nextPhase === 'Deployed and in Use' ? 1 : p.is_deployed;
                        
                        const payload = {
                          ...p,
                          phase: nextPhase,
                          team: resolvedTeam,
                          progress: 0,
                          is_deployed: autoDeployed,
                          is_iterating,
                          iteration,
                          history: newHistory
                        };
                        
                        try {
                          const res = await apiFetch('/api/projects', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                          });
                          if (res.ok) {
                            window.showToast ? window.showToast("Project phase moved successfully!") : null;
                            fetchProjects();
                          } else {
                            await appAlert("Failed to move phase. Check server logs.", "Error");
                            e.target.value = p.phase;
                          }
                        } catch (err) {
                          console.error(err);
                          e.target.value = p.phase;
                        }
                      }}>
                      ${getPhases().map(ph => html`<option value=${ph}>${ph}</option>`)}
                    </select>
                  </div>
                </div>
              `;
            })}
          </div>
        `}
      </div>

      <div class="grid-2" style="display:grid; grid-template-columns: 1.2fr 0.8fr; gap:1.5rem; align-items: flex-start; margin-bottom: 2.5rem;">
        
        <!-- Left Column: Approvals & Reviews -->
        <div style="display:flex; flex-direction:column; gap:1.5rem;">
          
          <!-- 2. Pending Lead Approvals -->
          <div class="metric-card" style="padding:1.25rem; border-top:3px solid var(--accent-yellow);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
              <h3 style="font-size:0.95rem; font-weight:700; color:var(--accent-yellow); margin:0;">
                <i class="fa-solid fa-stamp"></i> Pending Assignment Approvals
              </h3>
              <span style="font-size:0.75rem; background:rgba(234,179,8,0.15); color:var(--accent-yellow); padding:0.1rem 0.5rem; border-radius:10px; font-weight:700;">
                ${leadPendingApprovals.length}
              </span>
            </div>
            
            ${leadPendingApprovals.length === 0 ? html`
              <div style="text-align:center; padding:2rem; color:var(--text-secondary); font-style:italic; font-size:0.85rem; border:1px dashed var(--border-color); border-radius:8px;">
                No pending assignment approvals.
              </div>
            ` : html`
              <div style="display:flex; flex-direction:column; gap:0.75rem;">
                ${leadPendingApprovals.map(t => html`
                  <div style="padding:0.75rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary);">${t.title}</div>
                      <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.2rem;">
                        Project: <strong>${t.project_id}</strong> · Assignee: <strong>@${t.assignee}</strong> · Phase: <strong>${t.crisp_dm_phase}</strong>
                      </div>
                    </div>
                    <div style="display:flex; gap:0.4rem;">
                      <button class="btn" style="background:var(--accent-green); color:white; padding:0.25rem 0.5rem; font-size:0.75rem;" onClick=${() => handleLeadApprove(t)}>Approve</button>
                      <button class="btn" style="border:1px solid var(--accent-orange); color:var(--accent-orange); padding:0.25rem 0.5rem; font-size:0.75rem;" onClick=${() => handleLeadReject(t)}>Reject</button>
                    </div>
                  </div>
                `)}
              </div>
            `}
          </div>

          <!-- 3. QA Review Queue -->
          <div class="metric-card" style="padding:1.25rem; border-top:3px solid var(--accent-purple);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem;">
              <h3 style="font-size:0.95rem; font-weight:700; color:var(--accent-purple); margin:0;">
                <i class="fa-solid fa-clipboard-check"></i> QA Review Queue
              </h3>
              <span style="font-size:0.75rem; background:rgba(167,139,250,0.15); color:var(--accent-purple); padding:0.1rem 0.5rem; border-radius:10px; font-weight:700;">
                ${leadReviewQueue.length}
              </span>
            </div>
            
            ${leadReviewQueue.length === 0 ? html`
              <div style="text-align:center; padding:2rem; color:var(--text-secondary); font-style:italic; font-size:0.85rem; border:1px dashed var(--border-color); border-radius:8px;">
                No completed tasks awaiting verification.
              </div>
            ` : html`
              <div style="display:flex; flex-direction:column; gap:0.75rem;">
                ${leadReviewQueue.map(t => html`
                  <div style="padding:0.75rem; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary);">${t.title}</div>
                      <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:0.2rem;">
                        Project: <strong>${t.project_id}</strong> · Assignee: <strong>@${t.assignee}</strong> · Phase: <strong>${t.crisp_dm_phase}</strong>
                      </div>
                    </div>
                    <div style="display:flex; gap:0.4rem;">
                      <button class="btn" style="background:var(--accent-green); color:white; padding:0.25rem 0.5rem; font-size:0.75rem;" onClick=${() => handleReviewVerify(t)}>Verify Done</button>
                      <button class="btn" style="border:1px solid var(--accent-orange); color:var(--accent-orange); padding:0.25rem 0.5rem; font-size:0.75rem;" onClick=${() => handleReviewRequestChanges(t)}>Reject</button>
                    </div>
                  </div>
                `)}
              </div>
            `}
          </div>

        </div>

        <!-- Right Column: Project Roster Manager & Bookmarks -->
        <div>
          <!-- Project Roster Manager -->
          <div class="metric-card" style="padding:1.25rem; border-top:3px solid var(--accent-blue);">
            <h3 style="font-size:0.95rem; font-weight:700; color:var(--accent-blue); margin:0 0 1rem 0; display:flex; align-items:center; gap:0.4rem;">
              <i class="fa-solid fa-users"></i> Project Roster Manager
            </h3>

            ${!activeProject ? html`
              <div style="text-align:center; padding:1.5rem; color:var(--text-secondary); font-style:italic; font-size:0.8rem;">
                Select a project from the overview above to manage its membership roster.
              </div>
            ` : html`
              <div>
                <div style="margin-bottom: 1.25rem;">
                  <label style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:0.4rem;">Active Project</label>
                  <select class="form-select" style="width:100%;" value=${selectedProjectId} onChange=${e => setSelectedProjectId(e.target.value)}>
                    ${ledProjects.map(p => html`<option value=${p.id}>${p.title}</option>`)}
                  </select>
                </div>

                <!-- Add Member Dropdown -->
                <div style="margin-bottom: 1.5rem; padding: 0.75rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px;">
                  <label style="font-size:0.75rem; color:var(--text-secondary); display:block; margin-bottom:0.4rem; font-weight:700;">Add Member to Project</label>
                  <select class="form-select" style="width:100%;" onChange=${handleAddMember}>
                    <option value="">-- Select user to enroll --</option>
                    ${addableUsers.map(u => html`<option value=${u.id}>@${u.username} (${u.role || 'member'})</option>`)}
                  </select>
                </div>

                <!-- Enrolled Members List -->
                <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:700; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.5px;">Enrolled Members (${rosterMembers.length})</div>
                
                ${rosterMembers.length === 0 ? html`
                  <div style="text-align:center; padding:1rem; color:var(--text-secondary); font-style:italic; border:1px dashed var(--border-color); border-radius:6px;">
                    No enrolled members. Assign a task to auto-enroll, or select a user above.
                  </div>
                ` : html`
                  <div style="display:flex; flex-direction:column; gap:0.5rem; max-height: 350px; overflow-y: auto;">
                    ${rosterMembers.map(m => {
                      const isEditing = editingPhasesUserId === m.user_id;
                      
                      return html`
                        <div style="padding:0.75rem; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.03); border-radius:6px; display:flex; flex-direction:column; gap:0.5rem;">
                          <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="font-weight:700; font-size:0.85rem; display:flex; align-items:center; gap:0.4rem;">
                              <div class="user-avatar" style="width: 1.5rem; height: 1.5rem; font-size: 0.7rem; background: var(--accent-blue); color: white;">
                                ${getInitials(m.username)}
                              </div>
                              @${m.username}
                            </div>
                            <button class="btn" style="padding:0.15rem 0.35rem; font-size:0.7rem; border:1px solid var(--accent-pink); color:var(--accent-pink); background:none;" onClick=${() => handleRemoveMember(m.user_id)}>
                              Remove
                            </button>
                          </div>

                          <!-- Phase Assignments -->
                          <div style="background:rgba(0,0,0,0.1); padding:0.5rem; border-radius:4px;">
                            ${isEditing ? html`
                              <div>
                                <div style="font-size:0.7rem; color:var(--text-secondary); margin-bottom:0.4rem; font-weight:700;">Phase Restrictions (toggle phases):</div>
                                <div style="display:flex; flex-wrap:wrap; gap:0.3rem; margin-bottom:0.5rem;">
                                  ${getPhases().map(p => {
                                    const selected = editingPhases.includes(p);
                                    return html`
                                      <span style="font-size:0.7rem; padding:0.15rem 0.35rem; border-radius:4px; cursor:pointer; background:${selected ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)'}; color:${selected ? 'white' : 'var(--text-secondary)'};" onClick=${() => togglePhaseSelection(p)}>
                                        ${p}
                                      </span>
                                    `;
                                  })}
                                </div>
                                <div style="display:flex; gap:0.3rem; justify-content:flex-end;">
                                  <button class="btn" style="padding:0.15rem 0.4rem; font-size:0.7rem; background:none; border:1px solid var(--border-color);" onClick=${() => setEditingPhasesUserId(null)}>Cancel</button>
                                  <button class="btn" style="padding:0.15rem 0.4rem; font-size:0.7rem; background:var(--accent-blue); color:white;" onClick=${() => handleSavePhases(m.user_id)}>Save</button>
                                </div>
                              </div>
                            ` : html`
                              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
                                <div style="font-size:0.72rem; color:var(--text-secondary); line-height: 1.4;">
                                  Phases: ${m.assigned_phases && m.assigned_phases.length > 0 
                                    ? m.assigned_phases.map(ph => html`<span class="tag ${getPhaseClass(ph)}" style="font-size:0.65rem; margin-right:0.25rem; padding: 0.05rem 0.25rem;">${ph}</span>`) 
                                    : html`<span style="font-style:italic;color:var(--text-muted);">Unrestricted (all phases)</span>`
                                  }
                                </div>
                                <button class="btn" style="padding:0.15rem 0.35rem; font-size:0.7rem; background:rgba(255,255,255,0.05); flex-shrink:0;" onClick=${() => startEditPhases(m)}>
                                  Restrict Phases
                                </button>
                              </div>
                            `}
                          </div>
                        </div>
                      `;
                    })}
                  </div>
                `}
              </div>
            `}
          </div>

          <!-- Project Bookmarks -->
          <div class="metric-card" style="padding:1.25rem; border-top:3px solid var(--accent-purple); margin-top:1.5rem;">
            <h3 style="font-size:0.95rem; font-weight:700; color:var(--accent-purple); margin:0 0 1rem 0; display:flex; align-items:center; gap:0.4rem;">
              <i class="fa-solid fa-bookmark"></i> Project Bookmarks
            </h3>
            
            ${!activeProject ? html`
              <div style="text-align:center; padding:1.5rem; color:var(--text-secondary); font-style:italic; font-size:0.8rem;">
                Select a project from the overview above to manage its custom bookmarks.
              </div>
            ` : html`
              <div>
                <!-- Add Bookmark Form -->
                <form onSubmit=${async (e) => {
                  e.preventDefault();
                  const titleEl = document.getElementById('proj-shortcut-title');
                  const urlEl = document.getElementById('proj-shortcut-url');
                  if (!titleEl || !urlEl || !titleEl.value.trim() || !urlEl.value.trim()) return;
                  
                  const title = titleEl.value.trim();
                  let url = urlEl.value.trim();
                  if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
                  
                  const currentShortcuts = activeProject.shortcuts || [];
                  const updatedShortcuts = [...currentShortcuts, { title, url, icon: detectUrlIcon(url) }];
                  
                  const payload = {
                    ...activeProject,
                    shortcuts: updatedShortcuts
                  };
                  
                  try {
                    const res = await apiFetch('/api/projects', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(payload)
                    });
                    if (res.ok) {
                      window.showToast ? window.showToast("Bookmark added successfully!") : null;
                      titleEl.value = '';
                      urlEl.value = '';
                      fetchProjects();
                    } else {
                      await appAlert("Failed to add bookmark. Check server logs.", "Error");
                    }
                  } catch (err) {
                    console.error(err);
                  }
                }} style="margin-bottom: 1.5rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 6px; display:flex; flex-direction:column; gap:0.5rem;">
                  <div style="font-size:0.72rem; color:var(--text-secondary); font-weight:700;">ADD CUSTOM BOOKMARK</div>
                  <input type="text" id="proj-shortcut-title" placeholder="Link Title (e.g. Design Doc)" class="form-input" style="font-size:0.8rem; padding:0.25rem 0.5rem; background:rgba(0,0,0,0.25);" required />
                  <input type="text" id="proj-shortcut-url" placeholder="URL (e.g. docs.google.com/xyz)" class="form-input" style="font-size:0.8rem; padding:0.25rem 0.5rem; background:rgba(0,0,0,0.25);" required />
                  <button type="submit" class="btn active" style="background:var(--accent-purple); font-size:0.75rem; padding:0.3rem; font-weight:600; text-align:center;">Add Bookmark</button>
                </form>

                <!-- Bookmarks List -->
                <div style="font-size:0.75rem; color:var(--text-secondary); font-weight:700; margin-bottom:0.5rem; text-transform:uppercase; letter-spacing:0.5px;">Links & Resources</div>
                
                ${(!activeProject.shortcuts || activeProject.shortcuts.length === 0) ? html`
                  <div style="text-align:center; padding:1.5rem; color:var(--text-secondary); font-style:italic; font-size:0.8rem; border:1px dashed var(--border-color); border-radius:6px;">
                    No bookmarks added yet. Add reference links, requirements docs, or wiki pages.
                  </div>
                ` : html`
                  <div style="display:flex; flex-direction:column; gap:0.5rem; max-height:250px; overflow-y:auto;">
                    ${activeProject.shortcuts.map((sh, idx) => html`
                      <div style="padding:0.5rem 0.75rem; background:rgba(255,255,255,0.01); border:1px solid rgba(255,255,255,0.03); border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
                        <a href=${sh.url} target="_blank" style="color:var(--accent-blue); text-decoration:none; font-weight:600; font-size:0.8rem; display:flex; align-items:center; gap:0.4rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;" title=${sh.url}>
                          <i class="${sh.icon || 'fa-solid fa-link'}" style="font-size:0.8rem;"></i>
                          ${sh.title}
                        </a>
                        <button class="btn" style="padding:0.15rem 0.35rem; font-size:0.65rem; border:1px solid var(--accent-pink); color:var(--accent-pink); background:none;"
                          onClick=${async (e) => {
                            e.stopPropagation();
                            const confirmed = await appConfirm(`Are you sure you want to delete bookmark "${sh.title}"?`, "Delete Bookmark");
                            if (!confirmed) return;
                            const updated = (activeProject.shortcuts || []).filter((_, i) => i !== idx);
                            const payload = {
                              ...activeProject,
                              shortcuts: updated
                            };
                            try {
                              const res = await apiFetch('/api/projects', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                              });
                              if (res.ok) {
                                window.showToast ? window.showToast("Bookmark deleted.") : null;
                                fetchProjects();
                              }
                            } catch (err) {
                              console.error(err);
                            }
                          }}>
                          Delete
                        </button>
                      </div>
                    `)}
                  </div>
                `}
              </div>
            `}
          </div>
        </div>

      </div>

      <!-- 5. Shortcuts (reused component) -->
      ${ledProjects.length > 0 && html`
        <div style="margin-top: 1.5rem;">
          <div class="sticky-section-header" style="margin-bottom:1.25rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
            <span style="font-size:1.1rem; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-link" style="color:var(--accent-blue);"></i> Resources & Shortcuts
            </span>
          </div>
          <${ShortcutsManager} currentUser=${currentUser} dbConfig=${dbConfig} saveConfig=${(cfg) => setDbConfig(cfg)} teamsList=${[currentUser.team].filter(Boolean)} />
        </div>
      `}

    </div>
  `;
};
