# InlineEditDiff

> **源码**: `src/features/inline-edit/InlineEditDiff.ts`
> **状态**: [REVIEW]

## 概述

inline edit 预览用的词级 diff：自研 LCS（无依赖）+ 中日韩感知分词 + 超限降级（`docs/requirements/inline-edit.md` §7.7）。

## 职责

- `tokenizeForDiff()`：空白 run、换行、单个 CJK 字符、标点、其它连续非空白序列各自成 token。换行与空白是独立 token，保证 markdown 结构（列表符号、代码块围栏）不会被对齐重排
- `computeWordDiff()`：`Uint32Array` LCS 表 + 回溯，相邻同类操作合并；返回 `null` 表示超限
- `canComputeWordDiff()`：任一输入超过 40,000 字符或 token 乘积超过 4×10⁶ 时拒绝计算
- `isDiffEmpty()`：判断两侧是否等价
- `renderDiffInto()`：把 ops 渲染进容器；不可计算时降级为整段 before/after 视图并返回 `false`

## 依赖

- 无（纯计算 + DOM 写入）

## 维护约束

- LCS 是 O(n×m)，**必须**保留上限判定；降级视图是有意的可接受结果，不要在超限时强行计算
- 分词顺序敏感：空白/换行必须排在通用序列之前，否则换行会被吸进词里，中文对齐也会失效
- 中文按字对齐，因此 `很 → 非常` 这类替换会显示为"删除 1 字 + 插入 2 字"，这是正确行为而不是缺陷
- 单测覆盖等价、纯增、纯删、混合、中英混排、结构保留与超限判定
