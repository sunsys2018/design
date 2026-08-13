const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '')

/**
 * Resolves an API path against the separately deployed production API.
 * During local development the empty base keeps requests relative, allowing
 * Vite's `/api` proxy to forward them to the local Express server.
 */
export function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`
}
