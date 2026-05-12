import { createLogger } from '../../../shared';

const logger = createLogger('SkillCatalogService');

export interface SkillInfo {
  name: string;
  description?: string;
  location: string;
  content: string;
}

export interface SkillSourceGroups {
  project: SkillInfo[];
  global: SkillInfo[];
  builtin: SkillInfo[];
  claude: SkillInfo[];
  agents: SkillInfo[];
}

export interface SkillCatalogServiceHost {
  fetchSkills(): Promise<SkillInfo[]>;
  getCacheTtl(): number;
}

export class SkillCatalogService {
  private cachedSkills: SkillInfo[] | null = null;
  private cacheTimestamp = 0;
  private pendingLoad: Promise<SkillInfo[]> | null = null;

  constructor(private readonly host: SkillCatalogServiceHost) {}

  async getAll(): Promise<SkillInfo[]> {
    const now = Date.now();
    const cacheTtl = this.host.getCacheTtl();

    if (this.cachedSkills && now - this.cacheTimestamp < cacheTtl) {
      return this.cachedSkills;
    }

    if (this.pendingLoad) {
      return this.pendingLoad;
    }

    this.pendingLoad = this.loadSkills();

    try {
      return await this.pendingLoad;
    } finally {
      this.pendingLoad = null;
    }
  }

  async getByName(name: string): Promise<SkillInfo | undefined> {
    const skills = await this.getAll();
    return skills.find((skill) => skill.name === name);
  }

  async refresh(): Promise<SkillInfo[]> {
    this.cachedSkills = null;
    this.cacheTimestamp = 0;
    return this.getAll();
  }

  async groupBySource(): Promise<SkillSourceGroups> {
    const skills = await this.getAll();
    const groups: SkillSourceGroups = {
      project: [],
      global: [],
      builtin: [],
      claude: [],
      agents: [],
    };

    for (const skill of skills) {
      const source = this.classifySource(skill.location);
      groups[source].push(skill);
    }

    return groups;
  }

  private classifySource(location: string): keyof SkillSourceGroups {
    if (location === 'builtin') {
      return 'builtin';
    }

    if (location.includes('.config/opencode/skills')) {
      return 'global';
    }

    if (location.includes('.claude/skills')) {
      return 'claude';
    }

    if (location.includes('.agents/skills')) {
      return 'agents';
    }

    return 'project';
  }

  private async loadSkills(): Promise<SkillInfo[]> {
    try {
      const skills = await this.host.fetchSkills();
      this.cachedSkills = skills;
      this.cacheTimestamp = Date.now();
      return skills;
    } catch (error) {
      logger.error('Failed to fetch skills:', error);
      return this.cachedSkills ?? [];
    }
  }
}
