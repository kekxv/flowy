import { render } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
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
