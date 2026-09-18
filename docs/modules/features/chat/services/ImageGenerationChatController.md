# ImageGenerationChatController

> **源码**: `src/features/chat/services/ImageGenerationChatController.ts`
> **状态**: [REVIEW]

## 概述

`ImageGenerationChatController` 是 R-C2 聊天入口的编排层（`feature.chat-services` owner）。与行内入口的关键差异是**写顺序**（设计 §3.5 步骤 3）：聊天没有锚点语义，先生成、结果挂在卡片上；W-asset 与 W-ref **延迟到显式点击"插入"时**才发生——未插入就关闭卡片不会在磁盘上留下任何文件（这是聊天路径对 §4.6 孤儿策略的回答）。聊天**从不**自动改写任何笔记。

失败语义与行内入口同一矩阵：生成失败零副作用；W-asset 失败则文档零改动；无激活编辑器时什么都不写并提示；W-ref（`editor.replaceRange`）失败时资产保留并提示实际路径。插入目标是激活 markdown 编辑器的光标处（`getCursor` + 单次 `replaceRange` = 单步 Obsidian 撤销）；点击到插入之间无异步锚点间隙，因此不适用快照脏检查（行内入口专属）。

D2 record-then-close：`replaceRange` 成功后先 `noteReferenceWrite(notePath)`（显式登记引用写入，不依赖 Obsidian autosave 的事件时序）、再 `endAssetCapture()` 关闭 R-B3 插件资产轮次——一键回退即时可用；W-ref 抛错分支只调 `endAssetCapture()`（无引用写入可登记），轮次同样立即关闭。两者为可选 port 成员（聊天侧 double 保持有效），由组合根接到 `EditRevertService.notePluginWrite` / `endBatchCapture`。

## 对外 API

```typescript
interface ImageGenerationChatPorts {
  getConfiguration(); generate(model, prompt, signal?); saveAsset(bytes, mime, baseName);
  trashAsset(path); registerAsset(assetPath, notePath);
  noteReferenceWrite?(notePath); endAssetCapture?();
  resolveInsertTarget(): { editor: Editor; notePath: string } | null;
  notify(message);
}

class ImageGenerationChatController {
  listModels(): readonly ImageGenerationModelConfig[];
  generate(prompt, model?): Promise<ChatImageGenerationOutcome>;
  insertIntoActiveNote(candidate, form: 'line' | 'inline'): Promise<boolean>;
}
```

## 关联模块

- `../ui/ImageGenerationModal.ts`：生成卡片（提示词/模型/结果/插入/复制/重新生成）。
- `ComposerInputShellCoordinator.ts`：composer 按钮（`onRequestImageGeneration` host 回调）。
- `SlashCommandExecutionService.ts`：`/image` 命令拦截，经 `ChatRuntimeComposition` 转发到组合根的 `openImageGenerationCard(prefill)`。
- `src/main.ts`：ports 的组合实现与卡片打开。
