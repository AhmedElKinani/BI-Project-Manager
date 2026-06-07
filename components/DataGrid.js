/**
 * DataGrid.js — Enterprise Advanced Data Grid
 * Provides sorting, filtering, pagination, and bulk selection.
 */

import { h } from 'https://esm.sh/preact';
import { useState, useMemo } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

const defaultRowClass = () => '';

export const AdvancedDataGrid = ({ 
  data = [], 
  columns = [], 
  keyField = 'id',
  pageSize = 10,
  searchable = true,
  bulkActions = [],
  onRowClick = null,
  rowClass = defaultRowClass
}) => {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc'); // 'asc' or 'desc'
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(new Set());

  // Filtering
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const lowerSearch = search.toLowerCase();
    return data.filter(item => {
      return columns.some(col => {
        if (!col.searchable) return false;
        const val = typeof col.accessor === 'function' ? col.accessor(item) : item[col.accessor];
        return String(val || '').toLowerCase().includes(lowerSearch);
      });
    });
  }, [data, search, columns]);

  // Sorting
  const sortedData = useMemo(() => {
    if (!sortField) return filteredData;
    const col = columns.find(c => c.id === sortField);
    if (!col) return filteredData;

    return [...filteredData].sort((a, b) => {
      const valA = typeof col.accessor === 'function' ? col.accessor(a) : a[col.accessor];
      const valB = typeof col.accessor === 'function' ? col.accessor(b) : b[col.accessor];
      
      if (valA === valB) return 0;
      let cmp = 0;
      if (typeof valA === 'string' && typeof valB === 'string') {
        cmp = valA.localeCompare(valB);
      } else {
        cmp = valA < valB ? -1 : 1;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredData, sortField, sortDir, columns]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, page, pageSize]);

  // Handlers
  const handleSort = (colId) => {
    if (sortField === colId) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortField(null); setSortDir('asc'); }
    } else {
      setSortField(colId);
      setSortDir('asc');
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelected(new Set(paginatedData.map(item => item[keyField])));
    } else {
      setSelected(new Set());
    }
  };

  const handleSelectRow = (e, id) => {
    const next = new Set(selected);
    if (e.target.checked) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  const selectedArray = Array.from(selected);
  const allPaginatedSelected = paginatedData.length > 0 && paginatedData.every(item => selected.has(item[keyField]));

  return html`
    <div style="background:var(--bg-panel);border:1px solid var(--border-color);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;">
      
      <!-- Toolbar -->
      <div style="padding:1rem;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
        <div style="display:flex;align-items:center;gap:1rem;">
          ${searchable && html`
            <div style="position:relative;width:260px;">
              <i class="fa-solid fa-search" style="position:absolute;left:0.8rem;top:50%;transform:translateY(-50%);color:var(--text-secondary);font-size:0.8rem;"></i>
              <input class="form-input" style="width:100%;padding-left:2.2rem;font-size:0.85rem;" 
                placeholder="Search records..." 
                value=${search} onInput=${e => { setSearch(e.target.value); setPage(1); }} />
            </div>
          `}
          <span style="font-size:0.8rem;color:var(--text-secondary);">${sortedData.length} records found</span>
        </div>

        <!-- Bulk Actions -->
        ${bulkActions.length > 0 && selected.size > 0 && html`
          <div style="display:flex;align-items:center;gap:0.5rem;background:rgba(139,92,246,0.1);padding:0.4rem 0.75rem;border-radius:8px;border:1px solid rgba(139,92,246,0.2);">
            <span style="font-size:0.75rem;color:var(--accent-purple);font-weight:600;margin-right:0.5rem;">${selected.size} selected</span>
            ${bulkActions.map(act => html`
              <button class="btn" style="font-size:0.72rem;background:${act.color || 'var(--accent-blue)'};color:white;" 
                onClick=${() => { act.onClick(selectedArray); setSelected(new Set()); }}>
                ${act.icon && html`<i class="fa-solid ${act.icon}" style="margin-right:0.3rem;"></i>`}
                ${act.label}
              </button>
            `)}
          </div>
        `}
      </div>

      <!-- Grid -->
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;text-align:left;">
          <thead>
            <tr style="background:var(--bg-color-secondary);border-bottom:1px solid var(--border-color);">
              ${bulkActions.length > 0 && html`
                <th style="padding:0.75rem 1rem;width:40px;border-right:1px solid var(--border-color);">
                  <input type="checkbox" checked=${allPaginatedSelected} onChange=${handleSelectAll} />
                </th>
              `}
              ${columns.map(col => html`
                <th style="padding:0.75rem 1rem;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);font-weight:700;cursor:${col.sortable !== false ? 'pointer' : 'default'};user-select:none;"
                  onClick=${() => col.sortable !== false && handleSort(col.id)}>
                  <div style="display:flex;align-items:center;gap:0.4rem;">
                    ${col.header}
                    ${col.sortable !== false && html`
                      <span style="color:${sortField === col.id ? 'var(--accent-blue)' : 'var(--border-color)'};">
                        ${sortField === col.id ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    `}
                  </div>
                </th>
              `)}
            </tr>
          </thead>
          <tbody>
            ${paginatedData.length === 0 ? html`
              <tr><td colspan="100%" style="padding:2rem;text-align:center;color:var(--text-secondary);font-style:italic;">No data available</td></tr>
            ` : paginatedData.map(item => html`
              <tr class=${rowClass(item)} style="border-bottom:1px solid var(--border-color);transition:background 0.2s;cursor:${onRowClick ? 'pointer' : 'default'};background:${selected.has(item[keyField]) ? 'rgba(59,130,246,0.05)' : 'transparent'};"
                onMouseEnter=${e => e.currentTarget.style.background = selected.has(item[keyField]) ? 'rgba(59,130,246,0.08)' : 'var(--bg-color-secondary)'}
                onMouseLeave=${e => e.currentTarget.style.background = selected.has(item[keyField]) ? 'rgba(59,130,246,0.05)' : 'transparent'}
                onClick=${(e) => {
                  if (e.target.tagName === 'INPUT' || e.target.closest('button') || e.target.closest('.no-row-click')) return;
                  if (onRowClick) onRowClick(item);
                }}>
                ${bulkActions.length > 0 && html`
                  <td style="padding:0.75rem 1rem;border-right:1px solid var(--border-color);">
                    <input type="checkbox" checked=${selected.has(item[keyField])} onChange=${(e) => handleSelectRow(e, item[keyField])} />
                  </td>
                `}
                ${columns.map(col => html`
                  <td style="padding:0.75rem 1rem;">
                    ${col.render ? col.render(item) : (typeof col.accessor === 'function' ? col.accessor(item) : item[col.accessor])}
                  </td>
                `)}
              </tr>
            `)}
          </tbody>
        </table>
      </div>

      <!-- Pagination -->
      ${totalPages > 1 && html`
        <div style="padding:1rem;border-top:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;background:var(--bg-color-secondary);">
          <div style="font-size:0.8rem;color:var(--text-secondary);">
            Showing ${(page-1)*pageSize + 1} to ${Math.min(page*pageSize, sortedData.length)} of ${sortedData.length}
          </div>
          <div style="display:flex;gap:0.4rem;">
            <button class="btn" disabled=${page === 1} onClick=${() => setPage(page-1)}>Prev</button>
            <div style="display:flex;align-items:center;padding:0 0.5rem;font-size:0.85rem;font-weight:600;">${page} / ${totalPages}</div>
            <button class="btn" disabled=${page === totalPages} onClick=${() => setPage(page+1)}>Next</button>
          </div>
        </div>
      `}
    </div>
  `;
};
