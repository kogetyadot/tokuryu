import React, { useEffect, useState } from 'react';
import { formatYen } from '../sim/districts';
import type { NewsItem, PhoneMessage } from '../types/game';
import {
  AuditSearchIcon,
  BurnerPhoneIcon,
  CheckIcon,
  CloseIcon,
  CutOffBladeIcon,
  RadioNewsIcon,
} from './Icons';

interface PhoneInboxProps {
  messages: PhoneMessage[];
  news: NewsItem[];
  cash: number;
  auditCost: number;
  initialMessageId: string | null;
  onSelectMessage: (msgId: string) => void;
  onAuditMessage: (msgId: string) => void;
  onConfront: (msgId: string, action: 'reclaim' | 'cut_off' | 'overlook') => void;
  onResolveChoice: (msgId: string, choiceId: string) => void;
  onClose: () => void;
}

function formatHour(hourFloat: number): string {
  const totalMin = Math.round(hourFloat * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const PhoneInbox: React.FC<PhoneInboxProps> = ({
  messages,
  news,
  cash,
  auditCost,
  initialMessageId,
  onSelectMessage,
  onAuditMessage,
  onConfront,
  onResolveChoice,
  onClose,
}) => {
  const [activeId, setActiveId] = useState<string>(
    initialMessageId ?? messages[0]?.id ?? ''
  );

  useEffect(() => {
    if (initialMessageId && messages.some((m) => m.id === initialMessageId)) {
      setActiveId(initialMessageId);
      onSelectMessage(initialMessageId);
    } else if (!activeId && messages[0]) {
      setActiveId(messages[0].id);
      onSelectMessage(messages[0].id);
    }
  }, [initialMessageId, messages.length]);

  const selected = messages.find((m) => m.id === activeId) ?? messages[0] ?? null;

  const handleSelect = (msg: PhoneMessage) => {
    setActiveId(msg.id);
    onSelectMessage(msg.id);
  };

  const linkedNews = selected?.linkedNewsId
    ? news.find((n) => n.id === selected.linkedNewsId)
    : selected
    ? news.find((n) => n.contradictsMessageId === selected.id)
    : undefined;

  const canAudit =
    Boolean(selected) &&
    !selected?.audited &&
    (selected?.type === 'report' || Boolean(selected?.containsLie)) &&
    !(selected?.resolved && Boolean(selected?.choices?.length));

  const canConfront = Boolean(
    selected?.audited &&
      selected?.containsLie &&
      !selected?.confronted &&
      !(selected?.resolved && Boolean(selected?.choices?.length))
  );

  const primaryConfrontLabel =
    selected?.lieType === 'coverup'
      ? '隠蔽を詰問・隠滅阻止'
      : selected?.lieType === 'skimming'
      ? `中抜き回収・詰問${
          selected.skimmedAmount ? ` (+${formatYen(selected.skimmedAmount)})` : ''
        }`
      : '虚偽を詰問・追及';

  const unreadCount = messages.filter((m) => !m.read).length;

  return (
    <aside
      className="noir-panel-sharp side-drawer drawer-wide interactive"
      aria-label="暗号端末インボックス"
    >
      <div className="drawer-header">
        <div className="drawer-title-group">
          <BurnerPhoneIcon size={18} />
          <div>
            <h2 className="drawer-title">暗号端末 // SIGNAL-X</h2>
            <div className="drawer-subtitle">
              UNREAD {unreadCount} · TOTAL {messages.length} · AUDIT {formatYen(auditCost)}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="drawer-close-btn"
          onClick={onClose}
          aria-label="閉じる"
        >
          <CloseIcon size={16} />
        </button>
      </div>

      <div className="drawer-body" style={{ flex: 1, minHeight: 0 }}>
        {messages.length === 0 ? (
          <div style={{ color: 'var(--cream-muted)', fontSize: 12.5, padding: '16px 0' }}>
            受信メッセージはありません。
          </div>
        ) : (
          <div className="phone-split">
            {/* Left Thread List */}
            <div className="phone-list">
              {messages.map((msg) => {
                const isSelected = selected?.id === msg.id;
                const itemCls = [
                  'phone-item',
                  !msg.read ? 'unread' : '',
                  msg.isUrgent ? 'urgent' : '',
                  isSelected ? 'selected' : '',
                ]
                  .filter(Boolean)
                  .join(' ');

                return (
                  <button
                    key={msg.id}
                    type="button"
                    className={itemCls}
                    onClick={() => handleSelect(msg)}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        {msg.senderPortrait && (
                          <img
                            src={msg.senderPortrait}
                            alt={msg.senderName}
                            style={{
                              width: 24,
                              height: 24,
                              objectFit: 'cover',
                              border: '1px solid var(--cream-hairline)',
                              flexShrink: 0,
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {msg.senderName}
                        </span>
                      </div>
                      <span
                        className="mono-num"
                        style={{ fontSize: 9.5, color: 'var(--cream-faint)', flexShrink: 0 }}
                      >
                        D{msg.day} {formatHour(msg.hour)}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 11,
                        lineHeight: 1.35,
                        color: msg.read ? 'var(--cream-muted)' : 'var(--cream)',
                        fontWeight: msg.read ? 400 : 700,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {msg.subject}
                    </div>

                    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                      {!msg.read && (
                        <span
                          className="mono-num"
                          style={{ fontSize: 9, color: 'var(--amber-bright)' }}
                        >
                          NEW
                        </span>
                      )}
                      {msg.isUrgent && !msg.resolved && (
                        <span
                          className="mono-num"
                          style={{ fontSize: 9, color: 'var(--crimson-bright)' }}
                        >
                          URGENT
                        </span>
                      )}
                      {msg.audited && msg.containsLie && (
                        <span
                          className="mono-num"
                          style={{ fontSize: 9, color: 'var(--crimson-bright)' }}
                        >
                          虚偽検出
                        </span>
                      )}
                      {msg.choices && !msg.resolved && (
                        <span
                          className="mono-num"
                          style={{ fontSize: 9, color: 'var(--teal-bright)' }}
                        >
                          要応答
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right Selected Message Detail */}
            {selected && (
              <div className="phone-detail">
                {/* Sender Header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    paddingBottom: 10,
                    borderBottom: '1px solid var(--cream-hairline)',
                  }}
                >
                  {selected.senderPortrait && (
                    <img
                      src={selected.senderPortrait}
                      alt={selected.senderName}
                      className="portrait-thumb portrait-lg"
                    />
                  )}
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 8,
                      }}
                    >
                      <strong style={{ fontSize: 14 }}>{selected.senderName}</strong>
                      <span
                        className="mono-num"
                        style={{ fontSize: 10.5, color: 'var(--cream-faint)' }}
                      >
                        DAY {String(selected.day).padStart(2, '0')} · {formatHour(selected.hour)}
                      </span>
                    </div>
                    {selected.senderRole && (
                      <div style={{ fontSize: 11, color: 'var(--teal)', marginTop: 1 }}>
                        {selected.senderRole}
                      </div>
                    )}
                    <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4 }}>
                      {selected.subject}
                    </div>
                  </div>
                </div>

                {/* Message Body */}
                <div
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.65,
                    color: 'var(--cream)',
                    whiteSpace: 'pre-line',
                    background: 'rgba(7, 10, 15, 0.56)',
                    padding: '11px 12px',
                    border: '1px solid rgba(241, 237, 228, 0.08)',
                  }}
                >
                  {selected.body}
                </div>

                {/* Linked News Contradiction Clue */}
                {linkedNews && (
                  <div className="news-clue-callout">
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontWeight: 700,
                        color: 'var(--amber-bright)',
                        marginBottom: 4,
                      }}
                    >
                      <RadioNewsIcon size={14} />
                      <span>海湾ニュース報道との関連シグナル</span>
                    </div>
                    <div style={{ fontWeight: 700, marginBottom: 2 }}>
                      {linkedNews.headline}
                    </div>
                    <div style={{ color: 'var(--cream-muted)', fontSize: 11 }}>
                      {linkedNews.subhead}
                    </div>
                  </div>
                )}

                {/* Audit Trigger Button */}
                {canAudit && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '10px 12px',
                      background: 'rgba(46, 196, 182, 0.08)',
                      border: '1px solid rgba(46, 196, 182, 0.35)',
                    }}
                  >
                    <div style={{ fontSize: 11.5, color: 'var(--cream-muted)', lineHeight: 1.4 }}>
                      報告数値や撤収証言の真偽をミサキの別回線でクロスチェックします。
                    </div>
                    <button
                      type="button"
                      className="btn-noir btn-teal"
                      disabled={cash < auditCost}
                      onClick={() => onAuditMessage(selected.id)}
                    >
                      <AuditSearchIcon size={15} />
                      <span>裏取り調査 ({formatYen(auditCost)})</span>
                    </button>
                  </div>
                )}

                {/* Audited Result Box */}
                {selected.audited && (
                  <div
                    className={`audit-result-box${selected.containsLie ? ' lie-found' : ''}`}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 6,
                      }}
                    >
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream-muted)' }}>
                        裏取り結果
                      </span>
                      <span
                        className="stamp-inline"
                        style={{
                          color: selected.containsLie
                            ? 'var(--crimson-bright)'
                            : 'var(--teal-bright)',
                        }}
                      >
                        {selected.containsLie ? '虚偽報告を検出！' : '報告一致'}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.55 }}>
                      {selected.auditResultText}
                    </div>
                  </div>
                )}

                {/* Confrontation Actions after Lie Exposed */}
                {canConfront && (
                  <div>
                    <div className="section-label">
                      <span style={{ color: 'var(--crimson-bright)' }}>
                        追及・処分を選択してください
                      </span>
                    </div>
                    <div className="confront-actions">
                      <button
                        type="button"
                        className="btn-noir btn-amber confront-btn"
                        onClick={() => onConfront(selected.id, 'reclaim')}
                      >
                        <span style={{ fontWeight: 700 }}>{primaryConfrontLabel}</span>
                        <span className="mono-num confront-meta">
                          {selected.lieType === 'coverup'
                            ? '捜査線-4% / 統制+6 / 忠誠-10'
                            : '統制+6 / 忠誠-10'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn-noir btn-crimson confront-btn"
                        onClick={() => onConfront(selected.id, 'cut_off')}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontWeight: 700,
                          }}
                        >
                          <CutOffBladeIcon size={14} />
                          <span>トカゲの尻尾切り（切り捨て）</span>
                        </span>
                        <span className="mono-num confront-meta">
                          捜査線大幅減 / 絶縁
                        </span>
                      </button>
                      <button
                        type="button"
                        className="btn-noir confront-btn"
                        onClick={() => onConfront(selected.id, 'overlook')}
                      >
                        <span style={{ fontWeight: 700 }}>黙認して泳がせる</span>
                        <span className="mono-num confront-meta">
                          統制-4 / 忠誠+4・野心+8
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {selected.confronted && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 11.5,
                      color: 'var(--teal-bright)',
                    }}
                  >
                    <CheckIcon size={15} />
                    <span>この件は処理済みです。</span>
                  </div>
                )}

                {/* Interactive Dilemma Choices */}
                {selected.choices && selected.choices.length > 0 && (
                  <div>
                    <div className="section-label">
                      <span>指示を選択</span>
                    </div>
                    {selected.resolved ? (
                      <div
                        style={{
                          padding: '8px 10px',
                          background: 'rgba(46, 196, 182, 0.08)',
                          border: '1px solid rgba(46, 196, 182, 0.3)',
                          fontSize: 11.5,
                          color: 'var(--teal-bright)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <CheckIcon size={15} />
                        <span>この案件の指示は確定しました。</span>
                      </div>
                    ) : (
                      <div className="choice-list">
                        {selected.choices.map((ch) => {
                          const cannotAfford = Boolean(ch.cost && cash < ch.cost);
                          const btnTone =
                            ch.tone === 'ruthless'
                              ? 'btn-crimson'
                              : ch.tone === 'generous'
                              ? 'btn-teal'
                              : 'btn-noir';
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              disabled={cannotAfford}
                              className={`btn-noir ${btnTone} choice-btn`}
                              onClick={() => onResolveChoice(selected.id, ch.id)}
                            >
                              <span style={{ fontWeight: 700, fontSize: 12.5 }}>
                                {ch.label}
                              </span>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 400,
                                  color: 'var(--cream-muted)',
                                }}
                              >
                                {ch.hint}
                                {cannotAfford ? '（資金不足）' : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
