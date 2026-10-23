import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { ChartColumn, ChartLine, ChartPie, GitBranch, Plus, Trash2, X } from 'lucide-react'
import MarkdownContent from '../MarkdownContent'
import { parseChartSpec } from './chartSpec'

type VisualType = 'bar' | 'line' | 'pie' | 'flow'
type DataRow = { label: string; values: string[] }
const types = [
  { value: 'bar', label: 'chart_editor.bar', icon: ChartColumn },
  { value: 'line', label: 'chart_editor.line', icon: ChartLine },
  { value: 'pie', label: 'chart_editor.pie', icon: ChartPie },
  { value: 'flow', label: 'chart_editor.flow', icon: GitBranch },
] as const

// Keep arbitrary step text inside Mermaid's quoted node label.
const flowLabel = (text: string) => text.replace(/[&"<>\\[\]{}|`#\r\n]/g, char => `#${char.charCodeAt(0)};`)

export default function ChartInsertDialog({ onInsert, onClose }: { onInsert: (markdown: string) => void; onClose: () => void }) {
  const { t } = useTranslation()
  const dialog = useRef<HTMLDialogElement>(null)
  const id = useId()
  const [type, setType] = useState<VisualType>('bar')
  const [title, setTitle] = useState(t('chart_editor.default_title'))
  const [names, setNames] = useState([t('chart_editor.default_passed'), t('chart_editor.default_failed')])
  const [rows, setRows] = useState<DataRow[]>([
    { label: t('chart_editor.default_login'), values: ['12', '0'] },
    { label: t('chart_editor.default_permissions'), values: ['8', '2'] },
    { label: t('chart_editor.default_upload'), values: ['6', '1'] },
  ])
  const [steps, setSteps] = useState([t('chart_editor.default_prepare'), t('chart_editor.default_execute'), t('chart_editor.default_verify'), t('chart_editor.default_submit')])
  const [direction, setDirection] = useState('LR')
  const visibleNames = type === 'pie' ? names.slice(0, 1) : names
  const generated = (() => {
    const heading = title.trim()
    if (!heading) return { error: t('chart_editor.required_title'), markdown: '' }
    if (type === 'flow') {
      if (steps.some(step => !step.trim())) return { error: t('chart_editor.required_steps'), markdown: '' }
      const nodes = steps.map((step, index) => `  n${index}["${flowLabel(step.trim())}"]`).join('\n')
      const edges = steps.slice(1).map((_, index) => `  n${index} --> n${index + 1}`).join('\n')
      return { error: '', markdown: `\n\n### ${heading}\n\n\`\`\`mermaid\nflowchart ${direction}\n${nodes}\n${edges}\n\`\`\`\n\n` }
    }
    const seriesNames = type === 'pie' ? names.slice(0, 1) : names
    if (seriesNames.some(name => !name.trim())) return { error: t('chart_editor.required_series'), markdown: '' }
    if (rows.some(row => !row.label.trim())) return { error: t('chart_editor.required_category'), markdown: '' }
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < seriesNames.length; c++) {
        const raw = rows[r]!.values[c]
        if (!raw?.trim() || !Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > 1e12) return { error: t('chart_editor.invalid_number', { row: r + 1, series: c + 1 }), markdown: '' }
        if (type === 'pie' && Number(raw) < 0) return { error: t('chart_editor.negative_pie', { row: r + 1 }), markdown: '' }
      }
    }
    if (type === 'pie' && rows.every(row => Number(row.values[0]) === 0)) return { error: t('chart_editor.pie_nonzero'), markdown: '' }
    try {
      const spec = parseChartSpec(JSON.stringify({ type, title: heading, labels: rows.map(row => row.label.trim()), series: seriesNames.map((name, index) => ({ name: name.trim(), data: rows.map(row => Number(row.values[index])) })) }))
      return { error: '', markdown: `\n\n\`\`\`chart\n${JSON.stringify(spec, null, 2)}\n\`\`\`\n\n` }
    } catch {
      return { error: t('chart_editor.too_large'), markdown: '' }
    }
  })()

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const element = dialog.current
    if (element?.showModal) element.showModal(); else element?.setAttribute('open', '')
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      if (element?.open && element.close) element.close()
      opener?.focus()
    }
  }, [])

  const changeValue = (row: number, column: number, value: string) => setRows(current => current.map((item, index) => index === row ? { ...item, values: item.values.map((old, c) => c === column ? value : old) } : item))
  const addSeries = () => {
    setNames(current => [...current, t('chart_editor.new_series', { number: current.length + 1 })])
    setRows(current => current.map(row => ({ ...row, values: [...row.values, '0'] })))
  }
  const removeSeries = (column: number) => {
    setNames(current => current.filter((_, index) => index !== column))
    setRows(current => current.map(row => ({ ...row, values: row.values.filter((_, index) => index !== column) })))
  }

  return createPortal(<dialog ref={dialog} className="chart-insert-dialog" aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="chart-insert-header"><div><span className="chart-insert-mark"><ChartColumn size={21}/></span><div><h2 id={`${id}-title`}>{t('chart_editor.insert')}</h2><p>{t('chart_editor.subtitle')}</p></div></div><button type="button" className="test-report-icon-button" aria-label={t('chart_editor.close')} onClick={onClose}><X size={20}/></button></header>
    <form id={`${id}-form`} className="chart-insert-body" onSubmit={event => { event.preventDefault(); event.stopPropagation(); if (!generated.error) onInsert(generated.markdown) }}>
      <div className="chart-insert-fields">
        <fieldset className="chart-insert-types"><legend className="field-label">{t('chart_editor.type')}</legend><div>{types.map(option => <button type="button" key={option.value} aria-pressed={type === option.value} onClick={() => setType(option.value)}><option.icon size={18}/>{t(option.label)}</button>)}</div></fieldset>
        <div><label className="field-label" htmlFor={`${id}-name`}>{t('chart_editor.title')}</label><input id={`${id}-name`} className="input" value={title} maxLength={200} onChange={event => setTitle(event.target.value)} placeholder={t('chart_editor.title_placeholder')}/></div>
        {type === 'flow' ? <section className="chart-insert-data"><div className="chart-insert-data-heading"><h3>{t('chart_editor.steps')}</h3><span>{t('chart_editor.step_limit')}</span></div><label className="chart-insert-direction">{t('chart_editor.direction')}<select className="input" aria-label={t('chart_editor.direction')} value={direction} onChange={event => setDirection(event.target.value)}><option value="LR">{t('chart_editor.left_right')}</option><option value="TB">{t('chart_editor.top_bottom')}</option></select></label><div className="chart-insert-steps">{steps.map((step, index) => <div key={index}><span>{String(index + 1).padStart(2, '0')}</span><input className="input" aria-label={t('chart_editor.step_label', { number: index + 1 })} value={step} maxLength={100} onChange={event => setSteps(current => current.map((old, i) => i === index ? event.target.value : old))}/><button type="button" aria-label={t('chart_editor.remove_step', { number: index + 1 })} disabled={steps.length <= 2} onClick={() => setSteps(current => current.filter((_, i) => i !== index))}><Trash2 size={14}/></button></div>)}</div><button type="button" className="btn btn-outline btn-sm" disabled={steps.length >= 30} onClick={() => setSteps(current => [...current, ''])}><Plus size={13}/>{t('chart_editor.add_step')}</button></section> : <section className="chart-insert-data">
          <div className="chart-insert-data-heading"><h3>{t('chart_editor.data')}</h3><span>{t('chart_editor.data_count', { categories: rows.length, series: visibleNames.length })}</span></div>
          <p className="chart-insert-hint">{type === 'pie' ? t('chart_editor.pie_hint') : t('chart_editor.data_hint')}</p>
          <div className="chart-insert-table-wrap"><table className="chart-insert-table" aria-label={t('chart_editor.data_input')}><thead><tr><th scope="col">{t('chart_editor.category')}</th>{visibleNames.map((name, column) => <th scope="col" key={column}><div><input className="input" aria-label={t('chart_editor.series_label', { number: column + 1 })} value={name} maxLength={100} onChange={event => setNames(current => current.map((old, index) => index === column ? event.target.value : old))}/>{type !== 'pie' && <button type="button" aria-label={t('chart_editor.remove_series', { number: column + 1 })} disabled={names.length <= 1} onClick={() => removeSeries(column)}><X size={12}/></button>}</div></th>)}<th scope="col"><span className="sr-only">{t('chart_editor.actions')}</span></th></tr></thead><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}><td><input className="input" aria-label={t('chart_editor.category_label', { number: rowIndex + 1 })} maxLength={100} value={row.label} onChange={event => setRows(current => current.map((old, index) => index === rowIndex ? { ...old, label: event.target.value } : old))}/></td>{visibleNames.map((_, column) => <td key={column}><input className="input" type="number" step="any" min={type === 'pie' ? 0 : -1e12} max={1e12} aria-label={t('chart_editor.value_label', { row: rowIndex + 1, series: column + 1 })} value={row.values[column]} onChange={event => changeValue(rowIndex, column, event.target.value)}/></td>)}<td><button type="button" aria-label={t('chart_editor.remove_row', { number: rowIndex + 1 })} disabled={rows.length <= 1} onClick={() => setRows(current => current.filter((_, index) => index !== rowIndex))}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>
          <div className="chart-insert-data-actions"><button type="button" className="btn btn-outline btn-sm" disabled={rows.length >= 100} onClick={() => setRows(current => [...current, { label: '', values: names.map(() => '0') }])}><Plus size={13}/>{t('chart_editor.add_category')}</button>{type !== 'pie' && <button type="button" className="btn btn-outline btn-sm" disabled={names.length >= 10} onClick={addSeries}><Plus size={13}/>{t('chart_editor.add_series')}</button>}<span>{t('chart_editor.limit_categories')}{type !== 'pie' && t('chart_editor.limit_series')}</span></div>
        </section>}
        {generated.error && <p className="chart-insert-error" role="alert">{generated.error}</p>}
      </div>
      <aside className="chart-insert-preview"><div className="chart-insert-preview-heading"><span>{t('chart_editor.preview')}</span><small>{t('chart_editor.preview_hint')}</small></div>{generated.error ? <div className="chart-insert-placeholder"><ChartColumn size={36} strokeWidth={1.2}/><p>{t('chart_editor.preview_empty')}</p></div> : <MarkdownContent className="prose prose-sm max-w-none">{generated.markdown}</MarkdownContent>}</aside>
    </form>
    <footer className="chart-insert-footer"><p>{t('chart_editor.footer')}</p><div><button type="button" className="btn btn-outline btn-sm" onClick={onClose}>{t('chart_editor.cancel')}</button><button type="submit" form={`${id}-form`} className="btn btn-primary btn-sm" disabled={!!generated.error}><Plus size={14}/>{t('chart_editor.insert')}</button></div></footer>
  </dialog>, document.body)
}
