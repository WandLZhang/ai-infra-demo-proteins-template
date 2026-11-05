/**
 * e2e-follow-external-run.spec.ts
 *
 * Live test of following a run started outside the page. The HUD opens with ?follow=1 and sits on home, this
 * test POSTs the state server's /api/submit, and the HUD follows the run with no key press. Checks that the
 * terminal fills, both AlphaFold 2 lanes finish, and the deck reaches the models slide with the predicted
 * structure. It starts a real run on the shared backend.
 *
 *   FRONTEND_URL=https://hpc-protein-demo.web.app \
 *     npx playwright test tests/e2e-follow-external-run.spec.ts --reporter=list
 */
import { test, expect } from '@playwright/test'

const STATE_SERVER = process.env.STATE_SERVER || 'https://protein-demo-server-212183265679.us-east5.run.app'
const PROTEIN = process.env.PROTEIN || 'p53'

test('the HUD follows a run started outside it', async ({ page }) => {
  test.setTimeout(10 * 60_000)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/?follow=1')
  await expect(page.getByText('Waiting for a run from the workstation')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(5000) // the follower takes its baseline
  await page.screenshot({ path: 'tests/screenshots/follow-01-home.png' })

  // Start a run from outside the page, once the backend has finished the last one.
  let submitted = false
  for (let k = 0; k < 40 && !submitted; k++) {
    const r = await fetch(`${STATE_SERVER}/api/submit`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ protein_id: PROTEIN }),
    })
    submitted = !(await r.json()).already_running
    if (!submitted) await page.waitForTimeout(10_000)
  }
  expect(submitted).toBe(true)
  const t0 = Date.now()

  // The page leaves home on its own: the terminal shows the run's lines and the location paper names the protein.
  await expect(page.locator('.terminal-line').first()).toBeVisible({ timeout: 30_000 })
  console.log(`followed the run ${Date.now() - t0} ms after the submit`)
  await expect(page.locator('.location-paper-name')).toHaveText(PROTEIN === 'p53' ? 'P53 DBD' : /./, { timeout: 10_000 })
  await page.screenshot({ path: 'tests/screenshots/follow-02-running.png' })

  // Both AlphaFold 2 lanes finish with a cost per prediction. AF2 on the GPU is the slowest lane.
  for (const name of ['AF2 · TPU', 'AF2 · GPU']) {
    await expect(page.locator('.sideLadderItem', { hasText: name })).toContainText('/ predict', { timeout: 540_000 })
  }
  console.log(`both AlphaFold 2 lanes done ${Date.now() - t0} ms after the submit`)
  await page.screenshot({ path: 'tests/screenshots/follow-03-lanes-done.png' })

  // models1 is 13 slides on from running (SLIDE_ORDER in src/App.tsx).
  for (let k = 0; k < 13; k++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(1500)
  }
  await expect(page.locator('.protein-viewer-canvas')).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: 'tests/screenshots/follow-04-models.png' })
})
