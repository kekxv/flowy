import { fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom"
import { expect, it, vi } from "vitest"

import WikiCreatePage from "./WikiCreatePage"

const wikiMocks = vi.hoisted(() => ({
  createWikiPage: vi.fn(),
  getWikiUploadLimit: vi.fn(),
  uploadWikiFile: vi.fn(),
}))

vi.mock("../api/wiki", () => wikiMocks)
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}))

it("does not limit file extensions in Wiki creation upload pickers", () => {
  wikiMocks.getWikiUploadLimit.mockResolvedValue({ limit: 5 * 1024 * 1024, limit_mb: 5 })
  render(<MemoryRouter><WikiCreatePage /></MemoryRouter>)

  for (const picker of document.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
    expect(picker).not.toHaveAttribute("accept")
  }
})

it("provides a Markdown summary input", () => {
  wikiMocks.getWikiUploadLimit.mockResolvedValue({ limit: 5 * 1024 * 1024, limit_mb: 5 })
  render(<MemoryRouter><WikiCreatePage /></MemoryRouter>)

  expect(screen.getByLabelText("Summary (Markdown)")).toBeInTheDocument()
})

it("returns to the filtered wiki list when canceling creation", () => {
  function WikiListLocation() { return <p>{useLocation().search}</p> }
  wikiMocks.getWikiUploadLimit.mockResolvedValue({ limit: 5 * 1024 * 1024, limit_mb: 5 })
  render(<MemoryRouter initialEntries={[{ pathname: "/wiki/new", state: { from: "/wiki?q=guide&page=2" } }]}><Routes><Route path="/wiki/new" element={<WikiCreatePage />} /><Route path="/wiki" element={<WikiListLocation />} /></Routes></MemoryRouter>)
  fireEvent.click(screen.getByRole("button", { name: "Back" }))
  expect(screen.getByText("?q=guide&page=2")).toBeInTheDocument()
})
