import api from "./client"

export type TestStatus = "submitted" | "queued" | "testing" | "passed" | "failed" | "cancelled" | "rejected"
export interface TestRequest { available_transitions?: TestStatus[]; can_assign?: boolean; can_submit_run?: boolean; id: string; title: string; objective: string; catalog?: string; expected_effect: string; current_behavior: string; issue_id: string | null; issue_title?: string | null; status: TestStatus; rejection_reason: string; reporter: any; tester: any; created_at: string; updated_at: string; attachments: any[]; runs: any[]; history: any[] }
export async function listTests(params: Record<string, string> = {}) { return (await api.get<TestRequest[]>("/tests", { params })).data }
export async function getTest(id: string) { return (await api.get<TestRequest>(`/tests/${id}`)).data }
export async function createTest(data: Partial<TestRequest>) { return (await api.post<TestRequest>("/tests", data)).data }
export async function getTestStats() { return (await api.get("/tests/stats")).data }
export async function assignTest(id: string, tester_id: string) { return (await api.post(`/tests/${id}/assign`, { tester_id })).data }
export async function transitionTest(id: string, status: TestStatus, reason = "") { return (await api.post(`/tests/${id}/transition`, { status, reason })).data }
export async function addTestRun(id: string, data: Record<string, string>) { return (await api.post(`/tests/${id}/runs`, data)).data }
export async function createTestCollection(expires_in_minutes = 1440) { return (await api.post("/test-collections", { expires_in_minutes })).data }

export interface TestCollectionLink { id: string; expires_at: string; used_at: string | null; revoked_at: string | null; created_at: string; active: boolean; url: string | null }
export async function listTestCollections() { return (await api.get<TestCollectionLink[]>("/test-collections")).data }
export async function cancelTestCollection(id: string) { await api.post(`/test-collections/${encodeURIComponent(id)}/cancel`) }
