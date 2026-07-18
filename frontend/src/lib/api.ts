import axios from 'axios';

// Create AXIOS instance targeting Nginx/Vite proxy "/api"
export const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Inject JWT Access Token into Auth Headers
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('docmind_access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response Interceptor: Catch 401 Unauthorized errors and perform Token Rotation
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If 401 unauthorized and the request has not been retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Avoid looping refreshes if refresh endpoint itself returns 401
      if (originalRequest.url === '/v1/auth/refresh' || originalRequest.url === '/v1/auth/login') {
        logoutUser();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('docmind_refresh_token');
      if (!refreshToken) {
        logoutUser();
        isRefreshing = false;
        return Promise.reject(error);
      }

      try {
        // Execute refresh endpoint
        const res = await axios.post('/api/v1/auth/refresh', { refreshToken });
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } = res.data.data;

        // Save fresh tokens
        localStorage.setItem('docmind_access_token', newAccessToken);
        localStorage.setItem('docmind_refresh_token', newRefreshToken);

        // Resume requests in queue
        processQueue(null, newAccessToken);
        
        // Retry original failed request
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        isRefreshing = false;
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        logoutUser();
        isRefreshing = false;
        return Promise.reject(refreshErr);
      }
    }

    return Promise.reject(error);
  }
);

// Helper to wipe local session and redirect
export function logoutUser() {
  localStorage.removeItem('docmind_access_token');
  localStorage.removeItem('docmind_refresh_token');
  if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
    window.location.href = '/login';
  }
}
