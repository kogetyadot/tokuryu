import * as THREE from 'three';
import type { GameState } from '../types/game';
import type { AviationBeaconHandle, CityBuildResult, SearchlightHandle } from './CityBuilder';

interface TimeMood {
  sky: THREE.Color;
  fog: THREE.Color;
  fogDensity: number;
  sunColor: THREE.Color;
  sunIntensity: number;
  sunDir: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  rimColor: THREE.Color;
  rimIntensity: number;
  waterDeep: THREE.Color;
  waterShallow: THREE.Color;
  nightFactor: number;
}

const MOOD_MORNING: TimeMood = {
  sky: new THREE.Color('#273b59'),
  fog: new THREE.Color('#324869'),
  fogDensity: 0.009,
  sunColor: new THREE.Color('#ffdcb0'),
  sunIntensity: 1.55,
  sunDir: new THREE.Vector3(24, 28, -16).normalize(),
  hemiSky: new THREE.Color('#8fb8e6'),
  hemiGround: new THREE.Color('#27303d'),
  hemiIntensity: 0.85,
  rimColor: new THREE.Color('#7dd3fc'),
  rimIntensity: 0.45,
  waterDeep: new THREE.Color('#102a46'),
  waterShallow: new THREE.Color('#1d4b6e'),
  nightFactor: 0.15,
};

const MOOD_DAY: TimeMood = {
  sky: new THREE.Color('#3b5b82'),
  fog: new THREE.Color('#47688f'),
  fogDensity: 0.008,
  sunColor: new THREE.Color('#fff5e6'),
  sunIntensity: 1.85,
  sunDir: new THREE.Vector3(18, 42, -12).normalize(),
  hemiSky: new THREE.Color('#a7ccf2'),
  hemiGround: new THREE.Color('#323a46'),
  hemiIntensity: 0.95,
  rimColor: new THREE.Color('#93c5fd'),
  rimIntensity: 0.4,
  waterDeep: new THREE.Color('#0e3254'),
  waterShallow: new THREE.Color('#1e5d85'),
  nightFactor: 0.05,
};

const MOOD_DUSK: TimeMood = {
  sky: new THREE.Color('#221c38'),
  fog: new THREE.Color('#2a203b'),
  fogDensity: 0.0115,
  sunColor: new THREE.Color('#ff8e4d'),
  sunIntensity: 1.45,
  sunDir: new THREE.Vector3(-34, 13, 22).normalize(),
  hemiSky: new THREE.Color('#8a527a'),
  hemiGround: new THREE.Color('#181d2b'),
  hemiIntensity: 0.65,
  rimColor: new THREE.Color('#38bdf8'),
  rimIntensity: 0.85,
  waterDeep: new THREE.Color('#091529'),
  waterShallow: new THREE.Color('#16314a'),
  nightFactor: 0.65,
};

const MOOD_NIGHT: TimeMood = {
  sky: new THREE.Color('#090e1c'),
  fog: new THREE.Color('#0b1122'),
  fogDensity: 0.013,
  sunColor: new THREE.Color('#8bb6eb'),
  sunIntensity: 0.85,
  sunDir: new THREE.Vector3(-22, 26, 20).normalize(),
  hemiSky: new THREE.Color('#283c66'),
  hemiGround: new THREE.Color('#0c101a'),
  hemiIntensity: 0.55,
  rimColor: new THREE.Color('#f43f5e'),
  rimIntensity: 0.72,
  waterDeep: new THREE.Color('#040c18'),
  waterShallow: new THREE.Color('#0c2238'),
  nightFactor: 1.0,
};

export class EffectsAndLighting {
  public readonly root = new THREE.Group();
  public readonly fog: THREE.FogExp2;
  public readonly backgroundColor = new THREE.Color('#090e1c');

  private readonly isLowGpu: boolean;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly rimLight: THREE.DirectionalLight;
  private readonly raidFlashLight: THREE.PointLight;

  // Rain / atmospheric mist motes
  private readonly rainCount: number;
  private readonly rainPositions: Float32Array;
  private readonly rainGeo: THREE.BufferGeometry;
  private readonly rainMat: THREE.PointsMaterial;
  private readonly rainPoints: THREE.Points;

  // Pre-allocated mood scratch object to avoid per-frame GC allocations
  private readonly sampledMood: TimeMood = {
    sky: new THREE.Color(),
    fog: new THREE.Color(),
    fogDensity: 0.011,
    sunColor: new THREE.Color(),
    sunIntensity: 1.0,
    sunDir: new THREE.Vector3(),
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    hemiIntensity: 0.65,
    rimColor: new THREE.Color(),
    rimIntensity: 0.75,
    waterDeep: new THREE.Color(),
    waterShallow: new THREE.Color(),
    nightFactor: 0.85,
  };
  private readonly colorRedFlash = new THREE.Color('#ff4d6d');
  private readonly colorBlueFlash = new THREE.Color('#60a5fa');
  private readonly colorSearchDefault = new THREE.Color('#bfe4ff');
  private readonly colorRaidRed = new THREE.Color('#ff2442');
  private readonly colorRaidBlue = new THREE.Color('#2563eb');

  public currentNightFactor = 0.85;

  constructor(scene: THREE.Scene, isLowGpu = false) {
    this.isLowGpu = isLowGpu;
    this.rainCount = isLowGpu ? 160 : 360;
    this.root.name = 'EffectsAndLighting';

    this.fog = new THREE.FogExp2('#0b1122', 0.012);
    scene.fog = this.fog;
    scene.background = this.backgroundColor;

    this.hemiLight = new THREE.HemisphereLight('#283c66', '#0c101a', 0.65);
    this.root.add(this.hemiLight);

    // Key directional light (real hardware uses crisp PCFSoftShadowMap; software WebGL skips shadow pass)
    this.sunLight = new THREE.DirectionalLight('#ff9a5c', 1.35);
    this.sunLight.position.set(-28, 28, 22);
    this.sunLight.castShadow = !this.isLowGpu;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 115;
    const d = 38;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0008;
    this.root.add(this.sunLight);

    // Stylized neon rim light from bay horizon
    this.rimLight = new THREE.DirectionalLight('#38bdf8', 0.75);
    this.rimLight.position.set(28, 16, -28);
    this.root.add(this.rimLight);

    // Emergency T3 raid strobe light over central Chuo plaza
    this.raidFlashLight = new THREE.PointLight('#ef4444', 0, 58, 1.3);
    this.raidFlashLight.position.set(0, 14, -2);
    this.root.add(this.raidFlashLight);

    // Atmospheric rain / mist motes
    this.rainPositions = new Float32Array(this.rainCount * 3);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainPositions[i * 3 + 0] = (Math.random() - 0.5) * 68;
      this.rainPositions[i * 3 + 1] = Math.random() * 24 + 0.5;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 56;
    }
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainMat = new THREE.PointsMaterial({
      color: '#a5c8f0',
      size: 0.16,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.rainPoints = new THREE.Points(this.rainGeo, this.rainMat);
    this.root.add(this.rainPoints);
  }

  private sampleMood(hour: number): TimeMood {
    // Clamp hour into [8, 22]
    const h = THREE.MathUtils.clamp(hour, 8, 22);
    let a: TimeMood;
    let b: TimeMood;
    let t: number;

    if (h < 14) {
      a = MOOD_MORNING;
      b = MOOD_DAY;
      t = (h - 8) / 6;
    } else if (h < 17.8) {
      a = MOOD_DAY;
      b = MOOD_DUSK;
      t = (h - 14) / 3.8;
    } else {
      a = MOOD_DUSK;
      b = MOOD_NIGHT;
      t = (h - 17.8) / 4.2;
    }
    t = THREE.MathUtils.smoothstep(t, 0, 1);

    const out = this.sampledMood;
    out.sky.copy(a.sky).lerp(b.sky, t);
    out.fog.copy(a.fog).lerp(b.fog, t);
    out.fogDensity = THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, t);
    out.sunColor.copy(a.sunColor).lerp(b.sunColor, t);
    out.sunIntensity = THREE.MathUtils.lerp(a.sunIntensity, b.sunIntensity, t);
    out.sunDir.copy(a.sunDir).lerp(b.sunDir, t).normalize();
    out.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
    out.hemiGround.copy(a.hemiGround).lerp(b.hemiGround, t);
    out.hemiIntensity = THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, t);
    out.rimColor.copy(a.rimColor).lerp(b.rimColor, t);
    out.rimIntensity = THREE.MathUtils.lerp(a.rimIntensity, b.rimIntensity, t);
    out.waterDeep.copy(a.waterDeep).lerp(b.waterDeep, t);
    out.waterShallow.copy(a.waterShallow).lerp(b.waterShallow, t);
    out.nightFactor = THREE.MathUtils.lerp(a.nightFactor, b.nightFactor, t);
    return out;
  }

  public update(
    dt: number,
    time: number,
    state: GameState,
    city: CityBuildResult
  ): void {
    // Title screen holds breathtaking golden-dusk-to-twilight neo-noir mood (~19.8)
    const effectiveHour = state.phase === 'title' ? 19.8 : state.hour;
    const mood = this.sampleMood(effectiveHour);
    this.currentNightFactor = mood.nightFactor;

    this.backgroundColor.copy(mood.sky);
    this.fog.color.copy(mood.fog);
    this.fog.density = mood.fogDensity;

    this.sunLight.color.copy(mood.sunColor);
    this.sunLight.intensity = mood.sunIntensity;
    this.sunLight.position.copy(mood.sunDir).multiplyScalar(42);

    this.hemiLight.color.copy(mood.hemiSky);
    this.hemiLight.groundColor.copy(mood.hemiGround);
    this.hemiLight.intensity = mood.hemiIntensity;

    this.rimLight.color.copy(mood.rimColor);
    this.rimLight.intensity = mood.rimIntensity;

    // Sync water shader uniforms
    city.waterUniforms.uTime.value = time;
    city.waterUniforms.uSkyColor.value.copy(mood.sky);
    city.waterUniforms.uDeepColor.value.copy(mood.waterDeep);
    city.waterUniforms.uShallowColor.value.copy(mood.waterShallow);
    city.waterUniforms.uSunDir.value.copy(mood.sunDir);
    city.waterUniforms.uSunColor.value.copy(mood.sunColor);
    city.waterUniforms.uFogColor.value.copy(mood.fog);
    city.waterUniforms.uFogDensity.value = mood.fogDensity;
    city.waterUniforms.uNightFactor.value = mood.nightFactor;

    // Update T3 Police HQ Searchlight cones
    const isRaidEnding = state.ending?.id === 't3_takedown';
    const trace = state.phase === 'title' ? 35 : state.policeTrace;
    const searchActive = trace >= 50 || isRaidEnding;
    const searchIntensity = isRaidEnding
      ? 0.45
      : searchActive
        ? THREE.MathUtils.clamp((trace - 45) / 55, 0.14, 0.36)
        : 0;

    for (let idx = 0; idx < city.searchlights.length; idx++) {
      const sl: SearchlightHandle = city.searchlights[idx];
      sl.cone.visible = searchActive;
      sl.spotGlow.visible = searchActive;
      if (!searchActive) continue;

      const sweep = Math.sin(time * sl.speed + sl.baseAngle) * 1.15;
      sl.pivot.rotation.y = sl.baseAngle + sweep + time * 0.28 * (idx === 0 ? 1 : -1);
      sl.coneMat.opacity = searchIntensity * (0.65 + 0.35 * mood.nightFactor);
      (sl.spotGlow.material as THREE.SpriteMaterial).opacity =
        0.55 + 0.35 * mood.nightFactor;

      if (isRaidEnding) {
        const flashRed = Math.sin(time * 12 + idx) > 0;
        sl.coneMat.color.copy(flashRed ? this.colorRedFlash : this.colorBlueFlash);
      } else {
        sl.coneMat.color.copy(this.colorSearchDefault);
      }
    }

    // T3 Takedown Ending red/blue flood flash across the city
    if (isRaidEnding) {
      const strobe = Math.sin(time * 14.0);
      this.raidFlashLight.color.copy(strobe > 0 ? this.colorRaidRed : this.colorRaidBlue);
      this.raidFlashLight.intensity = 6.5 + Math.abs(strobe) * 6.0;
    } else {
      this.raidFlashLight.intensity = 0;
    }

    // Blinking aviation obstruction beacons on Shintoshin, Konan & TV tower
    for (let i = 0; i < city.aviationBeacons.length; i++) {
      const b: AviationBeaconHandle = city.aviationBeacons[i];
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(time * 3.4 + b.phaseOffset), 4);
      const scale = 0.7 + pulse * 0.6;
      b.mesh.scale.setScalar(scale);
      (b.halo.material as THREE.SpriteMaterial).opacity =
        (0.25 + pulse * 0.75) * (0.45 + mood.nightFactor * 0.55);
      b.halo.scale.setScalar(1.3 + pulse * 1.2);
    }

    // Subtle rain / mist motes when cityHarm >= 45 or late night
    const wantsRain = state.cityHarm >= 45 || mood.nightFactor >= 0.75;
    const targetRainOpacity = wantsRain
      ? THREE.MathUtils.clamp(
          (state.cityHarm >= 45 ? 0.32 : 0.14) + mood.nightFactor * 0.14,
          0,
          0.42
        )
      : 0;
    this.rainMat.opacity = THREE.MathUtils.lerp(this.rainMat.opacity, targetRainOpacity, 0.08);
    this.rainPoints.visible = this.rainMat.opacity > 0.02;

    if (this.rainPoints.visible) {
      const posAttr = this.rainGeo.getAttribute('position') as THREE.BufferAttribute;
      const fallSpeed = state.cityHarm >= 45 ? 16.5 : 8.5;
      for (let i = 0; i < this.rainCount; i++) {
        let y = this.rainPositions[i * 3 + 1] - fallSpeed * dt;
        let x = this.rainPositions[i * 3 + 0] - 1.4 * dt;
        if (y < 0.2) {
          y = 24.5;
          x = (Math.random() - 0.5) * 68;
        }
        this.rainPositions[i * 3 + 0] = x;
        this.rainPositions[i * 3 + 1] = y;
      }
      posAttr.needsUpdate = true;
    }
  }

  public dispose(): void {
    this.rainGeo.dispose();
    this.rainMat.dispose();
  }
}
