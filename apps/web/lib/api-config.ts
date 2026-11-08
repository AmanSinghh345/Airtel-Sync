/**
 * Centralized API configuration for UdyamOne Frontend
 * Defaults to localhost in development, overridden by NEXT_PUBLIC_API_URL in production (e.g. Render backend URL).
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
).replace(/\/$/, '');

export function getApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${cleanPath}`;
}
