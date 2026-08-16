import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { describe, expect, it, vi } from "vitest"

import WikiDetailPage from "./WikiDetailPage"

const wikiMocks = vi.hoisted(() => ({
  addCollaborator: vi.fn(),
  deleteWikiPage: vi.fn(),
  getWikiPage: vi.fn(),
  getWikiUploadLimit: vi.fn(),
  listCollaborators: vi.fn(),
  removeCollaborator: vi.fn(),
  updateWikiPage: vi.fn(),
  uploadWikiFile: vi.fn(),
}))

vi.mock("../api/wiki", () => wikiMocks)
vi.mock("../api/client", () => ({ default: { get: vi.fn() } }))
vi.mock("../store/authStore", () => ({
  useAuthStore: (selector: (state: { user: { id: string; role: string } }) => unknown) =>
    selector({ user: { id: "admin-user", role: "admin" } }),
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}))

describe("WikiDetailPage", () => {
  it("shows edit controls to an admin for a page owned by another user", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true))
    wikiMocks.getWikiPage.mockResolvedValue({
      collaborator_ids: [],
      content: "Private content",
      created_at: "2026-08-05T00:00:00",
      id: "private-page",
      is_public: false,
      owner_display_name: "Owner",
      owner_id: "owner-user",
      owner_name: "owner",
      slug: "private-page",
      tags: "",
      title: "Private page",
      updated_at: "2026-08-05T00:00:00",
      weight: 0,
    })
    wikiMocks.listCollaborators.mockResolvedValue([])
    wikiMocks.getWikiUploadLimit.mockResolvedValue({ limit: 5 * 1024 * 1024, limit_mb: 5 })
    wikiMocks.deleteWikiPage.mockResolvedValue(undefined)

    render(
      <MemoryRouter initialEntries={["/wiki/private-page"]}>
        <Routes>
          <Route path="/wiki/:id" element={<WikiDetailPage />} />
          <Route path="/wiki" element={<p>Wiki list</p>} />
        </Routes>
      </MemoryRouter>,
    )

    const editButton = await screen.findByRole("button", { name: "Edit" })
    expect(editButton).toBeInTheDocument()

    fireEvent.click(await screen.findByRole("button", { name: "Delete page" }))
    await waitFor(() => expect(wikiMocks.deleteWikiPage).toHaveBeenCalledWith("private-page"))
    expect(screen.getByText("Wiki list")).toBeInTheDocument()
  })

  it("does not limit file extensions in either Wiki upload picker", async () => {
    wikiMocks.getWikiPage.mockResolvedValue({
      collaborator_ids: [], content: "", created_at: "2026-08-05T00:00:00", id: "wiki-page",
      is_public: false, owner_display_name: "Owner", owner_id: "admin-user", owner_name: "owner",
      slug: "wiki-page", tags: "", title: "Wiki page", updated_at: "2026-08-05T00:00:00", weight: 0,
    })
    wikiMocks.listCollaborators.mockResolvedValue([])
    wikiMocks.getWikiUploadLimit.mockResolvedValue({ limit: 5 * 1024 * 1024, limit_mb: 5 })

    render(
      <MemoryRouter initialEntries={["/wiki/wiki-page"]}>
        <Routes><Route path="/wiki/:id" element={<WikiDetailPage />} /></Routes>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }))
    for (const picker of document.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
      expect(picker).not.toHaveAttribute("accept")
    }
  })

  it("provides a Markdown summary input while editing", async () => {
    wikiMocks.getWikiPage.mockResolvedValue({
      collaborator_ids: [], content: "", created_at: "2026-08-05T00:00:00", id: "wiki-page",
      is_public: false, owner_display_name: "Owner", owner_id: "admin-user", owner_name: "owner",
      slug: "wiki-page", summary: "**Existing** summary", tags: "", title: "Wiki page", updated_at: "2026-08-05T00:00:00", weight: 0,
    })
    wikiMocks.listCollaborators.mockResolvedValue([])
    wikiMocks.getWikiUploadLimit.mockResolvedValue({ limit: 5 * 1024 * 1024, limit_mb: 5 })

    render(<MemoryRouter initialEntries={["/wiki/wiki-page"]}><Routes><Route path="/wiki/:id" element={<WikiDetailPage />} /></Routes></MemoryRouter>)

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }))
    expect(screen.getByLabelText("Summary (Markdown)")).toHaveValue("**Existing** summary")
  })

  it("deletes an owner page after confirmation and returns to the wiki list", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true))
    wikiMocks.getWikiPage.mockResolvedValue({
      collaborator_ids: [], content: "", created_at: "2026-08-05T00:00:00", id: "wiki-page",
      is_public: false, owner_display_name: "Owner", owner_id: "admin-user", owner_name: "owner",
      slug: "wiki-page", summary: "", tags: "", title: "Wiki page", updated_at: "2026-08-05T00:00:00", weight: 0,
    })
    wikiMocks.listCollaborators.mockResolvedValue([])
    wikiMocks.getWikiUploadLimit.mockResolvedValue({ limit: 5 * 1024 * 1024, limit_mb: 5 })
    wikiMocks.deleteWikiPage.mockResolvedValue(undefined)

    render(
      <MemoryRouter initialEntries={["/wiki/wiki-page"]}>
        <Routes>
          <Route path="/wiki/:id" element={<WikiDetailPage />} />
          <Route path="/wiki" element={<p>Wiki list</p>} />
        </Routes>
      </MemoryRouter>,
    )

    fireEvent.click(await screen.findByRole("button", { name: "Delete page" }))

    await waitFor(() => expect(wikiMocks.deleteWikiPage).toHaveBeenCalledWith("wiki-page"))
    expect(screen.getByText("Wiki list")).toBeInTheDocument()
  })
})
