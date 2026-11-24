import * as THREE from 'three';
import type { DistrictId, GameState, SceneCallbacks } from '../types/game';
import { buildKaiwanCity, type CityBuildResult } from './CityBuilder';
import { EffectsAndLighting } from './EffectsAndLighting';
import { NetworkVisuals } from './NetworkVisuals';
import { TrafficAndAgents } from './TrafficAndAgents';

const DISTRICT_CENTERS: Record<DistrictId, [number, number]> = {
  kasumigahama: [-16, -10],
  shintoshin: [16, -12],
  konan: [18, 14],
  sakuradai: [-18, 12],
  kurokawa: [-2, 16],
  chuo: [0, -2],
};

const DEFAULT_CAMERA = {
  target: new THREE.Vector3(1, 0, 2),
  theta: 0.42,
  phi: 0.90,
  radius: 55,
};

function detectSoftwareWebGL(renderer: THREE.WebGLRenderer): boolean {
  try {
    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const rendererStr = String(
        gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
      );
      return /SwiftShader|llvmpipe|Software|Mesa/i.test(rendererStr);
    }
  } catch {
    // Ignore context extension query errors
  }
  return false;
}

export class CityScene {
  private readonly container: HTMLElement;
  private readonly callbacks: SceneCallbacks;

  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private city: CityBuildResult | null = null;
  private traffic: TrafficAndAgents | null = null;
  private network: NetworkVisuals | null = null;
  private effects: EffectsAndLighting | null = null;

  private latestState: GameState | null = null;
  private selectedDistrict: DistrictId | null = null;
  private hoveredDistrict: DistrictId | null = null;
  private selectedOpId: string | null = null;

  // Damped spherical camera state
  private targetCurrent = DEFAULT_CAMERA.target.clone();
  private targetGoal = DEFAULT_CAMERA.target.clone();
  private thetaCurrent = DEFAULT_CAMERA.theta;
  private thetaGoal = DEFAULT_CAMERA.theta;
  private phiCurrent = DEFAULT_CAMERA.phi;
  private phiGoal = DEFAULT_CAMERA.phi;
  private radiusCurrent = DEFAULT_CAMERA.radius;
  private radiusGoal = DEFAULT_CAMERA.radius;

  // Pointer & gesture state
  private activePointers = new Map<number, { x: number; y: number }>();
  private dragStartPos = { x: 0, y: 0 };
  private lastPointerPos = { x: 0, y: 0 };
  private dragMode: 'none' | 'orbit' | 'pan' | 'pinch' = 'none';
  private pointerMovedDist = 0;
  private lastPinchDist = 0;
  private lastPinchMid = { x: 0, y: 0 };
  private isLowGpu = false;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();

  private rafId: number | null = null;
  private lastTimeMs = 0;
  private elapsedTime = 0;
  private disposed = false;

  constructor(container: HTMLElement, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.5, 320);

    try {
      // Probe software WebGL renderer before creating main WebGLRenderer so we can skip heavy MSAA on SwiftShader
      let isLowGpu = false;
      try {
        const probeCanvas = document.createElement('canvas');
        const probeGl =
          probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
        if (probeGl) {
          const debugInfo = probeGl.getExtension('WEBGL_debug_renderer_info');
          if (debugInfo) {
            const rendererStr = String(
              probeGl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
            );
            isLowGpu = /SwiftShader|llvmpipe|Software|Mesa/i.test(rendererStr);
          }
          probeGl.getExtension('WEBGL_lose_context')?.loseContext();
        }
      } catch {
        // Ignore probe errors
      }

      const renderer = new THREE.WebGLRenderer({
        antialias: !isLowGpu,
        powerPreference: 'high-performance',
        alpha: false,
      });

      this.isLowGpu = isLowGpu || detectSoftwareWebGL(renderer);
      if (this.isLowGpu) {
        document.documentElement.classList.add('low-gpu');
      }

      renderer.setPixelRatio(
        this.isLowGpu ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      );
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = !this.isLowGpu;
      if (!this.isLowGpu) {
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      }
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.touchAction = 'none';
      container.appendChild(renderer.domElement);
      this.renderer = renderer;

      this.city = buildKaiwanCity(renderer, { isLowGpu: this.isLowGpu });
      this.scene.add(this.city.root);

      this.effects = new EffectsAndLighting(this.scene, this.isLowGpu);
      this.scene.add(this.effects.root);

      this.traffic = new TrafficAndAgents(this.city.expresswayCurve);
      this.scene.add(this.traffic.root);

      this.network = new NetworkVisuals();
      this.scene.add(this.network.root);

      this.updateCameraTransform();
      this.bindEvents();

      this.lastTimeMs = performance.now();
      this.loop(this.lastTimeMs);
    } catch (err) {
      // Graceful fallback if WebGL fails in constrained environments
      console.warn('[CityScene] WebGL initialization failed:', err);
      const fallback = document.createElement('div');
      fallback.style.width = '100%';
      fallback.style.height = '100%';
      fallback.style.background =
        'radial-gradient(circle at 50% 45%, #1a243d 0%, #090e1c 75%)';
      container.appendChild(fallback);
    }
  }

  public updateState(
    state: GameState,
    selectedDistrict: DistrictId | null,
    selectedOpId: string | null,
    showNetworkArcs: boolean
  ): void {
    this.latestState = state;
    this.selectedDistrict = selectedDistrict;
    this.selectedOpId = selectedOpId;

    if (this.traffic) {
      this.traffic.syncState(state, selectedOpId, this.elapsedTime);
    }
    if (this.network) {
      this.network.syncState(state, showNetworkArcs);
    }
  }

  public focusDistrict(districtId: DistrictId): void {
    const center = DISTRICT_CENTERS[districtId];
    if (!center) return;
    this.targetGoal.set(center[0], 1.8, center[1]);
    this.radiusGoal = THREE.MathUtils.clamp(32, 22, 78);
    this.phiGoal = THREE.MathUtils.clamp(0.76, 0.38, 1.18);
  }

  public resetCamera(): void {
    this.targetGoal.copy(DEFAULT_CAMERA.target);
    this.thetaGoal = DEFAULT_CAMERA.theta;
    this.phiGoal = DEFAULT_CAMERA.phi;
    this.radiusGoal = DEFAULT_CAMERA.radius;
  }

  private projVec = new THREE.Vector3();

  public projectWorldPoint(
    worldX: number,
    worldY: number,
    worldZ: number
  ): { x: number; y: number; visible: boolean } {
    if (!this.renderer || this.disposed) {
      return { x: -9999, y: -9999, visible: false };
    }
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width <= 0 || height <= 0) {
      return { x: -9999, y: -9999, visible: false };
    }
    this.projVec.set(worldX, worldY, worldZ).project(this.camera);
    const visible =
      this.projVec.z >= -1 &&
      this.projVec.z <= 1 &&
      this.projVec.x >= -0.96 &&
      this.projVec.x <= 0.96 &&
      this.projVec.y >= -0.92 &&
      this.projVec.y <= 0.92;
    return {
      x: (this.projVec.x * 0.5 + 0.5) * width,
      y: (-this.projVec.y * 0.5 + 0.5) * height,
      visible,
    };
  }

  public resize(): void {
    if (!this.renderer || this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(
      this.isLowGpu ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(width, height);
  }

  private updateCameraTransform(): void {
    const sinPhi = Math.sin(this.phiCurrent);
    const cosPhi = Math.cos(this.phiCurrent);
    const sinTheta = Math.sin(this.thetaCurrent);
    const cosTheta = Math.cos(this.thetaCurrent);

    this.camera.position.set(
      this.targetCurrent.x + this.radiusCurrent * sinPhi * sinTheta,
      this.targetCurrent.y + this.radiusCurrent * cosPhi,
      this.targetCurrent.z + this.radiusCurrent * sinPhi * cosTheta
    );
    this.camera.lookAt(this.targetCurrent);
  }

  private clampTargets(): void {
    this.phiGoal = THREE.MathUtils.clamp(this.phiGoal, 0.38, 1.18);
    this.radiusGoal = THREE.MathUtils.clamp(this.radiusGoal, 22, 78);
    this.targetGoal.x = THREE.MathUtils.clamp(this.targetGoal.x, -26, 26);
    this.targetGoal.z = THREE.MathUtils.clamp(this.targetGoal.z, -22, 24);
    this.targetGoal.y = THREE.MathUtils.clamp(this.targetGoal.y, 0.5, 6);
  }

  private getPinchMetrics(): { dist: number; midX: number; midY: number } {
    const pts = Array.from(this.activePointers.values());
    if (pts.length < 2) return { dist: 0, midX: 0, midY: 0 };
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return {
      dist: Math.hypot(dx, dy),
      midX: (pts[0].x + pts[1].x) * 0.5,
      midY: (pts[0].y + pts[1].y) * 0.5,
    };
  }

  private applyPanDelta(dx: number, dy: number): void {
    const panScale = this.radiusCurrent * 0.0014;
    const sinT = Math.sin(this.thetaCurrent);
    const cosT = Math.cos(this.thetaCurrent);
    // Right vector: (cosT, 0, -sinT), Forward vector on XZ: (-sinT, 0, -cosT)
    this.targetGoal.x += (-dx * cosT - dy * sinT) * panScale;
    this.targetGoal.z += (dx * sinT - dy * cosT) * panScale;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (!this.renderer) return;
    const dom = this.renderer.domElement;
    dom.setPointerCapture(e.pointerId);
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 1) {
      this.dragStartPos = { x: e.clientX, y: e.clientY };
      this.lastPointerPos = { x: e.clientX, y: e.clientY };
      this.pointerMovedDist = 0;
      const isRightOrShift = e.button === 2 || e.button === 1 || e.shiftKey;
      this.dragMode = isRightOrShift ? 'pan' : 'orbit';
    } else if (this.activePointers.size === 2) {
      this.dragMode = 'pinch';
      const metrics = this.getPinchMetrics();
      this.lastPinchDist = metrics.dist;
      this.lastPinchMid = { x: metrics.midX, y: metrics.midY };
      this.pointerMovedDist = 999; // Suppress click after multi-touch gesture
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.renderer) return;

    // Update hover highlight even when not dragging
    if (this.activePointers.size === 0) {
      this.updateHover(e.clientX, e.clientY);
      return;
    }

    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.activePointers.size === 2 && this.dragMode === 'pinch') {
      const metrics = this.getPinchMetrics();
      if (this.lastPinchDist > 0 && metrics.dist > 0) {
        const zoomDelta = this.lastPinchDist - metrics.dist;
        this.radiusGoal += zoomDelta * 0.14;
      }
      // Two-finger midpoint drag pan alongside pinch zoom
      const midDx = metrics.midX - this.lastPinchMid.x;
      const midDy = metrics.midY - this.lastPinchMid.y;
      this.applyPanDelta(midDx, midDy);

      this.lastPinchDist = metrics.dist;
      this.lastPinchMid = { x: metrics.midX, y: metrics.midY };
      this.clampTargets();
      return;
    }

    if (this.activePointers.size === 1) {
      const dx = e.clientX - this.lastPointerPos.x;
      const dy = e.clientY - this.lastPointerPos.y;
      this.lastPointerPos = { x: e.clientX, y: e.clientY };
      this.pointerMovedDist = Math.max(
        this.pointerMovedDist,
        Math.hypot(e.clientX - this.dragStartPos.x, e.clientY - this.dragStartPos.y)
      );

      if (this.dragMode === 'orbit') {
        this.thetaGoal -= dx * 0.0062;
        this.phiGoal -= dy * 0.0052;
      } else if (this.dragMode === 'pan') {
        this.applyPanDelta(dx, dy);
      }
      this.clampTargets();
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.renderer) return;
    if (this.renderer.domElement.hasPointerCapture(e.pointerId)) {
      this.renderer.domElement.releasePointerCapture(e.pointerId);
    }
    const wasSingleDrag = this.activePointers.size === 1 && this.dragMode !== 'pinch';
    this.activePointers.delete(e.pointerId);

    if (this.activePointers.size === 0) {
      if (wasSingleDrag && this.pointerMovedDist < 6 && e.button !== 2) {
        this.handleClickPick(e.clientX, e.clientY);
      }
      this.dragMode = 'none';
    } else if (this.activePointers.size === 1) {
      const remaining = Array.from(this.activePointers.values())[0];
      this.lastPointerPos = { x: remaining.x, y: remaining.y };
      this.dragMode = 'orbit';
    }
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const zoomStep = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY) * 0.04, 6);
    this.radiusGoal += zoomStep;
    this.clampTargets();
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private setRaycasterFromClient(clientX: number, clientY: number): boolean {
    if (!this.renderer) return false;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    return true;
  }

  private updateHover(clientX: number, clientY: number): void {
    if (!this.renderer || !this.city || !this.traffic) return;
    if (this.latestState?.phase === 'title') {
      this.hoveredDistrict = null;
      this.renderer.domElement.style.cursor = 'grab';
      return;
    }

    if (!this.setRaycasterFromClient(clientX, clientY)) return;
    const opHits = this.raycaster.intersectObjects(
      this.traffic.getOperationHitTargets(),
      false
    );
    if (opHits.length > 0) {
      this.renderer.domElement.style.cursor = 'pointer';
      const opId = opHits[0].object.userData.opId as string | undefined;
      const op = this.latestState?.operations.find((o) => o.id === opId);
      this.hoveredDistrict = op?.districtId ?? null;
      return;
    }

    const distHits = this.raycaster.intersectObjects(this.city.districtHitTargets, false);
    if (distHits.length > 0) {
      this.hoveredDistrict = distHits[0].object.userData.districtId as DistrictId;
      this.renderer.domElement.style.cursor = 'pointer';
    } else {
      this.hoveredDistrict = null;
      this.renderer.domElement.style.cursor = 'grab';
    }
  }

  private handleClickPick(clientX: number, clientY: number): void {
    if (!this.city || !this.traffic) return;
    if (this.latestState?.phase === 'title') return;

    if (!this.setRaycasterFromClient(clientX, clientY)) return;

    // 1. Prioritize 3D floating operation markers
    const opHits = this.raycaster.intersectObjects(
      this.traffic.getOperationHitTargets(),
      false
    );
    if (opHits.length > 0) {
      const opId = opHits[0].object.userData.opId as string | undefined;
      if (opId) {
        this.callbacks.onSelectOperation(opId);
        return;
      }
    }

    // 2. Otherwise check district plaques / territory hit discs
    const distHits = this.raycaster.intersectObjects(this.city.districtHitTargets, false);
    if (distHits.length > 0) {
      const districtId = distHits[0].object.userData.districtId as DistrictId | undefined;
      if (districtId) {
        this.callbacks.onSelectDistrict(districtId);
        return;
      }
    }

    // 3. Clicked empty bay water / sky -> clear selection
    this.callbacks.onClearSelection();
  }

  private bindEvents(): void {
    if (!this.renderer) return;
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    dom.addEventListener('pointermove', this.onPointerMove);
    dom.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('resize', this.resizeHandler);
  }

  private unbindEvents(): void {
    if (!this.renderer) return;
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    dom.removeEventListener('pointermove', this.onPointerMove);
    dom.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('pointercancel', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('resize', this.resizeHandler);
  }

  private resizeHandler = (): void => {
    this.resize();
  };

  private loop = (nowMs: number): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);

    const dt = Math.max(0, Math.min((nowMs - this.lastTimeMs) / 1000, 0.05));
    this.lastTimeMs = nowMs;
    this.elapsedTime += dt;

    // Gentle cinematic auto-orbit on title screen
    if (this.latestState?.phase === 'title' && this.dragMode === 'none') {
      this.thetaGoal += dt * 0.085;
      this.phiGoal = 0.84 + Math.sin(this.elapsedTime * 0.25) * 0.04;
      this.radiusGoal = 48 + Math.sin(this.elapsedTime * 0.18) * 2.0;
    }

    // Smooth camera damping
    const damp = 1 - Math.exp(-8.5 * dt);
    this.targetCurrent.lerp(this.targetGoal, damp);
    this.thetaCurrent = THREE.MathUtils.lerp(this.thetaCurrent, this.thetaGoal, damp);
    this.phiCurrent = THREE.MathUtils.lerp(this.phiCurrent, this.phiGoal, damp);
    this.radiusCurrent = THREE.MathUtils.lerp(this.radiusCurrent, this.radiusGoal, damp);
    this.updateCameraTransform();

    if (this.latestState && this.city && this.effects) {
      this.effects.update(dt, this.elapsedTime, this.latestState, this.city);
      this.city.updateDistrictVisuals(
        this.latestState.districts,
        this.selectedDistrict,
        this.hoveredDistrict,
        this.effects.currentNightFactor,
        this.elapsedTime
      );
      if (this.traffic) {
        this.traffic.update(dt, this.elapsedTime, this.latestState.policeTrace);
      }
      if (this.network) {
        this.network.update(this.elapsedTime);
      }
    } else if (this.traffic) {
      this.traffic.update(dt, this.elapsedTime, 15);
    }

    if (this.renderer) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.unbindEvents();

    if (this.isLowGpu) {
      document.documentElement.classList.remove('low-gpu');
    }

    this.city?.dispose();
    this.traffic?.dispose();
    this.network?.dispose();
    this.effects?.dispose();

    if (this.renderer) {
      this.renderer.dispose();
      const dom = this.renderer.domElement;
      if (dom.parentElement === this.container) {
        this.container.removeChild(dom);
      }
      this.renderer = null;
    }
  }
}
