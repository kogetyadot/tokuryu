import React, { useState } from 'react';
import type { DistrictId, DistrictState, NewsItem, PhoneMessage } from '../types/game';
import { BurnerPhoneIcon, CloseIcon, RadioNewsIcon } from './Icons';

interface NewsTickerProps {
  news: NewsItem[];
  messages: PhoneMessage[];
  districts: Record<DistrictId, DistrictState>;
  onSelectMessage: (msgId: string) => void;
  onFocusDistrict: (districtId: DistrictId) => void;
}

export const NewsTicker: React.FC<NewsTickerProps> = ({
  news,
  messages,
  districts,
  onSelectMessage,
  onFocusDistrict,
}) => {
  const [archiveOpen, setArchiveOpen] = useState(false);

  const latest = news[0];
  if (!latest) return null;

  const tagLabel =
    latest.severity === 'breaking'
      ? '速報'
      : latest.severity === 'warning'
      ? '警戒'
      : '海湾ニュース LIVE';

  return (
    <>
      <button
        type="button"
        className="noir-panel news-ticker-bar interactive"
        onClick={() => setArchiveOpen(true)}
        title="クリックして海湾ニュースアーカイブを開く"
      >
        <span className={`news-tag ${latest.severity}`}>
          <RadioNewsIcon size={13} />
          <span>{tagLabel}</span>
        </span>
        <span className="news-headline-text">{latest.headline}</span>
        <span
          className="mono-num"
          style={{
            fontSize: 10.5,
            color: 'var(--cream-faint)',
            flexShrink: 0,
            borderLeft: '1px solid var(--cream-hairline)',
            paddingLeft: 8,
          }}
        >
          {news.length}件
        </span>
      </button>

      {archiveOpen && (
        <div
          className="modal-backdrop"
          onClick={() => setArchiveOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="海湾ニュースアーカイブ"
        >
          <div
            className="noir-panel-sharp modal-card modal-card-narrow"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <div className="drawer-title-group">
                <RadioNewsIcon size={18} />
                <div>
                  <h2 className="drawer-title">海湾ニュース LIVE アーカイブ</h2>
                  <div className="drawer-subtitle">
                    KAIWAN BROADCAST // 市内の報道記録と現場動向
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setArchiveOpen(false)}
                aria-label="閉じる"
              >
                <CloseIcon size={16} />
              </button>
            </div>

            <div className="drawer-body">
              {news.map((item) => {
                const districtName = item.districtId
                  ? districts[item.districtId]?.name
                  : '海湾市全域';
                const targetMsgId =
                  messages.find((m) => m.day === item.day && m.type === 'report')?.id ??
                  messages[0]?.id;

                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '11px 12px',
                      background: 'rgba(11, 15, 20, 0.85)',
                      border: '1px solid var(--cream-hairline)',
                      borderLeft:
                        item.severity === 'breaking'
                          ? '3px solid var(--crimson)'
                          : item.severity === 'warning'
                          ? '3px solid var(--amber)'
                          : '3px solid var(--teal)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 7,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 11,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span className={`news-tag ${item.severity}`}>
                          {item.severity === 'breaking'
                            ? '速報'
                            : item.severity === 'warning'
                            ? '警戒'
                            : '報道'}
                        </span>
                        <span className="mono-num" style={{ color: 'var(--cream-faint)' }}>
                          DAY {String(item.day).padStart(2, '0')}
                        </span>
                        {item.districtId ? (
                          <button
                            type="button"
                            onClick={() => {
                              onFocusDistrict(item.districtId!);
                              setArchiveOpen(false);
                            }}
                            style={{
                              background: 'rgba(240, 165, 0, 0.08)',
                              border: '1px solid rgba(240, 165, 0, 0.36)',
                              color: 'var(--amber-bright)',
                              fontSize: 10.5,
                              padding: '2px 7px',
                              cursor: 'pointer',
                            }}
                          >
                            {districtName}
                          </button>
                        ) : (
                          <span
                            style={{
                              background: 'rgba(241, 237, 228, 0.06)',
                              border: '1px solid var(--cream-hairline)',
                              color: 'var(--cream-muted)',
                              fontSize: 10.5,
                              padding: '2px 7px',
                            }}
                          >
                            {districtName}
                          </span>
                        )}
                      </div>
                      {item.isSatire && (
                        <span
                          className="mono-num"
                          style={{ fontSize: 10, color: 'var(--teal)' }}
                        >
                          STREET WIRE
                        </span>
                      )}
                    </div>

                    <div style={{ fontWeight: 700, fontSize: 13.5, lineHeight: 1.45 }}>
                      {item.headline}
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: 'var(--cream-muted)',
                        lineHeight: 1.5,
                      }}
                    >
                      {item.subhead}
                    </div>

                    {targetMsgId && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 2 }}>
                        <button
                          type="button"
                          className="btn-noir btn-teal"
                          style={{ minHeight: 32, padding: '4px 10px', fontSize: 11 }}
                          onClick={() => {
                            setArchiveOpen(false);
                            onSelectMessage(targetMsgId);
                          }}
                        >
                          <BurnerPhoneIcon size={13} />
                          <span>暗号端末で照合</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
