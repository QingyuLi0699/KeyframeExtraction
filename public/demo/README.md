# 默认展示材料

当前默认展示素材由研究者提供：`practice.mp4`，约 90 秒。
网站使用 `practice-web.mp4`，为完整时长的 H.264/AAC 网页副本，720p、25 fps，未裁剪内容。前置 MP4 索引并按需读取，支持播放、拖动与截图。
原 HEVC 素材及之前指定的 `test.mp4` 保留在本机并通过 `.gitignore` 排除；仅发布当前网页副本。
默认配置位于 `src/defaultMaterials.ts`，时间起点为该展示文件起点 0 秒。
默认展示和独立练习分别配置、保存；导出结果以 `DEMO_builtin_preview` 和 `DEMO_` 编号标识用途。
