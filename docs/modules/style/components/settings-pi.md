# Pi settings styles

> 源码: src/style/components/settings-pi.css

Pi设置表单继承现有settings layout token、主机背景/文字/边框。补充可伸缩原生JSON编辑器、多行表单、details模型编辑、状态文本和键盘focus。窄设置窗内允许换行且不横向溢出，不重写其他后端样式。

通过src/style/index.css进入现有CSS合并流程；Test Vault同时检查宽编辑区和窄窗口。

Pi内部相邻配置卡片统一使用--opencodian-settings-space-lg（12px）垂直间距，包括嵌套表单容器；不能依赖外层section gap使卡片相贴。
