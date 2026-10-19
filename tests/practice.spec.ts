import { test, expect } from '@playwright/test';
import { enterPracticeAfterReading, completePractice, mockPracticeVideo } from './reading';

async function home(page: import('@playwright/test').Page, id = 'Ppractice') {
  await page.goto('/');
  await page.getByLabel('直接选择视频', { exact: true }).setInputFiles('tests/fixtures/V001_S01.mp4');
  await page.getByLabel('V001_S01.mp4 原视频起点', { exact: true }).fill('589');
  await page.getByRole('button', { name: '确认导入视频', exact: true }).click();
  await expect(page.getByRole('heading', { name: '确认视频片段信息', exact: true })).toHaveCount(0);
  await expect(page.getByText('已就绪', { exact: true })).toBeVisible();
  await page.getByLabel('参与者编号', { exact: true }).fill(id);
  await page.getByRole('checkbox', { name: '我已阅读并理解四项任务及实验规则' }).check();
  await expect(page.getByLabel('参与者编号', { exact: true })).toHaveValue(id);
}
async function saved(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    // @ts-expect-error Vite browser import.
    return (await import('/src/storage.ts')).readSession();
  });
}
test('练习复用截图编辑删除，最低要求、正式初始化和数据隔离', async ({ page }) => {
  await home(page); await page.clock.install();
  await page.getByRole('button', { name: '开始实验' }).click();
  await enterPracticeAfterReading(page);
  await expect(page.getByText('本阶段仅用于熟悉平台操作，练习结果不纳入正式实验', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '导出实验结果', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('切换片段', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '完成练习', exact: true })).toBeDisabled();
  expect(await saved(page)).toBeUndefined();
  await page.locator('video').evaluate((v: HTMLVideoElement) => v.play());
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0);
  await page.locator('video').evaluate((v: HTMLVideoElement) => v.pause());
  await page.getByLabel('定位秒数', { exact: true }).fill('2');
  await page.getByRole('button', { name: '定位', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => !v.seeking && v.currentTime === 2)).toBe(true);
  await page.getByRole('button', { name: '截取当前画面' }).click();
  await expect(page.locator('dialog[open]')).toContainText('00:00:02.000');
  await page.getByLabel('关联 T1', { exact: true }).check();
  await expect(page.getByRole('button', { name: '保存关键帧', exact: true })).toBeDisabled();
  await page.getByLabel('T1 选择理由', { exact: true }).fill('practice reason');
  await page.getByLabel('关联 T3', { exact: true }).check();
  await page.getByLabel('T3 选择理由', { exact: true }).fill('practice other reason');
  await page.getByRole('button', { name: '保存关键帧', exact: true }).click();
  await expect(page.getByRole('button', { name: '完成练习', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  await page.getByLabel('T1 选择理由', { exact: true }).fill('edited practice reason');
  await page.getByRole('button', { name: '保存关键帧', exact: true }).click();
  await expect(page.getByText('edited practice reason', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '移出 T1', exact: true }).click();
  await page.getByRole('button', { name: 'T3 1 张', exact: true }).click();
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await expect(page.getByRole('button', { name: '完成练习', exact: true })).toBeDisabled();
  expect(await saved(page)).toBeUndefined();
  await completePractice(page);
  expect(await saved(page)).toBeUndefined();
  await page.getByRole('button', { name: '开始正式实验', exact: true }).click();
  await expect(page.locator('.workspace:not(.practice-workspace)')).toBeVisible();
  await expect(page.getByText('0 张独立画面', { exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page))?.participant_id).toBe('Ppractice');
  const formal = await saved(page);
  expect(formal.current).toBe(0); expect(formal.frames).toEqual([]); expect(formal.results).toEqual({});
  expect(formal.config.segments).toHaveLength(1);
  expect(formal.config.segments[0].segment_id).not.toBe('PRACTICE');
  await expect(page.locator('.practice-banner')).toHaveCount(0);
});

test('缺少练习素材不能跳过；同一参与者阅读和练习各完成一次，刷新保留', async ({ page }) => {
  await home(page); await page.clock.install();
  await page.route('**/practice/practice.mp4', route => route.fulfill({ status: 404, body: '' }));
  await page.getByRole('button', { name: '开始实验' }).click();
  await expect(page.locator('dialog.reading-modal[open]')).toContainText('30 秒');
  await page.clock.runFor(30_000);
  await page.getByRole('button', { name: '我已阅读，进入练习', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('尚未配置练习视频');
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始正式实验', exact: true })).toHaveCount(0);
  await page.getByLabel('选择练习视频', { exact: true }).setInputFiles('tests/fixtures/V001_S01.mp4');
  await expect(page.locator('.practice-workspace video')).toHaveJSProperty('videoWidth', 640);
  await page.getByRole('button', { name: '返回实验首页', exact: true }).click();
  await page.getByRole('button', { name: '开始实验' }).click();
  await expect(page.getByRole('alert')).toContainText('尚未配置练习视频');
  await expect(page.locator('dialog.reading-modal[open]')).toHaveCount(0);
  expect(await saved(page)).toBeUndefined();
  // The completed reading persists, while the unfinished practice is still required.
  await page.reload(); await home(page); await mockPracticeVideo(page);
  await page.getByRole('button', { name: '开始实验' }).click();
  await expect(page.locator('.practice-workspace video')).toHaveJSProperty('videoWidth', 640);
  await expect(page.locator('dialog.reading-modal[open]')).toHaveCount(0);
  await completePractice(page);
  expect(await saved(page)).toBeUndefined();
  // Practice acknowledgement is saved on submission, before the formal experiment.
  await page.reload(); await home(page);
  await page.getByRole('button', { name: '开始实验' }).click();
  await expect(page.locator('.workspace:not(.practice-workspace)')).toBeVisible();
  await expect(page.locator('dialog.reading-modal[open]')).toHaveCount(0);
  await expect(page.getByText('0 张独立画面', { exact: true })).toBeVisible();
  await expect.poll(async () => (await saved(page))?.participant_id).toBe('Ppractice');
  await page.reload();
  await page.getByLabel('恢复参与者编号', { exact: true }).fill('Ppractice');
  await page.getByRole('button', { name: '恢复同一会话' }).click();
  await expect(page.locator('.workspace:not(.practice-workspace)')).toBeVisible();
  // Clearing the formal session must not reset this participant's prerequisites.
  await page.evaluate(async () => {
    // @ts-expect-error Vite browser import.
    await (await import('/src/storage.ts')).clearSession();
  });
  await home(page);
  await page.getByRole('button', { name: '开始实验' }).click();
  await expect(page.locator('.workspace:not(.practice-workspace)')).toBeVisible();
  await page.evaluate(async () => {
    // @ts-expect-error Vite browser import.
    await (await import('/src/storage.ts')).clearSession();
  });
  await home(page, 'Pnew');
  await page.getByRole('button', { name: '开始实验' }).click();
  await expect(page.locator('dialog.reading-modal[open]')).toContainText('30 秒');
  await expect(page.getByRole('button', { name: '我已阅读，进入练习', exact: true })).toBeDisabled();
});

test('旧会话必须补做新流程，练习和恢复均保留原片段进度与记录', async ({ page }) => {
  await home(page, 'Plegacy');
  await page.evaluate(async () => {
    // @ts-expect-error Vite browser import.
    const storage = await import('/src/storage.ts');
    const config = await storage.readConfig();
    config.segments.push({ ...config.segments[0], segment_id: 'S002', filename: 'second.mp4' });
    await storage.saveSession({ participant_id: 'Plegacy', session_id: 'legacy-session', config, current: 1, frames: [], results: { S001: { completed: false, segment_completion_reason: '原正式说明', zero: {} } }, nextFrame: 7, exported: false });
  });
  await page.reload();
  const before = await saved(page);
  await page.clock.install();
  await page.getByLabel('恢复参与者编号', { exact: true }).fill('Plegacy');
  await page.getByRole('button', { name: '恢复同一会话' }).click();
  await enterPracticeAfterReading(page);
  expect(await saved(page)).toEqual(before);
  await completePractice(page);
  expect(await saved(page)).toEqual(before);
  await page.getByRole('button', { name: '开始正式实验', exact: true }).click();
  await expect(page.locator('.workspace:not(.practice-workspace)')).toBeVisible();
  expect(await saved(page)).toEqual(before);
  await expect(page.getByLabel('切换片段', { exact: true })).toHaveValue('1');
  await page.reload();
  await page.getByLabel('恢复参与者编号', { exact: true }).fill('Plegacy');
  await page.getByRole('button', { name: '恢复同一会话' }).click();
  await expect(page.locator('.workspace:not(.practice-workspace)')).toBeVisible();
  await expect(page.locator('dialog.reading-modal[open]')).toHaveCount(0);
});
