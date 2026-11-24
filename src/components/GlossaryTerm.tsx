import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { soundEngine } from '../audio/SoundEngine';
import { CloseIcon } from './Icons';

export type GlossaryId =
  | 'cash'
  | 't3_trace'
  | 'info_fog'
  | 'direct_exec'
  | 'delegate_exec'
  | 'audit'
  | 'control'
  | 'city_harm'
  | 'cutoff'
  | 'quiet_exit'
  | 'direct_cap';

export interface GlossaryEntry {
  title: string;
  tag: string;
  accent: 'amber' | 'teal' | 'crimson';
  summary: string;
  tip: string;
  related?: GlossaryId[];
}

export const GLOSSARY: Record<GlossaryId, GlossaryEntry> = {
  cash: {
    title: '裏資金（目標 ¥2,500万）',
    tag: 'WIN CONDITION',
    accent: 'amber',
    summary:
      '組織が動かせる現金。案件の成功で増え、毎日の部下への報酬・維持費や裏取り調査の費用で減ります。',
    tip: '14日以内に ¥2,500万 を貯めて逃げ切れば完全勝利。マイナスが続くと資金ショートで空中分解します。',
    related: ['quiet_exit', 'audit'],
  },
  t3_trace: {
    title: 'T3捜査網（警察の包囲度）',
    tag: 'GAME OVER RISK',
    accent: 'crimson',
    summary:
      '海湾市警の匿名犯罪専従チーム「T3特捜班」が、元締めであるあなたにどれだけ迫っているかを示す危険度です。',
    tip: '100%になると一斉摘発で即ゲームオーバー！「指示役へ委任」や「尻尾切り」で上昇を抑えましょう。',
    related: ['delegate_exec', 'cutoff', 'quiet_exit'],
  },
  info_fog: {
    title: '情報の霧（匿名ゆえの不透明さ）',
    tag: 'CORE MECHANIC',
    accent: 'amber',
    summary:
      '幹部（指示役）に任せた配下の「本当の能力・忠誠心・不満」が隠れ、幹部からの報告値しか見えなくなる状態です。',
    tip: '報告を鵜呑みにすると中抜きや暴走に気づけません。「暗号端末」の裏取り調査や「人員」の実態調査で霧を晴らせます。',
    related: ['delegate_exec', 'audit'],
  },
  direct_exec: {
    title: '直轄実行（あなたが直接指示）',
    tag: 'COMMAND ROUTE',
    accent: 'amber',
    summary:
      '元締め自身が直接メンバーへ指示を出して案件を動かす方法。報告は100%正確で、中抜きや嘘は一切起きません。',
    tip: '確実ですが、現場が摘発されると捜査線があなたに直結し、T3捜査網が大きく跳ね上がります。',
    related: ['delegate_exec', 't3_trace', 'direct_cap'],
  },
  delegate_exec: {
    title: '指示役へ委任（幹部経由で実行）',
    tag: 'COMMAND ROUTE',
    accent: 'teal',
    summary:
      '氷室などの幹部（指示役）へ案件を丸投げし、その配下に実行させる方法。あなたと現場を切り離して匿名性を保てます。',
    tip: 'T3捜査網の上昇を約半分に抑えられますが、「情報の霧」が生じ、幹部が中抜きやトラブル隠蔽を働くことがあります。',
    related: ['info_fog', 'audit', 'direct_exec'],
  },
  audit: {
    title: '裏取り調査（嘘の検証）',
    tag: 'DEDUCTION',
    accent: 'teal',
    summary:
      '資金を投じて外部ログや警察無線を照合し、部下から届いた報告に「中抜き」や「現場トラブルの隠蔽」がないか暴く手段です。',
    tip: '海湾ニュースの速報と報告に食い違いを感じたら「暗号端末」から実行！嘘を暴けば資金回収・詰問・尻尾切りが選べます。',
    related: ['info_fog', 'cutoff'],
  },
  control: {
    title: '統制力（組織の求心力）',
    tag: 'STABILITY',
    accent: 'teal',
    summary:
      'バラバラの思惑で動くメンバーを元締めがどれだけ束ねられているかの指標です。',
    tip: '報酬未払い・部下同士の対立・嘘の放置で低下します。極端に下がると幹部による「下剋上」で組織を乗っ取られます。',
    related: ['cutoff', 'audit'],
  },
  city_harm: {
    title: '社会被害（街の荒廃度）',
    tag: 'WORLD IMPACT',
    accent: 'crimson',
    summary:
      '強奪や悪質な詐欺によって海湾市の市民被害や治安悪化がどれだけ広がったかを示します。',
    tip: '荒廃が進むと街にパトカーとバリケードが増え、警戒度が上がりやすくなるほか、最終エンディングの結末も変化します。',
    related: ['t3_trace'],
  },
  cutoff: {
    title: 'トカゲの尻尾切り（強制絶縁）',
    tag: 'EMERGENCY',
    accent: 'crimson',
    summary:
      '足がついた構成員や裏切り者の通信を焼き切り、組織から強制的に切り離す非常手段です。',
    tip: 'T3捜査網を大きく下げられますが、切り捨てた人物と親しい仲間の忠誠や、組織全体の統制力が下がります。',
    related: ['t3_trace', 'control'],
  },
  quiet_exit: {
    title: '雲隠れ（早期撤退エンド）',
    tag: 'EARLY EXIT',
    accent: 'amber',
    summary:
      '14日目の満了を待たず、裏資金が ¥1,400万 以上に達したタイミングで回線を破棄して逃げ切る早期クリアコマンドです。',
    tip: '満額勝利（¥2,500万）よりスコアは控えめですが、T3捜査網が危険域に達した際の確実な生存ルートになります。',
    related: ['cash', 't3_trace'],
  },
  direct_cap: {
    title: '直轄枠（直接管理の上限）',
    tag: 'ORG SCALE',
    accent: 'amber',
    summary:
      '元締めが直接連絡を取れる人数の上限です。匿名性を保つため、1人で全員を直接管理することはできません。',
    tip: '規模を広げるには、直轄メンバーを「指示役」に昇格させ、その配下へ流動実行役を募集・配置しましょう。',
    related: ['delegate_exec', 'info_fog'],
  },
};

interface GlossaryContextValue {
  activeTerm: GlossaryId | null;
  openTerm: (id: GlossaryId) => void;
  closeTerm: () => void;
}

const GlossaryContext = createContext<GlossaryContextValue>({
  activeTerm: null,
  openTerm: () => {},
  closeTerm: () => {},
});

export const useGlossary = () => useContext(GlossaryContext);

export const GlossaryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeTerm, setActiveTerm] = useState<GlossaryId | null>(null);

  const openTerm = useCallback((id: GlossaryId) => {
    soundEngine.playClick();
    setActiveTerm(id);
  }, []);

  const closeTerm = useCallback(() => {
    soundEngine.playClick();
    setActiveTerm(null);
  }, []);

  useEffect(() => {
    if (!activeTerm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setActiveTerm(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [activeTerm]);

  const entry = activeTerm ? GLOSSARY[activeTerm] : null;

  return (
    <GlossaryContext.Provider value={{ activeTerm, openTerm, closeTerm }}>
      {children}
      {entry &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="glossary-backdrop"
            onClick={closeTerm}
            role="dialog"
            aria-modal="true"
            aria-label={`${entry.title}の解説`}
            data-testid="glossary-popover"
          >
            <div
              className={`noir-panel-sharp glossary-card accent-${entry.accent}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="glossary-head">
                <div>
                  <div className={`glossary-tag mono-num tag-${entry.accent}`}>
                    {entry.tag} // 用語解説
                  </div>
                  <h3 className="glossary-title">{entry.title}</h3>
                </div>
                <button
                  type="button"
                  className="drawer-close-btn"
                  onClick={closeTerm}
                  aria-label="用語解説を閉じる"
                >
                  <CloseIcon size={15} />
                </button>
              </div>

              <p className="glossary-summary">{entry.summary}</p>
              <div className={`glossary-tip tip-${entry.accent}`}>
                <span className="glossary-tip-label mono-num">POINT</span>
                <span>{entry.tip}</span>
              </div>

              {entry.related && entry.related.length > 0 && (
                <div className="glossary-related">
                  <span className="glossary-related-label mono-num">関連用語:</span>
                  <div className="glossary-related-chips">
                    {entry.related.map((relId) => (
                      <button
                        key={relId}
                        type="button"
                        className="glossary-rel-chip"
                        onClick={() => openTerm(relId)}
                      >
                        {GLOSSARY[relId].title.split('（')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </GlossaryContext.Provider>
  );
};

interface TermProps {
  id: GlossaryId;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Inline tappable keyword that opens a plain-Japanese glossary card.
 * Inspired by Crusader Kings / Persona nested term popovers.
 */
export const Term: React.FC<TermProps> = ({ id, children, className = '' }) => {
  const { openTerm } = useGlossary();
  const entry = GLOSSARY[id];
  const label = children ?? entry.title.split('（')[0];

  return (
    <button
      type="button"
      className={`glossary-term-btn term-${entry.accent} ${className}`.trim()}
      onClick={(e) => {
        e.stopPropagation();
        openTerm(id);
      }}
      title={`${entry.title} の解説を見る`}
      data-term={id}
    >
      <span>{label}</span>
      <span className="glossary-term-dot" aria-hidden="true">?</span>
    </button>
  );
};
