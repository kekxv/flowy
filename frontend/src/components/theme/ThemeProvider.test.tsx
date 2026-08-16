import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const get = vi.hoisted(() => vi.fn())

vi.mock("../../api/client", () => ({
  default: { get },
}))

import { ThemeProvider } from "./ThemeProvider"

describe("ThemeProvider", () => {
  it("does not request administrator-only system settings during application startup", () => {
    render(<ThemeProvider><div>Flowy</div></ThemeProvider>)

    expect(get).not.toHaveBeenCalled()
  })
})
