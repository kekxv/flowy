import api from "./client";
import type { TokenResponse, User } from "../types";

export async function register(data: {
  username: string;
  email: string;
  password: string;
  display_name?: string;
}): Promise<User> {
  const res = await api.post<User>("/auth/register", data);
  return res.data;
}

export async function login(data: {
  username_or_email: string;
  password: string;
}): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/auth/login", data);
  return res.data;
}

export async function getAuthStatus(): Promise<{ has_users: boolean }> {
  const res = await api.get<{ has_users: boolean }>("/auth/status");
  return res.data;
}

export async function getMe(): Promise<User> {
  const res = await api.get<User>("/auth/me");
  return res.data;
}
