import type { config as shippedConfig } from './config/institution.config'

type InstitutionConfig = typeof shippedConfig

// Fill talk_track.md's placeholders from the institution config (the list is at the top of
// institution.config.ts). The line placeholders go first, since the text they bring in can hold the
// inline placeholders too.
export function fillPlaceholders(md: string, config: InstitutionConfig): string {
  const { content } = config
  let s = md.split('\n').map(line => {
    const t = line.trim()
    if (t === '{intro}') return content.intro
    // {examples:<slide>} sits on its own line. It becomes one "- " line per example, or a blank line.
    if (t.startsWith('{examples:') && t.endsWith('}')) {
      return (content.examples[t.slice('{examples:'.length, -1)] ?? []).map(e => `- ${e}`).join('\n')
    }
    return line
  }).join('\n')
  for (const key of ['pd', 'db', 'md'] as const) {
    s = s.split(`{catalog:${key}}`).join(content.catalog[key] ? `: ${content.catalog[key]}` : '')
  }
  const values: [string, string][] = [
    ['{institution}', config.institution.shortName],
    ['{loginNode}', config.home.loginNode],
    ['{bucket}', config.home.displayBucket],
    ['{controllerConsoleHref}', config.home.controllerConsoleHref],
  ]
  for (const [token, value] of values) s = s.split(token).join(value)
  return s
}
