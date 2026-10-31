# session-workbench

> 源码：`src/style/components/session-workbench.css`
> Owner：style

## 职责与边界

工作台主题样式。320px 默认内容高度浮层、34px 摘要胶囊、32px 列表行、16px shell 圆角与 26px ghost controls；颜色和字体继承宿主。概览收起额外标题/tabs，空计划/任务不占版面。展开与停靠、主区域工具、内联会话文件列表、composer Goal 行及 reduced-motion 样式同处维护。

## 验证

聚焦测试、类型检查、lint、模块文档与图刷新均为修改期门禁。真实模型/宿主行为验收见 `.scratch/goal-agent-workbench-20261030/evidence/`；未验收能力不得由单测替代。

## 会话信息面板（2026-10-31）

新增真实用量 progress、紧凑统计行、截断但可查看完整值的折叠摘要、原生子会话文本/工具布局和键盘焦点样式，全部复用 Obsidian 颜色及排版 token。

composer Goal 行不带底部分隔线。已完成目标的关闭按钮保持独立点击区域，隐藏状态不占布局；目标按钮的完成/受阻语义色继承宿主 token，SVG 使用 OpenChamber 原始箭靶路径。目标详情视图沿用同一面板的边界、滚动与键盘行为。

目标入口使用纯 SVG 按钮：默认、悬停、按下和焦点均无边框、底色或阴影。颜色只由真实目标/预备状态驱动：信息蓝、暂停灰、受阻/限制警告色、完成成功色；SVG 继承 currentColor，悬停不覆盖语义颜色。键盘焦点只轻微放大 SVG，保持颜色及中心坐标。26px 点击区域与同一状态行的上下文圆环一致，SVG 外层显式 flex 居中与零行高，避免宿主通用按钮样式和基线排版造成偏移。
