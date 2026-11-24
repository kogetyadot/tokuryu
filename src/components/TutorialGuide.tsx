import React from 'react';
import { Term } from './GlossaryTerm';
import { ArrowRightIcon, CheckIcon, CloseIcon } from './Icons';

export type TutorialStep = 1 | 2 | 3 | 4;

interface TutorialGuideProps {
  step: TutorialStep;
  onPrevStep: () => void;
  onAdvanceStep: () => void;
  onDismiss: () => void;
}

export const TutorialGuide: React.FC<TutorialGuideProps> = ({
  step,
  onPrevStep,
  onAdvanceStep,
  onDismiss,
}) => {
  const title =
    step === 1
      ? 'まずは1件、シノギに人を送ろう'
      : step === 2
      ? '時間を進めて「夜の清算」へ'
      : step === 3
      ? '報告とニュースの矛盾を「裏取り」'
      : '目標：14日間で ¥2,500万 稼いで逃げ切れ';

  const isFinal = step === 4;

  return (
    <aside
      className="noir-panel-sharp tutorial-guide interactive"
      aria-label="ミサキの戦術ナビ"
      data-testid="tutorial-guide"
    >
      <div className="tutorial-guide-inner">
        <div className="tutorial-portrait-wrap">
          <img
            src="./assets/portraits/misaki.jpg"
            alt="ミサキ"
            className="tutorial-portrait"
          />
          <span className="tutorial-live-dot" aria-hidden="true" />
        </div>

        <div className="tutorial-content">
          <div className="tutorial-top-meta">
            <div className="tutorial-comms-label mono-num">
              <span className="tutorial-comms-pulse" aria-hidden="true" />
              <span>LIVE COMMS // ミサキ</span>
            </div>

            <div className="tutorial-top-actions">
              <span className="tutorial-step-badge mono-num">
                STEP {step} / 4
              </span>
              <button
                type="button"
                className="tutorial-dismiss-btn"
                onClick={onDismiss}
                title="ガイドを閉じる（いつでも再表示可能）"
              >
                <CloseIcon size={11} />
                <span>閉じる</span>
              </button>
            </div>
          </div>

          <h4 className="tutorial-title">{title}</h4>
          <p className="tutorial-body">
            {step === 1 && (
              <>
                街のピンか右下の「案件一覧」から1件実行して。氷室に
                <Term id="delegate_exec">指示役へ委任</Term>
                すると<Term id="t3_trace">T3捜査網</Term>を抑えられるわ。
              </>
            )}
            {step === 2 && (
              <>
                現場が動き出したわ！上の「2×」で早送りするか、「夜へ進む」で今夜の決算と海湾ニュースを確認しましょう。
              </>
            )}
            {step === 3 && (
              <>
                報告が届いたら「暗号端末」を開いて。海湾ニュースと食い違いがあれば
                <Term id="audit">裏取り調査</Term>
                で中抜きや隠蔽を暴けるわ！
              </>
            )}
            {step === 4 && (
              <>
                <Term id="t3_trace">T3捜査網</Term>100%で逮捕、資金や
                <Term id="control">統制力</Term>
                が尽きても破滅よ。¥1,400万を超えたら早期
                <Term id="quiet_exit">雲隠れ</Term>も選べるわ！
              </>
            )}
          </p>

          <div className="tutorial-cta-row">
            {step > 1 && (
              <button
                type="button"
                className="tutorial-dismiss-btn"
                onClick={onPrevStep}
              >
                <span>← 前へ</span>
              </button>
            )}
            <button
              type="button"
              className={`btn-noir ${isFinal ? 'btn-amber' : 'btn-teal'} tutorial-next-btn`}
              onClick={isFinal ? onDismiss : onAdvanceStep}
            >
              {isFinal ? <CheckIcon size={14} /> : <ArrowRightIcon size={14} />}
              <span>{isFinal ? '了解・自由に運営する' : '次のステップ'}</span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};
