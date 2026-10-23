import mermaid from 'mermaid'
import i18n from '../../i18n'
import type { TFunction } from 'i18next'

mermaid.initialize({
  startOnLoad: false, securityLevel: 'strict', theme: 'neutral',
  suppressErrorRendering: true, maxTextSize: 20000, maxEdges: 300,
  flowchart: { htmlLabels: false },
  secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering', 'flowchart', 'htmlLabels', 'theme', 'themeCSS', 'themeVariables', 'fontFamily'],
})
let counter = 0
export async function renderMermaid(source: string, t: TFunction = i18n.t.bind(i18n)): Promise<string> {
  if (source.length > 20000) throw new Error(t('visuals.flow_too_long'))
  const { svg } = await mermaid.render(`report-diagram-${++counter}`, source)
  return svg
}
