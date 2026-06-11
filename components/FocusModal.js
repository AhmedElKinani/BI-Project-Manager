/**
 * FocusModal.js — Phase 2.3: Focus Modals
 *
 * Exports:
 *   FocusModal          — low-level reusable shell (aggressive dimming, keyboard trap)
 *   TaskFocusModal      — full Task Creation / Edit workflow in a focus modal
 *   PhaseSubmitModal    — Phase Submission workflow in a focus modal
 */

import { apiFetch, getPhaseClass, logAudit, appConfirm, sendChannelMessage, sendNotification, hasPermission, appPrompt, getInitials } from '../utils/core.js';
import { getPhases, getTeams, getTeamPhases, getUsers, getUsersObj } from '../utils/configStore.js';
import { TASK_STATUSES, STATUS_META } from './TaskManagement.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

/* ─── CSS injected once ─────────────────────────────────────── */
const FOCUS_STYLE = `
.focus-overlay {
  position: fixed; inset: 0; z-index: 300;
  display: flex; align-items: center; justify-content: center;
  padding: 2vh 1rem;
  overflow-y: auto;
  background: rgba(0,0,0,0);
  backdrop-filter: blur(0px);
  transition: background 0.25s ease, backdrop-filter 0.25s ease;
  pointer-events: none;
}
.focus-overlay.open {
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(6px);
  pointer-events: all;
}
.focus-panel {
  background: var(--bg-color);
  border: var(--glass-border);
  border-radius: 16px;
  box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
  width: 96vw;
  max-width: var(--modal-max-width, 700px);
  display: flex; flex-direction: column;
  flex-shrink: 0;
  opacity: 0;
  transform: scale(0.94) translateY(12px);
  transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16,1,0.3,1);
}
.focus-panel.open {
  opacity: 1;
  transform: scale(1) translateY(0);
}
.focus-header {
  padding: 1.1rem 1.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
  flex-shrink: 0;
}
.focus-body {
  padding: 1.5rem 1.75rem;
  overflow-y: auto;
  max-height: calc(82vh - 10rem);
}
.focus-footer {
  padding: 1rem 1.75rem;
  border-top: 1px solid var(--border-color);
  display: flex; justify-content: flex-end; gap: 0.75rem;
  flex-shrink: 0;
  background: var(--bg-color-secondary);
  border-radius: 0 0 16px 16px;
}
.focus-label {
  font-size: 0.72rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text-secondary);
  margin-bottom: 0.4rem; display: block;
}
.focus-section { margin-bottom: 1.25rem; }
.focus-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.focus-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
.focus-grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 1rem; }
@media (max-width: 768px) {
  .focus-grid-4 { grid-template-columns: 1fr 1fr; }
  .focus-grid-3 { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 480px) {
  .focus-grid-2, .focus-grid-3, .focus-grid-4 { grid-template-columns: 1fr; }
}
.focus-error {
  color: var(--accent-orange); font-size: 0.82rem;
  padding: 0.6rem 0.9rem; background: rgba(245,158,11,0.1);
  border: 1px solid rgba(245,158,11,0.25); border-radius: 8px;
  margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem;
}
.focus-success {
  color: var(--accent-green); font-size: 0.85rem;
  padding: 0.75rem 1rem; background: rgba(16,185,129,0.1);
  border: 1px solid rgba(16,185,129,0.3); border-radius: 8px;
  margin-bottom: 1rem; text-align: center;
}

/* Custom DateTimePicker Styles */
.dt-picker-wrapper {
  position: relative;
  width: 100%;
}
.dt-picker-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0.6rem 0.8rem;
  background: var(--bg-color-secondary, rgba(255,255,255,0.03));
  border: 1px solid var(--border-color, rgba(255,255,255,0.12));
  border-radius: 10px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-primary);
  transition: border-color 0.2s, background 0.2s;
  min-height: 42px;
}
.dt-picker-trigger:hover {
  border-color: rgba(255,255,255,0.25);
  background: rgba(255,255,255,0.06);
}
/* Fixed, centered full-viewport backdrop overlay */
.dt-picker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: dtFadeIn 0.18s ease-out;
}
@keyframes dtFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
/* Calendar panel as a centered floating card */
.dt-picker-dropdown {
  position: relative;
  z-index: 9001;
  display: flex;
  flex-direction: column;
  background: #16161d;
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 16px;
  box-shadow: 0 32px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.08);
  width: 320px;
  padding: 1rem;
  animation: dtScaleIn 0.2s cubic-bezier(0.16,1,0.3,1);
}
@keyframes dtScaleIn {
  from { opacity: 0; transform: scale(0.93); }
  to   { opacity: 1; transform: scale(1); }
}
.dt-picker-dropdown.has-time {
  width: 430px;
}
@media (max-width: 520px) {
  .dt-picker-dropdown {
    width: 92vw !important;
    padding: 0.85rem;
  }
  .dt-picker-dropdown.has-time {
    width: 92vw !important;
  }
  .dt-picker-dropdown > div:first-child {
    flex-direction: column !important;
  }
  .dt-time-panel {
    width: 100% !important;
    border-left: none !important;
    border-top: 1px solid rgba(255,255,255,0.08);
    padding-left: 0 !important;
    padding-top: 0.75rem;
    flex-direction: row;
  }
  .dt-time-cols {
    height: 110px;
    flex-direction: row;
  }
}
.dt-calendar-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.dt-time-panel {
  width: 95px;
  border-left: 1px solid rgba(255,255,255,0.08);
  padding-left: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.dt-calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  padding: 0 0.2rem;
}
.dt-calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 0.5rem;
}
.dt-calendar-weekday {
  text-align: center;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-secondary);
  opacity: 0.6;
  padding: 0.2rem 0;
}
.dt-calendar-day {
  text-align: center;
  font-size: 0.78rem;
  padding: 0.35rem 0;
  cursor: pointer;
  border-radius: 6px;
  color: var(--text-primary);
  transition: background 0.15s, color 0.15s;
}
.dt-calendar-day:hover {
  background: rgba(255,255,255,0.08);
}
.dt-calendar-day.other-month {
  color: var(--text-secondary);
  opacity: 0.3;
}
.dt-calendar-day.selected {
  background: var(--accent-blue, #3b82f6) !important;
  color: white !important;
  font-weight: 700;
}
.dt-calendar-day.today-highlight {
  border: 1px solid rgba(59,130,246,0.5);
  font-weight: 700;
}
.dt-time-cols {
  display: flex;
  gap: 0.3rem;
  height: 185px;
}
.dt-time-col-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.dt-time-col-label {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--text-secondary);
  text-align: center;
  margin-bottom: 0.2rem;
}
.dt-time-col {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  background: rgba(0,0,0,0.15);
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.05);
}
.dt-time-col::-webkit-scrollbar {
  display: none;
}
.dt-time-item {
  padding: 0.3rem 0;
  text-align: center;
  font-size: 0.78rem;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
}
.dt-time-item:hover {
  background: rgba(255,255,255,0.06);
  color: var(--text-primary);
}
.dt-time-item.active-time {
  background: var(--accent-blue, #3b82f6) !important;
  color: white !important;
  font-weight: 700;
}
.dt-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(255,255,255,0.08);
  padding-top: 0.6rem;
  margin-top: 0.4rem;
  gap: 0.5rem;
  width: 100%;
}
.dt-btn {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 6px;
  color: var(--text-secondary);
  padding: 0.35rem 0.6rem;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.dt-btn:hover {
  border-color: rgba(255,255,255,0.25);
  color: var(--text-primary);
  background: rgba(255,255,255,0.05);
}
.dt-btn.primary {
  background: var(--accent-blue, #3b82f6);
  border-color: transparent;
  color: white;
}
.dt-btn.primary:hover {
  background: #2563eb;
}
.dt-footer-btn {
  background: transparent;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--accent-blue, #3b82f6);
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.dt-footer-btn:hover {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}
.dt-footer-btn.clear {
  color: var(--text-secondary, #9ca3af);
}
.dt-footer-btn.clear:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary, #f3f4f6);
}
.dt-footer-btn.done {
  font-weight: 700;
}
`;

let styleInjected = false;
const injectStyle = () => {
  if (styleInjected) return;
  const el = document.createElement('style');
  el.textContent = FOCUS_STYLE;
  document.head.appendChild(el);
  styleInjected = true;
};

/* ─── FocusModal Shell ──────────────────────────────────────── */
export const FocusModal = ({ open, onClose, title, subtitle, icon, accentColor, children, footer, maxWidth }) => {
  const [isOpen, setIsOpen] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => { injectStyle(); }, []);
  useEffect(() => {
    if (open) requestAnimationFrame(() => setIsOpen(true));
    else setIsOpen(false);
  }, [open]);

  // Keyboard escape
  useEffect(() => {
    const fn = e => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [isOpen, onClose]);

  // Focus trap implementation
  useEffect(() => {
    if (!isOpen) return;
    
    // Focus the first interactive element or the close button
    const focusable = modalRef.current?.querySelectorAll(
      'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'
    );
    if (focusable && focusable.length > 0) {
      focusable[0].focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Tab') {
        const elements = Array.from(
          modalRef.current?.querySelectorAll(
            'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex="0"]'
          ) || []
        );
        if (elements.length === 0) return;
        const first = elements[0];
        const last = elements[elements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!open && !isOpen) return null;

  return html`
    <div class=${`focus-overlay ${isOpen ? 'open' : ''}`}
      onClick=${e => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref=${modalRef} class=${`focus-panel ${isOpen ? 'open' : ''}`} role="dialog" aria-modal="true" style=${maxWidth ? `--modal-max-width:${maxWidth};` : ''}>
        <div class="focus-header">
          <div style="display:flex;align-items:center;gap:0.9rem;">
            <div style="width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,${accentColor || 'var(--accent-blue)'},${accentColor ? accentColor + '99' : 'var(--accent-purple)'});display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <i class="fa-solid ${icon || 'fa-pen'}" style="color:white;font-size:1rem;"></i>
            </div>
            <div>
              <h3 style="margin:0;font-size:1.1rem;font-weight:700;">${title}</h3>
              ${subtitle && html`<p style="margin:0;font-size:0.78rem;color:var(--text-secondary);margin-top:0.15rem;">${subtitle}</p>`}
            </div>
          </div>
          <button style="background:transparent;border:1px solid var(--border-color);border-radius:8px;color:var(--text-secondary);font-size:1rem;cursor:pointer;padding:0.4rem 0.6rem;flex-shrink:0;transition:var(--transition);"
            onMouseEnter=${e => { e.currentTarget.style.borderColor='var(--text-secondary)'; e.currentTarget.style.color='var(--text-primary)'; }}
            onMouseLeave=${e => { e.currentTarget.style.borderColor='var(--border-color)'; e.currentTarget.style.color='var(--text-secondary)'; }}
            onClick=${onClose} aria-label="Close modal">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <div class="focus-body">${children}</div>

        ${footer && html`<div class="focus-footer">${footer}</div>`}
      </div>
    </div>`;
};


/* ─── Custom Date Time Picker with Saturday-first Week ────────── */
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const WEEKDAY_NAMES = ['S', 'S', 'M', 'T', 'W', 'T', 'F'];

const parseValue = (val, type) => {
  if (!val) {
    const d = new Date();
    return {
      date: d,
      hours: d.getHours(),
      minutes: d.getMinutes(),
      isSet: false
    };
  }
  const cleanVal = val.replace(' ', 'T');
  const d = new Date(cleanVal);
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    return { date: fallback, hours: fallback.getHours(), minutes: fallback.getMinutes(), isSet: false };
  }
  return {
    date: d,
    hours: d.getHours(),
    minutes: d.getMinutes(),
    isSet: true
  };
};

const formatValue = (dateObj, hours, minutes, type) => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  if (type === 'date') {
    return `${yyyy}-${mm}-${dd}`;
  } else {
    const hh = String(hours).padStart(2, '0');
    const min = String(minutes).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
  }
};

const DateTimePicker = ({ value, onChange, label, type = 'datetime-local', disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const parsedInit = parseValue(value, type);
  const [currentMonthDate, setCurrentMonthDate] = useState(parsedInit.date);
  const wrapperRef = useRef(null);

  // ── Staging state: holds uncommitted selections ─────────────────
  const [tempDate,    setTempDate]    = useState(parsedInit.date);
  const [tempHours,   setTempHours]   = useState(parsedInit.hours);
  const [tempMinutes, setTempMinutes] = useState(parsedInit.minutes);
  const [tempIsSet,   setTempIsSet]   = useState(parsedInit.isSet);

  // Sync staging state from real value whenever picker opens
  useEffect(() => {
    if (isOpen) {
      const p = parseValue(value, type);
      setTempDate(p.date);
      setTempHours(p.hours);
      setTempMinutes(p.minutes);
      setTempIsSet(p.isSet);
      setCurrentMonthDate(p.date);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll time columns to selected slot after open
  useEffect(() => {
    if (isOpen && type === 'datetime-local') {
      setTimeout(() => {
        const hourCol  = document.querySelector('.hours-col');
        const minCol   = document.querySelector('.minutes-col');
        const actHour  = hourCol?.querySelector('.active-time');
        const actMin   = minCol?.querySelector('.active-time');
        if (actHour && hourCol)  hourCol.scrollTop  = actHour.offsetTop  - hourCol.offsetHeight  / 2 + actHour.offsetHeight  / 2;
        if (actMin  && minCol)   minCol.scrollTop   = actMin.offsetTop   - minCol.offsetHeight   / 2 + actMin.offsetHeight   / 2;
      }, 60);
    }
  }, [isOpen]);

  // Derive display values from the COMMITTED value (not staging)
  const { date: selectedDate, hours, minutes, isSet } = parseValue(value, type);


  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(currentMonthDate.getFullYear(), currentMonthDate.getMonth() + 1, 1));
  };

  // ── Staging-only handlers (no onChange called) ──────────────────
  const handleDayClick = (cell) => {
    const newDate = new Date(cell.year, cell.month, cell.day);
    setTempDate(newDate);
    setTempIsSet(true);
    setCurrentMonthDate(newDate);
  };

  const handleTimeChange = (newHours, newMinutes) => {
    setTempHours(newHours);
    setTempMinutes(newMinutes);
    setTempIsSet(true);
  };

  const handleClear = () => {
    setTempIsSet(false);
  };

  const handleNow = () => {
    const now = new Date();
    setTempDate(now);
    setTempHours(now.getHours());
    setTempMinutes(now.getMinutes());
    setTempIsSet(true);
    setCurrentMonthDate(now);
  };

  // ── Done: commit staging state → parent onChange ────────────────
  const handleConfirm = () => {
    if (tempIsSet) {
      onChange(formatValue(tempDate, tempHours, tempMinutes, type));
    } else {
      onChange('');
    }
    setIsOpen(false);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) setIsOpen(false);
  };

  const formatDisplay = (val) => {
    if (!val) return 'Not Set';
    try {
      const cleanVal = val.replace(' ', 'T');
      const d = new Date(cleanVal);
      if (isNaN(d.getTime())) return val;
      const optionsDate = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      const dateStr = d.toLocaleDateString('en-US', optionsDate);
      if (type === 'date') {
        return dateStr;
      } else {
        const optionsTime = { hour: '2-digit', minute: '2-digit', hour12: true };
        const timeStr = d.toLocaleTimeString('en-US', optionsTime);
        return `${dateStr} ${timeStr}`;
      }
    } catch {
      return val;
    }
  };

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonthSat = (y, m) => {
    const d = new Date(y, m, 1).getDay();
    return (d + 1) % 7;
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayIndex = getFirstDayOfMonthSat(year, month);

  const cells = [];

  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, month: prevMonth, year: prevYear, isCurrentMonth: false });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, month: month, year: year, isCurrentMonth: true });
  }
  const totalCells = cells.length > 35 ? 42 : 35;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const nextDaysNeeded = totalCells - cells.length;
  for (let i = 1; i <= nextDaysNeeded; i++) {
    cells.push({ day: i, month: nextMonth, year: nextYear, isCurrentMonth: false });
  }

  // Use STAGING state for highlighted calendar day selection
  const isSelectedDay = (cell) => {
    if (!tempIsSet) return false;
    return tempDate.getFullYear() === cell.year &&
           tempDate.getMonth() === cell.month &&
           tempDate.getDate() === cell.day;
  };

  const isTodayDay = (cell) => {
    const today = new Date();
    return today.getFullYear() === cell.year &&
           today.getMonth() === cell.month &&
           today.getDate() === cell.day;
  };

  const hoursArray   = Array.from({ length: 24 }, (_, i) => i);
  const minutesArray = Array.from({ length: 60 }, (_, i) => i);

  // Format a staging date for the "pending" preview inside the Done button
  const stagingDisplay = tempIsSet ? (() => {
    const optD = { month: 'short', day: 'numeric' };
    const ds = tempDate.toLocaleDateString('en-US', optD);
    if (type === 'date') return ds;
    const hh = String(tempHours).padStart(2,'0');
    const mm = String(tempMinutes).padStart(2,'0');
    return `${ds} ${hh}:${mm}`;
  })() : null;

  return html`
    <div ref=${wrapperRef} class="dt-picker-wrapper" style="${disabled ? 'opacity: 0.6; pointer-events: none;' : ''}">
      <label class="focus-label" style="cursor:${disabled ? 'not-allowed' : 'pointer'};" onClick=${() => !disabled && setIsOpen(!isOpen)}>${label}</label>
      <div class="dt-picker-trigger" style="cursor:${disabled ? 'not-allowed' : 'pointer'};" onClick=${() => !disabled && setIsOpen(!isOpen)}>
        <span style="display:flex; align-items:center; gap:0.5rem;">
          <i class="fa-regular ${type === 'date' ? 'fa-calendar' : 'fa-clock'}" style="color:var(--accent-blue); opacity:0.8;"></i>
          ${formatDisplay(value)}
        </span>
        <i class="fa-solid fa-chevron-down" style="font-size:0.7rem; opacity:0.6; transition: transform 0.2s; transform: ${isOpen ? 'rotate(180deg)' : 'none'};"></i>
      </div>

      ${isOpen && html`
        <div class="dt-picker-backdrop" onClick=${handleBackdropClick}>
          <div class=${`dt-picker-dropdown ${type === 'datetime-local' ? 'has-time' : ''}`}>

            <!-- Header label -->
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.75rem;">
              <span style="font-size:0.72rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--text-secondary);">
                ${label}
              </span>
              <button type="button" style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);font-size:0.85rem;padding:0.1rem 0.3rem;border-radius:4px;transition:color 0.15s;" onClick=${() => setIsOpen(false)}>
                <i class="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div style="display:flex; flex-direction:row; gap:0.75rem;">
              <div class="dt-calendar-panel">
                <div class="dt-calendar-header">
                  <button type="button" class="dt-btn" style="padding:0.2rem 0.4rem;" onClick=${handlePrevMonth}>
                    <i class="fa-solid fa-chevron-left"></i>
                  </button>
                  <span style="font-size:0.8rem; font-weight:700; color:var(--text-primary);">
                    ${MONTH_NAMES[month]} ${year}
                  </span>
                  <button type="button" class="dt-btn" style="padding:0.2rem 0.4rem;" onClick=${handleNextMonth}>
                    <i class="fa-solid fa-chevron-right"></i>
                  </button>
                </div>
                
                <div class="dt-calendar-grid">
                  ${WEEKDAY_NAMES.map(w => html`<div class="dt-calendar-weekday">${w}</div>`)}
                  ${cells.map(cell => {
                    const isSel = isSelectedDay(cell);
                    const isTod = isTodayDay(cell);
                    const isCur = cell.isCurrentMonth;
                    return html`
                      <div 
                        onClick=${() => handleDayClick(cell)}
                        class=${`dt-calendar-day ${isSel ? 'selected' : ''} ${isTod ? 'today-highlight' : ''} ${!isCur ? 'other-month' : ''}`}
                      >
                        ${cell.day}
                      </div>
                    `;
                  })}
                </div>
              </div>

              ${type === 'datetime-local' && html`
                <div class="dt-time-panel">
                  <div class="dt-time-cols">
                    <div class="dt-time-col-wrapper">
                      <div class="dt-time-col-label">Hrs</div>
                      <div class="dt-time-col hours-col">
                        ${hoursArray.map(h => {
                          const isSel = h === tempHours;
                          return html`
                            <div 
                              onClick=${() => handleTimeChange(h, tempMinutes)}
                              class=${`dt-time-item ${isSel ? 'active-time' : ''}`}
                            >
                              ${String(h).padStart(2, '0')}
                            </div>
                          `;
                        })}
                      </div>
                    </div>
                    
                    <div class="dt-time-col-wrapper">
                      <div class="dt-time-col-label">Min</div>
                      <div class="dt-time-col minutes-col">
                        ${minutesArray.map(m => {
                          const isSel = m === tempMinutes;
                          return html`
                            <div 
                              onClick=${() => handleTimeChange(tempHours, m)}
                              class=${`dt-time-item ${isSel ? 'active-time' : ''}`}
                            >
                              ${String(m).padStart(2, '0')}
                            </div>
                          `;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              `}
            </div>

            <div class="dt-footer">
              <button type="button" class="dt-footer-btn clear" onClick=${handleClear}>
                Clear
              </button>
              <button type="button" class="dt-footer-btn now" onClick=${handleNow}>
                Now
              </button>
              <button type="button" class="dt-footer-btn done" onClick=${handleConfirm}
                style="background:var(--accent-blue);color:white;padding:0.3rem 0.85rem;border-radius:6px;font-weight:700;">
                Done${stagingDisplay ? html` <span style="opacity:0.75;font-weight:400;font-size:0.75rem;"> · ${stagingDisplay}</span>` : ''}
              </button>
            </div>
          </div>
        </div>
      `}
    </div>
  `;
};



/* ─── Task Focus Modal ──────────────────────────────────────── */
export const TaskFocusModal = ({ open, onClose, projects, currentUser, editingTask, onSaved, isSelfAssign, users }) => {
  const isAdmin   = currentUser?.role === 'admin';
  const isLeader  = currentUser?.role === 'leader';
  const isMember  = currentUser?.role === 'member';
  // Members always self-assign; isSelfAssign prop also forces this path
  const selfOnly  = isSelfAssign || isMember;

  const canCreate = hasPermission(currentUser, 'task.create');
  const canUpdate = hasPermission(currentUser, 'task.update');
  const canDelete = hasPermission(currentUser, 'task.delete');
  const hasAssignee = editingTask && (editingTask.assignee_id || editingTask.assignee);
  
  // Assigned Safeguard: only admin can edit/delete assigned tasks
  const isEditAllowed = canUpdate && (!hasAssignee || isAdmin);
  const isDeleteAllowed = canDelete && (!hasAssignee || isAdmin);
  const isDisabled = editingTask ? !isEditAllowed : !canCreate;

  const [isEditing, setIsEditing] = useState(!editingTask);

  useEffect(() => {
    setIsEditing(!editingTask);
  }, [editingTask, open]);

  const defaultForm = () => ({
    project_id: '', title: '', description: '',
    crisp_dm_phase: (getTeamPhases(currentUser?.team) || getPhases())[0] || '',
    assignee: selfOnly ? (currentUser?.username || '') : '',
    team: currentUser?.team || getTeams()[0] || '',
    priority: 'medium', estimated_hours: '', due_date: '',
    start_date: '',
    status: 'todo', post_production: false,
  });

  const [form, setForm]         = useState(defaultForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError]       = useState(null);
  const [success, setSuccess]   = useState(false);
  const isMountedRef            = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (editingTask) {
      setForm({
        project_id:    editingTask.project_id    || '',
        title:         editingTask.title         || '',
        description:   editingTask.description   || '',
        crisp_dm_phase:editingTask.crisp_dm_phase|| (getTeamPhases(currentUser?.team) || getPhases())[0] || '',
        assignee:      selfOnly ? (currentUser?.username || '') : (editingTask.assignee || ''),
        team:          editingTask.team          || currentUser?.team || '',
        priority:      editingTask.priority      || 'medium',
        estimated_hours: editingTask.estimated_hours || '',
        due_date:      editingTask.due_date      || '',
        start_date:    editingTask.start_date    || '',
        status:        editingTask.status        || 'todo',
        post_production: !!editingTask.post_production,
      });
    } else {
      setForm(defaultForm());
    }
    setError(null);
    setSuccess(false);
  }, [editingTask, open]);

  const selectedProject = projects?.find(p => p.id === form.project_id);
  const isCompleted = selectedProject && (selectedProject.status === 'completed' || selectedProject.computed_progress === 100);

  // Phases available based on role and project member assignment
  const allowedPhases = (() => {
    if (isMember && selectedProject) {
      const memberAssg = selectedProject.members?.find(m => m.user_id === currentUser.id);
      if (memberAssg) {
        if (memberAssg.assigned_phases && memberAssg.assigned_phases.length > 0) {
          return memberAssg.assigned_phases;
        } else {
          return getPhases();
        }
      }
    }
    const teamPhases = getTeamPhases(currentUser?.team) || [];
    if (isAdmin) return getPhases();
    return teamPhases.length > 0 ? teamPhases : getPhases();
  })();

  // Assignee options based on role - filtering by selected task team
  const assigneeOptions = (() => {
    if (selfOnly) return null; // locked to self — no dropdown
    
    // Normalize both users prop and config store to rich objects
    const rawUsers = (users && users.length > 0) ? users : getUsersObj();
    
    const selectedProj = projects?.find(p => p.id === form.project_id);
    const selectedTeam = form.team || selectedProj?.team;
    
    return rawUsers
      .map(u => typeof u === 'string' ? getUsersObj().find(x => x.username === u) || { username: u } : u)
      .filter(u => {
        if (selectedTeam && u.team && u.team !== selectedTeam) return false;
        if (u.username === 'admin' && currentUser?.role !== 'admin') return false;
        return true;
      })
      .map(u => u.username);
  })();

  const handleDelete = async () => {
    if (!appConfirm) return;
    const ok = await appConfirm(
      `Permanently delete task "${editingTask.title}"?\n\nThis action cannot be undone.`,
      '⚠️ Delete Task'
    );
    if (!ok) return;

    try {
      setIsSaving(true);
      setError(null);
      const res = await apiFetch(`/api/tasks/${editingTask.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || err.error || 'Delete failed.');
        setIsSaving(false);
        return;
      }
      logAudit(currentUser, 'TASK_DELETED', `Deleted task: ${editingTask.title}`);
      setSuccess(true);
      if (onSaved) onSaved();
      setTimeout(() => onClose(), 800);
    } catch (err) {
      setError(err.message || 'Delete failed.');
      setIsSaving(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!editingTask) return;
    setError(null);
    let blocked_reason = editingTask.blocked_reason || '';
    const willBlock = !editingTask.is_blocked;
    
    if (willBlock) {
      const reason = await appPrompt("Enter the reason why this task is blocked:", "", "Block Task");
      if (reason === null) return; // cancelled
      if (!reason.trim()) {
        setError("A block reason is required to block this task.");
        return;
      }
      blocked_reason = reason;
    }

    try {
      setIsSaving(true);
      const payload = {
        ...editingTask,
        is_blocked: willBlock ? 1 : 0,
        blocked_reason: willBlock ? blocked_reason : ''
      };
      const res = await apiFetch(`/api/tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || err.error || 'Failed to update block state.');
        return;
      }
      logAudit(currentUser, willBlock ? 'TASK_BLOCKED' : 'TASK_UNBLOCKED', `${willBlock ? 'Blocked' : 'Unblocked'} task: ${editingTask.title}`);
      
      if (onSaved) onSaved();
    } catch (err) {
      setError(err.message || 'Operation failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleModalStatusChange = async (newStatus) => {
    if (!editingTask) return;
    setError(null);
    if (editingTask.is_blocked && newStatus !== editingTask.status) {
      setError("This task is currently blocked. Please unblock it first before changing the status.");
      return;
    }

    let resolution_note = editingTask.resolution_note || '';
    let completed_by = editingTask.completed_by || '';
    const now = new Date().toISOString().split('.')[0].replace('T',' ');
    
    let finalStatus = newStatus;
    if (newStatus === 'done' && currentUser.role === 'member') {
      finalStatus = 'review';
    }

    const payload = { ...editingTask, status: finalStatus };
    
    if (finalStatus === 'review') {
      payload.acceptance_status = 'pending_acceptance'; // Reset for leader to accept
      payload.review_submitted_at = now;
    }

    if (finalStatus === 'done' && editingTask.status !== 'done') {
      const note = await appPrompt("Task completed! Enter a resolution or completion note:", "", 'Completion Note');
      if (note === null) return; 
      const hours = await appPrompt("How many actual hours were spent on this task?", editingTask.estimated_hours || '0', 'Actual Effort');
      if (hours === null) return;
      resolution_note = note;
      completed_by = currentUser.username;
      payload.resolution_note = resolution_note;
      payload.completed_by = completed_by;
      payload.resolved_at = now;
      payload.actual_hours = parseFloat(hours) || 0;
    }

    try {
      setIsSaving(true);
      const res = await apiFetch(`/api/tasks/${editingTask.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || err.error || 'Failed to update status.');
        return;
      }
      
      logAudit(currentUser, 'TASK_STATUS_CHANGED', `Moved task "${editingTask.title}" to ${finalStatus}`);
      
      if (finalStatus === 'review') {
        sendChannelMessage(editingTask.team, '🤖 System', `🔍 Task submitted for review: [TASK:${editingTask.id}:${editingTask.title}] by @${currentUser.username}. Leaders, please verify.`);
      }
      
      if (onSaved) onSaved();
      window.showToast && window.showToast(`Task status updated to "${STATUS_META[finalStatus]?.label || finalStatus}" successfully!`);
    } catch (err) {
      setError(err.message || 'Operation failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError('Task title is required.'); return; }
    if (!form.project_id)   { setError('A linked project is required.'); return; }
    setIsSaving(true);
    setError(null);

    // Build approval payload: ONLY standard members need team leader approval
    // Leaders and Admins self-assigning skip the approval queue and are immediately active
    const needsApproval = isMember && selfOnly;

    const payload = {
      ...form,
      estimated_hours: (form.estimated_hours === '' || form.estimated_hours === null || form.estimated_hours === undefined) ? null : parseFloat(form.estimated_hours),
      created_by: currentUser?.username,
      approval_status: needsApproval ? 'pending_approval' : (editingTask ? (editingTask.approval_status || 'approved') : 'approved'),
      acceptance_status: selfOnly ? 'accepted' : (editingTask ? (editingTask.acceptance_status || 'pending_acceptance') : (form.assignee ? 'pending_acceptance' : 'accepted')),
      rejection_reason: needsApproval ? null : (editingTask ? editingTask.rejection_reason : null),
    };

    try {
      let res;
      if (editingTask) {
        res = await apiFetch(`/api/tasks/${editingTask.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
      } else {
        res = await apiFetch('/api/tasks', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
      }
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || (editingTask ? 'Update failed.' : 'Create failed.'));
        return;
      }
      logAudit(currentUser, editingTask ? 'TASK_UPDATED' : 'TASK_CREATED',
        `${editingTask ? 'Updated' : 'Created'} task: ${form.title}${needsApproval ? ' (self-assign pending leader approval)' : selfOnly ? ' (self-assign, auto-approved)' : ''}`);

      // ── Notifications for leader/admin self-assign (new tasks only) ────────────
      // Members: notifications are handled by ApprovalsView when the leader acts.
      // Leaders/Admins: immediately approved, so we notify the team channel now.
      if (!editingTask && selfOnly && !needsApproval) {
        const taskData = await res.json().catch(() => ({}));
        const taskId   = taskData.id || '';
        sendChannelMessage(
          form.team,
          '🤖 System',
          `📋 ${currentUser.role === 'admin' ? 'Admin' : 'Leader'} @${currentUser.username} self-assigned a new task: [TASK:${taskId}:${form.title}] — now active.`
        );
        sendNotification(
          currentUser.username,
          `✅ Your self-assigned task "${form.title}" is now active and logged.`,
          taskId
        );
      }

      setSuccess(true);
      setTimeout(() => { if (isMountedRef.current) { onSaved?.(); onClose(); } }, 900);
    } finally {
      setIsSaving(false);
    }
  };

  const PRIORITY_OPTS = [
    { value:'low',      label:'Low',      color:'var(--accent-green)' },
    { value:'medium',   label:'Medium',   color:'var(--accent-blue)' },
    { value:'high',     label:'High',     color:'var(--accent-orange)' },
    { value:'critical', label:'Critical', color:'var(--accent-pink)' },
  ];

  // Members self-assigning need leader approval; leaders/admins bypass it
  const needsApproval = isMember && selfOnly;

  const submitLabel = needsApproval ? 'Submit for Approval' : editingTask ? 'Save Changes' : 'Create Task';
  const accentCol   = selfOnly ? 'var(--accent-purple)' : editingTask ? 'var(--accent-blue)' : 'var(--accent-green)';

  const footer = isEditing ? html`
    ${editingTask && isDeleteAllowed && html`
      <button class="btn" style="background:var(--accent-pink);color:#fff;margin-right:auto;" onClick=${handleDelete} disabled=${isSaving}>
        <i class="fa-solid fa-trash-can"></i> Delete Task
      </button>
    `}
    <button class="btn" onClick=${editingTask ? () => setIsEditing(false) : onClose} disabled=${isSaving}>Cancel</button>
    <button class="btn active"
      style="background:${accentCol};"
      onClick=${handleSubmit}
      disabled=${isSaving || success || isDisabled}>
      ${isSaving ? html`<i class="fa-solid fa-spinner fa-spin"></i> Saving...`
        : success  ? html`<i class="fa-solid fa-check"></i> Saved!`
        : needsApproval ? html`<i class="fa-solid fa-paper-plane"></i> ${submitLabel}`
        : editingTask ? submitLabel
        : html`<i class="fa-solid fa-plus"></i> ${submitLabel}`}
    </button>` : html`
    ${isDeleteAllowed && html`
      <button class="btn" style="background:var(--accent-pink);color:#fff;margin-right:auto;" onClick=${handleDelete} disabled=${isSaving}>
        <i class="fa-solid fa-trash-can"></i> Delete Task
      </button>
    `}
    <button class="btn" onClick=${onClose} disabled=${isSaving}>Close</button>
    ${isEditAllowed && html`
      <button class="btn active" style="background:var(--accent-blue);" onClick=${() => setIsEditing(true)}>
        <i class="fa-solid fa-pen"></i> Edit Task
      </button>
    `}
  `;

  const modalTitle    = selfOnly && !editingTask ? 'Self-Assign Task'
    : editingTask ? (isEditing ? 'Edit Task' : 'Task Details') : 'Create New Task';
  const modalSubtitle = selfOnly && !editingTask
    ? (needsApproval
        ? 'Create a task for yourself — your team leader will approve it'
        : 'Create a task for yourself — it will be immediately active')
    : editingTask ? (isEditing ? `Editing: ${editingTask.title}` : `Details: ${editingTask.title}`)
    : 'Fill in the details below — all starred fields are required.';

  if (!isEditing && editingTask) {
    const isOverdue = editingTask.due_date && new Date(editingTask.due_date) < new Date() && editingTask.status !== 'done';
    const statusMeta = STATUS_META[editingTask.status] || { label: editingTask.status, bg: 'var(--bg-panel)', color: 'var(--text-primary)' };
    const phaseClass = getPhaseClass(editingTask.crisp_dm_phase);
    
    return html`
      <${FocusModal}
        open=${open}
        onClose=${onClose}
        title="Task Details"
        subtitle=${editingTask.title}
        icon="fa-clipboard-list"
        accentColor="var(--accent-purple)"
        footer=${footer}
        maxWidth="800px"
      >
        <div style="display:flex;flex-direction:column;gap:1.5rem;padding:0.5rem 0;">
          <!-- Header stats -->
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;border-bottom:1px solid var(--border-color);padding-bottom:1rem;">
            <span class="card-id" style="font-family:monospace;font-size:0.85rem;padding:0.25rem 0.5rem;background:rgba(59,130,246,0.1);color:var(--accent-blue);border-radius:4px;">
              TASK-${editingTask.id}
            </span>
            <span class="tag" style="background:${statusMeta.bg};color:${statusMeta.color};font-weight:700;text-transform:uppercase;font-size:0.7rem;letter-spacing:0.04em;">
              ${statusMeta.label}
            </span>
            <span class="tag ${phaseClass}" style="font-weight:700;font-size:0.7rem;">
              ${editingTask.crisp_dm_phase}
            </span>
            <span class="tag" style="background:rgba(255,255,255,0.05);color:var(--text-secondary);font-size:0.7rem;border:1px solid var(--border-color);">
              ${editingTask.priority} Priority
            </span>
            ${isOverdue && html`<span class="tag" style="background:var(--accent-pink);color:white;font-weight:700;font-size:0.7rem;">OVERDUE</span>`}
          </div>

          <!-- Assigned Safeguard Notice Banner -->
          ${hasAssignee && !isAdmin && html`
            <div style="padding:0.75rem 1rem;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.25);border-left:4px solid var(--accent-blue);border-radius:8px;font-size:0.82rem;color:var(--text-secondary);display:flex;align-items:center;gap:0.6rem;">
              <i class="fa-solid fa-lock" style="color:var(--accent-blue);font-size:0.9rem;"></i>
              <span>This task is actively assigned. Core metadata is locked to prevent administrative deviation, but you can update progress and workflows in the Action Zone below.</span>
            </div>
          `}

          <!-- Blocker Banner -->
          ${editingTask.is_blocked ? html`
            <div style="padding:1rem;background:rgba(236,72,153,0.1);border-left:4px solid var(--accent-pink);border-radius:6px;animation:pulse 2s infinite;">
              <div style="font-weight:700;color:var(--accent-pink);font-size:0.9rem;display:flex;align-items:center;gap:0.4rem;margin-bottom:0.25rem;">
                <i class="fa-solid fa-ban"></i> Task is Blocked
              </div>
              <div style="font-size:0.82rem;color:var(--text-primary);">${editingTask.blocked_reason || 'No block reason specified.'}</div>
            </div>
          ` : null}

          <!-- Done details -->
          ${editingTask.status === 'done' && html`
            <div style="padding:1rem;background:rgba(16,185,129,0.08);border-left:4px solid var(--accent-green);border-radius:6px;">
              <div style="font-weight:700;color:var(--accent-green);font-size:0.9rem;display:flex;align-items:center;gap:0.4rem;margin-bottom:0.25rem;">
                <i class="fa-solid fa-circle-check"></i> Task Completed
              </div>
              <div style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:0.5rem;">
                Completed by <strong style="color:var(--text-primary);">${editingTask.completed_by || 'Unknown'}</strong>${editingTask.resolved_at ? ` on ${editingTask.resolved_at.split(' ')[0]}` : ''}
              </div>
              ${editingTask.resolution_note && html`
                <div style="font-size:0.85rem;color:var(--text-primary);background:rgba(0,0,0,0.2);padding:0.75rem;border-radius:4px;border:1px solid var(--border-color);">${editingTask.resolution_note}</div>
              `}
            </div>
          `}

          <!-- Main Info Grid -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;background:rgba(255,255,255,0.01);border:1px solid var(--border-color);padding:1.25rem;border-radius:8px;">
            <div style="display:flex;flex-direction:column;gap:1rem;">
              <div>
                <span style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.04em;">Linked Initiative</span>
                <span style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">${editingTask.project_title || editingTask.project_id || 'None'}</span>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.04em;">Primary Resource</span>
                <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.25rem;">
                  <div class="avatar" style="width:24px;height:24px;font-size:0.6rem;">${getInitials(editingTask.assignee || '?')}</div>
                  <span style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">${editingTask.assignee || 'Unassigned'}</span>
                </div>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.04em;">Assigned Workgroup</span>
                <span style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">${editingTask.team || 'None'}</span>
              </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:1rem;">
              <div style="display:flex;gap:1.5rem;">
                <div style="flex:1;">
                  <span style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.04em;">Start Date</span>
                  <span style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">${editingTask.start_date || '—'}</span>
                </div>
                <div style="flex:1;">
                  <span style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.04em;">Due Date</span>
                  <span style="font-size:0.9rem;font-weight:600;color:${isOverdue ? 'var(--accent-pink)' : 'var(--text-primary)'};">${editingTask.due_date || '—'}</span>
                </div>
              </div>
              <div style="display:flex;gap:1.5rem;">
                <div style="flex:1;">
                  <span style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.04em;">Estimated Effort</span>
                  <span style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">${editingTask.estimated_hours ? `${editingTask.estimated_hours} hrs` : '—'}</span>
                </div>
                <div style="flex:1;">
                  <span style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.04em;">Actual Effort</span>
                  <span style="font-size:0.9rem;font-weight:600;color:var(--text-primary);">${editingTask.actual_hours ? `${editingTask.actual_hours} hrs` : '—'}</span>
                </div>
              </div>
              <div>
                <span style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.25rem;text-transform:uppercase;letter-spacing:0.04em;">Approval Queue Status</span>
                <span style="font-size:0.9rem;font-weight:600;color:var(--text-primary);text-transform:capitalize;">${editingTask.approval_status || 'Approved'}</span>
              </div>
            </div>
          </div>

          <!-- Interactive Quick Actions Panel (ADA-compliant & accessible workspace shortcuts) -->
          <div style="display:flex;flex-direction:column;gap:0.75rem;padding:1rem;background:var(--bg-color-secondary);border:1px solid var(--border-color);border-radius:8px;">
            <span style="font-size:0.75rem;color:var(--text-secondary);display:block;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;">Task Workflow Actions</span>
            <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
              <!-- Status Transition Selector -->
              <div style="display:flex;align-items:center;gap:0.5rem;">
                <span style="font-size:0.85rem;color:var(--text-primary);">Move Status:</span>
                <select class="form-select" style="font-size:0.82rem;padding:0.25rem 1.5rem 0.25rem 0.5rem;min-width:130px;"
                        value=${editingTask.status} 
                        onChange=${e => handleModalStatusChange(e.target.value)}
                        disabled=${isSaving}>
                  <option value="todo">To Do</option>
                  <option value="in_progress">In Progress</option>
                  <option value="review">Submit for Review</option>
                  ${(currentUser.role === 'admin' || currentUser.role === 'leader') && html`
                    <option value="done">Done (Approved)</option>
                  `}
                </select>
              </div>

              <!-- Block / Unblock Toggle Button -->
              <button class="btn" style="font-size:0.8rem;padding:0.35rem 0.75rem;color:${editingTask.is_blocked ? 'var(--text-primary)' : 'var(--accent-pink)'};border:1px solid ${editingTask.is_blocked ? 'var(--text-secondary)' : 'var(--accent-pink)'};"
                      onClick=${handleToggleBlock}
                      disabled=${isSaving}>
                <i class="fa-solid ${editingTask.is_blocked ? 'fa-unlock' : 'fa-lock'}"></i> ${editingTask.is_blocked ? 'Unblock Task' : 'Block Task'}
              </button>
            </div>

            ${isMember && html`
              <div style="font-size:0.75rem;color:var(--accent-purple);margin-top:0.5rem;display:flex;align-items:center;gap:0.4rem;padding-top:0.4rem;border-top:1px solid rgba(255,255,255,0.04);">
                <i class="fa-solid fa-shield-halved" style="font-size:0.85rem;"></i>
                <span>Team members submit tasks for review to satisfy SOC 2 compliance. A team leader will verify and approve.</span>
              </div>
            `}

            <!-- Workspace Navigation Shortcuts -->
            <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.25rem;padding-top:0.5rem;border-top:1px solid rgba(255,255,255,0.05);flex-wrap:wrap;">
              <span style="font-size:0.72rem;color:var(--text-secondary);">Navigate Workspace:</span>
              <button class="btn" style="font-size:0.72rem;padding:0.2rem 0.5rem;" onClick=${() => { onClose(); window.navigateToTab && window.navigateToTab('my_tasks'); }}><i class="fa-solid fa-list-check"></i> My Tasks</button>
              <button class="btn" style="font-size:0.72rem;padding:0.2rem 0.5rem;" onClick=${() => { onClose(); window.navigateToTab && window.navigateToTab('board'); }}><i class="fa-solid fa-layer-group"></i> Pivot Board</button>
              <button class="btn" style="font-size:0.72rem;padding:0.2rem 0.5rem;" onClick=${() => { onClose(); window.navigateToTab && window.navigateToTab('team_pool'); }}><i class="fa-solid fa-inbox"></i> Team Pool</button>
              ${(currentUser.role === 'admin' || currentUser.role === 'leader') && html`
                <button class="btn" style="font-size:0.72rem;padding:0.2rem 0.5rem;" onClick=${() => { onClose(); window.navigateToTab && window.navigateToTab('approvals'); }}><i class="fa-solid fa-check-to-slot"></i> Approvals</button>
              `}
            </div>
          </div>

          <!-- Description Section -->
          <div>
            <span style="font-size:0.75rem;color:var(--text-secondary);display:block;margin-bottom:0.5rem;text-transform:uppercase;letter-spacing:0.04em;">Scope & Description</span>
            <div style="padding:1rem;background:rgba(255,255,255,0.02);border:1px solid var(--border-color);border-radius:6px;font-size:0.9rem;line-height:1.5;white-space:pre-wrap;color:var(--text-primary);max-height:200px;overflow-y:auto;">
              ${editingTask.description || 'No description provided.'}
            </div>
          </div>
        </div>
      </${FocusModal}>
    `;
  }

  return html`
    <${FocusModal}
      open=${open}
      onClose=${onClose}
      title=${modalTitle}
      subtitle=${modalSubtitle}
      icon=${selfOnly && !editingTask ? 'fa-user-check' : editingTask ? 'fa-pen' : 'fa-plus'}
      accentColor=${accentCol}
      footer=${footer}>

      <form onSubmit=${handleSubmit}>
        ${isDisabled && html`<div class="focus-error" style="margin-bottom:1.25rem;"><i class="fa-solid fa-lock"></i> This form is read-only. You do not have permission to modify this task.</div>`}
        ${error   && html`<div class="focus-error"><i class="fa-solid fa-triangle-exclamation"></i> ${error}</div>`}
        ${success && html`<div class="focus-success"><i class="fa-solid fa-check-circle" style="margin-right:0.4rem;"></i>Task ${editingTask ? 'updated' : needsApproval ? 'submitted for approval' : 'created'} successfully!</div>`}

        ${/* Info banner — only for standard members creating a self-assign */ needsApproval && !editingTask && html`
          <div style="margin-bottom:1.25rem;padding:0.65rem 1rem;background:rgba(139,92,246,0.07);border:1px solid rgba(139,92,246,0.2);border-radius:10px;font-size:0.82rem;">
            <i class="fa-solid fa-circle-info" style="color:var(--accent-purple);margin-right:0.4rem;"></i>
            This task will be assigned to <strong>you</strong> and requires <strong>team leader approval</strong> before it appears in your active work.
          </div>
        `}
        ${/* Auto-approve banner — for leaders/admins self-assigning */ selfOnly && !isMember && !editingTask && html`
          <div style="margin-bottom:1.25rem;padding:0.65rem 1rem;background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.2);border-radius:10px;font-size:0.82rem;">
            <i class="fa-solid fa-bolt" style="color:var(--accent-green);margin-right:0.4rem;"></i>
            As a <strong>${currentUser?.role}</strong>, your self-assigned tasks are <strong>immediately active</strong> — no approval required.
          </div>
        `}

        <!-- Title -->
        <div class="focus-section">
          <label class="focus-label">Task Title * ${hasAssignee && !isAdmin ? html`<i class="fa-solid fa-lock" style="margin-left:0.25rem;font-size:0.72rem;opacity:0.6;" title="Locked once task is assigned"></i>` : ''}</label>
          <input class="form-input" style="width:100%;font-size:1rem;"
            placeholder="e.g. Build feature engineering pipeline for churn model"
            value=${form.title}
            onInput=${e => setForm({...form, title: e.target.value})}
            required autofocus disabled=${isDisabled} />
        </div>

        <!-- Project + Phase -->
        <div class="focus-grid-2 focus-section">
          <div>
            <label class="focus-label">Project * ${hasAssignee && !isAdmin ? html`<i class="fa-solid fa-lock" style="margin-left:0.25rem;font-size:0.72rem;opacity:0.6;" title="Locked once task is assigned"></i>` : ''}</label>
            <select class="form-select" style="width:100%;" value=${form.project_id}
              disabled=${isDisabled}
              onChange=${e => {
                const pid = e.target.value;
                const proj = projects?.find(p => p.id === pid);
                const completed = proj && (proj.status === 'completed' || proj.computed_progress === 100);
                
                // If member, adjust phase to a permitted one for the new project if needed
                let newPhase = form.crisp_dm_phase;
                if (isMember && proj) {
                  const memberAssg = proj.members?.find(m => m.user_id === currentUser.id);
                  if (memberAssg && memberAssg.assigned_phases && memberAssg.assigned_phases.length > 0) {
                    if (!memberAssg.assigned_phases.includes(newPhase)) {
                      newPhase = memberAssg.assigned_phases[0] || '';
                    }
                  }
                }
                setForm({...form, project_id: pid, post_production: !!completed, crisp_dm_phase: newPhase});
              }}>
              <option value="">— Select Project —</option>
              ${((projects || []).filter(p => {
                if (isMember) {
                  const isAssigned = p.members?.some(m => m.user_id === currentUser.id);
                  const isCurrentProj = editingTask && p.id === editingTask.project_id;
                  return isAssigned || isCurrentProj;
                }
                return true;
              })).map(p => html`<option value=${p.id}>${p.id} — ${p.title}</option>`)}
            </select>
            ${isCompleted && html`
              <label style="display:flex;align-items:center;gap:0.4rem;font-size:0.75rem;margin-top:0.5rem;color:var(--accent-purple);cursor:pointer;">
                <input type="checkbox" checked=${form.post_production}
                  disabled=${isDisabled}
                  onChange=${e => setForm({...form, post_production: e.target.checked})} />
                Mark as Post-Production Iteration
              </label>`}
          </div>
          <div>
            <label class="focus-label">CRISP-DM Phase * ${hasAssignee && !isAdmin ? html`<i class="fa-solid fa-lock" style="margin-left:0.25rem;font-size:0.72rem;opacity:0.6;" title="Locked once task is assigned"></i>` : ''}</label>
            <select class="form-select" style="width:100%;" value=${form.crisp_dm_phase}
              disabled=${isDisabled}
              onChange=${e => setForm({...form, crisp_dm_phase: e.target.value})}>
              ${allowedPhases.map(p => html`<option value=${p}>${p}</option>`)}
            </select>
          </div>
        </div>

        <!-- Description -->
        <div class="focus-section">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.4rem;">
            <label class="focus-label" style="margin:0;">Description ${hasAssignee && !isAdmin ? html`<i class="fa-solid fa-lock" style="margin-left:0.25rem;font-size:0.72rem;opacity:0.6;" title="Locked once task is assigned"></i>` : ''}</label>
            <span style="font-size:0.68rem;color:${(form.description||'').length > 450 ? 'var(--accent-pink)' : 'var(--text-secondary)'};">
              ${(form.description||'').length}/500
            </span>
          </div>
          <textarea class="form-input" style="width:100%;min-height:80px;resize:vertical;" maxlength="500"
            disabled=${isDisabled}
            placeholder="What needs to be done? Include context, acceptance criteria, or technical notes..."
            onInput=${e => setForm({...form, description: e.target.value})}>${form.description}</textarea>
        </div>

        <!-- Assignee + Team + Priority -->
        <div class="focus-grid-3 focus-section">
          <div>
            <label class="focus-label">Assignee ${selfOnly ? html`<span style="font-weight:400;opacity:0.6;">(locked to you)</span>` : ''}</label>
            ${selfOnly
              ? html`<input class="form-input" style="width:100%;opacity:0.7;cursor:not-allowed;" value=${currentUser?.username} disabled />`
              : html`
                <select class="form-select" style="width:100%;" value=${form.assignee}
                  disabled=${isDisabled}
                  onChange=${e => setForm({...form, assignee: e.target.value})}>
                  <option value="">— Unassigned (Pool) —</option>
                  ${(assigneeOptions || []).map(u => html`<option value=${u}>${u}</option>`)}
                </select>`
            }
          </div>
          <div>
            <label class="focus-label">Team</label>
            ${isAdmin
              ? html`<select class="form-select" style="width:100%;" value=${form.team}
                  disabled=${isDisabled}
                  onChange=${e => setForm({...form, team: e.target.value, assignee: ''})}>
                  ${getTeams().map(t => html`<option value=${t}>${t}</option>`)}
                </select>`
              : html`<input class="form-input" style="width:100%;opacity:0.6;" value=${currentUser?.team} disabled />`}
          </div>
          <div>
            <label class="focus-label">Priority</label>
            <select class="form-select" style="width:100%;" value=${form.priority}
              disabled=${isDisabled}
              onChange=${e => setForm({...form, priority: e.target.value})}>
              ${PRIORITY_OPTS.map(o => html`<option value=${o.value}>${o.label}</option>`)}
            </select>
          </div>
        </div>

        <!-- Dates + Hours + Status (unified focus-grid-4 for all task types) -->
        <div class="focus-grid-4 focus-section">
          <${DateTimePicker} label="Start Date" type="datetime-local" value=${form.start_date} disabled=${isDisabled} onChange=${val => setForm({...form, start_date: val})} />
          <${DateTimePicker} label="Due Date" type="datetime-local" value=${form.due_date} disabled=${isDisabled} onChange=${val => setForm({...form, due_date: val})} />
          <div>
            <label class="focus-label">Estimated Hours</label>
            <input type="number" class="form-input" style="width:100%;" min="0" step="0.5"
              placeholder="e.g. 8 (optional)" value=${form.estimated_hours}
              disabled=${isDisabled}
              onInput=${e => setForm({...form, estimated_hours: e.target.value})} />
          </div>
          <div>
            <label class="focus-label">Status ${!editingTask ? html`<span style="font-weight:400;opacity:0.6;">(locked for new)</span>` : ''}</label>
            <select class="form-select" style="width:100%;"
              value=${form.status}
              onChange=${e => setForm({...form, status: e.target.value})}
              disabled=${!editingTask || isDisabled}>
              ${TASK_STATUSES.map(s => html`<option value=${s}>${STATUS_META[s].label}</option>`)}
            </select>
          </div>
        </div>
      </form>
    </${FocusModal}>`;
};




/* ─── Phase Submit Modal ────────────────────────────────────── */
/* ─── Phase Submit Modal ────────────────────────────────────── */
export const PhaseSubmitModal = ({ open, onClose, projects, tasks, currentUser, onSaved, preselectedProjectId }) => {
  const isAdmin   = currentUser?.role === 'admin';
  const isLeader  = currentUser?.role === 'leader';
  const teamPhases = getTeamPhases(currentUser?.team) || [];

  // ── State ──────────────────────────────────────────────────────
  const [selProject,   setSelProject]   = useState(preselectedProjectId || '');
  const [selPhase,     setSelPhase]     = useState('');
  const [submitMode,   setSubmitMode]   = useState('progress'); // 'progress' | 'complete' | 'advance'
  const [phasePct,     setPhasePct]     = useState(50);
  const [note,         setNote]         = useState('');
  const [streams,      setStreams]       = useState([]);
  const [isSaving,     setIsSaving]     = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [error,        setError]        = useState(null);

  useEffect(() => {
    if (open) {
      setSelProject(preselectedProjectId || '');
      setSelPhase('');
      setSubmitMode('progress');
      setPhasePct(50);
      setNote('');
      setSuccess(false);
      setError(null);
      setStreams([]);
    }
  }, [open, preselectedProjectId]);

  // Fetch streams whenever project changes
  useEffect(() => {
    if (!selProject) { setStreams([]); return; }
    apiFetch(`/api/projects/${selProject}/streams`)
      .then(r => r.ok ? r.json() : [])
      .then(setStreams)
      .catch(() => setStreams([]));
  }, [selProject]);

  const proj = projects?.find(p => p.id === selProject);
  const phaseTasks = tasks?.filter(t => t.project_id === selProject && t.crisp_dm_phase === selPhase) || [];
  const doneTasks  = phaseTasks.filter(t => t.status === 'done');
  const taskPct    = phaseTasks.length > 0 ? Math.round(doneTasks.length / phaseTasks.length * 100) : null;

  // Phases this user can report on
  const reportablePhases = isAdmin ? getPhases() : teamPhases;
  // Phase advance options (admin only, or leader going forward)
  const advancePhases = isAdmin ? getPhases() : teamPhases.filter(ph => ph !== proj?.phase);

  // Get current stream for selected phase
  const currentStream = streams.find(s => s.phase_name === selPhase && s.team_name === (isAdmin ? s.team_name : currentUser?.team));
  const streamPct     = currentStream?.computed_progress ?? currentStream?.progress ?? 0;
  const streamDone    = currentStream?.status === 'complete';

  const handleSubmit = async () => {
    if (!proj) { setError('Select a project first.'); return; }

    if (submitMode === 'advance') {
      if (!selPhase) { setError('Select a target phase to advance to.'); return; }
      const confirmed = await appConfirm(`Advance "${proj.title}" to phase "${selPhase}"?`, 'Confirm Phase Advance');
      if (!confirmed) return;
      setIsSaving(true); setError(null);
      try {
        const today = new Date().toISOString().split('T')[0];
        const histNote = note.trim() || `Phase "${selPhase}" submitted by ${currentUser.username} (${currentUser.team})`;
        const newHistory = [...(proj.history || []), { date: today, phase: selPhase, status: 'phase_change', note: histNote, actor: currentUser.username }];
        const res = await apiFetch('/api/projects', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...proj, phase: selPhase, progress: 0, history: newHistory })
        });
        if (!res.ok) { const err = await res.json(); setError(err.error || 'Submission failed'); return; }
        logAudit(currentUser, 'PROJECT_PHASE_CHANGED', `${currentUser.username} advanced "${proj.title}" to "${selPhase}"`);
        sendChannelMessage(currentUser.team, '🤖 System', `🔄 Project ${selProject} advanced to "${selPhase}" by @${currentUser.username}`);
        setSuccess(true);
        setTimeout(() => { onSaved?.(); onClose(); }, 1100);
      } finally { setIsSaving(false); }
      return;
    }

    // progress or complete mode — need a phase
    if (!selPhase) { setError('Select a phase to update.'); return; }

    setIsSaving(true); setError(null);
    try {
      // Find or create stream
      let stream = streams.find(s => s.phase_name === selPhase && s.team_name === currentUser?.team);
      if (!stream) {
        const postRes = await apiFetch(`/api/projects/${selProject}/streams`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phase_name: selPhase, team_name: currentUser?.team })
        });
        stream = await postRes.json();
      }

      const payload = submitMode === 'complete'
        ? { status: 'complete', progress: 100 }
        : { progress: phasePct };

      const updateRes = await apiFetch(`/api/projects/${selProject}/streams/${stream.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!updateRes.ok) { const err = await updateRes.json(); setError(err.error || 'Update failed'); return; }

      const actionLabel = submitMode === 'complete' ? 'marked COMPLETE' : `updated to ${phasePct}%`;
      logAudit(currentUser, 'STREAM_PROGRESS_UPDATED', `${currentUser.username} ${actionLabel} stream "${selPhase}" for ${selProject}`);
      if (submitMode === 'complete') {
        sendChannelMessage(currentUser.team, '🤖 System', `✅ Phase "${selPhase}" marked complete for project ${selProject} by @${currentUser.username}`);
      }
      setSuccess(true);
      setTimeout(() => { onSaved?.(); onClose(); }, 1100);
    } finally { setIsSaving(false); }
  };

  const modeTab = (id, label, icon) => html`
    <button style="flex:1;padding:0.5rem;font-size:0.8rem;font-weight:600;border-radius:8px;border:1px solid ${submitMode===id?'var(--accent-purple)':'rgba(255,255,255,0.1)'};background:${submitMode===id?'rgba(139,92,246,0.15)':'transparent'};color:${submitMode===id?'var(--accent-purple)':'var(--text-secondary)'};cursor:pointer;transition:all 0.15s;"
      onClick=${() => { setSubmitMode(id); setSelPhase(''); setError(null); }}>
      <i class="fa-solid ${icon}" style="margin-right:0.3rem;"></i>${label}
    </button>`;

  const footer = html`
    <button class="btn" onClick=${onClose} disabled=${isSaving}>Cancel</button>
    <button class="btn active" style="background:${submitMode==='complete'?'var(--accent-green)':submitMode==='advance'?'linear-gradient(135deg,var(--accent-blue),var(--accent-purple))':'var(--accent-blue)'};"
      onClick=${handleSubmit}
      disabled=${!selProject || isSaving || success}>
      ${isSaving ? html`<i class="fa-solid fa-spinner fa-spin"></i> Saving...`
        : success ? html`<i class="fa-solid fa-check"></i> Done!`
        : submitMode === 'complete' ? html`<i class="fa-solid fa-circle-check"></i> Mark Complete`
        : submitMode === 'advance'  ? html`<i class="fa-solid fa-arrow-right-to-bracket"></i> Advance Phase`
        : html`<i class="fa-solid fa-floppy-disk"></i> Save Progress`}
    </button>`;

  return html`
    <${FocusModal}
      open=${open}
      onClose=${onClose}
      title="Phase Progress Submission"
      subtitle="Update phase completion or advance the project lifecycle"
      icon="fa-chart-gantt"
      accentColor="var(--accent-purple)"
      footer=${footer}>

      ${error   && html`<div class="focus-error"><i class="fa-solid fa-triangle-exclamation"></i>${error}</div>`}
      ${success && html`<div class="focus-success"><i class="fa-solid fa-check-circle" style="margin-right:0.4rem;"></i>Submitted successfully!</div>`}

      <!-- Role context -->
      <div style="margin-bottom:1.25rem;padding:0.65rem 1rem;background:rgba(139,92,246,0.07);border:1px solid rgba(139,92,246,0.2);border-radius:10px;font-size:0.82rem;">
        <i class="fa-solid fa-circle-info" style="color:var(--accent-purple);margin-right:0.4rem;"></i>
        ${isAdmin
          ? 'Admin: full control over all phases and projects.'
          : `Your team (${currentUser?.team}) manages: ${teamPhases.join(' · ') || 'No phases assigned'}`}
      </div>

      <!-- Mode selector -->
      <div style="display:flex;gap:0.5rem;margin-bottom:1.25rem;">
        ${modeTab('progress', 'Update Progress', 'fa-slider')}
        ${modeTab('complete', 'Mark Complete',   'fa-circle-check')}
        ${isAdmin ? modeTab('advance', 'Advance Phase', 'fa-code-branch') : ''}
      </div>

      <!-- Project select -->
      <div class="focus-section">
        <label class="focus-label">Project *</label>
        <select class="form-select" style="width:100%;font-size:0.92rem;" value=${selProject}
          onChange=${e => { setSelProject(e.target.value); setSelPhase(''); setError(null); }}>
          <option value="">— Select a Project —</option>
          ${(projects || []).map(p => html`<option value=${p.id}>${p.id} — ${p.title} · ${p.phase}</option>`)}
        </select>
      </div>

      <!-- Per-phase progress overview (when project selected) -->
      ${proj && reportablePhases.length > 0 && html`
        <div style="margin-bottom:1.25rem;">
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-secondary);margin-bottom:0.6rem;">
            ${isAdmin ? 'All Phase Progress' : 'Your Phase Progress'}
          </div>
          <div style="display:flex;flex-direction:column;gap:0.4rem;">
            ${reportablePhases.map(ph => {
              const phStream = streams.find(s => s.phase_name === ph && (isAdmin || s.team_name === currentUser?.team));
              const pct = phStream?.computed_progress ?? phStream?.progress ?? 0;
              const isDone = phStream?.status === 'complete';
              const isCurrent = proj.phase === ph;
              return html`
                <div style="display:flex;align-items:center;gap:0.6rem;padding:0.45rem 0.6rem;border-radius:8px;background:${isCurrent ? 'rgba(139,92,246,0.08)' : 'rgba(0,0,0,0.15)'};border:1px solid ${isCurrent ? 'rgba(139,92,246,0.25)' : 'transparent'};"
                  onClick=${() => { if (submitMode !== 'advance') { setSelPhase(ph); setError(null); if (phStream) setPhasePct(Math.min(99, pct || 50)); } }}
                  style="cursor:${submitMode !== 'advance' ? 'pointer' : 'default'};display:flex;align-items:center;gap:0.6rem;padding:0.45rem 0.6rem;border-radius:8px;background:${selPhase===ph ? 'rgba(139,92,246,0.12)' : isCurrent ? 'rgba(139,92,246,0.06)' : 'rgba(0,0,0,0.15)'};border:1px solid ${selPhase===ph ? 'rgba(139,92,246,0.4)' : isCurrent ? 'rgba(139,92,246,0.2)' : 'transparent'};">
                  <div style="width:120px;font-size:0.78rem;font-weight:${isCurrent ? '700' : '500'};color:${isCurrent ? 'var(--accent-purple)' : 'var(--text-primary)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${ph}</div>
                  <div style="flex:1;height:5px;background:rgba(255,255,255,0.07);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${pct}%;background:${isDone ? 'var(--accent-green)' : isCurrent ? 'var(--accent-purple)' : 'var(--accent-blue)'};border-radius:3px;transition:width 0.3s;"></div>
                  </div>
                  <div style="font-size:0.75rem;font-weight:600;width:32px;text-align:right;color:${isDone ? 'var(--accent-green)' : 'var(--text-secondary)'};">${pct}%</div>
                  ${isDone ? html`<span style="font-size:0.6rem;color:var(--accent-green);"><i class="fa-solid fa-check-circle"></i></span>` : ''}
                </div>`;
            })}
          </div>
        </div>
      `}

      <!-- Phase select + controls depending on mode -->
      ${submitMode === 'advance' ? html`
        <div class="focus-section">
          <label class="focus-label">Advance to Phase *</label>
          <select class="form-select" style="width:100%;font-size:0.92rem;" value=${selPhase}
            onChange=${e => { setSelPhase(e.target.value); setError(null); }}
            disabled=${!selProject}>
            <option value="">— Select Target Phase —</option>
            ${advancePhases.map(ph => html`<option value=${ph}>${ph}</option>`)}
          </select>
        </div>
      ` : html`
        <div class="focus-section">
          <label class="focus-label">Phase to Update *</label>
          <select class="form-select" style="width:100%;font-size:0.92rem;" value=${selPhase}
            onChange=${e => {
              const ph = e.target.value;
              setSelPhase(ph);
              setError(null);
              const s = streams.find(str => str.phase_name === ph && (isAdmin || str.team_name === currentUser?.team));
              if (s) setPhasePct(Math.min(99, s.computed_progress || s.progress || 50));
            }}
            disabled=${!selProject}>
            <option value="">— Select Phase —</option>
            ${reportablePhases.map(ph => html`<option value=${ph}>${ph}</option>`)}
          </select>
        </div>

        ${submitMode === 'progress' && selPhase && html`
          <div class="focus-section">
            <label class="focus-label">
              Completion Percentage
              ${streamDone ? html`<span style="color:var(--accent-green);margin-left:0.5rem;">(stream already marked complete)</span>` : ''}
            </label>
            <div style="display:flex;align-items:center;gap:1rem;margin-top:0.5rem;">
              <input type="range" min="0" max="99" value=${phasePct}
                style="flex:1;accent-color:var(--accent-purple);"
                onInput=${e => setPhasePct(parseInt(e.target.value))} />
              <div style="width:52px;text-align:center;font-size:1.4rem;font-weight:800;color:var(--accent-purple);">${phasePct}%</div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:0.7rem;color:var(--text-secondary);margin-top:0.25rem;padding:0 0.1rem;">
              <span>0% Not started</span>
              <span>99% Nearly done → use Mark Complete</span>
            </div>
            ${taskPct !== null && html`
              <div style="margin-top:0.6rem;font-size:0.78rem;color:var(--text-secondary);">
                <i class="fa-solid fa-list-check" style="margin-right:0.3rem;color:var(--accent-blue);"></i>
                Task completion: <strong style="color:${taskPct===100?'var(--accent-green)':'var(--accent-orange)'};">${doneTasks.length}/${phaseTasks.length} (${taskPct}%)</strong>
                ${taskPct < phasePct ? html` <span style="color:var(--accent-orange);">⚠ Manual % exceeds task completion</span>` : ''}
              </div>
            `}
          </div>
        `}

        ${submitMode === 'complete' && selPhase && html`
          <div style="padding:0.75rem 1rem;background:rgba(16,185,129,0.07);border:1px solid rgba(16,185,129,0.25);border-radius:10px;font-size:0.85rem;margin-bottom:1.25rem;">
            <i class="fa-solid fa-circle-check" style="color:var(--accent-green);margin-right:0.5rem;"></i>
            This will mark <strong style="color:var(--accent-green);">${selPhase}</strong> as <strong>100% complete</strong> for your team.
            ${phaseTasks.length > 0 && doneTasks.length < phaseTasks.length ? html`
              <div style="margin-top:0.4rem;color:var(--accent-orange);font-size:0.8rem;">
                <i class="fa-solid fa-triangle-exclamation" style="margin-right:0.3rem;"></i>
                ${phaseTasks.length - doneTasks.length} task(s) still open — you can still mark the phase complete.
              </div>` : ''}
          </div>
        `}
      `}

      <!-- Note -->
      <div class="focus-section">
        <label class="focus-label">Status Note <span style="font-weight:400;opacity:0.6;">(optional)</span></label>
        <textarea class="form-input" style="width:100%;min-height:60px;resize:vertical;"
          placeholder="e.g. Data pipelines validated, 3 datasets processed — proceeding to feature engineering."
          onInput=${e => setNote(e.target.value)}>${note}</textarea>
      </div>

    </${FocusModal}>`;
};
