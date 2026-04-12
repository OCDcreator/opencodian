import { QuestionDock } from '../ui/QuestionDock';

type QuestionDockPort = Pick<QuestionDock, 'render'>;

export interface QuestionDockSlotCoordinatorHost {
  shouldUseAboveInputQuestionDock(): boolean;
}

export class QuestionDockSlotCoordinator {
  private mountEl: HTMLElement | null = null;
  private dock: QuestionDock | null = null;

  constructor(
    private readonly host: QuestionDockSlotCoordinatorHost,
    private readonly renderDock: () => void,
  ) {}

  attach(parentEl: HTMLElement): void {
    this.destroy();
    this.mountEl = parentEl.createDiv({ cls: 'opencodian-question-dock-slot' });
    this.dock = new QuestionDock(this.mountEl);
    this.render();
  }

  render(): void {
    if (!this.dock) {
      return;
    }

    this.renderDock();
  }

  destroy(): void {
    this.dock?.destroy();
    this.dock = null;
    this.mountEl?.remove();
    this.mountEl = null;
  }

  getQuestionDock(): QuestionDockPort | null {
    return this.dock;
  }

  shouldUseAboveInputQuestionDock(): boolean {
    return this.host.shouldUseAboveInputQuestionDock();
  }
}
