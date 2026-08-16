import { beforeEach, describe, expect, it, vi } from "vitest"

const apiRequest = vi.hoisted(() => {
  const request = vi.fn() as ReturnType<typeof vi.fn> & {
    interceptors: {
      request: { use: ReturnType<typeof vi.fn> }
      response: { use: ReturnType<typeof vi.fn> }
    }
  }
  request.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  }
  return request
})

vi.mock("axios", () => ({
  default: {
    create: vi.fn(() => apiRequest),
    post: vi.fn(),
  },
}))

import "./client"

const responseErrorHandler = apiRequest.interceptors.response.use.mock.calls[0]?.[1] as (error: unknown) => Promise<unknown>

describe("API authentication recovery", () => {
  beforeEach(() => {
    localStorage.clear()
    window.location.hash = ""
  })

  it("does not navigate away from login when the anonymous theme settings request returns 401", async () => {
    const error = { response: { status: 401 }, config: { url: "/system/settings", headers: {} } }

    await expect(responseErrorHandler(error)).rejects.toBe(error)

    expect(window.location.hash).toBe("")
  })
})
