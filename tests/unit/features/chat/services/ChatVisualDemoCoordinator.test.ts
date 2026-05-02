const mockGlassShow = jest.fn().mockResolvedValue(undefined);
const mockGlassDestroy = jest.fn();
const mockGlassIsVisible = jest.fn(() => false);

jest.mock('../../../../../src/features/chat/glassOctahedronDemo', () => ({
  GlassOctahedronDemoController: jest.fn().mockImplementation(() => ({
    show: mockGlassShow,
    destroy: mockGlassDestroy,
    isVisible: mockGlassIsVisible,
  })),
}));

const mockDiamondShow = jest.fn();
const mockDiamondDestroy = jest.fn();
const mockDiamondIsVisible = jest.fn(() => false);

jest.mock('../../../../../src/features/chat/liquidDiamondDemo', () => ({
  LiquidDiamondDemoController: jest.fn().mockImplementation(() => ({
    show: mockDiamondShow,
    destroy: mockDiamondDestroy,
    isVisible: mockDiamondIsVisible,
  })),
}));

import {
  ChatVisualDemoCoordinator,
  type ChatVisualDemoCoordinatorHost,
} from '../../../../../src/features/chat/services/ChatVisualDemoCoordinator';

function createHost(shellEl: HTMLElement | null = null): ChatVisualDemoCoordinatorHost {
  return { getMessagesShellEl: () => shellEl };
}

describe('ChatVisualDemoCoordinator', () => {
  let shellEl: HTMLElement;

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.empty();
    shellEl = document.body.createDiv();
  });

  describe('toggleLiquidDiamondDemo', () => {
    it('creates and shows CPU demo controller on first toggle', () => {
      mockDiamondIsVisible.mockReturnValue(false);
      const coordinator = new ChatVisualDemoCoordinator(createHost(shellEl));
      coordinator.toggleLiquidDiamondDemo();
      expect(mockDiamondShow).toHaveBeenCalledTimes(1);
    });

    it('destroys and removes CPU demo when already visible', () => {
      mockDiamondIsVisible.mockReturnValue(true);
      const coordinator = new ChatVisualDemoCoordinator(createHost(shellEl));
      coordinator.toggleLiquidDiamondDemo();
      expect(mockDiamondDestroy).toHaveBeenCalled();
    });

    it('does nothing when host returns null', () => {
      const coordinator = new ChatVisualDemoCoordinator(createHost(null));
      coordinator.toggleLiquidDiamondDemo();
      expect(mockDiamondShow).not.toHaveBeenCalled();
    });
  });

  describe('toggleLiquidDiamondWebGlDemo', () => {
    it('creates and shows WebGL demo controller on first toggle', () => {
      mockDiamondIsVisible.mockReturnValue(false);
      const coordinator = new ChatVisualDemoCoordinator(createHost(shellEl));
      coordinator.toggleLiquidDiamondWebGlDemo();
      expect(mockDiamondShow).toHaveBeenCalledTimes(1);
    });

    it('destroys other variant when switching backends', () => {
      mockDiamondIsVisible.mockReturnValue(false);
      const coordinator = new ChatVisualDemoCoordinator(createHost(shellEl));
      coordinator.toggleLiquidDiamondDemo();
      expect(mockDiamondDestroy).not.toHaveBeenCalled();
      coordinator.toggleLiquidDiamondWebGlDemo();
      expect(mockDiamondDestroy).toHaveBeenCalled();
    });
  });

  describe('toggleGlassOctahedron', () => {
    it('creates and shows glass octahedron demo', async () => {
      mockGlassIsVisible.mockReturnValue(false);
      const coordinator = new ChatVisualDemoCoordinator(createHost(shellEl));
      await coordinator.toggleGlassOctahedron();
      expect(mockGlassShow).toHaveBeenCalledTimes(1);
    });

    it('destroys demo when already visible', async () => {
      mockGlassIsVisible.mockReturnValue(true);
      const coordinator = new ChatVisualDemoCoordinator(createHost(shellEl));
      await coordinator.toggleGlassOctahedron();
      expect(mockGlassDestroy).toHaveBeenCalled();
    });

    it('destroys demo on show error', async () => {
      mockGlassIsVisible.mockReturnValue(false);
      mockGlassShow.mockRejectedValueOnce(new Error('test error'));
      const coordinator = new ChatVisualDemoCoordinator(createHost(shellEl));
      await coordinator.toggleGlassOctahedron();
      expect(mockGlassDestroy).toHaveBeenCalled();
    });

    it('does nothing when host returns null', async () => {
      const coordinator = new ChatVisualDemoCoordinator(createHost(null));
      await coordinator.toggleGlassOctahedron();
      expect(mockGlassShow).not.toHaveBeenCalled();
    });
  });

  describe('destroyAll', () => {
    it('destroys all active demos', () => {
      mockDiamondIsVisible.mockReturnValue(false);
      const coordinator = new ChatVisualDemoCoordinator(createHost(shellEl));
      coordinator.toggleLiquidDiamondDemo();
      coordinator.destroyAll();
      expect(mockDiamondDestroy).toHaveBeenCalled();
    });

    it('is safe to call when no demos are active', () => {
      const coordinator = new ChatVisualDemoCoordinator(createHost(shellEl));
      expect(() => coordinator.destroyAll()).not.toThrow();
    });
  });
});
