import JSZip from 'jszip';
import { TASKS, validateConfig, resultErrors, round } from './model';
import type { Session } from './model';
export function csv(headers: string[], rows: unknown[][]) {
  const escape = (x: unknown) => `"${String(x ?? '').replaceAll('"', '""')}"`;
  return '\uFEFF' + [headers, ...rows].map(r => r.map(escape).join(',')).join('\r\n') + '\r\n';
}
export async function createExport(session: Session) {
  validateConfig(session.config);
  const ids = new Set<string>();
  for (const s of session.config.segments) {
    if (!session.results[s.segment_id]?.completed) throw Error(`${s.segment_id} 尚未提交。`);
    const errors = resultErrors(session, s); if (errors.length) throw Error(`${s.segment_id}：${errors.join('；')}`);
  }
  const name = `keyframe_experiment_${session.participant_id}_${session.session_id}`;
  const zip = new JSZip(); const root = zip.folder(name)!;
  const frames: unknown[][] = [], selections: unknown[][] = [], tasks: unknown[][] = [], segments: unknown[][] = [];
  for (const f of session.frames) {
    const s = session.config.segments.find(s => s.segment_id === f.segment_id);
    if (!s || ids.has(f.frame_id) || !/^[A-Za-z0-9_-]+$/.test(f.frame_id) || !(f.image instanceof Blob) || !f.image.size || f.image.type !== 'image/png' || !f.task_assignments.length) throw Error('关键帧缺少图片、片段关联，或编号重复/无效。');
    ids.add(f.frame_id);
    const signature = new Uint8Array(await f.image.slice(0, 8).arrayBuffer());
    if ([137,80,78,71,13,10,26,10].some((v,i) => signature[i] !== v)) throw Error('关键帧不是有效 PNG 图片。');
    if (!Number.isFinite(f.relative_time_sec) || !Number.isFinite(f.absolute_time_sec) || f.relative_time_sec < 0 || f.relative_time_sec > s.duration_sec + 0.25 || Math.abs(round(s.start_time_sec + f.relative_time_sec) - f.absolute_time_sec) > 0.001) throw Error(`${f.frame_id} 双时间戳不一致。`);
    const path = `frames/${s.video_id}/${s.segment_id}/${f.frame_id}.png`;
    root.file(path, await f.image.arrayBuffer());
    const base = [session.participant_id, session.session_id, s.video_id, s.segment_id];
    frames.push([...base, f.frame_id, f.relative_time_sec, f.absolute_time_sec, path]);
    const assigned = new Set<string>();
    for (const a of f.task_assignments) {
      if (!TASKS.some(t => t.id === a.task_id) || assigned.has(a.task_id) || !a.selection_reason.trim()) throw Error('任务关联无效或理由为空。');
      assigned.add(a.task_id);
      selections.push([...base, a.task_id, f.frame_id, f.relative_time_sec, f.absolute_time_sec, a.selection_reason]);
    }
  }
  for (const s of session.config.segments) {
    const base = [session.participant_id, session.session_id, s.video_id, s.segment_id]; const r = session.results[s.segment_id];
    for (const t of TASKS) {
      const count = session.frames.filter(f => f.segment_id === s.segment_id && f.task_assignments.some(a => a.task_id === t.id)).length;
      tasks.push([...base, t.id, count, count ? '' : r.zero[t.id]?.reason, count ? '' : r.zero[t.id]?.note]);
    }
    segments.push([...base, s.start_time_sec, s.end_time_sec, s.duration_sec, r.segment_completion_reason, true]);
  }
  root.file('frames.csv', csv(['participant_id','session_id','video_id','segment_id','frame_id','relative_time_sec','absolute_time_sec','image_path'], frames));
  root.file('selections.csv', csv(['participant_id','session_id','video_id','segment_id','task_id','frame_id','relative_time_sec','absolute_time_sec','selection_reason'], selections));
  root.file('task_results.csv', csv(['participant_id','session_id','video_id','segment_id','task_id','selected_count','zero_selection_reason','zero_selection_note'], tasks));
  root.file('segment_results.csv', csv(['participant_id','session_id','video_id','segment_id','start_time_sec','end_time_sec','duration_sec','segment_completion_reason','completed'], segments));
  root.file('metadata.json', JSON.stringify({ experiment_id: session.config.experiment_id, participant_id: session.participant_id, session_id: session.session_id, export_time: new Date().toISOString(), app_version: '1.0.0', tasks: TASKS, segments: session.config.segments, completed_segments: session.config.segments.map(s => s.segment_id) }, null, 2));
  return { name: name + '.zip', blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }) };
}
