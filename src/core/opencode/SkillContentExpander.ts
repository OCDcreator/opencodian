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

export interface SkillSyntheticPart {
  text: string;
  skillName: string;
}

export interface SkillExpansionResult {
  readonly syntheticParts: SkillSyntheticPart[];
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
   * Supports `/` in skill names (e.g., `x-reader/video`).
   */
  async expand(content: string): Promise<SkillExpansionResult> {
    const skills = await this.loadSkills();
    const skillNames = this.extractSkillNames(content, skills);
    if (skillNames.length === 0) {
      return { syntheticParts: [], expandedSkillNames: [] };
    }

    const knownNames = new Set(skills.map((s) => s.name));
    const skillMap = new Map(skills.map((s) => [s.name, s]));

    const syntheticParts: SkillSyntheticPart[] = [];
    const expandedSkillNames: string[] = [];

    for (const name of skillNames) {
      if (!knownNames.has(name)) {
        continue;
      }
      const skill = skillMap.get(name);
      if (skill) {
        syntheticParts.push(this.wrapSkillContent(skill));
        expandedSkillNames.push(name);
      }
    }

    return { syntheticParts, expandedSkillNames };
  }

  /**
   * Extract potential skill names from content by matching against the known
   * skill catalog. Skills are matched longest-first to prevent shorter names
   * from shadowing longer ones (e.g., `x-reader` vs `x-reader/video`).
   */
  extractSkillNames(content: string, skills: SkillRecord[]): string[] {
    // Sort skills by name length descending so longest names match first
    const sortedSkills = [...skills].sort((a, b) => b.name.length - a.name.length);

    const matchedRanges: Array<{ start: number; end: number }> = [];
    const names: string[] = [];
    const seen = new Set<string>();

    for (const skill of sortedSkills) {
      if (seen.has(skill.name)) {
        continue;
      }

      // Build regex: match /<skillName> at a word boundary
      // Escape the skill name for regex (handles / in names like x-reader/video)
      const escapedName = skill.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`/${escapedName}\\b`, 'g');

      let match: RegExpExecArray | null;
      while ((match = regex.exec(content)) !== null) {
        const matchStart = match.index;
        const matchEnd = match.index + match[0].length;

        // Check for overlapping matches
        const overlaps = matchedRanges.some(
          (range) => matchStart < range.end && matchEnd > range.start,
        );
        if (overlaps) {
          continue;
        }

        matchedRanges.push({ start: matchStart, end: matchEnd });
        seen.add(skill.name);
        names.push(skill.name);
        break; // Only take first non-overlapping match per skill
      }
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

  private wrapSkillContent(skill: SkillRecord): SkillSyntheticPart {
    return {
      text: `<skill_content name="${this.escapeXml(skill.name)}">\n${skill.content}\n</skill_content>`,
      skillName: skill.name,
    };
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
