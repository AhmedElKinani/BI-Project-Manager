import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
const html = htm.bind(h);

export const CommandPalette = ({ projects, tasks, setActiveTab, setSelectedProjectId }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        setSearch('');
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  if (!open) return null;

  const s = search.toLowerCase();
  const matchedProjects = (projects || []).filter(p => p.id.toLowerCase().includes(s) || p.title.toLowerCase().includes(s)).slice(0, 5);
  const matchedTasks = (tasks || []).filter(t => t.title.toLowerCase().includes(s)).slice(0, 5);

  return html`
    <div class="modal-overlay" style="align-items:flex-start;padding-top:10vh;" onClick=${(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div class="modal-content" style="max-width:600px;background:var(--bg-panel);backdrop-filter:blur(20px);">
        <div style="padding:1rem;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:1rem;">
          <i class="fa-solid fa-magnifying-glass" style="color:var(--text-secondary);"></i>
          <input ref=${inputRef} class="form-input" style="flex:1;background:transparent;border:none;box-shadow:none;font-size:1.2rem;padding:0;" placeholder="Search projects, tasks... (Cmd+K)" value=${search} onInput=${e => setSearch(e.target.value)} />
          <span style="font-size:0.7rem;background:var(--bg-color-secondary);padding:0.2rem 0.4rem;border-radius:4px;color:var(--text-secondary);border:1px solid var(--border-color);">ESC</span>
        </div>
        <div style="padding:1rem;max-height:60vh;overflow-y:auto;">
          ${s.length > 0 ? html`
            <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.05em;">Projects</div>
            ${matchedProjects.length ? matchedProjects.map(p => html`
              <div class="notif-item" onClick=${() => { setSelectedProjectId(p.id); setOpen(false); }}>
                <i class="fa-solid fa-folder-open" style="margin-right:0.5rem;color:var(--accent-blue);"></i>
                <strong>${p.id}</strong> — ${p.title}
              </div>
            `) : html`<div style="padding:0.5rem;opacity:0.5;">No projects found.</div>`}
            
            <div style="font-size:0.8rem;color:var(--text-secondary);margin:1rem 0 0.5rem;text-transform:uppercase;letter-spacing:0.05em;">Tasks</div>
            ${matchedTasks.length ? matchedTasks.map(t => html`
              <div class="notif-item" onClick=${() => { setActiveTab('my_tasks'); setOpen(false); }}>
                <i class="fa-solid fa-check-square" style="margin-right:0.5rem;color:var(--accent-green);"></i>
                ${t.title} <span style="opacity:0.5;font-size:0.8rem;margin-left:0.5rem;">(${t.status})</span>
              </div>
            `) : html`<div style="padding:0.5rem;opacity:0.5;">No tasks found.</div>`}
          ` : html`
            <div style="text-align:center;padding:2rem;opacity:0.5;">
              <i class="fa-solid fa-bolt" style="font-size:2rem;margin-bottom:1rem;display:block;"></i>
              Start typing to search projects and tasks globally.
            </div>
          `}
        </div>
      </div>
    </div>
  `;
};
