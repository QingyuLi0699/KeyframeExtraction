import { useEffect, useRef, useState } from 'react';
import App from './App';
import type { Session } from './model';
import { round } from './model';
import { probeVideo, probeVideoUrl } from './video';

interface Props { participant: string; onComplete: () => Promise<void>; onExit: () => void }
export default function PracticeStage({ participant, onComplete, onExit }: Props) {
  const [material, setMaterial] = useState<{ initial: Session; file: File | string }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const request = useRef(0);
  const download = useRef<AbortController | null>(null);
  async function prepare(file: File | string, title: string, start: number, token: number, signal?: AbortSignal) {
    const duration = round(typeof file === 'string' ? await probeVideoUrl(file, signal!) : await probeVideo(file));
    if (token !== request.current) return;
    const filename = typeof file === 'string' ? new URL(file).pathname.split('/').pop() || 'practice.mp4' : file.name;
    const initial: Session = {
      participant_id: participant, session_id: `practice_${crypto.randomUUID()}`,
      config: { experiment_id: 'practice_only', segments: [{ video_id: 'PRACTICE', segment_id: 'PRACTICE', filename, title, start_time_sec: start, end_time_sec: round(start + duration), duration_sec: duration }] },
      current: 0, frames: [], results: {}, nextFrame: 1, exported: false,
    };
    setMaterial({ initial, file });
  }
  async function selectLocal(file: File) {
    const token = ++request.current; download.current?.abort();
    setLoading(true); setError('');
    try { await prepare(file, '练习视频', 0, token); }
    catch (e) { if (token === request.current) setError(`练习视频无法加载：${String(e)}`); }
    finally { if (token === request.current) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController(); download.current = controller;
    const token = ++request.current; let timedOut = false;
    setLoading(true); setError('');
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
    async function load() {
      try {
        const configUrl = new URL(`${import.meta.env.BASE_URL}practice/config.json`, location.origin);
        const response = await fetch(configUrl, { signal: controller.signal });
        if (!response.ok) throw Error('未找到练习视频配置，请重试或选择本地练习视频。');
        const config = await response.json();
        if (typeof config.video_url !== 'string' || !config.video_url.trim() || !Number.isFinite(config.start_time_sec) || config.start_time_sec < 0) throw Error('练习配置需要 video_url 和非负 start_time_sec');
        const videoUrl = new URL(config.video_url, configUrl);
        if (videoUrl.origin !== location.origin) throw Error('练习视频请使用本站资源路径');
        // Keep the original URL: native media loading can seek using HTTP byte ranges.
        await prepare(videoUrl.href, typeof config.title === 'string' ? config.title : '练习视频', config.start_time_sec, token, controller.signal);
      } catch (e) {
        if (token !== request.current) return;
        if (timedOut) setError('练习视频加载超时，请重试或选择本地练习视频。');
        else if (!controller.signal.aborted) setError(String(e));
      } finally {
        window.clearTimeout(timer);
        if (token === request.current) setLoading(false);
      }
    }
    void load();
    return () => { window.clearTimeout(timer); controller.abort(); request.current += 1; };
  }, [retry]);
  if (material) return <App practice={{ ...material, onComplete, onExit }} />;
  return <main className="workspace practice-workspace"><section className="panel">
    <div className="practice-banner"><h1>练习阶段</h1><p>本阶段仅用于熟悉平台操作，练习结果不纳入正式实验</p></div>
    <p>参与者：{participant}</p>
    {loading && <p role="status">正在读取练习视频，网络较慢时可选择本地文件…</p>}
    {error && <p role="alert">{error}</p>}
    <p>此处选择的视频仅用于练习，不会加入正式片段列表。</p>
    <label className="button">选择练习视频<input aria-label="选择练习视频" type="file" accept="video/*,.mp4,.webm" onChange={e => { const file = e.target.files?.[0]; if (file) void selectLocal(file); e.target.value = ''; }} /></label>
    {!loading && <button onClick={() => setRetry(value => value + 1)}>重试加载</button>}
    <button onClick={onExit}>返回实验首页</button>
  </section></main>;
}
