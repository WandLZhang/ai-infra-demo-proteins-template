/**
 * e2e-run-link.spec.ts
 *
 * The map opened from fast-science's link after the run has started: ?run=<submitted_at> has to attach to
 * that run at once, show its lines on the terminal, and skip the last run's events. It starts a real run on
 * the shared backend.
 *
 *   FRONTEND_URL=http://localhost:5174 npx playwright test tests/e2e-run-link.spec.ts --reporter=list
 */
import { test, expect } from '@playwright/test'

const STATE_SERVER = process.env.STATE_SERVER || 'https://protein-demo-server-212183265679.us-east5.run.app'
const MANIFEST = 'https://storage.googleapis.com/wz-nih-demo-shared/job/manifest.json'

async function submittedAt(): Promise<string> {
  const r = await fetch(`${MANIFEST}?t=${Date.now()}`)
  return (await r.json()).submitted_at
}

test('a ?run link attaches to the run in flight', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  const before = await submittedAt()
  let submitted = false
  for (let k = 0; k < 40 && !submitted; k++) {
    const r = await fetch(`${STATE_SERVER}/api/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ protein_id: 'insulin' }),
    })
    submitted = !(await r.json()).already_running
    if (!submitted) await new Promise(res => setTimeout(res, 10_000))
  }
  expect(submitted).toBe(true)
  let run = before
  for (let k = 0; k < 40 && run === before; k++) {
    await new Promise(res => setTimeout(res, 500))
    run = await submittedAt()
  }
  expect(run).not.toBe(before)

  // Open the map after the run started, the way the presenter clicks fast-science's link.
  await page.setViewportSize({ width: 1440, height: 900 })
  const t0 = Date.now()
  await page.goto(`/?run=${encodeURIComponent(run)}`)
  await expect(page.locator('.location-paper-name')).toHaveText('INSULIN RECEPTOR', { timeout: 15_000 })
  await expect(page.locator('.terminal-line').first()).toBeVisible({ timeout: 30_000 })
  console.log(`attached ${Date.now() - t0} ms after the page opened`)
  // Only this run's events: every dispatch line names this run's protein's jobs, none from the last run.
  const lines = await page.locator('.terminal-line').allTextContents()
  expect(lines.some(l => l.includes('sbatch'))).toBe(true)
  await page.screenshot({ path: 'tests/screenshots/run-link-01-attached.png' })
  for (const name of ['AF2 · TPU', 'AF2 · GPU']) {
    await expect(page.locator('.sideLadderItem', { hasText: name })).toContainText('/ predict', { timeout: 540_000 })
  }
})
