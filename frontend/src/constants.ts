export const ALL_ROLES = [
  "project_lead",
  "backend_dev",
  "frontend_dev",
  "tester",
  "ui_designer",
  "devops",
  "clerk",
  "member",
] as const;

export type Role = typeof ALL_ROLES[number];

export const STAT = [
  "open",
  "in_progress",
  "resolved",
  "closed",
  "cancelled",
  "proposed",
  "accepted",
  "rejected",
] as const;

export const PRIS = [
  "critical",
  "high",
  "medium",
  "low",
  "trivial",
] as const;
