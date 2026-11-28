import React from 'react';
import { formatYen } from '../sim/districts';
import type { GameState, PhoneMessage } from '../types/game';
import {
  ArrowRightIcon,
  BriefcaseOpIcon,
  FastForwardIcon,
  SirenIcon,
  SkipNightIcon,
  WarningIcon,
} from './Icons';

export interface OutcomeToastData {
  id: number;
  kind: 'success' | 'busted' | 'alert';
  title: string;
  detail: string;
}

interface LiveActionOverlayProps {
  state: GameState;
  outcomeToast: OutcomeToastData | null;
  onOpenOps: () => void;
  onAdvanceBeat: () => void;
  onSkipToEvening: () => void;
  onOpenMessage: (msgId: string) => void;
}

export const LiveActionOverlay: React.FC<LiveActionOverlayProps> = ({
  state,
  outcomeToast,
  onOpenOps,
  onAdvanceBeat,
  onSkipToEvening,
  onOpenMessage,
}) => {
  if (state.phase !== 'playing') return null;

  const activeOps = state.operations.filter((o) => o.status === 'active');
  const availableOps = state.operations.filter((o) => o.status === 'available');
  const hasIdleOperative = state.characters.some((c) => c.status === 'idle');

  // Detect highest-priority live incoming signal (unresolved dilemma OR contradicted un-audited report)
  const urgentDilemma: PhoneMessage | undefined = state.messages.find(
    (m) => Boolean(m.choices && m.choices.length > 0 && !m.resolved)
  );
  const suspiciousReport: PhoneMessage | undefined = !urgentDilemma
    ? state.messages.find(
        (m) =>
          !m.audited &&
          state.news.some((n) => n.contradictsMessageId === m.id)
      )
    : undefined;

  const liveSignal = urgentDilemma ?? suspiciousReport;
  const isDilemmaSignal = Boolean(urgentDilemma);

  // Determine single smartest Context Primary Action so player never wonders "what next?"
  let primaryLabel: string;
  let primarySub: string;
  let primaryTone: 'amber' | 'teal' | 'night';
  let primaryIcon: React.ReactNode;
  let primaryAction: () => void;

  if (activeOps.length > 0) {
    const minLeftHrs = Math.min(
      ...activeOps.map((o) => Math.max(0.5, (1 - o.progress) * o.durationHours))
    );
    primaryLabel = '次の結果まで進める';
    primarySub = `実行中 ${activeOps.length}件 · 完了まで約${minLeftHrs.toFixed(1)}h`;
    primaryTone = 'teal';
    primaryIcon = <FastForwardIcon size={15} />;
    primaryAction = onAdvanceBeat;
  } else if (availableOps.length > 0 && hasIdleOperative) {
    const topYield = Math.max(...availableOps.map((o) => o.estimatedYield));
    primaryLabel = `案件を選ぶ（${availableOps.length}件）`;
    primarySub = `最大見込 ${formatYen(topYield)}`;
    primaryTone = 'amber';
    primaryIcon = <BriefcaseOpIcon size={15} />;
    primaryAction = onOpenOps;
  } else {
    primaryLabel = '夜間清算へ進む';
    primarySub = `DAY ${String(state.day).padStart(2, '0')} の収支と報道を確認`;
    primaryTone = 'night';
    primaryIcon = <SkipNightIcon size={15} />;
    primaryAction = onSkipToEvening;
  }

  return (
    <div className="live-action-stack">
      {/* 1. Ephemeral Outcome Burst Toast */}
      {outcomeToast && (
        <div
          key={outcomeToast.id}
          className={`outcome-burst-toast kind-${outcomeToast.kind}`}
          role="status"
          aria-live="polite"
        >
          <span className="outcome-burst-icon" aria-hidden="true">
            {outcomeToast.kind === 'success' ? (
              <ArrowRightIcon size={14} />
            ) : outcomeToast.kind === 'busted' ? (
              <SirenIcon size={14} />
            ) : (
              <WarningIcon size={14} />
            )}
          </span>
          <div className="outcome-burst-copy">
            <strong>{outcomeToast.title}</strong>
            <span>{outcomeToast.detail}</span>
          </div>
        </div>
      )}

      {/* 2. Live Incoming Urgent Call / Discrepancy Signal Banner */}
      {liveSignal && (
        <button
          type="button"
          className={`live-call-banner interactive ${
            isDilemmaSignal ? 'tone-crimson' : 'tone-amber'
          }`}
          onClick={() => onOpenMessage(liveSignal.id)}
          data-testid="live-call-banner"
        >
          {liveSignal.senderPortrait && (
            <img
              src={liveSignal.senderPortrait}
              alt={liveSignal.senderName}
              className="live-call-avatar"
            />
          )}
          <div className="live-call-body">
            <div className="live-call-kicker mono-num">
              <span className="live-call-dot" aria-hidden="true" />
              <span>
                {isDilemmaSignal
                  ? `緊急着信 // ${liveSignal.senderName}`
                  : `不整合シグナル // ${liveSignal.senderName}`}
              </span>
            </div>
            <div className="live-call-subject">{liveSignal.subject}</div>
          </div>
          <span className="live-call-cta mono-num">
            {isDilemmaSignal ? '応答' : '裏取り'}
            <ArrowRightIcon size={12} />
          </span>
        </button>
      )}

      {/* 3. Single Context Primary Action Bar (Zero-Wait Loop) */}
      <button
        type="button"
        className={`context-primary-cta interactive tone-${primaryTone}`}
        onClick={primaryAction}
        data-testid="context-primary-cta"
      >
        <span className="context-cta-icon">{primaryIcon}</span>
        <span className="context-cta-text">
          <strong>{primaryLabel}</strong>
          <span className="mono-num">{primarySub}</span>
        </span>
        <ArrowRightIcon size={15} />
      </button>
    </div>
  );
};
