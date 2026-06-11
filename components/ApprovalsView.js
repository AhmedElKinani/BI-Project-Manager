import { apiFetch, getPhaseClass, appPrompt, sendNotification, sendChannelMessage, logAudit, hasPermission } from '../utils/core.js';
import { h } from 'https://esm.sh/preact';
import { useState } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
const html = htm.bind(h);

export const ApprovalsView = ({ tasks, fetchTasks, currentUser, projects }) => {
  const isAdmin = hasPermission(currentUser, 'admin.panel');
  const myTeams = currentUser.teams || [currentUser.team];
  
  const [processedLog, setProcessedLog] = useState([]);

  // Helper to determine if the user has approval/management rights on this specific task
  const canUserActOnTask = (t) => {
    if (isAdmin) return true;
    
    if (t.approval_status === 'pending_team_lead_approval') {
      return myTeams.includes(t.team) && hasPermission(currentUser, 'task.approve');
    }
    
    const proj = (projects||[]).find(p => p.id === t.project_id);
    const isProjectLead = proj && proj.project_lead_id === currentUser.id;
    const projectHasLead = proj && proj.project_lead_id;

    if (isProjectLead) return true;
    if (projectHasLead) return false; // Other team leaders lose rights on project with lead

    return myTeams.includes(t.team) && (
      hasPermission(currentUser, 'task.approve') || 
      hasPermission(currentUser, 'task.review_accept') || 
      hasPermission(currentUser, 'task.review_finish')
    );
  };

  // Segregation of Duties filtering:
  // Show tasks where current user is Admin or Team Leader of the task's team, and status is pending_team_lead_approval.
  const allCreations = tasks.filter(t => {
    return (isAdmin || (myTeams.includes(t.team) && hasPermission(currentUser, 'task.approve'))) && t.approval_status === 'pending_team_lead_approval';
  });
  const creationApprovals = allCreations.filter(t => t.created_by !== currentUser.username);
  const selfCreations = allCreations.filter(t => t.created_by === currentUser.username);

  const allReviews = tasks.filter(t => {
    const proj = (projects||[]).find(p => p.id === t.project_id);
    const isProjectLead = proj && proj.project_lead_id === currentUser.id;
    const isTeamLeader = myTeams.includes(t.team) && (
      hasPermission(currentUser, 'task.approve') || 
      hasPermission(currentUser, 'task.review_accept') || 
      hasPermission(currentUser, 'task.review_finish')
    );
    return (isAdmin || isProjectLead || isTeamLeader) && t.status === 'review';
  });
  const reviewRequests = allReviews.filter(t => t.assignee !== currentUser.username);
  const selfReviews = allReviews.filter(t => t.assignee === currentUser.username);

  const totalRestricted = selfCreations.length + selfReviews.length;

  const addLog = (task, actionType, status) => {
    const newEntry = {
      id: Date.now() + Math.random().toString(36).substr(2, 5),
      taskTitle: task.title,
      taskId: task.id,
      assignee: task.assignee || task.created_by,
      actionType,
      status,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    setProcessedLog(prev => [newEntry, ...prev].slice(0, 5));
  };

  const processApproval = async (task, isApproved) => {
    if (isApproved) {
      await apiFetch(`/api/tasks/${task.id}/approve-team-lead`, { 
        method: 'POST'
      });
      addLog(task, 'Team-Lead Approval', 'Approved');
    } else {
      const reason = await appPrompt("Reject assignment. Why is it rejected?", "", 'Reject Assignment');
      if (reason === null) return;
      await apiFetch(`/api/tasks/${task.id}/reject-team-lead`, { 
        method: 'POST', 
        headers: {'Content-Type':'application/json'}, 
        body: JSON.stringify({ reason }) 
      });
      addLog(task, 'Team-Lead Approval', 'Rejected');
    }
    logAudit(currentUser, 'TASK_APPROVAL', `${isApproved ? 'Approved' : 'Rejected'} task "${task.title}" from ${task.created_by}`);
    fetchTasks();
  };

  const handleReviewFinish = async (task, approved) => {
    if (approved) {
        const note = await appPrompt("Verify completion. Add a closing note if needed:", task.resolution_note || "", 'Verify Completion');
        if (note === null) return;
        const now = new Date().toISOString().split('.')[0].replace('T',' ');
        await apiFetch('/api/tasks/' + task.id, { 
          method: 'PUT', 
          headers: {'Content-Type':'application/json'}, 
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
        sendNotification(task.assignee, `Your task "${task.title}" has been verified and marked DONE.`, task.id);
        addLog(task, 'Task Review', 'Verified Done');
    } else {
        const reason = await appPrompt("Task rejected. Why does it need more work?", "", 'Return to In Progress');
        if (reason === null) return;
        await apiFetch('/api/tasks/' + task.id, { 
          method: 'PUT', 
          headers: {'Content-Type':'application/json'}, 
          body: JSON.stringify({
            ...task, 
            status: 'in_progress', 
            acceptance_status: 'pending_acceptance', 
            rejection_reason: reason
          }) 
        });
        sendNotification(task.assignee, `Changes requested for "${task.title}": ${reason}`, task.id);
        addLog(task, 'Task Review', 'Rejected');
    }
    fetchTasks();
  };

  const handleLeadApprove = async (task) => {
    try {
      const res = await apiFetch(`/api/tasks/${task.id}/approve-lead`, { method: 'POST' });
      if (res.ok) {
        addLog(task, 'Lead Approval', 'Approved');
        fetchTasks();
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
        addLog(task, 'Lead Approval', 'Rejected');
        fetchTasks();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const renderTask = (t, type) => {
    const proj = (projects||[]).find(p => p.id === t.project_id);
    const hasLead = proj && proj.project_lead;
    const canAct = canUserActOnTask(t);

    return html`
      <div class="info-block" style="padding:1rem;margin-bottom:0.75rem;border-left:4px solid ${type==='creation'?'var(--accent-orange)':'var(--accent-purple)'}; border-radius: 4px; background: rgba(255,255,255,0.03);">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div style="flex:1;min-width:0;padding-right:0.5rem;">
            <div style="font-weight:700;font-size:0.95rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title=${t.title}>${t.title}</div>
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem;display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              <span>By: <strong>@${t.assignee || t.created_by}</strong></span>
              ${proj ? html` <span style="padding:0.1rem 0.3rem;background:rgba(255,255,255,0.08);border-radius:4px;font-size:0.75rem;">${proj.id}</span>` : ''}
              ${hasLead ? html`<span class="lead-badge" style="background:rgba(234,179,8,0.15);color:var(--accent-yellow);padding:0.1rem 0.4rem;border-radius:4px;font-size:0.72rem;font-weight:600;display:inline-flex;align-items:center;gap:0.2rem;" title="Project Lead"><i class="fa-solid fa-star" style="font-size:0.65rem;"></i> Lead: ${proj.project_lead}</span>` : ''}
            </div>
          </div>
          <div style="flex-shrink:0;display:flex;gap:0.4rem;align-items:center;">
            ${canAct ? (
              type === 'creation' ? html`
                <button class="btn" style="background:var(--accent-green);color:white;padding:0.3rem 0.6rem;font-size:0.75rem;" onClick=${() => processApproval(t, true)}>Approve</button>
                <button class="btn" style="border:1px solid var(--accent-orange);color:var(--accent-orange);padding:0.3rem 0.6rem;font-size:0.75rem;" onClick=${() => processApproval(t, false)}>Reject</button>
              ` : html`
                <button class="btn" style="background:var(--accent-green);color:white;padding:0.3rem 0.6rem;font-size:0.75rem;" onClick=${() => handleReviewFinish(t, true)}>Verify Done</button>
                <button class="btn" style="border:1px solid var(--accent-orange);color:var(--accent-orange);padding:0.3rem 0.6rem;font-size:0.75rem;" onClick=${() => handleReviewFinish(t, false)}>Reject</button>
              `
            ) : html`
              <span style="font-size:0.75rem;color:var(--text-secondary);font-style:italic;display:flex;align-items:center;gap:0.25rem;">
                <i class="fa-solid fa-lock" style="font-size:0.7rem;"></i> Managed by Project Lead: ${proj ? proj.project_lead : 'Unknown'}
              </span>
            `}
          </div>
        </div>
      </div>
    `;
  };

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title"><i class="fa-solid fa-stamp" style="margin-right:0.6rem;color:var(--accent-orange);"></i>Team Lead Approvals</h2>
          <p class="page-subtitle">Verify task completions, manage team workload, and approve new initiatives with SoD security compliance</p>
        </div>
      </div>

      ${totalRestricted > 0 && html`
        <div style="margin-bottom: 1.5rem; padding: 1rem; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; display: flex; align-items: center; gap: 0.75rem; backdrop-filter: blur(10px);">
          <i class="fa-solid fa-circle-info" style="color: #60a5fa; font-size: 1.2rem;"></i>
          <span style="font-size: 0.88rem; color: #93c5fd; font-weight: 500;">
            <strong>SOC 2 Compliance Safeguard:</strong> ${totalRestricted} task${totalRestricted > 1 ? 's' : ''} initiated or assigned by you ${totalRestricted > 1 ? 'are' : 'is'} currently hidden from your action lists. These require peer verification/approval to satisfy segregation of duties.
          </span>
        </div>
      `}

      <div class="grid-3" style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:1.5rem;">
        <!-- Column 1: Team Approvals -->
        <div class="metric-card" style="padding:1.25rem;border-top:3px solid var(--accent-orange);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;">
               <h3 style="font-size:0.95rem;font-weight:700;color:var(--accent-orange);margin:0;"><i class="fa-solid fa-plus-circle"></i> Team Approvals</h3>
               <span style="font-size:0.75rem;background:rgba(251,146,60,0.15);color:var(--accent-orange);padding:0.1rem 0.5rem;border-radius:10px;font-weight:700;">${creationApprovals.length}</span>
            </div>
            ${creationApprovals.filter(canUserActOnTask).length > 0 && html`
               <button class="btn" style="font-size:0.7rem;padding:0.2rem 0.5rem;background:var(--accent-green);color:white;" onClick=${async () => {
                 const actionable = creationApprovals.filter(canUserActOnTask);
                 for (const t of actionable) await processApproval(t, true);
               }}><i class="fa-solid fa-check-double"></i> Bulk Approve</button>
            `}
          </div>
          ${creationApprovals.length === 0 
            ? html`<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-style:italic;font-size:0.85rem;border:1px dashed var(--border-color);border-radius:8px;">Queue is clear.</div>` 
            : creationApprovals.map(t => renderTask(t, 'creation'))
          }
        </div>

        <!-- Column 2: Review Requests -->
        <div class="metric-card" style="padding:1.25rem;border-top:3px solid var(--accent-purple);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
            <div style="display:flex;align-items:center;gap:0.5rem;">
              <h3 style="font-size:0.95rem;font-weight:700;color:var(--accent-purple);margin:0;"><i class="fa-solid fa-inbox"></i> Review Requests</h3>
              <span style="font-size:0.75rem;background:rgba(167,139,250,0.15);color:var(--accent-purple);padding:0.1rem 0.5rem;border-radius:10px;font-weight:700;">${reviewRequests.length}</span>
            </div>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;font-style:italic;">Peer completions awaiting your verification.</div>
          ${reviewRequests.length === 0 
            ? html`<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-style:italic;font-size:0.85rem;border:1px dashed var(--border-color);border-radius:8px;">No tasks pending review.</div>` 
            : reviewRequests.map(t => renderTask(t, 'review'))
          }
        </div>

        <!-- Column 3: Recently Processed -->
        <div class="metric-card" style="padding:1.25rem;border-top:3px solid var(--accent-green);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
            <h3 style="font-size:0.95rem;font-weight:700;color:var(--accent-green);margin:0;"><i class="fa-solid fa-clock-rotate-left"></i> Session Logs</h3>
            <span style="font-size:0.75rem;background:rgba(74,222,128,0.15);color:var(--accent-green);padding:0.1rem 0.5rem;border-radius:10px;font-weight:700;">${processedLog.length}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:1rem;font-style:italic;">Your recently processed actions in this session.</div>
          ${processedLog.length === 0 
            ? html`<div style="text-align:center;padding:2rem;color:var(--text-secondary);font-style:italic;font-size:0.85rem;border:1px dashed var(--border-color);border-radius:8px;">No activity logged yet.</div>` 
            : processedLog.map(item => html`
                <div style="padding:0.75rem;margin-bottom:0.5rem;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:6px;font-size:0.8rem;">
                  <div style="display:flex;justify-content:space-between;align-items:center;font-weight:600;">
                    <span style="color:var(--accent-green);text-transform:uppercase;font-size:0.7rem;letter-spacing:0.5px;">${item.actionType}</span>
                    <span style="font-size:0.7rem;color:var(--text-secondary);font-weight:normal;">${item.timestamp}</span>
                  </div>
                  <div style="font-weight:700;margin:0.25rem 0 0.15rem 0;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title=${item.taskTitle}>${item.taskTitle}</div>
                  <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;color:var(--text-secondary);">
                    <span>User: @${item.assignee}</span>
                    <span style="padding:0.05rem 0.35rem;background:${item.status.includes('Reject')?'rgba(239,68,68,0.15)':'rgba(74,222,128,0.15)'};color:${item.status.includes('Reject')?'#f87171':'#4ade80'};border-radius:4px;font-weight:700;font-size:0.7rem;">${item.status}</span>
                  </div>
                </div>
              `)
          }
        </div>
      </div>

      ${(projects || []).some(p => p.project_lead_id === currentUser.id) && html`
        <div style="margin-top: 2.5rem; margin-bottom: 2rem;">
          <div class="sticky-section-header" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; border-bottom:1px solid var(--border-color); padding-bottom:0.5rem;">
            <span style="font-size:1.2rem; font-weight:700; color:var(--accent-yellow); display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-crown"></i> Lead Project Approvals
            </span>
            <span style="font-size:0.8rem; background:rgba(234,179,8,0.15); color:var(--accent-yellow); padding:0.2rem 0.6rem; border-radius:10px; font-weight:700;">
              ${tasks.filter(t => {
                const proj = (projects || []).find(p => p.id === t.project_id);
                return proj && proj.project_lead_id === currentUser.id && t.approval_status === 'pending_lead_approval';
              }).length} Pending
            </span>
          </div>

          ${tasks.filter(t => {
            const proj = (projects || []).find(p => p.id === t.project_id);
            return proj && proj.project_lead_id === currentUser.id && t.approval_status === 'pending_lead_approval';
          }).length === 0 ? html`
            <div style="text-align:center; padding:3rem 2rem; color:var(--text-secondary); font-style:italic; font-size:0.9rem; border:1px dashed var(--border-color); border-radius:8px; background: rgba(255,255,255,0.01);">
              <i class="fa-solid fa-circle-check" style="font-size:2rem; color:var(--accent-green); margin-bottom:0.75rem; display:block;"></i>
              No lead project approvals pending. All clear!
            </div>
          ` : html`
            <div class="grid-3" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:1.5rem;">
              ${tasks.filter(t => {
                const proj = (projects || []).find(p => p.id === t.project_id);
                return proj && proj.project_lead_id === currentUser.id && t.approval_status === 'pending_lead_approval';
              }).map(t => {
                const proj = (projects||[]).find(p => p.id === t.project_id);
                return html`
                  <div class="metric-card" style="padding:1.25rem; border-top:3px solid var(--accent-yellow); background:rgba(255,255,255,0.02); display:flex; flex-direction:column; justify-content:space-between; gap:1rem;">
                    <div>
                      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.5rem;">
                        <span style="font-size:0.72rem; padding:0.15rem 0.4rem; background:rgba(234,179,8,0.15); color:var(--accent-yellow); border-radius:4px; font-weight:700; text-transform:uppercase;">
                          ${proj ? proj.title : t.project_id}
                        </span>
                        <span style="font-size:0.75rem; color:var(--text-secondary);">
                          Phase: <strong>${t.crisp_dm_phase}</strong>
                        </span>
                      </div>
                      <h4 style="font-size:1rem; font-weight:700; color:var(--text-primary); margin:0 0 0.5rem 0;">${t.title}</h4>
                      <p style="font-size:0.82rem; color:var(--text-secondary); margin:0; line-height:1.4; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;" title=${t.description}>
                        ${t.description || html`<span style="font-style:italic;color:var(--text-muted);">No description provided</span>`}
                      </p>
                    </div>
                    <div style="border-top:1px solid rgba(255,255,255,0.05); padding-top:0.75rem; display:flex; justify-content:space-between; align-items:center;">
                      <div style="font-size:0.78rem; color:var(--text-secondary);">
                        Assignee: <strong style="color:var(--text-primary);">@${t.assignee || 'Unassigned'}</strong>
                      </div>
                      <div style="display:flex; gap:0.5rem;">
                        <button class="btn" style="background:var(--accent-green); color:white; padding:0.3rem 0.6rem; font-size:0.75rem;" onClick=${() => handleLeadApprove(t)}>Approve</button>
                        <button class="btn" style="border:1px solid var(--accent-orange); color:var(--accent-orange); padding:0.3rem 0.6rem; font-size:0.75rem;" onClick=${() => handleLeadReject(t)}>Reject</button>
                      </div>
                    </div>
                  </div>
                `;
              })}
            </div>
          `}
        </div>
      `}
    </div>
  `;
};
