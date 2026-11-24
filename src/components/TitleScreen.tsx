import React from 'react';
import { soundEngine } from '../audio/SoundEngine';
import { DOCTRINES, formatYen } from '../sim/districts';
import type { DoctrineId } from '../types/game';
import {
  AnonMaskIcon,
  ArrowRightIcon,
  VolumeOffIcon,
  VolumeOnIcon,
} from './Icons';

interface TitleScreenProps {
  selectedDoctrine: DoctrineId;
  onSelectDoctrine: (doctrine: DoctrineId) => void;
  onStartNewGame: (doctrine: DoctrineId) => void;
  hasSavedGame: boolean;
  onContinueGame: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

const DOCTRINE_ORDER: DoctrineId[] = [
  'ghost_architect',
  'neon_fixer',
  'ruthless_broker',
];

const DOCTRINE_SHORT_TRAIT: Record<DoctrineId, string> = {
  ghost_architect: '初動捜査線6%・裏取り最安¥15万 / 直轄枠3名で多重委任が軸',
  neon_fixer: '直轄枠5名・統制72%・初日レナ合流 / 捜査線14%・資金少',
  ruthless_broker: '初期資金¥800万・外注優遇 / 統制48%・幹部中抜きに注意',
};

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedDoctrine,
  onSelectDoctrine,
  onStartNewGame,
  hasSavedGame,
  onContinueGame,
  muted,
  onToggleMute,
}) => {
  return (
    <div className="title-screen" data-testid="title-screen">
      <div className="title-top-bar">
        <div className="title-classification">
          <AnonMaskIcon size={15} />
          <span>CASE FILE // KAIWAN METROPOLITAN UNDERWORLD</span>
        </div>

        <button
          type="button"
          className="btn-noir hud-icon-btn title-sound-btn"
          onClick={onToggleMute}
          aria-label={muted ? '音声を有効にする' : '音声をミュートにする'}
        >
          {muted ? <VolumeOffIcon size={16} /> : <VolumeOnIcon size={16} />}
          <span>{muted ? 'MUTE' : 'SOUND ON'}</span>
        </button>
      </div>

      <div className="title-hero-grid">
        <div className="title-lockup">
          <div className="title-stamp-badge">
            <span>極秘案件 // 海湾市</span>
          </div>
          <h1 className="title-main-kanji">『トクリュウ』</h1>
          <div className="title-sub-en">ANONYMOUS · FLUID · SYNDICATE</div>
        </div>

        <div className="doctrine-grid" role="radiogroup" aria-label="組織運営方針">
          {DOCTRINE_ORDER.map((docId) => {
            const cfg = DOCTRINES[docId];
            const isSelected = selectedDoctrine === docId;
            return (
              <button
                key={docId}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`doctrine-card${isSelected ? ' selected' : ''}`}
                onMouseEnter={() => soundEngine.playHover()}
                onClick={() => onSelectDoctrine(docId)}
              >
                <div className="doctrine-head">
                  <span className="doctrine-name">{cfg.name}</span>
                  <span className="doctrine-cash mono-num">
                    {formatYen(cfg.startingCash)}
                  </span>
                </div>
                <div className="doctrine-trait">{DOCTRINE_SHORT_TRAIT[docId]}</div>
                <div className="doctrine-stats-row mono-num">
                  <span>直轄枠 {cfg.directCapacity}名</span>
                  <span>捜査線 {cfg.startingTrace}%</span>
                  <span>統制 {cfg.startingControl}%</span>
                  <span>裏取り {formatYen(cfg.auditCost)}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="title-actions-row">
          <button
            type="button"
            className="btn-noir btn-amber title-cta"
            onClick={() => onStartNewGame(selectedDoctrine)}
          >
            <span>運営を開始する</span>
            <ArrowRightIcon size={17} />
          </button>

          {hasSavedGame && (
            <button
              type="button"
              className="btn-noir btn-teal"
              style={{ minHeight: 48, padding: '12px 20px', fontSize: 13.5 }}
              onClick={onContinueGame}
            >
              <span>続きから再開</span>
            </button>
          )}
        </div>
      </div>

      <div className="title-footer-hint">
        KAIWAN BAY SECTOR // 14-DAY SYNDICATE SIMULATION · TARGET ¥2,500万
      </div>
    </div>
  );
};
