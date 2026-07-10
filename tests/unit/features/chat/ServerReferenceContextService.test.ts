import {
  type ServerReferenceContextCapabilityHost,
  ServerReferenceContextService,
} from '../../../../src/features/chat/services/ServerReferenceContextService';

type MockCapabilityHost = jest.Mocked<ServerReferenceContextCapabilityHost>;

function createCapabilityHost(
  requireCapability: jest.Mock<{ supported: boolean; reason?: string }, [string]>,
): MockCapabilityHost {
  return { requireCapability } as MockCapabilityHost;
}

describe('ServerReferenceContextService', () => {
  it('reports both capabilities available when the host supports them', () => {
    const host = createCapabilityHost(jest.fn(() => ({ supported: true })));
    const service = new ServerReferenceContextService(host);

    expect(service.getAvailability()).toEqual({
      referencesAvailable: true,
      fsBrowseAvailable: true,
    });
    expect(service.hasAnyServerContextCapability()).toBe(true);
    expect(host.requireCapability).toHaveBeenCalledWith('v2.reference.list');
    expect(host.requireCapability).toHaveBeenCalledWith('v2.fs.list');
  });

  it('reports unavailable when the host rejects the capability', () => {
    const host = createCapabilityHost(
      jest.fn(() => ({ supported: false, reason: 'unsupported-by-server' })),
    );
    const service = new ServerReferenceContextService(host);

    expect(service.getAvailability()).toEqual({
      referencesAvailable: false,
      fsBrowseAvailable: false,
    });
    expect(service.hasAnyServerContextCapability()).toBe(false);
  });

  it('reports partial availability when only references are supported', () => {
    const host = createCapabilityHost(
      jest.fn((id: string) => ({
        supported: id === 'v2.reference.list',
      })),
    );
    const service = new ServerReferenceContextService(host);

    expect(service.getAvailability()).toEqual({
      referencesAvailable: true,
      fsBrowseAvailable: false,
    });
    expect(service.hasAnyServerContextCapability()).toBe(true);
  });

  it('absorbs a throwing requireCapability as unsupported', () => {
    const host = createCapabilityHost(
      jest.fn(() => {
        throw new Error('transient');
      }),
    );
    const service = new ServerReferenceContextService(host);

    expect(service.getAvailability()).toEqual({
      referencesAvailable: false,
      fsBrowseAvailable: false,
    });
    expect(service.hasAnyServerContextCapability()).toBe(false);
  });
});
