export const TASKS = [
  { id: 'T1', title: '主要文化内容呈现', description: '选择能够帮助他人理解该视频片段主要展示什么内容的关键帧。', reference: '视频片段主要围绕什么活动或文化内容展开？哪些人物、物品、文化符号或整体场景最能帮助他人理解片段的主要内容？' },
  { id: 'T2', title: '文化活动与行为过程展示', description: '选择能够帮助他人了解视频片段中重要活动、行为及其开展过程的关键帧。', reference: '视频中人们正在进行什么活动或行为？哪些关键动作、活动环节或具有代表性的时刻，能够帮助他人理解活动是如何开展的？' },
  { id: 'T3', title: '文化特色与情境展示', description: '选择能够帮助他人识别视频片段中的文化表现形式及其所处情境的关键帧。', reference: '画面中是否呈现了具有辨识度的服饰、器物、装饰、表演形式或活动场所？哪些画面能够体现活动的具体环境及其可观察到的文化特色？' },
  { id: 'T4', title: '情感氛围与互动呈现', description: '选择能够帮助他人了解视频片段中的人物互动、可观察的情绪表达或现场氛围的关键帧。', reference: '画面中是否存在值得关注的人物互动、面部表情、群体参与或共同活动？哪些可观察的画面信息能够体现现场的互动状态与氛围？' },
] as const;
export type TaskId = typeof TASKS[number]['id'];
export const ZERO_REASONS = ['当前片段没有呈现与该任务相关的内容。', '当前片段可能包含相关内容，但没有适合单独保留的画面。', '其他原因。'];
export interface Segment { video_id: string; segment_id: string; filename: string; start_time_sec: number; end_time_sec: number; duration_sec: number; title?: string }
export interface Config { experiment_id: string; segments: Segment[] }
export interface Frame { frame_id: string; segment_id: string; relative_time_sec: number; absolute_time_sec: number; image: Blob; task_assignments: { task_id: TaskId; selection_reason: string }[] }
export interface Result { completed: boolean; segment_completion_reason: string; zero: Partial<Record<TaskId, { reason: string; note: string }>> }
export interface Session { participant_id: string; session_id: string; config: Config; current: number; frames: Frame[]; results: Record<string, Result>; nextFrame: number; exported: boolean }
export const emptyResult = (): Result => ({ completed: false, segment_completion_reason: '', zero: {} });
export const round = (n: number) => Math.round(n * 1000) / 1000;
export function time(n: number) { const ms = Math.max(0, Math.round(n * 1000)); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`; }
export function validateConfig(value: unknown): Config {
  if (!value || typeof value !== 'object') throw Error('配置必须是 JSON 对象。');
  const c = value as Config;
  if (typeof c.experiment_id !== 'string' || !c.experiment_id.trim() || !Array.isArray(c.segments) || !c.segments.length) throw Error('请提供 experiment_id 和非空 segments。');
  const ids = new Set<string>();
  for (const s of c.segments) {
    if (!s || typeof s.video_id !== 'string' || typeof s.segment_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s.video_id) || !/^[A-Za-z0-9_-]+$/.test(s.segment_id) || typeof s.filename !== 'string' || !s.filename.trim() || /[/\\]/.test(s.filename) || (s.title !== undefined && typeof s.title !== 'string')) throw Error('视频/片段编号仅支持字母、数字、下划线和短横线；filename 必须是文件名。');
    if (ids.has(s.segment_id)) throw Error(`重复的 segment_id：${s.segment_id}`);
    ids.add(s.segment_id);
    if (![s.start_time_sec, s.end_time_sec, s.duration_sec].every(n => typeof n === 'number' && Number.isFinite(n)) || s.start_time_sec < 0 || s.end_time_sec <= s.start_time_sec || s.duration_sec <= 0) throw Error(`${s.segment_id} 的起止时间或时长无效。`);
    if (Math.abs(s.end_time_sec - s.start_time_sec - s.duration_sec) > 0.25) throw Error(`${s.segment_id} 的起止时间与 duration_sec 不一致（容差 0.25 秒）。`);
  }
  return c;
}
export function resultErrors(session: Session, s: Segment): string[] {
  const r = session.results[s.segment_id] || emptyResult();
  const frames = session.frames.filter(f => f.segment_id === s.segment_id);
  const errors: string[] = [];
  for (const t of TASKS) {
    const assignments = frames.flatMap(f => f.task_assignments.filter(a => a.task_id === t.id));
    if (assignments.some(a => !a.selection_reason.trim())) errors.push(`${t.id} 请补全选择理由`);
    if (!assignments.length && !ZERO_REASONS.includes(r.zero[t.id]?.reason || '')) errors.push(`${t.id} 请选择未选帧原因`);
    if (!assignments.length && r.zero[t.id]?.reason === ZERO_REASONS[2] && !r.zero[t.id]?.note.trim()) errors.push(`${t.id} 请补充其他原因`);
  }
  if (!r.segment_completion_reason.trim()) errors.push('请填写片段完成说明');
  return errors;
}
