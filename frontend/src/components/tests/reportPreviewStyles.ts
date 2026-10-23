import reportDocumentStyles from './reportDocument.css?inline'

export function reportPreviewStyles(paper: 'A4' | 'A5') {
  return `
@page { size:${paper}; margin:${paper === 'A4' ? '17mm 18mm 18mm' : '11mm 12mm 13mm'};
  @bottom-left { content:"FLOWY  /  QUALITY ASSURANCE"; font:6pt Arial; letter-spacing:.08em; color:#84909e; }
  @bottom-right { content:counter(page) " / " counter(pages); font:7pt Arial; color:#748294; }
}
html,body { margin:0; padding:0; background:white; }
${reportDocumentStyles}
`
}
