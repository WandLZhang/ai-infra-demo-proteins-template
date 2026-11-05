import { test, expect } from '@playwright/test'

// The deck after home, in SLIDE_ORDER, with each title as the default (Cornell) config fills it from talk_track.md.
const DECK: [string, string][] = [
  ['running', 'Multi-Region Burst'],
  ['catalog', "Cornell's Workloads, Three Shapes"],
  ['pd1', 'Independent GPU Jobs'],
  ['pd2', 'Consumption Models'],
  ['img', 'Independent GPU Jobs: Fractional & Serverless'],
  ['catalog2', 'Data-Anchored Burst: Storage'],
  ['catalog4', 'Data-Anchored Burst: vs AWS & Azure'],
  ['md1', 'Tightly-Coupled Simulation'],
  ['md2', 'H4D + Cloud RDMA (Falcon)'],
  ['md3', 'Long Jobs Route Around Failures'],
  ['tpu1', 'TPUs'],
  ['tpu2', 'Why TPU Economics Are Structural'],
  ['tpu3', 'One PyTorch File, Both Chips'],
  ['models1', 'AI Models Only Google Has'],
]

test('every slide fills its title and text from the config, and models1 shows the structure', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.zone-marker-wrap', { state: 'attached', timeout: 15_000 })
  await page.waitForTimeout(1500)  // let map tiles settle

  const title = page.locator('.info-content-wrap > div').first()
  const body = page.locator('.info-content-wrap .info-body').first()
  await expect(title).toHaveText('Research Computing at Cornell')
  await expect(body).toContainText('Your institution is evaluating')

  // Enter on home submits a real run on the shared backend, or attaches to the run in flight.
  const submitted = page.waitForResponse(r => r.url().endsWith('/api/submit'), { timeout: 30_000 })
  await page.keyboard.press('Enter')
  await submitted
  for (const [i, [phase, expected]] of DECK.entries()) {
    if (i > 0) await page.keyboard.press('ArrowRight')
    await expect(title, phase).toHaveText(expected)
    // A placeholder the config didn't fill would still show its braces.
    expect(await body.innerText(), phase).not.toContain('{')
  }

  const viewer = page.locator('.protein-viewer-wrap')
  await expect(viewer).toBeVisible({ timeout: 5_000 })
  // 3Dmol creates a canvas inside the container.
  await page.waitForSelector('.protein-viewer-canvas canvas', { timeout: 10_000 })
  // The timestamp label appears once the PDB fetch resolves.
  await expect(page.locator('.protein-viewer-ts')).toContainText(/INFERRED \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} EST/, { timeout: 10_000 })
  await page.screenshot({ path: 'test-results/models1.png', fullPage: false })

  // models1 is the last slide, so ArrowRight stays on it.
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(500)
  await expect(title).toHaveText('AI Models Only Google Has')
  await expect(viewer).toBeVisible()

  // Back to tpu3 hides the structure, and forward to models1 shows it again.
  await page.keyboard.press('ArrowLeft')
  await expect(title).toHaveText('One PyTorch File, Both Chips')
  await expect(viewer).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(viewer).toBeVisible()
})
