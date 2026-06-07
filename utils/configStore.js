import { apiFetch } from './core.js';

let _config = { phases: [], phases_obj: [], teams: [], teamPhases: {}, roles: [] };

export const loadConfig = async () => {
  try {
    const res = await apiFetch('/api/config/bootstrap');
    if (res.ok) {
      _config = await res.json();
    }
  } catch {
    // Silent fallback — app uses empty default arrays until next successful load
  }
};

export const getPhases = () => _config.phases || [];
export const getPhasesObj = () => _config.phases_obj || [];
export const getTeams = () => _config.teams || [];
export const getTeamPhases = (teamId) => _config.teamPhases[teamId] || [];
export const getAllTeamPhases = () => _config.teamPhases || {};
export const getRoles = () => _config.roles || [];
export const getUsers = () => _config.users || [];
export const getUsersObj = () => _config.users_obj || [];

