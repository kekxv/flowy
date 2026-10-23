import type { TFunction } from 'i18next'
import type { TestStatus } from '../../api/tests'
export const getTestLabels = (t: TFunction): Record<TestStatus, string> => ({ submitted: t('tests.status.submitted'), queued: t('tests.status.queued'), testing: t('tests.status.testing'), passed: t('tests.status.passed'), failed: t('tests.status.failed'), cancelled: t('tests.status.cancelled'), rejected: t('tests.status.rejected') })
export const testColors: Record<TestStatus, string> = { submitted: 'chip-amber', queued: 'chip-sky', testing: 'chip-violet', passed: 'chip-emerald', failed: 'chip-red', cancelled: 'chip-gray', rejected: 'chip-gray' }
export function testDate(value?: string, locale = 'zh-CN') { return value ? new Date(value).toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—' }
