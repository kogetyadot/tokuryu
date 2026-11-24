import React from 'react';
import { formatYen } from '../sim/districts';
import type { EndingReport, GameStats } from '../types/game';
import { ArrowRightIcon } from './Icons';

interface ResultDossierProps {
  ending: EndingReport;
  cash: number;
  stats: GameStats;
  onRestart: () => void;
}

export const ResultDossier: React.FC<ResultDossierProps> = ({
  ending,
  cash,
  stats,
  onRestart,
}) => {
  const isSuccess =
    ending.id === 'vanished_ghost' || ending.id === 'quiet_exit';

  const endingVideoSrc =
    ending.id === 'vanished_ghost' || ending.id === 'quiet_exit'
      ? './assets/video/ending_escape.mp4'
      : ending.id === 't3_takedown'
      ? './assets/video/ending_arrest.mp4'
      : './assets/video/ending_collapse.mp4';

  const endingFootageLabel =
    ending.id === 'vanished_ghost' || ending.id === 'quiet_exit'
      ? 'EPILOGUE // DEPARTURE ARCHIVE'
      : ending.id === 't3_takedown'
      ? 'EVIDENCE // T3 RAID FOOTAGE'
      : 'ARCHIVE // NETWORK COLLAPSE';

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="事件調書・最終結果"
    >
      <div className="dossier-sheet">
        <div className="dossier-masthead">
          <div>
            <div
              className="mono-num"
              style={{
                fontSize: 10.5,
                letterSpacing: '0.16em',
                color: 'var(--amber)',
              }}
            >
              海湾日報 特別号外 // KAIWAN CASE DOSSIER
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 18,
                marginTop: 2,
              }}
            >
              {ending.subtitle}
            </div>
          </div>

          <div className="mono-num" style={{ textAlign: 'right', fontSize: 12 }}>
            <div style={{ color: 'rgba(241, 237, 228, 0.7)' }}>ASSESSMENT SCORE</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--amber-bright)' }}>
              {ending.score.toLocaleString('en-US')} PTS
            </div>
          </div>
        </div>

        <div className="dossier-body">
          {/* Cinematic Ending Epilogue Footage Reel */}
          <div className="dossier-video-stage" data-testid="ending-epilogue-video">
            <video
              key={endingVideoSrc}
              className="dossier-video-el"
              src={endingVideoSrc}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              aria-hidden="true"
            />
            <div className="dossier-video-scrim" aria-hidden="true" />
            <div className="dossier-video-bar mono-num">
              <span className="dossier-rec-pill">
                <span className="news-tv-live-dot" aria-hidden="true" />
                <span>{endingFootageLabel}</span>
              </span>
              <span>CASE // {ending.id.toUpperCase()}</span>
            </div>
          </div>

          {/* Newspaper Front Headline + Rank Stamp */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 16,
              borderBottom: '2px solid rgba(17, 20, 25, 0.22)',
              paddingBottom: 14,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  background: isSuccess ? '#111419' : 'var(--crimson)',
                  color: '#f1ede4',
                  fontSize: 11,
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                {ending.title}
              </div>
              <h2
                style={{
                  margin: '0 0 8px',
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(1.25rem, 2.5vw, 1.7rem)',
                  lineHeight: 1.3,
                  color: '#111419',
                }}
              >
                {ending.newspaperHeadline}
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.65,
                  color: '#2b3038',
                }}
              >
                {ending.description}
              </p>
            </div>

            <div className="rank-stamp-box" aria-label={`最終評価ランク ${ending.rank}`}>
              <span className="mono-num" style={{ fontSize: 10, letterSpacing: '0.1em' }}>
                RANK
              </span>
              <span style={{ fontSize: 34, lineHeight: 1 }}>{ending.rank}</span>
            </div>
          </div>

          {/* Campaign Key Metrics */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))',
              gap: 8,
            }}
          >
            <div
              style={{
                background: 'var(--dossier-paper-alt)',
                border: '1px solid rgba(17, 20, 25, 0.2)',
                padding: '9px 11px',
              }}
            >
              <div style={{ fontSize: 10.5, color: 'var(--dossier-ink-muted)' }}>
                総収益 / 最終手元資金
              </div>
              <div className="mono-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                {formatYen(stats.totalEarned)} / {formatYen(cash)}
              </div>
            </div>

            <div
              style={{
                background: 'var(--dossier-paper-alt)',
                border: '1px solid rgba(17, 20, 25, 0.2)',
                padding: '9px 11px',
              }}
            >
              <div style={{ fontSize: 10.5, color: 'var(--dossier-ink-muted)' }}>
                暴いた虚偽報告
              </div>
              <div className="mono-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                {stats.liesExposed}件 (回収 {formatYen(stats.totalSkimmedCaught)})
              </div>
            </div>

            <div
              style={{
                background: 'var(--dossier-paper-alt)',
                border: '1px solid rgba(17, 20, 25, 0.2)',
                padding: '9px 11px',
              }}
            >
              <div style={{ fontSize: 10.5, color: 'var(--dossier-ink-muted)' }}>
                喪失した人員
              </div>
              <div className="mono-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                {stats.tempsLost}名
              </div>
            </div>

            <div
              style={{
                background: 'var(--dossier-paper-alt)',
                border: '1px solid rgba(17, 20, 25, 0.2)',
                padding: '9px 11px',
              }}
            >
              <div style={{ fontSize: 10.5, color: 'var(--dossier-ink-muted)' }}>
                完了案件 / 摘発
              </div>
              <div className="mono-num" style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                {stats.opsCompleted}件 / {stats.opsBusted}件
              </div>
            </div>
          </div>

          {/* Character Fates */}
          <div>
            <h3
              style={{
                margin: '0 0 8px',
                fontFamily: 'var(--font-display)',
                fontSize: 15,
                borderLeft: '3px solid #111419',
                paddingLeft: 8,
              }}
            >
              登場人物のその後
            </h3>
            <div className="fate-grid">
              {ending.characterFates.map((cf) => (
                <div key={cf.charId} className="fate-card">
                  <img
                    src={cf.portraitUrl}
                    alt={cf.codename}
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: 'cover',
                      border: '1px solid #111419',
                      flexShrink: 0,
                      filter: 'grayscale(18%) contrast(1.06)',
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13 }}>{cf.codename}</strong>
                      <span style={{ fontSize: 10.5, color: 'var(--dossier-ink-muted)' }}>
                        {cf.roleLabel}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.48, marginTop: 3, color: '#2b3038' }}>
                      {cf.fate}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline Highlights */}
          {ending.timelineHighlights.length > 0 && (
            <div>
              <h3
                style={{
                  margin: '0 0 8px',
                  fontFamily: 'var(--font-display)',
                  fontSize: 15,
                  borderLeft: '3px solid var(--crimson)',
                  paddingLeft: 8,
                }}
              >
                捜査・運営記録ハイライト
              </h3>
              <div
                style={{
                  background: 'var(--dossier-paper-alt)',
                  border: '1px solid rgba(17, 20, 25, 0.2)',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  fontSize: 11.5,
                  lineHeight: 1.45,
                }}
              >
                {ending.timelineHighlights.map((entry, idx) => (
                  <div key={idx} className="mono-num" style={{ fontFamily: 'var(--font-body)' }}>
                    · {entry}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="dossier-footer">
          <div className="mono-num" style={{ fontSize: 11, color: 'var(--dossier-ink-muted)' }}>
            CASE CLOSED // {ending.id.toUpperCase()}
          </div>
          <button
            type="button"
            className="btn-noir btn-amber"
            style={{ minHeight: 44, padding: '10px 24px', fontSize: 14 }}
            onClick={onRestart}
          >
            <span>別の方針で再挑戦</span>
            <ArrowRightIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
