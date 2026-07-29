import { describe, expect, it } from "vitest"

import {
  buildIntranetSourcePayload,
  formatFileSize,
  type IntranetSourceForm,
} from "./intranetSource"

const baseForm: IntranetSourceForm = {
  name: "Protected NAS",
  url: "http://10.20.0.8/files/",
  source_type: "nginx",
  file_ttl_seconds: 3600,
  use_basic_auth: false,
  auth_username: "",
  auth_password: "",
}

describe("formatFileSize", () => {
  it("formats byte values with compact binary units", () => {
    expect(formatFileSize(0)).toBe("0 B")
    expect(formatFileSize(1024)).toBe("1 KB")
    expect(formatFileSize(1536)).toBe("1.5 KB")
    expect(formatFileSize(1048576)).toBe("1 MB")
  })

  it("labels missing sizes as unknown", () => {
    expect(formatFileSize(null)).toBe("未知")
    expect(formatFileSize(undefined)).toBe("未知")
  })
})

describe("buildIntranetSourcePayload", () => {
  it("includes credentials when Basic Auth is enabled", () => {
    expect(
      buildIntranetSourcePayload(
        {
          ...baseForm,
          use_basic_auth: true,
          auth_username: "reader",
          auth_password: "source-secret",
        },
        false,
      ),
    ).toEqual({
      name: "Protected NAS",
      url: "http://10.20.0.8/files/",
      source_type: "nginx",
      file_ttl_seconds: 3600,
      auth_username: "reader",
      auth_password: "source-secret",
    })
  })

  it("omits an empty edit password so the stored password is preserved", () => {
    const payload = buildIntranetSourcePayload(
      {
        ...baseForm,
        use_basic_auth: true,
        auth_username: "new-reader",
        auth_password: "",
      },
      true,
    )

    expect(payload).toMatchObject({ auth_username: "new-reader" })
    expect(payload).not.toHaveProperty("auth_password")
    expect(payload).not.toHaveProperty("clear_auth")
  })

  it("clears existing credentials when Basic Auth is disabled", () => {
    expect(buildIntranetSourcePayload(baseForm, true)).toMatchObject({ clear_auth: true })
    expect(buildIntranetSourcePayload(baseForm, false)).not.toHaveProperty("clear_auth")
  })
})
