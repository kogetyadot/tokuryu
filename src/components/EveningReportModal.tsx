import React from 'react';
import { formatYen } from '../sim/districts';
import type { DaySummary } from '../types/game';
import {
  ArrowRightIcon,
  BurnerPhoneIcon,
  CheckIcon,
  RadioNewsIcon,
  SirenIcon,
  WarningIcon,
} from './Icons';

interface EveningReportModalProps {
  summary: DaySummary;
  policeTrace: number;
  day: number;
  maxDays: number;
  onOpenInbox: () => void;
  onProceedNextDay: () => void;
}

export const EveningReportModal: React.FC<EveningReportModalProps> = ({
  summary,
  policeTrace,
  day,
  maxDays,
  onOpenInbox,
  onProceedNextDay,
}) => {
  const showSaikiPortrait =
    policeTrace >= 40 || summary.headline.severity === 'breaking';
  const nextDayNum = day + 1;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="夜間清算と海湾ニュース速報"
    >
      <div className="noir-panel-sharp modal-card modal-card-narrow">
        <div className="drawer-header">
          <div className="drawer-title-group">
            <RadioNewsIcon size={18} />
            <div>
              <h2 className="drawer-title">
                DAY {String(summary.day).padStart(2, '0')} 夜間清算 &amp; ニュース速報
              </h2>
              <div className="drawer-subtitle">
                22:00 DAILY SETTLEMENT // KAIWAN EVENING WIRE
              </div>
            </div>
          </div>
          <span
            className={`news-tag ${summary.headline.severity}`}
            style={{ fontSize: 11 }}
          >
            {summary.headline.severity === 'breaking'
              ? 'T3 緊急速報'
              : summary.headline.severity === 'warning'
              ? '警戒情報'
              : '夜間概況'}
          </span>
        </div>

        <div className="drawer-body">
          {/* Live Kaiwan TV Breaking News Video Monitor */}
          {(summary.headline.severity === 'breaking' ||
            summary.headline.severity === 'warning' ||
            policeTrace >= 55) && (
            <div className="news-tv-monitor" data-testid="news-alert-video">
              <video
                className="news-tv-video"
                src="./assets/video/news_t3_alert.mp4"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                aria-hidden="true"
              />
              <div className="news-tv-scanlines" aria-hidden="true" />
              <div className="news-tv-overlay-top mono-num">
                <span className="news-tv-live-pill">
                  <span className="news-tv-live-dot" aria-hidden="true" />
                  <span>LIVE // 海湾TV 緊急中継</span>
                </span>
                <span className="news-tv-cam">CAM-04 BAYFRONT</span>
              </div>
            </div>
          )}

          {/* Kaiwan News Main Headline Card */}
          <div
            style={{
              padding: '12px 14px',
              background: 'rgba(7, 10, 15, 0.85)',
              border: '1px solid var(--cream-hairline)',
              borderLeft:
                summary.headline.severity === 'breaking'
                  ? '3px solid var(--crimson)'
                  : '3px solid var(--amber)',
              display: 'flex',
              gap: 12,
              alignItems: 'center',
            }}
          >
            {showSaikiPortrait && (
              <img
                src="./assets/portraits/saiki.jpg"
                alt="佐伯警部補"
                className="portrait-thumb portrait-lg"
                style={{ borderColor: 'var(--crimson)' }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                className="mono-num"
                style={{
                  fontSize: 10,
                  color:
                    summary.headline.severity === 'breaking'
                      ? 'var(--crimson-bright)'
                      : 'var(--amber)',
                  letterSpacing: '0.1em',
                  marginBottom: 4,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <SirenIcon size={12} />
                <span>海湾ニュース 22:00 特別版</span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 15.5,
                  lineHeight: 1.4,
                  marginBottom: 4,
                }}
              >
                {summary.headline.headline}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--cream-muted)', lineHeight: 1.45 }}>
                {summary.headline.subhead}
              </div>
            </div>
          </div>

          {/* Ledger Comparison */}
          <div>
            <div className="section-label">
              <span>本日の帳簿清算</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 8,
              }}
            >
              <div className="op-meta-cell">
                <span>報告売上（上納集計）</span>
                <span style={{ color: 'var(--cream)', fontSize: 15 }}>
                  {formatYen(summary.reportedIncome)}
                </span>
              </div>
              <div className="op-meta-cell">
                <span>実着金（市場推計照合）</span>
                <span
                  style={{
                    color: summary.hiddenSkimSuspected
                      ? 'var(--crimson-bright)'
                      : 'var(--teal-bright)',
                    fontSize: 13.5,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {summary.hiddenSkimSuspected ? (
                    <>
                      <WarningIcon size={15} />
                      <span>不整合を検知</span>
                    </>
                  ) : (
                    <>
                      <CheckIcon size={15} />
                      <span>報告と一致（異常なし）</span>
                    </>
                  )}
                </span>
              </div>
              <div className="op-meta-cell">
                <span>人員報酬・維持費支払</span>
                <span style={{ color: 'var(--cream-muted)' }}>
                  -{formatYen(summary.upkeepPaid)}
                </span>
              </div>
              <div className="op-meta-cell">
                <span>本日純収支</span>
                <span
                  style={{
                    color:
                      summary.netCashDelta >= 0
                        ? 'var(--amber-bright)'
                        : 'var(--crimson-bright)',
                  }}
                >
                  {summary.netCashDelta >= 0 ? '+' : ''}
                  {formatYen(summary.netCashDelta)}
                </span>
              </div>
            </div>

            <div
              className="mono-num"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 8,
                padding: '7px 10px',
                background: 'rgba(7, 10, 15, 0.68)',
                border: '1px solid var(--cream-hairline)',
                fontSize: 11.5,
              }}
            >
              <span>
                捜査線変動:{' '}
                <strong
                  style={{
                    color: summary.traceDelta > 0 ? 'var(--crimson-bright)' : 'var(--teal-bright)',
                  }}
                >
                  {summary.traceDelta >= 0 ? `+${summary.traceDelta}%` : `${summary.traceDelta}%`}
                </strong>
              </span>
              <span>
                統制変動:{' '}
                <strong
                  style={{
                    color: summary.controlDelta < 0 ? 'var(--crimson-bright)' : 'var(--teal-bright)',
                  }}
                >
                  {summary.controlDelta >= 0
                    ? `+${summary.controlDelta}%`
                    : `${summary.controlDelta}%`}
                </strong>
              </span>
              <span>
                社会被害:{' '}
                <strong>
                  {summary.harmDelta >= 0 ? `+${summary.harmDelta}` : summary.harmDelta}
                </strong>
              </span>
            </div>
          </div>

          {/* Discrepancy Warning */}
          {summary.hiddenSkimSuspected && (
            <div
              style={{
                padding: '10px 12px',
                background: 'rgba(230, 57, 70, 0.14)',
                border: '1px solid var(--crimson)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: '#ff9ca3',
                  fontWeight: 700,
                }}
              >
                <WarningIcon size={16} />
                <span>不整合を検知：報告額と報道規模に食い違いあり（暗号端末で裏取り可能）</span>
              </div>
              <button
                type="button"
                className="btn-noir btn-crimson"
                style={{ minHeight: 34, padding: '4px 10px', fontSize: 11.5 }}
                onClick={onOpenInbox}
              >
                <BurnerPhoneIcon size={14} />
                <span>暗号端末で確認</span>
              </button>
            </div>
          )}

          {/* Autonomous Crew Logs */}
          <div>
            <div className="section-label">
              <span>構成員の自律動向ログ</span>
            </div>
            {summary.autonomousLogs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--cream-muted)' }}>
                今夜は特筆すべき自律事象は報告されませんでした。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {summary.autonomousLogs.map((log, i) => (
                  <div
                    key={i}
                    style={{
                      fontSize: 12,
                      padding: '7px 10px',
                      background: 'rgba(18, 24, 32, 0.78)',
                      borderLeft: '2px solid var(--teal)',
                      lineHeight: 1.45,
                    }}
                  >
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-noir btn-amber"
            style={{ width: '100%', minHeight: 46, fontSize: 14 }}
            onClick={onProceedNextDay}
          >
            <span>
              {nextDayNum <= maxDays
                ? `翌日へ進む (DAY ${String(nextDayNum).padStart(2, '0')})`
                : '最終判定へ進む'}
            </span>
            <ArrowRightIcon size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
