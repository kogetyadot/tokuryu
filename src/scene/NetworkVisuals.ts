import * as THREE from 'three';
import type { Character, DistrictId, GameState } from '../types/game';
import { createGlowSpriteTexture } from './CityBuilder';

const DISTRICT_CENTERS: Record<DistrictId, [number, number]> = {
  kasumigahama: [-16, -10],
  shintoshin: [16, -12],
  konan: [18, 14],
  sakuradai: [-18, 12],
  kurokawa: [-2, 16],
  chuo: [0, -2],
};

// Mastermind shadow relay sits above Kurokawa-Chuo border
const MASTERMIND_HUB = new THREE.Vector3(-2.0, 5.2, 12.2);

type ArcStyle = 'gold_direct' | 'teal_coord' | 'fogged_sub' | 'crimson_alert';

interface ArcEntry {
  curve: THREE.QuadraticBezierCurve3;
  line: THREE.Line;
  lineMat: THREE.LineBasicMaterial;
  style: ArcStyle;
  packetSpeed: number;
  packetPhase: number;
  baseOpacity: number;
}

export class NetworkVisuals {
  public readonly root = new THREE.Group();
  private readonly arcsGroup = new THREE.Group();
  private readonly packetsInst: THREE.InstancedMesh;
  private readonly maxPackets = 64;
  private readonly packetGeo: THREE.BufferGeometry;
  private readonly packetMat: THREE.MeshBasicMaterial;
  private readonly hubBeacon: THREE.Sprite;
  private readonly hubBeaconMat: THREE.SpriteMaterial;
  private readonly glowTex: THREE.CanvasTexture;

  private arcs: ArcEntry[] = [];
  private lastSignature = '';
  private showOverlay = false;

  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpScale = new THREE.Vector3(1, 1, 1);
  private readonly tmpMat = new THREE.Matrix4();
  private readonly tmpColor = new THREE.Color();
  private readonly colorGoldPacket = new THREE.Color('#fde047');
  private readonly colorTealPacket = new THREE.Color('#5eead4');
  private readonly colorFoggedPacket = new THREE.Color('#f0a500');
  private readonly colorAlertPacket = new THREE.Color('#ff3b5c');

  constructor() {
    this.root.name = 'NetworkVisuals';
    this.root.add(this.arcsGroup);

    this.glowTex = createGlowSpriteTexture();

    this.packetGeo = new THREE.SphereGeometry(0.24, 8, 8);
    this.packetMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      toneMapped: false,
    });
    this.packetsInst = new THREE.InstancedMesh(
      this.packetGeo,
      this.packetMat,
      this.maxPackets
    );
    this.packetsInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.packetsInst.count = 0;
    this.root.add(this.packetsInst);

    this.hubBeaconMat = new THREE.SpriteMaterial({
      map: this.glowTex,
      color: '#f59e0b',
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.hubBeacon = new THREE.Sprite(this.hubBeaconMat);
    this.hubBeacon.position.copy(MASTERMIND_HUB);
    this.hubBeacon.scale.set(3.2, 3.2, 1);
    this.root.add(this.hubBeacon);
  }

  private getDistrictAnchor(dId: DistrictId, indexOffset: number): THREE.Vector3 {
    const [cx, cz] = DISTRICT_CENTERS[dId];
    const angle = indexOffset * 1.15;
    const radius = 2.6 + (indexOffset % 3) * 0.9;
    return new THREE.Vector3(
      cx + Math.cos(angle) * radius,
      2.2 + (indexOffset % 3) * 0.8,
      cz + Math.sin(angle) * radius
    );
  }

  public syncState(state: GameState, showNetworkArcs: boolean): void {
    this.showOverlay = showNetworkArcs;

    // Build compact signature so we only rebuild curve geometries when topology or status changes
    const sigParts: string[] = [showNetworkArcs ? '1' : '0', state.phase];
    for (const c of state.characters) {
      sigParts.push(`${c.id}:${c.status}:${c.tier}:${c.supervisorId ?? ''}:${c.isFogged ? 1 : 0}:${c.activeOperationId ?? ''}`);
    }
    for (const o of state.operations) {
      if (o.status === 'active') {
        sigParts.push(`${o.id}:${o.status}:${o.assignedLeadId ?? ''}:${o.assignedSubId ?? ''}`);
      }
    }
    for (const d of Object.values(state.districts)) {
      sigParts.push(`${d.id}:${d.heat >= 70 ? 1 : 0}`);
    }
    const sig = sigParts.join('|');
    if (sig === this.lastSignature) return;
    this.lastSignature = sig;

    this.clearArcs();

    if (state.phase === 'title') {
      // Subtle ambient demo arcs on title screen
      const demoTargets: DistrictId[] = ['kasumigahama', 'shintoshin', 'konan', 'sakuradai'];
      demoTargets.forEach((dId, idx) => {
        const end = this.getDistrictAnchor(dId, idx);
        this.addArc(MASTERMIND_HUB, end, idx % 2 === 0 ? 'gold_direct' : 'teal_coord', 11 + idx * 1.5, idx * 0.25);
      });
      return;
    }

    const charById = new Map<string, Character>();
    state.characters.forEach((c) => charById.set(c.id, c));

    const charAnchors = new Map<string, THREE.Vector3>();
    state.characters.forEach((c, idx) => {
      charAnchors.set(c.id, this.getDistrictAnchor(c.homeDistrict, idx));
    });

    // 1. Mastermind Hub -> Direct Operatives / Coordinators & Coordinator -> Subordinates
    state.characters.forEach((c, idx) => {
      if (c.status === 'cut_off') return;
      const targetPos = charAnchors.get(c.id)!;
      const dHeat = state.districts[c.homeDistrict]?.heat ?? 0;
      const isAlert =
        c.status === 'arrested' ||
        c.status === 'betrayed' ||
        dHeat >= 72 ||
        c.stress >= 82;

      if (c.tier === 'direct' || (c.tier === 'coordinator' && !c.supervisorId)) {
        const style: ArcStyle = isAlert ? 'crimson_alert' : 'gold_direct';
        this.addArc(MASTERMIND_HUB, targetPos, style, 12.5 + (idx % 4) * 1.5, idx * 0.19);
      } else if (c.supervisorId) {
        const supAnchor = charAnchors.get(c.supervisorId) ?? MASTERMIND_HUB;
        const sup = charById.get(c.supervisorId);
        const supAlert = sup?.status === 'arrested' || sup?.status === 'betrayed';
        const style: ArcStyle =
          isAlert || supAlert
            ? 'crimson_alert'
            : c.isFogged
              ? 'fogged_sub'
              : 'teal_coord';
        this.addArc(supAnchor, targetPos, style, 10.5 + (idx % 3) * 1.6, idx * 0.31);
      }
    });

    // 2. Coordinator / Operative -> Active Operation Site
    state.operations.forEach((op, idx) => {
      if (op.status !== 'active') return;
      const leadId = op.delegatedViaId ?? op.assignedLeadId ?? op.assignedSubId;
      const startPos =
        (leadId ? charAnchors.get(leadId) : undefined) ?? MASTERMIND_HUB;
      const endPos = new THREE.Vector3(op.worldPos[0], 2.5, op.worldPos[1]);
      const dHeat = state.districts[op.districtId]?.heat ?? 0;
      const style: ArcStyle = dHeat >= 70 ? 'crimson_alert' : 'teal_coord';
      this.addArc(startPos, endPos, style, 9.5, idx * 0.42);
    });
  }

  private addArc(
    start: THREE.Vector3,
    end: THREE.Vector3,
    style: ArcStyle,
    arcHeight: number,
    packetPhase: number
  ): void {
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const dist = start.distanceTo(end);
    mid.y = Math.max(start.y, end.y) + Math.min(arcHeight, 4.5 + dist * 0.28);

    const curve = new THREE.QuadraticBezierCurve3(start.clone(), mid, end.clone());
    const points = curve.getPoints(32);
    const geo = new THREE.BufferGeometry().setFromPoints(points);

    let color = '#fbbf24';
    let baseOpacity = 0.72;
    let packetSpeed = 0.28;

    if (style === 'teal_coord') {
      color = '#2dd4bf';
      baseOpacity = 0.68;
      packetSpeed = 0.34;
    } else if (style === 'fogged_sub') {
      color = '#f0a500';
      baseOpacity = 0.56;
      packetSpeed = 0.22;
    } else if (style === 'crimson_alert') {
      color = '#ef4444';
      baseOpacity = 0.85;
      packetSpeed = 0.45;
    }

    let line: THREE.Line;
    let lineMat: THREE.LineBasicMaterial;

    if (style === 'fogged_sub') {
      lineMat = new THREE.LineDashedMaterial({
        color,
        dashSize: 0.75,
        gapSize: 0.55,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      line = new THREE.Line(geo, lineMat);
      line.computeLineDistances();
    } else {
      lineMat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: baseOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      line = new THREE.Line(geo, lineMat);
    }

    this.arcsGroup.add(line);
    this.arcs.push({
      curve,
      line,
      lineMat,
      style,
      packetSpeed,
      packetPhase,
      baseOpacity,
    });
  }

  public update(time: number): void {
    const overlayScale = this.showOverlay ? 1.0 : 0.26;
    this.hubBeaconMat.opacity = this.showOverlay
      ? 0.7 + 0.2 * Math.sin(time * 3.0)
      : 0.25;

    let packetIdx = 0;

    for (let i = 0; i < this.arcs.length; i++) {
      const arc = this.arcs[i];
      let opacity = arc.baseOpacity * overlayScale;

      if (arc.style === 'fogged_sub') {
        const flicker = 0.45 + 0.55 * Math.sin(time * 9.5 + i * 2.1);
        opacity *= flicker;
      } else if (arc.style === 'crimson_alert') {
        const flash = 0.4 + 0.6 * Math.abs(Math.sin(time * 7.5 + i));
        opacity = Math.min(1.0, opacity * (0.7 + flash * 0.55));
      }

      arc.lineMat.opacity = opacity;

      // Update gliding data packets along each arc
      if (packetIdx < this.maxPackets) {
        const t = (time * arc.packetSpeed + arc.packetPhase) % 1;
        arc.curve.getPointAt(t, this.tmpPos);
        const s = this.showOverlay ? 1.0 : 0.55;
        this.tmpScale.setScalar(s);
        this.tmpMat.compose(this.tmpPos, this.tmpQuat, this.tmpScale);
        this.packetsInst.setMatrixAt(packetIdx, this.tmpMat);

        if (arc.style === 'gold_direct') this.tmpColor.copy(this.colorGoldPacket);
        else if (arc.style === 'teal_coord') this.tmpColor.copy(this.colorTealPacket);
        else if (arc.style === 'fogged_sub') this.tmpColor.copy(this.colorFoggedPacket);
        else this.tmpColor.copy(this.colorAlertPacket);

        this.packetsInst.setColorAt(packetIdx, this.tmpColor);
        packetIdx++;
      }
    }

    this.packetsInst.count = packetIdx;
    if (packetIdx > 0) {
      this.packetsInst.instanceMatrix.needsUpdate = true;
      if (this.packetsInst.instanceColor) {
        this.packetsInst.instanceColor.needsUpdate = true;
      }
    }
  }

  private clearArcs(): void {
    for (const a of this.arcs) {
      this.arcsGroup.remove(a.line);
      a.line.geometry.dispose();
      a.lineMat.dispose();
    }
    this.arcs = [];
  }

  public dispose(): void {
    this.clearArcs();
    this.packetGeo.dispose();
    this.packetMat.dispose();
    this.hubBeaconMat.dispose();
    this.glowTex.dispose();
  }
}
