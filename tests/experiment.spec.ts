import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import path from 'node:path';
const fixture = path.resolve('tests/fixtures/V001_S01.mp4');
const config = path.resolve('public/examples/experiment.json');
async function materials(page: Page) {
  await page.getByLabel('导入配置 JSON', { exact: true }).setInputFiles(config);
  await page.getByLabel('关联视频文件', { exact: true }).setInputFiles([{ name: 'V001_S01.mp4', mimeType: 'video/mp4', buffer: await fs.readFile(fixture) }, { name: 'V001_S02.mp4', mimeType: 'video/mp4', buffer: await fs.readFile(fixture) }]);
  await expect(page.getByText('已就绪', { exact: true })).toHaveCount(2);
}
async function capture(page: Page, seconds: number) {
  await page.getByLabel('定位秒数', { exact: true }).fill(String(seconds));
  await page.getByRole('button', { name: '定位', exact: true }).click();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement, target: number) => !v.seeking && Math.abs(v.currentTime - target) < 0.01, seconds)).toBe(true);
  await page.getByRole('button', { name: '截取当前画面' }).click();
}
async function finish(page: Page, empty: string[]) {
  await page.getByRole('button', { name: '完成当前片段' }).click();
  for (const task of empty) await page.getByLabel(`${task} 未选帧原因`, { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('片段完成说明', { exact: true }).fill('已检查该片段，所选画面足以表达任务相关信息；无相关画面的任务保留零结果。');
  await page.getByRole('button', { name: '确认提交片段', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
}
test('真实 MP4 → 双时间戳 → 多任务 → 恢复 → 两片段提交 → ZIP → 确认清除', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await materials(page);
  await page.getByLabel('参与者编号', { exact: true }).fill('P01');
  await page.getByText('我已阅读并理解四项任务及实验规则').click();
  await page.getByRole('button', { name: '开始实验' }).click();
  await expect(page.locator('video')).toHaveJSProperty('videoWidth', 640);
  await page.locator('video').evaluate((v: HTMLVideoElement) => v.play());
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(0.1);
  await page.locator('video').evaluate((v: HTMLVideoElement) => v.pause());
  await capture(page, 12.5);
  let dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('00:00:12.500'); await expect(dialog).toContainText('00:10:01.500');
  // Pixel comparison against the actual decoded video canvas, independent of exported metadata.
  const imageMatches = await page.evaluate(async () => {
    const video = document.querySelector('video')!;
    const img = document.querySelector('dialog[open] img') as HTMLImageElement; await img.decode();
    const a = document.createElement('canvas'), b = document.createElement('canvas'); a.width = b.width = video.videoWidth; a.height = b.height = video.videoHeight;
    a.getContext('2d')!.drawImage(video, 0, 0); b.getContext('2d')!.drawImage(img, 0, 0);
    const x = a.getContext('2d')!.getImageData(0,0,a.width,a.height).data, y = b.getContext('2d')!.getImageData(0,0,b.width,b.height).data;
    return x.every((v,i) => v === y[i]);
  }); expect(imageMatches).toBe(true);
  await page.getByLabel('关联 T1', { exact: true }).check(); await page.getByLabel('T1 选择理由', { exact: true }).fill('主要活动，含逗号及"引号"\n第二行中文');
  await page.getByLabel('关联 T3', { exact: true }).check(); await page.getByLabel('T3 选择理由', { exact: true }).fill('文化特色');
  await page.getByRole('button', { name: '保存关键帧', exact: true }).click();
  await expect(page.getByText('1 张独立画面', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'T3 1 张', exact: true }).click();
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(12.5);
  await expect(page.getByText('文化特色', { exact: true })).toBeVisible();
  // Duplicate detection offers reuse and still allows a new image.
  await capture(page, 12.5); await expect(page.getByRole('button', { name: '仍然新增' })).toBeVisible();
  await page.getByRole('button', { name: '使用已有关键帧' }).click();
  await page.getByLabel('T3 选择理由', { exact: true }).fill('修改后的文化特色理由');
  await page.getByRole('button', { name: '保存关键帧', exact: true }).click();
  await expect(page.getByText('1 张独立画面', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'T1 1 张', exact: true }).click();
  await page.getByRole('button', { name: '移出 T1', exact: true }).click();
  await page.getByRole('button', { name: 'T3 1 张', exact: true }).click();
  await expect(page.getByText('修改后的文化特色理由', { exact: true })).toBeVisible();
  // Add multiple freely chosen frames, no fixed count requirement.
  for (const seconds of [1, 2, 3, 4, 5, 6]) {
    await capture(page, seconds); await page.getByLabel('关联 T1', { exact: true }).check();
    await page.getByLabel('T1 选择理由', { exact: true }).fill(`自主选择的画面 ${seconds}，含"引号"\n中文第二行`);
    if (seconds === 6) { await page.getByLabel('关联 T3', { exact: true }).check(); await page.getByLabel('T3 选择理由', { exact: true }).fill('同一图片的另一项独立理由'); }
    await page.getByRole('button', { name: '保存关键帧', exact: true }).click();
  }
  await expect(page.getByText('7 张独立画面', { exact: true })).toBeVisible();
  await capture(page, 8); await page.getByRole('button', { name: '取消编辑', exact: true }).click();
  await expect(page.getByText('7 张独立画面', { exact: true })).toBeVisible();
  await expect(page.getByText('已保存到本机', { exact: false })).toBeVisible();
  const originalSessionId = await page.evaluate(async () => {
    // @ts-expect-error Vite browser import.
    return (await (await import('/src/storage.ts')).readSession()).session_id;
  });
  await page.reload();
  await expect(page.getByText('恢复已有实验', { exact: true })).toBeVisible();
  await page.getByLabel('恢复参与者编号', { exact: true }).fill('P02'); await expect(page.getByRole('button', { name: '恢复同一会话' })).toBeDisabled();
  await page.getByLabel('恢复参与者编号', { exact: true }).fill('P01'); await page.getByRole('button', { name: '恢复同一会话' }).click();
  await expect(page.getByText('7 张独立画面', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '截取当前画面' })).toBeDisabled();
  await page.getByLabel('重新关联视频', { exact: true }).setInputFiles([{ name: 'V001_S01.mp4', mimeType: 'video/mp4', buffer: await fs.readFile(fixture) }, { name: 'V001_S02.mp4', mimeType: 'video/mp4', buffer: await fs.readFile(fixture) }]);
  await expect(page.getByRole('button', { name: '完成当前片段' })).toBeEnabled();
  await finish(page, ['T2', 'T4']);
  await expect(page.getByRole('heading', { name: '片段二', exact: true })).toBeVisible();
  await expect(page.getByText('0 张独立画面', { exact: true })).toBeVisible();
  await finish(page, ['T1','T2','T3','T4']);
  // Revisiting does not invalidate the completed segment unless changed.
  await page.getByLabel('切换片段', { exact: true }).selectOption('0');
  await expect(page.getByText('7 张独立画面', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '截取当前画面' })).toBeEnabled();
  await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: 'docs/workspace-1366.png', fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: 'docs/workspace-1920.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '导出实验结果', exact: true }).click();
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '下载 ZIP', exact: true }).click();
  const download = await downloadEvent; await download.saveAs('examples/sample-export.zip');
  const zip = await JSZip.loadAsync(await fs.readFile('examples/sample-export.zip'));
  const allFiles = Object.values(zip.files).filter(f => !f.dir); const read = async (name: string) => allFiles.find(f => f.name.endsWith('/' + name))!.async('string');
  const metadata = JSON.parse(await read('metadata.json'));
  expect(metadata.session_id).toBe(originalSessionId);
  expect(metadata.participant_id).toBe('P01'); expect(metadata.completed_segments).toEqual(['V001_S01','V001_S02']);
  expect(allFiles.filter(f => f.name.endsWith('.png'))).toHaveLength(7);
  const frames = await read('frames.csv'); expect(frames.charCodeAt(0)).toBe(0xfeff); expect(frames).toContain('"12.5","601.5"');
  const selections = await read('selections.csv'); expect(selections).toContain('修改后的文化特色理由'); expect(selections).not.toContain('主要活动'); expect(selections).toContain('""引号""');
  expect(selections.split('"P01_V001_S01_F0007"').length - 1).toBe(2);
  const taskResults = await read('task_results.csv'); expect(taskResults.trim().split('\r\n')).toHaveLength(9); expect(taskResults).toContain('"T2","0","当前片段没有呈现与该任务相关的内容。"');
  expect((await read('segment_results.csv')).trim().split('\r\n')).toHaveLength(3);
  await page.getByRole('button', { name: '已核对下载文件，清除会话', exact: true }).click();
  await page.getByRole('button', { name: '保留数据', exact: true }).click();
  await expect(page.getByText('7 张独立画面', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '核对并清除会话', exact: true }).click();
  await page.getByRole('button', { name: '确认导出完整并清除', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始实验' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('配置校验、错误媒体、导出完整性与多任务唯一图片', async ({ page }) => {
  await page.goto('/');
  const report = await page.evaluate(async () => {
    // @ts-expect-error Browser imports source via Vite for independent boundary tests.
    const m = await import('/src/model.ts');
    // @ts-expect-error Browser imports source via Vite.
    const ex = await import('/src/export.ts');
    const seg = { video_id: 'V1', segment_id: 'S1', filename: 'a.mp4', start_time_sec:589, end_time_sec:605, duration_sec:16 };
    const invalid = [ {experiment_id:'x',segments:[seg,seg]}, {experiment_id:'x',segments:[{...seg,start_time_sec:606}]}, {experiment_id:'x',segments:[{...seg,duration_sec:5}]}, {experiment_id:'x',segments:[{...seg,segment_id:'../bad'}]} ];
    const rejected = invalid.map(c => {try { m.validateConfig(c); return false; } catch { return true; }});
    const canvas = document.createElement('canvas'); canvas.width=10; canvas.height=10;
    const image = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!),'image/png'));
    const session = { participant_id:'P1',session_id:'s1',config:{experiment_id:'x',segments:[seg]},current:0,nextFrame:2,exported:false,frames:[{frame_id:'P1_S1_F0001',segment_id:'S1',relative_time_sec:12.5,absolute_time_sec:601.5,image,task_assignments:[{task_id:'T1',selection_reason:'理由一'},{task_id:'T3',selection_reason:'理由三'}]}],results:{S1:{completed:true,segment_completion_reason:'完成说明',zero:{T2:{reason:m.ZERO_REASONS[0],note:''},T4:{reason:m.ZERO_REASONS[1],note:''}}}}};
    const exported = await ex.createExport(session);
    const before = JSON.stringify(session);
    await ex.createExport(session);
    const unchanged = before === JSON.stringify(session);
    const failures=[];
    for (const change of [(x: any) => x.frames[0].absolute_time_sec=12.5,(x: any) => x.frames[0].image=new Blob([]),(x: any) => x.frames[0].task_assignments[0].task_id='T9',(x: any) => x.results.S1.zero.T2.reason='',(x: any) => x.frames.push({...x.frames[0]})]) {
      const copy=structuredClone(session);change(copy);try{await ex.createExport(copy);failures.push(false);}catch{failures.push(true);}
    }
    return { rejected, failures, unchanged, zip: Array.from(new Uint8Array(await exported.blob.arrayBuffer())) };
  });
  expect(report.rejected.every(Boolean)).toBe(true); expect(report.failures.every(Boolean)).toBe(true); expect(report.unchanged).toBe(true);
  const zip = await JSZip.loadAsync(new Uint8Array(report.zip));
  expect(Object.values(zip.files).filter(f => f.name.endsWith('.png'))).toHaveLength(1);
  const selectionsFile = Object.values(zip.files).find(f=>f.name.endsWith('selections.csv'))!;
  expect((await selectionsFile.async('string')).trim().split('\r\n')).toHaveLength(3);
  await page.getByLabel('导入配置 JSON', { exact: true }).setInputFiles(config);
  await page.getByLabel('关联视频文件', { exact: true }).setInputFiles({name:'V001_S01.mp4',mimeType:'video/mp4',buffer:Buffer.from('not video')});
  await expect(page.getByText('Error: 浏览器无法解码该视频，请使用 H.264 MP4 或兼容 WebM', {exact:true})).toBeVisible();
  await expect(page.getByRole('button', { name:'开始实验' })).toBeDisabled();
});
