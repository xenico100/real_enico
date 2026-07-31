import { expect, test, type Page } from '@playwright/test';

async function enterNode(page: Page, nickname: string, palette: string) {
  await page.goto('/');
  await page.getByTestId('nickname-input').fill(nickname);
  await page.getByTestId('bio-input').fill(`STATUS / ${nickname}`);
  await page.getByTestId(`palette-${palette}`).click();
  await page.getByTestId('enter-button').click();
  await expect(page.getByTestId('connection-status')).toContainText('ONLINE', { timeout: 10_000 });
  await expect(page.getByTestId('world-canvas')).toBeVisible();
}

async function measureAnimationFps(page: Page, durationMs = 1_200): Promise<number> {
  return page.evaluate(
    (duration) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const startedAt = performance.now();
        const sample = (now: number) => {
          frames += 1;
          if (now - startedAt >= duration) {
            resolve((frames * 1_000) / (now - startedAt));
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
    durationMs,
  );
}

test('two local visitors move, chat, emote, inspect profiles, and reconnect', async ({ browser }, testInfo) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await enterNode(pageA, 'ALPHA', 'crimson');
    await enterNode(pageB, 'BETA', 'oxide');

    await expect(pageA.getByTestId('player-count')).toHaveText('02');
    await expect(pageB.getByTestId('player-count')).toHaveText('02');
    await expect(pageA.getByTestId('player-BETA')).toBeVisible();
    await expect(pageB.getByTestId('player-ALPHA')).toBeVisible();

    await pageA.bringToFront();
    const measuredFps = await measureAnimationFps(pageA);
    const gpuPerformanceRun = process.env.PIXEL_SQUARE_GPU_TEST === '1';
    const minimumFps = gpuPerformanceRun ? 50 : 10;
    console.log(`[PERFORMANCE] ${measuredFps.toFixed(1)} FPS / floor ${minimumFps}`);
    testInfo.annotations.push({
      type: gpuPerformanceRun ? 'gpu-performance' : 'headless-performance',
      description: `${measuredFps.toFixed(1)} FPS`,
    });
    expect(measuredFps).toBeGreaterThanOrEqual(minimumFps);

    const positionBefore = await pageA.locator('.self-chip small').textContent();
    await pageA.keyboard.down('ArrowRight');
    await pageA.waitForTimeout(650);
    await pageA.keyboard.up('ArrowRight');
    await expect.poll(() => pageA.locator('.self-chip small').textContent()).not.toBe(positionBefore);

    await pageA.getByTestId('chat-input').fill('BETA, LOCAL WORLD에 온 걸 환영해.');
    await pageA.getByTestId('send-chat').click();
    await expect(pageB.getByTestId('chat-log')).toContainText('LOCAL WORLD에 온 걸 환영해.');

    await pageA.getByTestId('emote-heart').click();
    await expect(pageB.locator('.world-emote')).toContainText('♥');

    await pageB.getByTestId('player-ALPHA').click();
    await expect(pageB.getByTestId('profile-card')).toContainText('ALPHA');
    await expect(pageB.getByTestId('profile-card')).toContainText('STATUS / ALPHA');

    await pageA.reload();
    await expect(pageA.getByTestId('nickname-input')).toHaveValue('ALPHA');
    await pageA.getByTestId('enter-button').click();
    await expect(pageA.getByTestId('connection-status')).toContainText('ONLINE', { timeout: 10_000 });
    await expect(pageA.getByTestId('player-count')).toHaveText('02');
    await expect(pageB.getByTestId('player-count')).toHaveText('02');

    await pageA.screenshot({ path: testInfo.outputPath('pixel-square-final.png'), fullPage: true });
  } finally {
    await contextA.close();
    await contextB.close();
  }
});
