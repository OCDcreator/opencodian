import type { GlassEffectAdapter } from './types';

const glassAdapterRegistry = new Map<GlassEffectAdapter['id'], GlassEffectAdapter>();

export function registerGlassAdapter(adapter: GlassEffectAdapter): void {
  glassAdapterRegistry.set(adapter.id, adapter);
}

export function getGlassAdapter(id: GlassEffectAdapter['id']): GlassEffectAdapter | undefined {
  return glassAdapterRegistry.get(id);
}

export function getAllGlassAdapters(): GlassEffectAdapter[] {
  return Array.from(glassAdapterRegistry.values());
}

export function unregisterGlassAdapter(id: GlassEffectAdapter['id']): void {
  glassAdapterRegistry.delete(id);
}
