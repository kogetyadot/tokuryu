import React, { useEffect, useMemo, useState } from 'react';
import { formatYen } from '../sim/districts';
import { getOperativeTacticalHint } from '../sim/engine';
import { Term } from './GlossaryTerm';
import type {
  Character,
  DistrictId,
  DistrictState,
  Operation,
  OperationCategory,
  PayPolicy,
} from '../types/game';
import {
  AnonMaskIcon,
  ArrowRightIcon,
  BriefcaseOpIcon,
  CloseIcon,
  HarmSkullIcon,
  NetworkNodesIcon,
  SirenIcon,
  WarningIcon,
} from './Icons';

interface OperationDrawerProps {
  operation: Operation | null;
  operations: Operation[];
  districts: Record<DistrictId, DistrictState>;
  characters: Character[];
  onSelectOperation: (opId: string) => void;
  onBackToList?: () => void;
  onDispatch: (
    opId: string,
    leadId: string,
    subId: string | null,
    payPolicy: PayPolicy
  ) => void;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<OperationCategory, string> = {
  fraud_mirage: '特殊・投資詐欺',
  bogus_repair: '悪質点検・訪問',
  nightlife_ring: '歓楽街・スカウト',
  fenced_goods: '盗品・横流し物流',
  cyber_parlor: '無認可ネット決済',
  smash_grab: '強硬襲撃・強奪',
  front_business: 'フロント合法偽装',
};

const PAY_POLICIES: { id: PayPolicy; label: string; shortHint: string }[] = [
  { id: 'fair', label: '適正', shortHint: '標準 / 忠誠+2' },
  { id: 'stingy', label: '買い叩き', shortHint: '+7% / 中抜き増' },
  { id: 'exploit', label: '未払い', shortHint: '+14% / 離反危険' },
];

export const OperationDrawer: React.FC<OperationDrawerProps> = ({
  operation,
  operations,
  districts,
  characters,
  onSelectOperation,
  onBackToList,
  onDispatch,
  onClose,
}) => {
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [payPolicy, setPayPolicy] = useState<PayPolicy>('fair');
  const [showPayOptions, setShowPayOptions] = useState<boolean>(false);

  const coordinators = useMemo(
    () =>
      characters.filter(
        (c) =>
          c.tier === 'coordinator' &&
          (c.status === 'idle' || c.status === 'on_mission')
      ),
    [characters]
  );

  const directCandidates = useMemo(
    () =>
      characters.filter(
        (c) =>
          (c.status === 'idle' || c.status === 'on_mission') &&
          (c.tier === 'direct' ||
            c.tier === 'external' ||
            (c.tier === 'subordinate' && c.supervisorId === null))
      ),
    [characters]
  );

  // Auto-pick best available operative when switching operations (prefer coordinator if ready, else idle direct)
  useEffect(() => {
    if (!operation || operation.status !== 'available') return;
    const usableCoord = coordinators.find((c) => {
      const hasIdleSub = characters.some(
        (sub) => sub.supervisorId === c.id && sub.status === 'idle'
      );
      return hasIdleSub || c.status === 'idle';
    });
    const idleDirect = directCandidates.find((c) => c.status === 'idle');

    if (idleDirect && operation.traceRisk <= 12) {
      setSelectedLeadId(idleDirect.id);
    } else if (usableCoord) {
      setSelectedLeadId(usableCoord.id);
    } else if (idleDirect) {
      setSelectedLeadId(idleDirect.id);
    } else {
      setSelectedLeadId(coordinators[0]?.id ?? directCandidates[0]?.id ?? '');
    }
    setPayPolicy('fair');
    setShowPayOptions(false);
  }, [operation?.id]);

  const selectedLead = useMemo(
    () => characters.find((c) => c.id === selectedLeadId) ?? null,
    [characters, selectedLeadId]
  );

  const isDelegated = selectedLead?.tier === 'coordinator';

  const canDispatch = useMemo(() => {
    if (!operation || operation.status !== 'available' || !selectedLead) return false;
    if (selectedLead.status !== 'idle' && selectedLead.status !== 'on_mission') return false;

    if (selectedLead.tier === 'coordinator') {
      const hasIdleSub = characters.some(
        (c) => c.supervisorId === selectedLead.id && c.status === 'idle'
      );
      return hasIdleSub || selectedLead.status === 'idle';
    }
    return selectedLead.status === 'idle';
  }, [operation, selectedLead, characters]);

  // Compute live predicted success rate (always above early return)
  const successPrediction = useMemo(() => {
    if (!operation || operation.status !== 'available' || !selectedLead) return null;
    const district = districts[operation.districtId];

    let executor: Character = selectedLead;
    let coordinator: Character | undefined;
    if (selectedLead.tier === 'coordinator') {
      coordinator = selectedLead;
      executor =
        characters.find(
          (c) => c.supervisorId === selectedLead.id && c.status === 'idle'
        ) ?? selectedLead;
    }

    const isFogged = executor.isFogged;
    const baseSkill = isFogged ? executor.reportedSkill : executor.skill;
    const coordSupport =
      coordinator && executor.id !== coordinator.id
        ? Math.max(0, (coordinator.skill - baseSkill) * 0.25)
        : 0;
    const effectiveDiff = operation.difficulty + (district?.heat ?? 0) * 0.14;
    let prob = 0.72 + (baseSkill + coordSupport - effectiveDiff) * 0.0065;
    if (payPolicy === 'stingy') prob -= 0.04;
    if (payPolicy === 'exploit') prob -= 0.09;
    const pct = Math.round(Math.max(22, Math.min(94, prob * 100)));

    return {
      pct,
      isFogged,
      autoSubName:
        coordinator && executor.id !== coordinator.id ? executor.codename : null,
    };
  }, [operation, selectedLead, characters, districts, payPolicy]);

  // Operation Catalog View when no single operation is focused
  if (!operation) {
    const availableOps = operations.filter((o) => o.status === 'available');
    const activeOps = operations.filter((o) => o.status === 'active');
    const recentOps = operations
      .filter((o) => o.status === 'completed' || o.status === 'failed' || o.status === 'busted')
      .slice(0, 5);

    return (
      <aside className="noir-panel-sharp side-drawer interactive" aria-label="案件一覧">
        <div className="drawer-header">
          <div className="drawer-title-group">
            <BriefcaseOpIcon size={18} />
            <div>
              <h2 className="drawer-title">案件一覧 / 作戦盤</h2>
              <div className="drawer-subtitle">
                受注可能 {availableOps.length}件 · 進行中 {activeOps.length}件
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

        <div className="drawer-body">
          {availableOps.length > 0 && (
            <div>
              <div className="section-label">
                <span>受注できる案件 ({availableOps.length})</span>
                <span style={{ fontSize: 10, color: 'var(--cream-faint)' }}>タップで担当を選ぶ</span>
              </div>
              <div className="selector-list">
                {availableOps.map((op) => {
                  const dName = districts[op.districtId]?.name ?? op.districtId;
                  const riskHigh = op.traceRisk >= 16 || op.harmImpact >= 15;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      className="char-pick-row op-catalog-card"
                      onClick={() => onSelectOperation(op.id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="op-catalog-top">
                          <span className="op-catalog-title">{op.title}</span>
                          <span className="mono-num op-catalog-yield">
                            {formatYen(op.estimatedYield)}
                          </span>
                        </div>
                        <div className="op-catalog-meta mono-num">
                          <span>{dName}</span>
                          <span>難易度 {op.difficulty}</span>
                          <span style={{ color: riskHigh ? 'var(--crimson-bright)' : 'var(--cream-muted)' }}>
                            捜査 +{op.traceRisk}%
                          </span>
                          <span>{op.durationHours.toFixed(0)}h</span>
                        </div>
                      </div>
                      <ArrowRightIcon size={14} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeOps.length > 0 && (
            <div>
              <div className="section-label">進行中の案件 ({activeOps.length})</div>
              <div className="selector-list">
                {activeOps.map((op) => {
                  const pct = Math.round(op.progress * 100);
                  const dName = districts[op.districtId]?.name ?? op.districtId;
                  return (
                    <button
                      key={op.id}
                      type="button"
                      className="char-pick-row selected-teal"
                      onClick={() => onSelectOperation(op.id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 12.5 }}>{op.title}</div>
                        <div
                          className="mono-num"
                          style={{ fontSize: 11, color: 'var(--teal-bright)', marginTop: 2 }}
                        >
                          {dName} · 進捗 {pct}% · 予定 {formatYen(op.estimatedYield)}
                        </div>
                        <div className="hud-meter-bar" style={{ marginTop: 5 }}>
                          <div
                            className="hud-meter-fill"
                            style={{ width: `${pct}%`, background: 'var(--teal)' }}
                          />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {recentOps.length > 0 && (
            <div>
              <div className="section-label">直近の結果</div>
              <div className="selector-list">
                {recentOps.map((op) => (
                  <div
                    key={op.id}
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(7, 10, 15, 0.6)',
                      border: '1px solid var(--cream-hairline)',
                      fontSize: 11.5,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 700 }}>{op.title}</span>
                      <span
                        className="mono-num"
                        style={{
                          color:
                            op.status === 'completed'
                              ? 'var(--teal-bright)'
                              : 'var(--crimson-bright)',
                        }}
                      >
                        {op.status === 'completed'
                          ? '完了'
                          : op.status === 'busted'
                          ? '摘発'
                          : '失敗'}
                      </span>
                    </div>
                    {op.actualOutcome && (
                      <div style={{ fontSize: 11, color: 'var(--cream-muted)', marginTop: 2 }}>
                        {op.actualOutcome.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    );
  }

  const district = districts[operation.districtId];
  const highHarm = operation.harmImpact >= 15;

  return (
    <aside className="noir-panel-sharp side-drawer interactive" aria-label="案件実行ブリーフィング">
      <div className="drawer-header">
        <div className="drawer-title-group">
          {onBackToList ? (
            <button
              type="button"
              className="drawer-back-btn"
              onClick={onBackToList}
              aria-label="案件一覧へ戻る"
              title="案件一覧へ戻る"
            >
              ← 一覧
            </button>
          ) : (
            <BriefcaseOpIcon size={18} />
          )}
          <div style={{ minWidth: 0 }}>
            <h2 className="drawer-title">{operation.title}</h2>
            <div className="drawer-subtitle">
              {district?.name} // {CATEGORY_LABELS[operation.category]}
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

      {/* Single unified scrollable body — no nested vertical split */}
      <div className="drawer-body drawer-body-compact">
        {/* Compact 4-stat summary strip */}
        <div className="op-meta-strip">
          <div className="op-meta-chip">
            <span className="op-meta-k">見込収益</span>
            <strong className="mono-num" style={{ color: 'var(--amber-bright)' }}>
              {formatYen(operation.estimatedYield)}
            </strong>
          </div>
          <div className="op-meta-chip">
            <span className="op-meta-k">捜査リスク</span>
            <strong
              className="mono-num"
              style={{ color: operation.traceRisk >= 16 ? 'var(--crimson-bright)' : 'var(--cream)' }}
            >
              +{operation.traceRisk}%
            </strong>
          </div>
          <div className="op-meta-chip">
            <span className="op-meta-k">社会被害</span>
            <strong
              className="mono-num"
              style={{ color: highHarm ? 'var(--crimson-bright)' : 'var(--cream)' }}
            >
              +{operation.harmImpact}
            </strong>
          </div>
          <div className="op-meta-chip">
            <span className="op-meta-k">時間 / 難度</span>
            <strong className="mono-num">
              {operation.durationHours.toFixed(0)}h / {operation.difficulty}
            </strong>
          </div>
        </div>

        <p className="op-flavor-text">{operation.flavor}</p>

        {highHarm && (
          <div className="op-warning-strip">
            <HarmSkullIcon size={14} />
            <span>高被害案件：通報・報道が跳ね上がり、実行役の負荷も急増します。</span>
          </div>
        )}

        {operation.status !== 'available' ? (
          <div
            style={{
              padding: '12px',
              background: 'rgba(7, 10, 15, 0.8)',
              border: '1px solid var(--teal)',
            }}
          >
            <div
              className="mono-num"
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal-bright)' }}
            >
              {operation.status === 'active'
                ? `作戦実行中 — 進捗 ${Math.round(operation.progress * 100)}%`
                : operation.actualOutcome?.summary ?? '作戦終了'}
            </div>
            {operation.status === 'active' && (
              <div className="hud-meter-bar" style={{ marginTop: 8 }}>
                <div
                  className="hud-meter-fill"
                  style={{
                    width: `${Math.round(operation.progress * 100)}%`,
                    background: 'var(--teal)',
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Unified 1-Step Operative Picker: Choosing a Coordinator = Delegate, Direct = Direct */}
            <div>
              <div className="section-label">
                <span>担当を選ぶ（1タップ）</span>
                <span className="inline-term-strip">
                  <Term id="info_fog">情報の霧</Term>
                  <Term id="t3_trace">T3捜査網</Term>
                </span>
              </div>

              {/* Group 1: Coordinators (Delegate) */}
              {coordinators.length > 0 && (
                <div className="op-group-block">
                  <div className="op-group-heading delegate">
                    <NetworkNodesIcon size={13} />
                    <span>委任（幹部へ任せる）</span>
                    <span className="op-group-sub">捜査線半減 · 配下を自動投入 · 中抜き警戒</span>
                  </div>
                  <div className="selector-list">
                    {coordinators.map((char) => {
                      const isSelected = selectedLeadId === char.id;
                      const idleSubCount = characters.filter(
                        (s) => s.supervisorId === char.id && s.status === 'idle'
                      ).length;
                      const disabled = idleSubCount === 0 && char.status !== 'idle';
                      const hint = getOperativeTacticalHint(char);

                      return (
                        <button
                          key={char.id}
                          type="button"
                          disabled={disabled}
                          className={`char-pick-row${isSelected ? ' selected-teal' : ''}`}
                          onClick={() => setSelectedLeadId(char.id)}
                        >
                          <img
                            src={char.portraitUrl}
                            alt={char.codename}
                            className="portrait-thumb"
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="char-pick-head">
                              <span className="char-pick-name">
                                {char.codename}
                                <span className="char-pick-role">{char.roleLabel}</span>
                              </span>
                              <span className={`tactical-tag tone-${hint.tone}`}>
                                {hint.badge}
                              </span>
                            </div>
                            <div className="char-pick-note">{hint.note}</div>
                            <div className="char-pick-sub mono-num">
                              能力 {char.skill} · 忠誠 {char.loyalty}% ·{' '}
                              {idleSubCount > 0
                                ? `待機配下 ${idleSubCount}名を自律投入`
                                : char.status === 'idle'
                                ? '配下不在（幹部自ら出動）'
                                : '別案件で稼働中'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Group 2: Direct & External Operatives */}
              {directCandidates.length > 0 && (
                <div className="op-group-block">
                  <div className="op-group-heading direct">
                    <AnonMaskIcon size={13} />
                    <span>直轄・外部（直接動かす）</span>
                    <span className="op-group-sub">満額回収・報告100%正確 · 捜査線リスク大</span>
                  </div>
                  <div className="selector-list">
                    {directCandidates.map((char) => {
                      const isSelected = selectedLeadId === char.id;
                      const disabled = char.status !== 'idle';
                      const hint = getOperativeTacticalHint(char);

                      return (
                        <button
                          key={char.id}
                          type="button"
                          disabled={disabled}
                          className={`char-pick-row${isSelected ? ' selected' : ''}`}
                          onClick={() => setSelectedLeadId(char.id)}
                        >
                          <img
                            src={char.portraitUrl}
                            alt={char.codename}
                            className="portrait-thumb"
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="char-pick-head">
                              <span className="char-pick-name">
                                {char.codename}
                                <span className="char-pick-role">{char.roleLabel}</span>
                              </span>
                              <span className={`tactical-tag tone-${hint.tone}`}>
                                {hint.badge}
                              </span>
                            </div>
                            <div className="char-pick-note">{hint.note}</div>
                            <div className="char-pick-sub mono-num">
                              能力 {char.skill} · 忠誠 {char.loyalty}% · 負荷 {char.stress}% ·{' '}
                              {char.status === 'idle' ? '待機中' : '稼働中'}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Optional Pay Squeeze Toggle (Collapsed by default so basic flow is 2 taps) */}
            <div className="op-pay-optional">
              <button
                type="button"
                className={`op-pay-toggle${showPayOptions || payPolicy !== 'fair' ? ' active' : ''}`}
                onClick={() => setShowPayOptions((v) => !v)}
                aria-expanded={showPayOptions}
              >
                <span>
                  報酬のピンハネ設定（任意）:{' '}
                  <strong>
                    {PAY_POLICIES.find((p) => p.id === payPolicy)?.label ?? '適正'}
                  </strong>
                </span>
                <span className="mono-num" style={{ fontSize: 10.5, color: 'var(--cream-muted)' }}>
                  {showPayOptions ? '閉じる ▲' : '変更する ▼'}
                </span>
              </button>

              {showPayOptions && (
                <div className="pay-seg-row" role="radiogroup" aria-label="報酬方針">
                  {PAY_POLICIES.map((pp) => (
                    <button
                      key={pp.id}
                      type="button"
                      role="radio"
                      aria-checked={payPolicy === pp.id}
                      className={`pay-seg-btn${payPolicy === pp.id ? ' selected' : ''}`}
                      onClick={() => setPayPolicy(pp.id)}
                    >
                      <strong>{pp.label}</strong>
                      <span>{pp.shortHint}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Concise 1-line route warning inside scroll flow */}
            {selectedLead && (
              <div
                className="op-route-note"
                style={{
                  color: isDelegated ? 'var(--teal-bright)' : 'var(--amber-bright)',
                }}
              >
                {isDelegated ? <WarningIcon size={13} /> : <SirenIcon size={13} />}
                <span>
                  {isDelegated
                    ? `委任ルート（${selectedLead.codename}${
                        successPrediction?.autoSubName
                          ? ` → ${successPrediction.autoSubName}`
                          : ''
                      }）：捜査線を大幅遮断。完了後の報告額をニュースと照合しよう。`
                    : `直轄ルート（${selectedLead.codename}）：中抜きなしで満額回収。失敗時の捜査線跳ね上がりに注意。`}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Ultra-slim 1-row sticky action bar (eliminates nested vertical split) */}
      {operation.status === 'available' && (
        <div className="drawer-footer drawer-footer-slim">
          {successPrediction && (
            <div className="footer-prediction-pill">
              <span className="footer-pred-label">予測成功率</span>
              <strong
                className={`mono-num footer-pred-val ${
                  successPrediction.isFogged
                    ? 'fogged'
                    : successPrediction.pct >= 70
                    ? 'high'
                    : successPrediction.pct >= 50
                    ? 'mid'
                    : 'low'
                }`}
              >
                {successPrediction.isFogged
                  ? `~${successPrediction.pct}% (霧)`
                  : `~${successPrediction.pct}%`}
              </strong>
            </div>
          )}

          <button
            type="button"
            className="btn-noir btn-amber footer-dispatch-btn"
            disabled={!canDispatch}
            onClick={() =>
              onDispatch(operation.id, selectedLeadId, null, payPolicy)
            }
          >
            <span>{isDelegated ? '委任して実行' : '直轄で実行'}</span>
            <ArrowRightIcon size={16} />
          </button>
        </div>
      )}
    </aside>
  );
};
