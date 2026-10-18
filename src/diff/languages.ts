import {Extension} from '@codemirror/state'
import {StreamLanguage} from '@codemirror/language'

// The languages of the CodeMirror editors of the diff browser's merge view
// (and of rvq's <vx-codemirror>), by name.

// Minimal YAML highlighting via a StreamLanguage — there is no @codemirror/lang-yaml
// installed, so this covers the common shapes (comments, keys, strings, scalars)
// without pulling a new dependency. Swap it for @codemirror/lang-yaml here if it
// is ever added.
const yamlLanguage = StreamLanguage.define<{}>({
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match(/#.*/)) return 'comment'
    if (stream.match(/^-\s+/) || stream.match(/^-$/)) return 'punctuation'
    // A mapping key followed by a colon.
    if (stream.match(/^[^\s:#][^:#]*(?=:(\s|$))/)) return 'propertyName'
    if (stream.match(/:(\s|$)/)) return 'punctuation'
    if (stream.match(/"(?:[^"\\]|\\.)*"/)) return 'string'
    if (stream.match(/'(?:[^']|'')*'/)) return 'string'
    if (stream.match(/\b(true|false|null|yes|no|on|off)\b/i)) return 'keyword'
    if (stream.match(/-?\d+(?:\.\d+)?\b/)) return 'number'
    if (stream.match(/[&*!|>]/)) return 'meta'
    stream.next()
    return null
  },
})

// LanguageOptions are the props a language's extensions may depend on: the
// delimiters of a Gad template's code (gadt).
export interface LanguageOptions {
  templateStart: string
  templateEnd: string
}

// gadTemplate is the Gad template (gadt) grammar — literal text with Gad code
// between the delimiters, `{%` / `%}` unless told otherwise (the SEO fields and
// the admin's messages use `{` / `}`) — from @gad-lang/codemirror-gad.
const gadTemplate = async (o: LanguageOptions) => {
  const {gad} = await import('@gad-lang/codemirror-gad')
  return [gad({sourceType: 'template', delimiters: {start: o.templateStart, end: o.templateEnd}})]
}

// Language registry — a name → CodeMirror language extensions map. Adding another
// language is one import plus one entry here (and its `@codemirror/lang-*`
// dependency in package.json). A name with no entry edits as plain text with line
// numbers, still fully usable. The registry is intentionally the single extension
// point the component exposes for new languages.
export const LANGUAGES: Record<string, (o: LanguageOptions) => Promise<Extension[]>> = {
  json: async () => [(await import('@codemirror/lang-json')).json()],
  javascript: async () => [(await import('@codemirror/lang-javascript')).javascript()],
  js: async () => [(await import('@codemirror/lang-javascript')).javascript()],
  jsx: async () => [(await import('@codemirror/lang-javascript')).javascript({jsx: true})],
  typescript: async () => [(await import('@codemirror/lang-javascript')).javascript({typescript: true})],
  ts: async () => [(await import('@codemirror/lang-javascript')).javascript({typescript: true})],
  tsx: async () => [(await import('@codemirror/lang-javascript')).javascript({jsx: true, typescript: true})],
  html: async () => [(await import('@codemirror/lang-html')).html()],
  css: async () => [(await import('@codemirror/lang-css')).css()],
  go: async () => [(await import('@codemirror/lang-go')).go()],
  // Gad, its templates (gadt) and Gadx: @gad-lang/codemirror-gad (highlighting,
  // completion and hover of the builtins).
  gad: async () => [(await import('@gad-lang/codemirror-gad')).gad()],
  gadt: gadTemplate,
  gadx: async () => [(await import('@gad-lang/codemirror-gad')).gadx()],
  md: async () => [(await import('@codemirror/lang-markdown')).markdown()],
  markdown: async () => [(await import('@codemirror/lang-markdown')).markdown()],
  yaml: async () => [yamlLanguage],
  yml: async () => [yamlLanguage],
}

// languageExtensions are the extensions of the language name — Prism's names
// too (markup is html, golang go, gadtemplate gadt) —; none for one unknown
// (plain text).
export async function languageExtensions(
  name: string | undefined,
  o: LanguageOptions = {templateStart: '{%', templateEnd: '%}'},
): Promise<Extension[]> {
  const alias: Record<string, string> = {markup: 'html', golang: 'go', gadtemplate: 'gadt'}
  const key = (name || '').toLowerCase()
  const factory = LANGUAGES[alias[key] || key]
  return factory ? factory(o) : []
}

// languageOf is the language of a file by its name's extension ("" when none
// is known): a file's whose diff says none.
export function languageOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  const byExt: Record<string, string> = {
    htm: 'html', svg: 'html', xml: 'html', vue: 'html', mjs: 'js', cjs: 'js', gadt: 'gadt', tmpl: 'gadt',
  }
  const lang = byExt[ext] || ext
  return lang in LANGUAGES ? lang : ''
}
