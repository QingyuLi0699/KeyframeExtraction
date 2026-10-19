import type { Segment } from './model';
export async function probeVideo(file: File, s?: Segment): Promise<number> {
  const url = URL.createObjectURL(file); const v = document.createElement('video'); v.preload = 'auto'; v.muted = true;
  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = window.setTimeout(() => { cleanup(); reject(Error('读取视频超时')); }, 20000);
      const cleanup = () => { clearTimeout(timer); v.onloadeddata = null; v.onerror = null; };
      v.onerror = () => { cleanup(); reject(Error('浏览器无法解码该视频，请使用 H.264 MP4 或兼容 WebM')); };
      v.onloadeddata = () => { cleanup(); if (!Number.isFinite(v.duration) || v.duration <= 0 || !v.videoWidth) reject(Error('无法读取视频时长或画面')); else if (s && Math.abs(v.duration - s.duration_sec) > 0.25) reject(Error(`实际时长 ${v.duration.toFixed(3)} 秒与配置 ${s.duration_sec} 秒不符（容差 0.25 秒）`)); else resolve(v.duration); };
      v.src = url;
    });
  } finally { v.removeAttribute('src'); v.load(); URL.revokeObjectURL(url); }
}
// Let the browser request byte ranges instead of downloading a complete remote video.
export async function probeVideoUrl(url: string, signal: AbortSignal): Promise<number> {
  const video = document.createElement('video'); video.preload = 'auto'; video.muted = true;
  try {
    return await new Promise<number>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); video.onloadeddata = null; video.onerror = null; signal.removeEventListener('abort', abort); };
      const fail = (error: Error) => { cleanup(); reject(error); };
      const abort = () => fail(new DOMException('已取消加载', 'AbortError'));
      const timer = window.setTimeout(() => fail(Error('练习视频加载超时，请重试或选择本地练习视频。')), 20000);
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      video.onerror = () => fail(Error('练习视频无法加载，请重试或选择本地练习视频。'));
      video.onloadeddata = () => {
        if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth) { fail(Error('无法读取练习视频时长或画面')); return; }
        const duration = video.duration; cleanup(); resolve(duration);
      };
      video.src = url;
    });
  } finally { video.removeAttribute('src'); video.load(); }
}
export async function captureVideo(v: HTMLVideoElement): Promise<{ image: Blob; mediaTime: number }> {
  v.pause();
  if (v.seeking || v.readyState < 2 || !v.videoWidth) throw Error('画面尚未就绪，请等待视频定位完成。');
  // Copy synchronously: canvas pixels and timestamp refer to the same presented frame.
  const mediaTime = presentedTimes.get(v) ?? v.currentTime;
  const canvas = document.createElement('canvas'); canvas.width = v.videoWidth; canvas.height = v.videoHeight;
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('浏览器不支持 Canvas');
  ctx.drawImage(v, 0, 0);
  const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error('PNG 截图失败')), 'image/png'));
  return { image, mediaTime };
}
const presentedTimes = new WeakMap<HTMLVideoElement, number>();
export function observeFrames(v: HTMLVideoElement) {
  let cancelled = false; let handle = 0;
  const callback = (_now: number, metadata: VideoFrameCallbackMetadata) => { presentedTimes.set(v, metadata.mediaTime); if (!cancelled) handle = v.requestVideoFrameCallback(callback); };
  if ('requestVideoFrameCallback' in v) handle = v.requestVideoFrameCallback(callback);
  const reset = () => presentedTimes.delete(v);
  v.addEventListener('seeking', reset); v.addEventListener('emptied', reset);
  return () => { cancelled = true; if (handle) v.cancelVideoFrameCallback(handle); v.removeEventListener('seeking', reset); v.removeEventListener('emptied', reset); presentedTimes.delete(v); };
}
