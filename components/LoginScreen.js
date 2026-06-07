import { apiFetch } from '../utils/core.js';

import { h } from 'https://esm.sh/preact';
import { useState, useEffect } from 'https://esm.sh/preact/hooks';
import htm from 'https://esm.sh/htm';
export const html = htm.bind(h);

export const LoginScreen = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [appName, setAppName] = useState('BI Project Manager');

  useEffect(() => {
    apiFetch('/api/config/app-name')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data && data.app_name) {
          setAppName(data.app_name);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) { onLogin(await res.json()); }
      else { const err = await res.json(); setError(err.error || 'Login failed'); }
    } catch { setError('Server error. Is the backend running?'); }
    finally { setIsLoading(false); }
  };

  return html`
    <div class="login-page-wrapper">
      <div class="login-card">
        <div style="text-align:center;margin-bottom:2rem;">
          <div style="font-size:2.5rem;font-weight:800;background:linear-gradient(135deg,var(--accent-blue),var(--accent-purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${appName}</div>
          <p style="color:var(--text-secondary);margin-top:0.5rem;">Sign in to your dashboard</p>
        </div>
        ${error && html`<div style="color:var(--accent-orange);margin-bottom:1rem;padding:0.75rem;background:rgba(245,158,11,0.1);border-radius:var(--radius-md);">${error}</div>`}
        <form onSubmit=${handleSubmit} style="display:flex;flex-direction:column;gap:1rem;">
          <input class="form-input" placeholder="Username" value=${username} onInput=${e => setUsername(e.target.value)} required disabled=${isLoading} />
          <input class="form-input" type="password" placeholder="Password" value=${password} onInput=${e => setPassword(e.target.value)} required disabled=${isLoading} />
          <button type="submit" class="btn active" style="background:var(--accent-blue);color:white;padding:0.75rem;" disabled=${isLoading}>
            ${isLoading
              ? html`<i class="fa-solid fa-spinner fa-spin" style="margin-right:0.5rem;"></i>Signing in…`
              : 'Sign In'
            }
          </button>
        </form>
      </div>
    </div>
  `;
};


