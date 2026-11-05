#!/usr/bin/env node
// Regenerate the slide titles and bodies in src/App.tsx from talk_track.md.
//
//   node scripts/sync-talk-track.mjs          # rewrite App.tsx
//   node scripts/sync-talk-track.mjs --check  # exit 1 if App.tsx is out of date
//
// talk_track.md is the run of show and the source. Each slide's panel is a collapsed block in it:
//   <details><summary>(i) panel: Title</summary>
//   <!-- slide: `phase` -->            or, for one body shared by several phases,  `dispatching` / `running`
//
//   ...panel text...
//
//   </details>
// Everything between the marker and </details> is the body, minus presenter notes (lines starting
// with ">"). The rest of the run of show (the steps and the lines to say) belongs to no slide.
//
// App.tsx keeps each title and body as markdown with its {placeholders}. When a slide shows, InfoButton
// fills them from src/config/institution.config.ts and renders the markdown with src/markdown.ts, so a
// fork that only edits the config never reruns this script.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const trackPath = join(root, 'talk_track.md')
const appPath = join(root, 'src', 'App.tsx')

// A panel's markdown: presenter notes outside code fences dropped, blank lines trimmed at both ends.
function panelMarkdown(lines) {
  const kept = []
  let inFence = false
  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence
    if (!inFence && line.startsWith('>')) continue
    kept.push(line)
  }
  return kept.join('\n').trim()
}

const jsString = s => "'" + s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'"

function parseTrack(md) {
  const slides = []
  // CRLF would leave a raw \r inside the generated JS strings and break App.tsx.
  const lines = md.replace(/\r\n?/g, '\n').split('\n')
  let cur = null
  let inFence = false
  let summary = null  // the title of a <details> block whose slide marker hasn't been read yet
  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence
    if (cur) {
      if (!inFence && line.trim() === '</details>') { cur = null; continue }
      cur.lines.push(line)
      continue
    }
    if (inFence) continue
    const d = line.match(/^<details><summary>(.+?)<\/summary>\s*$/)
    if (d) { summary = d[1].replace(/^\(i\) panel:\s*/, ''); continue }
    if (summary !== null && line.trim()) {
      const m = line.match(/^<!--\s*slide:\s*(.+?)\s*-->\s*$/)
      if (m) {
        const phases = [...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1])
        if (!phases.length) throw new Error(`No phase in the slide marker of "${summary}"`)
        cur = { title: summary, phases, lines: [] }
        slides.push(cur)
      }
      summary = null
    }
  }
  if (cur) throw new Error(`The panel "${cur.title}" has no </details>`)
  return slides
}

function generate(slides) {
  const ind = ' '.repeat(10)
  const titleLines = []
  const sectionLines = []
  for (const s of slides) {
    for (const p of s.phases) titleLines.push(`${ind}phase === '${p}' ? ${jsString(s.title)} :`)
    const cond = s.phases.map(p => `phase === '${p}'`).join(' || ')
    sectionLines.push(`${ind}${cond} ? [`)
    sectionLines.push(`${ind}  { body: ${jsString(panelMarkdown(s.lines))} },`)
    sectionLines.push(`${ind}] :`)
  }
  return [
    '        title={',
    ...titleLines,
    `${ind}'Results'`,
    '        }',
    '        sections={',
    ...sectionLines,
    `${ind}[`,
    `${ind}  { body: 'Inference complete — results content TBD.' },`,
    `${ind}]`,
    '        }',
  ].join('\n')
}

const slides = parseTrack(readFileSync(trackPath, 'utf8'))
const app = readFileSync(appPath, 'utf8')
const start = app.indexOf('        title={')
const endMarker = "{ body: 'Inference complete — results content TBD.' },"
const endAt = app.indexOf(endMarker, start)
if (start < 0 || endAt < 0) throw new Error('Could not find the InfoButton title/sections block in App.tsx')
const close = app.indexOf('        }', app.indexOf(`${' '.repeat(10)}]`, endAt))
// If App.tsx was reformatted and the closing lines moved, a bad boundary here would duplicate most
// of the file. Stop instead.
if (close < endAt || close - endAt > 200) throw new Error('Unexpected layout after the sections block in App.tsx; not writing')
const next = app.slice(0, start) + generate(slides) + app.slice(close + '        }'.length)

if (process.argv.includes('--check')) {
  if (next !== app) { console.error('App.tsx is out of date with talk_track.md. Run: node scripts/sync-talk-track.mjs'); process.exit(1) }
  console.log(`App.tsx matches talk_track.md (${slides.length} slides).`)
} else {
  writeFileSync(appPath, next)
  console.log(`Wrote ${slides.length} slides into src/App.tsx: ${slides.map(s => s.phases.join('/')).join(', ')}`)
}
