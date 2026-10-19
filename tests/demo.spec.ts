import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import JSZip from 'jszip';
import { confirmAfterReading } from './reading';

test('首次访问无需导入，默认演示选帧、刷新恢复、提交和导出', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.locator('.config-name')).toContainText('DEMO_builtin_preview');
  await expect(page.getByText('已就绪', { exact: true })).toHaveCount(1);
  await page.getByLabel('参与者编号', { exact: true }).fill('TeacherDemo');
  await page.getByRole('checkbox', { name: '我已阅读并理解四项任务及实验规则' }).check();
  await page.clock.install();
  await page.getByRole('button', { name: '开始实验' }).click();
  await confirmAfterReading(page);
  await expect(page.getByText('演示模式', { exact: true })).toBeVisible();
  await expect(page.locator('video')).toHaveJSProperty('videoWidth', 1280);
  await page.getByLabel('定位秒数', { exact: true }).fill('3');
  await page.getByRole('button', { name: '定位', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => !v.seeking && Math.abs(v.currentTime - 3) < 0.01)).toBe(true);
  await page.getByRole('button', { name: '截取当前画面' }).click();
  for (const id of ['T1', 'T3']) {
    await page.getByLabel(`关联 ${id}`, { exact: true }).check();
    await page.getByLabel(`${id} 选择理由`, { exact: true }).fill(`教师演示 ${id}`);
  }
  await page.getByRole('button', { name: '保存关键帧', exact: true }).click();
  await expect(page.getByText('已保存到本机', { exact: false })).toBeVisible();
  await page.reload();
  await page.getByLabel('恢复参与者编号', { exact: true }).fill('TeacherDemo');
  await page.getByRole('button', { name: '恢复同一会话', exact: true }).click();
  await expect(page.getByRole('button', { name: '截取当前画面' })).toBeEnabled();
  await expect(page.getByText('1 张独立画面', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '完成当前片段' }).click();
  for (const id of ['T2', 'T4']) await page.getByLabel(`${id} 未选帧原因`, { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('片段完成说明', { exact: true }).fill('仅用于查看操作效果的演示结果。');
  await page.getByRole('button', { name: '确认提交片段', exact: true }).click();
  await expect(page.getByRole('heading', { name: '实验已完成', exact: true })).toBeVisible();
  await expect(page.getByText('演示已完成！当前结果仅用于展示平台操作效果，不作为正式研究数据。', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导出实验结果', exact: true }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载 ZIP', exact: true }).click();
  const download = await pending; const file = info.outputPath('demo.zip'); await download.saveAs(file);
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const all = Object.values(zip.files).filter(file => !file.dir);
  const metadata = JSON.parse(await all.find(file => file.name.endsWith('/metadata.json'))!.async('string'));
  expect(metadata.experiment_id).toBe('DEMO_builtin_preview');
  expect(metadata.completed_segments).toEqual(['DEMO_S01']);
  expect(all.filter(file => file.name.endsWith('.png'))).toHaveLength(1);
  expect(await all.find(file => file.name.endsWith('/selections.csv'))!.async('string')).not.toContain('PRACTICE_ONLY_REASON');
});

test('已有自定义配置和会话不被默认材料覆盖，支持明确切换演示', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('导入配置 JSON', { exact: true }).setInputFiles('public/examples/experiment.json');
  await expect(page.locator('.config-name')).toContainText('2 个片段');
  await page.reload();
  await expect(page.locator('.config-name')).toContainText('2 个片段');
  await expect(page.getByText('已就绪', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '使用内置演示材料', exact: true }).click();
  await expect(page.locator('.config-name')).toContainText('DEMO_builtin_preview');
  await expect(page.getByText('已就绪', { exact: true })).toHaveCount(1);
  await page.getByLabel('导入配置 JSON', { exact: true }).setInputFiles('public/examples/experiment.json');
  await expect(page.locator('.config-name')).toContainText('2 个片段');
  await page.evaluate(async () => {
    // @ts-expect-error Browser Vite module import.
    const storage = await import('/src/storage.ts');
    const config = await storage.readConfig();
    await storage.saveSession({ participant_id: 'Custom', session_id: 'custom-session', config, current: 1, frames: [], results: {}, nextFrame: 1, exported: false });
    await storage.completeParticipantOnboarding('Custom', 'practiced');
  });
  await page.reload();
  await expect(page.getByRole('button', { name: '使用内置演示材料', exact: true })).toHaveCount(0);
  await page.getByLabel('恢复参与者编号', { exact: true }).fill('Custom');
  await page.getByRole('button', { name: '恢复同一会话', exact: true }).click();
  await expect(page.getByLabel('切换片段', { exact: true })).toHaveValue('1');
  await expect(page.getByRole('button', { name: '截取当前画面' })).toBeDisabled();
  await expect(page.getByText('演示模式', { exact: true })).toHaveCount(0);
});
