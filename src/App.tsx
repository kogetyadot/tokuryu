import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundEngine } from './audio/SoundEngine';
import { CrewPanel } from './components/CrewPanel';
import { EveningReportModal } from './components/EveningReportModal';
import {
  ArrowRightIcon,
  BriefcaseOpIcon,
  BurnerPhoneIcon,
  CloseIcon,
  CrewIcon,
} from './components/Icons';
import { HowToPlayModal } from './components/HowToPlayModal';
import {
  LiveActionOverlay,
  type OutcomeToastData,
} from './components/LiveActionOverlay';
import { NewsTicker } from './components/NewsTicker';
import { OperationDrawer } from './components/OperationDrawer';
import { PhoneInbox } from './components/PhoneInbox';
import { ResultDossier } from './components/ResultDossier';
import { TitleScreen } from './components/TitleScreen';
import { TopHud } from './components/TopHud';
import { TutorialGuide, type TutorialStep } from './components/TutorialGuide';
import { CityScene } from './scene/CityScene';
import { formatYen } from './sim/districts';
import {
  advanceToNextBeat,
  auditCharacter,
  auditMessage,
  confrontCharacter,
  createInitialState,
  cutOffCharacter,
  dispatchOperation,
  giveBonus,
  markMessageRead,
  proceedToNextDay,
  promoteToCoordinator,
  reassignSupervisor,
  recruitFluidOperative,
  resolveMessageChoice,
  setSpeed,
  skipToEvening,
  startNewGame,
  tickSimulation,
  triggerQuietExit,
} from './sim/engine';
import type { DistrictId, DoctrineId, GameState, PayPolicy } from './types/game';

const SAVE_STORAGE_KEY = 'tokuryu_save_v1';
const TUTORIAL_DONE_STORAGE_KEY = 'tokuryu_tutorial_done_v1';

type ActiveDrawer = 'ops' | 'phone' | 'crew' | null;

function formatCompactTitle(title: string): string {
  const clean = title.replace(/^【.*?】/, '');
  return clean.length > 9 ? `${clean.slice(0, 9)}…` : clean;
}

function loadSavedState(): GameState | null {
  try {
    const raw = window.localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (
      parsed &&
      typeof parsed.day === 'number' &&
      Array.isArray(parsed.characters) &&
      Array.isArray(parsed.operations) &&
      parsed.districts &&
      parsed.phase !== 'title'
    ) {
      return parsed;
    }
  } catch {
    // Ignore corrupted storage
  }
  return null;
}

export default function App() {
  const [selectedDoctrine, setSelectedDoctrine] =
    useState<DoctrineId>('ghost_architect');
  const [gameState, setGameState] = useState<GameState>(() =>
    createInitialState('ghost_architect')
  );
  const [hasSavedGame, setHasSavedGame] = useState<boolean>(() =>
    Boolean(loadSavedState())
  );

  const [activeDrawer, setActiveDrawer] = useState<ActiveDrawer>(null);
  const [howToPlayOpen, setHowToPlayOpen] = useState<boolean>(false);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictId | null>(null);
  const [selectedOpId, setSelectedOpId] = useState<string | null>(null);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [showNetworkArcs, setShowNetworkArcs] = useState<boolean>(true);
  const [muted, setMuted] = useState<boolean>(false);
  const [autoPaused, setAutoPaused] = useState<boolean>(false);
  const [outcomeToast, setOutcomeToast] = useState<OutcomeToastData | null>(null);
  const [cashPulseKey, setCashPulseKey] = useState<number>(0);
  const [tracePulseKey, setTracePulseKey] = useState<number>(0);

  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<CityScene | null>(null);
  const pinElementsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const savedSpeedBeforeOverlayRef = useRef<0 | 1 | 2 | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const toastSeqRef = useRef<number>(1);
  const prevSnapshotRef = useRef<{
    phase: GameState['phase'];
    msgIds: Set<string>;
    activeOpIds: Set<string>;
    cash: number;
    policeTrace: number;
  } | null>(null);

  const showOutcomeToast = useCallback(
    (kind: OutcomeToastData['kind'], title: string, detail: string) => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      const id = toastSeqRef.current++;
      setOutcomeToast({ id, kind, title, detail });
      toastTimerRef.current = window.setTimeout(() => {
        setOutcomeToast((curr) => (curr?.id === id ? null : curr));
        toastTimerRef.current = null;
      }, 3200);
    },
    []
  );

  // Initialize 3D CityScene once on mount
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const scene = new CityScene(container, {
      onSelectDistrict: (districtId) => {
        soundEngine.playClick();
        setSelectedDistrict(districtId);
        setSelectedOpId(null);
        scene.focusDistrict(districtId);
      },
      onSelectOperation: (opId) => {
        soundEngine.playClick();
        setSelectedOpId(opId);
        setActiveDrawer('ops');
      },
      onClearSelection: () => {
        setSelectedDistrict(null);
        setSelectedOpId(null);
      },
    });

    sceneRef.current = scene;
    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Push latest state & selection into 3D scene
  useEffect(() => {
    sceneRef.current?.updateState(
      gameState,
      selectedDistrict,
      selectedOpId,
      showNetworkArcs
    );
  }, [gameState, selectedDistrict, selectedOpId, showNetworkArcs]);

  // Unlock audio on first user interaction anywhere (so Title BGM begins immediately)
  useEffect(() => {
    const unlockOnce = () => {
      soundEngine.unlock();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    window.addEventListener('keydown', unlockOnce, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, []);

  // Auto-pause time while player reads/operates a drawer or guide, then resume prior speed on close
  const overlayOpen = activeDrawer !== null || howToPlayOpen;
  useEffect(() => {
    if (gameState.phase !== 'playing') {
      savedSpeedBeforeOverlayRef.current = null;
      setAutoPaused(false);
      return;
    }

    if (overlayOpen) {
      setGameState((curr) => {
        if (curr.phase === 'playing' && curr.speed > 0) {
          savedSpeedBeforeOverlayRef.current = curr.speed;
          setAutoPaused(true);
          return setSpeed(curr, 0);
        }
        return curr;
      });
    } else if (savedSpeedBeforeOverlayRef.current !== null) {
      const restore = savedSpeedBeforeOverlayRef.current;
      savedSpeedBeforeOverlayRef.current = null;
      setAutoPaused(false);
      setGameState((curr) =>
        curr.phase === 'playing' && curr.speed === 0 ? setSpeed(curr, restore) : curr
      );
    }
  }, [overlayOpen, gameState.phase]);

  // Sync audio tension & detect state transitions for automatic SFX, 3D juice & live outcome toasts
  useEffect(() => {
    soundEngine.setTension(gameState.policeTrace, gameState.phase);

    const prev = prevSnapshotRef.current;
    if (prev && gameState.phase !== 'title') {
      // Detect newly resolved operations (active -> completed / failed / busted)
      const justResolved = gameState.operations.filter(
        (o) => prev.activeOpIds.has(o.id) && o.status !== 'active'
      );
      if (justResolved.length > 0 && gameState.phase === 'playing') {
        const op = justResolved[0];
        const outcome = op.actualOutcome;
        if (op.status === 'completed') {
          const shownGain = outcome ? outcome.reportedProfit : Math.max(0, gameState.cash - prev.cash);
          sceneRef.current?.triggerOutcomeJuice(op.districtId, 'success');
          showOutcomeToast(
            'success',
            `${op.title.slice(0, 14)}${op.title.length > 14 ? '…' : ''} 完了`,
            `報告収益 +${formatYen(shownGain)}`
          );
          setCashPulseKey((k) => k + 1);
        } else if (op.status === 'busted') {
          sceneRef.current?.triggerOutcomeJuice(op.districtId, 'busted');
          showOutcomeToast(
            'busted',
            '現場が摘発された！',
            `${op.title.slice(0, 16)} · T3捜査網上昇`
          );
          setTracePulseKey((k) => k + 1);
        } else {
          sceneRef.current?.triggerOutcomeJuice(op.districtId, 'alert');
          showOutcomeToast(
            'alert',
            '作戦失敗・撤収',
            outcome?.summary ?? op.title
          );
        }
      }

      // Detect newly arrived messages
      const newlyArrived = gameState.messages.filter((m) => !prev.msgIds.has(m.id));
      if (newlyArrived.length > 0 && gameState.phase === 'playing') {
        const anyUrgent = newlyArrived.some((m) => m.isUrgent);
        soundEngine.playMessagePing(anyUrgent);
      }

      // Phase changes
      if (prev.phase !== 'evening' && gameState.phase === 'evening') {
        soundEngine.playNewsJingle();
      } else if (prev.phase !== 'ended' && gameState.phase === 'ended') {
        if (
          gameState.ending?.id === 't3_takedown' ||
          gameState.ending?.id === 'internal_coup' ||
          gameState.ending?.id === 'bankrupt'
        ) {
          soundEngine.playAlert();
        } else {
          soundEngine.playStamp();
        }
      }

      // Large cash jump from completed op or reclaim
      if (gameState.cash > prev.cash + 150_000 && gameState.phase === 'playing') {
        soundEngine.playCash(true);
        if (justResolved.length === 0) {
          setCashPulseKey((k) => k + 1);
        }
      }

      // Sudden police trace spike
      if (gameState.policeTrace - prev.policeTrace >= 8) {
        soundEngine.playAlert();
        setTracePulseKey((k) => k + 1);
        if (justResolved.length === 0) {
          sceneRef.current?.triggerOutcomeJuice(null, 'alert');
        }
      }
    }

    prevSnapshotRef.current = {
      phase: gameState.phase,
      msgIds: new Set(gameState.messages.map((m) => m.id)),
      activeOpIds: new Set(
        gameState.operations.filter((o) => o.status === 'active').map((o) => o.id)
      ),
      cash: gameState.cash,
      policeTrace: gameState.policeTrace,
    };
  }, [gameState, showOutcomeToast]);

  // Auto-save progress to localStorage (throttled: immediate on key structural changes, else >=2000ms)
  const lastSavedAtRef = useRef<number>(0);
  const lastSaveSigRef = useRef<string>('');
  useEffect(() => {
    if (gameState.phase === 'playing' || gameState.phase === 'evening') {
      const sig = `${gameState.day}|${gameState.phase}|${gameState.operations.length}|${gameState.messages.length}|${gameState.characters.length}`;
      const now = Date.now();
      const structuralChanged = sig !== lastSaveSigRef.current;
      if (structuralChanged || now - lastSavedAtRef.current >= 2000) {
        try {
          window.localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(gameState));
          lastSaveSigRef.current = sig;
          lastSavedAtRef.current = now;
          setHasSavedGame(true);
        } catch {
          // Ignore storage quota issues
        }
      }
    } else if (gameState.phase === 'ended') {
      lastSaveSigRef.current = '';
      try {
        window.localStorage.removeItem(SAVE_STORAGE_KEY);
        setHasSavedGame(false);
      } catch {
        // Ignore
      }
    }
  }, [gameState]);

  // Simulation loop driven by requestAnimationFrame delta timer
  useEffect(() => {
    if (gameState.phase !== 'playing' || gameState.speed === 0) return;

    let rafId = 0;
    let lastMs = performance.now();
    let accSec = 0;

    const frame = (nowMs: number) => {
      const dtSec = Math.min((nowMs - lastMs) / 1000, 0.1);
      lastMs = nowMs;
      accSec += dtSec;

      if (accSec >= 0.08) {
        const stepSec = accSec;
        accSec = 0;
        setGameState((curr) => tickSimulation(curr, stepSec));
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [gameState.phase, gameState.speed]);

  // Keyboard shortcuts on desktop (Space pause/resume, 1/2 speed, Escape close drawer)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

      if (e.key === 'Escape') {
        if (howToPlayOpen) {
          soundEngine.playClick();
          setHowToPlayOpen(false);
        } else if (activeDrawer) {
          soundEngine.playClick();
          setActiveDrawer(null);
          setSelectedOpId(null);
        } else if (selectedDistrict) {
          setSelectedDistrict(null);
        }
        return;
      }

      if (gameState.phase !== 'playing' || howToPlayOpen) return;

      if (e.code === 'Space') {
        e.preventDefault();
        soundEngine.playClick();
        setGameState((curr) => setSpeed(curr, curr.speed === 0 ? 1 : 0));
      } else if (e.key === '1') {
        soundEngine.playClick();
        setGameState((curr) => setSpeed(curr, 1));
      } else if (e.key === '2') {
        soundEngine.playClick();
        setGameState((curr) => setSpeed(curr, 2));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDrawer, selectedDistrict, gameState.phase, howToPlayOpen]);

  const lastTutorialStepRef = useRef<TutorialStep>(1);

  const dismissTutorial = useCallback(() => {
    soundEngine.playClick();
    if (tutorialStep !== null) {
      lastTutorialStepRef.current = tutorialStep;
    }
    setTutorialStep(null);
    try {
      window.localStorage.setItem(TUTORIAL_DONE_STORAGE_KEY, '1');
    } catch {
      // Ignore storage failures
    }
  }, [tutorialStep]);

  const reopenTutorial = useCallback(() => {
    soundEngine.playClick();
    try {
      window.localStorage.removeItem(TUTORIAL_DONE_STORAGE_KEY);
    } catch {
      // Ignore storage failures
    }
    // Choose a helpful step matching current game progress if previously finished
    const hasActiveOrDoneOp = gameState.operations.some(
      (o) => o.status === 'active' || o.status === 'completed' || o.status === 'failed' || o.status === 'busted'
    );
    const hasReports = gameState.messages.some((m) => m.type === 'report');
    const inferredStep: TutorialStep = !hasActiveOrDoneOp
      ? 1
      : gameState.day === 1 && !hasReports
      ? 2
      : hasReports
      ? 3
      : lastTutorialStepRef.current;
    setTutorialStep(inferredStep);
    setHowToPlayOpen(false);
  }, [gameState.operations, gameState.messages, gameState.day]);

  // Auto-advance Tutorial Step 2 -> Step 3 when entering evening or Day 2
  useEffect(() => {
    if (tutorialStep === 2 && (gameState.phase === 'evening' || gameState.day >= 2)) {
      setTutorialStep(3);
    }
  }, [tutorialStep, gameState.phase, gameState.day]);

  // Auto-advance Tutorial Step 3 -> Step 4 when player opens Encrypted Phone Terminal
  useEffect(() => {
    if (tutorialStep === 3 && activeDrawer === 'phone') {
      setTutorialStep(4);
    }
  }, [tutorialStep, activeDrawer]);

  // Handlers
  const handleToggleMute = useCallback(() => {
    soundEngine.unlock();
    const nextMuted = !muted;
    soundEngine.setMuted(nextMuted);
    setMuted(nextMuted);
    if (!nextMuted) soundEngine.playClick();
  }, [muted]);

  const handleSelectDoctrine = useCallback((doctrine: DoctrineId) => {
    soundEngine.unlock();
    soundEngine.playClick();
    setSelectedDoctrine(doctrine);
    setGameState(createInitialState(doctrine));
  }, []);

  const handleStartNewGame = useCallback((doctrine: DoctrineId) => {
    soundEngine.unlock();
    soundEngine.playDispatch();
    let tutorialDone = false;
    try {
      tutorialDone = window.localStorage.getItem(TUTORIAL_DONE_STORAGE_KEY) === '1';
    } catch {
      tutorialDone = false;
    }

    const baseStart = startNewGame(doctrine);
    // Briefly pause on Day 1 arrival if first-time guided orientation is active
    const next = tutorialDone ? baseStart : setSpeed(baseStart, 0);

    prevSnapshotRef.current = {
      phase: next.phase,
      msgIds: new Set(next.messages.map((m) => m.id)),
      activeOpIds: new Set(),
      cash: next.cash,
      policeTrace: next.policeTrace,
    };
    setGameState(next);
    setTutorialStep(tutorialDone ? null : 1);
    setHowToPlayOpen(false);
    setActiveDrawer(null);
    setSelectedDistrict(null);
    setSelectedOpId(null);
    setFocusedMessageId(null);
    setOutcomeToast(null);
    sceneRef.current?.resetCamera();
  }, []);

  const handleContinueGame = useCallback(() => {
    soundEngine.unlock();
    const saved = loadSavedState();
    if (!saved) {
      soundEngine.playError();
      return;
    }
    soundEngine.playDispatch();
    prevSnapshotRef.current = {
      phase: saved.phase,
      msgIds: new Set(saved.messages.map((m) => m.id)),
      activeOpIds: new Set(
        saved.operations.filter((o) => o.status === 'active').map((o) => o.id)
      ),
      cash: saved.cash,
      policeTrace: saved.policeTrace,
    };
    setSelectedDoctrine(saved.doctrine);
    setGameState(saved);
    setTutorialStep(null);
    setHowToPlayOpen(false);
    setActiveDrawer(null);
    setSelectedDistrict(null);
    setSelectedOpId(null);
    setOutcomeToast(null);
  }, []);

  const handleDispatch = useCallback(
    (opId: string, leadId: string, subId: string | null, payPolicy: PayPolicy) => {
      let dispatchedOk = false;
      setGameState((curr) => {
        const next = dispatchOperation(curr, opId, leadId, subId, payPolicy);
        if (next !== curr) {
          dispatchedOk = true;
          soundEngine.playDispatch();
          const op = next.operations.find((o) => o.id === opId);
          const lead = next.characters.find((c) => c.id === leadId);
          if (op) {
            sceneRef.current?.triggerDispatchJuice(
              op.districtId,
              lead?.tier === 'coordinator'
            );
          }
          const resumeSpeed = savedSpeedBeforeOverlayRef.current ?? 1;
          savedSpeedBeforeOverlayRef.current = null;
          setAutoPaused(false);
          return next.speed === 0 ? setSpeed(next, resumeSpeed) : next;
        } else {
          soundEngine.playError();
        }
        return next;
      });
      if (dispatchedOk || tutorialStep === 1) {
        setTutorialStep((prev) => (prev === 1 ? 2 : prev));
      }
      setSelectedOpId(null);
      setActiveDrawer(null);
    },
    [tutorialStep]
  );

  const handleAdvanceBeat = useCallback(() => {
    soundEngine.unlock();
    soundEngine.playClick();
    setGameState((curr) => advanceToNextBeat(curr));
  }, []);

  const handleAuditMessage = useCallback((msgId: string) => {
    setGameState((curr) => {
      const next = auditMessage(curr, msgId);
      if (next === curr) {
        soundEngine.playError();
        return curr;
      }
      const updated = next.messages.find((m) => m.id === msgId);
      if (updated?.containsLie) {
        soundEngine.playLieExposed();
      } else {
        soundEngine.playStamp();
      }
      return next;
    });
  }, []);

  const handleConfront = useCallback(
    (msgId: string, action: 'reclaim' | 'cut_off' | 'overlook') => {
      setGameState((curr) => {
        const next = confrontCharacter(curr, msgId, action);
        if (next === curr) {
          soundEngine.playError();
          return curr;
        }
        if (action === 'cut_off') {
          soundEngine.playAlert();
        } else if (action === 'reclaim') {
          soundEngine.playCash(true);
        } else {
          soundEngine.playClick();
        }
        return next;
      });
    },
    []
  );

  const handleResolveChoice = useCallback((msgId: string, choiceId: string) => {
    setGameState((curr) => {
      const next = resolveMessageChoice(curr, msgId, choiceId);
      if (next === curr) {
        soundEngine.playError();
        return curr;
      }
      soundEngine.playStamp();
      return next;
    });
  }, []);

  const handleRecruit = useCallback((supervisorId: string | null) => {
    setGameState((curr) => {
      const next = recruitFluidOperative(curr, supervisorId);
      if (next === curr) {
        soundEngine.playError();
        return curr;
      }
      soundEngine.playCash(false);
      return next;
    });
  }, []);

  const handleAuditCharacter = useCallback((charId: string) => {
    setGameState((curr) => {
      const next = auditCharacter(curr, charId);
      if (next === curr) {
        soundEngine.playError();
        return curr;
      }
      soundEngine.playStamp();
      return next;
    });
  }, []);

  const handlePromote = useCallback((charId: string) => {
    setGameState((curr) => {
      const next = promoteToCoordinator(curr, charId);
      if (next === curr) {
        soundEngine.playError();
        return curr;
      }
      soundEngine.playDispatch();
      return next;
    });
  }, []);

  const handleReassign = useCallback(
    (subId: string, newSupervisorId: string | null) => {
      setGameState((curr) => {
        const next = reassignSupervisor(curr, subId, newSupervisorId);
        if (next === curr) {
          soundEngine.playError();
          return curr;
        }
        soundEngine.playClick();
        return next;
      });
    },
    []
  );

  const handleGiveBonus = useCallback((charId: string, amount: number) => {
    setGameState((curr) => {
      const next = giveBonus(curr, charId, amount);
      if (next === curr) {
        soundEngine.playError();
        return curr;
      }
      soundEngine.playCash(false);
      return next;
    });
  }, []);

  const handleCutOff = useCallback((charId: string) => {
    setGameState((curr) => {
      const next = cutOffCharacter(curr, charId);
      if (next === curr) {
        soundEngine.playError();
        return curr;
      }
      soundEngine.playAlert();
      return next;
    });
  }, []);

  const selectedOp = useMemo(
    () =>
      selectedOpId
        ? gameState.operations.find((o) => o.id === selectedOpId) ?? null
        : null,
    [gameState.operations, selectedOpId]
  );

  const districtInfo = selectedDistrict
    ? gameState.districts[selectedDistrict]
    : null;
  const districtOps = useMemo(() => {
    if (!selectedDistrict) return [];
    return gameState.operations.filter(
      (o) =>
        o.districtId === selectedDistrict &&
        (o.status === 'available' || o.status === 'active')
    );
  }, [gameState.operations, selectedDistrict]);

  const unreadMessagesCount = useMemo(
    () => gameState.messages.filter((m) => !m.read).length,
    [gameState.messages]
  );
  const urgentMessagesCount = useMemo(
    () => gameState.messages.filter((m) => m.isUrgent && !m.resolved).length,
    [gameState.messages]
  );
  const availableOpsCount = useMemo(
    () => gameState.operations.filter((o) => o.status === 'available').length,
    [gameState.operations]
  );
  const foggedCrewCount = useMemo(
    () =>
      gameState.characters.filter(
        (c) =>
          c.isFogged && (c.status === 'idle' || c.status === 'on_mission')
      ).length,
    [gameState.characters]
  );

  const mapVisibleOps = useMemo(
    () =>
      gameState.operations.filter(
        (o) => o.status === 'available' || o.status === 'active'
      ),
    [gameState.operations]
  );

  const showFloatingPins =
    gameState.phase === 'playing' &&
    !howToPlayOpen &&
    activeDrawer === null;

  // Sync floating map operation pins directly via DOM transforms (ZERO 60fps React re-renders)
  useEffect(() => {
    if (!showFloatingPins) return;

    let rafId = 0;
    const syncPins = () => {
      const scene = sceneRef.current;
      if (scene) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const isMobile = vw <= 768;
        const topSafe = isMobile ? 104 : 68;
        const bottomSafe = isMobile
          ? activeDrawer
            ? vh * 0.36
            : tutorialStep !== null
            ? vh - 250
            : vh - 125
          : vh - 96;

        for (let i = 0; i < mapVisibleOps.length; i++) {
          const op = mapVisibleOps[i];
          const el = pinElementsRef.current[op.id];
          if (!el) continue;

          const projected = scene.projectWorldPoint(
            op.worldPos[0],
            3.2,
            op.worldPos[1]
          );
          const inSafeBand =
            projected.visible &&
            projected.y >= topSafe &&
            projected.y <= bottomSafe &&
            projected.x >= 44 &&
            projected.x <= vw - 44;

          if (!inSafeBand) {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
          } else {
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            el.style.transform = `translate3d(${projected.x.toFixed(1)}px, ${projected.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
          }
        }
      }
      rafId = requestAnimationFrame(syncPins);
    };

    rafId = requestAnimationFrame(syncPins);
    return () => cancelAnimationFrame(rafId);
  }, [showFloatingPins, mapVisibleOps, activeDrawer, tutorialStep]);

  return (
    <>
      {/* Full-viewport interactive 3D Kaiwan City canvas */}
      <div
        ref={canvasContainerRef}
        className="city-canvas-layer"
        aria-label="海湾市 3D シティマップ"
      />
      <div className="noir-vignette" />
      <div className="noir-film-overlay" />

      {/* Title Screen Overlay */}
      {gameState.phase === 'title' && (
        <TitleScreen
          selectedDoctrine={selectedDoctrine}
          onSelectDoctrine={handleSelectDoctrine}
          onStartNewGame={handleStartNewGame}
          hasSavedGame={hasSavedGame}
          onContinueGame={handleContinueGame}
          onOpenHowToPlay={() => setHowToPlayOpen(true)}
          muted={muted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Clickable 3D-Projected Floating Map Operation Pins */}
      {showFloatingPins && mapVisibleOps.length > 0 && (
        <div className="map-pins-layer" aria-label="マップ上の案件ピン">
          {mapVisibleOps.map((op, idx) => {
            const isActive = op.status === 'active';
            const isSelected = op.id === selectedOpId;
            const pulseFirstPin =
              tutorialStep === 1 && !isActive && idx === 0;
            const pct = Math.round(op.progress * 100);

            return (
              <button
                key={op.id}
                ref={(el) => {
                  pinElementsRef.current[op.id] = el;
                }}
                type="button"
                className={`map-op-pin ${isActive ? 'is-active' : 'is-available'}${
                  isSelected ? ' is-selected' : ''
                }${pulseFirstPin ? ' tutorial-pulse' : ''}`}
                style={{ opacity: 0, pointerEvents: 'none' }}
                onMouseEnter={() => soundEngine.playHover()}
                onClick={() => {
                  soundEngine.playClick();
                  setSelectedDistrict(op.districtId);
                  setSelectedOpId(op.id);
                  setActiveDrawer('ops');
                  sceneRef.current?.focusDistrict(op.districtId);
                }}
                title={`${op.title} (${isActive ? `実行中 ${pct}%` : formatYen(op.estimatedYield)})`}
              >
                <span className="map-pin-tag-body">
                  <span className="map-pin-dot" aria-hidden="true" />
                  {isActive ? (
                    <span className="map-pin-active-label mono-num">
                      実行中 {pct}%
                    </span>
                  ) : (
                    <>
                      <span className="map-pin-yield mono-num">
                        {formatYen(op.estimatedYield)}
                      </span>
                      <span className="map-pin-title hide-mobile">
                        {formatCompactTitle(op.title)}
                      </span>
                    </>
                  )}
                </span>
                <span className="map-pin-stem" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}

      {/* Main Playable HUD */}
      {gameState.phase !== 'title' && (
        <div className={`hud-root${activeDrawer !== null ? ' drawer-open' : ''}`}>
          <TopHud
            state={gameState}
            showNetworkArcs={showNetworkArcs}
            muted={muted}
            highlightSkipToEvening={tutorialStep === 2}
            autoPaused={autoPaused}
            cashPulseKey={cashPulseKey}
            tracePulseKey={tracePulseKey}
            onSetSpeed={(spd) => {
              soundEngine.playClick();
              savedSpeedBeforeOverlayRef.current = null;
              setAutoPaused(false);
              setGameState((curr) => setSpeed(curr, spd));
            }}
            onSkipToEvening={() => {
              soundEngine.playClick();
              setGameState((curr) => skipToEvening(curr));
            }}
            onToggleNetworkArcs={() => {
              soundEngine.playClick();
              setShowNetworkArcs((v) => !v);
            }}
            onResetCamera={() => {
              soundEngine.playClick();
              setSelectedDistrict(null);
              sceneRef.current?.resetCamera();
            }}
            onOpenHowToPlay={() => {
              soundEngine.playClick();
              setHowToPlayOpen(true);
            }}
            onToggleMute={handleToggleMute}
            onTriggerQuietExit={() => {
              soundEngine.playStamp();
              setGameState((curr) => triggerQuietExit(curr));
            }}
          />

          {/* Middle Layer: District Selection Pill (left) + Active Side Drawer (right) */}
          <div className="hud-middle">
            {districtInfo && (
              <section
                className="noir-panel-sharp district-pill interactive"
                aria-label={`${districtInfo.name} 地区情報`}
              >
                <div className="district-pill-head">
                  <div>
                    <div className="district-en">{districtInfo.englishName}</div>
                    <h3 className="district-name">{districtInfo.name}</h3>
                  </div>
                  <button
                    type="button"
                    className="drawer-close-btn"
                    onClick={() => setSelectedDistrict(null)}
                    aria-label="地区選択を閉じる"
                  >
                    <CloseIcon size={14} />
                  </button>
                </div>

                <p className="district-tagline">{districtInfo.tagline}</p>

                <div className="district-stats-mini">
                  <div className="district-stat-cell">
                    <span>警察警戒</span>
                    <span
                      style={{
                        color:
                          districtInfo.heat >= 60
                            ? 'var(--crimson-bright)'
                            : 'var(--cream)',
                      }}
                    >
                      {Math.round(districtInfo.heat)}%
                    </span>
                  </div>
                  <div className="district-stat-cell">
                    <span>治安荒廃</span>
                    <span>{Math.round(districtInfo.decay)}%</span>
                  </div>
                  <div className="district-stat-cell">
                    <span>組織影響力</span>
                    <span style={{ color: 'var(--amber-bright)' }}>
                      {Math.round(districtInfo.influence)}%
                    </span>
                  </div>
                </div>

                <div className="district-ops-chips">
                  {districtOps.length === 0 ? (
                    <div style={{ fontSize: 11, color: 'var(--cream-faint)' }}>
                      現在この地区で稼働・発生中の案件はありません。
                    </div>
                  ) : (
                    districtOps.map((op) => (
                      <button
                        key={op.id}
                        type="button"
                        className="district-op-chip"
                        onClick={() => {
                          soundEngine.playClick();
                          setSelectedOpId(op.id);
                          setActiveDrawer('ops');
                        }}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontWeight: 700,
                          }}
                        >
                          {op.title}
                        </span>
                        <span
                          className="mono-num"
                          style={{
                            color:
                              op.status === 'active'
                                ? 'var(--teal-bright)'
                                : 'var(--amber-bright)',
                            flexShrink: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {op.status === 'active'
                            ? `${Math.round(op.progress * 100)}%`
                            : formatYen(op.estimatedYield)}
                          <ArrowRightIcon size={12} />
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </section>
            )}

            {activeDrawer === 'ops' && (
              <OperationDrawer
                operation={selectedOp}
                operations={gameState.operations}
                districts={gameState.districts}
                characters={gameState.characters}
                onSelectOperation={(opId) => {
                  soundEngine.playClick();
                  setSelectedOpId(opId);
                  const found = gameState.operations.find((o) => o.id === opId);
                  if (found) {
                    setSelectedDistrict(found.districtId);
                    sceneRef.current?.focusDistrict(found.districtId);
                  }
                }}
                onBackToList={() => {
                  soundEngine.playClick();
                  setSelectedOpId(null);
                }}
                onDispatch={handleDispatch}
                onClose={() => {
                  soundEngine.playClick();
                  setActiveDrawer(null);
                  setSelectedOpId(null);
                }}
              />
            )}

            {activeDrawer === 'phone' && (
              <PhoneInbox
                messages={gameState.messages}
                news={gameState.news}
                cash={gameState.cash}
                auditCost={gameState.auditCost}
                initialMessageId={focusedMessageId}
                onSelectMessage={(msgId) => {
                  setFocusedMessageId(msgId);
                  setGameState((curr) => markMessageRead(curr, msgId));
                }}
                onAuditMessage={handleAuditMessage}
                onConfront={handleConfront}
                onResolveChoice={handleResolveChoice}
                onClose={() => {
                  soundEngine.playClick();
                  setActiveDrawer(null);
                }}
              />
            )}

            {activeDrawer === 'crew' && (
              <CrewPanel
                day={gameState.day}
                characters={gameState.characters}
                districts={gameState.districts}
                directCapacity={gameState.directCapacity}
                cash={gameState.cash}
                auditCost={gameState.auditCost}
                onRecruit={handleRecruit}
                onAuditCharacter={handleAuditCharacter}
                onPromoteToCoordinator={handlePromote}
                onReassignSupervisor={handleReassign}
                onGiveBonus={handleGiveBonus}
                onCutOff={handleCutOff}
                onClose={() => {
                  soundEngine.playClick();
                  setActiveDrawer(null);
                }}
              />
            )}
          </div>

          {/* Bottom Stack: Pre-Bottom Row (Guide Left + Live CTA Right on PC) + News Ticker + 3-Tab Tactical Dock */}
          <div className="hud-bottom-stack">
            <div className="hud-pre-bottom-row">
              <div className="hud-pre-bottom-left">
                {tutorialStep !== null &&
                  gameState.phase !== 'ended' &&
                  !(gameState.phase === 'evening' && activeDrawer === null) && (
                    <TutorialGuide
                      step={tutorialStep}
                      onPrevStep={() => {
                        soundEngine.playClick();
                        setTutorialStep((prev) =>
                          prev === null ? 1 : prev > 1 ? ((prev - 1) as TutorialStep) : 1
                        );
                      }}
                      onAdvanceStep={() => {
                        soundEngine.playClick();
                        setTutorialStep((prev) =>
                          prev === null ? null : prev < 4 ? ((prev + 1) as TutorialStep) : null
                        );
                      }}
                      onDismiss={dismissTutorial}
                    />
                  )}
              </div>

              {activeDrawer === null && gameState.phase === 'playing' && (
                <LiveActionOverlay
                  state={gameState}
                  outcomeToast={outcomeToast}
                  onOpenOps={() => {
                    soundEngine.playClick();
                    setSelectedOpId(null);
                    setActiveDrawer('ops');
                  }}
                  onAdvanceBeat={handleAdvanceBeat}
                  onSkipToEvening={() => {
                    soundEngine.playClick();
                    setGameState((curr) => skipToEvening(curr));
                  }}
                  onOpenMessage={(msgId) => {
                    soundEngine.playClick();
                    setFocusedMessageId(msgId);
                    setActiveDrawer('phone');
                    setGameState((curr) => markMessageRead(curr, msgId));
                  }}
                />
              )}
            </div>

            <div className="hud-bottom">
              <NewsTicker
                news={gameState.news}
                messages={gameState.messages}
                districts={gameState.districts}
                onSelectMessage={(msgId) => {
                  soundEngine.playClick();
                  setFocusedMessageId(msgId);
                  setActiveDrawer('phone');
                  setGameState((curr) => markMessageRead(curr, msgId));
                }}
                onFocusDistrict={(dId) => {
                  soundEngine.playClick();
                  setSelectedDistrict(dId);
                  sceneRef.current?.focusDistrict(dId);
                }}
              />

              <nav className="tactical-dock tactical-dock-3 interactive" aria-label="戦術コマンドドック">
                <button
                  type="button"
                  className={`dock-btn${activeDrawer === 'ops' ? ' active' : ''}${
                    tutorialStep === 1 ? ' tutorial-pulse' : ''
                  }`}
                  onMouseEnter={() => soundEngine.playHover()}
                  onClick={() => {
                    soundEngine.playClick();
                    setSelectedOpId(null);
                    setActiveDrawer((d) => (d === 'ops' ? null : 'ops'));
                  }}
                >
                  <BriefcaseOpIcon size={16} />
                  <span>案件一覧</span>
                  {availableOpsCount > 0 && (
                    <span className="dock-badge">{availableOpsCount}</span>
                  )}
                </button>

                <button
                  type="button"
                  className={`dock-btn${activeDrawer === 'phone' ? ' active' : ''}${
                    tutorialStep === 3 ? ' tutorial-pulse' : ''
                  }`}
                  onMouseEnter={() => soundEngine.playHover()}
                  onClick={() => {
                    soundEngine.playClick();
                    setFocusedMessageId(null);
                    setActiveDrawer((d) => (d === 'phone' ? null : 'phone'));
                  }}
                >
                  <BurnerPhoneIcon size={16} />
                  <span>暗号端末</span>
                  {unreadMessagesCount > 0 && (
                    <span
                      className={`dock-badge${urgentMessagesCount > 0 ? ' urgent' : ''}`}
                    >
                      {unreadMessagesCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className={`dock-btn${activeDrawer === 'crew' ? ' active' : ''}`}
                  onMouseEnter={() => soundEngine.playHover()}
                  onClick={() => {
                    soundEngine.playClick();
                    setActiveDrawer((d) => (d === 'crew' ? null : 'crew'));
                  }}
                >
                  <CrewIcon size={16} />
                  <span>組織・相関</span>
                  {foggedCrewCount > 0 && (
                    <span className="dock-badge">{foggedCrewCount}</span>
                  )}
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}

      {/* Field Manual / How To Play Modal (accessible from Title Screen & TopHud) */}
      {howToPlayOpen && (
        <HowToPlayModal
          onClose={() => {
            soundEngine.playClick();
            setHowToPlayOpen(false);
          }}
          onReopenTutorial={
            gameState.phase !== 'title' && gameState.phase !== 'ended' && tutorialStep === null
              ? reopenTutorial
              : undefined
          }
        />
      )}

      {/* Evening News & Settlement Modal (yields cleanly if inspecting PhoneInbox) */}
      {gameState.phase === 'evening' &&
        gameState.lastDaySummary &&
        activeDrawer === null && (
          <EveningReportModal
            summary={gameState.lastDaySummary}
            policeTrace={gameState.policeTrace}
            day={gameState.day}
            maxDays={gameState.maxDays}
            onOpenInbox={() => {
              soundEngine.playClick();
              setActiveDrawer('phone');
            }}
            onProceedNextDay={() => {
              soundEngine.playDispatch();
              setActiveDrawer(null);
              setGameState((curr) => proceedToNextDay(curr));
            }}
          />
        )}

      {/* Floating return button when inspecting drawers during evening settlement */}
      {gameState.phase === 'evening' && activeDrawer !== null && (
        <div
          style={{
            position: 'fixed',
            bottom: 72,
            left: 14,
            zIndex: 33,
            pointerEvents: 'auto',
          }}
        >
          <button
            type="button"
            className="btn-noir btn-amber"
            onClick={() => {
              soundEngine.playClick();
              setActiveDrawer(null);
            }}
          >
            <span>夜間清算レポートに戻る</span>
          </button>
        </div>
      )}

      {/* Result Newspaper / Case File Dossier */}
      {gameState.phase === 'ended' && gameState.ending && (
        <ResultDossier
          ending={gameState.ending}
          cash={gameState.cash}
          stats={gameState.stats}
          onRestart={() => {
            soundEngine.playClick();
            setActiveDrawer(null);
            setSelectedDistrict(null);
            setSelectedOpId(null);
            setGameState(createInitialState(selectedDoctrine));
          }}
        />
      )}
    </>
  );
}
