import { type ChildProcess,spawn } from 'node:child_process';

import { createLogger } from '../../shared';
import type { AcpAgentConfig, AcpConnectionState } from './types';

const logger = createLogger('AcpClientManager');

interface AcpManagedAgent {
  config: AcpAgentConfig;
  state: AcpConnectionState;
  process: ChildProcess | null;
  activeSessionId: string | null;
}

export class AcpClientManager {
  private readonly agents = new Map<string, AcpManagedAgent>();

  loadConfigs(configs: AcpAgentConfig[]): void {
    const configIds = new Set(configs.map((config) => config.id));

    for (const config of configs) {
      const existing = this.agents.get(config.id);
      if (existing) {
        existing.config = config;
      } else {
        this.agents.set(config.id, {
          config,
          state: 'disconnected',
          process: null,
          activeSessionId: null,
        });
      }
    }

    for (const id of this.agents.keys()) {
      if (!configIds.has(id)) {
        this.disconnect(id);
        this.agents.delete(id);
      }
    }
  }

  listAgents(): AcpAgentConfig[] {
    return Array.from(this.agents.values(), (agent) => agent.config);
  }

  getState(agentId: string): AcpConnectionState {
    return this.agents.get(agentId)?.state ?? 'disconnected';
  }

  async connect(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`ACP agent not found: ${agentId}`);
    }
    if (agent.state === 'connected' || agent.state === 'connecting') {
      return;
    }

    agent.state = 'connecting';
    try {
      const childProcess = spawn(agent.config.command, agent.config.args, {
        cwd: agent.config.cwd,
        env: { ...process.env, ...agent.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      childProcess.on('error', (error) => {
        logger.error(`ACP agent ${agentId} process error:`, error);
        agent.state = 'error';
      });

      childProcess.on('exit', (code) => {
        logger.info(`ACP agent ${agentId} exited with code ${code}`);
        agent.state = 'disconnected';
        agent.process = null;
      });

      agent.process = childProcess;
      agent.state = 'connected';
      logger.info(`ACP agent ${agentId} (${agent.config.name}) connected`);
    } catch (error) {
      logger.error(`Failed to connect ACP agent ${agentId}:`, error);
      agent.state = 'error';
      throw error;
    }
  }

  disconnect(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return;
    }

    if (agent.process) {
      try {
        agent.process.kill();
      } catch (error) {
        logger.debug(`ACP agent ${agentId} process kill ignored:`, error);
      }
      agent.process = null;
    }

    agent.state = 'disconnected';
    agent.activeSessionId = null;
  }

  getProcess(agentId: string): ChildProcess | null {
    return this.agents.get(agentId)?.process ?? null;
  }

  setActiveSessionId(agentId: string, sessionId: string | null): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.activeSessionId = sessionId;
    }
  }

  dispose(): void {
    for (const id of this.agents.keys()) {
      this.disconnect(id);
    }
    this.agents.clear();
  }
}
