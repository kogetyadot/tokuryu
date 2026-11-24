import React from 'react';
import {
  AnonMaskIcon,
  AuditSearchIcon,
  BriefcaseOpIcon,
  BurnerPhoneIcon,
  CloseIcon,
  ExitDoorIcon,
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
              <div className="drawer-subtitle">
                FIELD MANUAL // 匿名・流動型組織の運営手引き
              </div>
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
          <div className="howto-panels-grid">
            {/* Panel 01 */}
            <section className="howto-panel">
              <div className="howto-panel-head">
                <span className="howto-step-num mono-num">01</span>
                <span className="howto-step-icon amber">
                  <BriefcaseOpIcon size={17} />
                </span>
                <h3 className="howto-panel-title">案件を回して裏資金を稼ぐ</h3>
              </div>

              <ul className="howto-bullet-list">
                <li>
                  街に浮かぶ <strong>案件ピン</strong> か右下の{' '}
                  <strong>案件一覧</strong> からシノギを選択。
                </li>
                <li>
                  <span className="howto-tag amber">直轄実行</span>
                  100%正確な報告だが摘発時に <strong>T3捜査網</strong> が急上昇。
                </li>
                <li>
                  <span className="howto-tag teal">指示役へ委任</span>
                  捜査線を大幅遮断できるが、配下に <strong>情報の霧</strong> がかかり{' '}
                  <strong>中抜き・隠蔽</strong> の危険が生じる。
                </li>
              </ul>
            </section>

            {/* Panel 02 */}
            <section className="howto-panel">
              <div className="howto-panel-head">
                <span className="howto-step-num mono-num">02</span>
                <span className="howto-step-icon teal">
                  <BurnerPhoneIcon size={17} />
                </span>
                <h3 className="howto-panel-title">
                  ニュースと報告の矛盾を「裏取り」
                </h3>
              </div>

              <ul className="howto-bullet-list">
                <li>
                  案件完了後、<strong>暗号端末</strong> に届く報告と画面下の{' '}
                  <strong>海湾ニュース</strong> を見比べよう。
                </li>
                <li>
                  「異常なし」の報告なのに警察通報の報道がある／金額が合わない時は{' '}
                  <span className="howto-inline-icon">
                    <AuditSearchIcon size={13} />
                    <strong>裏取り調査</strong>
                  </span>{' '}
                  を実行！
                </li>
                <li>
                  虚偽を暴けば <strong>資金回収・詰問・尻尾切り</strong> ができる。
                </li>
              </ul>
            </section>

            {/* Panel 03 */}
            <section className="howto-panel">
              <div className="howto-panel-head">
                <span className="howto-step-num mono-num">03</span>
                <span className="howto-step-icon crimson">
                  <ExitDoorIcon size={17} />
                </span>
                <h3 className="howto-panel-title">14日間の決着（勝利と破滅）</h3>
              </div>

              <ul className="howto-bullet-list">
                <li>
                  <span className="howto-tag teal">勝利</span>
                  14日以内に裏資金 <strong>¥2,500万</strong> で完全逃亡（
                  <strong>¥1,400万</strong> で早期 <strong>「雲隠れ」</strong> も可能）。
                </li>
                <li>
                  <span className="howto-tag crimson">
                    <SirenIcon size={12} />
                    破滅
                  </span>
                  <strong>T3捜査網 100%</strong>（一斉摘発）、
                  <strong>統制力崩壊</strong>（内部下剋上）、
                  <strong>資金ショート</strong>（空中分解）。
                </li>
              </ul>
            </section>
          </div>

          <div className="howto-controls-bar mono-num">
            <span>ドラッグ：街の視点回転</span>
            <span>ホイール / ピンチ：拡大縮小</span>
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
            <span>閉じる / 作戦に戻る</span>
          </button>
        </div>
      </div>
    </div>
  );
};
