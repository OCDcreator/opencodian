import { createLogger } from '../../shared';

const logger = createLogger('SkillContentExpander');

export interface SkillRecord {
  name: string;
  description: string;
  location: string;
  content: string;
}

export interface SkillContentExpanderHost {
  loadSkills(): Promise<SkillRecord[]>;
}

export interface SkillExpansionResult {
  /** Skill content blocks to inject as synthetic text parts. */
  readonly syntheticBlocks: string[];
  /** Names of skills that were found and expanded. */
  readonly expandedSkillNames: string[];
}

export class SkillContentExpander {
  private skillCache: SkillRecord[] | null = null;
  private cacheTimestamp = 0;
  private readonly cacheTtlMs = 60_000;

  constructor(private readonly host: SkillContentExpanderHost) {}

  /**
   * Analyze content for skill references and return expansion blocks.
   *
   * Only `/name` tokens that match known skills in the catalog are expanded.
   * False positives like paths, URLs, and markdown links are ignored.
   */
  async expand(content: string): Promise<SkillExpansionResult> {
    const skillNames = this.extractSkillNames(content);
    if (skillNames.length === 0) {
      return { syntheticBlocks: [], expandedSkillNames: [] };
    }

    const skills = await this.loadSkills();
    const knownNames = new Set(skills.map((s) => s.name));
    const skillMap = new Map(skills.map((s) => [s.name, s]));

    const syntheticBlocks: string[] = [];
    const expandedSkillNames: string[] = [];

    for (const name of skillNames) {
      if (!knownNames.has(name)) {
        continue;
      }
      const skill = skillMap.get(name);
      if (skill) {
        syntheticBlocks.push(this.wrapSkillContent(skill));
        expandedSkillNames.push(name);
      }
    }

    return { syntheticBlocks, expandedSkillNames };
  }

  private extractSkillNames(content: string): string[] {
    const names: string[] = [];
    const seen = new Set<string>();

    // Match /name at token boundaries.
    // Reject: // (comments), paths with multiple /, URLs (://), markdown links [text](/url)
    const regex = /(^|[\s(])(\/[^\s/]+)(?=[\s)]|$)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const token = match[2]; // e.g. "/skill1"
      const name = token.slice(1); // remove leading /
      if (!name || seen.has(name)) {
        continue;
      }
      // Reject URLs (://) and paths with multiple slashes
      if (content.slice(match.index + match[1].length + token.length).startsWith('/')) {
        continue;
      }
      seen.add(name);
      names.push(name);
    }

    return names;
  }

  private async loadSkills(): Promise<SkillRecord[]> {
    const now = Date.now();
    if (this.skillCache && now - this.cacheTimestamp < this.cacheTtlMs) {
      return this.skillCache;
    }

    try {
      const skills = await this.host.loadSkills();
      this.skillCache = skills;
      this.cacheTimestamp = now;
      return skills;
    } catch (error) {
      logger.debug('Failed to load skills for expansion:', error);
      return this.skillCache ?? [];
    }
  }

  private wrapSkillContent(skill: SkillRecord): string {
    return `<skill name="${this.escapeXml(skill.name)}" description="${this.escapeXml(skill.description)}">\n${skill.content}\n</skill>`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
