/**
 * The single source of truth for the application version.
 *
 * Both tiers read this one file: the backend imports it into `config/index.js` (esbuild
 * inlines it into the Lambda bundle), and the frontend's Vite config injects it as
 * `__APP_VERSION__` at build time. Neither `package.json` carries a version field, so
 * there is nowhere for a second, disagreeing number to live.
 */
export const APP_VERSION = '1.0.0';

export default APP_VERSION;
