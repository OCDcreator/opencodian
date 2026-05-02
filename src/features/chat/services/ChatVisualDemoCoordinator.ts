import { Notice } from 'obsidian';

import { createLogger } from '../../../shared';
import { GlassOctahedronDemoController } from '../glassOctahedronDemo';
import { LiquidDiamondDemoController } from '../liquidDiamondDemo';

const logger = createLogger('ChatVisualDemo');

export interface ChatVisualDemoCoordinatorHost {
  getMessagesShellEl(): HTMLElement | null;
}

export class ChatVisualDemoCoordinator {
  private glassOctahedronDemoController: GlassOctahedronDemoController | null = null;
  private liquidDiamondDemoController: LiquidDiamondDemoController | null = null;
  private liquidDiamondWebGlDemoController: LiquidDiamondDemoController | null = null;

  constructor(private readonly host: ChatVisualDemoCoordinatorHost) {}

  toggleLiquidDiamondDemo(): void {
    this.toggleLiquidDiamondDemoVariant('cpu');
  }

  toggleLiquidDiamondWebGlDemo(): void {
    this.toggleLiquidDiamondDemoVariant('webgl');
  }

  async toggleGlassOctahedron(): Promise<void> {
    const messagesShellEl = this.host.getMessagesShellEl();
    if (!messagesShellEl) {
      return;
    }

    if (!this.glassOctahedronDemoController) {
      this.glassOctahedronDemoController = new GlassOctahedronDemoController(messagesShellEl);
    }

    if (this.glassOctahedronDemoController.isVisible()) {
      this.destroyGlassOctahedronDemo();
      return;
    }

    try {
      await this.glassOctahedronDemoController.show();
    } catch (error) {
      logger.warn('Failed to initialize glass octahedron demo', error);
      new Notice(
        'Glass octahedron is not available in this environment. See developer console for details.',
      );
      this.destroyGlassOctahedronDemo();
    }
  }

  destroyAll(): void {
    this.destroyLiquidDiamondDemo();
    this.destroyGlassOctahedronDemo();
  }

  private toggleLiquidDiamondDemoVariant(backend: 'cpu' | 'webgl'): void {
    const messagesShellEl = this.host.getMessagesShellEl();
    if (!messagesShellEl) {
      return;
    }

    const activeController =
      backend === 'webgl'
        ? this.liquidDiamondWebGlDemoController
        : this.liquidDiamondDemoController;
    const otherController =
      backend === 'webgl'
        ? this.liquidDiamondDemoController
        : this.liquidDiamondWebGlDemoController;

    if (!activeController) {
      const controller = new LiquidDiamondDemoController(messagesShellEl, backend);
      if (backend === 'webgl') {
        this.liquidDiamondWebGlDemoController = controller;
      } else {
        this.liquidDiamondDemoController = controller;
      }
    }

    const nextActiveController =
      backend === 'webgl'
        ? this.liquidDiamondWebGlDemoController
        : this.liquidDiamondDemoController;
    if (!nextActiveController) {
      return;
    }

    if (nextActiveController.isVisible()) {
      nextActiveController.destroy();
      if (backend === 'webgl') {
        this.liquidDiamondWebGlDemoController = null;
      } else {
        this.liquidDiamondDemoController = null;
      }
      return;
    }

    otherController?.destroy();
    if (backend === 'webgl') {
      this.liquidDiamondDemoController = null;
    } else {
      this.liquidDiamondWebGlDemoController = null;
    }

    try {
      nextActiveController.show();
    } catch (error) {
      logger.warn(`Failed to initialize ${backend} liquid diamond demo`, error);
      new Notice(
        backend === 'webgl'
          ? 'WebGL diamond demo is not available in this environment. See developer console for details.'
          : 'Diamond demo is not available in this environment.',
      );
      this.destroyLiquidDiamondDemo();
    }
  }

  private destroyLiquidDiamondDemo(): void {
    this.liquidDiamondDemoController?.destroy();
    this.liquidDiamondDemoController = null;
    this.liquidDiamondWebGlDemoController?.destroy();
    this.liquidDiamondWebGlDemoController = null;
  }

  private destroyGlassOctahedronDemo(): void {
    this.glassOctahedronDemoController?.destroy();
    this.glassOctahedronDemoController = null;
  }
}
