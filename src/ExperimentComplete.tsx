import type { Session } from './model';
import { isDemoConfig } from './defaultMaterials';

interface Props {
  session: Session;
  saveStatus: string;
  busy: boolean;
  exported: boolean;
  onExport: () => void;
  onReview: () => void;
  onRetry: () => void;
  onClear: () => void;
}
export default function ExperimentComplete({ session, saveStatus, busy, exported, onExport, onReview, onRetry, onClear }: Props) {
  const failed = saveStatus.startsWith('保存失败');
  const saving = saveStatus === '正在保存…';
  return <main className="prepare completion-page"><section className="panel">
    <span className="eyebrow">EXPERIMENT COMPLETE</span>
    <h2>实验已完成</h2>
    <p>{isDemoConfig(session.config) ? '演示已完成！当前结果仅用于展示平台操作效果，不作为正式研究数据。' : '感谢您的参与！所有正式视频片段均已提交。'}</p>
    <div className="completion-summary">
      <div><small>参与者编号</small><strong>{session.participant_id}</strong></div>
      <div><small>已提交片段</small><strong>{session.config.segments.length} / {session.config.segments.length}</strong></div>
      <div><small>独立关键帧</small><strong>{session.frames.length} 张</strong></div>
    </div>
    <p role="status" className={failed ? 'danger-text' : 'success'}>{saveStatus}</p>
    {failed && <button onClick={onRetry}>重试保存</button>}
    <p>请导出实验结果 ZIP，并将文件交给研究者。数据保存在当前浏览器中，不会自动上传。</p>
    {exported ? <p className="muted">已发起 ZIP 下载。请确认文件已成功下载并检查内容，再清除本机会话。</p> : <p className="muted">导出前请保留当前浏览器中的实验数据。</p>}
    <div className="completion-actions">
      <button className="primary" disabled={busy || failed || saving} onClick={onExport}>导出实验结果</button>
      <button disabled={busy} onClick={onReview}>返回检查结果</button>
      {exported && <button disabled={busy || failed || saving} onClick={onClear}>核对并清除会话</button>}
    </div>
  </section></main>;
}
