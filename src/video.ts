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
