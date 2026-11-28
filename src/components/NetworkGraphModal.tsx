import React, { useMemo, useState } from 'react';
import { formatYen } from '../sim/districts';
import type { Character } from '../types/game';
import { CloseIcon, NetworkNodesIcon } from './Icons';

interface NetworkGraphModalProps {
  characters: Character[];
  onClose?: () => void;
  embedded?: boolean;
}

interface PositionedNode {
  id: string;
  x: number;
  y: number;
  label: string;
  subLabel: string;
  color: string;
  char?: Character;
}

export const NetworkGraphModal: React.FC<NetworkGraphModalProps> = ({
  characters,
  onClose,
  embedded = false,
}) => {
  const [selectedId, setSelectedId] = useState<string>(characters[0]?.id ?? 'you');

  const { nodes, commandEdges, bondEdges } = useMemo(() => {
    const posNodes: PositionedNode[] = [];
    const coordAndDirect = characters.filter(
      (c) => c.tier === 'coordinator' || c.tier === 'direct'
    );
    const subordinates = characters.filter((c) => c.tier === 'subordinate');
    const externals = characters.filter((c) => c.tier === 'external');

    // Center Top Mastermind Node
    posNodes.push({
      id: 'you',
      x: 320,
      y: 44,
      label: '白紙',
      subLabel: '匿名中核',
      color: '#f0a500',
    });

    // Ring 1: Direct & Coordinators
    const ring1Width = 420;
    const ring1Start = 320 - ring1Width / 2;
    coordAndDirect.forEach((c, idx) => {
      const ratio =
        coordAndDirect.length === 1 ? 0.5 : idx / (coordAndDirect.length - 1);
      const x = ring1Start + ratio * ring1Width;
      const y = c.tier === 'coordinator' ? 156 : 178;
      const inactive = c.status !== 'idle' && c.status !== 'on_mission';
      posNodes.push({
        id: c.id,
        x,
        y,
        label: c.codename,
        subLabel: c.tier === 'coordinator' ? '指示役' : '直轄',
        color: inactive
          ? '#6b7280'
          : c.tier === 'coordinator'
          ? '#2ec4b6'
          : '#f0a500',
        char: c,
      });
    });

    // Ring 2: Subordinates
    const subWidth = 460;
    const subStart = 320 - subWidth / 2;
    subordinates.forEach((c, idx) => {
      const ratio =
        subordinates.length === 1 ? 0.5 : idx / (subordinates.length - 1);
      const x = subStart + ratio * subWidth;
      const y = 294 + (idx % 2 === 0 ? -8 : 12);
      const inactive = c.status !== 'idle' && c.status !== 'on_mission';
      posNodes.push({
        id: c.id,
        x,
        y,
        label: c.codename,
        subLabel: c.isFogged ? '未確認(霧)' : '実行役',
        color: inactive ? '#6b7280' : c.isFogged ? '#f0a500' : '#f1ede4',
        char: c,
      });
    });

    // External Broker Node(s) at upper right
    externals.forEach((c, idx) => {
      const inactive = c.status !== 'idle' && c.status !== 'on_mission';
      posNodes.push({
        id: c.id,
        x: 556,
        y: 82 + idx * 78,
        label: c.codename,
        subLabel: '外部ブローカー',
        color: inactive ? '#6b7280' : '#f4a261',
        char: c,
      });
    });

    const nodeMap = new Map<string, PositionedNode>(posNodes.map((n) => [n.id, n]));

    // Command Hierarchy Lines
    const cmdEdges: {
      from: PositionedNode;
      to: PositionedNode;
      kind: 'direct' | 'delegated' | 'fogged' | 'external';
    }[] = [];

    for (const c of characters) {
      const to = nodeMap.get(c.id);
      if (!to) continue;
      if (c.tier === 'direct' || (c.tier === 'coordinator' && !c.supervisorId)) {
        const from = nodeMap.get('you');
        if (from) cmdEdges.push({ from, to, kind: 'direct' });
      } else if (c.tier === 'external') {
        const from = nodeMap.get('you');
        if (from) cmdEdges.push({ from, to, kind: 'external' });
      } else if (c.supervisorId) {
        const from = nodeMap.get(c.supervisorId);
        if (from) {
          cmdEdges.push({
            from,
            to,
            kind: c.isFogged ? 'fogged' : 'delegated',
          });
        }
      } else {
        const from = nodeMap.get('you');
        if (from) cmdEdges.push({ from, to, kind: 'direct' });
      }
    }

    // Interpersonal Bond Edges (deduplicated pairs)
    const seenPairs = new Set<string>();
    const bonds: {
      a: PositionedNode;
      b: PositionedNode;
      val: number;
    }[] = [];

    for (const c of characters) {
      const nodeA = nodeMap.get(c.id);
      if (!nodeA) continue;
      for (const [otherId, score] of Object.entries(c.relationships)) {
        if (Math.abs(score) < 15) continue;
        const pairKey = [c.id, otherId].sort().join('::');
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const nodeB = nodeMap.get(otherId);
        if (nodeB) {
          bonds.push({ a: nodeA, b: nodeB, val: score });
        }
      }
    }

    return { nodes: posNodes, commandEdges: cmdEdges, bondEdges: bonds };
  }, [characters]);

  const selectedNode = nodes.find((n) => n.id === selectedId) ?? nodes[0];
  const selectedChar = selectedNode?.char;

  // Precompute non-overlapping perpendicular curved bond paths and label anchors
  const renderedBonds = useMemo(() => {
    const placedLabels: { x: number; y: number }[] = [];

    const scoreCandidate = (cx: number, cy: number) => {
      let penalty = 0;
      if (cx < 26 || cx > 614 || cy < 16 || cy > 344) penalty += 10000;
      for (const n of nodes) {
        // Full node footprint: circle top (y-24) to role subtitle bottom (y+56), width ~92
        const left = n.x - 48;
        const right = n.x + 48;
        const top = n.y - 26;
        const bottom = n.y + 58;
        const dx = cx < left ? left - cx : cx > right ? cx - right : 0;
        const dy = cy < top ? top - cy : cy > bottom ? cy - bottom : 0;
        const d = Math.hypot(dx, dy);
        if (d < 14) {
          penalty += (14 - d) * 120 + (dx === 0 && dy === 0 ? 1500 : 0);
        }
      }
      for (const prev of placedLabels) {
        const dx = Math.max(0, Math.abs(cx - prev.x) - 36);
        const dy = Math.max(0, Math.abs(cy - prev.y) - 20);
        const d = Math.hypot(dx, dy);
        if (d < 8) {
          penalty += (8 - d) * 80 + (dx === 0 && dy === 0 ? 900 : 0);
        }
      }
      return penalty;
    };

    const evalBezier = (
      ax: number,
      ay: number,
      cx: number,
      cy: number,
      bx: number,
      by: number,
      t: number
    ) => {
      const mt = 1 - t;
      return {
        x: mt * mt * ax + 2 * mt * t * cx + t * t * bx,
        y: mt * mt * ay + 2 * mt * t * cy + t * t * by,
      };
    };

    return bondEdges.map(({ a, b, val }, idx) => {
      const isRival = val < 0;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len;
      let ny = dx / len;
      if (isRival && ny > 0) {
        nx = -nx;
        ny = -ny;
      } else if (!isRival && ny < 0) {
        nx = -nx;
        ny = -ny;
      }

      const curveOffset = (isRival ? 44 : 36) + (idx % 2) * 12;
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const cx = midX + nx * curveOffset;
      const cy = midY + ny * curveOffset;

      const tValues = [0.5, 0.36, 0.64, 0.25, 0.75];
      const nOffsets = [10, -10, 18, -18, 26];
      const candidates: [number, number][] = [];
      for (const t of tValues) {
        const pt = evalBezier(a.x, a.y, cx, cy, b.x, b.y, t);
        for (const off of nOffsets) {
          candidates.push([pt.x + nx * off, pt.y + ny * off]);
        }
      }

      let bestX = candidates[0][0];
      let bestY = candidates[0][1];
      let bestPenalty = Infinity;
      for (const [candX, candY] of candidates) {
        const p = scoreCandidate(candX, candY);
        if (p < bestPenalty) {
          bestPenalty = p;
          bestX = candX;
          bestY = candY;
        }
      }

      const lx = Math.max(24, Math.min(616, bestX));
      const ly = Math.max(16, Math.min(342, bestY));
      placedLabels.push({ x: lx, y: ly });

      return {
        key: `bond_${a.id}_${b.id}`,
        d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`,
        lx,
        ly,
        val,
        isRival,
      };
    });
  }, [bondEdges, nodes]);

  const graphContent = (
        <div className={`network-modal-grid${embedded ? ' embedded' : ''}`}>
          {/* Interactive SVG Graph */}
          <div className="network-svg-wrap">
            <svg
              viewBox="0 0 640 390"
              style={{ width: '100%', height: '100%', maxHeight: 440 }}
              role="img"
              aria-label="組織図グラフ"
            >
              {/* Subtle Blueprint Grid */}
              <defs>
                <pattern
                  id="netGrid"
                  width="32"
                  height="32"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 32 0 L 0 0 0 32"
                    fill="none"
                    stroke="rgba(241,237,228,0.04)"
                    strokeWidth="1"
                  />
                </pattern>
              </defs>
              <rect width="640" height="390" fill="url(#netGrid)" />

              {/* Command Edges */}
              {commandEdges.map(({ from, to, kind }) => {
                const stroke =
                  kind === 'direct'
                    ? '#f0a500'
                    : kind === 'delegated'
                    ? '#2ec4b6'
                    : kind === 'external'
                    ? '#f4a261'
                    : '#f0a500';
                return (
                  <line
                    key={`cmd_${from.id}_${to.id}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={stroke}
                    strokeWidth={kind === 'direct' ? 2.1 : 1.7}
                    strokeDasharray={kind === 'fogged' ? '5 4' : undefined}
                    opacity={kind === 'fogged' ? 0.78 : 0.88}
                  />
                );
              })}

              {/* Bond Edges (Allies vs Rivals) */}
              {renderedBonds.map(({ key, d, lx, ly, val, isRival }) => {
                const labelText = val > 0 ? `+${val}` : `${val}`;
                return (
                  <g key={key}>
                    <path
                      d={d}
                      fill="none"
                      stroke={isRival ? '#e63946' : '#2ec4b6'}
                      strokeWidth={1.6}
                      strokeDasharray={isRival ? '3 3' : '6 3'}
                      opacity={0.72}
                    />
                    <rect
                      x={lx - 15}
                      y={ly - 8}
                      width={30}
                      height={15}
                      rx={3}
                      fill="rgba(7, 10, 15, 0.96)"
                      stroke={isRival ? 'rgba(230, 57, 70, 0.6)' : 'rgba(46, 196, 182, 0.6)'}
                      strokeWidth={0.85}
                    />
                    <text
                      x={lx}
                      y={ly + 3}
                      textAnchor="middle"
                      fontSize="9.5"
                      fontWeight="700"
                      fontFamily="JetBrains Mono, monospace"
                      fill={isRival ? '#ff7b85' : '#4ce3d5'}
                    >
                      {labelText}
                    </text>
                  </g>
                );
              })}

              {/* Nodes */}
              {nodes.map((node) => {
                const isSelected = node.id === selectedNode?.id;
                const r = 21;
                const badgeWidth = Math.max(46, node.label.length * 11 + 16);
                const subWidth = Math.max(38, node.subLabel.length * 9.5 + 10);
                const glyph = node.id === 'you' ? '匿' : node.label.slice(0, 1);
                return (
                  <g
                    key={node.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedId(node.id)}
                  >
                    {isSelected && (
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={r + 5}
                        fill="none"
                        stroke="#f1ede4"
                        strokeWidth={1.5}
                        strokeDasharray="3 2"
                      />
                    )}
                    <circle
                      cx={node.x}
                      cy={node.y}
                      r={r}
                      fill="#0b0f14"
                      stroke={node.color}
                      strokeWidth={2.2}
                    />
                    <text
                      x={node.x}
                      y={node.y + 5}
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="800"
                      fill={node.color}
                      fontFamily="Shippori Mincho, Noto Sans JP, sans-serif"
                    >
                      {glyph}
                    </text>
                    {/* Full Codename Pill Badge directly below node circle */}
                    <rect
                      x={node.x - badgeWidth / 2}
                      y={node.y + 22}
                      width={badgeWidth}
                      height={16}
                      rx={3}
                      fill="rgba(7, 10, 15, 0.96)"
                      stroke={node.color}
                      strokeWidth={1}
                    />
                    <text
                      x={node.x}
                      y={node.y + 33}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="700"
                      fill="#f1ede4"
                      fontFamily="Noto Sans JP, sans-serif"
                    >
                      {node.label}
                    </text>
                    {/* Role Subtitle cleanly below codename pill with dark backdrop */}
                    <rect
                      x={node.x - subWidth / 2}
                      y={node.y + 40}
                      width={subWidth}
                      height={12}
                      rx={2}
                      fill="rgba(7, 10, 15, 0.88)"
                    />
                    <text
                      x={node.x}
                      y={node.y + 49}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="600"
                      fill={node.color}
                      fontFamily="JetBrains Mono, Noto Sans JP, monospace"
                    >
                      {node.subLabel}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Compact Legend */}
            <div
              className="mono-num"
              style={{
                position: 'absolute',
                left: 8,
                bottom: 8,
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                fontSize: 9.5,
                background: 'rgba(7, 10, 15, 0.92)',
                padding: '4px 9px',
                border: '1px solid var(--cream-hairline)',
              }}
            >
              <span style={{ color: '#f0a500' }}>━ 直轄</span>
              <span style={{ color: '#2ec4b6' }}>━ 委任</span>
              <span
                style={{
                  color: '#f0a500',
                  borderBottom: '1.5px dashed #f0a500',
                  paddingBottom: 1,
                }}
              >
                ┈ 霧(未監査)
              </span>
              <span style={{ color: '#4ce3d5' }}>┈ 友好(+)</span>
              <span style={{ color: '#ff7b85' }}>┈ 対立(-)</span>
            </div>
          </div>

          {/* Selected Node Detail Card */}
          <div
            style={{
              background: 'rgba(7, 10, 15, 0.78)',
              border: '1px solid var(--cream-hairline)',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              overflowY: 'auto',
            }}
          >
            {selectedChar ? (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <img
                    src={selectedChar.portraitUrl}
                    alt={selectedChar.codename}
                    className="portrait-thumb portrait-lg"
                  />
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 15 }}>{selectedChar.codename}</strong>
                    <div className="mono-num" style={{ fontSize: 10.5, color: 'var(--cream-faint)' }}>
                      {selectedChar.handle}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--teal)' }}>
                      {selectedChar.roleLabel}
                    </div>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.5, color: 'var(--cream-muted)' }}>
                  {selectedChar.bio}
                </p>

                <div
                  className="mono-num"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 6,
                    fontSize: 11,
                    background: 'rgba(18, 24, 32, 0.85)',
                    padding: 8,
                    border: '1px solid var(--cream-hairline)',
                  }}
                >
                  <div>
                    能力:{' '}
                    {selectedChar.isFogged
                      ? `~${selectedChar.reportedSkill} (霧)`
                      : selectedChar.skill}
                  </div>
                  <div>
                    忠誠:{' '}
                    {selectedChar.isFogged
                      ? `~${selectedChar.reportedLoyalty}%`
                      : `${selectedChar.loyalty}%`}
                  </div>
                  <div>
                    負荷: {selectedChar.isFogged ? '???' : `${selectedChar.stress}%`}
                  </div>
                  <div>日給: {formatYen(selectedChar.dailyUpkeep)}</div>
                </div>

                <div>
                  <div className="section-label">関係性リスト</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {Object.entries(selectedChar.relationships).map(([otherId, score]) => {
                      const other = characters.find((c) => c.id === otherId);
                      if (!other) return null;
                      return (
                        <div
                          key={otherId}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11.5,
                            padding: '4px 7px',
                            background: 'rgba(18, 24, 32, 0.72)',
                            border: '1px solid rgba(241, 237, 228, 0.08)',
                          }}
                        >
                          <span>{other.codename}</span>
                          <span
                            className="mono-num"
                            style={{
                              color:
                                score > 0
                                  ? 'var(--teal-bright)'
                                  : score < 0
                                  ? 'var(--crimson-bright)'
                                  : 'var(--cream-muted)',
                            }}
                          >
                            {score > 0 ? `+${score}` : score}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div>
                <strong style={{ fontSize: 15, color: 'var(--amber-bright)' }}>
                  白紙 / YOU（匿名中核）
                </strong>
                <p style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--cream-muted)' }}>
                  海湾市全域に広がる匿名流動型ネットワークの設計者。直轄枠を超えた委任網を広げると捜査線を遮断できる一方、仲介統括による中抜きや情報の霧が生まれる。
                </p>
              </div>
            )}
          </div>
        </div>
  );

  if (embedded) {
    return graphContent;
  }

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="組織関係網ビュー"
    >
      <div className="noir-panel-sharp modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-group">
            <NetworkNodesIcon size={18} />
            <div>
              <h2 className="drawer-title">組織・人間関係網ビュー</h2>
              <div className="drawer-subtitle">
                COMMAND HIERARCHY &amp; INTERPERSONAL BONDS
              </div>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              className="drawer-close-btn"
              onClick={onClose}
              aria-label="閉じる"
            >
              <CloseIcon size={16} />
            </button>
          )}
        </div>
        {graphContent}
      </div>
    </div>
  );
};
