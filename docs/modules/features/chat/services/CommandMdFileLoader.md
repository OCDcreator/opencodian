# CommandMdFileLoader

> **源码**: `src/features/chat/services/CommandMdFileLoader.ts`
> **状态**: [REVIEW]

## 概述

`CommandMdFileLoader` 从项目 `.opencode/commands/**/*.md` 读取 Markdown slash command 定义，并转换成 composer slash catalog 可消费的 `CommandMdFile` 条目。

## 关键行为

- 只在传入目录存在且是 directory 时读取，无法访问时返回空数组并记录 warn
- 递归收集 `.md` 文件，文件名去掉 `.md` 后作为 command id，子目录用 `:` 拼接
- 支持可选 YAML frontmatter，只读取简单的 `key: value` 字符串字段；`description` 会作为命令描述
- frontmatter 后的 body 作为 command template，保留 `$VARIABLE` 等运行时占位语法
- 返回结果按 id 排序，单个文件读取失败不会阻断其他命令

## 边界

- 本模块只做本地文件读取与轻量解析，不执行命令、不展开模板，也不写入 `.opencode` 配置
- 调用方负责传入项目 commands 目录，并把结果合并进 slash command catalog
