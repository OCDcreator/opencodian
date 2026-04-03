export interface Vec2 {
  x: number;
  y: number;
}

export interface ShaderOptions {
  width: number;
  height: number;
  fragment: (uv: Vec2) => Vec2;
}

export interface ShaderFragmentTuning {
  displacementScale: number;
  aberrationIntensity: number;
}

export type FragmentShader = (uv: Vec2) => Vec2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function smoothStep(a: number, b: number, t: number): number {
  const normalized = clamp((t - a) / (b - a), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function vectorLength(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function roundedRectSDF(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): number {
  const qx = Math.abs(x) - width + radius;
  const qy = Math.abs(y) - height + radius;
  return Math.min(Math.max(qx, qy), 0) + vectorLength(Math.max(qx, 0), Math.max(qy, 0)) - radius;
}

function texture(x: number, y: number): Vec2 {
  return { x, y };
}

export function createShaderDisplacementFragment(
  tuning: ShaderFragmentTuning,
): FragmentShader {
  const displacementRatio = clamp(tuning.displacementScale / 140, 0, 1);
  const aberrationRatio = clamp(tuning.aberrationIntensity / 10, 0, 1);
  const width = 0.3 + displacementRatio * 0.05;
  const height = 0.2 + displacementRatio * 0.03;
  const radius = 0.6 - aberrationRatio * 0.1;
  const edgeInset = 0.15 - displacementRatio * 0.05;
  const outerEdge = 0.8 - aberrationRatio * 0.08;

  return (uv: Vec2): Vec2 => {
    const ix = uv.x - 0.5;
    const iy = uv.y - 0.5;
    const distanceToEdge = roundedRectSDF(ix, iy, width, height, radius);
    const displacement = smoothStep(outerEdge, 0, distanceToEdge - edgeInset);
    const scaled = smoothStep(0, 1, displacement);
    return texture(ix * scaled + 0.5, iy * scaled + 0.5);
  };
}

export const fragmentShaders = {
  standard: (uv: Vec2): Vec2 => {
    const ix = uv.x - 0.5;
    const iy = uv.y - 0.5;
    const edge = smoothStep(0.72, 0, roundedRectSDF(ix, iy, 0.32, 0.18, 0.52) - 0.08);
    const center = smoothStep(0.42, 0, vectorLength(ix * 1.1, iy * 1.2));
    return texture(
      uv.x + ix * (edge * 0.16 + center * 0.03),
      uv.y + iy * (edge * 0.18 + center * 0.02),
    );
  },
  polar: (uv: Vec2): Vec2 => {
    const ix = uv.x - 0.5;
    const iy = uv.y - 0.5;
    const angle = Math.atan2(iy, ix);
    const radius = vectorLength(ix * 1.08, iy * 1.28);
    const edge = smoothStep(0.7, 0, roundedRectSDF(ix, iy, 0.33, 0.19, 0.48) - 0.06);
    const swirl = smoothStep(0.56, 0.04, radius) * edge * 0.18;
    const radialLift = smoothStep(0.5, 0, radius) * 0.03;
    return texture(
      uv.x + -Math.sin(angle) * swirl + ix * radialLift,
      uv.y + Math.cos(angle) * swirl + iy * radialLift,
    );
  },
  prominent: (uv: Vec2): Vec2 => {
    const ix = uv.x - 0.5;
    const iy = uv.y - 0.5;
    const edge = smoothStep(0.86, 0, roundedRectSDF(ix, iy, 0.34, 0.19, 0.44) - 0.12);
    const lobe = smoothStep(0.44, 0.02, Math.abs(ix) * 0.9 + Math.abs(iy) * 0.65);
    const gain = edge * 0.24 + lobe * 0.08;
    return texture(
      uv.x + ix * gain + iy * 0.045 * lobe,
      uv.y + iy * gain - ix * 0.03 * lobe,
    );
  },
  shader: createShaderDisplacementFragment({
    displacementScale: 70,
    aberrationIntensity: 2,
  }),
} satisfies Record<'standard' | 'polar' | 'prominent' | 'shader', FragmentShader>;

export class ShaderDisplacementGenerator {
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private canvasDpi = 1;

  constructor(private readonly options: ShaderOptions) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = options.width * this.canvasDpi;
    this.canvas.height = options.height * this.canvasDpi;
    this.canvas.style.display = 'none';

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not get 2D context');
    }
    this.context = context;
  }

  updateShader(): string {
    const width = this.options.width * this.canvasDpi;
    const height = this.options.height * this.canvasDpi;

    let maxScale = 0;
    const rawValues: number[] = [];

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const uv: Vec2 = { x: x / width, y: y / height };
        const mapped = this.options.fragment(uv);
        const dx = mapped.x * width - x;
        const dy = mapped.y * height - y;

        maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
        rawValues.push(dx, dy);
      }
    }

    maxScale = maxScale > 0 ? Math.max(maxScale, 1) : 1;

    const imageData = this.context.createImageData(width, height);
    const { data } = imageData;

    let rawIndex = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const dx = rawValues[rawIndex++];
        const dy = rawValues[rawIndex++];

        const edgeDistance = Math.min(x, y, width - x - 1, height - y - 1);
        const edgeFactor = Math.min(1, edgeDistance / 2);

        const normalizedX = dx * edgeFactor / maxScale + 0.5;
        const normalizedY = dy * edgeFactor / maxScale + 0.5;
        const pixelIndex = (y * width + x) * 4;

        data[pixelIndex] = clamp(normalizedX * 255, 0, 255);
        data[pixelIndex + 1] = clamp(normalizedY * 255, 0, 255);
        data[pixelIndex + 2] = clamp(normalizedY * 255, 0, 255);
        data[pixelIndex + 3] = 255;
      }
    }

    this.context.putImageData(imageData, 0, 0);
    return this.canvas.toDataURL();
  }

  destroy(): void {
    this.canvas.remove();
  }
}
