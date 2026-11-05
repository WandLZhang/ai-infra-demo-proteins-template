import { test, expect } from '@playwright/test'

test('models1 with the hero info box open', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.zone-marker-wrap', { state: 'attached', timeout: 15_000 })
  await page.waitForTimeout(1500)

  // Enter submits a real run, or attaches to the run in flight. Then 13 slides to models1, the last.
  const submitted = page.waitForResponse(r => r.url().endsWith('/api/submit'), { timeout: 30_000 })
  await page.keyboard.press('Enter')
  await submitted
  await page.waitForTimeout(800)
  for (let i = 0; i < 13; i++) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(400)
  }
  await expect(page.locator('.info-content-wrap > div').first()).toHaveText('AI Models Only Google Has')

  // Wait for ProteinViewer to render the real PDB
  await page.waitForSelector('.protein-viewer-canvas canvas', { timeout: 15_000 })
  await expect(page.locator('.protein-viewer-ts')).toContainText(/INFERRED/, { timeout: 10_000 })

  // Open the hero info box
  await page.locator('button:has(span.material-icons)').filter({ hasText: 'info_outline' }).click()
  await page.waitForTimeout(700)  // let opacity fade complete
  await expect(page.locator('.info-content-wrap .info-body').first()).toContainText('Science model catalog')

  await page.screenshot({ path: 'test-results/models1-info-open.png', fullPage: false })
})
