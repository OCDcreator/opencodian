# CanvasLayout

> **源码**: `src/core/canvas/CanvasLayout.ts`
> **状态**: [REVIEW]

## 概述

R-C5 确定性画布布局（决策已定案：网格/分层，非力导向）。常量与库内实测画布文件一致：节点 360×160、间距 60、group 内边距 40。纯函数、无随机、无时钟——同输入恒同输出，因此布局可做黄金值断言，"节点不重叠"（验收 1）可用 `rectsOverlap` 做程序化几何断言。

## 关键导出

| 导出 | 说明 |
|------|------|
| `layoutGrid(count)` | ≤4 节点单行；≥5 每 3 个换行（阅读序：左→右、上→下） |
| `layoutGroupedColumns(sizes)` | AI 拆分模式：每组一列纵向堆叠、组间横向排列、group 节点包边 |
| `rectsOverlap(a, b)` | 几何相交判定（测试与重叠防护共用） |
| `CANVAS_*` 常量 | 节点尺寸/间距/分组内边距/列数/单行上限 |

## 边界与约束

- 纯模块，零 Obsidian 导入；黄金断言 n=1/3/4/5/7/20 + 分组几何不重叠（`tests/unit/core/canvas/CanvasLayout.test.ts`）。
- 分组布局保证：组内节点不重叠、组间互不重叠、节点严格落在自己的 group 矩形内（单测逐条钉住）。
