import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { TASKS, ZERO_REASONS, emptyResult, resultErrors, round, time, validateConfig } from './model';
import type { Config, Frame, Result, Session, TaskId } from './model';
import { readConfig, readSession, saveConfig, saveSession, clearSession, readParticipantOnboarding, completeParticipantOnboarding } from './storage';
import { createExport } from './export';
import { captureVideo, observeFrames, probeVideo } from './video';
import VideoImport from './VideoImport';
import TaskIntro from './TaskIntro';
import ReadingInstructions from './ReadingInstructions';
import PracticeStage from './PracticeStage';
import './instructions.css';

const READING_SECONDS = 30;
type Stage = 'intro' | 'instructions' | 'practice' | 'practice_complete' | 'formal';
export interface PracticeWorkspace {
  initial: Session;
  file: File | string;
  onComplete: () => Promise<void>;
  onExit: () => void;
}

function Image({ blob, onClick }: { blob: Blob; onClick?: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const u = URL.createObjectURL(blob); setUrl(u); return () => URL.revokeObjectURL(u); }, [blob]);
  return <img src={url || undefined} alt="所选视频关键帧" onClick={onClick} className={onClick ? 'clickable' : ''} />;
}
function Modal({ title, children, close, className }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className={className} onCancel={e => { e.preventDefault(); close(); }}><div className="modal-head"><h2>{title}</h2><button aria-label="关闭弹窗" onClick={close}>×</button></div>{children}</dialog>;
}
export default function App({ practice }: { practice?: PracticeWorkspace } = {}) {
  const [config, setConfig] = useState<Config>();
  const [session, setSession] = useState<Session>();
  const latest = useRef<Session | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState<Stage>('intro');
  const active = !!practice || stage === 'formal';
  const reading = stage === 'instructions';
  const [participant, setParticipant] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [readingRemaining, setReadingRemaining] = useState(READING_SECONDS);
  const [pendingRestore, setPendingRestore] = useState(false);
  const [onboarding, setOnboarding] = useState({ read: false, practiced: false });
  const onboardingAttempt = useRef(0);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [fileStatus, setFileStatus] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState('尚未开始实验');
  const [message, setMessage] = useState('');
  const [task, setTask] = useState<TaskId>('T1');
  const [draft, setDraft] = useState<Frame>();
  const [duplicate, setDuplicate] = useState<Frame>();
  const [review, setReview] = useState(false);
  const [preview, setPreview] = useState<Blob>();
  const [busy, setBusy] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [exported, setExported] = useState(false);
  const [clearPrompt, setClearPrompt] = useState(false);
  const [confirmExport, setConfirmExport] = useState(false);
  const [step, setStep] = useState(0.04);
  const [seekInput, setSeekInput] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const configRef = useRef(config); configRef.current = config;
  useEffect(() => {
    // A practice workspace owns a separate in-memory session and never opens saved results.
    if (practice) {
      setConfig(practice.initial.config); setSession(practice.initial);
      if (typeof practice.file !== 'string') setFiles({ [practice.file.name]: practice.file });
      setFileStatus({ PRACTICE: '已就绪' }); setSaveStatus('练习数据仅临时保存');
      setLoading(false); return;
    }
    Promise.all([readConfig(), readSession()]).then(async ([c, saved]) => {
      setConfig(saved?.config || c); setSession(saved); latest.current = saved;
      setExported(saved?.exported || false);
    }).catch(e => setMessage(`本地数据库无法读取：${String(e)}。请勿在禁用存储的浏览器中进行正式实验。`)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!reading) return;
    const interval = window.setInterval(() => setReadingRemaining(seconds => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [reading]);
  useEffect(() => { const warn = (e: BeforeUnloadEvent) => { if (draft || saveStatus === '正在保存…' || saveStatus.startsWith('保存失败')) { e.preventDefault(); } }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn); }, [draft, saveStatus]);
  function persist(next: Session) {
    if (practice) { setSession(next); setSaveStatus('练习数据仅临时保存'); return; }
    latest.current = next; setSession(next); setSaveStatus('正在保存…'); setExported(next.exported);
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => saveSession(next));
    void saveQueue.current.then(() => { if (latest.current === next) setSaveStatus('已保存到本机'); }).catch(e => setSaveStatus(`保存失败：${String(e)}，请保留页面并重试`));
  }
  const s = session?.config.segments[session.current];
  const selectedFile = practice?.file || (s ? files[s.filename] : undefined);
  useEffect(() => { setVideoReady(false); setCurrentTime(0); setSeekInput(''); if (!selectedFile) { setVideoUrl(''); return; } if (typeof selectedFile === 'string') { setVideoUrl(selectedFile); return; } const url = URL.createObjectURL(selectedFile); setVideoUrl(url); return () => URL.revokeObjectURL(url); }, [selectedFile, s?.segment_id]);
  useEffect(() => { if (active && video.current) return observeFrames(video.current); }, [active, videoUrl]);
  const segmentFrames = session?.frames.filter(f => f.segment_id === s?.segment_id) || [];
  const result = s && session ? session.results[s.segment_id] || emptyResult() : emptyResult();
  const completedCount = session ? session.config.segments.filter(x => session.results[x.segment_id]?.completed).length : 0;
  const allComplete = !!session && completedCount === session.config.segments.length;
  const currentTask = TASKS.find(t => t.id === task)!;
  function updateResult(patch: Partial<Result>) { if (!session || !s) return; persist({ ...session, exported: false, results: { ...session.results, [s.segment_id]: { ...result, ...patch, completed: false } } }); }
  function updateFrames(frames: Frame[]) { if (!session || !s) return; persist({ ...session, frames, exported: false, results: { ...session.results, [s.segment_id]: { ...result, completed: false } } }); }
  async function importConfig(file: File) {
    try { const c = validateConfig(JSON.parse(await file.text())); await saveConfig(c); setConfig(c); setFiles({}); setFileStatus({}); setMessage('配置已导入，请关联对应的视频文件。'); } catch (e) { setMessage(String(e)); }
  }
  async function associate(list: FileList) {
    if (!config) return; setBusy(true);
    const snapshot = config;
    const incoming: Record<string, File> = {}; const statuses = { ...fileStatus }; const matched = { ...files };
    for (const f of Array.from(list)) { if (incoming[f.name]) { setMessage(`所选文件存在重复文件名 ${f.name}，请分别导入。`); setBusy(false); return; } incoming[f.name] = f; }
    for (const seg of config.segments) {
      const file = incoming[seg.filename]; if (!file) continue;
      statuses[seg.segment_id] = '正在校验…'; setFileStatus({ ...statuses });
      try { await probeVideo(file, seg); matched[seg.filename] = file; statuses[seg.segment_id] = '已就绪'; }
      catch (e) { delete matched[seg.filename]; statuses[seg.segment_id] = String(e); }
    }
    if (configRef.current === snapshot) { setFiles(matched); setFileStatus(statuses); setMessage('视频文件校验完成。原视频起点请由研究者按素材核对。'); }
    setBusy(false);
  }
  async function openReading(restore = false) {
    if (busy || !config || !/^[A-Za-z0-9_-]+$/.test(participant.trim())) return;
    if (restore ? !session || participant.trim() !== session.participant_id : session || !understood || !config.segments.every(seg => fileStatus[seg.segment_id] === '已就绪')) return;
    setBusy(true);
    const attempt = ++onboardingAttempt.current;
    try {
      const progress = await readParticipantOnboarding(participant.trim(), restore ? session?.session_id : undefined);
      if (attempt !== onboardingAttempt.current) return;
      setOnboarding(progress); setPendingRestore(restore); setMessage('');
      if (progress.practiced) { enterExperiment(restore); return; }
      if (progress.read) { setStage('practice'); return; }
      setReadingRemaining(READING_SECONDS); setStage('instructions');
    } catch (e) { setMessage(`流程状态读取失败，请重试：${String(e)}`); }
    finally { setBusy(false); }
  }
  function closeReading() {
    onboardingAttempt.current += 1;
    setStage('intro');
    setReadingRemaining(READING_SECONDS);
    setPendingRestore(false);
  }
  async function confirmReading() {
    if (!reading || readingRemaining !== 0 || busy) return;
    const attempt = onboardingAttempt.current;
    setBusy(true);
    try {
      const progress = await completeParticipantOnboarding(participant.trim(), 'read');
      setOnboarding(progress);
      if (attempt === onboardingAttempt.current) { setStage('practice'); setMessage(''); }
    } catch (e) { if (attempt === onboardingAttempt.current) closeReading(); setMessage(`阅读确认保存失败，请重试：${String(e)}`); }
    finally { setBusy(false); }
  }
  async function finishPractice() {
    if (stage !== 'practice') return;
    const progress = await completeParticipantOnboarding(participant.trim(), 'practiced');
    setOnboarding(progress); setStage('practice_complete');
  }
  function startFormal() {
    if (stage !== 'practice_complete' || !onboarding.practiced || busy || !config) return;
    enterExperiment(pendingRestore);
  }
  async function submitPractice() {
    if (!practice || busy || !segmentFrames.some(f => f.task_assignments.length > 0 && f.task_assignments.every(a => a.selection_reason.trim()))) return;
    video.current?.pause(); setBusy(true);
    try { await practice.onComplete(); }
    catch (e) { setMessage(`练习完成状态保存失败，请重试：${String(e)}`); }
    finally { setBusy(false); }
  }
  function enterExperiment(restore: boolean, sessionId?: string) {
    if (restore && session && participant.trim() === session.participant_id) {
      setStage('formal');
      setPendingRestore(false);
      setSaveStatus('已恢复本机会话');
      setMessage('实验已恢复；请重新关联原视频文件，已有记录和图片均已保留。');
      return;
    }
    if (restore || session || !config || !/^[A-Za-z0-9_-]+$/.test(participant.trim()) || !understood) return;
    const next: Session = { participant_id: participant.trim(), session_id: sessionId || crypto.randomUUID(), config, current: 0, frames: [], results: {}, nextFrame: 1, exported: false };
    persist(next); setStage('formal'); setMessage('');
    void navigator.storage?.persist?.();
  }
  function seek(seconds: number) { if (!video.current || !s || !videoReady) return; video.current.pause(); video.current.currentTime = Math.min(Math.max(0, seconds), Math.max(0, s.duration_sec - 0.001)); }
  async function capture() {
    if (!video.current || !session || !s || !videoReady || busy) return;
    setBusy(true);
    try {
      const { image, mediaTime } = await captureVideo(video.current); const relative = round(mediaTime);
      const f: Frame = { frame_id: `${session.participant_id}_${s.segment_id}_F${String(session.nextFrame).padStart(4, '0')}`, segment_id: s.segment_id, relative_time_sec: relative, absolute_time_sec: round(s.start_time_sec + relative), image, task_assignments: [] };
      const same = segmentFrames.find(x => Math.abs(x.relative_time_sec - relative) < 0.08);
      setDraft(f); setDuplicate(same);
    } catch (e) { setMessage(String(e)); } finally { setBusy(false); }
  }
  function saveDraft() {
    if (!draft || !session || !s) return;
    if (draft.task_assignments.some(a => !a.selection_reason.trim())) { setMessage('请填写每个已选任务的选择理由。'); return; }
    const exists = session.frames.some(f => f.frame_id === draft.frame_id);
    const frames = session.frames.filter(f => f.frame_id !== draft.frame_id);
    if (draft.task_assignments.length) frames.push(draft);
    persist({ ...session, exported: false, nextFrame: exists ? session.nextFrame : session.nextFrame + 1, frames, results: { ...session.results, [s.segment_id]: { ...result, completed: false } } });
    setDraft(undefined); setMessage('');
  }
  function switchSegment(index: number) { if (!session) return; if (saveStatus.startsWith('保存失败')) { setMessage('请先重试保存，再切换片段。'); return; } video.current?.pause(); persist({ ...session, current: index }); setTask('T1'); }
  function submit() {
    if (!session || !s) return; const errors = resultErrors(session, s);
    if (errors.length) { setMessage(errors.join('；')); return; }
    const nextIndex = session.config.segments.findIndex((seg, i) => i > session.current && !session.results[seg.segment_id]?.completed);
    persist({ ...session, exported: false, current: nextIndex >= 0 ? nextIndex : session.current, results: { ...session.results, [s.segment_id]: { ...result, completed: true } } });
    setReview(false); setMessage(nextIndex >= 0 ? '片段已提交，已进入下一片段。' : '片段已提交。可回看修改，或完成全部片段后导出。');
  }
  async function exportZip() {
    if (practice || !session) return; setBusy(true);
    try { await saveQueue.current; const out = await createExport(session); const url = URL.createObjectURL(out.blob); const a = document.createElement('a'); a.href = url; a.download = out.name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000); persist({ ...session, exported: true }); setConfirmExport(true); setMessage('ZIP 已生成并发起下载。请核对下载文件后再确认清除数据。'); } catch (e) { setMessage(`导出失败：${String(e)}`); } finally { setBusy(false); }
  }
  async function erase() { if (practice) return; setBusy(true); try { await saveQueue.current; await clearSession(); latest.current = undefined; setSession(undefined); setStage('intro'); setParticipant(''); setUnderstood(false); setExported(false); setConfirmExport(false); setClearPrompt(false); setSaveStatus('尚未开始实验'); setMessage('会话已清除，可以交给下一位参与者。'); } catch (e) { setMessage(`清除失败：${String(e)}`); } finally { setBusy(false); } }
  if (!practice && stage === 'practice') return <PracticeStage participant={participant.trim()} onComplete={finishPractice} onExit={() => { setStage('intro'); setPendingRestore(false); }} />;
  if (loading) return <div className="loading">正在读取本地实验数据…</div>;
  return <>
    <header className="header"><div className="brand-mark">帧</div><div><h1>传统节日 · 关键帧实验室</h1><p>TRADITIONAL FESTIVAL / KEYFRAME STUDY</p></div><span className="local-label"><i /> 本地实验 · 数据仅保存在本机</span></header>
    {message && <div role="status" className="notice"><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage('')}>×</button></div>}
    {!practice && stage === 'practice_complete' ? <main className="prepare"><section className="panel practice-complete"><span className="eyebrow">练习阶段</span><h2>练习完成</h2><p>您已完成平台操作练习。接下来将进入正式实验，请根据四项信息任务独立完成关键帧选择。</p><p className="muted">参与者：{participant.trim()} · 练习结果不纳入正式实验。</p><button className="primary" disabled={busy} onClick={() => void startFormal()}>开始正式实验</button><button disabled={busy} onClick={() => { setStage('intro'); setPendingRestore(false); }}>返回实验首页</button></section></main> : !active ? <main className="prepare">
      <div className="intro"><span className="eyebrow">研究实验平台 / SESSION PREPARATION</span><h2>从视频中，保留你认为需要的画面。</h2><p>观看传统节日视频片段，依据四项信息任务自主选择关键帧，记录你的判断与理由。</p></div>
      <div className="prepare-grid"><TaskIntro />
      <div className="prepare-side"><section className="panel"><div className="section-title"><span className="section-no">02</span><h2>研究者 · 材料准备</h2></div><p className="muted">可直接选择视频文件夹，或使用 JSON 配置导入。</p>{!session && <VideoImport disabled={busy} onBusy={setBusy} onMessage={setMessage} onImport={async (c, imported) => { await saveConfig(c); setConfig(c); setFiles(imported); setFileStatus(Object.fromEntries(c.segments.map(seg => [seg.segment_id, "已就绪"]))); setMessage("视频和片段配置已导入，可以开始实验。"); }} />}<div className="import-actions"><label className={`button ${session || busy ? 'disabled' : ''}`}>导入配置 JSON<input aria-label="导入配置 JSON" type="file" accept=".json,application/json" disabled={!!session || busy} onChange={e => { if (e.target.files?.[0]) void importConfig(e.target.files[0]); e.target.value = ''; }} /></label><label className={`button ${!config || busy ? 'disabled' : ''}`}>关联视频文件<input aria-label="关联视频文件" type="file" accept="video/*,.mp4,.webm" multiple disabled={!config || busy} onChange={e => { if (e.target.files) void associate(e.target.files); e.target.value = ''; }} /></label></div>{config ? <><div className="config-name">{config.experiment_id} <span>{config.segments.length} 个片段</span></div><div className="file-list">{config.segments.map(seg => <div key={seg.segment_id}><strong>{seg.title || seg.segment_id}</strong><small>{seg.filename} · 原视频起点 {time(seg.start_time_sec)}</small><small className={fileStatus[seg.segment_id] === '已就绪' ? 'success' : 'muted'}>{fileStatus[seg.segment_id] || '等待关联视频'}</small></div>)}</div></> : <div className="empty compact">尚未导入实验材料<br/><a href={`${import.meta.env.BASE_URL}examples/experiment.json`} download>下载配置示例 ↓</a></div>}</section>
      <section className="panel"><div className="section-title"><span className="section-no">03</span><h2>{session ? '恢复已有实验' : '参与者 · 开始实验'}</h2></div>{session ? <><p>检测到本机存在未清除的实验会话。请由研究者核对参与者编号后恢复。</p><label className="field">输入原参与者编号<input aria-label="恢复参与者编号" disabled={busy} value={participant} onChange={e => setParticipant(e.target.value)} placeholder="输入原编号以恢复" autoComplete="off" /></label><button className="primary wide" disabled={participant.trim() !== session.participant_id || busy} onClick={() => openReading(true)}>恢复同一会话</button><p className="muted">下一位参与者开始前，请先完成已有会话的导出和清除。</p>{exported && <button onClick={() => setClearPrompt(true)}>已核对导出文件，清除已有会话</button>}</> : <><label className="field">参与者编号<input aria-label="参与者编号" disabled={busy} value={participant} onChange={e => setParticipant(e.target.value)} placeholder="例如 P01，无需填写姓名" autoComplete="off" /></label><label className="check"><input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} />我已阅读并理解四项任务及实验规则</label><button className="primary wide" disabled={busy || !config || !config.segments.every(seg => fileStatus[seg.segment_id] === '已就绪') || !/^[A-Za-z0-9_-]+$/.test(participant.trim()) || !understood} onClick={() => openReading()}>开始实验 <span>→</span></button><small className="muted">编号使用字母、数字、下划线或短横线。会话编号自动生成。</small></>}</section></div></div>
    </main> : session && s ? <main className={practice ? "workspace practice-workspace" : "workspace"}>
      {practice && <div className="practice-banner"><strong>练习阶段</strong><p>本阶段仅用于熟悉平台操作，练习结果不纳入正式实验</p><p>请截取至少一张画面，关联任意任务并填写理由，然后点击“完成练习”。</p></div>}
      <div className="session-bar"><div><span className="eyebrow">EXPERIMENT WORKSPACE</span><h2>{practice ? '练习阶段' : '关键帧选择'}</h2></div><div className="session-detail"><span>参与者 <b>{session.participant_id}</b></span>{!practice && <><span>完成进度 <b>{completedCount} / {session.config.segments.length}</b></span><div className="progress"><i style={{ width: `${completedCount / session.config.segments.length * 100}%` }} /></div></>}<button onClick={() => { video.current?.pause(); if (practice) practice.onExit(); else { setStage('intro'); setParticipant(''); } }}>{practice ? '返回实验首页' : '暂离实验'}</button></div></div>
      <div className="workspace-grid"><section className="panel player-panel"><div className="player-title"><div><span className="eyebrow">当前片段 / {s.segment_id}</span><h2>{s.title || s.segment_id}</h2></div>{!practice && <select aria-label="切换片段" value={session.current} disabled={busy} onChange={e => switchSegment(Number(e.target.value))}>{session.config.segments.map((seg, i) => <option key={seg.segment_id} value={i}>{String(i + 1).padStart(2, '0')} · {seg.title || seg.segment_id}{session.results[seg.segment_id]?.completed ? ' · 已完成' : ''}</option>)}</select>}</div>
      <div className="video-box">{videoUrl ? <video ref={video} src={videoUrl} controls preload="auto" onLoadedData={() => setVideoReady(true)} onSeeking={() => setVideoReady(false)} onSeeked={() => { setVideoReady(true); if (video.current) setCurrentTime(video.current.currentTime); }} onTimeUpdate={() => setCurrentTime(video.current?.currentTime || 0)} onError={() => { setVideoReady(false); setMessage('视频播放失败，请重新关联兼容文件。'); }} /> : <div className="video-placeholder"><span>▶</span><h3>重新关联视频以继续</h3><p>已保存的关键帧和实验记录仍然保留</p></div>}</div>
      <div className="time-bar"><div><small>片段内时间</small><strong data-testid="relative-time">{time(currentTime)}</strong><span> / {time(s.duration_sec)}</span></div><div><small>原视频绝对时间</small><strong>{time(s.start_time_sec + currentTime)}</strong></div></div>
      <div className="transport"><button disabled={!videoReady} onClick={() => seek(currentTime - 5)}>−5 秒</button><button disabled={!videoReady} onClick={() => seek(currentTime - step)}>上一帧 ≈</button><button disabled={!videoReady} onClick={() => seek(currentTime + step)}>下一帧 ≈</button><button disabled={!videoReady} onClick={() => seek(currentTime + 5)}>+5 秒</button><select aria-label="定位步长" value={step} onChange={e => setStep(Number(e.target.value))}><option value={0.04}>25 fps 步长</option><option value={1 / 30}>30 fps 步长</option><option value={1 / 24}>24 fps 步长</option><option value={1 / 60}>60 fps 步长</option></select></div>
      <div className="capture-row"><div className="seek-form"><input aria-label="定位秒数" type="number" min="0" step="0.001" placeholder="片段内秒数" value={seekInput} onChange={e => setSeekInput(e.target.value)} /><button disabled={!videoReady || seekInput === '' || !Number.isFinite(Number(seekInput))} onClick={() => seek(Number(seekInput))}>定位</button></div><button className="primary capture" disabled={!videoReady || busy || fileStatus[s.segment_id] !== '已就绪'} onClick={() => void capture()}>▣　截取当前画面</button></div><p className="hint">逐帧按钮按所选帧率近似定位；截帧优先记录浏览器实际显示帧时间。毫秒表示精度不等于画面定位精度。</p>
      {!practice && <details className="material-details"><summary>片段元数据与文件关联</summary><p>{s.filename} · 原视频 {s.video_id} · 起点 {s.start_time_sec} 秒 · 终点 {s.end_time_sec} 秒</p><p>会话：{session.session_id}</p><label className="button">重新关联视频<input aria-label="重新关联视频" type="file" accept="video/*,.mp4,.webm" multiple disabled={busy} onChange={e => { if (e.target.files) void associate(e.target.files); e.target.value = ''; }} /></label></details>}</section>
      <section className="panel task-panel"><div className="section-title"><h2>任务与关键帧</h2><span className="pill">{segmentFrames.length} 张独立画面</span></div><div className="task-tabs">{TASKS.map(t => <button key={t.id} className={task === t.id ? 'selected' : ''} onClick={() => setTask(t.id)}><b>{t.id}</b><span>{segmentFrames.filter(f => f.task_assignments.some(a => a.task_id === t.id)).length} 张</span></button>)}</div><div className="task-description"><h3>{currentTask.title}</h3><p><b>任务目标：</b>{currentTask.description}</p><p className="task-reference"><b>参考说明：</b>{currentTask.reference}</p></div><div className="frame-list">{segmentFrames.filter(f => f.task_assignments.some(a => a.task_id === task)).sort((a,b) => a.relative_time_sec - b.relative_time_sec).map(f => <article className="frame-card" key={f.frame_id}><Image blob={f.image} onClick={() => setPreview(f.image)} /><div className="frame-info"><strong>{time(f.relative_time_sec)}</strong><small>原视频 {time(f.absolute_time_sec)}</small><div className="tags">{f.task_assignments.map(a => <span key={a.task_id}>{a.task_id}</span>)}</div><p>{f.task_assignments.find(a => a.task_id === task)?.selection_reason}</p><div className="frame-actions"><button onClick={() => { video.current?.pause(); setDraft(structuredClone(f)); }}>编辑</button><button onClick={() => { const rest = f.task_assignments.filter(a => a.task_id !== task); updateFrames(session.frames.flatMap(x => x.frame_id !== f.frame_id ? [x] : rest.length ? [{ ...x, task_assignments: rest }] : [])); }}>移出 {task}</button><button className="danger-text" onClick={() => { if (window.confirm('从所有任务中删除这张关键帧？')) updateFrames(session.frames.filter(x => x.frame_id !== f.frame_id)); }}>删除</button></div></div></article>)}{!segmentFrames.some(f => f.task_assignments.some(a => a.task_id === task)) && <div className="empty"><div className="empty-icon">▧</div><h3>该任务尚无关键帧</h3><p>找到需要的画面时，点击“截取当前画面”。<br/>也可以保持 0 张，并在完成片段时说明原因。</p></div>}</div></section></div>
      {practice ? <footer className="workspace-footer"><span className="muted">练习数据仅临时保存，不写入正式实验结果。</span><button className="primary" disabled={busy || !segmentFrames.some(f => f.task_assignments.length > 0 && f.task_assignments.every(a => a.selection_reason.trim()))} onClick={() => void submitPractice()}>完成练习</button></footer> : (<footer className="workspace-footer"><div><span className={saveStatus.startsWith('保存失败') ? 'danger-text' : 'success'}>● {saveStatus}</span>{saveStatus.startsWith('保存失败') && <button onClick={() => persist(session)}>重试保存</button>}<small>每项任务允许 0 张或多张；同一帧可用于多个任务。</small></div><div className="footer-actions">{exported && <button onClick={() => setClearPrompt(true)}>核对并清除会话</button>}<button disabled={!allComplete || busy} onClick={() => { video.current?.pause(); setConfirmExport(true); }}>导出实验结果</button><button className="primary" disabled={busy || !selectedFile || fileStatus[s.segment_id] !== '已就绪'} onClick={() => { video.current?.pause(); setReview(true); setMessage(''); }}>完成当前片段 →</button></div></footer>)}

    </main> : null}
    {reading && <Modal title="实验操作流程说明" className="reading-modal" close={closeReading}>
      <ReadingInstructions />
      <div className="reading-footer"><p role="status">{readingRemaining > 0 ? `请阅读实验操作说明，${readingRemaining} 秒后即可开始` : '现在可以进入练习'}</p><div className="reading-actions"><button onClick={closeReading}>返回准备页面</button><button className="primary" disabled={readingRemaining > 0 || busy} onClick={() => void confirmReading()}>我已阅读，进入练习</button></div></div>
    </Modal>}
    {draft && (duplicate ? <Modal title="附近已有关键帧" close={() => { setDraft(undefined); setDuplicate(undefined); }}><p>当前时间附近已经存在关键帧（{time(duplicate.relative_time_sec)}），是否使用已有画面？</p><Image blob={duplicate.image} /><div className="modal-actions"><button onClick={() => setDuplicate(undefined)}>仍然新增</button><button className="primary" onClick={() => { setDraft(structuredClone(duplicate)); setDuplicate(undefined); }}>使用已有关键帧</button></div></Modal> : <Modal title="关键帧 · 任务与理由" close={() => { if (window.confirm('放弃此次尚未确认的编辑？')) setDraft(undefined); }}><div className="editor-layout"><div><Image blob={draft.image} onClick={() => setPreview(draft.image)} /><div className="timestamp-pair"><span>片段内 <b>{time(draft.relative_time_sec)}</b></span><span>原视频 <b>{time(draft.absolute_time_sec)}</b></span></div><small className="muted">{draft.frame_id}</small></div><div className="assignment-fields">{TASKS.map(t => { const a = draft.task_assignments.find(a => a.task_id === t.id); return <div key={t.id} className={a ? 'assignment checked' : 'assignment'}><label className="check"><input type="checkbox" aria-label={`关联 ${t.id}`} checked={!!a} onChange={e => setDraft({ ...draft, task_assignments: e.target.checked ? [...draft.task_assignments, { task_id: t.id, selection_reason: '' }] : draft.task_assignments.filter(a => a.task_id !== t.id) })} /><b>{t.id}</b> {t.title}</label>{a && <textarea aria-label={`${t.id} 选择理由`} placeholder="为什么为这项任务保留该画面？" value={a.selection_reason} onChange={e => setDraft({ ...draft, task_assignments: draft.task_assignments.map(x => x.task_id === t.id ? { ...x, selection_reason: e.target.value } : x) })} />}</div>; })}</div></div><p className="hint">可选择多项任务，各自填写理由。取消所有任务后保存，将移除该帧。</p><div className="modal-actions"><button onClick={() => setDraft(undefined)}>取消编辑</button><button className="primary" disabled={draft.task_assignments.some(a => !a.selection_reason.trim())} onClick={saveDraft}>保存关键帧</button></div></Modal>)}
    {review && session && s && <Modal title="确认当前片段结果" close={() => setReview(false)}><p className="muted">{s.title || s.segment_id} · {segmentFrames.length} 张独立画面。0 张关键帧也是有效结果。</p><div className="review-tasks">{TASKS.map(t => { const fs = segmentFrames.filter(f => f.task_assignments.some(a => a.task_id === t.id)); return <section key={t.id}><h3>{t.id} · {t.title}<span className="pill">{fs.length} 张</span></h3>{fs.length ? fs.map(f => <div className="review-frame" key={f.frame_id}><Image blob={f.image} onClick={() => setPreview(f.image)} /><div><b>片段内 {time(f.relative_time_sec)}</b><small>原视频 {time(f.absolute_time_sec)}</small><p>{f.task_assignments.find(a => a.task_id === t.id)?.selection_reason}</p></div></div>) : <><label className="field">未选帧原因<select aria-label={`${t.id} 未选帧原因`} value={result.zero[t.id]?.reason || ''} onChange={e => updateResult({ zero: { ...result.zero, [t.id]: { reason: e.target.value, note: result.zero[t.id]?.note || '' } } })}><option value="">请选择原因</option>{ZERO_REASONS.map(r => <option key={r}>{r}</option>)}</select></label><textarea aria-label={`${t.id} 未选帧补充说明`} placeholder={result.zero[t.id]?.reason === ZERO_REASONS[2] ? '请说明其他原因（必填）' : '补充说明（选填）'} value={result.zero[t.id]?.note || ''} onChange={e => updateResult({ zero: { ...result.zero, [t.id]: { reason: result.zero[t.id]?.reason || '', note: e.target.value } } })} /></>}</section>; })}</div><label className="field completion-question">您为什么认为目前所选择的关键帧已经足以满足这些任务的信息需求？<textarea aria-label="片段完成说明" value={result.segment_completion_reason} onChange={e => updateResult({ segment_completion_reason: e.target.value })} placeholder="请结合你的选择（或未选择的情况）说明。" /></label>{resultErrors(session, s).length > 0 && <p className="hint">待补充：{resultErrors(session, s).join('；')}</p>}<div className="modal-actions"><button onClick={() => setReview(false)}>返回编辑</button><button className="primary" disabled={!!resultErrors(session, s).length || saveStatus.startsWith('保存失败')} onClick={submit}>确认提交片段</button></div></Modal>}
    {preview && <Modal title="关键帧原图预览" close={() => setPreview(undefined)}><Image blob={preview} /></Modal>}
    {confirmExport && session && <Modal title="导出结果核对" close={() => setConfirmExport(false)}><p>参与者 {session.participant_id} · {completedCount}/{session.config.segments.length} 个片段已完成 · {session.frames.length} 张独立关键帧</p><div className="export-summary">{session.config.segments.map(seg => <div key={seg.segment_id}><strong>{seg.title || seg.segment_id}</strong><span>{TASKS.map(t => `${t.id}: ${session.frames.filter(f => f.segment_id === seg.segment_id && f.task_assignments.some(a => a.task_id === t.id)).length} 张`).join(' / ')}</span></div>)}</div><p className="muted">ZIP 包含 PNG 原图、metadata.json 和四份 UTF-8 BOM CSV。导出不会清除本地记录，可重复导出。</p><div className="modal-actions">{exported && <button onClick={() => { setConfirmExport(false); setClearPrompt(true); }}>已核对下载文件，清除会话</button>}<button className="primary" disabled={busy || !allComplete || saveStatus.startsWith('保存失败')} onClick={() => void exportZip()}>{busy ? '正在生成…' : '下载 ZIP'}</button></div></Modal>}
    {clearPrompt && <Modal title="确认清除本机会话" close={() => setClearPrompt(false)}><p>请先打开并核对已下载的 ZIP 文件。清除后，本机的实验记录和关键帧图片将无法恢复；材料配置保留供下一位参与者使用。</p><div className="modal-actions"><button onClick={() => setClearPrompt(false)}>保留数据</button><button className="danger" disabled={!exported || busy} onClick={() => void erase()}>确认导出完整并清除</button></div></Modal>}
    <div className="app-bottom">传统节日视频关键帧选择实验平台 <span>研究工具 · v1.0.0</span></div>
  </>;
}
