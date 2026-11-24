import * as THREE from 'three';
import type {
  Character,
  DistrictId,
  DistrictState,
  GameState,
  Operation,
  OperationCategory,
} from '../types/game';
import { createGlowSpriteTexture } from './CityBuilder';

const OP_CATEGORY_COLORS: Record<OperationCategory, string> = {
  fraud_mirage: '#f59e0b',   // Amber
  bogus_repair: '#fbbf24',   // Gold
  nightlife_ring: '#f43f5e', // Crimson-pink
  fenced_goods: '#14b8a6',   // Teal
  cyber_parlor: '#38bdf8',   // Electric Teal-cyan
  smash_grab: '#ef4444',     // Crimson
  front_business: '#eab308', // Gold
};

const DISTRICT_CENTERS: Record<DistrictId, [number, number]> = {
  kasumigahama: [-16, -10],
  shintoshin: [16, -12],
  konan: [18, 14],
  sakuradai: [-18, 12],
  kurokawa: [-2, 16],
  chuo: [0, -2],
};

interface AmbientCar {
  isExpressway: boolean;
  loopIndex: number;
  t: number;
  speed: number;
  color: THREE.Color;
  isVan: boolean;
}

interface PoliceCruiser {
  loopIndex: number;
  t: number;
  speed: number;
  phaseOffset: number;
  assignedDistrict: DistrictId | null;
}

interface OpMarkerVisual {
  opId: string;
  group: THREE.Group;
  diamond: THREE.Mesh;
  diamondMat: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  haloMat: THREE.SpriteMaterial;
  groundRing: THREE.Mesh;
  groundRingMat: THREE.MeshBasicMaterial;
  progressRing: THREE.Mesh;
  progressRingMat: THREE.MeshBasicMaterial;
  hitMat: THREE.MeshBasicMaterial;
  hitTarget: THREE.Mesh;
  baseColor: THREE.Color;
  worldX: number;
  isSelected: boolean;
  isActive: boolean;
  progress: number;
}

interface CourierVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshBasicMaterial;
  halo: THREE.Sprite;
  haloMat: THREE.SpriteMaterial;
  originX: number;
  originZ: number;
  targetX: number;
  targetZ: number;
  progress: number;
  isUrgent: boolean;
}

export class TrafficAndAgents {
  public readonly root = new THREE.Group();
  private readonly expresswayCurve: THREE.CatmullRomCurve3;
  private readonly groundLoops: THREE.CatmullRomCurve3[] = [];
  private readonly districtLoops: Record<DistrictId, THREE.CatmullRomCurve3>;

  // Instanced ambient cars
  private readonly maxCars = 42;
  private readonly carBodyInst: THREE.InstancedMesh;
  private readonly headlightInst: THREE.InstancedMesh;
  private readonly taillightInst: THREE.InstancedMesh;
  private readonly cars: AmbientCar[] = [];

  // Police cruisers (individual small groups for alternating red/blue lightbars)
  private readonly maxCruisers = 14;
  private readonly cruiserGroups: {
    group: THREE.Group;
    redLight: THREE.Mesh;
    blueLight: THREE.Mesh;
    redMat: THREE.MeshBasicMaterial;
    blueMat: THREE.MeshBasicMaterial;
    halo: THREE.Sprite;
    haloMat: THREE.SpriteMaterial;
  }[] = [];
  private readonly cruisers: PoliceCruiser[] = [];

  // Operation markers
  private readonly opMarkersGroup = new THREE.Group();
  private readonly opMarkers = new Map<string, OpMarkerVisual>();
  private readonly sharedDiamondGeo: THREE.BufferGeometry;
  private readonly sharedRingGeo: THREE.BufferGeometry;
  private readonly sharedProgressGeo: THREE.BufferGeometry;
  private readonly sharedOpHitGeo: THREE.BufferGeometry;
  private readonly glowTex: THREE.CanvasTexture;

  // Active operation couriers
  private readonly couriersGroup = new THREE.Group();
  private readonly courierPool: CourierVisual[] = [];
  private readonly courierGeo: THREE.BufferGeometry;

  private readonly disposables: {
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
    textures: THREE.Texture[];
  } = { geometries: [], materials: [], textures: [] };

  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpNext = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  private readonly colorTealEmissive = new THREE.Color('#2dd4bf');
  private readonly colorCourierUrgent = new THREE.Color('#fbbf24');
  private readonly colorCourierNormal = new THREE.Color('#38bdf8');
  private readonly colorCruiserRedOn = new THREE.Color('#ff2442');
  private readonly colorCruiserRedOff = new THREE.Color('#3a0a12');
  private readonly colorCruiserBlueOn = new THREE.Color('#38bdf8');
  private readonly colorCruiserBlueOff = new THREE.Color('#0c1f4a');
  private activeCourierCount = 0;

  constructor(expresswayCurve: THREE.CatmullRomCurve3) {
    this.expresswayCurve = expresswayCurve;
    this.root.name = 'TrafficAndAgents';

    this.glowTex = createGlowSpriteTexture();
    this.disposables.textures.push(this.glowTex);

    // Build ground road loops matching CityBuilder road grid
    this.groundLoops = [
      // Outer boulevard loop
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-25.8, 0.18, -20.2),
          new THREE.Vector3(25.5, 0.18, -20.2),
          new THREE.Vector3(25.5, 0.18, 20.6),
          new THREE.Vector3(-25.8, 0.18, 20.6),
        ],
        true,
        'catmullrom',
        0.1
      ),
      // Central cross-city loop
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-8.5, 0.18, -20.2),
          new THREE.Vector3(8.5, 0.18, -20.2),
          new THREE.Vector3(8.5, 0.18, 5.5),
          new THREE.Vector3(-8.5, 0.18, 5.5),
        ],
        true,
        'catmullrom',
        0.1
      ),
      // Southern bayfront loop
      new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(-25.8, 0.18, 5.5),
          new THREE.Vector3(25.5, 0.18, 5.5),
          new THREE.Vector3(25.5, 0.18, 20.6),
          new THREE.Vector3(-25.8, 0.18, 20.6),
        ],
        true,
        'catmullrom',
        0.1
      ),
    ];

    // District patrol loops (clamped inside island seawall bounds)
    this.districtLoops = {} as Record<DistrictId, THREE.CatmullRomCurve3>;
    (Object.keys(DISTRICT_CENTERS) as DistrictId[]).forEach((dId) => {
      const [cx, cz] = DISTRICT_CENTERS[dId];
      const r = dId === 'kurokawa' ? 4.4 : 6.4;
      const minZ = Math.max(-21.0, cz - r);
      const maxZ = Math.min(20.2, cz + r);
      const minX = Math.max(-25.0, cx - r);
      const maxX = Math.min(25.0, cx + r);
      this.districtLoops[dId] = new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(minX, 0.18, minZ),
          new THREE.Vector3(maxX, 0.18, minZ),
          new THREE.Vector3(maxX, 0.18, maxZ),
          new THREE.Vector3(minX, 0.18, maxZ),
        ],
        true,
        'catmullrom',
        0.2
      );
    });

    // Instanced ambient cars
    const carBodyGeo = new THREE.BoxGeometry(0.46, 0.28, 0.92);
    const carBodyMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.4,
      metalness: 0.45,
    });
    const headGeo = new THREE.BoxGeometry(0.36, 0.08, 0.08);
    const headMat = new THREE.MeshBasicMaterial({ color: '#fffbeb', toneMapped: false });
    const tailGeo = new THREE.BoxGeometry(0.36, 0.08, 0.08);
    const tailMat = new THREE.MeshBasicMaterial({ color: '#ff2b4a', toneMapped: false });

    this.disposables.geometries.push(carBodyGeo, headGeo, tailGeo);
    this.disposables.materials.push(carBodyMat, headMat, tailMat);

    this.carBodyInst = new THREE.InstancedMesh(carBodyGeo, carBodyMat, this.maxCars);
    this.headlightInst = new THREE.InstancedMesh(headGeo, headMat, this.maxCars);
    this.taillightInst = new THREE.InstancedMesh(tailGeo, tailMat, this.maxCars);
    this.carBodyInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.headlightInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.taillightInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const palette = ['#64748b', '#94a3b8', '#334155', '#475569', '#cbd5e1', '#b45309', '#1e293b'];
    for (let i = 0; i < this.maxCars; i++) {
      const isExpressway = i < 18;
      const isVan = i % 4 === 0;
      const col = new THREE.Color(palette[i % palette.length]);
      this.cars.push({
        isExpressway,
        loopIndex: i % this.groundLoops.length,
        t: (i / this.maxCars + (i % 3) * 0.17) % 1,
        speed: (isExpressway ? 0.042 : 0.028) + (i % 5) * 0.004,
        color: col,
        isVan,
      });
      this.carBodyInst.setColorAt(i, col);
    }
    if (this.carBodyInst.instanceColor) {
      this.carBodyInst.instanceColor.needsUpdate = true;
    }

    this.root.add(this.carBodyInst, this.headlightInst, this.taillightInst);

    // Police cruisers pool
    const cruiserBodyGeo = new THREE.BoxGeometry(0.5, 0.28, 1.02);
    const cruiserRoofGeo = new THREE.BoxGeometry(0.42, 0.14, 0.48);
    const barGeo = new THREE.BoxGeometry(0.18, 0.09, 0.14);
    const cruiserBlackMat = new THREE.MeshStandardMaterial({
      color: '#111827',
      roughness: 0.35,
      metalness: 0.5,
    });
    const cruiserWhiteMat = new THREE.MeshStandardMaterial({
      color: '#f8fafc',
      roughness: 0.35,
      metalness: 0.2,
    });
    this.disposables.geometries.push(cruiserBodyGeo, cruiserRoofGeo, barGeo);
    this.disposables.materials.push(cruiserBlackMat, cruiserWhiteMat);

    for (let i = 0; i < this.maxCruisers; i++) {
      const cg = new THREE.Group();
      const body = new THREE.Mesh(cruiserBodyGeo, cruiserBlackMat);
      body.position.y = 0.14;
      const roof = new THREE.Mesh(cruiserRoofGeo, cruiserWhiteMat);
      roof.position.y = 0.32;
      const redMat = new THREE.MeshBasicMaterial({ color: '#ff1f3d', toneMapped: false });
      const blueMat = new THREE.MeshBasicMaterial({ color: '#2563eb', toneMapped: false });
      this.disposables.materials.push(redMat, blueMat);

      const redLight = new THREE.Mesh(barGeo, redMat);
      redLight.position.set(-0.1, 0.43, 0);
      const blueLight = new THREE.Mesh(barGeo, blueMat);
      blueLight.position.set(0.1, 0.43, 0);

      const haloMat = new THREE.SpriteMaterial({
        map: this.glowTex,
        color: '#ef4444',
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.disposables.materials.push(haloMat);
      const halo = new THREE.Sprite(haloMat);
      halo.position.set(0, 0.55, 0);
      halo.scale.set(2.2, 2.2, 1);

      cg.add(body, roof, redLight, blueLight, halo);
      cg.visible = false;
      this.root.add(cg);

      this.cruiserGroups.push({
        group: cg,
        redLight,
        blueLight,
        redMat,
        blueMat,
        halo,
        haloMat,
      });
      this.cruisers.push({
        loopIndex: i % this.groundLoops.length,
        t: (i * 0.19) % 1,
        speed: 0.044 + (i % 4) * 0.006,
        phaseOffset: i * 1.37,
        assignedDistrict: null,
      });
    }

    // Shared geometries for Operation Markers & Couriers
    this.sharedDiamondGeo = new THREE.OctahedronGeometry(0.62, 0);
    this.sharedRingGeo = new THREE.RingGeometry(0.95, 1.24, 32);
    this.sharedRingGeo.rotateX(-Math.PI / 2);
    this.sharedProgressGeo = new THREE.RingGeometry(1.42, 1.72, 32);
    this.sharedProgressGeo.rotateX(-Math.PI / 2);
    this.sharedOpHitGeo = new THREE.SphereGeometry(1.35, 10, 10);
    this.courierGeo = new THREE.BoxGeometry(0.42, 0.28, 0.72);
    this.disposables.geometries.push(
      this.sharedDiamondGeo,
      this.sharedRingGeo,
      this.sharedProgressGeo,
      this.sharedOpHitGeo,
      this.courierGeo
    );

    this.root.add(this.opMarkersGroup);
    this.root.add(this.couriersGroup);
  }

  public getOperationHitTargets(): THREE.Object3D[] {
    const targets: THREE.Object3D[] = [];
    this.opMarkers.forEach((m) => {
      if (m.group.visible) targets.push(m.hitTarget);
    });
    return targets;
  }

  public syncState(
    state: GameState,
    selectedOpId: string | null,
    _time: number
  ): void {
    const ops = state.operations;
    const activeSet = new Set<string>();

    // Sync operation markers (show available + active)
    for (const op of ops) {
      if (op.status !== 'available' && op.status !== 'active') continue;
      activeSet.add(op.id);

      let marker = this.opMarkers.get(op.id);
      if (!marker) {
        marker = this.createOpMarker(op);
        this.opMarkers.set(op.id, marker);
        this.opMarkersGroup.add(marker.group);
      }

      const isSelected = op.id === selectedOpId;
      const isActive = op.status === 'active';
      marker.group.visible = true;
      marker.group.position.set(op.worldPos[0], 0.16, op.worldPos[1]);
      marker.worldX = op.worldPos[0];
      marker.isSelected = isSelected;
      marker.isActive = isActive;
      marker.progress = op.progress;

      marker.halo.scale.setScalar(isSelected ? 4.0 : 2.9);
      marker.haloMat.opacity = isSelected ? 0.92 : 0.65;
      marker.groundRingMat.opacity = isSelected ? 0.9 : 0.55;
      marker.progressRing.visible = isActive;
      if (isActive) {
        marker.diamondMat.emissive.copy(this.colorTealEmissive);
      } else {
        marker.diamondMat.emissive.copy(marker.baseColor);
      }
    }

    // Remove and dispose expired / completed / failed / busted markers cleanly
    for (const [opId, marker] of this.opMarkers.entries()) {
      if (!activeSet.has(opId)) {
        this.opMarkersGroup.remove(marker.group);
        marker.diamondMat.dispose();
        marker.haloMat.dispose();
        marker.groundRingMat.dispose();
        marker.progressRingMat.dispose();
        marker.hitMat.dispose();
        this.opMarkers.delete(opId);
      }
    }

    // Sync active operation couriers moving from homeDistrict -> op.worldPos
    const activeOps = ops.filter((o) => o.status === 'active');
    const charById = new Map<string, Character>();
    for (const c of state.characters) charById.set(c.id, c);

    while (this.courierPool.length < activeOps.length) {
      const cg = new THREE.Group();
      const bodyMat = new THREE.MeshBasicMaterial({ color: '#38bdf8', toneMapped: false });
      const body = new THREE.Mesh(this.courierGeo, bodyMat);
      body.position.y = 0.22;
      const haloMat = new THREE.SpriteMaterial({
        map: this.glowTex,
        color: '#38bdf8',
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const halo = new THREE.Sprite(haloMat);
      halo.position.y = 0.35;
      halo.scale.set(1.9, 1.9, 1);
      this.disposables.materials.push(bodyMat, haloMat);
      cg.add(body, halo);
      this.couriersGroup.add(cg);
      this.courierPool.push({
        group: cg,
        bodyMat,
        halo,
        haloMat,
        originX: 0,
        originZ: 0,
        targetX: 0,
        targetZ: 0,
        progress: 0,
        isUrgent: false,
      });
    }

    this.activeCourierCount = activeOps.length;
    const isUrgent = state.policeTrace >= 60;

    for (let idx = 0; idx < this.courierPool.length; idx++) {
      const cv = this.courierPool[idx];
      if (idx >= activeOps.length) {
        cv.group.visible = false;
        continue;
      }
      const op = activeOps[idx];
      const operative =
        (op.assignedSubId && charById.get(op.assignedSubId)) ||
        (op.assignedLeadId && charById.get(op.assignedLeadId)) ||
        null;
      const originDistrict: DistrictId = operative?.homeDistrict ?? 'kurokawa';
      const [ox, oz] = DISTRICT_CENTERS[originDistrict];
      const [tx, tz] = op.worldPos;

      cv.originX = ox;
      cv.originZ = oz;
      cv.targetX = tx;
      cv.targetZ = tz;
      cv.progress = op.progress;
      cv.isUrgent = isUrgent;
      cv.group.visible = true;
      cv.bodyMat.color.copy(isUrgent ? this.colorCourierUrgent : this.colorCourierNormal);
      cv.haloMat.color.copy(isUrgent ? this.colorCourierUrgent : this.colorCourierNormal);
    }

    // Assign police cruisers dynamically based on policeTrace & district.heat
    this.updateCruiserAssignments(state.policeTrace, state.districts);
  }

  private updateCruiserAssignments(
    policeTrace: number,
    districts: Record<DistrictId, DistrictState>
  ): void {
    const hotDistricts = (Object.keys(districts) as DistrictId[])
      .map((id) => districts[id])
      .filter((d) => d.heat >= 35)
      .sort((a, b) => b.heat - a.heat);

    const targetCruiserCount = Math.min(
      this.maxCruisers,
      Math.max(2, Math.floor(2 + (policeTrace / 100) * 10 + hotDistricts.length * 0.6))
    );

    for (let i = 0; i < this.maxCruisers; i++) {
      const active = i < targetCruiserCount;
      this.cruiserGroups[i].group.visible = active;
      if (active) {
        if (hotDistricts.length > 0 && i >= 2) {
          this.cruisers[i].assignedDistrict = hotDistricts[i % hotDistricts.length].id;
        } else {
          this.cruisers[i].assignedDistrict = null;
        }
      }
    }
  }

  private createOpMarker(op: Operation): OpMarkerVisual {
    const colorHex = OP_CATEGORY_COLORS[op.category] ?? '#f59e0b';
    const baseColor = new THREE.Color(colorHex);
    const group = new THREE.Group();

    const diamondMat = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: baseColor,
      emissiveIntensity: 1.7,
      roughness: 0.25,
      metalness: 0.5,
    });
    const diamond = new THREE.Mesh(this.sharedDiamondGeo, diamondMat);
    diamond.position.y = 2.65;
    group.add(diamond);

    const haloMat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color: baseColor,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.position.y = 2.65;
    halo.scale.set(3.0, 3.0, 1);
    group.add(halo);

    const groundRingMat = new THREE.MeshBasicMaterial({
      color: baseColor,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const groundRing = new THREE.Mesh(this.sharedRingGeo, groundRingMat);
    groundRing.position.y = 0.08;
    group.add(groundRing);

    const progressRingMat = new THREE.MeshBasicMaterial({
      color: '#2dd4bf',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const progressRing = new THREE.Mesh(this.sharedProgressGeo, progressRingMat);
    progressRing.position.y = 0.1;
    progressRing.visible = false;
    group.add(progressRing);

    const hitMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const hitTarget = new THREE.Mesh(this.sharedOpHitGeo, hitMat);
    hitTarget.position.y = 2.6;
    hitTarget.userData.opId = op.id;
    group.add(hitTarget);

    // Op marker materials are disposed individually when markers expire or in dispose()
    return {
      opId: op.id,
      group,
      diamond,
      diamondMat,
      halo,
      haloMat,
      groundRing,
      groundRingMat,
      progressRing,
      progressRingMat,
      hitMat,
      hitTarget,
      baseColor,
      worldX: op.worldPos[0],
      isSelected: false,
      isActive: op.status === 'active',
      progress: op.progress,
    };
  }

  public update(dt: number, time: number, policeTrace: number): void {
    // Animate 3D floating operation markers smoothly at full framerate (even when sim is paused)
    this.opMarkers.forEach((marker) => {
      if (!marker.group.visible) return;
      const bob = Math.sin(time * 2.8 + marker.worldX) * 0.28;
      marker.diamond.position.y = 2.65 + bob;
      marker.diamond.rotation.y = time * (marker.isActive ? 2.6 : 1.4);
      const scale = marker.isSelected ? 1.32 : marker.isActive ? 1.12 : 1.0;
      marker.diamond.scale.setScalar(scale);

      marker.halo.position.y = 2.65 + bob;
      marker.groundRing.scale.setScalar(
        marker.isSelected ? 1.25 : 1.0 + Math.sin(time * 3.0) * 0.06
      );

      if (marker.isActive) {
        const pulse = 0.5 + 0.5 * Math.sin(time * 5.2);
        marker.progressRingMat.opacity = 0.55 + pulse * 0.4;
        marker.progressRing.scale.setScalar(1.0 + marker.progress * 0.35);
      }
    });

    // Animate active operation couriers smoothly along shuttle routes
    for (let idx = 0; idx < this.activeCourierCount; idx++) {
      const cv = this.courierPool[idx];
      if (!cv || !cv.group.visible) continue;
      const travelT = (cv.progress * 2.0 + time * 0.18) % 2.0;
      const alpha = travelT <= 1.0 ? travelT : 2.0 - travelT;
      const px = THREE.MathUtils.lerp(cv.originX, cv.targetX, alpha);
      const pz = THREE.MathUtils.lerp(cv.originZ, cv.targetZ, alpha);
      cv.group.position.set(px, 0.16, pz);
      const dx = cv.targetX - cv.originX;
      const dz = cv.targetZ - cv.originZ;
      cv.group.rotation.y = Math.atan2(dx, dz) + (travelT > 1.0 ? Math.PI : 0);
    }

    // Advance ambient cars
    for (let i = 0; i < this.maxCars; i++) {
      const car = this.cars[i];
      car.t = (car.t + car.speed * dt) % 1;
      const curve = car.isExpressway
        ? this.expresswayCurve
        : this.groundLoops[car.loopIndex];

      curve.getPointAt(car.t, this.tmpPos);
      curve.getPointAt((car.t + 0.008) % 1, this.tmpNext);
      this.tmpDir.subVectors(this.tmpNext, this.tmpPos).normalize();

      // Right-hand lane offset on expressway & roads
      const laneSide = i % 2 === 0 ? 0.52 : -0.52;
      const sideVecX = -this.tmpDir.z * laneSide;
      const sideVecZ = this.tmpDir.x * laneSide;
      const posX = this.tmpPos.x + sideVecX;
      const posY = this.tmpPos.y + (car.isExpressway ? 0.15 : 0.0);
      const posZ = this.tmpPos.z + sideVecZ;

      this.tmpQuat.setFromUnitVectors(this.zAxis, this.tmpDir);

      this.tmpScale.set(1, car.isVan ? 1.45 : 1.0, car.isVan ? 1.25 : 1.0);
      this.tmpPos.set(posX, posY + 0.14, posZ);
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.carBodyInst.setMatrixAt(i, this.tmpMat);

      // Headlights at front
      this.tmpScale.set(1, 1, 1);
      this.tmpPos.set(
        posX + this.tmpDir.x * 0.48,
        posY + 0.14,
        posZ + this.tmpDir.z * 0.48
      );
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.headlightInst.setMatrixAt(i, this.tmpMat);

      // Taillights at back
      this.tmpPos.set(
        posX - this.tmpDir.x * 0.48,
        posY + 0.14,
        posZ - this.tmpDir.z * 0.48
      );
      this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
      this.taillightInst.setMatrixAt(i, this.tmpMat);
    }

    this.carBodyInst.instanceMatrix.needsUpdate = true;
    this.headlightInst.instanceMatrix.needsUpdate = true;
    this.taillightInst.instanceMatrix.needsUpdate = true;

    // Advance police cruisers & flash lightbars
    const speedScale = 1.0 + (policeTrace / 100) * 0.55;
    for (let i = 0; i < this.maxCruisers; i++) {
      const cg = this.cruiserGroups[i];
      if (!cg.group.visible) continue;
      const c = this.cruisers[i];
      c.t = (c.t + c.speed * speedScale * dt) % 1;

      const curve = c.assignedDistrict
        ? this.districtLoops[c.assignedDistrict]
        : this.groundLoops[c.loopIndex];

      curve.getPointAt(c.t, this.tmpPos);
      curve.getPointAt((c.t + 0.01) % 1, this.tmpNext);
      this.tmpDir.subVectors(this.tmpNext, this.tmpPos).normalize();

      cg.group.position.set(this.tmpPos.x, this.tmpPos.y, this.tmpPos.z);
      cg.group.rotation.y = Math.atan2(this.tmpDir.x, this.tmpDir.z);

      // Alternating red/blue siren flash
      const phase = Math.sin(time * 13.0 + c.phaseOffset);
      const redOn = phase > 0;
      cg.redMat.color.copy(redOn ? this.colorCruiserRedOn : this.colorCruiserRedOff);
      cg.blueMat.color.copy(redOn ? this.colorCruiserBlueOff : this.colorCruiserBlueOn);
      cg.haloMat.color.copy(redOn ? this.colorCruiserRedOn : this.colorCruiserBlueOn);
      cg.haloMat.opacity = 0.48 + 0.25 * Math.abs(phase);
    }
  }

  public dispose(): void {
    this.opMarkers.forEach((marker) => {
      marker.diamondMat.dispose();
      marker.haloMat.dispose();
      marker.groundRingMat.dispose();
      marker.progressRingMat.dispose();
      marker.hitMat.dispose();
    });
    this.opMarkers.clear();
    for (const g of this.disposables.geometries) g.dispose();
    for (const m of this.disposables.materials) m.dispose();
    for (const t of this.disposables.textures) t.dispose();
  }
}
