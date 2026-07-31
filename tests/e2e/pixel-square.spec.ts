import { expect, test, type Page } from '@playwright/test';

const ALPHA_AVATAR = {
  hairStyle: 'wolf',
  hairColor: 'pink',
  eyes: 'sparkle',
  outfit: 'idol',
  outfitColor: 'crimson',
  headAccessory: 'halo',
  faceAccessory: 'tears',
  aura: 'glitch',
} as const;

const BETA_AVATAR = {
  hairStyle: 'hime',
  hairColor: 'blue',
  eyes: 'cross',
  outfit: 'goth',
  outfitColor: 'babyblue',
  headAccessory: 'catears',
  faceAccessory: 'eyepatch',
  aura: 'bats',
} as const;

type AvatarSelections = Readonly<Record<string, string>>;

async function selectAvatarOptions(page: Page, selections: AvatarSelections) {
  for (const [category, optionId] of Object.entries(selections)) {
    await page.getByTestId(`avatar-category-${category}`).click();
    const option = page.getByTestId(`avatar-${category}-${optionId}`);
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
  }
}

async function assertAvatarOptions(page: Page, selections: AvatarSelections) {
  for (const [category, optionId] of Object.entries(selections)) {
    await page.getByTestId(`avatar-category-${category}`).click();
    await expect(page.getByTestId(`avatar-${category}-${optionId}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
}

async function enterNode(
  page: Page,
  nickname: string,
  avatarSelections: AvatarSelections,
) {
  await page.goto('/');
  await expect(page.getByTestId('avatar-preview')).toBeVisible();
  await page.getByTestId('nickname-input').fill(nickname);
  await page.getByTestId('bio-input').fill(`STATUS / ${nickname}`);
  await selectAvatarOptions(page, avatarSelections);
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

test('two local visitors customize, move, chat, emote, inspect profiles, and reconnect', async ({ browser }, testInfo) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    await enterNode(pageA, 'ALPHA', ALPHA_AVATAR);
    await enterNode(pageB, 'BETA', BETA_AVATAR);

    await expect(pageA.getByTestId('player-count')).toHaveText('02');
    await expect(pageB.getByTestId('player-count')).toHaveText('02');
    await expect(pageA.getByTestId('player-BETA')).toBeVisible();
    await expect(pageB.getByTestId('player-ALPHA')).toBeVisible();
    await expect(pageA.getByTestId('player-BETA').locator('.player-signal')).toHaveCSS(
      'background-color',
      'rgb(95, 145, 180)',
    );

    await pageA.getByTestId('player-BETA').click();
    await expect(pageA.getByTestId('profile-avatar-preview')).toBeVisible();
    await expect(pageA.getByTestId('profile-card')).toHaveAttribute('data-avatar-hair', 'hime');
    await expect(pageA.getByTestId('profile-card')).toContainText('HIME CUT / GOTH LOLITA');
    await pageA.locator('.profile-close').click();

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
    await expect(pageB.getByTestId('profile-card')).toContainText('WOLF CUT / BROKEN IDOL');
    await expect(pageB.getByTestId('profile-card')).toHaveAttribute('data-avatar-aura', 'glitch');
    await expect(pageB.getByTestId('profile-avatar-preview')).toBeVisible();

    await pageA.reload();
    await expect(pageA.getByTestId('nickname-input')).toHaveValue('ALPHA');
    await assertAvatarOptions(pageA, ALPHA_AVATAR);
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
