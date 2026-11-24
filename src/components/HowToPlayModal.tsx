import React from 'react';
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
}

export const HowToPlayModal: React.FC<HowToPlayModalProps> = ({ onClose }) => {
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
              <div className="drawer-subtitle">FIELD MANUAL // 遊び方</div>
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
          {/* Big Picture Hero — Instantly tells you WHAT this game is in 3 seconds */}
          <section className="howto-hero-box">
            <div className="howto-hero-kicker mono-num">OVERVIEW // 何をするゲーム？</div>
            <h3 className="howto-hero-lead">
              警察に捕まる前に、部下を操って
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
              DAILY LOOP // 1日の流れ（これを14日間くり返す）
            </div>
            <div className="howto-flow-strip">
              <div className="howto-flow-card">
                <div className="howto-flow-num mono-num">STEP 1</div>
                <div className="howto-flow-title">
                  <BriefcaseOpIcon size={15} />
                  <span>案件に人を送る</span>
                </div>
                <p className="howto-flow-desc">
                  街のピンか「案件一覧」からシノギを選び、誰に任せるか決める。
                </p>
              </div>
              <div className="howto-flow-arrow" aria-hidden="true">
                <ArrowRightIcon size={16} />
              </div>
              <div className="howto-flow-card">
                <div className="howto-flow-num mono-num">STEP 2</div>
                <div className="howto-flow-title">
                  <BurnerPhoneIcon size={15} />
                  <span>報告とニュースを見る</span>
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
                  <span>嘘を暴き、組織を守る</span>
                </div>
                <p className="howto-flow-desc">
                  ニュースと報告が矛盾したら <Term id="audit">裏取り調査</Term>
                  。資金回収や <Term id="cutoff">尻尾切り</Term> で立て直す。
                </p>
              </div>
            </div>
          </section>

          {/* The Core Dilemma — Direct vs Delegate */}
          <section className="howto-dilemma-grid">
            <div className="howto-dilemma-card direct">
              <div className="howto-dilemma-head">
                <Term id="direct_exec">直轄実行</Term>
                <span className="howto-dilemma-sub">自分で直接指示</span>
              </div>
              <p>
                報告は100%正確で中抜きなし。ただし失敗・摘発されると{' '}
                <Term id="t3_trace">T3捜査網</Term> が一気に跳ね上がる。
              </p>
            </div>
            <div className="howto-dilemma-card delegate">
              <div className="howto-dilemma-head">
                <Term id="delegate_exec">指示役へ委任</Term>
                <span className="howto-dilemma-sub">幹部経由で実行</span>
              </div>
              <p>
                警察の捜査線を大幅に遮断できる。しかし <Term id="info_fog">情報の霧</Term>{' '}
                がかかり、幹部による中抜きやトラブル隠蔽が紛れ込む。
              </p>
            </div>
          </section>

          <div className="howto-glossary-hint">
            点線つきの用語（<Term id="t3_trace">T3捜査網</Term> や{' '}
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
          <button
            type="button"
            className="btn-noir btn-amber howto-close-cta"
            onClick={onClose}
          >
            <span>理解した・作戦へ進む</span>
          </button>
        </div>
      </div>
    </div>
  );
};
