import type { TFunction } from 'i18next'
import i18n from '../../i18n'

export interface ChartSpec {
  type: 'bar' | 'line' | 'pie'
  title: string
  labels: string[]
  series: { name: string; data: number[] }[]
}

export function parseChartSpec(source: string, t: TFunction = i18n.t.bind(i18n)): ChartSpec {
  if (source.length > 50000) throw new Error(t('visuals.source_too_long'))
  let value
  try { value = JSON.parse(source) } catch { throw new Error(t('visuals.invalid_json')) }
  if (!value || !['bar', 'line', 'pie'].includes(value.type)) throw new Error(t('visuals.invalid_type'))
  const validText = (text: unknown, max: number): text is string => typeof text === 'string' && text.trim().length > 0 && text.length <= max
  if (!Array.isArray(value.labels) || !value.labels.length || value.labels.length > 100 || !value.labels.every((label: unknown) => validText(label, 100))) throw new Error(t('visuals.invalid_labels'))
  if (!Array.isArray(value.series) || !value.series.length || value.series.length > 10 || (value.type === 'pie' && value.series.length !== 1)) throw new Error(t('visuals.invalid_series'))
  const series = value.series.map((series: unknown) => {
    const row = series as { name?: unknown; data?: unknown }
    if (!row || !validText(row.name, 100) || !Array.isArray(row.data) || row.data.length !== value.labels.length || !row.data.every((n: unknown) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e12 && (value.type !== 'pie' || n >= 0))) throw new Error(t('visuals.invalid_values'))
    return { name: row.name, data: row.data as number[] }
  })
  if (value.title !== undefined && !validText(value.title, 200)) throw new Error(t('visuals.invalid_title'))
  return { type: value.type, title: value.title || t('visuals.default_title'), labels: value.labels, series }
}
