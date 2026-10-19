import type { Config } from './model';

export const DEMO_CONFIG: Config = {
  experiment_id: 'DEMO_builtin_preview',
  segments: [{ video_id: 'DEMO_VIDEO', segment_id: 'DEMO_S01', filename: 'demo.mp4', title: '内置演示视频（16 秒）', start_time_sec: 0, end_time_sec: 16, duration_sec: 16 }],
};
export function isDemoConfig(config?: Config): boolean {
  if (!config || config.experiment_id !== DEMO_CONFIG.experiment_id || config.segments.length !== 1) return false;
  const segment = config.segments[0]; const demo = DEMO_CONFIG.segments[0];
  return segment.video_id === demo.video_id && segment.segment_id === demo.segment_id && segment.filename === demo.filename && segment.start_time_sec === 0 && segment.end_time_sec === 16 && segment.duration_sec === 16;
}
export function demoVideoFiles(): Record<string, string> {
  return { 'demo.mp4': new URL(`${import.meta.env.BASE_URL}demo/demo.mp4`, location.origin).href };
}
export function demoFileStatus(): Record<string, string> { return { DEMO_S01: '已就绪' }; }
