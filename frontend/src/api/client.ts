import axios from "axios";

const api = axios.create({ baseURL: "api/v1" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Global refresh lock — prevents concurrent refresh requests
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const refreshToken = localStorage.getItem("refreshToken");
      if (!refreshToken) throw new Error("No refresh token");
      const { data } = await axios.post("api/v1/auth/refresh", {
        refresh_token: refreshToken,
      });
      localStorage.setItem("accessToken", data.access_token);
      localStorage.setItem("refreshToken", data.refresh_token);
      return data.access_token;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const hasAuthTokens = Boolean(
      localStorage.getItem("accessToken") && localStorage.getItem("refreshToken")
    );
    const isAuthRequest = error.config?.url?.startsWith("/auth/");

    if (error.response?.status === 401 && hasAuthTokens && !isAuthRequest && !error.config._retry) {
      error.config._retry = true;
      try {
        const newToken = await refreshAccessToken();
        error.config.headers.Authorization = `Bearer ${newToken}`;
        return api(error.config);
      } catch {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        window.location.href = "./#/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
