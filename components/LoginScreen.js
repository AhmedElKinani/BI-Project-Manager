import { apiFetch } from '../utils/core.js';
import { PHASES, TEAMS } from '../utils/core.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect, useMemo, useRef } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

export const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) { onLogin(await res.json()); }
      else { const err = await res.json(); setError(err.error || 'Login failed'); }
    } catch { setError('Server error. Is the backend running?'); }
  };

  return html`
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;">
      <div style="width:100%;max-width:420px;padding:2rem;">
        <div style="text-align:center;margin-bottom:2rem;">
          <div style="font-size:2.5rem;font-weight:800;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;">BI Project Manager</div>
          <p style="color:var(--text-secondary);margin-top:0.5rem;">Sign in to your dashboard</p>
        </div>
        <div class="info-block">
          ${error && html`<div style="color:var(--accent-orange);margin-bottom:1rem;padding:0.75rem;background:rgba(245,158,11,0.1);border-radius:var(--radius-md);">${error}</div>`}
          <form onSubmit=${handleSubmit} style="display:flex;flex-direction:column;gap:1rem;">
            <input class="form-input" placeholder="Username" value=${username} onInput=${e => setUsername(e.target.value)} required />
            <input class="form-input" type="password" placeholder="Password" value=${password} onInput=${e => setPassword(e.target.value)} required />
            <button type="submit" class="btn active" style="background:var(--accent-blue);color:white;padding:0.75rem;">Sign In</button>
          </form>
        </div>
      </div>
    </div>
  `;
};


