import axios from 'axios';

// Detect ObliTools iframe/native-app context.
// True when running inside the ObliTools desktop shell (cross-site iframe).
// Chrome blocks session cookies in that context, so we fall back to
// X-Auth-Token header authentication instead.
export const isInObliTools = (() => {
  try { return window !== window.top; } catch { return true; }
})() || !!(window as { __obliview_is_native_app?: boolean }).__obliview_is_native_app;

export const OBLITOOLS_TOKEN_KEY = 'oblitools_auth_token';

const apiClient = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: inject X-Auth-Token when running in ObliTools.
// Session cookies are blocked by Chrome's cross-site policy in that context,
// so the server reads this header via iframeTokenAuth middleware instead.
apiClient.interceptors.request.use((config) => {
  if (isInObliTools) {
    const token = sessionStorage.getItem(OBLITOOLS_TOKEN_KEY);
    if (token) config.headers['X-Auth-Token'] = token;
  }
  return config;
});

// Response interceptor: on 401, clear stale token (ObliTools) or redirect to login (normal).
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      if (isInObliTools) {
        // Don't redirect — just clear the stale token so the next login stores a fresh one.
        sessionStorage.removeItem(OBLITOOLS_TOKEN_KEY);
      } else if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;
