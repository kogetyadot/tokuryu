import React, { useEffect, useMemo, useState } from 'react';
import { formatYen } from '../sim/districts';
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

const PAY_POLICIES: { id: PayPolicy; label: string; hint: string }[] = [
  { id: 'fair', label: '適正報酬', hint: '標準収益 / 忠誠+2・不満小' },
  { id: 'stingy', label: '買い叩き', hint: '取分+7% / 忠誠-3・中抜き誘発' },
  { id: 'exploit', label: '未払い・脅迫', hint: '取分+14% / 忠誠-9・離反危険' },
];

export const OperationDrawer: React.FC<OperationDrawerProps> = ({
  operation,
  operations,
  districts,
  characters,
  onSelectOperation,
  onDispatch,
  onClose,
}) => {
  const [mode, setMode] = useState<'direct' | 'delegate'>('direct');
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [selectedSubId, setSelectedSubId] = useState<string>(''); // '' = auto-assign
  const [payPolicy, setPayPolicy] = useState<PayPolicy>('fair');

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

  const coordinators = useMemo(
    () =>
      characters.filter(
        (c) =>
          c.tier === 'coordinator' &&
          (c.status === 'idle' || c.status === 'on_mission')
      ),
    [characters]
  );

  const activeCoordinatorSubordinates = useMemo(() => {
    if (mode !== 'delegate' || !selectedLeadId) return [];
    return characters.filter(
      (c) =>
        c.supervisorId === selectedLeadId &&
        (c.status === 'idle' || c.status === 'on_mission')
    );
  }, [characters, mode, selectedLeadId]);

  useEffect(() => {
    if (!operation || operation.status !== 'available') return;
    const idleDirect = directCandidates.find((c) => c.status === 'idle');
    const usableCoord = coordinators.find((c) => {
      const hasIdleSub = characters.some(
        (sub) => sub.supervisorId === c.id && sub.status === 'idle'
      );
      return hasIdleSub || c.status === 'idle';
    });

    if (idleDirect) {
      setMode('direct');
      setSelectedLeadId(idleDirect.id);
      setSelectedSubId('');
    } else if (usableCoord) {
      setMode('delegate');
      setSelectedLeadId(usableCoord.id);
      setSelectedSubId('');
    } else if (directCandidates[0]) {
      setMode('direct');
      setSelectedLeadId(directCandidates[0].id);
      setSelectedSubId('');
    }
    setPayPolicy('fair');
  }, [operation?.id]);

  const handleModeSwitch = (nextMode: 'direct' | 'delegate') => {
    setMode(nextMode);
    setSelectedSubId('');
    if (nextMode === 'direct') {
      const idle = directCandidates.find((c) => c.status === 'idle') ?? directCandidates[0];
      setSelectedLeadId(idle?.id ?? '');
    } else {
      const usableCoord =
        coordinators.find(
          (c) =>
            characters.some((sub) => sub.supervisorId === c.id && sub.status === 'idle') ||
            c.status === 'idle'
        ) ?? coordinators[0];
      setSelectedLeadId(usableCoord?.id ?? '');
    }
  };

  const canDispatch = useMemo(() => {
    if (!operation || operation.status !== 'available' || !selectedLeadId) return false;
    const lead = characters.find((c) => c.id === selectedLeadId);
    if (!lead || (lead.status !== 'idle' && lead.status !== 'on_mission')) return false;

    if (mode === 'delegate') {
      if (lead.tier !== 'coordinator') return false;
      if (selectedSubId) {
        const sub = characters.find(
          (c) =>
            c.id === selectedSubId &&
            c.supervisorId === lead.id &&
            c.status === 'idle'
        );
        return Boolean(sub);
      }
      const hasIdleSub = characters.some(
        (c) => c.supervisorId === lead.id && c.status === 'idle'
      );
      return hasIdleSub || lead.status === 'idle';
    }

    return lead.status === 'idle';
  }, [operation, selectedLeadId, selectedSubId, mode, characters]);

  // Compute live predicted success rate from selected operative(s) & district heat (must stay above early return)
  const successPrediction = useMemo(() => {
    if (!operation || operation.status !== 'available' || !selectedLeadId) return null;
    const district = districts[operation.districtId];
    const lead = characters.find((c) => c.id === selectedLeadId);
    if (!lead) return null;

    let executor: Character | undefined = lead;
    let coordinator: Character | undefined;
    if (mode === 'delegate' && lead.tier === 'coordinator') {
      coordinator = lead;
      if (selectedSubId) {
        executor = characters.find((c) => c.id === selectedSubId) ?? lead;
      } else {
        executor =
          characters.find(
            (c) => c.supervisorId === lead.id && c.status === 'idle'
          ) ?? lead;
      }
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
    };
  }, [operation, selectedLeadId, selectedSubId, mode, characters, districts, payPolicy]);

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
                ACTIVE {activeOps.length} · AVAILABLE {availableOps.length}
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

          <div>
            <div className="section-label">受注可能な機会 ({availableOps.length})</div>
            {availableOps.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--cream-muted)', padding: '10px 0' }}>
                本日の受注可能案件はありません。時間を進めて夜間清算へ移ってください。
              </div>
            ) : (
              <div className="selector-list">
                {availableOps.map((op) => {
                  const d = districts[op.districtId];
                  return (
                    <button
                      key={op.id}
                      type="button"
                      className="char-pick-row"
                      onClick={() => onSelectOperation(op.id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            gap: 8,
                          }}
                        >
                          <span style={{ fontWeight: 700, fontSize: 12.5 }}>{op.title}</span>
                          <span
                            className="mono-num"
                            style={{ color: 'var(--amber-bright)', fontWeight: 700, fontSize: 12 }}
                          >
                            {formatYen(op.estimatedYield)}
                          </span>
                        </div>
                        <div
                          className="mono-num"
                          style={{
                            fontSize: 10.5,
                            color: 'var(--cream-muted)',
                            marginTop: 3,
                            display: 'flex',
                            gap: 10,
                            flexWrap: 'wrap',
                          }}
                        >
                          <span style={{ color: d?.accentColor }}>{d?.name}</span>
                          <span>{CATEGORY_LABELS[op.category]}</span>
                          <span>捜査線 +{op.traceRisk}</span>
                          <span
                            style={{
                              color: op.harmImpact >= 15 ? 'var(--crimson-bright)' : 'inherit',
                            }}
                          >
                            被害 +{op.harmImpact}
                          </span>
                        </div>
                      </div>
                      <ArrowRightIcon size={15} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {recentOps.length > 0 && (
            <div>
              <div className="section-label">直近の結果履歴</div>
              <div className="selector-list">
                {recentOps.map((op) => (
                  <div
                    key={op.id}
                    style={{
                      padding: '8px 10px',
                      background: 'rgba(7, 10, 15, 0.65)',
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
          <BriefcaseOpIcon size={18} />
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

      <div className="drawer-body drawer-body-compact">
        <p
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.45,
            color: 'var(--cream-muted)',
          }}
        >
          {operation.flavor}
        </p>

        {/* Core Stats Grid */}
        <div className="op-meta-grid">
          <div className="op-meta-cell">
            <span>見込収益</span>
            <span style={{ color: 'var(--amber-bright)' }}>
              {formatYen(operation.estimatedYield)}
            </span>
          </div>
          <div className="op-meta-cell">
            <span>捜査線リスク</span>
            <span style={{ color: operation.traceRisk >= 16 ? 'var(--crimson-bright)' : 'var(--cream)' }}>
              +{operation.traceRisk}%
            </span>
          </div>
          <div className="op-meta-cell">
            <span>社会被害負荷</span>
            <span style={{ color: highHarm ? 'var(--crimson-bright)' : 'var(--cream)' }}>
              +{operation.harmImpact}
            </span>
          </div>
          <div className="op-meta-cell">
            <span>所要 / 難易度</span>
            <span>
              {operation.durationHours.toFixed(1)}h / {operation.difficulty}
            </span>
          </div>
        </div>

        {highHarm && (
          <div
            style={{
              padding: '6px 9px',
              background: 'rgba(230, 57, 70, 0.12)',
              border: '1px solid rgba(230, 57, 70, 0.45)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 11,
              lineHeight: 1.35,
              color: '#ff9ca3',
            }}
          >
            <HarmSkullIcon size={15} />
            <span>
              高被害案件：市民通報やT3警戒が跳ね上がり、実行役のストレスも急増します。
            </span>
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
            {/* Dispatch Mode Selector */}
            <div>
              <div className="section-label">
                <span>1. 指揮ルートを選択</span>
                <span className="inline-term-strip">
                  <Term id="info_fog">情報の霧</Term>
                  <Term id="t3_trace">T3捜査網</Term>
                </span>
              </div>
              <div className="dispatch-mode-grid">
                <button
                  type="button"
                  className={`mode-card${mode === 'direct' ? ' active-direct' : ''}`}
                  onClick={() => handleModeSwitch('direct')}
                >
                  <div className="mode-card-title" style={{ color: 'var(--amber-bright)' }}>
                    <AnonMaskIcon size={14} />
                    <span>直轄実行 (Direct)</span>
                  </div>
                  <div className="mode-card-hint">
                    報告精度100%・中抜きなし。摘発時の捜査線リスク大。
                  </div>
                </button>

                <button
                  type="button"
                  className={`mode-card${mode === 'delegate' ? ' active-delegate' : ''}`}
                  onClick={() => handleModeSwitch('delegate')}
                >
                  <div className="mode-card-title" style={{ color: 'var(--teal-bright)' }}>
                    <NetworkNodesIcon size={14} />
                    <span>指示役へ委任 (Delegate)</span>
                  </div>
                  <div className="mode-card-hint">
                    捜査線を大幅遮断。報告に「情報の霧」と中抜きリスク。
                  </div>
                </button>
              </div>
            </div>

            {/* Lead Selector */}
            <div>
              <div className="section-label">
                <span>
                  {mode === 'direct' ? '2. 直轄・外部実行役を選択' : '2. 委任する仲介統括を選択'}
                </span>
              </div>
              <div className="selector-list">
                {(mode === 'direct' ? directCandidates : coordinators).map((char) => {
                  const isSelected = selectedLeadId === char.id;
                  const idleSubCount =
                    mode === 'delegate'
                      ? characters.filter(
                          (s) => s.supervisorId === char.id && s.status === 'idle'
                        ).length
                      : 0;
                  const disabled =
                    mode === 'direct'
                      ? char.status !== 'idle'
                      : idleSubCount === 0 && char.status !== 'idle';

                  return (
                    <button
                      key={char.id}
                      type="button"
                      disabled={disabled}
                      className={`char-pick-row${
                        isSelected ? (mode === 'delegate' ? ' selected-teal' : ' selected') : ''
                      }`}
                      onClick={() => {
                        setSelectedLeadId(char.id);
                        setSelectedSubId('');
                      }}
                    >
                      <img
                        src={char.portraitUrl}
                        alt={char.codename}
                        className="portrait-thumb"
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <span style={{ fontWeight: 700, fontSize: 12.5 }}>
                            {char.codename}
                            <span
                              style={{
                                fontSize: 11,
                                color: 'var(--cream-muted)',
                                fontWeight: 400,
                                marginLeft: 6,
                              }}
                            >
                              {char.roleLabel}
                            </span>
                          </span>
                          <span className="mono-num" style={{ fontSize: 11, color: 'var(--amber)' }}>
                            能力 {char.skill}
                          </span>
                        </div>
                        <div
                          className="mono-num"
                          style={{ fontSize: 10.5, color: 'var(--cream-faint)', marginTop: 2 }}
                        >
                          {char.tier === 'external' && '外部取分24%天引 · '}
                          {mode === 'delegate'
                            ? `待機配下 ${idleSubCount}名 · 忠誠 ${char.loyalty}%`
                            : char.status === 'idle'
                            ? `待機中 · 隠密 ${char.discretion} · 負荷 ${char.stress}%`
                            : '別案件で稼働中'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Subordinate Picker when Delegating */}
            {mode === 'delegate' && selectedLeadId && (
              <div>
                <div className="section-label">
                  <span>3. 投入する実行役（任意指定）</span>
                </div>
                <div className="selector-list">
                  <button
                    type="button"
                    className={`char-pick-row${selectedSubId === '' ? ' selected-teal' : ''}`}
                    onClick={() => setSelectedSubId('')}
                  >
                    <div style={{ flex: 1, fontSize: 12 }}>
                      <strong>統括お任せ（自動割当）</strong>
                      <div style={{ fontSize: 10.5, color: 'var(--cream-muted)' }}>
                        待機中の配下から統括が自動選択（不在時は統括自ら出動）
                      </div>
                    </div>
                  </button>
                  {activeCoordinatorSubordinates.map((sub) => (
                    <button
                      key={sub.id}
                      type="button"
                      disabled={sub.status !== 'idle'}
                      className={`char-pick-row${selectedSubId === sub.id ? ' selected-teal' : ''}`}
                      onClick={() => setSelectedSubId(sub.id)}
                    >
                      <img
                        src={sub.portraitUrl}
                        alt={sub.codename}
                        className="portrait-thumb"
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontWeight: 700, fontSize: 12 }}>{sub.codename}</span>
                          <span
                            className={`mono-num${sub.isFogged ? ' fog-stat-mask' : ''}`}
                            style={{ fontSize: 10.5 }}
                          >
                            {sub.isFogged
                              ? `報告能力 ~${sub.reportedSkill} (霧)`
                              : `能力 ${sub.skill}`}
                          </span>
                        </div>
                        <div
                          className="mono-num"
                          style={{ fontSize: 10.5, color: 'var(--cream-faint)', marginTop: 2 }}
                        >
                          {sub.status === 'idle' ? '待機中' : '稼働中'} ·{' '}
                          {sub.isFogged
                            ? `報告忠誠 ~${sub.reportedLoyalty}%`
                            : `忠誠 ${sub.loyalty}% / 負荷 ${sub.stress}%`}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sticky Drawer Footer: Pay Policy + Live Success Prediction + Primary Dispatch CTA */}
      {operation.status === 'available' && (
        <div className="drawer-footer">
          <div>
            <div className="section-label" style={{ marginBottom: 4 }}>
              <span>報酬方針</span>
              {successPrediction && (
                <span
                  className={`prediction-badge${
                    successPrediction.isFogged
                      ? ' fogged'
                      : successPrediction.pct >= 70
                      ? ' high'
                      : successPrediction.pct >= 50
                      ? ' mid'
                      : ' low'
                  }`}
                >
                  成功率予測:{' '}
                  {successPrediction.isFogged
                    ? `~??% (霧 · 推計${successPrediction.pct}%)`
                    : `~${successPrediction.pct}%`}
                </span>
              )}
            </div>
            <div className="pay-policy-grid">
              {PAY_POLICIES.map((pp) => (
                <button
                  key={pp.id}
                  type="button"
                  className={`pay-card pay-card-compact${payPolicy === pp.id ? ' selected' : ''}`}
                  onClick={() => setPayPolicy(pp.id)}
                >
                  <span style={{ fontWeight: 700, fontSize: 11.5 }}>{pp.label}</span>
                  <span style={{ fontSize: 9.5, lineHeight: 1.25, color: 'var(--cream-muted)' }}>
                    {pp.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10.5,
              lineHeight: 1.35,
              color: mode === 'delegate' ? 'var(--teal-bright)' : 'var(--amber-bright)',
            }}
          >
            {mode === 'delegate' ? <WarningIcon size={13} /> : <SirenIcon size={13} />}
            <span>
              {mode === 'delegate'
                ? '委任実行：捜査線を約半分に遮断。完了後の報告額に注意。'
                : '直轄実行：資金を全額回収。失敗・摘発時の捜査線リスク大。'}
            </span>
          </div>

          <button
            type="button"
            className="btn-noir btn-amber"
            style={{ width: '100%', minHeight: 42, fontSize: 13.5 }}
            disabled={!canDispatch}
            onClick={() =>
              onDispatch(
                operation.id,
                selectedLeadId,
                mode === 'delegate' && selectedSubId ? selectedSubId : null,
                payPolicy
              )
            }
          >
            <span>案件を実行する</span>
            <ArrowRightIcon size={16} />
          </button>
        </div>
      )}
    </aside>
  );
};
