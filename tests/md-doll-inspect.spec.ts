import { test, expect } from '@playwright/test'

test('inspect md russian doll across phases', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('.zone-marker-wrap', { state: 'attached', timeout: 15_000 })
  await page.waitForTimeout(1500)  // wait for map tiles

  // home → running. Enter submits a real run, or attaches to the run in flight.
  const submitted = page.waitForResponse(r => r.url().endsWith('/api/submit'), { timeout: 30_000 })
  await page.keyboard.press('Enter')
  await submitted
  await page.waitForTimeout(800)
  // → catalog → pd1 → pd2 → img → catalog2 → catalog4
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
  }

  // → md1
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2000)  // wait for zoom + doll delay
  await page.screenshot({ path: 'test-results/md1.png', fullPage: false })

  // → md2
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'test-results/md2.png', fullPage: false })

  // → md3, where the whole doll shows
  await page.keyboard.press('Enter')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'test-results/md3.png', fullPage: false })
  await expect(page.locator('.info-content-wrap > div').first()).toHaveText('Long Jobs Route Around Failures')

  // Get bounding boxes
  const outer = await page.locator('.md-doll-outer').boundingBox()
  const middle = await page.locator('.md-doll-middle').boundingBox()
  const inner = await page.locator('.md-doll-inner').boundingBox()
  const storageBoxes = await page.locator('.md-doll-storage').all()
  console.log('outer:', outer)
  console.log('middle:', middle)
  console.log('inner:', inner)
  for (let i = 0; i < storageBoxes.length; i++) {
    console.log(`storage[${i}]:`, await storageBoxes[i].boundingBox())
  }
  // Check overlap with zone marker at us-central1
  const markers = await page.locator('.zone-marker-wrap').all()
  console.log(`zone markers visible: ${markers.length}`)
})
