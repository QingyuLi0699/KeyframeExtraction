import { expect, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs/promises';

export async function mockPracticeVideo(page: Page) {
  // Test-only synthetic media served at the independent practice resource URL.
  const media = await fs.readFile(path.resolve('tests/fixtures/V001_S01.mp4'));
  await page.route('**/practice/practice.mp4', route => {
    const range = route.request().headers()['range']?.match(/^bytes=(\d*)-(\d*)$/);
    if (!range) return route.fulfill({ body: media, contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes' } });
    const start = range[1] ? Number(range[1]) : Math.max(0, media.length - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), media.length - 1) : media.length - 1;
    return route.fulfill({ status: 206, body: media.subarray(start, end + 1), contentType: 'video/mp4', headers: { 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${start}-${end}/${media.length}` } });
  });
}
export async function enterPracticeAfterReading(page: Page) {
  await mockPracticeVideo(page);
  const dialog = page.locator('dialog.reading-modal[open]');
  await expect(dialog.getByRole('heading', { name: '实验操作流程说明', exact: true })).toBeVisible();
  const start = dialog.getByRole('button', { name: '我已阅读，进入练习', exact: true });
  await expect(start).toBeDisabled();
  await page.clock.runFor(30_000);
  await expect(dialog.getByRole('status')).toHaveText('现在可以进入练习');
  await expect(start).toBeEnabled();
  await start.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.practice-workspace video')).toHaveJSProperty('videoWidth', 640);
}
export async function completePractice(page: Page) {
  await expect(page.getByRole('button', { name: '完成练习', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '截取当前画面' }).click();
  await page.getByLabel('关联 T1', { exact: true }).check();
  await page.getByLabel('T1 选择理由', { exact: true }).fill('PRACTICE_ONLY_REASON');
  await page.getByRole('button', { name: '保存关键帧', exact: true }).click();
  await page.getByRole('button', { name: '完成练习', exact: true }).click();
  await expect(page.getByRole('heading', { name: '练习完成', exact: true })).toBeVisible();
  await expect(page.getByText('您已完成平台操作练习。接下来将进入正式实验，请根据四项信息任务独立完成关键帧选择。', { exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
}
export async function confirmAfterReading(page: Page) {
  await enterPracticeAfterReading(page);
  await completePractice(page);
  await page.getByRole('button', { name: '开始正式实验', exact: true }).click();
  await expect(page.locator('.workspace:not(.practice-workspace)')).toBeVisible();
}
