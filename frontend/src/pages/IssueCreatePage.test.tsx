import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { beforeEach, describe, expect, it, vi } from "vitest"

import IssueCreatePage from "./IssueCreatePage"

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }))

vi.mock("../api/client", () => ({
  default: { get: apiMocks.get },
}))

vi.mock("../api/issues", () => ({
  createIssue: vi.fn(),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}))

describe("IssueCreatePage", () => {
  beforeEach(() => {
    apiMocks.get.mockResolvedValue({ data: [] })
  })

  it("previews the description Markdown before creating an issue", async () => {
    render(
      <MemoryRouter>
        <IssueCreatePage />
      </MemoryRouter>,
    )

    await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith("/users"))

    const description = screen.getByPlaceholderText(/## Summary\s+Describe\.\.\./)
    fireEvent.change(description, { target: { value: "# 复现步骤" } })
    fireEvent.click(screen.getByRole("button", { name: "Markdown 预览" }))

    expect(await screen.findByRole("heading", { name: "复现步骤" })).toBeInTheDocument()
  })
})
