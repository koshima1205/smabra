import { expect, test } from '@playwright/test';

interface DebugApp {
  scene: { constructor: { name: string }; match?: { frame: number; phase: string; fighters: { damage: number; state: string }[] } } | null;
}

/** 外部の画像ホストに届かない環境でも失敗扱いにしない */
const ignorable = (t: string) => /Failed to load resource|ERR_|net::|favicon/i.test(t);

test('title → select → stage → battle', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !ignorable(m.text())) errors.push(m.text());
  });

  await page.goto('/');
  await expect(page.locator('.logo')).toHaveText('忍乱舞');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/01-title.png' });

  await page.getByRole('button', { name: 'たいせん' }).click();
  await expect(page.getByText('キャラクター選択')).toBeVisible();
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyD');
  await page.keyboard.press('KeyJ');
  await expect(page.locator('.ready')).toBeVisible();
  await page.screenshot({ path: 'test-results/02-select.png' });

  await page.keyboard.press('Enter');
  await expect(page.getByText('ステージ選択')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/03-stage.png' });
  await page.keyboard.press('Space');

  // 開戦を待って少し操作
  await page.waitForTimeout(3200);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(400);
  await page.keyboard.up('KeyD');
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(120);
  }
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/04-battle.png' });

  const state = await page.evaluate(() => {
    const app = (window as unknown as { __ninja: DebugApp }).__ninja;
    const m = app.scene?.match;
    return m ? { frame: m.frame, phase: m.phase, n: m.fighters.length } : null;
  });
  expect(state).not.toBeNull();
  expect(state!.phase).toBe('play');
  expect(state!.frame).toBeGreaterThan(200);
  expect(state!.n).toBe(2);

  // ポーズ
  await page.keyboard.press('Escape');
  await expect(page.getByText('ポーズ')).toBeVisible();
  await page.screenshot({ path: 'test-results/05-pause.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByText('ポーズ')).toHaveCount(0);

  expect(errors).toEqual([]);
});
