import React from 'react';
import { ArrowRightIcon, CheckIcon, CloseIcon } from './Icons';

export type TutorialStep = 1 | 2 | 3 | 4;

interface TutorialGuideProps {
  step: TutorialStep;
  onAdvanceStep: () => void;
  onDismiss: () => void;
}

const STEP_COPY: Record<
  TutorialStep,
  {
    title: string;
    body: string;
    actionLabel?: string;
    isFinal?: boolean;
  }
> = {
  1: {
    title: '最初の案件を実行しよう',
    body: '街に浮かぶ黄金の「案件ピン」か、右下の「案件一覧」を押して1件動かして。氷室に「委任」すると捜査線を抑えられるわ。',
  },
  2: {
    title: '時間を進めて夜の清算へ',
    body: '現場が動き出したわ！上の「2×」で早送りするか、「夜へ進む」で今夜の決算と海湾ニュースを確認しましょう。',
  },
  3: {
    title: '暗号端末で報告とニュースを照合',
    body: '氷室などから報告が届いたら「暗号端末」を開いて。海湾ニュースと矛盾があれば「裏取り調査」で嘘を暴けるわ！',
    actionLabel: '次へ',
  },
  4: {
    title: '目標：14日以内に ¥2,500万 で逃げ切れ',
    body: '捜査網100%で一斉摘発、資金や統制が尽きても終了よ。¥1,400万を超えたら早期「雲隠れ」も選べるわ。健闘を祈る！',
    actionLabel: '了解・自由に運営する',
    isFinal: true,
  },
};

export const TutorialGuide: React.FC<TutorialGuideProps> = ({
  step,
  onAdvanceStep,
  onDismiss,
}) => {
  const info = STEP_COPY[step];

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
                title="ガイドを非表示にする"
              >
                <CloseIcon size={11} />
                <span>ガイド非表示</span>
              </button>
            </div>
          </div>

          <h4 className="tutorial-title">{info.title}</h4>
          <p className="tutorial-body">{info.body}</p>

          {info.actionLabel && (
            <div className="tutorial-cta-row">
              <button
                type="button"
                className={`btn-noir ${info.isFinal ? 'btn-amber' : 'btn-teal'} tutorial-next-btn`}
                onClick={info.isFinal ? onDismiss : onAdvanceStep}
              >
                {info.isFinal ? <CheckIcon size={14} /> : <ArrowRightIcon size={14} />}
                <span>{info.actionLabel}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
