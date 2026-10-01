/**
 * Frontend configuration.
 *
 * Vite only exposes variables prefixed with VITE_, and everything here ends up
 * readable in the shipped bundle. That is precisely why no credential ever lives
 * in this file: the browser talks to our own API, and the API talks to AWS.
 */

const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

function trimTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export const config = Object.freeze({
  // Injected by Vite from version.js at the repository root.
  version: __APP_VERSION__,
  apiBaseUrl: trimTrailingSlash(import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL),
  appEnv: import.meta.env.VITE_APP_ENV || import.meta.env.MODE,
  isDev: import.meta.env.DEV,
});

export default config;
