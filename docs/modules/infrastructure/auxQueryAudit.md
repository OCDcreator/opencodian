

2026-10-08：Windows Codex native stop 后 cwd 的短时 EBUSY 由最终 audit cleanup 的最多 2 秒重试处理；只重试最初已验证为空的 owned vault 非递归 rmdir，每次重查空目录，新增 residue 或持续失败仍 audit failed。权限/拒写/字节/ephemeral/session 残留门禁保持不变。
