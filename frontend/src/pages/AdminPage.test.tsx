import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AdminPage from "./AdminPage";
import { useAuthStore } from "../store/authStore";

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));

vi.mock("../api/client", () => ({ default: apiMocks }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const member = {
  id: "member-id",
  username: "member",
  email: "member@example.com",
  display_name: "Member",
  nickname: "",
  avatar_url: "",
  role: "member",
  is_active: true,
  created_at: "2026-01-01T00:00:00",
};

describe("AdminPage", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: { ...member, id: "admin-id", username: "admin", role: "admin" },
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    apiMocks.get.mockImplementation((url: string) => {
      if (url === "/users") return Promise.resolve({ data: [member] });
      if (url === "/admin/stats") return Promise.resolve({ data: {} });
      return Promise.resolve({ data: {} });
    });
    apiMocks.put.mockResolvedValue({});
  });

  afterEach(() => vi.clearAllMocks());

  it("lets an admin set a selected user's password", async () => {
    render(<AdminPage />);

    await screen.findByText("Member");
    fireEvent.click(screen.getByRole("button", { name: "admin.reset_password" }));
    fireEvent.change(screen.getByLabelText("admin.new_password"), {
      target: { value: "newpass456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "admin.confirm_password_reset" }));

    await waitFor(() =>
      expect(apiMocks.put).toHaveBeenCalledWith("/users/member-id/reset-password", {
        new_password: "newpass456",
      }),
    );
  });
});
