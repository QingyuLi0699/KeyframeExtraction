import { useEffect, useRef, useState } from 'react';
import App from './App';
import type { Session } from './model';
import { round } from './model';
import { probeVideo } from './video';

interface Props { participant: string; onComplete: () => Promise<void>; onExit: () => void }
export default function PracticeStage({ participant, onComplete, onExit }: Props) {
  const [material, setMaterial] = useState<{ initial: Session; file: File }>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  async function prepare(file: File, title = '练习视频', start = 0, token = ++request.current) {
    setLoading(true); setError('');
    try {
      const duration = round(await probeVideo(file));
      if (token !== request.current) return;
      const initial: Session = {
        participant_id: participant, session_id: `practice_${crypto.randomUUID()}`,
        config: { experiment_id: 'practice_only', segments: [{ video_id: 'PRACTICE', segment_id: 'PRACTICE', filename: file.name, title, start_time_sec: start, end_time_sec: round(start + duration), duration_sec: duration }] },
        current: 0, frames: [], results: {}, nextFrame: 1, exported: false,
      };
      setMaterial({ initial, file });
    } catch (e) { if (token === request.current) setError(`练习视频无法加载：${String(e)}`); }
    finally { if (token === request.current) setLoading(false); }
  }
  useEffect(() => {
    const controller = new AbortController(); const token = ++request.current;
    async function load() {
      try {
        const configUrl = new URL(`${import.meta.env.BASE_URL}practice/config.json`, location.origin);
        const response = await fetch(configUrl, { signal: controller.signal });
        if (!response.ok) throw Error('未找到练习视频配置 public/practice/config.json');
        const config = await response.json();
        if (typeof config.video_url !== 'string' || !config.video_url.trim() || !Number.isFinite(config.start_time_sec) || config.start_time_sec < 0) throw Error('练习配置需要 video_url 和非负 start_time_sec');
        const videoUrl = new URL(config.video_url, configUrl);
        if (videoUrl.origin !== location.origin) throw Error('练习视频请使用本站资源路径');
        const video = await fetch(videoUrl, { signal: controller.signal });
        if (!video.ok || video.headers.get('content-type')?.includes('text/html')) throw Error('尚未配置练习视频，请将独立素材放入 public/practice/practice.mp4，或单独选择练习视频');
        const blob = await video.blob();
        if (token !== request.current) return;
        await prepare(new File([blob], videoUrl.pathname.split('/').pop() || 'practice.mp4', { type: blob.type || 'video/mp4' }), config.title || '练习视频', config.start_time_sec, token);
      } catch (e) {
        if (controller.signal.aborted || token !== request.current) return;
        setError(String(e)); setLoading(false);
      }
    }
    void load();
    return () => { controller.abort(); request.current += 1; };
  }, []);
  if (material) return <App practice={{ ...material, onComplete, onExit }} />;
  return <main className="workspace practice-workspace"><section className="panel">
    <div className="practice-banner"><h1>练习阶段</h1><p>本阶段仅用于熟悉平台操作，练习结果不纳入正式实验</p></div>
    <p>参与者：{participant}</p>
    {loading && <p role="status">正在加载独立练习视频…</p>}
    {error && <p role="alert">{error}</p>}
    <p>请研究者提供独立练习素材。此处选择的视频仅用于练习，不会加入正式片段列表。</p>
    <label className="button">选择练习视频<input aria-label="选择练习视频" type="file" accept="video/*,.mp4,.webm" onChange={e => { const file = e.target.files?.[0]; if (file) void prepare(file); e.target.value = ''; }} /></label>
    <button onClick={onExit}>返回实验首页</button>
  </section></main>;
}
