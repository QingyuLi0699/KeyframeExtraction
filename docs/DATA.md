# 数据模型与导出字段

每次新实验生成独立 UUID `session_id`。参与者编号不作为会话唯一标识。IndexedDB 数据库 `festival-keyframe-lab` 的 `state` store 存储会话和研究者配置；原视频文件不入库。会话清除后不保留历史。

## 配置 JSON

`experiment_id` 为非空字符串。`segments` 为按实验顺序排列的非空数组：

|字段|类型|含义|
|---|---|---|
|video_id|string|原始视频编号，字母/数字/下划线/短横线|
|segment_id|string|本配置唯一片段编号，同上字符范围|
|filename|string|本地片段文件名，不含目录，大小写完全匹配|
|start_time_sec|number|片段在原始长视频的起点，非负|
|end_time_sec|number|片段在原始长视频的终点，大于起点|
|duration_sec|number|切分后文件实际时长，大于 0|
|title|string，可选|显示名称|

起止差与 duration_sec、浏览器实际时长与 duration_sec 均校验 0.25 秒容差。起点/终点来源是研究者切分记录，不能通过文件系统时间推算。

## ZIP

文件名为 `keyframe_experiment_PARTICIPANT_SESSIONID.zip`，内部同名根目录包含五份数据文件与 `frames/video_id/segment_id/frame_id.png`。

|文件|一行代表|字段|
|---|---|---|
|frames.csv|一张有效独立图片|participant_id, session_id, video_id, segment_id, frame_id, relative_time_sec, absolute_time_sec, image_path|
|selections.csv|一张图片在一个任务下的关联|participant_id, session_id, video_id, segment_id, task_id, frame_id, relative_time_sec, absolute_time_sec, selection_reason|
|task_results.csv|一个片段的一项任务，含 0 张|participant_id, session_id, video_id, segment_id, task_id, selected_count, zero_selection_reason, zero_selection_note|
|segment_results.csv|一个已完成片段|participant_id, session_id, video_id, segment_id, start_time_sec, end_time_sec, duration_sec, segment_completion_reason, completed|
|metadata.json|整个实验|experiment_id, participant_id, session_id, export_time, app_version, tasks, segments, completed_segments|

CSV 使用 UTF-8 BOM、CRLF，按 CSV 规则转义引号、逗号和换行。秒数输出十进制数字文本，无单位；导入分析软件时将两时间列转换为数值类型。所有单元格加引号以保证多行理由安全传输。研究者在 Excel 打开自由文本时应按文本导入，避免以等号开头的内容被当作公式。

`image_path` 相对于 ZIP 根目录。每张帧仅保存一次 PNG、仅出现一次 frames 行；多任务在 selections 各有一行，任务只能是 T1/T2/T3/T4。选帧任务的空原因列输出空字符串；未选帧任务仍输出 selected_count=0 和原因/补充说明。completed 为 true。

导出前检查：所有片段已完成，选择理由非空，零帧原因有效，其他原因补充非空，综合完成说明非空，frame_id 唯一、PNG Blob 非空且具备 PNG 签名、片段关联存在、任务不重复且属于固定四项、相对时间范围有效、绝对时间与起点之和一致。删除帧和解除关联不进入导出。导出只读取最终数据，不写入行为日志。
