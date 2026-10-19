import { TASKS } from './model';

export default function TaskIntro() {
  return <section className="panel instructions">
    <div className="section-title"><span className="section-no">01</span><h2>了解实验任务</h2></div>
    <div className="instruction-scroll" tabIndex={0} aria-label="实验任务背景与四项任务说明">
      <div className="task-background"><h3>实验任务背景</h3>
        <p>假设您正在为传统节日视频资源库整理关键帧材料。资源库希望通过具有代表性的画面，帮助其他用户快速了解视频片段的主要内容、活动过程、文化特色以及现场氛围。</p>
        <p>本实验将提供若干传统节日视频片段，请您观看视频，并根据以下四项信息任务，自主选择能够有效呈现相应信息的关键帧。您可以根据需要播放、暂停、回看视频，并在认为合适的时间点选择画面。</p>
        <p>本实验关注的是您在不同信息任务下的实际选择过程与判断方式，没有唯一正确的选帧答案。请根据您对任务的理解独立完成选择。</p>
      </div>
      <div className="rule">每项任务可以选择 <b>0 张或多张</b>关键帧，不要求覆盖所有任务；同一帧可以用于多个任务。选帧数量由你自主决定。</div>
      <div className="task-definitions">{TASKS.map(t => <article key={t.id}><span className="task-code">{t.id}</span><div><h3>{t.title}</h3><p><b>任务目标：</b>{t.description}</p><p className="task-reference"><b>参考说明：</b>{t.reference}</p></div></article>)}</div>
      <p className="muted">关键帧必须取自当前视频。每项任务的选择理由单独填写，未选帧时说明原因即可。</p>
    </div>
  </section>;
}
