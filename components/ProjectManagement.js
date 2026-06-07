import { getTeamClass, ProjectBadges, appConfirm, getHealthStatus, getPhaseClass, sendChannelMessage, appAlert, getDefaultTeamForPhase, logAudit, getInitials, apiFetch, hasPermission } from '../utils/core.js';
import { FocusModal } from './FocusModal.js';
import { getPhases, getPhasesObj, getTeams, getTeamPhases, getAllTeamPhases, getUsers, getUsersObj } from '../utils/configStore.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

export const ProjectsManagementTab = ({ projects, fetchProjects, setEditId }) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const [deleting, setDeleting] = useState(null);

  const handleDelete = async (id, title) => {
    const confirmed = await appConfirm(
      `Permanently delete project "${title}"?\n\nThis will remove all associated tasks, history, and comments. This action cannot be undone.`,
      'Delete Project'
    );
    if (!confirmed) return;
    setDeleting(id);
    try {
      const res = await apiFetch('/api/projects/' + id, { method: 'DELETE' });
      if (res.ok) fetchProjects();
      else await appAlert('Failed to delete project. Check server logs.', 'Delete Failed');
    } catch { await appAlert('Network error. Please try again.', 'Delete Failed'); }
    finally { setDeleting(null); }
  };

  const uniquePhases = [...new Set(projects.map(p => p.phase).filter(Boolean))];
  const uniqueStatuses = ['all', 'new', 'launched', 'production'];

  const filtered = projects.filter(p => {
    const term = search.toLowerCase();
    const matchesSearch = !term || p.id?.toLowerCase().includes(term) || p.title?.toLowerCase().includes(term) || p.team?.toLowerCase().includes(term) || (Array.isArray(p.stakeholders) ? p.stakeholders.join(' ') : p.stakeholders || '').toLowerCase().includes(term);
    const matchesPhase = phaseFilter === 'all' || p.phase === phaseFilter;
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'production' && p.is_deployed)
      || (statusFilter === 'launched' && p.is_launched && !p.is_deployed)
      || (statusFilter === 'new' && !p.is_launched && !p.is_deployed);
    return matchesSearch && matchesPhase && matchesStatus;
  });

  const today = new Date();
  const getDaysRemaining = (targetDate) => {
    if (!targetDate) return null;
    const diff = Math.ceil((new Date(targetDate) - today) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const getStatusBadge = (p) => {
    if (p.is_deployed) return { label: 'Production', color: 'var(--accent-blue)', bg: 'rgba(59,130,246,0.15)' };
    if (p.is_launched) return { label: 'Launched', color: 'var(--accent-green)', bg: 'rgba(16,185,129,0.15)' };
    return { label: 'New', color: 'var(--accent-purple)', bg: 'rgba(139,92,246,0.15)' };
  };

  return html`
    <div>
      <div class="page-header" style="padding-bottom:0;">
        <div>
          <h2 class="page-title" style="display:flex;align-items:center;gap:0.75rem;">
            <i class="fa-solid fa-folder-tree" style="color:var(--accent-blue);font-size:1.3rem;"></i>
            Project Registry
            <span style="font-size:0.75rem;font-weight:600;padding:0.2rem 0.6rem;background:rgba(59,130,246,0.15);color:var(--accent-blue);border-radius:20px;border:1px solid rgba(59,130,246,0.25);">${filtered.length} of ${projects.length}</span>
          </h2>
          <p class="page-subtitle">Full administrative view of all projects. Click a row to edit or use the action buttons.</p>
        </div>
      </div>

      <!-- Search & Filter Bar -->
      <div style="display:flex;gap:0.75rem;margin-bottom:1.5rem;flex-wrap:wrap;align-items:center;padding-top:1rem;">
        <div style="position:relative;flex:1;min-width:200px;">
          <i class="fa-solid fa-magnifying-glass" style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-secondary);font-size:0.8rem;pointer-events:none;"></i>
          <input class="form-input" style="padding-left:2.2rem;width:100%;" placeholder="Search by ID, title, team, stakeholder..." 
            value=${search} onInput=${e => setSearch(e.target.value)} />
        </div>
        <select class="form-select" style="min-width:140px;" value=${phaseFilter} onChange=${e => setPhaseFilter(e.target.value)}>
          <option value="all">All Phases</option>
          ${uniquePhases.map(ph => html`<option value=${ph}>${ph}</option>`)}
        </select>
        <select class="form-select" style="min-width:140px;" value=${statusFilter} onChange=${e => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="new">New</option>
          <option value="launched">Launched</option>
          <option value="production">Production</option>
        </select>
        ${(search || phaseFilter !== 'all' || statusFilter !== 'all') && html`
          <button class="btn" style="white-space:nowrap;" onClick=${() => { setSearch(''); setPhaseFilter('all'); setStatusFilter('all'); }}>
            <i class="fa-solid fa-xmark"></i> Clear
          </button>
        `}
      </div>

      <!-- Project Table -->
      ${filtered.length === 0 ? html`
        <div class="info-block" style="text-align:center;padding:3rem;color:var(--text-secondary);">
          <i class="fa-solid fa-folder-open" style="font-size:2.5rem;opacity:0.3;display:block;margin-bottom:1rem;"></i>
          <div style="font-size:1rem;font-weight:600;margin-bottom:0.4rem;">${search || phaseFilter !== 'all' || statusFilter !== 'all' ? 'No projects match your filters' : 'No projects yet'}</div>
          <div style="font-size:0.82rem;">
            ${search || phaseFilter !== 'all' || statusFilter !== 'all' ? 'Try adjusting your search or clearing the filters.' : 'Create a new project using the "New Project" tab.'}
          </div>
        </div>
      ` : html`
        <div class="info-block" style="padding:0;overflow:hidden;">
          <table class="data-grid-table" style="table-layout:fixed;">
            <thead>
              <tr>
                <th style="width:220px;padding:0.85rem 1rem;">Project</th>
                <th style="width:170px;">Phase</th>
                <th style="width:140px;">Team</th>
                <th style="width:130px;">Status</th>
                <th style="width:160px;">Progress</th>
                <th style="width:150px;">Timeline</th>
                <th style="width:170px;text-align:right;padding-right:1.25rem;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map(p => {
                const status = getStatusBadge(p);
                const daysLeft = getDaysRemaining(p.target_date);
                const progress = p.computed_progress || 0;
                const isOverdue = daysLeft !== null && daysLeft < 0 && progress < 100;
                const stakeholderList = Array.isArray(p.stakeholders) ? p.stakeholders
                  : (p.stakeholders && p.stakeholders !== '[]' ? [p.stakeholders] : []);

                return html`
                  <tr style="transition:background 0.15s;cursor:pointer;" onMouseEnter=${e => e.currentTarget.style.background='var(--bg-panel)'} onMouseLeave=${e => e.currentTarget.style.background=''}>
                    <td style="padding:0.9rem 1rem;">
                      <div style="display:flex;align-items:flex-start;gap:0.6rem;">
                        <div style="flex-shrink:0;width:36px;height:36px;border-radius:8px;background:linear-gradient(135deg,var(--accent-blue)22,var(--accent-purple)22);border:1px solid rgba(99,102,241,0.2);display:flex;align-items:center;justify-content:center;">
                          <i class="fa-solid fa-folder" style="color:var(--accent-blue);font-size:0.8rem;"></i>
                        </div>
                        <div style="min-width:0;">
                          <div style="font-weight:700;font-size:0.85rem;color:var(--text-primary);font-family:'Courier New',monospace;">${p.id}</div>
                          <div style="font-size:0.82rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px;" title=${p.title}>${p.title}</div>
                          ${stakeholderList.length > 0 && html`
                            <div style="font-size:0.68rem;color:var(--accent-orange);margin-top:0.2rem;display:flex;align-items:center;gap:0.3rem;">
                              <i class="fa-solid fa-user-tie"></i>
                              <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:140px;">${stakeholderList.join(', ')}</span>
                            </div>
                          `}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span class="tag ${getPhaseClass(p.phase)}" style="font-size:0.72rem;">${p.phase}</span>
                    </td>
                    <td>
                      <div style="display:flex;align-items:center;gap:0.4rem;">
                        <div style="width:6px;height:6px;border-radius:50%;background:var(--accent-blue);flex-shrink:0;"></div>
                        <span style="font-size:0.82rem;color:var(--text-secondary);">${p.team || '—'}</span>
                      </div>
                    </td>
                    <td>
                      <span style="display:inline-flex;align-items:center;gap:0.35rem;padding:0.2rem 0.6rem;border-radius:20px;font-size:0.72rem;font-weight:600;background:${status.bg};color:${status.color};">
                        <span style="width:5px;height:5px;border-radius:50%;background:currentColor;flex-shrink:0;"></span>
                        ${status.label}
                      </span>
                    </td>
                    <td>
                      <div style="display:flex;align-items:center;gap:0.6rem;">
                        <div style="flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;">
                          <div style="height:100%;width:${progress}%;background:${progress >= 100 ? 'var(--accent-green)' : progress >= 60 ? 'var(--accent-blue)' : 'var(--accent-orange)'};border-radius:3px;transition:width 0.4s;"></div>
                        </div>
                        <span style="font-size:0.78rem;font-weight:600;color:${progress >= 100 ? 'var(--accent-green)' : 'var(--text-secondary)'}; min-width:32px;text-align:right;">${progress}%</span>
                      </div>
                    </td>
                    <td>
                      <div style="font-size:0.75rem;">
                        ${p.start_date ? html`
                          <div style="color:var(--text-secondary);margin-bottom:0.2rem;">${p.start_date} →</div>
                          <div style="font-weight:600;color:${isOverdue ? 'var(--accent-pink)' : daysLeft !== null && daysLeft <= 7 ? 'var(--accent-orange)' : 'var(--text-secondary)'};">
                            ${isOverdue ? html`<i class="fa-solid fa-triangle-exclamation" style="margin-right:0.2rem;"></i>${Math.abs(daysLeft)}d overdue`
                              : daysLeft === 0 ? html`<i class="fa-solid fa-clock" style="margin-right:0.2rem;color:var(--accent-orange);"></i>Due today`
                              : daysLeft !== null ? html`${daysLeft}d left`
                              : p.target_date}
                          </div>
                        ` : html`<span style="color:var(--text-secondary);opacity:0.5;">—</span>`}
                      </div>
                    </td>
                    <td style="text-align:right;padding-right:1.25rem;">
                      <div style="display:flex;align-items:center;justify-content:flex-end;gap:0.4rem;">
                        <button class="btn" style="padding:0.3rem 0.65rem;font-size:0.78rem;color:var(--accent-blue);"
                          onClick=${(e) => { e.stopPropagation(); window.openProjectDocument ? window.openProjectDocument(p.id) : alert("Document view not initialized"); }}
                          title="View Project Document">
                          <i class="fa-solid fa-file-invoice"></i> Document
                        </button>
                        <button class="btn" style="padding:0.3rem 0.65rem;font-size:0.78rem;color:var(--text-primary);border-color:var(--border-color);" 
                          onClick=${(e) => { e.stopPropagation(); setEditId(p.id); }}
                          aria-label="Edit project ${p.id}">
                          <i class="fa-solid fa-pen"></i> Edit
                        </button>
                        <button class="btn" style="padding:0.3rem 0.65rem;font-size:0.78rem;color:var(--accent-pink);border-color:rgba(236,72,153,0.2);" 
                          onClick=${(e) => { e.stopPropagation(); handleDelete(p.id, p.title); }}
                          disabled=${deleting === p.id}
                          aria-label="Delete project ${p.id}">
                          ${deleting === p.id ? html`<i class="fa-solid fa-spinner fa-spin"></i>` : html`<i class="fa-solid fa-trash"></i>`}
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
};




export const CreateProjectTab = ({ onSave, currentUser }) => {
  const phases = getPhases() || [];
  const phasesObj = getPhasesObj() || [];
  const firstPhase = phases[0] || '';
  const terminalPhase = phasesObj.find(p => p.is_terminal)?.name || phases[phases.length - 1] || '';

  const [wizardStep, setWizardStep] = useState(1);
  const [isHistorical, setIsHistorical] = useState(false);
  const [form, setForm] = useState({
    id: '', title: '', description: '', stakeholder: '', project_lead: '',
    start_date: '', target_date: '', actual_end_date: '', launch_note: '', blockers: '', nextStep: ''
  });
  const [phaseNotes, setPhaseNotes] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const validateStep = (step) => {
    const errors = {};
    if (step === 1) {
      if (!form.id.trim()) {
        errors.id = 'Project ID is required.';
      } else if (!/^BI-\d+$/i.test(form.id.trim())) {
        errors.id = 'Project ID must match format BI-NNN (e.g. BI-042).';
      }
      if (!form.title.trim()) {
        errors.title = 'Project Title is required.';
      }
    } else if (step === 2) {
      if (!form.start_date) {
        errors.start_date = 'Start Date is required.';
      }
      if (!form.target_date) {
        errors.target_date = 'Target End Date is required.';
      }
      if (form.start_date && form.target_date && new Date(form.start_date) > new Date(form.target_date)) {
        errors.target_date = 'Target End Date must be after Start Date.';
      }
      if (isHistorical) {
        if (!form.actual_end_date) {
          errors.actual_end_date = 'Actual End Date is required for historical projects.';
        }
        if (form.start_date && form.actual_end_date && new Date(form.start_date) > new Date(form.actual_end_date)) {
          errors.actual_end_date = 'Actual End Date must be after Start Date.';
        }
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(wizardStep)) {
      setWizardStep(prev => Math.min(prev + 1, 3));
    }
  };

  const handleBack = () => {
    setWizardStep(prev => Math.max(prev - 1, 1));
  };

  const submit = async (e) => {
    if (e) e.preventDefault();
    if (!validateStep(1) || !validateStep(2)) return;
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        id: form.id.trim(),
        title: form.title.trim(),
        description: (form.description || '').trim(),
        phase: isHistorical ? terminalPhase : firstPhase,
        is_launched: isHistorical,
        is_deployed: isHistorical ? 1 : 0,
        start_date: form.start_date,
        target_date: form.target_date,
        actual_end_date: isHistorical ? form.actual_end_date : '',
        launch_note: isHistorical ? (form.launch_note || '').trim() : '',
        stakeholders: (form.stakeholder || '').trim() ? [form.stakeholder.trim()] : [],
        project_lead: form.project_lead || '',
        blockers: (form.blockers || '').split(',').map(s => s.trim()).filter(Boolean),
        phase_notes: isHistorical ? phaseNotes : {},
        nextStep: isHistorical ? '' : (form.nextStep || '').trim()
      };
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.detail || err.error || 'Failed to create project');
        return;
      }
      onSave();
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const stepLabels = [
    { number: 1, label: "Project Identity" },
    { number: 2, label: isHistorical ? "Timeline & Registration" : "Timeline & Type" },
    { number: 3, label: isHistorical ? "Phase Notes & Lessons" : "Phase Roadmap" }
  ];

  return html`
    <div class="wizard-container">
      <div class="wizard-header">
        <h2 style="font-size:1.4rem;font-weight:700;margin-bottom:1.5rem;color:var(--text-primary);display:flex;align-items:center;gap:0.5rem;">
          <i class="fa-solid fa-square-plus" style="color:var(--accent-blue);"></i>
          Initialize New Project
        </h2>
        
        <div class="wizard-steps">
          <div class="wizard-progress-bar" style="width: ${((wizardStep - 1) / 2) * 66.6}%"></div>
          ${stepLabels.map(s => html`
            <div class="wizard-step-node ${wizardStep === s.number ? 'active' : ''} ${wizardStep > s.number ? 'completed' : ''}" key=${s.number}>
              <div class="wizard-step-circle">
                ${wizardStep > s.number ? html`<i class="fa-solid fa-check"></i>` : s.number}
              </div>
              <div class="wizard-step-label">${s.label}</div>
            </div>
          `)}
        </div>
      </div>

      <div class="wizard-body">
        ${error && html`
          <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171;padding:0.75rem 1rem;border-radius:var(--radius-md);margin-bottom:1.5rem;font-size:0.88rem;display:flex;align-items:center;gap:0.5rem;">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>${error}</span>
          </div>
        `}

        ${wizardStep === 1 && html`
          <div class="wizard-slide-container">
            <div>
              <label style="font-weight:600;display:block;margin-bottom:0.4rem;color:var(--text-primary);">Project ID *</label>
              <input class="form-input ${fieldErrors.id ? 'error' : ''}" style="width:100%;" placeholder="e.g. BI-042" value=${form.id} onInput=${e => { setForm({...form, id: e.target.value}); if (fieldErrors.id) setFieldErrors({...fieldErrors, id: null}); }} />
              ${fieldErrors.id ? html`<span class="field-error"><i class="fa-solid fa-circle-exclamation"></i> ${fieldErrors.id}</span>` : html`<span style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-top:0.25rem;">Must be unique and match the pattern <strong>BI-NNN</strong> (e.g. BI-001)</span>`}
            </div>

            <div>
              <label style="font-weight:600;display:block;margin-bottom:0.4rem;color:var(--text-primary);">Project Title *</label>
              <input class="form-input ${fieldErrors.title ? 'error' : ''}" style="width:100%;" placeholder="e.g. Q3 Sales Forecasting Dashboard" value=${form.title} onInput=${e => { setForm({...form, title: e.target.value}); if (fieldErrors.title) setFieldErrors({...fieldErrors, title: null}); }} />
              ${fieldErrors.title && html`<span class="field-error"><i class="fa-solid fa-circle-exclamation"></i> ${fieldErrors.title}</span>`}
            </div>

            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
                <label style="font-weight:600;color:var(--text-primary);">Description</label>
                <span style="font-size:0.75rem;color:${(form.description || '').length > 450 ? 'var(--accent-pink)' : 'var(--text-secondary)'};">${(form.description || '').length} / 500</span>
              </div>
              <textarea class="form-input" style="width:100%;min-height:100px;resize:vertical;" placeholder="Describe the business problem, goals, and target objectives..." maxlength="500" value=${form.description} onInput=${e => setForm({...form, description: e.target.value})}></textarea>
            </div>

            <div>
              <label style="font-weight:600;display:block;margin-bottom:0.4rem;color:var(--text-primary);">Stakeholder / Beneficiary</label>
              <input class="form-input" style="width:100%;" placeholder="e.g. Finance Division, Executive Team, Marketing Dept." value=${form.stakeholder} onInput=${e => setForm({...form, stakeholder: e.target.value})} />
            </div>

            ${hasPermission(currentUser, 'admin.panel') && html`
              <div>
                <label style="font-weight:600;display:block;margin-bottom:0.4rem;color:var(--text-primary);">Project Lead</label>
                <select class="form-select" style="width:100%;" value=${form.project_lead || ''} onChange=${e => setForm({...form, project_lead: e.target.value})}>
                  <option value="">— No Lead Assigned —</option>
                  ${getUsersObj().map(u => html`<option value=${u.username} key=${u.username}>${u.username}</option>`)}
                </select>
              </div>
            `}
          </div>
        `}

        ${wizardStep === 2 && html`
          <div class="wizard-slide-container">
            <div class="grid-2" style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;">
              <div>
                <label style="font-weight:600;display:block;margin-bottom:0.4rem;color:var(--text-primary);">Start Date *</label>
                <input type="date" class="form-input ${fieldErrors.start_date ? 'error' : ''}" style="width:100%;" value=${form.start_date} onInput=${e => { setForm({...form, start_date: e.target.value}); if (fieldErrors.start_date) setFieldErrors({...fieldErrors, start_date: null}); }} />
                ${fieldErrors.start_date && html`<span class="field-error"><i class="fa-solid fa-circle-exclamation"></i> ${fieldErrors.start_date}</span>`}
              </div>
              <div>
                <label style="font-weight:600;display:block;margin-bottom:0.4rem;color:var(--text-primary);">Target End Date *</label>
                <input type="date" class="form-input ${fieldErrors.target_date ? 'error' : ''}" style="width:100%;" value=${form.target_date} onInput=${e => { setForm({...form, target_date: e.target.value}); if (fieldErrors.target_date) setFieldErrors({...fieldErrors, target_date: null}); }} />
                ${fieldErrors.target_date && html`<span class="field-error"><i class="fa-solid fa-circle-exclamation"></i> ${fieldErrors.target_date}</span>`}
              </div>
            </div>

            <div class="wizard-historical-toggle">
              <div style="display:flex;align-items:flex-start;gap:1rem;">
                <input type="checkbox" id="historical_mode" checked=${isHistorical} onChange=${e => { setIsHistorical(e.target.checked); setFieldErrors({}); }} style="transform:scale(1.3);margin-top:0.3rem;accent-color:var(--accent-purple);cursor:pointer;" />
                <div>
                  <label for="historical_mode" style="font-weight:700;cursor:pointer;color:var(--accent-purple);font-size:1rem;display:block;margin-bottom:0.25rem;">Register as Historical / Already in Production</label>
                  <span style="font-size:0.85rem;color:var(--text-secondary);display:block;line-height:1.4;">
                    Check this if the project is already completed, launched, or in production. All phases will be recorded as completed and the project will land directly in the terminal phase.
                  </span>
                </div>
              </div>
            </div>

            ${isHistorical && html`
              <div style="background:rgba(16,185,129,0.03);border:1px dashed rgba(16,185,129,0.2);border-radius:var(--radius-md);padding:1.25rem;display:flex;flex-direction:column;gap:1.25rem;">
                <div>
                  <label style="font-weight:600;display:block;margin-bottom:0.4rem;color:var(--text-primary);">Actual End Date *</label>
                  <input type="date" class="form-input ${fieldErrors.actual_end_date ? 'error' : ''}" style="width:100%;" value=${form.actual_end_date || ''} onInput=${e => { setForm({...form, actual_end_date: e.target.value}); if (fieldErrors.actual_end_date) setFieldErrors({...fieldErrors, actual_end_date: null}); }} />
                  ${fieldErrors.actual_end_date && html`<span class="field-error"><i class="fa-solid fa-circle-exclamation"></i> ${fieldErrors.actual_end_date}</span>`}
                </div>
              </div>
            `}

            <div>
              <label style="font-weight:600;display:block;margin-bottom:0.4rem;color:var(--text-primary);">Blockers <span style="font-weight:normal;font-size:0.8rem;color:var(--text-secondary);">(comma-separated list, optional)</span></label>
              <input class="form-input" style="width:100%;" placeholder="e.g. Missing api access, Awaiting data team review" value=${form.blockers} onInput=${e => setForm({...form, blockers: e.target.value})} />
            </div>
          </div>
        `}

        ${wizardStep === 3 && !isHistorical && html`
          <div class="wizard-slide-container">
            <div style="background:rgba(59,130,246,0.05);border:1px solid rgba(59,130,246,0.15);border-radius:var(--radius-md);padding:1.25rem;display:flex;align-items:center;gap:1rem;">
              <i class="fa-solid fa-circle-info" style="font-size:1.5rem;color:var(--accent-blue);"></i>
              <div>
                <div style="font-weight:700;color:var(--text-primary);margin-bottom:0.2rem;">Starting Phase Locked: <span style="color:var(--accent-blue);">${firstPhase}</span></div>
                <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.4;">
                  All newly initialized active projects start in the first configured phase (<strong>${firstPhase}</strong>). The lifecycle path is defined dynamically by the system administrators.
                </div>
              </div>
            </div>

            <div>
              <h3 style="font-size:0.95rem;font-weight:700;margin-bottom:0.75rem;color:var(--text-primary);">Configured Phase Lifecycle</h3>
              <div class="wizard-timeline">
                ${phases.map((ph, idx) => {
                  const isCurrent = idx === 0;
                  const phaseObj = phasesObj.find(p => p.name === ph);
                  const isTerm = phaseObj ? phaseObj.is_terminal : false;
                  return html`
                    <div class="wizard-timeline-item ${isCurrent ? 'active' : ''}" key=${ph}>
                      <div class="wizard-timeline-dot"></div>
                      <div class="wizard-timeline-content">
                        <span style="font-weight:600;font-size:0.88rem;color:${isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)'};">
                          ${ph}
                        </span>
                        <div style="display:flex;align-items:center;gap:0.5rem;">
                          ${isCurrent && html`<span class="badge" style="background:var(--accent-blue);color:#ffffff;font-size:0.7rem;">Active Start</span>`}
                          ${isTerm && html`<span class="badge" style="background:var(--accent-green);color:#ffffff;font-size:0.7rem;">🏁 Live / Terminal</span>`}
                        </div>
                      </div>
                    </div>
                  `;
                })}
              </div>
            </div>

            <div style="margin-top:0.5rem;">
              <label style="font-weight:600;display:block;margin-bottom:0.4rem;color:var(--text-primary);">Next Step Note <span style="font-weight:normal;font-size:0.8rem;color:var(--text-secondary);">(optional starting guidance)</span></label>
              <textarea class="form-input" style="width:100%;min-height:80px;resize:vertical;" placeholder="Identify the immediate next step or action items for the team..." value=${form.nextStep || ''} onInput=${e => setForm({...form, nextStep: e.target.value})}></textarea>
            </div>
          </div>
        `}

        ${wizardStep === 3 && isHistorical && html`
          <div class="wizard-slide-container">
            <div style="background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);border-radius:var(--radius-md);padding:1.25rem;display:flex;align-items:center;gap:1rem;margin-bottom:1rem;">
              <i class="fa-solid fa-circle-check" style="font-size:1.5rem;color:var(--accent-green);"></i>
              <div>
                <div style="font-weight:700;color:var(--text-primary);margin-bottom:0.2rem;">All Phases Pre-Completed</div>
                <div style="font-size:0.82rem;color:var(--text-secondary);line-height:1.4;">
                  This project is registered as historical. Provide comments, findings, or document links for each phase below to preserve institutional memory.
                </div>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:1rem;max-height:380px;overflow-y:auto;padding-right:0.5rem;">
              ${phases.map((ph, idx) => {
                const phaseObj = phasesObj.find(p => p.name === ph);
                const colorClass = phaseObj ? phaseObj.color_class : 'color-bu';
                return html`
                  <div class="wizard-phase-card" key=${ph}>
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <span class="badge ${colorClass}" style="font-size:0.8rem;font-weight:700;padding:0.3rem 0.60rem;">${ph}</span>
                      <span style="font-size:0.78rem;font-weight:700;color:var(--accent-green);display:flex;align-items:center;gap:0.25rem;">
                        <i class="fa-solid fa-circle-check"></i> Completed
                      </span>
                    </div>
                    <textarea class="form-input" style="font-size:0.82rem;min-height:60px;resize:vertical;" placeholder=${`Record findings, lessons learned, or links to artifacts for the ${ph} phase...`} value=${phaseNotes[ph] || ''} onInput=${e => setPhaseNotes({...phaseNotes, [ph]: e.target.value})}></textarea>
                  </div>
                `;
              })}
            </div>

            <div style="margin-top:0.75rem;">
              <label style="font-weight:600;display:block;margin-bottom:0.4rem;color:var(--text-primary);">Overall Launch Note / Summary</label>
              <textarea class="form-input" style="width:100%;min-height:80px;resize:vertical;" placeholder="Summary of outcomes, production URL, metrics achieved, and general launch remarks..." value=${form.launch_note || ''} onInput=${e => setForm({...form, launch_note: e.target.value})}></textarea>
            </div>
          </div>
        `}
      </div>

      <div class="wizard-footer">
        <div>
          ${wizardStep > 1 && html`
            <button type="button" class="btn" style="padding:0.5rem 1.25rem;" onClick=${handleBack} disabled=${isSaving}>
              <i class="fa-solid fa-chevron-left" style="margin-right:0.4rem;"></i> Back
            </button>
          `}
        </div>
        <div style="display:flex;gap:0.75rem;align-items:center;">
          <button type="button" class="btn" style="padding:0.5rem 1.25rem;" onClick=${onSave} disabled=${isSaving}>Cancel</button>
          
          ${wizardStep < 3 ? html`
            <button type="button" class="btn active" style="background:var(--accent-blue);padding:0.5rem 1.25rem;" onClick=${handleNext}>
              Next <i class="fa-solid fa-chevron-right" style="margin-left:0.4rem;"></i>
            </button>
          ` : html`
            <button type="button" class="btn active" style="background:var(--accent-green);padding:0.5rem 1.25rem;" onClick=${submit} disabled=${isSaving}>
              ${isSaving ? html`<i class="fa-solid fa-spinner fa-spin"></i> Initializing...` : html`<i class="fa-solid fa-rocket" style="margin-right:0.4rem;"></i> Initialize Project`}
            </button>
          `}
        </div>
      </div>
    </div>
  `;
};




export const ProjectCard = ({ project, viewMode, onClick }) => {
  const isPhaseView = viewMode === 'phase';
  const tagClass = isPhaseView ? (project.team ? getTeamClass(project.team) : 'color-slate') : getPhaseClass(project.phase);
  const tagLabel = isPhaseView ? (project.team || 'Unassigned') : project.phase;
  return html`
    <div class="project-card" onClick=${() => onClick(project)}>
      <div class="card-header">
        <div style="display:flex;align-items:center;gap:0.4rem;">
          <span class="card-id">${project.id}</span>
        </div>
        ${project.blockers && project.blockers.length > 0 && html`<i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-orange);font-size:0.8rem;"></i>`}
      </div>
      <h3 class="card-title" style="margin-bottom:0.25rem;">${project.title}</h3>
      <${ProjectBadges} project=${project} />
      <div class="card-tags" style="margin-top:0.75rem;"><span class="tag ${tagClass} ${isPhaseView ? 'tag-solid' : ''}">${tagLabel}</span></div>
      <div class="card-footer">
        <div class="assignee">
          <div class="avatar">${getInitials(project.assignee || '?')}</div>
          <span>${project.assignee}</span>
        </div>
        <span>${project.computed_progress || 0}%</span>
      </div>
      <div class="progress-container" style="background:rgba(255,255,255,0.05);height:4px;">
        <div class="progress-bar" style="width:${project.computed_progress || 0}%"></div>
      </div>
    </div>
  `;
};



// Guard wrapper so hooks are ALWAYS called (fixes Rules of Hooks violation)
export const ProjectModal = ({ project, currentUser, tasks, onClose, onUpdate }) => {
  if (!project) return null;
  return html`<${ProjectModalInner} project=${project} currentUser=${currentUser} tasks=${tasks} onClose=${onClose} onUpdate=${onUpdate} />`;
};

export const ProjectDetailCore = ({ project, currentUser, tasks, onClose, onUpdate, isModal }) => {
  const isAdmin = hasPermission(currentUser, 'admin.panel');
  const isLeader = hasPermission(currentUser, 'task.approve');
  const isOwner = currentUser.team === project.team;
  const canEdit = hasPermission(currentUser, 'project.update');
  const canDelete = hasPermission(currentUser, 'project.delete');

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [streams, setStreams] = useState([]);
  const [editForm, setEditForm] = useState({ ...project, project_lead: project.project_lead || '', actual_end_date: project.actual_end_date || '', launch_note: project.launch_note || '' });
  const [newComment, setNewComment] = useState('');

  const fetchStreams = async () => {
    const res = await apiFetch(`/api/projects/${project.id}/streams`);
    if (res.ok) setStreams(await res.json());
  };

  useEffect(() => {
    setEditForm({ ...project, project_lead: project.project_lead || '', actual_end_date: project.actual_end_date || '', launch_note: project.launch_note || '' });
    setIsEditing(false);
    setNewComment('');
    fetchStreams();
  }, [project.id]);

  const handleDelete = async () => {
    const confirmed = await appConfirm(
      `Permanently delete project "${project.title}"?\n\nThis will remove all associated tasks, history, and comments. This action cannot be undone.`,
      '⚠️ Delete Project'
    );
    if (!confirmed) return;
    setIsSaving(true);
    try {
      const res = await apiFetch('/api/projects/' + project.id, { method: 'DELETE' });
      if (res.ok) {
        logAudit(currentUser, 'PROJECT_DELETED', `Deleted project: ${project.title}`);
        if (onUpdate) onUpdate();
        if (onClose) onClose();
      } else {
        const err = await res.json().catch(() => ({}));
        await appAlert(err.detail || 'Failed to delete project.', 'Delete Failed');
      }
    } catch {
      await appAlert('Network error. Please try again.', 'Delete Failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const payload = {
        ...editForm,
        is_deployed: Number(editForm.is_deployed) ? 1 : 0,
        blockers: typeof editForm.blockers === 'string'
          ? editForm.blockers.split(',').map(s => s.trim()).filter(Boolean)
          : editForm.blockers
      };
      const res = await apiFetch('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) { await appAlert('Save failed — check server logs.', 'Save Failed'); return; }
      logAudit(currentUser, 'PROJECT_UPDATED',
        `Updated project ${project.id}. Production: ${payload.is_deployed ? 'YES' : 'NO'}`);
      setEditForm(payload);
      setIsEditing(false);
      setShowSaved(true);
      setTimeout(() => setShowSaved(false), 3000);
      onUpdate();
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = async () => {
    if (isEditing) {
      const hasChanges = JSON.stringify(editForm) !== JSON.stringify(project);
      if (hasChanges) {
        const confirm = await appConfirm('You have unsaved changes. Are you sure you want to close?', 'Discard Changes');
        if (!confirm) return;
      }
    }
    onClose();
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    const newHistory = [...(project.history || []), { date: today, phase: project.phase, status: 'note', note: newComment }];
    await apiFetch('/api/projects', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...project, history: newHistory }) });
    logAudit(currentUser, 'PROJECT_NOTE_ADDED', `Added status note to ${project.id}`);
    setNewComment(''); onUpdate();
  };

  const handleToggleDeploy = () => {
    if (!isAdmin || !isEditing) return;
    setEditForm(prev => ({
      ...prev,
      is_deployed: Boolean(Number(prev.is_deployed)) ? 0 : 1
    }));
  };

  const handleToggleLaunched = () => {
    if (!isAdmin || !isEditing) return;
    setEditForm(prev => ({
      ...prev,
      is_launched: !prev.is_launched
    }));
  };

  const handleChangePhase = async (nextPhase) => {
    if (nextPhase === project.phase) return;
    const today = new Date().toISOString().split('T')[0];
    const previousIdx = getPhases().indexOf(project.phase);
    const nextIdx = getPhases().indexOf(nextPhase);
    
    const isBackward = nextIdx < previousIdx;
    let note = isBackward ? `Iterated back from ${project.phase} to ${nextPhase}` : `Advanced from ${project.phase} to ${nextPhase}`;

    const newHistory = [...(project.history || []), { date: today, phase: nextPhase, status: 'phase_change', note }];

    const resolvedTeam = getDefaultTeamForPhase(nextPhase);
    const autoDeployed = nextPhase === 'Deployed and in Use' ? 1 : project.is_deployed;
    
    let is_iterating = project.is_iterating;
    let iteration = project.iteration || 1;
    if (project.phase === 'Deployed and in Use' && isBackward) {
        is_iterating = 1;
        iteration += 1;
        note = `⚠ Production Iteration started — re-entering CRISP-DM cycle at ${nextPhase}. Iteration ${iteration}.`;
        newHistory[newHistory.length - 1].note = note;
    }

    await apiFetch('/api/projects', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...project,
        phase: nextPhase,
        team: resolvedTeam,
        progress: 0,
        is_deployed: autoDeployed,
        is_iterating,
        iteration,
        history: newHistory
      })
    });
    logAudit(currentUser, 'PROJECT_PHASE_CHANGED', note);
    onUpdate(); onClose();
  };

  const blockersStr = Array.isArray(editForm.blockers) ? editForm.blockers.join(', ') : (editForm.blockers || '');
  const isLive = Boolean(Number(project.is_deployed));
  const isIterating = Boolean(Number(project.is_iterating));
  const iterationNum = project.iteration || 1;

  const coreBody = html`
    <div style="display:grid; grid-template-columns: 1.5fr 1fr; gap:2.5rem; width:100%;">
      <div>
        <div class="info-block" style="background:transparent;padding:0;border:none;margin-bottom:1.5rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem;">
            <div class="section-title" style="margin:0;"><i class="fa-solid fa-align-left"></i> Description</div>
            ${isEditing && html`<span style="font-size:0.7rem;color:${(editForm.description || '').length > 1800 ? 'var(--accent-pink)' : 'var(--text-secondary)'};">${(editForm.description || '').length} / 2000</span>`}
          </div>
          ${isEditing
            ? html`<textarea class="form-input" style="min-height:140px;width:100%;line-height:1.6;" maxlength="2000" value=${editForm.description} onInput=${e => setEditForm({...editForm, description: e.target.value})}></textarea>`
            : html`<p style="font-size:0.92rem;line-height:1.65;color:var(--text-secondary);white-space:pre-wrap;margin:0;">${project.description || 'No description provided.'}</p>`
          }
        </div>

        <div class="info-block" style="background:transparent;padding:0;border:none;margin-bottom:1.5rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem;">
            <div class="section-title" style="margin:0;"><i class="fa-solid fa-list-check"></i> Project Tasks</div>
            <button class="btn" style="padding:0.25rem 0.6rem;font-size:0.75rem;" onClick=${() => window.navigateToTab('my_tasks')}>
              <i class="fa-solid fa-arrows-spin"></i> Manage Tasks
            </button>
          </div>
          <div style="display:flex;flex-direction:column;gap:0.5rem;max-height:300px;overflow-y:auto;padding-right:0.25rem;">
            ${tasks.filter(t => t.project_id === project.id).length === 0 ? html`
              <div style="font-size:0.85rem;color:var(--text-secondary);padding:1rem;background:rgba(255,255,255,0.02);border-radius:var(--radius-md);border:1px dashed var(--border-color);text-align:center;">
                No tasks assigned to this project yet.
              </div>
            ` : tasks.filter(t => t.project_id === project.id).map(t => html`
              <div class="task-row-mini" style="display:flex;align-items:center;justify-content:space-between;padding:0.6rem 0.8rem;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:var(--radius-sm);gap:1rem;">
                <div style="min-width:0;flex:1;">
                  <div style="font-size:0.82rem;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.title}</div>
                  <div style="display:flex;align-items:center;gap:0.4rem;font-size:0.7rem;color:var(--text-secondary);margin-top:0.2rem;">
                    <span class="tag ${getPhaseClass(t.crisp_dm_phase)}" style="font-size:0.62rem;padding:0.05rem 0.25rem;">${t.crisp_dm_phase}</span>
                    <span>•</span>
                    <span>${t.assignee || 'Unassigned'}</span>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem;flex-shrink:0;">
                  <span class="tag" style=${`font-size:0.65rem;text-transform:uppercase;${t.status === 'completed' ? 'background:rgba(16,185,129,0.1);color:var(--accent-green);' : t.status === 'in_progress' ? 'background:rgba(59,130,246,0.1);color:var(--accent-blue);' : 'background:rgba(255,255,255,0.05);color:var(--text-secondary);'}`}>
                    ${t.status.replace('_', ' ')}
                  </span>
                </div>
              </div>
            `)}
          </div>
        </div>

        <div class="info-block" style="background:transparent;padding:0;border:none;margin-bottom:1.5rem;">
          <div class="section-title"><i class="fa-solid fa-clock-rotate-left"></i> History & Comments</div>
          <div class="history-list" style="max-height:260px;overflow-y:auto;padding-right:0.25rem;">
            ${(project.history || []).length === 0 ? html`
              <div style="font-size:0.85rem;color:var(--text-secondary);text-align:center;padding:1rem;">No history entries found.</div>
            ` : (project.history || []).map((h, i) => html`
              <div key=${i} class="history-item" style="border-left:2px solid var(--accent-blue);padding-left:1rem;margin-bottom:1.25rem;position:relative;">
                <div style="position:absolute;left:-5px;top:0;width:8px;height:8px;border-radius:50%;background:var(--accent-blue);"></div>
                <div style="display:flex;justify-content:space-between;font-size:0.72rem;color:var(--text-secondary);margin-bottom:0.2rem;">
                  <span>${h.date}</span>
                  <span style="font-family:monospace;background:rgba(255,255,255,0.05);padding:0.1rem 0.3rem;border-radius:3px;">${h.phase}</span>
                </div>
                <div style="font-size:0.82rem;line-height:1.4;color:var(--text-primary);">${h.note}</div>
                ${h.actor && html`<div style="font-size:0.68rem;color:var(--text-secondary);margin-top:0.15rem;">by ${h.actor}</div>`}
              </div>
            `)}
          </div>

          <div style="margin-top:1.5rem;display:flex;gap:0.5rem;background:rgba(255,255,255,0.02);padding:0.75rem;border:1px solid var(--border-color);border-radius:var(--radius-md);">
            <input class="form-input" style="flex:1;font-size:0.85rem;" placeholder="Add status comment or milestone note..." value=${newComment} onInput=${e => setNewComment(e.target.value)} onKeyDown=${e => e.key === 'Enter' && handleAddComment()} />
            <button class="btn active" style="background:var(--accent-blue);padding:0.4rem 1rem;font-size:0.85rem;" onClick=${handleAddComment} disabled=${!newComment.trim()}><i class="fa-solid fa-paper-plane"></i></button>
          </div>
        </div>
      </div>

      <div>
        <div class="info-block" style="padding:1.5rem;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:var(--radius-md);margin-bottom:1.5rem;">
          <div class="section-title" style="margin-bottom:0.75rem;"><i class="fa-solid fa-address-card"></i> Metadata & Controls</div>
          <div style="display:flex;flex-direction:column;gap:0.75rem;">
            ${isEditing && isAdmin && html`
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-server" style="width:16px;"></i> CI/CD Pipeline</span>
                <button class="btn" style=${`padding:0.25rem 0.6rem;font-size:0.75rem;${isLive ? 'background:rgba(59,130,246,0.2);color:var(--accent-blue);border-color:var(--accent-blue);' : ''}`} onClick=${handleToggleDeploy}>
                  ${isLive ? html`<i class="fa-solid fa-check-circle"></i> Production` : html`<i class="fa-solid fa-circle"></i> Enable`}
                </button>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-rocket" style="width:16px;"></i> Launched Flag</span>
                <button class="btn" style=${`padding:0.25rem 0.6rem;font-size:0.75rem;${editForm.is_launched ? 'background:rgba(16,185,129,0.2);color:var(--accent-green);border-color:var(--accent-green);' : ''}`} onClick=${handleToggleLaunched}>
                  ${editForm.is_launched ? html`<i class="fa-solid fa-check-circle"></i> Launched` : html`<i class="fa-solid fa-circle"></i> Set Launched`}
                </button>
              </div>
              <div style="height:1px;background:rgba(255,255,255,0.05);margin:0.1rem 0;"></div>
            `}
            
            ${isEditing && isAdmin && html`
              <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
                <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-user-shield" style="width:16px;"></i> Project Lead</span>
                <select class="form-select" style="font-size:0.85rem;padding:0.25rem 0.5rem;" value=${editForm.project_lead || ''} onChange=${e => setEditForm({...editForm, project_lead: e.target.value})}>
                  <option value="">— No Lead —</option>
                  ${getUsersObj().map(u => html`<option value=${u.username}>${u.username}</option>`)}
                </select>
              </div>
            `}
            ${!isEditing && html`
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-user-shield" style="width:16px;"></i> Project Lead</span>
                <strong style="font-size:0.9rem;">${project.project_lead || '—'}</strong>
              </div>
            `}
            
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-calendar-days" style="width:16px;"></i> Start Date</span>
              ${isEditing && isAdmin
                ? html`<input type="date" class="form-input" style="font-size:0.85rem;padding:0.25rem 0.5rem;" value=${editForm.start_date || ''} onInput=${e => setEditForm({...editForm, start_date: e.target.value})} />`
                : html`<strong style="font-size:0.9rem;">${project.start_date || 'N/A'}</strong>`
              }
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-flag-checkered" style="width:16px;"></i> Target Date</span>
              ${isEditing && isAdmin
                ? html`<input type="date" class="form-input" style="font-size:0.85rem;padding:0.25rem 0.5rem;" value=${editForm.target_date || ''} onInput=${e => setEditForm({...editForm, target_date: e.target.value})} />`
                : html`<strong style="font-size:0.9rem;">${project.target_date || 'N/A'}</strong>`
              }
            </div>
            
            ${(project.is_launched || editForm.is_launched) && html`
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-calendar-check" style="width:16px;"></i> Actual End</span>
                ${isEditing && isAdmin
                  ? html`<input type="date" class="form-input" style="font-size:0.85rem;padding:0.25rem 0.5rem;" value=${editForm.actual_end_date || ''} onInput=${e => setEditForm({...editForm, actual_end_date: e.target.value})} />`
                  : html`<strong style="font-size:0.9rem;">${project.actual_end_date || 'N/A'}</strong>`
                }
              </div>
            `}
            
            <div style="height:1px;background:rgba(255,255,255,0.05);margin:0.1rem 0;"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-users-gear" style="width:16px;"></i> Team</span>
              ${isEditing && isAdmin
                ? html`<select class="form-select" style="font-size:0.85rem;padding:0.25rem 0.5rem;" value=${editForm.team} onChange=${e => setEditForm({...editForm, team: e.target.value, assignee: ''})}>${getTeams().map(t => html`<option value=${t}>${t}</option>`)}</select>`
                : html`<span class="tag ${project.team ? getTeamClass(project.team) : 'color-slate'} tag-solid">${project.team || 'Unassigned'}</span>`
              }
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-user-tie" style="width:16px;"></i> Assignee</span>
              ${isEditing && canEdit
                ? html`
                  <select class="form-select" style="font-size:0.85rem;padding:0.25rem 0.5rem;" value=${editForm.assignee || ''} onChange=${e => setEditForm({...editForm, assignee: e.target.value})}>
                    <option value="">— Unassigned —</option>
                    ${getUsersObj()
                      .filter(u => u.team === (editForm.team || project.team) && (u.username !== 'admin' || hasPermission(currentUser, 'admin.panel')))
                      .map(u => html`<option value=${u.username}>${u.username}</option>`)}
                  </select>`
                : html`<strong style="font-size:0.9rem;">${project.assignee || '—'}</strong>`
              }
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-star" style="width:16px;color:var(--accent-orange);"></i> Stakeholder</span>
              ${isEditing && canEdit
                ? html`<input class="form-input" style="font-size:0.85rem;padding:0.25rem 0.5rem;" placeholder="Who benefits?" value=${Array.isArray(editForm.stakeholders) ? editForm.stakeholders.join(', ') : (editForm.stakeholders || '')} onInput=${e => setEditForm({...editForm, stakeholders: e.target.value ? [e.target.value] : []})} />`
                : html`<strong style="font-size:0.9rem;color:var(--accent-orange);">${Array.isArray(project.stakeholders) && project.stakeholders.length > 0 ? project.stakeholders.join(', ') : (project.stakeholders && project.stakeholders !== '[]' ? project.stakeholders : '—')}</strong>`
              }
            </div>
            <div style="height:1px;background:rgba(255,255,255,0.05);margin:0.1rem 0;"></div>
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="color:var(--text-secondary);font-size:0.85rem;"><i class="fa-solid fa-chart-line" style="width:16px;"></i> Phase Progress</span>
              ${isEditing && canEdit
                ? html`<div style="display:flex;align-items:center;gap:0.5rem;"><input type="range" min="0" max="100" value=${editForm.progress} onInput=${e => setEditForm({...editForm, progress: parseInt(e.target.value)})} /><span>${editForm.progress}%</span></div>`
                : html`<strong style="font-size:0.9rem;">${project.progress}%</strong>`
              }
            </div>
          </div>
        </div>

        ${!isEditing && canEdit && html`
          <div style="margin-bottom:1.5rem; border:1px solid rgba(139,92,246,0.3); border-radius:var(--radius-md); padding:1.25rem; background:linear-gradient(145deg, rgba(139,92,246,0.05), rgba(0,0,0,0.2));">
            <div style="font-size:0.9rem; font-weight:700; margin-bottom:0.75rem; color:var(--text-primary); display:flex; align-items:center; gap:0.5rem;">
              <i class="fa-solid fa-code-branch" style="color:var(--accent-purple);"></i> Phase Transition
            </div>
            <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.4;">Move the project to the next logical phase in the CRISP-DM lifecycle. This updates the owning team automatically.</p>
            <div style="display:flex; gap:0.75rem;">
              <select class="form-select" style="flex:1;background:rgba(0,0,0,0.3);" id=${isModal ? 'phase_transition_select' : 'phase_transition_select_inline'}>
                ${getPhases().map(p => html`<option value=${p} selected=${p === project.phase}>${p}</option>`)}
              </select>
              <button class="btn active" style="background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple)); padding:0.4rem 1rem;font-weight:600;" 
                onClick=${() => {
                  const sel = document.getElementById(isModal ? 'phase_transition_select' : 'phase_transition_select_inline');
                  if (sel) handleChangePhase(sel.value);
                }}>Move Phase</button>
            </div>
          </div>
        `}

        <div class="info-block" style="padding:1.5rem;background:var(--bg-panel);border:1px solid var(--border-color);border-radius:var(--radius-md);">
          <div class="section-title" style="margin-bottom:0.75rem;"><i class="fa-solid fa-layer-group"></i> Team Workstreams</div>
          <${ProjectStreamsPanel} 
            projectId=${project.id} 
            tasks=${tasks} 
            streams=${streams} 
            currentUser=${currentUser} 
            onUpdate=${fetchStreams}
            isProjectLead=${project.project_lead_id === currentUser.id} />
        </div>
      </div>
    </div>
  `;

  const footerContent = html`
    <div style="display:flex;gap:0.5rem;width:100%;${isModal ? '' : 'margin-top:2rem;padding-top:1.5rem;border-top:1px solid var(--border-color);'}">
      ${isEditing && canDelete && html`
        <button class="btn" style="background:var(--accent-pink);color:#fff;margin-right:auto;" onClick=${handleDelete} disabled=${isSaving}>
          <i class="fa-solid fa-trash-can"></i> Delete Project
        </button>
      `}
      ${!isEditing && canEdit && html`<button class="btn" style="background:var(--bg-panel);border:1px solid var(--border-color);${isEditing && canDelete ? '' : 'margin-left:auto;'}" onClick=${() => setIsEditing(true)}><i class="fa-solid fa-pen"></i> Edit Details</button>`}
      ${isEditing && html`
        <div style=${`display:flex;gap:0.5rem;${isEditing && canDelete ? '' : 'margin-left:auto;'}`}>
          <button class="btn" style="color:var(--text-secondary);" onClick=${() => setIsEditing(false)} disabled=${isSaving}>Discard</button>
          <button class="btn active" style="background:var(--accent-blue);" onClick=${handleSave} disabled=${isSaving}>
            ${isSaving ? html`<i class="fa-solid fa-spinner fa-spin"></i> Saving...` : html`<i class="fa-solid fa-save"></i> Save Changes`}
          </button>
        </div>
      `}
    </div>
  `;

  if (isModal) {
    return html`
      <${FocusModal}
        open=${true}
        onClose=${handleClose}
        title=${isEditing ? 'Edit Project' : 'Project Details'}
        subtitle=${project.id + ' — ' + (project.title || '')}
        icon="fa-folder-tree"
        accentColor="var(--accent-blue)"
        footer=${footerContent}
        maxWidth="1100px"
      >
        ${showSaved && html`<div class="focus-success"><i class="fa-solid fa-check-circle" style="margin-right:0.5rem;"></i> Changes saved successfully!</div>`}
        
        <div style="margin-bottom:1.5rem;padding-bottom:1.5rem;border-bottom:1px solid var(--border-color);display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;">
          <div style="flex:1;min-width:0;">
            ${isEditing 
              ? html`<input class="form-input" style="font-size:1.4rem;font-weight:800;width:100%;margin-bottom:0.6rem;" value=${editForm.title} onInput=${e => setEditForm({...editForm, title: e.target.value})} />`
              : html`<h2 style="font-size:1.7rem;font-weight:800;color:var(--text-primary);margin:0 0 0.6rem;line-height:1.2;">${project.title}</h2>`
            }
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              <span class="card-id" style="font-size:0.82rem;padding:0.2rem 0.5rem;background:rgba(59,130,246,0.12);border-radius:4px;color:var(--accent-blue);font-family:monospace;">${project.id}</span>
              <span class="tag ${getPhaseClass(project.phase)}" style="font-size:0.72rem;">${project.phase}</span>
              ${isIterating && html`<span class="tag color-ds" style="font-size:0.65rem;">ITERATION v${iterationNum}</span>`}
            </div>
          </div>
        </div>

        ${coreBody}
      </${FocusModal}>
    `;
  } else {
    return html`
      <div class="project-detail-inline" style="background:var(--bg-panel); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1.5rem; position:relative;">
        ${showSaved && html`<div class="focus-success"><i class="fa-solid fa-check-circle" style="margin-right:0.5rem;"></i> Changes saved successfully!</div>`}
        
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; padding-bottom:1rem; border-bottom:1px solid var(--border-color); flex-wrap: wrap; gap: 1rem;">
          <div>
            <h2 style="font-size:1.4rem; font-weight:700; color:var(--text-primary); margin:0;">
              <i class="fa-solid fa-folder-tree" style="margin-right:0.5rem; color:var(--accent-blue);"></i>
              ${isEditing ? 'Edit Project' : 'Project Details'}
            </h2>
            <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem;">${project.id} — ${project.title}</div>
          </div>
          <button class="btn" onClick=${handleClose} style="background:transparent; border:1px solid var(--border-color);" title="Close Tab">
            <i class="fa-solid fa-xmark" style="margin-right: 0.3rem;"></i> Close
          </button>
        </div>

        <div style="margin-bottom:1.5rem;padding-bottom:1.5rem;border-bottom:1px solid var(--border-color);display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;">
          <div style="flex:1;min-width:0;">
            ${isEditing 
              ? html`<input class="form-input" style="font-size:1.4rem;font-weight:800;width:100%;margin-bottom:0.6rem;" value=${editForm.title} onInput=${e => setEditForm({...editForm, title: e.target.value})} />`
              : html`<h2 style="font-size:1.7rem;font-weight:800;color:var(--text-primary);margin:0 0 0.6rem;line-height:1.2;">${project.title}</h2>`
            }
            <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">
              <span class="card-id" style="font-size:0.82rem;padding:0.2rem 0.5rem;background:rgba(59,130,246,0.12);border-radius:4px;color:var(--accent-blue);font-family:monospace;">${project.id}</span>
              <span class="tag ${getPhaseClass(project.phase)}" style="font-size:0.72rem;">${project.phase}</span>
              ${isIterating && html`<span class="tag color-ds" style="font-size:0.65rem;">ITERATION v${iterationNum}</span>`}
            </div>
          </div>
        </div>

        ${coreBody}

        ${footerContent}
      </div>
    `;
  }
};

export const ProjectModalInner = ({ project, currentUser, tasks, onClose, onUpdate }) => {
  return html`<${ProjectDetailCore} project=${project} currentUser=${currentUser} tasks=${tasks} onClose=${onClose} onUpdate=${onUpdate} isModal=${true} />`;
};

const ProjectStreamsPanel = ({ projectId, tasks, streams, currentUser, onUpdate, isProjectLead }) => {
  const isAdmin = hasPermission(currentUser, 'admin.panel');
  const isLeader = hasPermission(currentUser, 'task.approve');
  const [selectedNewStream, setSelectedNewStream] = useState('');
  const [openCommentsId, setOpenCommentsId] = useState(null);

  const activateStream = async (phase, team) => {
    await apiFetch(`/api/projects/${projectId}/streams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase_name: phase, team_name: team })
    });
    onUpdate();
  };

  const completeStream = async (stream) => {
    const incompleteTasks = (tasks || []).filter(t =>
      t.project_id === projectId &&
      t.crisp_dm_phase === stream.phase_name &&
      t.team === stream.team_name &&
      t.status !== 'done'
    );
    if (incompleteTasks.length > 0) {
      const ok = await appConfirm(
        `${incompleteTasks.length} task${incompleteTasks.length > 1 ? 's are' : ' is'} still open in this stream. Mark complete anyway?`,
        'Confirm Completion'
      );
      if (!ok) return;
    }
    await apiFetch(`/api/projects/${projectId}/streams/${stream.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'complete' })
    });
    onUpdate();
  };

  const allPossibleStreams = useMemo(() => {
    const list = [];
    getPhases().forEach(phase => {
      getTeams().forEach(team => {
        if (getTeamPhases(team).includes(phase)) list.push({ phase, team });
      });
    });
    return list;
  }, []);

  const activeStreams = (streams || []);
  const activePossible = allPossibleStreams.filter(ps =>
    activeStreams.some(s => s.phase_name === ps.phase && s.team_name === ps.team)
  );
  const availablePossible = allPossibleStreams.filter(ps =>
    !activeStreams.some(s => s.phase_name === ps.phase && s.team_name === ps.team) &&
    (isAdmin || (isLeader && currentUser.team === ps.team))
  );

  const canActivate = hasPermission(currentUser, 'project.manage');

  return html`
    <div class="streams-container">
      ${activePossible.length === 0
        ? html`
          <div style="font-size:0.85rem;color:var(--text-secondary);padding:1rem 0.75rem;background:rgba(0,0,0,0.15);border-radius:var(--radius-md);text-align:center;border:1px dashed rgba(255,255,255,0.08);">
            <i class="fa-solid fa-layer-group" style="opacity:0.4;display:block;font-size:1.4rem;margin-bottom:0.5rem;"></i>
            No workstreams activated yet.
          </div>`
        : html`
          <div style="display:flex;flex-direction:column;gap:0.6rem;">
            ${activePossible.map(ps => {
              const stream = activeStreams.find(s => s.phase_name === ps.phase && s.team_name === ps.team);
              if (!stream) return null;
              const pct = typeof stream.computed_progress === 'number' ? stream.computed_progress : 0;
              const isDone = stream.status === 'complete';
              const canManage = hasPermission(currentUser, 'project.manage') && (isAdmin || (isLeader && currentUser.team === ps.team));
              const isCommentsOpen = openCommentsId === `${ps.phase}||${ps.team}`;
              return html`
                <div style="display:flex; flex-direction:column; gap:0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem;">
                  <div style="background:rgba(255,255,255,0.03);border:1px solid ${isDone ? 'rgba(16,185,129,0.35)' : 'rgba(59,130,246,0.3)'};border-radius:10px;padding:0.85rem 1rem;display:flex;align-items:center;gap:0.75rem;">
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.2rem;">
                        <span style="font-size:0.82rem;font-weight:700;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ps.phase}</span>
                        <span class="tag ${isDone ? 'color-green' : 'color-bu'}" style="font-size:0.55rem;padding:0.1rem 0.35rem;flex-shrink:0;">${isDone ? 'DONE' : 'ACTIVE'}</span>
                      </div>
                      <div style="font-size:0.7rem;color:var(--text-secondary);margin-bottom:0.4rem;">
                        <i class="fa-solid fa-users" style="margin-right:0.25rem;opacity:0.6;"></i>${ps.team}
                      </div>
                      <div style="display:flex;align-items:center;gap:0.5rem;">
                        <div style="flex:1;height:3px;background:rgba(255,255,255,0.08);border-radius:2px;overflow:hidden;">
                          <div style="height:100%;width:${pct}%;background:${isDone ? 'var(--accent-green)' : 'var(--accent-blue)'};border-radius:2px;transition:width 0.4s ease;"></div>
                        </div>
                        <span style="font-size:0.7rem;font-weight:600;color:var(--text-secondary);flex-shrink:0;">${pct}%</span>
                      </div>
                    </div>
                    <div style="display:flex;gap:0.3rem;flex-shrink:0;">
                      <button class="btn" style="padding:0.25rem 0.5rem;font-size:0.72rem;border:1px solid ${isCommentsOpen ? 'var(--accent-blue)' : 'var(--border-color)'};color:${isCommentsOpen ? 'var(--accent-blue)' : 'var(--text-secondary)'};background:transparent;" 
                        onClick=${() => setOpenCommentsId(isCommentsOpen ? null : `${ps.phase}||${ps.team}`)}
                        title="View Phase Comments">
                        <i class="fa-solid fa-comments"></i>
                      </button>
                      ${!isDone && canManage && html`
                        <button class="btn" style="padding:0.25rem 0.5rem;font-size:0.72rem;border:1px solid rgba(16,185,129,0.4);color:var(--accent-green);background:rgba(16,185,129,0.06);flex-shrink:0;" onClick=${() => completeStream(stream)}>
                          <i class="fa-solid fa-check"></i>
                        </button>
                      `}
                    </div>
                  </div>
                  ${isCommentsOpen && html`<${StreamCommentsPanel} projectId=${projectId} phaseName=${ps.phase} currentUser=${currentUser} isProjectLead=${isProjectLead} />`}
                </div>
              `;
            })}
          </div>`
      }

      ${canActivate && availablePossible.length > 0 && html`
        <div style="margin-top:1.25rem;padding-top:1.25rem;border-top:1px solid rgba(255,255,255,0.07);">
          <div style="font-size:0.75rem;font-weight:600;margin-bottom:0.6rem;color:var(--text-secondary);letter-spacing:0.04em;">
            <i class="fa-solid fa-plus" style="margin-right:0.3rem;"></i>ACTIVATE WORKSTREAM
          </div>
          <div style="display:flex;gap:0.5rem;">
            <select class="form-select" style="flex:1;font-size:0.8rem;" value=${selectedNewStream} onChange=${e => setSelectedNewStream(e.target.value)}>
              <option value="">— Phase (Team) —</option>
              ${availablePossible.map(ps => html`<option value="${ps.phase}||${ps.team}">${ps.phase} · ${ps.team}</option>`)}
            </select>
            <button class="btn active" style="background:var(--accent-blue);padding:0.3rem 0.75rem;font-size:0.82rem;flex-shrink:0;"
              disabled=${!selectedNewStream}
              onClick=${() => {
                const [p, t] = selectedNewStream.split('||');
                if (p && t) { activateStream(p, t); setSelectedNewStream(''); }
              }}>
              Activate
            </button>
          </div>
        </div>
      `}
    </div>
  `;
};



export const PhaseSubmissionPanel = ({ projects, currentUser, fetchProjects }) => {
  const [selProject, setSelProject] = useState('');
  const [selPhase, setSelPhase] = useState('');
  const [note, setNote] = useState('');
  const teamPhases = getTeamPhases(currentUser.team) || [];
  const proj = projects.find(p => p.id === selProject);
  const availablePhases = teamPhases.filter(ph => ph !== proj?.phase);

  const submit = async () => {
    if (!proj || !selPhase) return;
    const confirmed = await appConfirm(`Mark stream "${selPhase}" as COMPLETE for your team?`, 'Confirm Stream Completion');
    if (!confirmed) return;
    
    // Find or create stream
    const streamsRes = await apiFetch(`/api/projects/${proj.id}/streams`);
    const streams = await streamsRes.json();
    let stream = streams.find(s => s.phase_name === selPhase && s.team_name === currentUser.team);
    
    if (!stream) {
      // Auto-activate and complete if not exists
      const postRes = await apiFetch(`/api/projects/${proj.id}/streams`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase_name: selPhase, team_name: currentUser.team })
      });
      stream = await postRes.json();
    }
    
    await apiFetch(`/api/projects/${proj.id}/streams/${stream.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'complete' })
    });

    logAudit(currentUser, 'STREAM_COMPLETED', `Leader ${currentUser.username} completed stream "${selPhase}" for ${selProject}`);
    setSelProject(''); setSelPhase(''); setNote('');
    fetchProjects();
  };

  if (teamPhases.length === 0) return null;

  return html`
    <div class="phase-submit-panel" style="margin-bottom:1.5rem;">
      <div class="section-title" style="margin-bottom:0.5rem;"><i class="fa-solid fa-code-branch"></i> Phase Submission</div>
      <p style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:1rem;">
        Advance any project to a phase your team (${currentUser.team}) is responsible for.
      </p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
        <div>
          <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Project</label>
          <select class="form-select" style="width:100%;" value=${selProject}
            onChange=${e => { setSelProject(e.target.value); setSelPhase(''); }}>
            <option value="">— Select Project —</option>
            ${projects.map(p => html`<option value=${p.id}>${p.id} — ${p.title} [${p.phase}]</option>`)}
          </select>
        </div>
        <div>
          <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Submit to Phase</label>
          <select class="form-select" style="width:100%;" value=${selPhase}
            onChange=${e => setSelPhase(e.target.value)} disabled=${!selProject}>
            <option value="">— Select Phase —</option>
            ${availablePhases.map(ph => html`<option value=${ph}>${ph}</option>`)}
          </select>
        </div>
        <div style="grid-column:1/-1;">
          <label style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;">Note (optional)</label>
          <input class="form-input" style="width:100%;" placeholder="e.g. Data preparation complete, models ready..."
            value=${note} onInput=${e => setNote(e.target.value)} />
        </div>
        <div style="grid-column:1/-1;text-align:right;">
          <button class="btn active" style="background:var(--accent-purple);"
            onClick=${submit} disabled=${!selProject || !selPhase}>
            <i class="fa-solid fa-arrow-right-to-bracket"></i> Submit Phase
          </button>
        </div>
      </div>
    </div>
  `;
};



export const PhaseSubmissionTab = ({ projects, tasks, currentUser, openPhaseModal }) => {
  const isAdmin = hasPermission(currentUser, 'admin.panel');
  const isLeader = hasPermission(currentUser, 'task.approve');
  const teamPhases = getTeamPhases(currentUser.team) || [];

  const PHASE_TEAM_MAP = {};
  Object.entries(getAllTeamPhases()).forEach(([team, phases]) => {
    phases.forEach(ph => { PHASE_TEAM_MAP[ph] = (PHASE_TEAM_MAP[ph] || []).concat(team); });
  });

  const getResponsibleTeam = (phase) => PHASE_TEAM_MAP[phase] || [];

  return html`
    <div>
      <div class="page-header">
        <div>
          <h2 class="page-title">Phase Submission</h2>
          <p class="page-subtitle">Submit project phase completions and advance the CRISP-DM lifecycle</p>
        </div>
      </div>

      <!-- Project Status Overview Table -->
      <div class="section-title" style="margin-bottom:1rem;"><i class="fa-solid fa-table"></i> All Projects — Phase Status & Actions</div>
      <div style="overflow-x:auto;">
        <table class="data-grid-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Stakeholder</th>
              <th>Current Phase</th>
              <th>Responsible Team(s)</th>
              <th>Phase Tasks</th>
              <th>Done / Total</th>
              <th style="text-align:center;">Action for You</th>
            </tr>
          </thead>
          <tbody>
            ${projects.map(p => {
              const phaseTasks = tasks.filter(t => t.project_id === p.id && t.crisp_dm_phase === p.phase);
              const doneCount = phaseTasks.filter(t => t.status === 'done').length;
              const responsible = getResponsibleTeam(p.phase);
              const myAction = isAdmin ? 'Can submit any phase' : teamPhases.includes(p.phase) ? 'Submit when ready' : '—';
              const actionColor = myAction === '—' ? 'var(--text-secondary)' : 'var(--accent-green)';
              const health = getHealthStatus(p, tasks);
              return html`
                <tr style="border-bottom:1px solid var(--border-color);">
                  <td style="padding:0.75rem 1rem;">
                    <div style="font-weight:700;color:var(--accent-blue);">${p.id}</div>
                    <div style="font-size:0.83rem;font-weight:600;">${p.title || `Project #${p.id}`}</div>
                    <div style="font-size:0.7rem;color:${health.color};margin-top:0.2rem;">${health.label}</div>
                  </td>
                  <td style="font-size:0.8rem;color:var(--accent-orange);font-weight:600;">${Array.isArray(p.stakeholders) && p.stakeholders.length > 0 ? p.stakeholders.join(', ') : (p.stakeholders && p.stakeholders !== '[]' ? p.stakeholders : '—')}</td>
                  <td><span class="tag ${p.phase ? getPhaseClass(p.phase) : 'color-slate'}">${p.phase || 'Not Started'}</span></td>
                  <td>
                    ${responsible.length > 0
                      ? responsible.map(t => html`<span class="tag ${getTeamClass(t)}" style="font-size:0.65rem;display:block;margin-bottom:0.2rem;">${t.replace(' Team','')}</span>`)
                      : html`<span style="color:var(--text-secondary);">Any</span>`
                    }
                  </td>
                  <td style="text-align:center;font-size:0.85rem;">
                    ${phaseTasks.length > 0 ? phaseTasks.length : html`<span style="color:var(--text-secondary);">—</span>`}
                  </td>
                  <td style="text-align:center;">
                    ${phaseTasks.length > 0
                      ? html`<span style="font-weight:700;color:${doneCount===phaseTasks.length?'var(--accent-green)':'var(--accent-orange)'};">${doneCount}/${phaseTasks.length}</span>`
                      : html`<span style="color:var(--text-secondary);">—</span>`
                    }
                  </td>
                  <td style="text-align:center;">
                    ${(isAdmin || teamPhases.includes(p.phase)) ? html`
                      <button class="btn" style="font-size:0.78rem;color:var(--accent-purple);border:1px solid rgba(139,92,246,0.3);background:rgba(139,92,246,0.05);"
                        onClick=${() => openPhaseModal(p.id)}>
                        <i class="fa-solid fa-code-branch"></i> Submit Phase
                      </button>
                    ` : html`<span style="font-size:0.78rem;color:var(--text-secondary);">Not your team's phase</span>`}
                  </td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
    </div>
  `;
};

const StreamCommentsPanel = ({ projectId, phaseName, currentUser, isProjectLead }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const fetchComments = async () => {
    setIsLoading(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/phase-comments?phase=${encodeURIComponent(phaseName)}`);
      if (res.ok) {
        setComments(await res.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [projectId, phaseName]);

  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const res = await apiFetch(`/api/projects/${projectId}/phase-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase_name: phaseName, content: newComment.trim() })
      });
      if (res.ok) {
        setNewComment('');
        fetchComments();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to post comment");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const isAdmin = hasPermission(currentUser, 'admin.panel');
  const isLeader = hasPermission(currentUser, 'task.approve');
  const canPost = isAdmin || isLeader || isProjectLead;

  return html`
    <div class="phase-comments-section">
      <div style="font-weight:600; font-size:0.8rem; margin-bottom:0.5rem; color:var(--text-primary); display:flex; align-items:center; gap:0.3rem;">
        <i class="fa-solid fa-comments"></i> Phase Comments (${comments.length})
      </div>
      
      ${isLoading && comments.length === 0 ? html`<div style="font-size:0.75rem; color:var(--text-secondary); padding:0.5rem 0;">Loading comments...</div>` : null}
      
      ${!isLoading && comments.length === 0 ? html`<div style="font-size:0.75rem; color:var(--text-secondary); font-style:italic; padding:0.5rem 0;">No comments yet on this phase.</div>` : null}
      
      <div style="max-height: 200px; overflow-y: auto; margin-bottom: 0.75rem; display:flex; flex-direction:column; gap:0.5rem;">
        ${comments.map(c => html`
          <div class="phase-comment-item">
            <div class="phase-comment-avatar">${getInitials(c.submitted_by)}</div>
            <div class="phase-comment-content">
              <div class="phase-comment-header">
                <span class="phase-comment-author">Submitted by: ${c.submitted_by}</span>
                <span>${c.created_at}</span>
              </div>
              <div class="phase-comment-body">${c.content}</div>
            </div>
          </div>
        `)}
      </div>

      ${canPost ? html`
        <form onSubmit=${handlePostComment} class="phase-comment-form">
          <textarea 
          class="phase-comment-input" 
            placeholder="Add comments on this phase stream..." 
            value=${newComment} 
            onInput=${e => setNewComment(e.target.value)}
          ></textarea>
          <button type="submit" class="phase-comment-submit-btn" disabled=${!newComment.trim()}>Post Comment</button>
        </form>
      ` : null}
    </div>
  `;
};

export const ProjectDetailInline = ({ project, currentUser, tasks, onClose, onUpdate }) => {
  return html`<${ProjectDetailCore} project=${project} currentUser=${currentUser} tasks=${tasks} onClose=${onClose} onUpdate=${onUpdate} isModal=${false} />`;
};

export const ProjectDocumentView = ({ projectId, currentUser, onClose }) => {
  const [docData, setDocData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingPhase, setEditingPhase] = useState(null); // phase name being edited
  const [editForm, setEditForm] = useState({ summary: '', deliverables: '' });
  const [savingPhase, setSavingPhase] = useState(false);
  const [collapsedPhases, setCollapsedPhases] = useState({});
  const [expandedTasks, setExpandedTasks] = useState({});

  const fetchDocData = async () => {
    try {
      const res = await apiFetch(`/api/projects/${projectId}/document`);
      if (res.ok) {
        const data = await res.json();
        setDocData(data);
        // Initialize collapsed phases
        setCollapsedPhases(prev => {
          const initial = { ...prev };
          getPhases().forEach(ph => {
            if (initial[ph] === undefined) {
              initial[ph] = ph !== data.project.phase;
            }
          });
          return initial;
        });
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || 'Failed to load project document.');
      }
    } catch (e) {
      setError('Network error loading project document.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (projectId) {
      fetchDocData();
    }
  }, [projectId]);

  const handleExportPDF = () => {
    window.open(`/api/projects/${projectId}/export-pdf`, '_blank');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleEditPhaseClick = (ph, snap) => {
    setEditingPhase(ph);
    setEditForm({
      summary: snap ? snap.summary || '' : '',
      deliverables: snap ? snap.deliverables || '' : ''
    });
  };

  const handleSavePhase = async (ph) => {
    setSavingPhase(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phase_name: ph,
          summary: editForm.summary,
          deliverables: editForm.deliverables
        })
      });
      if (res.ok) {
        setEditingPhase(null);
        fetchDocData();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || "Failed to save phase documentation");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSavingPhase(false);
    }
  };

  if (loading) {
    return html`
      <div style="padding:3rem; text-align:center; color:var(--text-secondary);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; margin-bottom:1rem;"></i>
        <div>Loading Project Document Ledger...</div>
      </div>
    `;
  }

  if (error || !docData) {
    return html`
      <div style="padding:3rem; text-align:center; color:var(--accent-pink);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size:2rem; margin-bottom:1rem;"></i>
        <div>${error || 'Document not found.'}</div>
        <button class="btn" onClick=${onClose} style="margin-top:1rem;">Close</button>
      </div>
    `;
  }

  const { project, snapshots, streams, tasks: docTasks, comments: docComments, history: docHistory } = docData;

  const isAdmin = hasPermission(currentUser, 'admin.panel');
  const isProjectLead = project.project_lead === currentUser.username;
  const isTeamLeader = hasPermission(currentUser, 'task.approve');

  // SVG Overall Progress Ring
  const radius = 50;
  const stroke = 8;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const overallProgress = project.computed_progress || 0;
  const strokeDashoffset = circumference - (overallProgress / 100) * circumference;

  const togglePhaseCollapse = (ph) => {
    setCollapsedPhases(prev => ({
      ...prev,
      [ph]: !prev[ph]
    }));
  };

  const toggleTasksCollapse = (ph) => {
    setExpandedTasks(prev => ({
      ...prev,
      [ph]: !prev[ph]
    }));
  };

  const teamsList = getTeams();
  const phasesList = getPhases();

  return html`
    <div class="project-document-container" style="padding: 2rem; max-width: 1200px; margin: 0 auto;">
      <!-- Cover Section -->
      <div class="project-doc-cover" style="display: flex; flex-wrap: wrap; gap: 2rem; background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 2rem; margin-bottom: 2rem; align-items: center; position: relative;">
        
        <!-- Progress Ring -->
        <div style="flex-shrink: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 140px;">
          <div style=${`position: relative; width: ${radius * 2}px; height: ${radius * 2}px; display: flex; align-items: center; justify-content: center;`}>
            <svg height=${radius * 2} width=${radius * 2} style="transform: rotate(-90deg);">
              <circle
                stroke="var(--border-color)"
                fill="transparent"
                stroke-width=${stroke}
                r=${normalizedRadius}
                cx=${radius}
                cy=${radius}
              />
              <circle
                stroke="var(--accent-blue)"
                fill="transparent"
                stroke-width=${stroke}
                stroke-dasharray="${circumference} ${circumference}"
                style="stroke-dashoffset: ${strokeDashoffset}; transition: stroke-dashoffset 0.35s;"
                r=${normalizedRadius}
                cx=${radius}
                cy=${radius}
              />
            </svg>
            <div style="position: absolute; font-size: 1.25rem; font-weight: 800; color: var(--text-primary); top: 50%; left: 50%; transform: translate(-50%, -50%); line-height: 1; text-align: center;">
              ${overallProgress}%
            </div>
          </div>
          <span style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 0.5rem; text-transform: uppercase; font-weight: 600;">Progress</span>
        </div>

        <div style="flex: 1; min-width: 0;">
          <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
            <span style="font-family: monospace; background: rgba(59, 130, 246, 0.12); color: var(--accent-blue); padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: 600; font-size: 0.82rem;">${project.id}</span>
            <span class="tag ${getPhaseClass(project.phase)}" style="font-size: 0.75rem;">${project.phase}</span>
            ${project.is_launched ? html`<span class="tag" style="background: rgba(16, 185, 129, 0.15); color: var(--accent-green); font-size: 0.75rem;"><i class="fa-solid fa-circle-check"></i> Launched</span>` : null}
            ${project.is_deployed ? html`<span class="tag" style="background: rgba(59, 130, 246, 0.15); color: var(--accent-blue); font-size: 0.75rem;"><i class="fa-solid fa-server"></i> Production</span>` : null}
          </div>

          <h1 style="font-size: 1.8rem; font-weight: 800; color: var(--text-primary); margin: 0 0 0.75rem 0; line-height: 1.2;">${project.title}</h1>
          
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 0.75rem; font-size: 0.85rem; color: var(--text-secondary);">
            <div><strong>Project Lead:</strong> ${project.project_lead || '—'}</div>
            <div><strong>Assignee:</strong> ${project.assignee || '—'}</div>
            <div><strong>Stakeholder:</strong> ${Array.isArray(project.stakeholders) ? project.stakeholders.join(', ') : project.stakeholders || '—'}</div>
            <div><strong>Team:</strong> <span class="tag ${project.team ? getTeamClass(project.team) : 'color-slate'}">${project.team || 'Unassigned'}</span></div>
            <div><strong>Start Date:</strong> ${project.start_date || '—'}</div>
            <div><strong>Target Date:</strong> ${project.target_date || '—'}</div>
            ${project.is_launched ? html`<div><strong>Actual End:</strong> ${project.actual_end_date || '—'}</div>` : null}
          </div>

          ${project.is_launched && project.launch_note ? html`
            <div style="margin-top: 1rem; padding: 0.75rem 1rem; background: rgba(16, 185, 129, 0.05); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: var(--radius-sm); font-size: 0.85rem;">
              <strong style="color: var(--accent-green); display: block; margin-bottom: 0.25rem;"><i class="fa-solid fa-rocket"></i> Launch Note</strong>
              <span style="color: var(--text-secondary);">${project.launch_note}</span>
            </div>
          ` : null}
        </div>

        <div class="print-exclude" style="display: flex; flex-direction: column; gap: 0.5rem; align-self: flex-start; flex-shrink: 0; min-width: 180px;">
          <div style="display: flex; gap: 0.5rem;">
            <button class="btn" style="background: var(--bg-panel); border: 1px solid var(--border-color); flex: 1;" onClick=${handlePrint} title="Print Document">
              <i class="fa-solid fa-print"></i> Print
            </button>
            <button class="btn" style="background: var(--bg-panel); border: 1px solid var(--border-color); flex: 1;" onClick=${handleExportPDF} title="Download PDF Ledger">
              <i class="fa-solid fa-file-pdf" style="color: var(--accent-pink);"></i> PDF
            </button>
          </div>
          <button class="btn" onClick=${() => window.openProjectDetail && window.openProjectDetail(project.id)} style="background: var(--bg-panel); border: 1px solid var(--border-color); width: 100%;">
            <i class="fa-solid fa-pen-to-square"></i> Edit Details
          </button>
          <button class="btn active" onClick=${onClose} style="background: var(--accent-blue); font-weight: 600; width: 100%;">
            <i class="fa-solid fa-xmark"></i> Close Tab
          </button>
        </div>
      </div>

      <!-- Executive Summary -->
      <div style="background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 2rem;">
        <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fa-solid fa-file-invoice" style="color: var(--accent-blue);"></i> Executive Summary
        </h2>
        <p style="font-size: 0.95rem; line-height: 1.6; color: var(--text-secondary); white-space: pre-wrap; margin: 0;">
          ${project.description || 'No project description provided.'}
        </p>
      </div>

      <!-- Phase Journey -->
      <div style="margin-bottom: 2rem;">
        <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fa-solid fa-route" style="color: var(--accent-purple);"></i> CRISP-DM Phase Journey
        </h2>

        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${phasesList.map(ph => {
            const phase_streams = streams.filter(s => s.phase_name === ph);
            let p_status = "NOT STARTED";
            let p_progress = 0;
            if (phase_streams.length > 0) {
              if (phase_streams.every(s => s.status === 'complete')) {
                p_status = "COMPLETED";
                p_progress = 100;
              } else if (phase_streams.some(s => s.status === 'active')) {
                p_status = "IN PROGRESS";
                p_progress = Math.max(...phase_streams.map(s => s.progress || 0));
              }
            }

            const snap = snapshots[ph];
            const isCollapsed = collapsedPhases[ph];
            const phaseTasks = docTasks.filter(t => t.crisp_dm_phase === ph);
            const completedTasks = phaseTasks.filter(t => t.status === 'completed');
            
            const defaultTeam = getDefaultTeamForPhase(ph);
            const isOwnTeamPhase = currentUser.team === defaultTeam;
            const canEditPhase = isAdmin || isProjectLead || (isTeamLeader && isOwnTeamPhase);

            let statusClass = "not-started";
            if (p_status === "COMPLETED") statusClass = "completed";
            else if (p_status === "IN PROGRESS") statusClass = "in-progress";

            return html`
              <div class="phase-card ${statusClass}" style="background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden;">
                <!-- Phase Header -->
                <div onClick=${() => togglePhaseCollapse(ph)} style="display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; cursor: pointer; border-bottom: ${isCollapsed ? 'none' : '1px solid var(--border-color)'}; user-select: none;">
                  <div style="display: flex; align-items: center; gap: 1rem; min-width: 0; flex: 1;">
                    <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${ph}
                    </div>
                    <span class="tag" style=${`font-size: 0.68rem; text-transform: uppercase; font-weight: 700; ${p_status === 'COMPLETED' ? 'background: rgba(16, 185, 129, 0.15); color: var(--accent-green);' : p_status === 'IN PROGRESS' ? 'background: rgba(59, 130, 246, 0.15); color: var(--accent-blue);' : 'background: rgba(255, 255, 255, 0.05); color: var(--text-secondary);'}`}>
                      ${p_status}
                    </span>
                    <div style="width: 100px; height: 6px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; display: flex; align-items: center;">
                      <div style=${`width: ${p_progress}%; background: ${p_status === 'COMPLETED' ? 'var(--accent-green)' : 'var(--accent-blue)'}; height: 100%;`}></div>
                    </div>
                    <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 600;">${p_progress}%</span>
                  </div>

                  <div style="display: flex; align-items: center; gap: 1rem;" class="print-exclude">
                    <span style="font-size: 0.78rem; color: var(--text-secondary);">
                      <i class="fa-solid fa-list-check" style="margin-right: 0.25rem;"></i> ${completedTasks.length}/${phaseTasks.length} Tasks
                    </span>
                    <i class="fa-solid ${isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up'}" style="color: var(--text-secondary); font-size: 0.9rem;"></i>
                  </div>
                </div>

                <!-- Phase Content -->
                ${!isCollapsed && html`
                  <div style="padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem;">
                    <!-- Summary & Deliverables Edit/View Grid -->
                    <div style="display: grid; grid-template-columns: 1fr; gap: 1rem;">
                      ${editingPhase === ph
                        ? html`
                          <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 1.25rem; border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 1rem;">
                            <div>
                              <label style="display: block; font-weight: 600; font-size: 0.82rem; margin-bottom: 0.4rem; color: var(--text-primary);">Phase Summary</label>
                              <textarea class="form-input" style="width:100%; min-height: 80px;" value=${editForm.summary} onInput=${e => setEditForm({ ...editForm, summary: e.target.value })} placeholder="Describe what was accomplished in this phase..."></textarea>
                            </div>
                            <div>
                              <label style="display: block; font-weight: 600; font-size: 0.82rem; margin-bottom: 0.4rem; color: var(--text-primary);">Deliverables / Results</label>
                              <textarea class="form-input" style="width:100%; min-height: 80px;" value=${editForm.deliverables} onInput=${e => setEditForm({ ...editForm, deliverables: e.target.value })} placeholder="Specify deliverables, links, models, or documentation created..."></textarea>
                            </div>
                            <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
                              <button class="btn" onClick=${() => setEditingPhase(null)} disabled=${savingPhase}>Cancel</button>
                              <button class="btn active" style="background: var(--accent-blue);" onClick=${() => handleSavePhase(ph)} disabled=${savingPhase}>
                                ${savingPhase ? 'Saving...' : 'Save Section'}
                              </button>
                            </div>
                          </div>
                        `
                        : html`
                          <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 1.5rem; flex-wrap: wrap;">
                            <div style="background: rgba(255, 255, 255, 0.01); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-sm); position: relative; min-width: 250px;">
                              ${canEditPhase && html`
                                <button class="btn print-exclude" style="position: absolute; right: 0.75rem; top: 0.75rem; padding: 0.2rem 0.5rem; font-size: 0.72rem; background: transparent; border: 1px solid var(--border-color);" onClick=${() => handleEditPhaseClick(ph, snap)}>
                                  <i class="fa-solid fa-edit"></i> Edit
                                </button>
                              `}
                              <h4 style="margin: 0 0 0.5rem 0; font-size: 0.88rem; color: var(--text-primary); font-weight: 700; display:flex; align-items:center; gap:0.4rem;">
                                <i class="fa-solid fa-feather" style="color: var(--accent-blue);"></i> Phase Summary
                              </h4>
                              <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5; margin: 0; white-space: pre-wrap;">
                                ${snap ? snap.summary || 'No summary entered yet.' : 'No summary entered yet.'}
                              </p>
                            </div>
                            <div style="background: rgba(255, 255, 255, 0.01); border: 1px solid var(--border-color); padding: 1rem; border-radius: var(--radius-sm); min-width: 250px;">
                              <h4 style="margin: 0 0 0.5rem 0; font-size: 0.88rem; color: var(--text-primary); font-weight: 700; display:flex; align-items:center; gap:0.4rem;">
                                <i class="fa-solid fa-box-open" style="color: var(--accent-purple);"></i> Key Deliverables
                              </h4>
                              <p style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5; margin: 0; white-space: pre-wrap;">
                                ${snap ? snap.deliverables || 'No deliverables recorded yet.' : 'No deliverables recorded yet.'}
                              </p>
                            </div>
                          </div>
                          ${snap && snap.completed_by && html`
                            <div style="font-size: 0.75rem; color: var(--text-secondary); text-align: right; margin-top: -0.5rem;">
                              Last documented by <strong>${snap.completed_by}</strong> on ${snap.completed_at}
                            </div>
                          `}
                        `
                      }
                    </div>

                    <!-- Tasks Checklist Collapsible -->
                    ${phaseTasks.length > 0 && html`
                      <div style="border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden;">
                        <div onClick=${() => toggleTasksCollapse(ph)} style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 1rem; background: rgba(255,255,255,0.02); cursor: pointer; user-select: none;">
                          <span style="font-size: 0.8rem; font-weight: 600; color: var(--text-primary); display:flex; align-items:center; gap:0.4rem;">
                            <i class="fa-solid fa-list-check" style="color: var(--accent-blue);"></i> Phase Tasks Checklist (${completedTasks.length}/${phaseTasks.length} Done)
                          </span>
                          <i class="fa-solid ${expandedTasks[ph] ? 'fa-chevron-up' : 'fa-chevron-down'}" style="font-size: 0.75rem; color: var(--text-secondary);"></i>
                        </div>
                        
                        ${expandedTasks[ph] && html`
                          <div style="padding: 0.5rem 1rem; border-top: 1px solid var(--border-color); background: rgba(0,0,0,0.1); display: flex; flex-direction: column; gap: 0.4rem;">
                            ${phaseTasks.map(t => html`
                              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.02); font-size: 0.82rem;">
                                <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0; flex: 1;">
                                  <i class=${t.status === 'completed' ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle'} style=${`color: ${t.status === 'completed' ? 'var(--accent-green)' : 'var(--text-secondary)'}; flex-shrink: 0;`}></i>
                                  <span style=${`text-decoration: ${t.status === 'completed' ? 'line-through' : 'none'}; opacity: ${t.status === 'completed' ? 0.6 : 1}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary);`}>
                                    ${t.title}
                                  </span>
                                  ${t.post_production ? html`<span class="tag" style="font-size:0.6rem; padding:0.05rem 0.2rem; background: rgba(245, 158, 11, 0.15); color: var(--accent-orange);">Post-Prod</span>` : null}
                                </div>
                                <div style="display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0; font-size: 0.78rem; color: var(--text-secondary);">
                                  <span>${t.assignee || 'Unassigned'}</span>
                                  <span class="tag" style=${`font-size:0.62rem; text-transform:uppercase; ${t.status === 'completed' ? 'background:rgba(16,185,129,0.1); color:var(--accent-green);' : t.status === 'in_progress' ? 'background:rgba(59,130,246,0.1); color:var(--accent-blue);' : 'background:rgba(255,255,255,0.05); color:var(--text-secondary);'}`}>
                                    ${t.status.replace('_', ' ')}
                                  </span>
                                </div>
                              </div>
                            `)}
                          </div>
                        `}
                      </div>
                    `}

                    <!-- Stream Comments Thread using built-in StreamCommentsPanel -->
                    <div style="border-top: 1px solid var(--border-color); padding-top: 1rem;">
                      <${StreamCommentsPanel}
                        projectId=${projectId}
                        phaseName=${ph}
                        currentUser=${currentUser}
                        isProjectLead=${isProjectLead}
                      />
                    </div>
                  </div>
                `}
              </div>
            `;
          })}
        </div>
      </div>

      <!-- Workstream Matrix -->
      <div style="background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem; margin-bottom: 2rem;">
        <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin: 0 0 1rem 0; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fa-solid fa-table" style="color: var(--accent-blue);"></i> Workstream status matrix
        </h2>
        <div style="overflow-x: auto;">
          <table class="workstream-matrix" style="width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left;">
            <thead>
              <tr style="border-bottom: 2px solid var(--border-color);">
                <th style="padding: 0.75rem 1rem; color: var(--text-primary); font-weight: 700; border: 1px solid var(--border-color);">Team / Function</th>
                ${phasesList.map(ph => html`
                  <th style="padding: 0.75rem 1rem; color: var(--text-primary); font-weight: 700; text-align: center; border: 1px solid var(--border-color);">${ph}</th>
                `)}
              </tr>
            </thead>
            <tbody>
              ${teamsList.map(team => html`
                <tr style="border-bottom: 1px solid var(--border-color);">
                  <td style="padding: 0.75rem 1rem; font-weight: 600; color: var(--text-primary); border: 1px solid var(--border-color);">
                    <span class="tag ${getTeamClass(team)}" style="font-size:0.75rem;">${team}</span>
                  </td>
                  ${phasesList.map(ph => {
                    const st = streams.find(s => s.phase_name === ph && s.team_name === team);
                    if (!st) return html`<td style="padding: 0.75rem 1rem; text-align: center; color: var(--text-secondary); opacity: 0.4; border: 1px solid var(--border-color);">—</td>`;
                    return html`
                      <td style="padding: 0.75rem 1rem; text-align: center; border: 1px solid var(--border-color);">
                        <span class="tag" style=${`font-size:0.72rem; ${st.status === 'complete' ? 'background:rgba(16,185,129,0.15); color:var(--accent-green);' : st.status === 'active' ? 'background:rgba(59,130,246,0.15); color:var(--accent-blue);' : 'background:rgba(255,255,255,0.05); color:var(--text-secondary);'}`}>
                          ${st.status === 'complete' ? 'Complete' : st.status === 'active' ? `Active (${st.progress || 0}%)` : 'Inactive'}
                        </span>
                      </td>
                    `;
                  })}
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Activity Timeline -->
      <div style="background: var(--bg-panel); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.5rem;">
        <h2 style="font-size: 1.25rem; font-weight: 700; color: var(--text-primary); margin: 0 0 1.5rem 0; display: flex; align-items: center; gap: 0.5rem;">
          <i class="fa-solid fa-clock-rotate-left" style="color: var(--accent-orange);"></i> Activity History Timeline
        </h2>
        
        <div class="timeline" style="display: flex; flex-direction: column; gap: 1rem; position: relative; padding-left: 1rem;">
          <div style="position: absolute; left: 4px; top: 0; bottom: 0; width: 2px; background: var(--border-color);"></div>
          ${docHistory.length === 0 ? html`
            <div style="color: var(--text-secondary); font-style: italic; font-size: 0.85rem; padding-left: 0.5rem;">No history events logged.</div>
          ` : docHistory.map((item, i) => html`
            <div key=${i} style="display: flex; gap: 1rem; position: relative;">
              <div style="position: absolute; left: -10px; top: 5px; width: 10px; height: 10px; border-radius: 50%; background: ${item.status === 'launched' ? 'var(--accent-green)' : 'var(--accent-blue)'}; border: 2px solid var(--bg-panel);"></div>
              <div style="flex: 1; padding-left: 0.5rem;">
                <div style="display: flex; justify-content: space-between; font-size: 0.72rem; color: var(--text-secondary); margin-bottom: 0.2rem;">
                  <span><strong>${item.date}</strong></span>
                  <span style="font-family: monospace; background: rgba(255,255,255,0.05); padding: 0.1rem 0.3rem; border-radius: 3px;">${item.phase}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-primary); line-height: 1.4;">${item.note}</div>
                ${item.actor && html`<div style="font-size: 0.72rem; color: var(--text-secondary); margin-top: 0.1rem;">by ${item.actor}</div>`}
              </div>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
};


