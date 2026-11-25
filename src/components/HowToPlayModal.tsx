import React, { useState } from 'react';
import { Term } from './GlossaryTerm';
import {
  AnonMaskIcon,
  ArrowRightIcon,
  BriefcaseOpIcon,
  BurnerPhoneIcon,
  CloseIcon,
  SirenIcon,
} from './Icons';

interface HowToPlayModalProps {
  onClose: () => void;
  onReopenTutorial?: () => void;
}

interface GuideFaqItem {
  id: string;
  question: string;
  answer: React.ReactNode;
}

const GUIDE_FAQS: GuideFaqItem[] = [
  {
    id: 'promote',
    question: '「直轄」を「指示役へ昇格」するとどうなる？',
    answer: (
      <>
        直轄メンバーを幹部（指示役）に引き上げます（<strong>忠誠+6・野心+8</strong>、昇格後は直轄へ戻せません）。
        自分の配下を持てるようになり、案件を<Term id="delegate_exec">委任</Term>で回して
        <Term id="t3_trace">T3捜査網</Term>を大幅遮断できます。代わりに直轄での満額回収はできなくなり、完了報告に中抜き・隠蔽が混ざるリスクが生じます。
      </>
    ),
  },
  {
    id: 'reassign',
    question: '「直轄」と「〇〇配下へ移管」の違いは？',
    answer: (
      <>
        <strong>直轄</strong>は実態（能力・忠誠・負荷）が100%見え、中抜きも起きませんが、人数上限（
        <Term id="direct_cap">直轄枠</Term>）があります。指示役の<strong>配下</strong>へ移すと直轄枠が空いて組織を広げられる反面、
        <Term id="info_fog">情報の霧</Term>がかかり実態が不透明になります。
      </>
    ),
  },
  {
    id: 'external',
    question: '「外部」メンバー（黒田・斎木など）の特徴は？',
    answer: (
      <>
        <Term id="direct_cap">直轄枠</Term>を消費せず、足がつきにくい即戦力として投入できます。代わりに案件成功時の報酬から
        <strong>24% が自動天引</strong>されます。
      </>
    ),
  },
  {
    id: 'audit_choices',
    question: '「裏取り調査」の使いどころと、嘘を暴いた後の3択は？',
    answer: (
      <>
        委任案件の完了報告と、画面下の「海湾ニュース」で金額や状況が食い違っていれば虚偽の兆候です。暗号端末から
        <Term id="audit">裏取り調査</Term>で嘘を暴くと3つの処分を選べます：
        <br />・<strong>詰問・回収</strong>：中抜き分を取り戻し統制回復（対象の忠誠低下）
        <br />・<strong><Term id="cutoff">尻尾切り</Term></strong>：即座に絶縁し捜査網を大幅削減
        <br />・<strong>黙認して泳がせる</strong>：見逃す代わりに<strong>弱みを掌握</strong>。後日切り捨てる際、捜査網を追加で
        <strong>-12%</strong>削る切り札になる
      </>
    ),
  },
  {
    id: 'pay_bonus',
    question: '「ピンハネ設定」や「報奨金」は何に影響する？',
    answer: (
      <>
        案件画面のピンハネ設定（買い叩き／未払い）は目先の取り分を増やせますが、忠誠低下・中抜き・離反リスクが上がります。逆に人員画面の
        <strong>報奨金（¥30万）</strong>は忠誠を回復させ負荷を下げるため、不満や下剋上の抑止に働きます。
      </>
    ),
  },
  {
    id: 'pace',
    question: '時間が進むのが早い・落ち着いて考えたいときは？',
    answer: (
      <>
        案件・暗号端末・人員などのパネルを開いている間は<strong>自動で一時停止</strong>され、閉じると元の速度へ戻ります。マップ上でも上部の
        <code>⏸</code> や「夜へ進む」で自由にペースを調整できます。
      </>
    ),
  },
];

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({
  onClose,
  onReopenTutorial,
}) => {
  const [openFaqId, setOpenFaqId] = useState<string | null>('promote');

  return (
    <div
      className="modal-backdrop howto-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="遊び方ガイド"
      data-testid="howto-modal"
    >
      <div
        className="noir-panel-sharp modal-card howto-modal-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="drawer-title-group">
            <AnonMaskIcon size={18} />
            <div>
              <h2 className="drawer-title">遊び方ガイド</h2>
              <div className="drawer-subtitle">FIELD MANUAL // ルールと仕組み</div>
            </div>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="遊び方ガイドを閉じる"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="drawer-body howto-modal-body">
          {/* Big Picture Hero */}
          <section className="howto-hero-box">
            <div className="howto-hero-kicker mono-num">OVERVIEW // ゲームの目的</div>
            <h3 className="howto-hero-lead">
              警察に捕まる前に、組織を操って
              <span className="howto-highlight">14日間で ¥2,500万</span>
              稼いで逃げ切るゲームです。
            </h3>
            <div className="howto-winloss-row">
              <div className="howto-wl-chip win">
                <span className="howto-wl-tag">勝利</span>
                <span>
                  <Term id="cash">裏資金</Term> ¥2,500万で完全逃亡（¥1,400万で早期
                  <Term id="quiet_exit">雲隠れ</Term>も可）
                </span>
              </div>
              <div className="howto-wl-chip lose">
                <span className="howto-wl-tag">
                  <SirenIcon size={11} />
                  敗北
                </span>
                <span>
                  <Term id="t3_trace">T3捜査網</Term> 100% ／{' '}
                  <Term id="control">統制力</Term> 崩壊 ／ 資金ショート
                </span>
              </div>
            </div>
          </section>

          {/* Visual 3-Step Daily Flow Strip */}
          <section className="howto-flow-section">
            <div className="howto-section-caption mono-num">
              DAILY LOOP // 1日の流れ（全14日間）
            </div>
            <div className="howto-flow-strip">
              <div className="howto-flow-card">
                <div className="howto-flow-num mono-num">STEP 1</div>
                <div className="howto-flow-title">
                  <BriefcaseOpIcon size={15} />
                  <span>案件に人を送る</span>
                </div>
                <p className="howto-flow-desc">
                  街のピンか「案件一覧」から案件を選び、担当を1タップで決定。
                </p>
              </div>
              <div className="howto-flow-arrow" aria-hidden="true">
                <ArrowRightIcon size={16} />
              </div>
              <div className="howto-flow-card">
                <div className="howto-flow-num mono-num">STEP 2</div>
                <div className="howto-flow-title">
                  <BurnerPhoneIcon size={15} />
                  <span>報告とニュースを確認</span>
                </div>
                <p className="howto-flow-desc">
                  時間が進むと完了。暗号端末に部下の報告、画面下に海湾ニュースが届く。
                </p>
              </div>
              <div className="howto-flow-arrow" aria-hidden="true">
                <ArrowRightIcon size={16} />
              </div>
              <div className="howto-flow-card">
                <div className="howto-flow-num mono-num">STEP 3</div>
                <div className="howto-flow-title">
                  <AnonMaskIcon size={15} />
                  <span>真偽を見抜き、組織を編制</span>
                </div>
                <p className="howto-flow-desc">
                  不審な報告は <Term id="audit">裏取り調査</Term>
                  。昇格・配置・<Term id="cutoff">尻尾切り</Term>で危機を捌く。
                </p>
              </div>
            </div>
          </section>

          {/* The Core Dilemma — Direct vs Delegate */}
          <section className="howto-dilemma-grid">
            <div className="howto-dilemma-card direct">
              <div className="howto-dilemma-head">
                <Term id="direct_exec">直轄実行</Term>
                <span className="howto-dilemma-sub">現場・外部へ直接指示</span>
              </div>
              <p>
                報告は100%正確で中抜きなし。ただし失敗・摘発されると{' '}
                <Term id="t3_trace">T3捜査網</Term> が一気に跳ね上がる。
              </p>
            </div>
            <div className="howto-dilemma-card delegate">
              <div className="howto-dilemma-head">
                <Term id="delegate_exec">指示役へ委任</Term>
                <span className="howto-dilemma-sub">幹部経由で自動投入</span>
              </div>
              <p>
                警察の捜査線を大幅に遮断できる。しかし <Term id="info_fog">情報の霧</Term>{' '}
                がかかり、幹部による中抜きやトラブル隠蔽が紛れ込む。
              </p>
            </div>
          </section>

          {/* Expandable Reference FAQ for tricky mechanics */}
          <section className="howto-faq-section" aria-label="仕組みの補足">
            <div className="howto-section-caption mono-num">
              SYSTEM NOTES // つまづきやすい仕組みの補足
            </div>
            <div className="howto-faq-list">
              {GUIDE_FAQS.map((item) => {
                const isOpen = openFaqId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`howto-faq-item${isOpen ? ' open' : ''}`}
                  >
                    <button
                      type="button"
                      className="howto-faq-q"
                      aria-expanded={isOpen}
                      onClick={() => setOpenFaqId(isOpen ? null : item.id)}
                    >
                      <span>{item.question}</span>
                      <span className="mono-num howto-faq-caret">
                        {isOpen ? '▲' : '▼'}
                      </span>
                    </button>
                    {isOpen && <div className="howto-faq-a">{item.answer}</div>}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="howto-glossary-hint">
            点線つきの用語（<Term id="promote">指示役へ昇格</Term>・
            <Term id="t3_trace">T3捜査網</Term>・
            <Term id="info_fog">情報の霧</Term> など）はゲーム中いつでもタップで解説が開きます。
          </div>

          <div className="howto-controls-bar mono-num">
            <span>ドラッグ：街の視点回転</span>
            <span>ピンチ / ホイール：拡大縮小</span>
            <span className="hide-mobile">Space：一時停止</span>
            <span className="hide-mobile">1 / 2：速度切替</span>
          </div>
        </div>

        <div className="drawer-footer howto-modal-footer">
          {onReopenTutorial && (
            <button
              type="button"
              className="btn-noir btn-teal howto-reopen-guide-btn"
              onClick={onReopenTutorial}
              data-testid="howto-reopen-tutorial"
            >
              <span>ミサキの操作ナビを再表示</span>
            </button>
          )}
          <button
            type="button"
            className="btn-noir btn-amber howto-close-cta"
            onClick={onClose}
          >
            <span>閉じる</span>
          </button>
        </div>
      </div>
    </div>
  );
};
