import React, { useState } from 'react';
import { soundEngine } from '../audio/SoundEngine';
import { DOCTRINES, formatYen } from '../sim/districts';
import type { DoctrineId } from '../types/game';
import { Term } from './GlossaryTerm';
import {
  ArrowRightIcon,
  HelpIcon,
  VolumeOffIcon,
  VolumeOnIcon,
} from './Icons';

interface TitleScreenProps {
  selectedDoctrine: DoctrineId;
  onSelectDoctrine: (doctrine: DoctrineId) => void;
  onStartNewGame: (doctrine: DoctrineId) => void;
  hasSavedGame: boolean;
  onContinueGame: () => void;
  onOpenHowToPlay: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

type TitleStage = 'landing' | 'briefing';

interface DoctrineSpotlightMeta {
  indexLabel: string;
  shortIdentity: string;
  partnerName: string;
  partnerRole: string;
  partnerPortrait: string;
  partnerQuote: string;
  pips: {
    cash: number;
    anonymity: number;
    control: number;
    audit: number;
  };
  summaryValues: {
    cash: string;
    anonymity: string;
    control: string;
    audit: string;
  };
}

const DOCTRINE_ORDER: DoctrineId[] = [
  'ghost_architect',
  'neon_fixer',
  'ruthless_broker',
];

const DOCTRINE_SPOTLIGHT: Record<DoctrineId, DoctrineSpotlightMeta> = {
  ghost_architect: {
    indexLabel: '01',
    shortIdentity: '影から多重委任で操る',
    partnerName: 'ミサキ',
    partnerRole: '情報・暗号担当',
    partnerPortrait: './assets/portraits/misaki.jpg',
    partnerQuote:
      '「痕跡を残さないのが鉄則。直轄は最小限にして、氷室のライン越しに街を回しましょう。」',
    pips: {
      cash: 3,
      anonymity: 5,
      control: 3,
      audit: 5,
    },
    summaryValues: {
      cash: formatYen(DOCTRINES.ghost_architect.startingCash),
      anonymity: `捜査線 ${DOCTRINES.ghost_architect.startingTrace}%`,
      control: `${DOCTRINES.ghost_architect.startingControl}% / 3枠`,
      audit: `${formatYen(DOCTRINES.ghost_architect.auditCost)} (最安)`,
    },
  },
  neon_fixer: {
    indexLabel: '02',
    shortIdentity: '人脈と統制で押し切る',
    partnerName: 'レナ',
    partnerRole: '歓楽街スカウト統括',
    partnerPortrait: './assets/portraits/rena.jpg',
    partnerQuote:
      '「霞ヶ浜の夜はウチらの庭。直轄の連中で固めれば、裏切りなんて簡単には起きないよ。」',
    pips: {
      cash: 2,
      anonymity: 2,
      control: 5,
      audit: 3,
    },
    summaryValues: {
      cash: formatYen(DOCTRINES.neon_fixer.startingCash),
      anonymity: `捜査線 ${DOCTRINES.neon_fixer.startingTrace}%`,
      control: `${DOCTRINES.neon_fixer.startingControl}% / 5枠`,
      audit: formatYen(DOCTRINES.neon_fixer.auditCost),
    },
  },
  ruthless_broker: {
    indexLabel: '03',
    shortIdentity: '潤沢な資金で使い捨てる',
    partnerName: '黒田',
    partnerRole: '外部ブローカー',
    partnerPortrait: './assets/portraits/kuroda.jpg',
    partnerQuote:
      '「綺麗な理念は腹の足しにならん。札束でコマを買い、用済みになったら切り捨てるだけだ。」',
    pips: {
      cash: 5,
      anonymity: 3,
      control: 2,
      audit: 2,
    },
    summaryValues: {
      cash: formatYen(DOCTRINES.ruthless_broker.startingCash),
      anonymity: `捜査線 ${DOCTRINES.ruthless_broker.startingTrace}%`,
      control: `${DOCTRINES.ruthless_broker.startingControl}% / 4枠`,
      audit: formatYen(DOCTRINES.ruthless_broker.auditCost),
    },
  },
};

const PipMeter: React.FC<{
  label: string;
  filled: number;
  tone: 'amber' | 'teal' | 'crimson';
  valueLabel: string;
}> = ({ label, filled, tone, valueLabel }) => {
  return (
    <div className="pip-stat-row">
      <span className="pip-stat-label">{label}</span>
      <div className={`pip-bars tone-${tone}`} aria-label={`${label}: ${filled}/5`}>
        {[1, 2, 3, 4, 5].map((idx) => (
          <span
            key={idx}
            className={`pip-seg${idx <= filled ? ' filled' : ''}`}
          />
        ))}
      </div>
      <span className="pip-stat-value mono-num">{valueLabel}</span>
    </div>
  );
};

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedDoctrine,
  onSelectDoctrine,
  onStartNewGame,
  hasSavedGame,
  onContinueGame,
  onOpenHowToPlay,
  muted,
  onToggleMute,
}) => {
  const [stage, setStage] = useState<TitleStage>('landing');
  const [videoError, setVideoError] = useState(false);

  const activeCfg = DOCTRINES[selectedDoctrine];
  const activeMeta = DOCTRINE_SPOTLIGHT[selectedDoctrine];

  if (stage === 'landing') {
    return (
      <div
        className="title-screen title-stage-landing"
        data-testid="title-screen"
      >
        {/* Full-bleed AAA animated motion key art backdrop */}
        {!videoError ? (
          <video
            className="title-keyart-bg"
            src="./assets/video/title_loop.mp4"
            poster="./assets/title_keyart.jpg"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
            onError={() => setVideoError(true)}
            data-testid="title-motion-video"
          />
        ) : (
          <img
            src="./assets/title_keyart.jpg"
            alt=""
            className="title-keyart-bg"
            aria-hidden="true"
          />
        )}
        <div className="title-keyart-scrim" aria-hidden="true" />
        <div className="title-edge-slash" aria-hidden="true" />

        <div className="title-landing-shell">
          {/* Top bar: subtle edition/audio indicator */}
          <div className="title-landing-topbar">
            <div className="title-eyebrow-lock">
              <span className="title-eyebrow-bar" aria-hidden="true" />
              <span className="title-eyebrow mono-num">
                KAIWAN METROPOLITAN UNDERWORLD
              </span>
            </div>

            <button
              type="button"
              className="title-corner-sound mono-num"
              onClick={onToggleMute}
              aria-label={muted ? '音声を有効にする' : '音声をミュートにする'}
            >
              {muted ? <VolumeOffIcon size={14} /> : <VolumeOnIcon size={14} />}
              <span>{muted ? 'AUDIO OFF' : 'AUDIO ON'}</span>
            </button>
          </div>

          {/* Left-aligned flagship commercial title + vertical menu */}
          <div className="title-landing-core">
            <div className="title-cinema-lockup">
              <div className="title-wordmark-row">
                <h1 className="title-kanji-hero">トクリュウ</h1>
                <span className="title-vertical-stamp" aria-hidden="true">
                  匿名・流動
                </span>
              </div>
              <div className="title-sub-gold mono-num">
                ANONYMOUS · FLUID · SYNDICATE
              </div>
              <p className="title-cinema-tagline">
                顔のない元締めとして、14日間の裏社会を操れ。
              </p>
            </div>

            <nav
              className="title-main-menu"
              aria-label="タイトルメインメニュー"
            >
              <button
                type="button"
                className="title-menu-btn primary"
                onMouseEnter={() => soundEngine.playHover()}
                onClick={() => {
                  soundEngine.unlock();
                  soundEngine.playClick();
                  setStage('briefing');
                }}
              >
                <span className="menu-slash" aria-hidden="true" />
                <span className="menu-en mono-num">NEW GAME</span>
                <span className="menu-jp">新規作戦を開始</span>
              </button>

              {hasSavedGame && (
                <button
                  type="button"
                  className="title-menu-btn"
                  onMouseEnter={() => soundEngine.playHover()}
                  onClick={onContinueGame}
                >
                  <span className="menu-slash" aria-hidden="true" />
                  <span className="menu-en mono-num">CONTINUE</span>
                  <span className="menu-jp">前回の続きから</span>
                </button>
              )}

              <button
                type="button"
                className="title-menu-btn"
                onMouseEnter={() => soundEngine.playHover()}
                onClick={() => {
                  soundEngine.unlock();
                  soundEngine.playClick();
                  onOpenHowToPlay();
                }}
              >
                <span className="menu-slash" aria-hidden="true" />
                <span className="menu-en mono-num">HOW TO PLAY</span>
                <span className="menu-jp">遊び方ガイド</span>
              </button>

              <button
                type="button"
                className="title-menu-btn"
                onMouseEnter={() => soundEngine.playHover()}
                onClick={onToggleMute}
              >
                <span className="menu-slash" aria-hidden="true" />
                <span className="menu-en mono-num">SOUND</span>
                <span className="menu-jp">
                  {muted ? 'OFF（消音中）' : 'ON（サウンド有効）'}
                </span>
              </button>
            </nav>
          </div>

          {/* Subtle edition footer */}
          <footer className="title-edition-footer mono-num">
            14-DAY SYNDICATE SIMULATION // LYRIA 3.5 ADAPTIVE SCORE
          </footer>
        </div>
      </div>
    );
  }

  // Stage 2: Briefing (Cinematic Mastermind Persona Selection over live 3D twilight city)
  return (
    <div
      className="title-screen title-stage-briefing"
      data-testid="briefing-screen"
    >
      <div className="briefing-topbar">
        <div className="briefing-heading-group">
          <div className="briefing-en-eyebrow mono-num">
            SELECT DOCTRINE // 01–03
          </div>
          <h2 className="briefing-title">組織の運営方針を選ぶ</h2>
        </div>

        <div className="briefing-top-actions">
          <button
            type="button"
            className="btn-noir briefing-ghost-btn"
            onClick={() => {
              soundEngine.playClick();
              onOpenHowToPlay();
            }}
          >
            <HelpIcon size={15} />
            <span>遊び方ガイド</span>
          </button>

          <button
            type="button"
            className="btn-noir briefing-back-btn"
            onClick={() => {
              soundEngine.playClick();
              setStage('landing');
            }}
          >
            <span>← タイトルへ戻る</span>
          </button>
        </div>
      </div>

      <div className="briefing-dossier-layout">
        {/* Left Column: 3 Bold Numbered Persona Tabs */}
        <div
          className="briefing-tabs-col"
          role="radiogroup"
          aria-label="組織運営方針"
        >
          {DOCTRINE_ORDER.map((docId) => {
            const cfg = DOCTRINES[docId];
            const meta = DOCTRINE_SPOTLIGHT[docId];
            const isSelected = selectedDoctrine === docId;

            return (
              <button
                key={docId}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`briefing-tab${isSelected ? ' selected' : ''}`}
                onMouseEnter={() => soundEngine.playHover()}
                onClick={() => onSelectDoctrine(docId)}
              >
                <span className="briefing-tab-num mono-num">
                  {meta.indexLabel}
                </span>
                <div className="briefing-tab-text">
                  <div className="briefing-tab-name">{cfg.name}</div>
                  <div className="briefing-tab-identity">
                    {meta.shortIdentity}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right Column: Rich Dossier Spotlight Card */}
        <section
          className="noir-panel-sharp briefing-spotlight-card"
          aria-label={`${activeCfg.name} 詳細`}
        >
          <div className="spotlight-header">
            <div>
              <div className="spotlight-en mono-num">{activeCfg.english}</div>
              <h3 className="spotlight-name">{activeCfg.name}</h3>
              <p className="spotlight-tagline">{activeCfg.tagline}</p>
            </div>
            <div className="spotlight-stamp mono-num">
              DOCTRINE {activeMeta.indexLabel}
            </div>
          </div>

          <div className="spotlight-partner-box">
            <img
              src={activeMeta.partnerPortrait}
              alt={activeMeta.partnerName}
              className="spotlight-portrait"
            />
            <div className="spotlight-partner-text">
              <div className="spotlight-partner-meta">
                <span className="spotlight-partner-badge mono-num">
                  KEY PARTNER
                </span>
                <strong className="spotlight-partner-name">
                  {activeMeta.partnerName}
                </strong>
                <span className="spotlight-partner-role">
                  {activeMeta.partnerRole}
                </span>
              </div>
              <p className="spotlight-quote">{activeMeta.partnerQuote}</p>
            </div>
          </div>

          <div className="spotlight-pips-grid">
            <PipMeter
              label="初期資金"
              filled={activeMeta.pips.cash}
              tone="amber"
              valueLabel={activeMeta.summaryValues.cash}
            />
            <PipMeter
              label="匿名性"
              filled={activeMeta.pips.anonymity}
              tone="teal"
              valueLabel={activeMeta.summaryValues.anonymity}
            />
            <PipMeter
              label="組織統制"
              filled={activeMeta.pips.control}
              tone="teal"
              valueLabel={activeMeta.summaryValues.control}
            />
            <PipMeter
              label="裏取り精度"
              filled={activeMeta.pips.audit}
              tone="crimson"
              valueLabel={activeMeta.summaryValues.audit}
            />
          </div>

          <div className="spotlight-tradeoff-note">
            <span>{activeCfg.tradeoff}</span>
            <span className="inline-term-strip" style={{ marginLeft: 8 }}>
              <Term id="info_fog">情報の霧</Term>
              <Term id="t3_trace">T3捜査網</Term>
              <Term id="audit">裏取り調査</Term>
            </span>
          </div>

          <div className="spotlight-goal-callout">
            <span className="goal-badge mono-num">MISSION OBJECTIVE</span>
            <span className="goal-text">
              目標：14日以内に<Term id="cash">裏資金</Term> <strong>¥2,500万</strong> を築き逃げ切る
            </span>
          </div>

          <div className="spotlight-cta-row">
            <button
              type="button"
              className="btn-noir btn-amber briefing-infiltrate-cta"
              onClick={() => onStartNewGame(selectedDoctrine)}
            >
              <span>海湾市へ潜入する</span>
              <ArrowRightIcon size={17} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
