import {
  type ComposerContextChipState,
} from '../composerContext';
import type { ComposerContextChipActionService } from './ComposerContextChipActionService';

export interface ComposerContextCoordinatorHost {
  getContextChipStates(): ComposerContextChipState[];
}

export class ComposerContextCoordinator {
  private contextRowEl: HTMLElement | null = null;

  constructor(
    private readonly host: ComposerContextCoordinatorHost,
    private readonly chipActionService: Pick<ComposerContextChipActionService, 'handleChipClick'>,
  ) {}

  setContextRowElement(contextRowEl: HTMLElement | null): void {
    this.contextRowEl = contextRowEl;
    this.render();
  }

  render(): void {
    if (!this.contextRowEl) {
      return;
    }

    const chipStates = this.host.getContextChipStates();

    this.contextRowEl.replaceChildren();
    this.contextRowEl.classList.toggle('is-empty', chipStates.length === 0);
    if (chipStates.length === 0) {
      return;
    }

    for (const chipState of chipStates) {
      const chipEl = document.createElement('button');
      chipEl.className = 'opencodian-composer-context-chip';
      chipEl.type = 'button';
      chipEl.textContent = chipState.label;
      chipEl.title = chipState.path;
      chipEl.setAttribute('aria-pressed', String(chipState.attached));

      chipEl.classList.toggle('is-preview', chipState.preview);
      chipEl.classList.toggle('is-attached', !chipState.preview);
      chipEl.classList.toggle('is-selection', Boolean(chipState.lineRange));
      chipEl.addEventListener('click', () => {
        void this.chipActionService.handleChipClick(chipState);
      });

      this.contextRowEl.appendChild(chipEl);
    }
  }
}
