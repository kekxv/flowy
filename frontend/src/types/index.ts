export interface User {
  id: string;
  username: string;
  email: string;
  display_name: string;
  role: "admin" | "member";
  avatar_url: string;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    per_page: number;
    total: number;
  };
}

export interface SingleResponse<T> {
  data: T;
}
