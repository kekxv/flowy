import ts from 'typescript'
import { expect, it } from 'vitest'
import zh from './zh.json'
import en from './en.json'

function flatten(value: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(Object.entries(value).flatMap(([key, text]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof text === 'object' ? Object.entries(flatten(text, path)) : [[path, text]]
  }))
}
const chinese = flatten(zh)
const english = flatten(en)
const variables = (text: string) => [...text.matchAll(/{{\s*([^},\s]+)(?:[^}]*)}}/g)].map(match => match[1]).sort()

it('keeps Chinese and English keys and interpolation variables aligned', () => {
  expect(Object.keys(english).sort()).toEqual(Object.keys(chinese).sort())
  for (const [key, value] of Object.entries(chinese)) {
    expect(english[key]?.trim(), key).toBeTruthy()
    expect(variables(english[key]!), key).toEqual(variables(value))
  }
})

it('defines every literal translation key used by the application in both languages', () => {
  const sources = import.meta.glob<string>('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true })
  const missing: string[] = []
  for (const [path, text] of Object.entries(sources)) {
    if (/\.test\./.test(path)) continue
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true)
    function visit(node: ts.Node) {
      if (ts.isCallExpression(node) && ((ts.isIdentifier(node.expression) && node.expression.text === 't') || (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 't'))) {
        const key = node.arguments[0]
        if (key && (ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key))) {
          for (const [lang, resources] of [['zh', chinese], ['en', english]] as const) {
            if (!(key.text in resources)) missing.push(`${lang}: ${key.text} (${path})`)
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  expect(missing).toEqual([])
})
