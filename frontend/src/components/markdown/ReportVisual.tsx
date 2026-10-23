import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { parseChartSpec, type ChartSpec } from './chartSpec'

export default function ReportVisual({ kind, source }: { kind: 'chart' | 'mermaid'; source: string }) {
  const { t, i18n } = useTranslation()
  const key = `${i18n.resolvedLanguage || i18n.language}:${kind}:${source}`
  const [rendered, setRendered] = useState<{ key: string; svg: string; spec?: ChartSpec; error?: string } | null>(null)
  useEffect(() => {
    let active = true
    async function render() {
      try {
        const spec = kind === 'chart' ? parseChartSpec(source, t) : undefined
        const svg = spec ? await (await import('./renderChart')).renderChart(spec) : await (await import('./renderMermaid')).renderMermaid(source, t)
        if (active) setRendered({ key, svg, spec })
      } catch (error) {
        if (active) setRendered({ key, svg: '', error: error instanceof Error ? error.message : t('visuals.syntax_hint') })
      }
    }
    void render()
    return () => { active = false }
  }, [key, kind, source, t])
  const current = rendered?.key === key ? rendered : null
  const title = current?.spec?.title || (kind === 'mermaid' ? t('visuals.flow_title') : t('visuals.default_title'))
  return <figure className="markdown-visual" data-visual-state={!current ? 'loading' : current.error ? 'error' : 'ready'}>
    <figcaption>{title}</figcaption>
    {!current ? <p className="markdown-visual-loading" role="status">{t('visuals.loading')}</p> : current.error ? <div className="markdown-visual-error"><p role="alert">{t('visuals.render_error', { error: current.error })}</p><pre><code>{source}</code></pre></div> : <>
      <div className="markdown-visual-svg" role="img" aria-label={title} dangerouslySetInnerHTML={{ __html: current.svg }}/>
      {current.spec && <div className="markdown-visual-data"><table aria-label={t('visuals.data_label', { title })}><thead><tr><th>{t('visuals.item')}</th>{current.spec.series.map((series, index) => <th key={index}>{series.name}</th>)}</tr></thead><tbody>{current.spec.labels.map((label, row) => <tr key={row}><th scope="row">{label}</th>{current.spec!.series.map((series, col) => <td key={col}>{series.data[row]}</td>)}</tr>)}</tbody></table></div>}
    </>}
  </figure>
}
