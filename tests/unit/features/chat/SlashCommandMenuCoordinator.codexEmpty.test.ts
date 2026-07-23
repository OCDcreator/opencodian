/**
 * SlashCommandMenuCoordinator — Codex empty-skills selection behavior.
 *
 * When the Codex backend is active, the catalog has zero codex skills, and the
 * user selects the `/skills` capability entry, the coordinator must invoke
 * `onCodexSkillsEmpty` (actionable empty state) and clear the menu — never
 * leaving it blank.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { SlashCommandMenuItem } from '../../../../src/core/config/slashCommandCatalog';
import { SlashCommandMenuCoordinator } from '../../../../src/features/chat/services/SlashCommandMenuCoordinator';

function fakeTextarea(value = '/'): HTMLTextAreaElement {
  return {
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
    focus() {},
    setSelectionRange() {},
  } as unknown as HTMLTextAreaElement;
}

function skillsEntryItem(): SlashCommandMenuItem {
  return {
    id: 'skills',
    description: 'Browse Codex skills',
    hasProjectOverride: false,
    insertText: '/skills ',
    runtimeAvailable: false,
    source: 'skills-command',
    subtask: false,
    isBuiltin: false,
  };
}

function makeHost(overrides: Partial<SlashCommandMenuCoordinatorHostLike> = {}): SlashCommandMenuCoordinatorHostLike {
  return {
    getTextarea: () => fakeTextarea(),
    getMenuElement: () => null,
    getCatalogItems: () => null,
    setCatalogItems: () => undefined,
    loadItems: async () => [skillsEntryItem()],
    getSkillMode: () => 'skills-command',
    isCodexSkillMode: () => true,
    onCodexSkillsEmpty: jest.fn(),
    onMenuLoadFailed: () => undefined,
    onCatalogStateChanged: () => undefined,
    onMenuItemApplied: () => undefined,
    scheduleLayoutSync: () => undefined,
    ...overrides,
  } as SlashCommandMenuCoordinatorHostLike;
}

type SlashCommandMenuCoordinatorHostLike = {
  getTextarea(): HTMLTextAreaElement | null;
  getMenuElement(): HTMLElement | null;
  getCatalogItems(): SlashCommandMenuItem[] | null;
  setCatalogItems(items: SlashCommandMenuItem[] | null): void;
  loadItems(): Promise<SlashCommandMenuItem[]>;
  getSkillMode(): 'skills-command' | 'direct';
  isCodexSkillMode?(): boolean;
  onCodexSkillsEmpty?(): void;
  onMenuLoadFailed(error: unknown): void;
  onCatalogStateChanged(): void;
  onMenuItemApplied(): void;
  scheduleLayoutSync(): void;
};

describe('SlashCommandMenuCoordinator — Codex empty-skills selection', () => {
  it('invokes onCodexSkillsEmpty and clears when /skills is selected with no codex skills', async () => {
    const onCodexSkillsEmpty = jest.fn();
    const host = makeHost({
      getCatalogItems: () => [skillsEntryItem()], // no codex-skill items
      isCodexSkillMode: () => true,
      onCodexSkillsEmpty,
    });
    const coordinator = new SlashCommandMenuCoordinator(host as any);

    await coordinator.refresh();
    // Enter selects the highlighted /skills entry
    coordinator.tryHandleKeydown({ key: 'Enter', preventDefault: () => undefined } as unknown as KeyboardEvent);

    expect(onCodexSkillsEmpty).toHaveBeenCalledTimes(1);
  });

  it('does NOT invoke onCodexSkillsEmpty when codex skills exist (normal expand)', async () => {
    const onCodexSkillsEmpty = jest.fn();
    const codexSkill: SlashCommandMenuItem = {
      id: 'code-review',
      description: 'Review code',
      hasProjectOverride: false,
      insertText: '$code-review ',
      runtimeAvailable: true,
      source: 'codex-skill',
      subtask: false,
      isBuiltin: false,
    };
    const host = makeHost({
      getCatalogItems: () => [codexSkill, skillsEntryItem()],
      loadItems: async () => [codexSkill, skillsEntryItem()],
      isCodexSkillMode: () => true,
      onCodexSkillsEmpty,
    });
    const coordinator = new SlashCommandMenuCoordinator(host as any);

    await coordinator.refresh();
    // The /skills entry is last; select it explicitly.
    const lastIndex = (coordinator as any).visibleItems.length - 1;
    (coordinator as any).selectedIndex = lastIndex;
    coordinator.tryHandleKeydown({ key: 'Enter', preventDefault: () => undefined } as unknown as KeyboardEvent);

    expect(onCodexSkillsEmpty).not.toHaveBeenCalled();
  });

  it('does NOT invoke onCodexSkillsEmpty when not in Codex mode', async () => {
    const onCodexSkillsEmpty = jest.fn();
    const host = makeHost({
      getCatalogItems: () => [skillsEntryItem()],
      isCodexSkillMode: () => false,
      onCodexSkillsEmpty,
    });
    const coordinator = new SlashCommandMenuCoordinator(host as any);

    await coordinator.refresh();
    coordinator.tryHandleKeydown({ key: 'Enter', preventDefault: () => undefined } as unknown as KeyboardEvent);

    expect(onCodexSkillsEmpty).not.toHaveBeenCalled();
  });
});
