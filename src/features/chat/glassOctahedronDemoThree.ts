import {
  ACESFilmicToneMapping,
  AmbientLight,
  BackSide,
  BoxGeometry,
  Color,
  DirectionalLight,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from '../../vendor/three';
import {
  createGlassOctahedronProjectionContext,
  GLASS_OCTAHEDRON_GEOMETRY_RADIUS,
  type GlassOctahedronProjectionContext,
  type GlassOctahedronQualityTier,
} from './glassOctahedronDemoRefraction';

export type GlassOctahedronRenderQuality = 'interactive' | 'settled';

export interface GlassOctahedronPose {
  dpr: number;
  idleAmount: number;
  idlePhase: number;
  pitch: number;
  quality: GlassOctahedronRenderQuality;
  qualityTier: GlassOctahedronQualityTier;
  roll: number;
  yaw: number;
}

export interface GlassOctahedronThreeRenderer {
  destroy: () => void;
  render: (pose: GlassOctahedronPose) => GlassOctahedronProjectionContext;
}

const CAMERA_FOV = 31;
const CAMERA_NEAR = 0.1;
const CAMERA_FAR = 40;
const CAMERA_Z = 5.8;
const INTERACTIVE_TRANSMISSION_SCALE = 0.46;
const SETTLED_TRANSMISSION_SCALE = 0.68;
const INNER_SHELL_SCALE = 0.72;
const FRESNEL_SHELL_SCALE = 1.03;
const PMREM_SIZE = 64;
const PMREM_SIGMA = 0.08;
const IDLE_FLOAT_DISTANCE = 0.12;
const IDLE_PITCH_OFFSET = 0.032;
const IDLE_YAW_OFFSET = 0.048;
const IDLE_ROLL_OFFSET = 0.054;

const FRESNEL_VERTEX_SHADER = `
varying float vEdgeIntensity;

uniform float uThreshold;
uniform float uPower;
uniform float uScale;

void main() {
  vec3 viewNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vec3 viewDirection = normalize(-mvPosition.xyz);
  float edge = pow(1.0 - abs(dot(viewNormal, viewDirection)), uPower);
  float rim = max(edge - uThreshold, 0.0);
  vEdgeIntensity = clamp(rim * uScale, 0.0, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRESNEL_FRAGMENT_SHADER = `
varying float vEdgeIntensity;

uniform vec3 uColor;
uniform float uOpacity;

void main() {
  float intensity = clamp(vEdgeIntensity, 0.0, 1.0);
  gl_FragColor = vec4(uColor * intensity, intensity * uOpacity);
}
`;

function disposeSceneResources(scene: InstanceType<typeof Scene>): void {
  scene.traverse((object: unknown) => {
    const candidate = object as {
      geometry?: { dispose?: () => void };
      material?:
        | { dispose?: () => void }
        | Array<{ dispose?: () => void }>;
    };

    candidate.geometry?.dispose?.();
    if (Array.isArray(candidate.material)) {
      for (const material of candidate.material) {
        material.dispose?.();
      }
      return;
    }

    candidate.material?.dispose?.();
  });
}

function createEnvironmentScene(): InstanceType<typeof Scene> {
  const scene = new Scene();
  const roomGeometry = new BoxGeometry(18, 18, 18);
  const roomMaterial = new MeshStandardMaterial({
    color: 0x131518,
    metalness: 0,
    roughness: 1,
    side: BackSide,
  });
  scene.add(new Mesh(roomGeometry, roomMaterial));

  const glassySphere = new Mesh(
    new SphereGeometry(1.1, 18, 18),
    new MeshStandardMaterial({
      color: 0xd8dadd,
      emissive: new Color(0x121315),
      metalness: 0.03,
      roughness: 0.24,
    }),
  );
  glassySphere.position.set(-2.3, -1.1, -1.9);
  scene.add(glassySphere);

  const accentBox = new Mesh(
    new BoxGeometry(2.4, 4.6, 1.2),
    new MeshStandardMaterial({
      color: 0x24282c,
      emissive: new Color(0x0c0d10),
      metalness: 0.08,
      roughness: 0.44,
    }),
  );
  accentBox.position.set(2.5, -0.8, -2.2);
  accentBox.rotation.set(0.18, -0.34, 0.08);
  scene.add(accentBox);

  const lightPanelA = new Mesh(
    new BoxGeometry(0.2, 3.8, 4.8),
    new MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.88,
      transparent: true,
    }),
  );
  lightPanelA.position.set(-6.8, 1.2, 0.6);
  scene.add(lightPanelA);

  const lightPanelB = new Mesh(
    new BoxGeometry(3.6, 0.2, 3.3),
    new MeshBasicMaterial({
      color: 0xf7f8fa,
      opacity: 0.64,
      transparent: true,
    }),
  );
  lightPanelB.position.set(-0.3, 5.7, -1.5);
  scene.add(lightPanelB);

  const lightPanelC = new Mesh(
    new BoxGeometry(2.8, 0.2, 2.9),
    new MeshBasicMaterial({
      color: 0xffffff,
      opacity: 0.56,
      transparent: true,
    }),
  );
  lightPanelC.position.set(2.7, -5.2, 2.5);
  lightPanelC.rotation.set(0.18, -0.12, 0.06);
  scene.add(lightPanelC);

  const lightPanelD = new Mesh(
    new BoxGeometry(2.5, 3.2, 0.2),
    new MeshBasicMaterial({
      color: 0xf7f8fa,
      opacity: 0.32,
      transparent: true,
    }),
  );
  lightPanelD.position.set(5.6, 0.9, -0.9);
  lightPanelD.rotation.set(-0.08, -0.38, 0.02);
  scene.add(lightPanelD);

  scene.add(new AmbientLight(0xffffff, 0.72));

  const keyLight = new DirectionalLight(0xffffff, 1.58);
  keyLight.position.set(4.4, 5.8, 7.5);
  scene.add(keyLight);

  const fillLight = new PointLight(0xffffff, 22, 18, 2);
  fillLight.position.set(-4.6, 2.6, 4.2);
  scene.add(fillLight);

  const rimLight = new PointLight(0xffffff, 22, 14, 2);
  rimLight.position.set(2.6, -2.8, 6.2);
  scene.add(rimLight);

  return scene;
}

export function createGlassOctahedronThreeRenderer(
  canvasEl: HTMLCanvasElement,
  size: number,
): GlassOctahedronThreeRenderer {
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas: canvasEl,
    powerPreference: 'high-performance',
    premultipliedAlpha: true,
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;

  const scene = new Scene();
  const camera = new PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(0, 0.12, CAMERA_Z);
  camera.lookAt(0, 0, 0);

  const octahedronGroup = new Group();
  scene.add(octahedronGroup);

  const geometry = new OctahedronGeometry(GLASS_OCTAHEDRON_GEOMETRY_RADIUS, 0);

  const outerMaterial = new MeshPhysicalMaterial({
    attenuationColor: new Color(0xffffff),
    attenuationDistance: 3.8,
    clearcoat: 1,
    clearcoatRoughness: 0.082,
    color: 0xffffff,
    envMapIntensity: 0.82,
    ior: 1.31,
    metalness: 0,
    roughness: 0.026,
    thickness: 1.72,
    transmission: 1,
  });
  const outerMesh = new Mesh(geometry, outerMaterial);
  outerMesh.renderOrder = 1;
  octahedronGroup.add(outerMesh);

  const innerMaterial = new MeshPhysicalMaterial({
    clearcoat: 0.42,
    clearcoatRoughness: 0.22,
    color: 0xffffff,
    envMapIntensity: 0.12,
    ior: 1.08,
    metalness: 0,
    opacity: 0.04,
    roughness: 0.38,
    side: FrontSide,
    transparent: true,
  });
  innerMaterial.depthWrite = false;
  const innerMesh = new Mesh(geometry, innerMaterial);
  innerMesh.renderOrder = 0;
  innerMesh.scale.setScalar(INNER_SHELL_SCALE);
  octahedronGroup.add(innerMesh);

  const fresnelMaterial = new ShaderMaterial({
    fragmentShader: FRESNEL_FRAGMENT_SHADER,
    side: BackSide,
    transparent: true,
    uniforms: {
      uThreshold: { value: 0.17 },
      uColor: { value: new Color(0xffffff) },
      uOpacity: { value: 0.045 },
      uPower: { value: 2.95 },
      uScale: { value: 1.18 },
    },
    vertexShader: FRESNEL_VERTEX_SHADER,
  });
  fresnelMaterial.depthWrite = false;
  fresnelMaterial.toneMapped = false;
  const fresnelMesh = new Mesh(geometry, fresnelMaterial);
  fresnelMesh.renderOrder = 2;
  fresnelMesh.scale.setScalar(FRESNEL_SHELL_SCALE);
  octahedronGroup.add(fresnelMesh);

  scene.add(new AmbientLight(0xffffff, 0.28));

  const keyLight = new DirectionalLight(0xffffff, 0.84);
  keyLight.position.set(5.2, 6.2, 7.2);
  scene.add(keyLight);

  const accentLight = new PointLight(0xffffff, 8, 18, 2);
  accentLight.position.set(-2.6, -0.5, 4.5);
  scene.add(accentLight);

  const pmremGenerator = new PMREMGenerator(renderer);
  const environmentScene = createEnvironmentScene();
  const environmentTarget = pmremGenerator.fromScene(
    environmentScene,
    PMREM_SIGMA,
    0.1,
    40,
    { size: PMREM_SIZE },
  );
  disposeSceneResources(environmentScene);
  scene.environment = environmentTarget.texture;

  let currentDpr = 0;

  return {
    destroy(): void {
      geometry.dispose();
      outerMaterial.dispose();
      innerMaterial.dispose();
      fresnelMaterial.dispose();
      environmentTarget.dispose();
      pmremGenerator.dispose();
      renderer.dispose();
      if (typeof renderer.forceContextLoss === 'function') {
        renderer.forceContextLoss();
      }
    },
    render(pose: GlassOctahedronPose): GlassOctahedronProjectionContext {
      if (pose.dpr !== currentDpr) {
        currentDpr = pose.dpr;
        renderer.setPixelRatio(currentDpr);
        renderer.setSize(size, size, false);
      }

      renderer.transmissionResolutionScale =
        pose.quality === 'interactive'
          ? INTERACTIVE_TRANSMISSION_SCALE
          : SETTLED_TRANSMISSION_SCALE;

      const idlePrimaryWave = Math.sin(pose.idlePhase);
      const idleSecondaryWave = Math.sin(pose.idlePhase * 0.61 + 1.1);
      const idleTertiaryWave = Math.cos(pose.idlePhase * 0.83 - 0.6);
      const idleHighlight =
        pose.idleAmount * (0.5 + 0.5 * Math.max(idlePrimaryWave, 0));
      const finalOffsetY =
        pose.idleAmount * IDLE_FLOAT_DISTANCE * (0.62 + 0.38 * idleSecondaryWave);
      const finalPitch =
        pose.pitch + pose.idleAmount * idlePrimaryWave * IDLE_PITCH_OFFSET;
      const finalYaw =
        pose.yaw + pose.idleAmount * idleSecondaryWave * IDLE_YAW_OFFSET;
      const finalRoll =
        pose.roll + pose.idleAmount * idleTertiaryWave * IDLE_ROLL_OFFSET;

      octahedronGroup.position.y = finalOffsetY;
      octahedronGroup.rotation.set(finalPitch, finalYaw, finalRoll);

      outerMaterial.clearcoatRoughness = 0.078 + idleHighlight * 0.018;
      outerMaterial.envMapIntensity = 0.8 + idleHighlight * 0.1;
      innerMaterial.opacity =
        0.03 + pose.idleAmount * (0.008 + idleHighlight * 0.008);
      innerMaterial.envMapIntensity = 0.1 + idleHighlight * 0.04;
      fresnelMaterial.uniforms.uOpacity.value =
        0.04 + pose.idleAmount * (0.012 + idleHighlight * 0.014);
      fresnelMaterial.uniforms.uScale.value = 1.14 + idleHighlight * 0.1;
      fresnelMaterial.uniforms.uPower.value = 2.96 + idleHighlight * 0.08;
      fresnelMaterial.uniforms.uThreshold.value = 0.18 - idleHighlight * 0.026;

      renderer.render(scene, camera);

      return createGlassOctahedronProjectionContext({
        qualityTier: pose.qualityTier,
        size: {
          cssHeight: size,
          cssWidth: size,
        },
        transform: {
          offsetY: finalOffsetY,
          pitch: finalPitch,
          roll: finalRoll,
          yaw: finalYaw,
        },
      });
    },
  };
}
