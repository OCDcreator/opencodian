import fs from 'fs';
import path from 'path';
import process from 'process';

export const CLAUDE_AGENT_SDK_PACKAGE = '@anthropic-ai/claude-agent-sdk';

export function pruneClaudeAgentSdkRuntimeArtifacts(_root = process.cwd(), distDir = path.join(_root, 'dist')) {
  const anthropicDir = path.join(distDir, 'node_modules', '@anthropic-ai');
  const removed = [];
  if (!fs.existsSync(anthropicDir)) {
    return removed;
  }

  for (const entry of fs.readdirSync(anthropicDir)) {
    if (entry !== 'claude-agent-sdk' && !entry.startsWith('claude-agent-sdk-')) {
      continue;
    }
    const destinationPath = path.join(anthropicDir, entry);
    fs.rmSync(destinationPath, { recursive: true, force: true });
    removed.push(destinationPath);
  }
  return removed;
}
