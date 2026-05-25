import { create } from "zustand";
import { getMe, login as loginApi, register as registerApi } from "../api/auth";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;

  login: (username_or_email: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
    display_name?: string
  ) => Promise<void>;
  logout: () => void;
  fetchUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,

  login: async (username_or_email, password) => {
    set({ isLoading: true, error: null });
    try {
      const tokens = await loginApi({ username_or_email, password });
      localStorage.setItem("accessToken", tokens.access_token);
      localStorage.setItem("refreshToken", tokens.refresh_token);
      const user = await getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Login failed";
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  register: async (username, email, password, display_name) => {
    set({ isLoading: true, error: null });
    try {
      await registerApi({ username, email, password, display_name });
      await useAuthStore.getState().login(username, password);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Registration failed";
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.clear();
    set({ user: null, isAuthenticated: false, isLoading: false });
  },

  fetchUser: async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }
    try {
      const user = await getMe();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.clear();
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
