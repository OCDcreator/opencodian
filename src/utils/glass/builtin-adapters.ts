import { adapter as nikdelvinAdapter } from './adapters/nikdelvin';
import { adapter as rdevAdapter } from './adapters/rdev';
import { adapter as shudingAdapter } from './adapters/shuding';
import { registerGlassAdapter } from './registry';

export function registerBuiltinGlassAdapters(): void {
  registerGlassAdapter(shudingAdapter);
  registerGlassAdapter(nikdelvinAdapter);
  registerGlassAdapter(rdevAdapter);
}
