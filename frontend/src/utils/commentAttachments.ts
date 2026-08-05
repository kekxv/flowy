export interface CommentAttachment {
  storageName: string
  displayName: string
}

const ATTACHMENT_LINK = /!?\[([^\]]*)\]\(attachment:([0-9A-Za-z._-]+)\)/g

export function extractCommentAttachments(markdown: string): CommentAttachment[] {
  const attachments: CommentAttachment[] = []
  const seen = new Set<string>()

  for (const match of markdown.matchAll(ATTACHMENT_LINK)) {
    const displayName = match[1]?.trim()
    const storageName = match[2]
    if (!storageName || seen.has(storageName)) continue
    seen.add(storageName)
    attachments.push({
      storageName,
      displayName: displayName || storageName,
    })
  }

  return attachments
}
