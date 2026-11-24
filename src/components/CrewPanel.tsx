import React, { useMemo, useState } from 'react';
import { formatYen } from '../sim/districts';
import { getDirectSlotUsage, getOperativeTacticalHint } from '../sim/engine';
import { Term } from './GlossaryTerm';
import type {
  Character,
  CharacterStatus,
  CharacterTier,
  CharacterTrait,
  DistrictId,
  DistrictState,
} from '../types/game';
import {
  AuditSearchIcon,
  CloseIcon,
  CrewIcon,
  CutOffBladeIcon,
  WarningIcon,
  YenIcon,
} from './Icons';

interface CrewPanelProps {
  day: number;
  characters: Character[];
  districts: Record<DistrictId, DistrictState>;
  directCapacity: number;
  cash: number;
  auditCost: number;
  onRecruit: (supervisorId: string | null) => void;
  onAuditCharacter: (charId: string) => void;
  onPromoteToCoordinator: (charId: string) => void;
  onReassignSupervisor: (subId: string, newSupervisorId: string | null) => void;
  onGiveBonus: (charId: string, amount: number) => void;
  onCutOff: (charId: string) => void;
  onClose: () => void;
}

const TIER_LABELS: Record<CharacterTier, { label: string; cls: string }> = {
  direct: { label: '直轄', cls: 'tier-direct' },
  coordinator: { label: '指示役', cls: 'tier-coordinator' },
  subordinate: { label: '流動実行役', cls: 'tier-subordinate' },
  external: { label: '外部', cls: 'tier-external' },
};

const STATUS_LABELS: Record<CharacterStatus, string> = {
  idle: '待機中',
  on_mission: '作戦稼働中',
  arrested: '逮捕・拘束',
  fled: '離脱・逃亡',
  betrayed: '裏切り・通報',
  cut_off: '切り捨て済',
};

const TRAIT_LABELS: Record<CharacterTrait, string> = {
  calculating: '計算高い',
  hotheaded: '短気',
  paranoid: '猜疑的',
  conscientious: '良心残留',
  greedy: '強欲',
  loyal: '義理堅い',
  ambitious: '野心家',
  desperate: '困窮',
  slick: '要領良好',
};

const RECRUIT_COST = 400_000;
const BONUS_AMOUNT = 300_000;

export const CrewPanel: React.FC<CrewPanelProps> = ({
  day,
  characters,
  districts,
  directCapacity,
  cash,
  auditCost,
  onRecruit,
  onAuditCharacter,
  onPromoteToCoordinator,
  onReassignSupervisor,
  onGiveBonus,
  onCutOff,
  onClose,
}) => {
  const [confirmCutId, setConfirmCutId] = useState<string | null>(null);
  const [recruitTarget, setRecruitTarget] = useState<string>('direct');
  const [showRecruitPanel, setShowRecruitPanel] = useState<boolean>(day >= 3);

  const directUsed = useMemo(
    () => getDirectSlotUsage({ characters }),
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

  const sortedChars = useMemo(() => {
    const order: Record<CharacterTier, number> = {
      coordinator: 0,
      direct: 1,
      subordinate: 2,
      external: 3,
    };
    return [...characters].sort((a, b) => {
      const aActive = a.status === 'idle' || a.status === 'on_mission' ? 0 : 1;
      const bActive = b.status === 'idle' || b.status === 'on_mission' ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return order[a.tier] - order[b.tier];
    });
  }, [characters]);

  const effectiveRecruitSup =
    recruitTarget === 'direct' ? null : recruitTarget;
  const recruitDisabled =
    cash < RECRUIT_COST ||
    (effectiveRecruitSup === null && directUsed >= directCapacity);

  return (
    <aside
      className="noir-panel-sharp side-drawer drawer-wide interactive"
      aria-label="人員・委任管理"
    >
      <div className="drawer-header">
        <div className="drawer-title-group">
          <CrewIcon size={18} />
          <div style={{ minWidth: 0 }}>
            <h2 className="drawer-title">人員・委任マネジメント</h2>
            <div className="drawer-subtitle">
              在籍 {characters.length}名 · 直轄枠 {directUsed}/{directCapacity}
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
        {/* Progressive Disclosure: Collapsible Recruitment Bar on Day 1-2 */}
        <div className="crew-recruit-shell">
          <button
            type="button"
            className="crew-recruit-toggle"
            onClick={() => setShowRecruitPanel((v) => !v)}
            aria-expanded={showRecruitPanel}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <strong>人員募集・組織拡大</strong>
              <span className="mono-num" style={{ fontSize: 11, color: 'var(--teal-bright)' }}>
                直轄 {directUsed}/{directCapacity}
              </span>
              {day <= 2 && (
                <span className="crew-phase-pill">序盤は初期メンバーで十分</span>
              )}
            </span>
            <span className="mono-num" style={{ fontSize: 10.5, color: 'var(--cream-muted)' }}>
              {showRecruitPanel ? '閉じる ▲' : '募集を開く ▼'}
            </span>
          </button>

          {showRecruitPanel && (
            <div className="crew-recruit-body">
              <div style={{ fontSize: 11, color: 'var(--cream-muted)' }}>
                <Term id="direct_cap">直轄キャパシティ</Term>超過分は幹部配下へ募集（配下には
                <Term id="info_fog">情報の霧</Term>が発生）
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div className="noir-segmented" role="group" aria-label="採用先の所属">
                  <button
                    type="button"
                    className={`noir-seg-btn${recruitTarget === 'direct' ? ' active-amber' : ''}`}
                    disabled={directUsed >= directCapacity}
                    onClick={() => setRecruitTarget('direct')}
                  >
                    直轄採用{directUsed >= directCapacity ? '(満枠)' : ''}
                  </button>
                  {coordinators.map((coord) => (
                    <button
                      key={coord.id}
                      type="button"
                      className={`noir-seg-btn${recruitTarget === coord.id ? ' active-teal' : ''}`}
                      onClick={() => setRecruitTarget(coord.id)}
                    >
                      {coord.codename}配下
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="btn-noir btn-amber"
                  disabled={recruitDisabled}
                  onClick={() => onRecruit(effectiveRecruitSup)}
                >
                  <span>流動実行役を募集 ({formatYen(RECRUIT_COST)})</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Character Roster List */}
        {sortedChars.map((char) => {
          const isActive = char.status === 'idle' || char.status === 'on_mission';
          const tierMeta = TIER_LABELS[char.tier];
          const tacticalHint = getOperativeTacticalHint(char);
          const supervisor = char.supervisorId
            ? characters.find((c) => c.id === char.supervisorId)
            : undefined;
          const districtName = districts[char.homeDistrict]?.name ?? char.homeDistrict;
          const canPromote =
            isActive &&
            char.tier !== 'coordinator' &&
            char.tier !== 'external' &&
            (char.tier === 'direct' ||
              char.supervisorId === null ||
              directUsed < directCapacity);
          const canReassign =
            isActive && char.tier !== 'coordinator' && char.tier !== 'external';

          return (
            <div
              key={char.id}
              className={`crew-card${isActive ? '' : ' inactive'}`}
            >
              {/* Top Row: Portrait + Identity + Tier & Status */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <img
                  src={char.portraitUrl}
                  alt={char.codename}
                  className="portrait-thumb portrait-lg"
                />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 14 }}>{char.codename}</strong>
                      <span
                        className="mono-num"
                        style={{ fontSize: 11, color: 'var(--cream-faint)' }}
                      >
                        {char.handle}
                      </span>
                      <span className={`tier-badge ${tierMeta.cls}`}>{tierMeta.label}</span>
                    </div>

                    <span
                      className="mono-num"
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color:
                          char.status === 'idle'
                            ? 'var(--teal-bright)'
                            : char.status === 'on_mission'
                            ? 'var(--amber-bright)'
                            : 'var(--crimson-bright)',
                      }}
                    >
                      {STATUS_LABELS[char.status]}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--cream-muted)',
                      marginTop: 2,
                      display: 'flex',
                      gap: 8,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>{char.roleLabel}</span>
                    <span>· 拠点: {districtName}</span>
                    {supervisor && <span>· 上長: {supervisor.codename}</span>}
                    {char.dailyUpkeep > 0 && (
                      <span className="mono-num">· 日給 {formatYen(char.dailyUpkeep)}</span>
                    )}
                  </div>

                  {/* Traits + Tactical Hint + Leverage Badge */}
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
                    <span className={`tactical-tag tone-${tacticalHint.tone}`}>
                      {tacticalHint.badge}
                    </span>
                    {char.leverageReady && isActive && (
                      <span className="tactical-tag tone-crimson">
                        弱み掌握（尻尾切り捜査追加-12%）
                      </span>
                    )}
                    {char.traits.map((tr) => (
                      <span key={tr} className="trait-chip">
                        {TRAIT_LABELS[tr] ?? tr}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Metrics Bar (Handles Fog Visualization!) */}
              {char.isFogged ? (
                <div
                  style={{
                    padding: '7px 9px',
                    background: 'rgba(240, 165, 0, 0.07)',
                    border: '1px dashed rgba(240, 165, 0, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span className="fog-stat-mask">
                      能力 報告値: ~{char.reportedSkill} (未確認)
                    </span>
                    <span className="fog-stat-mask">
                      忠誠 報告値: ~{char.reportedLoyalty}% (未確認)
                    </span>
                    <span className="fog-stat-mask">限界度: ???</span>
                  </div>
                  {isActive && (
                    <button
                      type="button"
                      className="btn-noir btn-teal"
                      style={{ minHeight: 32, padding: '4px 10px', fontSize: 11 }}
                      disabled={cash < auditCost}
                      onClick={() => onAuditCharacter(char.id)}
                    >
                      <AuditSearchIcon size={13} />
                      <span>実態調査 ({formatYen(auditCost)})</span>
                    </button>
                  )}
                </div>
              ) : (
                <div
                  className="mono-num"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                    gap: 6,
                    fontSize: 11,
                    background: 'rgba(7, 10, 15, 0.62)',
                    padding: '6px 8px',
                    border: '1px solid rgba(241, 237, 228, 0.08)',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--cream-faint)' }}>能力 </span>
                    <strong>{char.skill}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--cream-faint)' }}>忠誠 </span>
                    <strong
                      style={{
                        color:
                          char.loyalty < 45
                            ? 'var(--crimson-bright)'
                            : char.loyalty >= 75
                            ? 'var(--teal-bright)'
                            : 'var(--cream)',
                      }}
                    >
                      {char.loyalty}%
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--cream-faint)' }}>負荷 </span>
                    <strong
                      style={{
                        color: char.stress >= 65 ? 'var(--crimson-bright)' : 'var(--cream)',
                      }}
                    >
                      {char.stress}%
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--cream-faint)' }}>実績 </span>
                    <strong>{char.missionsCompleted}件</strong>
                  </div>
                </div>
              )}

              {char.lastAutonomousNote && (
                <div style={{ fontSize: 11, color: 'var(--cream-muted)', fontStyle: 'italic' }}>
                  {char.lastAutonomousNote}
                </div>
              )}

              {/* Actions */}
              {isActive && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    flexWrap: 'wrap',
                  }}
                >
                  {canPromote && (
                    <button
                      type="button"
                      className="btn-noir btn-teal"
                      style={{ minHeight: 32, padding: '4px 9px', fontSize: 11 }}
                      onClick={() => onPromoteToCoordinator(char.id)}
                    >
                      指示役へ昇格
                    </button>
                  )}

                  {canReassign && (
                    <div
                      className="noir-segmented"
                      role="group"
                      aria-label={`${char.codename}の所属変更`}
                    >
                      <button
                        type="button"
                        className={`noir-seg-btn${
                          char.supervisorId === null ? ' active-amber' : ''
                        }`}
                        disabled={
                          char.supervisorId !== null && directUsed >= directCapacity
                        }
                        onClick={() => onReassignSupervisor(char.id, null)}
                      >
                        直轄
                        {char.supervisorId !== null && directUsed >= directCapacity
                          ? '(満枠)'
                          : ''}
                      </button>
                      {coordinators.map((coord) => (
                        <button
                          key={coord.id}
                          type="button"
                          className={`noir-seg-btn${
                            char.supervisorId === coord.id ? ' active-teal' : ''
                          }`}
                          onClick={() => onReassignSupervisor(char.id, coord.id)}
                        >
                          {coord.codename}配下
                        </button>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn-noir"
                    style={{ minHeight: 32, padding: '4px 9px', fontSize: 11 }}
                    disabled={cash < BONUS_AMOUNT}
                    onClick={() => onGiveBonus(char.id, BONUS_AMOUNT)}
                  >
                    <YenIcon size={12} />
                    <span>報奨金 ({formatYen(BONUS_AMOUNT)})</span>
                  </button>

                  {confirmCutId === char.id ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginLeft: 'auto' }}>
                      <span
                        style={{
                          fontSize: 10.5,
                          color: 'var(--crimson-bright)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                        }}
                      >
                        <WarningIcon size={12} />
                        <span>本当に切り捨てる？</span>
                      </span>
                      <button
                        type="button"
                        className="btn-noir btn-crimson-solid"
                        style={{ minHeight: 32, padding: '4px 9px', fontSize: 11 }}
                        onClick={() => {
                          onCutOff(char.id);
                          setConfirmCutId(null);
                        }}
                      >
                        確定
                      </button>
                      <button
                        type="button"
                        className="btn-noir"
                        style={{ minHeight: 32, padding: '4px 8px', fontSize: 11 }}
                        onClick={() => setConfirmCutId(null)}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="btn-noir btn-crimson"
                      style={{
                        minHeight: 32,
                        padding: '4px 9px',
                        fontSize: 11,
                        marginLeft: 'auto',
                      }}
                      onClick={() => setConfirmCutId(char.id)}
                    >
                      <CutOffBladeIcon size={13} />
                      <span>切り捨て (尻尾切り)</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
