import { useEffect, useRef, useState } from 'react';
import type { Config } from './model';
import { round, validateConfig } from './model';
import { probeVideo } from './video';
import './import.css';

interface Row { file: File; duration: number; videoId: string; start: string }
interface Props { disabled: boolean; onBusy: (busy: boolean) => void; onMessage: (message: string) => void; onImport: (config: Config, files: Record<string, File>) => Promise<void> }
export default function VideoImport({ disabled, onBusy, onMessage, onImport }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [experiment, setExperiment] = useState('festival_keyframe_study');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (rows.length && !dialog.current?.open) dialog.current?.showModal(); }, [rows]);
  async function select(list: FileList) {
    onBusy(true); setError('');
    try {
      const files = Array.from(list).filter(f => /\.(mp4|webm|mov|m4v|ogv|ogg)$/i.test(f.name)).sort((a,b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, 'zh-CN', { numeric: true }));
      if (!files.length) throw Error('所选目录中没有支持的视频文件，请选择包含 MP4 或 WebM 的文件夹。');
      if (new Set(files.map(f => f.name)).size !== files.length) throw Error('子文件夹中存在同名视频，请先重命名，避免关联错误。');
      const next: Row[] = [];
      for (const file of files) {
        onMessage(`正在读取视频 ${next.length + 1}/${files.length}：${file.name}`);
        try { next.push({ file, duration: await probeVideo(file), videoId: 'V001', start: '' }); }
        catch (e) { throw Error(`${file.name}：${String(e)}`); }
      }
      setRows(next); onMessage('视频已读取，请核对原视频编号和每个片段的原视频起点。');
    } catch (e) { onMessage(String(e)); }
    finally { onBusy(false); }
  }
  const valid = !!rows.length && !!experiment.trim() && rows.every(r => /^[A-Za-z0-9_-]+$/.test(r.videoId) && r.start.trim() !== '' && Number.isFinite(Number(r.start)) && Number(r.start) >= 0);
  function change(i: number, patch: Partial<Row>) { setRows(prev => prev.map((r,j) => i === j ? { ...r, ...patch } : r)); }
  function move(i: number, offset: number) { setRows(prev => { const next = [...prev]; [next[i], next[i + offset]] = [next[i + offset], next[i]]; return next; }); }
  async function confirm() {
    if (!valid) return; setSaving(true); setError('');
    try {
      const config = validateConfig({ experiment_id: experiment.trim(), segments: rows.map((r,i) => ({ video_id: r.videoId, segment_id: `S${String(i+1).padStart(3,'0')}`, filename: r.file.name, title: r.file.name.replace(/\.[^.]+$/, ''), start_time_sec: Number(r.start), end_time_sec: round(Number(r.start) + r.duration), duration_sec: round(r.duration) })) });
      await onImport(config, Object.fromEntries(rows.map(r => [r.file.name, r.file]))); setRows([]);
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  }
  return <><div className="import-actions direct-import"><label className={`button ${disabled ? 'disabled' : ''}`}>从文件夹导入<input aria-label="从文件夹导入" ref={el => { if (el) el.setAttribute('webkitdirectory', ''); }} type="file" multiple disabled={disabled} onChange={e => { if (e.target.files?.length) void select(e.target.files); e.target.value = ''; }} /></label><label className={`button ${disabled ? 'disabled' : ''}`}>直接选择视频<input aria-label="直接选择视频" type="file" multiple accept="video/*,.mp4,.webm" disabled={disabled} onChange={e => { if (e.target.files?.length) void select(e.target.files); e.target.value = ''; }} /></label></div>{rows.length > 0 && <dialog ref={dialog} onCancel={e => { e.preventDefault(); if (!saving) setRows([]); }}><div className="modal-head"><h2>确认视频片段信息</h2><button aria-label="关闭视频导入" disabled={saving} onClick={() => setRows([])}>×</button></div><p>已自动读取 {rows.length} 个视频的文件名和时长，无需编写 JSON。可调整顺序，片段编号按确认后的顺序自动生成。</p><p className="rule">请填写各片段在原始长视频中的起点（秒）。若文件本身就是完整原视频，填写 0；切分片段请填写真实起点，系统无法从文件夹推断。</p><label className="field">实验编号<input aria-label="直接导入实验编号" value={experiment} disabled={saving} onChange={e => setExperiment(e.target.value)} /></label><div className="video-import-rows">{rows.map((r,i) => <section key={r.file.name}><strong>{i+1}. {r.file.name}</strong><small className="muted">实际时长 {r.duration.toFixed(3)} 秒</small><div className="video-import-fields"><label className="field">原视频编号<input aria-label={`${r.file.name} 原视频编号`} value={r.videoId} disabled={saving} onChange={e => change(i, { videoId: e.target.value })} /></label><label className="field">原视频起点（秒）<input aria-label={`${r.file.name} 原视频起点`} type="number" min="0" step="0.001" value={r.start} disabled={saving} placeholder="请填写，例如 0 或 589" onChange={e => change(i, { start: e.target.value })} /></label><button aria-label={`${r.file.name} 上移`} disabled={saving || !i} onClick={() => move(i,-1)}>↑</button><button aria-label={`${r.file.name} 下移`} disabled={saving || i === rows.length-1} onClick={() => move(i,1)}>↓</button></div></section>)}</div>{error && <p role="alert" className="danger-text">{error}</p>}<div className="modal-actions"><button disabled={saving} onClick={() => setRows([])}>取消导入</button><button className="primary" disabled={!valid || saving} onClick={() => void confirm()}>{saving ? '正在保存…' : '确认导入视频'}</button></div></dialog>}</>;
}
