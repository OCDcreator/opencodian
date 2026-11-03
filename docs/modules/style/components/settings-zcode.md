# settings-zcode.css

> 源码: src/style/components/settings-zcode.css

ZCode 三个任务页面的局部布局。沿用 settings surface/spacing/text tokens，原生 Setting 表单与 details 展开；工具状态为可换行数据行。模型列表独立有界滚动、分组标题、选中/hover/焦点；按钮和表单在窄容器内换行。样式由 src/style/index.css 引入并通过 build:css 合并，禁止直接编辑生成 styles.css。

错误文字由 text-error 与前景 token 混合，保证明暗主题可读；输入占位用 text-muted 且 opacity 1，旧值说明不截断。

共享 API 表单的主操作使用 `text-normal` / `background-primary` 反色配对，避免宿主主题的 accent 与 text-on-accent 不匹配导致低对比度。

ZCode 经典宿主在设置容器不超过 720px 时，快捷导航随内容滚动，避免 200% 缩放下固定导航遮住表单。

API 服务模型清单采用默认收起的原生 details，展开后复用共享 ScrollArea；完整 ID 可选择复制且允许长值换行，展开高度不超过 40vh / 280px，编辑和删除按钮保持服务行顶部可达。
