import React from 'react';
import { formatYen } from '../sim/districts';
import type { GameState } from '../types/game';
import {
  ControlScaleIcon,
  ExitDoorIcon,
  FastForwardIcon,
  HarmSkullIcon,
  NetworkNodesIcon,
  PauseIcon,
  PlayIcon,
  ResetViewIcon,
  SirenIcon,
  SkipNightIcon,
  VolumeOffIcon,
  VolumeOnIcon,
  YenIcon,
} from './Icons';

interface TopHudProps {
  state: GameState;
  showNetworkArcs: boolean;
  muted: boolean;
  onSetSpeed: (speed: 0 | 1 | 2) => void;
  onSkipToEvening: () => void;
  onToggleNetworkArcs: () => void;
  onResetCamera: () => void;
  onToggleMute: () => void;
  onTriggerQuietExit: () => void;
}

function formatClock(hourFloat: number): string {
  const totalMinutes = Math.round(hourFloat * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const TopHud: React.FC<TopHudProps> = ({
  state,
  showNetworkArcs,
  muted,
  onSetSpeed,
  onSkipToEvening,
  onToggleNetworkArcs,
  onResetCamera,
  onToggleMute,
  onTriggerQuietExit,
}) => {
  const cashPct = Math.min(100, Math.max(0, (state.cash / state.targetCash) * 100));
  const traceDanger = state.policeTrace >= 65;
  const controlLow = state.control <= 30;
  const harmHigh = state.cityHarm >= 65;
  const canEarlyExit = state.cash >= state.earlyExitCash && state.phase !== 'ended';

  return (
    <header className="top-hud interactive">
      {/* Row 1 on Mobile / Left+Right Clusters on Desktop */}
      <div className="hud-top-row">
        <div className="hud-time-cluster">
          <div className="hud-day-badge">
            <span className="hud-day-label mono-num">
              DAY {String(state.day).padStart(2, '0')} / {String(state.maxDays).padStart(2, '0')}
            </span>
            <span className="hud-clock mono-num">{formatClock(state.hour)}</span>
          </div>

          <div className="speed-group" role="group" aria-label="進行速度">
            <button
              type="button"
              className={`speed-btn${state.speed === 0 ? ' active' : ''}`}
              onClick={() => onSetSpeed(0)}
              title="一時停止 (Space)"
              aria-label="一時停止"
            >
              <PauseIcon size={13} />
            </button>
            <button
              type="button"
              className={`speed-btn${state.speed === 1 ? ' active' : ''}`}
              onClick={() => onSetSpeed(1)}
              title="通常速度 (1)"
              aria-label="通常速度"
            >
              <PlayIcon size={13} />
              <span style={{ marginLeft: 2 }}>1×</span>
            </button>
            <button
              type="button"
              className={`speed-btn${state.speed === 2 ? ' active' : ''}`}
              onClick={() => onSetSpeed(2)}
              title="倍速 (2)"
              aria-label="倍速"
            >
              <FastForwardIcon size={13} />
              <span style={{ marginLeft: 2 }}>2×</span>
            </button>
          </div>

          <button
            type="button"
            className="btn-noir hud-skip-btn"
            onClick={onSkipToEvening}
            disabled={state.phase !== 'playing'}
            title="22:00の夜間清算へ進む"
          >
            <SkipNightIcon size={14} />
            <span className="skip-label">夜へ進む</span>
          </button>
        </div>

        <div className="hud-tools-cluster">
          {canEarlyExit && (
            <button
              type="button"
              className="btn-noir btn-amber hud-exit-btn"
              onClick={onTriggerQuietExit}
              title={`手元資金 ${formatYen(state.earlyExitCash)} 以上で回線を破棄し安全に撤退する`}
            >
              <ExitDoorIcon size={14} />
              <span className="hide-mobile">雲隠れ (早期撤退)</span>
            </button>
          )}

          <button
            type="button"
            className={`btn-noir hud-icon-btn${showNetworkArcs ? ' active' : ''}`}
            onClick={onToggleNetworkArcs}
            title="3D関係網レイヤー切替"
            aria-pressed={showNetworkArcs}
          >
            <NetworkNodesIcon size={15} />
            <span className="hide-mobile">3D関係網</span>
          </button>

          <button
            type="button"
            className="btn-noir hud-icon-btn"
            onClick={onResetCamera}
            title="カメラ視点リセット"
            aria-label="視点リセット"
          >
            <ResetViewIcon size={15} />
          </button>

          <button
            type="button"
            className="btn-noir hud-icon-btn"
            onClick={onToggleMute}
            title={muted ? '音声 ON' : '音声 OFF'}
            aria-label={muted ? '音声 ON' : '音声 OFF'}
          >
            {muted ? <VolumeOffIcon size={15} /> : <VolumeOnIcon size={15} />}
          </button>
        </div>
      </div>

      {/* Row 2 on Mobile / Center Cluster on Desktop: 4 Core Meters */}
      <div className="hud-meters-cluster">
        {/* 裏資金 */}
        <div className="hud-meter" title={`目標: ${formatYen(state.targetCash)}`}>
          <div className="hud-meter-top">
            <span className="hud-meter-label">
              <YenIcon size={12} />
              <span>裏資金</span>
            </span>
            <span
              className="hud-meter-val"
              style={{ color: state.cash < 0 ? 'var(--crimson-bright)' : 'var(--amber-bright)' }}
            >
              {formatYen(state.cash)}
            </span>
          </div>
          <div className="hud-meter-bar">
            <div
              className="hud-meter-fill"
              style={{ width: `${cashPct}%`, background: 'var(--amber)' }}
            />
          </div>
        </div>

        {/* 統制力 */}
        <div className={`hud-meter${controlLow ? ' danger-pulse' : ''}`}>
          <div className="hud-meter-top">
            <span className="hud-meter-label">
              <ControlScaleIcon size={12} />
              <span>統制力</span>
            </span>
            <span
              className="hud-meter-val"
              style={{ color: controlLow ? 'var(--crimson-bright)' : 'var(--teal-bright)' }}
            >
              {Math.round(state.control)}%
            </span>
          </div>
          <div className="hud-meter-bar">
            <div
              className="hud-meter-fill"
              style={{
                width: `${Math.min(100, Math.max(0, state.control))}%`,
                background: controlLow ? 'var(--crimson)' : 'var(--teal)',
              }}
            />
          </div>
        </div>

        {/* T3捜査網 */}
        <div className={`hud-meter${traceDanger ? ' danger-pulse' : ''}`}>
          <div className="hud-meter-top">
            <span className="hud-meter-label">
              <SirenIcon size={12} />
              <span>T3捜査網</span>
            </span>
            <span
              className="hud-meter-val"
              style={{ color: traceDanger ? 'var(--crimson-bright)' : 'var(--cream)' }}
            >
              {Math.round(state.policeTrace)}%
            </span>
          </div>
          <div className="hud-meter-bar">
            <div
              className="hud-meter-fill"
              style={{
                width: `${Math.min(100, Math.max(0, state.policeTrace))}%`,
                background: traceDanger ? 'var(--crimson)' : '#e07a5f',
              }}
            />
          </div>
        </div>

        {/* 社会被害 */}
        <div className="hud-meter">
          <div className="hud-meter-top">
            <span className="hud-meter-label">
              <HarmSkullIcon size={12} />
              <span>社会被害</span>
            </span>
            <span
              className="hud-meter-val"
              style={{ color: harmHigh ? '#f4a261' : 'var(--cream)' }}
            >
              {Math.round(state.cityHarm)}%
            </span>
          </div>
          <div className="hud-meter-bar">
            <div
              className="hud-meter-fill"
              style={{
                width: `${Math.min(100, Math.max(0, state.cityHarm))}%`,
                background: harmHigh ? '#f4a261' : 'rgba(241, 237, 228, 0.55)',
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
};
