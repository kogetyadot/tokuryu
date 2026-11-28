import React, { useEffect, useRef, useState } from 'react';
import { formatYen } from '../sim/districts';
import type { GameState } from '../types/game';
import { useGlossary } from './GlossaryTerm';
import {
  ControlScaleIcon,
  ExitDoorIcon,
  FastForwardIcon,
  HarmSkullIcon,
  HelpIcon,
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
  highlightSkipToEvening?: boolean;
  autoPaused?: boolean;
  cashPulseKey?: number;
  tracePulseKey?: number;
  onSetSpeed: (speed: 0 | 1 | 2) => void;
  onSkipToEvening: () => void;
  onToggleNetworkArcs: () => void;
  onResetCamera: () => void;
  onOpenHowToPlay: () => void;
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
  highlightSkipToEvening = false,
  autoPaused = false,
  cashPulseKey = 0,
  tracePulseKey = 0,
  onSetSpeed,
  onSkipToEvening,
  onToggleNetworkArcs,
  onResetCamera,
  onOpenHowToPlay,
  onToggleMute,
  onTriggerQuietExit,
}) => {
  const { openTerm } = useGlossary();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

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
              D{String(state.day).padStart(2, '0')}
              <span className="hide-mobile"> / {String(state.maxDays).padStart(2, '0')}</span>
            </span>
            <span className="hud-clock mono-num">{formatClock(state.hour)}</span>
          </div>

          <div className="speed-group" role="group" aria-label="進行速度">
            <button
              type="button"
              className={`speed-btn${state.speed === 0 ? ' active' : ''}`}
              onClick={() => onSetSpeed(0)}
              title={autoPaused ? 'パネル展開中は自動一時停止中' : '一時停止 (Space)'}
              aria-label="一時停止"
            >
              <PauseIcon size={12} />
            </button>
            <button
              type="button"
              className={`speed-btn${state.speed === 1 ? ' active' : ''}`}
              onClick={() => onSetSpeed(1)}
              title="通常速度 (1)"
              aria-label="通常速度"
            >
              <PlayIcon size={12} />
              <span style={{ marginLeft: 2 }}>1×</span>
            </button>
            <button
              type="button"
              className={`speed-btn${state.speed === 2 ? ' active' : ''}`}
              onClick={() => onSetSpeed(2)}
              title="倍速 (2)"
              aria-label="倍速"
            >
              <FastForwardIcon size={12} />
              <span style={{ marginLeft: 2 }}>2×</span>
            </button>
          </div>

          <button
            type="button"
            className={`btn-noir hud-skip-btn${highlightSkipToEvening ? ' tutorial-pulse' : ''}`}
            onClick={onSkipToEvening}
            disabled={state.phase !== 'playing'}
            title="22:00の夜間清算へ進む"
          >
            <SkipNightIcon size={13} />
            <span className="skip-label">夜へ進む</span>
          </button>

          {autoPaused && (
            <span className="hud-autopause-chip mono-num" title="パネル展開中のため自動一時停止しています">
              AUTO PAUSE
            </span>
          )}
        </div>

        {/* Desktop Direct Tools */}
        <div className="hud-tools-cluster hide-mobile">
          {canEarlyExit && (
            <button
              type="button"
              className="btn-noir btn-amber hud-exit-btn"
              onClick={onTriggerQuietExit}
              title={`手元資金 ${formatYen(state.earlyExitCash)} 以上で回線を破棄し安全に撤退する`}
            >
              <ExitDoorIcon size={14} />
              <span>雲隠れ (早期撤退)</span>
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
            <span>3D関係網</span>
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
            onClick={onOpenHowToPlay}
            title="遊び方ガイド"
            aria-label="遊び方ガイド"
          >
            <HelpIcon size={15} />
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

        {/* Mobile Compact Overflow Menu */}
        <div className="hud-mobile-tools show-mobile-only" ref={menuRef}>
          {canEarlyExit && (
            <button
              type="button"
              className="btn-noir btn-amber hud-mobile-exit"
              onClick={onTriggerQuietExit}
              title="雲隠れ（早期撤退）"
              aria-label="雲隠れ（早期撤退）"
            >
              <ExitDoorIcon size={13} />
            </button>
          )}
          <button
            type="button"
            className={`btn-noir hud-mobile-menu-btn${menuOpen ? ' active' : ''}`}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="メニューを開く"
            aria-expanded={menuOpen}
          >
            <span className="mono-num">MENU</span>
          </button>

          {menuOpen && (
            <div className="hud-overflow-popover noir-panel-sharp" role="menu">
              <button
                type="button"
                className="hud-overflow-item"
                onClick={() => {
                  openTerm('city_harm');
                  setMenuOpen(false);
                }}
              >
                <HarmSkullIcon size={14} />
                <span>
                  街の社会被害:{' '}
                  <strong
                    className="mono-num"
                    style={{ color: harmHigh ? '#f4a261' : 'var(--cream)' }}
                  >
                    {Math.round(state.cityHarm)}%
                  </strong>
                </span>
              </button>
              <button
                type="button"
                className="hud-overflow-item"
                onClick={() => {
                  onOpenHowToPlay();
                  setMenuOpen(false);
                }}
              >
                <HelpIcon size={14} />
                <span>遊び方・仕組み補足</span>
              </button>
              <button
                type="button"
                className="hud-overflow-item"
                onClick={() => {
                  onToggleMute();
                  setMenuOpen(false);
                }}
              >
                {muted ? <VolumeOffIcon size={14} /> : <VolumeOnIcon size={14} />}
                <span>{muted ? 'サウンド: OFF → ON' : 'サウンド: ON → OFF'}</span>
              </button>
              <button
                type="button"
                className="hud-overflow-item"
                onClick={() => {
                  onToggleNetworkArcs();
                  setMenuOpen(false);
                }}
              >
                <NetworkNodesIcon size={14} />
                <span>3D関係網ライン: {showNetworkArcs ? '表示中' : '非表示'}</span>
              </button>
              <button
                type="button"
                className="hud-overflow-item"
                onClick={() => {
                  onResetCamera();
                  setMenuOpen(false);
                }}
              >
                <ResetViewIcon size={14} />
                <span>カメラ視点をリセット</span>
              </button>
              {canEarlyExit && (
                <button
                  type="button"
                  className="hud-overflow-item accent-amber"
                  onClick={() => {
                    onTriggerQuietExit();
                    setMenuOpen(false);
                  }}
                >
                  <ExitDoorIcon size={14} />
                  <span>雲隠れ（早期撤退）</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Focused 3-Pillar Core Meters (Earn / Evade / Control) */}
      <div className="hud-meters-cluster hud-meters-3">
        {/* 1. 裏資金 (Win) */}
        <button
          key={`cash-${cashPulseKey}`}
          type="button"
          className={`hud-meter hud-meter-btn${cashPulseKey > 0 ? ' meter-punch-amber' : ''}`}
          onClick={() => openTerm('cash')}
          title={`裏資金の解説を見る（目標: ${formatYen(state.targetCash)}）`}
        >
          <div className="hud-meter-top">
            <span className="hud-meter-label">
              <YenIcon size={11} />
              <span>裏資金</span>
              <span className="hud-meter-q hide-mobile" aria-hidden="true">?</span>
            </span>
            <span
              className="hud-meter-val"
              style={{ color: state.cash < 0 ? 'var(--crimson-bright)' : 'var(--amber-bright)' }}
            >
              {formatYen(state.cash)}
              <span className="hud-meter-goal hide-mobile"> / 2,500万</span>
            </span>
          </div>
          <div className="hud-meter-bar">
            <div
              className="hud-meter-fill"
              style={{ width: `${cashPct}%`, background: 'var(--amber)' }}
            />
          </div>
        </button>

        {/* 2. T3捜査網 (Threat) */}
        <button
          key={`trace-${tracePulseKey}`}
          type="button"
          className={`hud-meter hud-meter-btn${traceDanger ? ' danger-pulse' : ''}${
            tracePulseKey > 0 ? ' meter-punch-crimson' : ''
          }`}
          onClick={() => openTerm('t3_trace')}
          title="T3捜査網の解説を見る"
        >
          <div className="hud-meter-top">
            <span className="hud-meter-label">
              <SirenIcon size={11} />
              <span className="hide-mobile">T3捜査網</span>
              <span className="show-mobile-only">捜査網</span>
              <span className="hud-meter-q hide-mobile" aria-hidden="true">?</span>
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
        </button>

        {/* 3. 統制力 (Stability) */}
        <button
          type="button"
          className={`hud-meter hud-meter-btn${controlLow ? ' danger-pulse' : ''}`}
          onClick={() => openTerm('control')}
          title="統制力の解説を見る"
        >
          <div className="hud-meter-top">
            <span className="hud-meter-label">
              <ControlScaleIcon size={11} />
              <span>統制力</span>
              <span className="hud-meter-q hide-mobile" aria-hidden="true">?</span>
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
        </button>
      </div>
    </header>
  );
};
