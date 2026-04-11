# 可直接复制的新会话启动提示词（维护性第二阶段）

把下面这段直接贴给新会话里的大模型即可：

```text
请继续推进 OpenCodian 的可维护性优化第二阶段。

先阅读并严格遵循：
1. AGENTS.md
2. docs/status/maintainability-phase-1.md

这次不要重复做第一阶段已经完成的内容；请基于现有改动继续优化。第二阶段优先目标是继续拆分 src/features/chat/OpenCodianView.ts，并保持“渐进式提取 + 同步补测试”，不要做一次性重写。

本轮请先：
- 阅读 docs/status/maintainability-phase-1.md 中列出的第二阶段方向与任务顺序
- 优先关注 OpenCodianView 的 tab / conversation 装载编排、model selector 逻辑、消息区重渲编排
- 先补即将改动路径的测试，再做提取
- 复用第一阶段已经抽出的 helper，而不是把逻辑重新塞回 OpenCodianView
  - src/features/chat/services/ScrollManager.ts
  - src/features/chat/ui/modelSelectorStickyHeaders.ts

明确约束：
- 不要回退现有 CI、lint 规则、ScrollManager、sticky header cleanup 方案
- 不要修改用户可见设置 schema、存储格式、OpenCode 协议，除非确有必要且有证据
- 不要顺手处理无关 warning；只消化与你本轮拆分直接相关的 warning
- 不要动 reference-projects/

建议执行顺序：
1. 确认并补充 OpenCodianView 下一批切口的测试
2. 提取 tab / conversation 装载编排
3. 如仍有余量，再提取 model selector 逻辑
4. 更新对应 docs/modules 文档
5. 运行必要验证

验证要求：
- 至少运行 npm run lint、npm run typecheck、npm run test
- 只有在改到运行时代码 / 样式 / 构建链时，再运行 npm run build
- 如果运行了 npm run build，必须立即按 AGENTS.md 里的规则部署到 Test Vault 并验证 BUILD_ID

开始前先给出一个简短计划，然后直接实施。
```

## 用途

- 这是一份“短启动提示”，用于新会话快速接住第一阶段成果
- 完整背景、已完成项和第二阶段详细方向，请看 `docs/status/maintainability-phase-1.md`
