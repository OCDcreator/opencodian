# ProjectConfigFileWatcher

> **源码**: `src/features/settings/ProjectConfigFileWatcher.ts`
> **状态**: [REVIEW]

## 概述

`ProjectConfigFileWatcher` 是 settings 层的项目配置文件监听 owner。它把 Obsidian vault 事件、vault 相对路径匹配、rename 双向匹配和事件清理从具体 settings section 中隔离出来，供项目级 `.opencode/opencode.json` 这类配置 UI 在页面打开期间响应外部文件变更。

## 核心逻辑

- `start()` 先清理旧监听，再用 `getVaultBasePath(app)` 和传入的绝对 `configPath` 计算 vault 相对路径。
- 如果配置文件不在当前 vault 内，直接跳过注册，避免监听错误项目。
- 注册 vault `create` / `modify` / `delete` / `rename` 事件；普通事件只匹配当前文件路径，rename 同时匹配新路径和旧路径。
- 命中目标配置路径时使用轻量 debounce 合并短时间内的重复事件，再调用 `onChange()`，由调用方决定是否重新读取配置或刷新 UI。
- `onChange()` 支持同步或 Promise 回调；Promise rejection / 同步异常会记录到 watcher 日志，避免形成未处理异常。
- `dispose()` 通过 `app.vault.offref()` 释放所有事件引用，并清理尚未触发的 debounce timer，防止设置页重绘或关闭后留下重复监听。

## 关键方法

| 方法 | 说明 |
|------|------|
| `start()` | 解析目标配置路径并注册 vault 文件事件 |
| `dispose()` | 清理本 watcher 注册过的全部 vault 事件与 pending change timer |

## 与其他模块的交互

- `SettingsConversationSection.ts`: 用它监听当前项目 `.opencode/opencode.json`，外部改动时重读 compaction config 并刷新控件。
- `shared/vault.ts`: 通过 `getVaultBasePath()` 获取当前 vault 的绝对根路径。

## 注意事项

- 本 watcher 不读取、不解析、不写入配置文件；它只负责“目标文件发生变化”的事件边界。
- `onChange()` 可以是同步或异步回调；watcher 只负责捕获并记录错误，不负责重试。
- 如果未来其他 settings section 也需要监听项目配置文件，应优先复用这个 watcher，而不是在 section 内直接注册 vault 事件。
