// Markdown to HTML for the slide panels. talk_track.md holds the text, scripts/sync-talk-track.mjs copies
// it into App.tsx, and InfoButton renders it here once src/content.ts fills the placeholders.
//
// Supported: paragraphs, "- " bullet lists, fenced code blocks, [links](url), **bold**, *italic*,
// `code`. Code lines ending in "# NEW" or "# CHANGED" get the accent color. Lines starting with ">"
// are presenter notes and don't render.
const UL = '<ul style="margin: 8px 0; padding-left: 18px; list-style-type: none;">'
const LI = 'margin-bottom: 10px; padding-left: 12px; border-left: 2px solid #2a2a2a;'
const LI_LAST = 'margin-bottom: 0; padding-left: 12px; border-left: 2px solid #2a2a2a;'
const PRE = '<pre style="background: #0a0a0a; border: 1px solid #2a2a2a; padding: 12px; margin: 10px 0; overflow-x: auto; font-size: 11px; line-height: 1.45; color: #eee;">'

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

type Block = { kind: 'para'; text: string } | { kind: 'list'; items: string[] } | { kind: 'code'; code: string[] }

// Inline markdown to HTML. Code spans are cut out first so their contents stay literal.
function inline(text: string): string {
  const codes: string[] = []
  let s = text.replace(/`([^`]+)`/g, (_, c: string) => { codes.push(c); return `\u0000${codes.length - 1}\u0000` })
  // A URL may hold balanced parentheses, e.g. cell.com/.../S0092-8674(25)00973-0.
  s = s.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, t: string, u: string) => `<a href="${u}" target="_blank">${t}</a>`)
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<i>$2</i>')
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => `<code>${escapeHtml(codes[Number(i)])}</code>`)
  return s
}

// Split one panel into blocks: paragraph, list, code. Presenter notes are dropped.
function blocks(lines: string[]): Block[] {
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    if (line.startsWith('>')) { while (i < lines.length && lines[i].startsWith('>')) i++; continue }
    if (line.startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      out.push({ kind: 'code', code })
      continue
    }
    if (line.startsWith('- ')) {
      const items: string[] = []
      while (i < lines.length && lines[i].startsWith('- ')) {
        let item = lines[i].slice(2)
        i++
        while (i < lines.length && /^ {2,}\S/.test(lines[i])) item += ' ' + lines[i++].trim()
        items.push(item)
      }
      out.push({ kind: 'list', items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !lines[i].startsWith('- ') && !lines[i].startsWith('```') && !lines[i].startsWith('>')) para.push(lines[i++].trim())
    out.push({ kind: 'para', text: para.join(' ') })
  }
  return out
}

function renderBlock(b: Block): string {
  if (b.kind === 'para') return inline(b.text)
  if (b.kind === 'list') {
    return UL + b.items.map((it, k) => `<li style="${k === b.items.length - 1 ? LI_LAST : LI}">${inline(it)}</li>`).join('') + '</ul>'
  }
  const code = b.code.map(l => {
    const e = escapeHtml(l)
    return /#\s*(NEW|CHANGED)\b/.test(l) ? `<span style="color: var(--accent-term);">${e}</span>` : e
  }).join('\n')
  return `${PRE}<code>${code}</code></pre>`
}

// The panel body is white-space: pre-wrap, so the joins set the spacing: a blank line between
// paragraphs and before a list, a single newline after a list or code block, none before a code block.
export function renderMarkdown(md: string): string {
  const bs = blocks(md.split('\n'))
  let html = ''
  bs.forEach((b, k) => {
    if (k > 0) {
      const prev = bs[k - 1]
      if (b.kind === 'code') html += ''
      else if (prev.kind === 'list' || prev.kind === 'code') html += '\n'
      else html += '\n\n'
    }
    html += renderBlock(b)
  })
  return html
}
