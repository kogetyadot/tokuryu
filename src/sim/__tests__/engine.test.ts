import { describe, expect, it } from 'vitest';
import { DOCTRINES, createInitialDistricts } from '../districts';
import { createFluidRecruit, createInitialCharacters } from '../characters';
import { generateOperationsForDay } from '../operations';
import { evaluateEnding } from '../endings';
import {
  auditCharacter,
  auditMessage,
  confrontCharacter,
  createInitialState,
  cutOffCharacter,
  dispatchOperation,
  formatYen,
  getDirectSlotUsage,
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
} from '../engine';
import type { GameState, PhoneMessage } from '../../types/game';

describe('TOKURYU Simulation Engine', () => {
  describe('Doctrines, Districts & Initial Characters', () => {
    it('configures all 3 starting doctrines and 6 city districts accurately', () => {
      expect(Object.keys(DOCTRINES)).toEqual([
        'ghost_architect',
        'neon_fixer',
        'ruthless_broker',
      ]);

      const ghost = createInitialState('ghost_architect');
      const fixer = createInitialState('neon_fixer');
      const broker = createInitialState('ruthless_broker');

      expect(ghost.phase).toBe('title');
      expect(ghost.directCapacity).toBe(3);
      expect(ghost.auditCost).toBe(150_000);
      expect(ghost.policeTrace).toBe(6);

      expect(fixer.directCapacity).toBe(5);
      expect(fixer.auditCost).toBe(250_000);
      expect(fixer.control).toBe(72);
      expect(fixer.characters.some((c) => c.id === 'rena')).toBe(true);

      expect(broker.cash).toBe(8_000_000);
      expect(broker.control).toBe(48);
      expect(broker.auditCost).toBe(350_000);

      const districts = createInitialDistricts();
      expect(Object.keys(districts)).toHaveLength(6);
      expect(districts.kasumigahama.center).toEqual([-16, -10]);
      expect(districts.kasumigahama.accentColor).toBe('#e63946');
      expect(districts.shintoshin.center).toEqual([16, -12]);
      expect(districts.konan.center).toEqual([18, 14]);
      expect(districts.sakuradai.center).toEqual([-18, 12]);
      expect(districts.kurokawa.center).toEqual([-2, 16]);
      expect(districts.chuo.center).toEqual([0, -2]);
    });

    it('creates named characters, relationships, and fogged subordinate under Himuro on Day 1', () => {
      const chars = createInitialCharacters('ghost_architect');
      const himuro = chars.find((c) => c.id === 'himuro')!;
      const ken = chars.find((c) => c.id === 'ken')!;
      const takeru = chars.find((c) => c.id === 'takeru')!;
      const fluid = chars.find((c) => !c.isNamed)!;

      expect(himuro.tier).toBe('coordinator');
      expect(himuro.portraitUrl).toBe('./assets/portraits/himuro.jpg');
      expect(ken.relationships.himuro).toBe(-35);
      expect(ken.relationships.rena).toBe(30);
      expect(takeru.tier).toBe('subordinate');
      expect(takeru.supervisorId).toBe('himuro');
      expect(takeru.isFogged).toBe(true);
      expect(fluid.supervisorId).toBe('himuro');
      expect(fluid.isFogged).toBe(true);

      const customRecruit = createFluidRecruit(42, null, 'konan');
      expect(customRecruit.isFogged).toBe(false);
      expect(customRecruit.portraitUrl).toMatch(/\/assets\/portraits\/temp_(hoodie|suit)\.jpg/);
    });

    it('starts Day 1 at 8:00 with welcome memo and 4 differentiated operations', () => {
      const state = startNewGame('ghost_architect');
      expect(state.phase).toBe('playing');
      expect(state.day).toBe(1);
      expect(state.hour).toBe(8.0);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].senderId).toBe('misaki');
      expect(state.operations).toHaveLength(4);

      const categories = state.operations.map((o) => o.category);
      expect(categories.some((c) => c === 'front_business' || c === 'fenced_goods')).toBe(true);
      expect(categories).toContain('fraud_mirage');
      expect(categories).toContain('bogus_repair');
      expect(categories.some((c) => c === 'nightlife_ring' || c === 'smash_grab')).toBe(true);
    });
  });

  describe('Dispatching, Time Tick & Evening Settlement', () => {
    it('supports direct and delegated dispatches and resolves them during day ticks', () => {
      let state = startNewGame('ghost_architect');
      const ops = state.operations;

      // Direct dispatch via Ken
      state = dispatchOperation(state, ops[0].id, 'ken', null, 'fair');
      expect(state.operations[0].status).toBe('active');
      expect(state.characters.find((c) => c.id === 'ken')?.status).toBe('on_mission');

      // Delegated dispatch via Himuro -> Takeru (Himuro remains idle while Takeru executes)
      state = dispatchOperation(state, ops[1].id, 'himuro', 'takeru', 'exploit');
      expect(state.operations[1].status).toBe('active');
      expect(state.operations[1].delegatedViaId).toBe('himuro');
      expect(state.operations[1].assignedSubId).toBe('takeru');
      expect(state.characters.find((c) => c.id === 'takeru')?.status).toBe('on_mission');
      expect(state.characters.find((c) => c.id === 'himuro')?.status).toBe('idle');

      // Second delegated dispatch via Himuro -> initial fluid sub
      const fluidSub = state.characters.find((c) => !c.isNamed && c.supervisorId === 'himuro')!;
      state = dispatchOperation(state, ops[2].id, 'himuro', null, 'stingy');
      expect(state.operations[2].assignedSubId).toBe(fluidSub.id);
      expect(state.characters.find((c) => c.id === fluidSub.id)?.status).toBe('on_mission');

      // Tick simulation forward smoothly (1x = 0.45 hr/sec)
      state = tickSimulation(state, 4);
      expect(state.hour).toBeCloseTo(9.8, 4);
      expect(state.operations[0].progress).toBeGreaterThan(0);

      // Pause speed should freeze progression
      const paused = setSpeed(state, 0);
      const afterPause = tickSimulation(paused, 10);
      expect(afterPause.hour).toBe(paused.hour);

      // Fast-forward to evening cleanly
      const evening = skipToEvening(state);
      expect(evening.phase).toBe('evening');
      expect(evening.hour).toBe(22.0);
      expect(evening.lastDaySummary).not.toBeNull();
      expect(evening.operations.slice(0, 3).every((o) => o.status !== 'active')).toBe(true);
      expect(evening.stats.opsCompleted + evening.stats.opsBusted).toBeGreaterThanOrEqual(0);
    });

    it('advances to next day, cools heat, and regenerates fresh operations', () => {
      let state = startNewGame('neon_fixer');
      state = skipToEvening(state);
      expect(state.phase).toBe('evening');

      const day2 = proceedToNextDay(state);
      expect(day2.phase).toBe('playing');
      expect(day2.day).toBe(2);
      expect(day2.hour).toBe(8.0);
      expect(day2.operations.filter((o) => o.status === 'available').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Information Asymmetry, Auditing & Confrontation', () => {
    it('detects skimming/coverup lies via auditMessage and resolves via confrontCharacter', () => {
      let state = startNewGame('ghost_architect');
      const lieMsg: PhoneMessage = {
        id: 'msg_test_lie',
        day: 1,
        hour: 15,
        senderId: 'himuro',
        senderName: '氷室',
        senderRole: '仲介統括',
        senderPortrait: './assets/portraits/himuro.jpg',
        type: 'report',
        subject: '【完了報告】テスト案件',
        body: '問題なく完了。売上は¥200万です。',
        read: false,
        resolved: false,
        containsLie: true,
        lieType: 'skimming',
        skimmedAmount: 650_000,
      };
      state = {
        ...state,
        messages: [lieMsg, ...state.messages],
        characters: state.characters.map((c) =>
          c.id === 'himuro' ? { ...c, skimmedTotal: 650_000 } : c
        ),
      };

      const cashBefore = state.cash;
      const audited = auditMessage(state, 'msg_test_lie');
      const updatedMsg = audited.messages.find((m) => m.id === 'msg_test_lie')!;
      expect(audited.cash).toBe(cashBefore - audited.auditCost);
      expect(updatedMsg.audited).toBe(true);
      expect(updatedMsg.auditResultText).toContain('中抜き発覚');
      expect(audited.stats.liesExposed).toBe(1);

      const reclaimed = confrontCharacter(audited, 'msg_test_lie', 'reclaim');
      expect(reclaimed.cash).toBe(audited.cash + 650_000);
      expect(reclaimed.stats.totalSkimmedCaught).toBe(650_000);
      expect(reclaimed.control).toBe(audited.control + 6);
      expect(reclaimed.messages.find((m) => m.id === 'msg_test_lie')?.confronted).toBe(true);
      expect(reclaimed.characters.find((c) => c.id === 'himuro')?.skimmedTotal).toBe(0);
    });

    it('lifts information fog on a subordinate via auditCharacter and expires fog after 4 days', () => {
      let state = startNewGame('ghost_architect');
      const takeruBefore = state.characters.find((c) => c.id === 'takeru')!;
      expect(takeruBefore.isFogged).toBe(true);

      state = auditCharacter(state, 'takeru');
      const takeruAfter = state.characters.find((c) => c.id === 'takeru')!;
      expect(takeruAfter.isFogged).toBe(false);
      expect(takeruAfter.reportedLoyalty).toBe(takeruAfter.loyalty);
      expect(takeruAfter.lastAuditDay).toBe(1);

      // Simulate passing to Day 5 -> fog refreshes after 4 days
      state = { ...state, day: 4, phase: 'evening' };
      const day5 = proceedToNextDay(state);
      expect(day5.characters.find((c) => c.id === 'takeru')?.isFogged).toBe(true);
    });
  });

  describe('Roster Management, Capacity & Relationship Ripples', () => {
    it('enforces directCapacity on recruitment, promotion, and supervisor reassignment', () => {
      let state = startNewGame('ghost_architect');
      // ghost_architect has directCapacity = 3: himuro(coord), ken(direct), misaki(direct) occupy all 3
      expect(getDirectSlotUsage(state)).toBe(3);

      // Direct recruit should be rejected at capacity
      const failedDirectRecruit = recruitFluidOperative(state, null);
      expect(failedDirectRecruit.characters).toHaveLength(state.characters.length);

      // Delegated recruit under Himuro should succeed and cost ¥400,000
      const cashBefore = state.cash;
      state = recruitFluidOperative(state, 'himuro');
      expect(state.cash).toBe(cashBefore - 400_000);
      expect(state.characters).toHaveLength(7);

      // Promoting Takeru should be blocked while direct slots are full
      const blockedPromo = promoteToCoordinator(state, 'takeru');
      expect(blockedPromo.characters.find((c) => c.id === 'takeru')?.tier).toBe('subordinate');

      // Reassigning Ken under Himuro frees a direct slot, allowing Takeru's promotion
      state = reassignSupervisor(state, 'ken', 'himuro');
      expect(getDirectSlotUsage(state)).toBe(2);
      state = promoteToCoordinator(state, 'takeru');
      expect(state.characters.find((c) => c.id === 'takeru')?.tier).toBe('coordinator');
    });

    it('cutOffCharacter reduces policeTrace and ripples loyalty hit to allies', () => {
      let state = startNewGame('neon_fixer');
      state = { ...state, policeTrace: 50 };
      const renaLoyaltyBefore = state.characters.find((c) => c.id === 'rena')!.loyalty;

      const afterCut = cutOffCharacter(state, 'ken');
      expect(afterCut.characters.find((c) => c.id === 'ken')?.status).toBe('cut_off');
      expect(afterCut.policeTrace).toBe(40); // direct cut reduces trace by 10
      expect(afterCut.control).toBe(state.control - 5);
      // Rena likes Ken (+30), so she suffers significant loyalty drop
      expect(afterCut.characters.find((c) => c.id === 'rena')!.loyalty).toBe(renaLoyaltyBefore - 12);
    });

    it('giveBonus increases loyalty & reduces stress, and autonomous dilemma choices mutate state', () => {
      let state = startNewGame('ghost_architect');
      const bonusState = giveBonus(state, 'takeru', 200_000);
      expect(bonusState.cash).toBe(state.cash - 200_000);
      expect(bonusState.characters.find((c) => c.id === 'takeru')!.loyalty).toBeGreaterThan(
        state.characters.find((c) => c.id === 'takeru')!.loyalty
      );
      expect(bonusState.characters.find((c) => c.id === 'takeru')!.stress).toBeLessThan(
        state.characters.find((c) => c.id === 'takeru')!.stress
      );

      // Trigger high-stress walkout autonomous event & threaten
      state = {
        ...state,
        day: 2,
        characters: state.characters.map((c) =>
          c.id === 'takeru' ? { ...c, stress: 80 } : c
        ),
      };
      state = skipToEvening(state);
      const walkoutMsg = state.messages.find((m) => m.id.startsWith('evt_walkout_takeru'));
      expect(walkoutMsg).toBeDefined();

      const afterThreat = resolveMessageChoice(state, walkoutMsg!.id, 'threaten_keep');
      expect(afterThreat.policeTrace).toBeGreaterThan(state.policeTrace);
      expect(afterThreat.messages.find((m) => m.id === walkoutMsg!.id)?.resolved).toBe(true);

      const readState = markMessageRead(afterThreat, 'msg_welcome_day1');
      expect(readState.messages.find((m) => m.id === 'msg_welcome_day1')?.read).toBe(true);
    });
  });

  describe('All 6 Endings & Formatting', () => {
    it('evaluates t3_takedown, internal_coup, bankrupt, vanished_ghost, quiet_exit, and hollow_empire', () => {
      const base = startNewGame('ghost_architect');

      // 1. T3 Takedown
      const takedown = evaluateEnding({ ...base, policeTrace: 100 });
      expect(takedown?.id).toBe('t3_takedown');
      expect(takedown?.characterFates.length).toBeGreaterThanOrEqual(5);

      // 2. Internal Coup
      const coup = evaluateEnding({ ...base, control: 0 });
      expect(coup?.id).toBe('internal_coup');

      // 3. Bankrupt
      const bankrupt = evaluateEnding({ ...base, day: 3, cash: -100_000 });
      expect(bankrupt?.id).toBe('bankrupt');

      // 4. Vanished Ghost (Day 14 evening, targetCash met, trace < 65)
      const ghost = evaluateEnding({
        ...base,
        day: base.maxDays,
        phase: 'evening',
        cash: 30_000_000,
        policeTrace: 32,
        control: 80,
      });
      expect(ghost?.id).toBe('vanished_ghost');
      expect(['S', 'A']).toContain(ghost?.rank);

      // 5. Quiet Exit via manual trigger
      const exitState = triggerQuietExit({ ...base, cash: 15_000_000 });
      expect(exitState.phase).toBe('ended');
      expect(exitState.ending?.id).toBe('quiet_exit');

      // 6. Hollow Empire (Day 14 evening, low cash)
      const hollow = evaluateEnding({
        ...base,
        day: base.maxDays,
        phase: 'evening',
        cash: 5_000_000,
        policeTrace: 55,
      });
      expect(hollow?.id).toBe('hollow_empire');

      // 7. Early Day-5 bankruptcy with 0 ops scores realistically low (< 1500 PTS, Rank D)
      const earlyBankrupt = evaluateEnding({
        ...base,
        day: 5,
        cash: -200_000,
        policeTrace: 10,
        control: 58,
      });
      expect(earlyBankrupt?.id).toBe('bankrupt');
      expect(earlyBankrupt?.rank).toBe('D');
      expect(earlyBankrupt?.score).toBeLessThan(1500);

      // 8. Failure ending rank cap: Rank C only if survived >= 10 days with >= 6 ops completed
      const lateBustFewOps = evaluateEnding({
        ...base,
        day: 11,
        cash: 12_000_000,
        policeTrace: 100,
        control: 70,
        stats: { ...base.stats, opsCompleted: 3, liesExposed: 2 },
      });
      expect(lateBustFewOps?.rank).toBe('D');

      const lateBustManyOps = evaluateEnding({
        ...base,
        day: 11,
        cash: 12_000_000,
        policeTrace: 100,
        control: 70,
        stats: { ...base.stats, opsCompleted: 6, liesExposed: 3 },
      });
      expect(lateBustManyOps?.rank).toBe('C');
    });

    it('formats Japanese yen cleanly', () => {
      expect(formatYen(0)).toBe('¥0');
      expect(formatYen(450_000)).toBe('¥45万');
      expect(formatYen(12_400_000)).toBe('¥1,240万');
      expect(formatYen(-1_200_000)).toBe('-¥120万');
    });

    it('generates non-overlapping world positions on multi-day operation generation', () => {
      const state: GameState = startNewGame('ruthless_broker');
      const day2Ops = generateOperationsForDay(2, state, 5);
      expect(day2Ops).toHaveLength(5);
      for (const op of day2Ops) {
        expect(op.worldPos).toHaveLength(2);
        expect(Number.isFinite(op.worldPos[0])).toBe(true);
        expect(Number.isFinite(op.worldPos[1])).toBe(true);
      }
    });
  });

  describe('Simulation Balance & Anti-Exploit Fixes (P0/P1)', () => {
    it('ensures coverup sets actualProfit=0 & reportedProfit=0 (no phantom cash/skim), and skimming sets positive skimmedAmount', () => {
      let coverupCount = 0;
      let skimCount = 0;

      for (let seedOffset = 0; seedOffset < 60; seedOffset++) {
        let state = startNewGame('ruthless_broker');
        const op = state.operations.find((o) => o.category === 'smash_grab' || o.category === 'nightlife_ring') ?? state.operations[0];
        state = {
          ...state,
          nextEntityId: 10 + seedOffset * 13,
          characters: state.characters.map((c) => {
            if (c.id === 'himuro') return { ...c, loyalty: 30, ambition: 95 };
            if (c.id === 'takeru') return { ...c, skill: 20, stress: 75 };
            return c;
          }),
        };
        state = dispatchOperation(state, op.id, 'himuro', 'takeru', 'exploit');
        const evening = skipToEvening(state);
        const resolvedOp = evening.operations.find((o) => o.id === op.id)!;
        const opMsg = evening.messages.find((m) => m.linkedOpId === op.id);

        expect(opMsg?.lieHint).toBeUndefined();

        if (opMsg?.lieType === 'coverup') {
          coverupCount++;
          expect(resolvedOp.actualOutcome?.success).toBe(false);
          expect(resolvedOp.actualOutcome?.actualProfit).toBe(0);
          expect(resolvedOp.actualOutcome?.reportedProfit).toBe(0);
          expect(evening.dailyActualIncome).toBe(evening.dailyReportedIncome);
          expect(evening.lastDaySummary?.hiddenSkimSuspected).toBe(false);
          const newsForOp = evening.news.find((n) => n.relatedOpId === op.id);
          expect(newsForOp).toBeDefined();
          expect(newsForOp?.contradictsMessageId).toBe(opMsg.id);
        }

        if (opMsg?.lieType === 'skimming') {
          skimCount++;
          expect(resolvedOp.actualOutcome?.success).toBe(true);
          expect(opMsg.skimmedAmount).toBeGreaterThan(0);
          expect(resolvedOp.actualOutcome?.actualProfit).toBe(
            (resolvedOp.actualOutcome?.reportedProfit ?? 0) + (opMsg.skimmedAmount ?? 0)
          );
          const audited = auditMessage(evening, opMsg.id);
          const reclaimed = confrontCharacter(audited, opMsg.id, 'reclaim');
          expect(reclaimed.cash).toBe(audited.cash + (opMsg.skimmedAmount ?? 0));
        }
      }

      expect(coverupCount).toBeGreaterThan(0);
      expect(skimCount).toBeGreaterThan(0);
    });

    it('generates Kaiwan News for honest delegated operations (~65%) without spoiler lieHints', () => {
      let honestDelegatedTotal = 0;
      let honestDelegatedWithNews = 0;

      for (let seedOffset = 0; seedOffset < 80; seedOffset++) {
        let state = startNewGame('ghost_architect');
        const op = state.operations[0];
        state = {
          ...state,
          nextEntityId: 10 + seedOffset * 17,
          characters: state.characters.map((c) => {
            if (c.id === 'himuro') return { ...c, loyalty: 95, ambition: 10, traits: [] };
            if (c.id === 'takeru') return { ...c, skill: 92, stress: 0 };
            return c;
          }),
        };
        state = dispatchOperation(state, op.id, 'himuro', 'takeru', 'fair');
        const evening = skipToEvening(state);
        const opMsg = evening.messages.find((m) => m.linkedOpId === op.id);
        if (opMsg && !opMsg.containsLie) {
          honestDelegatedTotal++;
          expect(opMsg.lieHint).toBeUndefined();
          const newsForOp = evening.news.find((n) => n.relatedOpId === op.id);
          if (newsForOp) {
            honestDelegatedWithNews++;
            expect(newsForOp.contradictsMessageId).toBeUndefined();
          }
        }
      }

      expect(honestDelegatedTotal).toBeGreaterThan(15);
      expect(honestDelegatedWithNews).toBeGreaterThan(0);
      expect(honestDelegatedWithNews).toBeLessThan(honestDelegatedTotal);
    });

    it('wires district.decay progression, overnight heat pressure, and front_business yield drag', () => {
      let state = startNewGame('neon_fixer');
      const targetOp = state.operations.find((o) => o.category === 'fraud_mirage') ?? state.operations[0];
      const decayBefore = state.districts[targetOp.districtId].decay;
      state = dispatchOperation(state, targetOp.id, 'ken', null, 'fair');
      const evening = skipToEvening(state);
      const decayAfter = evening.districts[targetOp.districtId].decay;
      const harmDelta = evening.operations.find((o) => o.id === targetOp.id)?.actualOutcome?.actualHarmDelta ?? 0;
      expect(decayAfter).toBe(Math.min(100, decayBefore + Math.round(harmDelta * 1.4)));

      // High decay district (>= 45) adds +2 overnight heat pressure (net -2 instead of -4)
      const highDecayEvening: GameState = {
        ...evening,
        districts: {
          ...evening.districts,
          shintoshin: { ...evening.districts.shintoshin, decay: 10, heat: 30 },
          kurokawa: { ...evening.districts.kurokawa, decay: 60, heat: 30 },
        },
      };
      const nextMorning = proceedToNextDay(highDecayEvening);
      expect(nextMorning.districts.shintoshin.heat).toBe(26);
      expect(nextMorning.districts.kurokawa.heat).toBe(28);

      // High decay drags down front_business / bogus_repair yield by 14%
      const frontBase = startNewGame('neon_fixer');
      const frontOp = frontBase.operations.find((o) => o.category === 'front_business') ?? {
        ...frontBase.operations[0],
        category: 'front_business' as const,
      };
      const runWithDecay = (decayVal: number) => {
        let s: GameState = {
          ...frontBase,
          operations: [frontOp, ...frontBase.operations.slice(1)],
          characters: frontBase.characters.map((c) =>
            c.id === 'ken' ? { ...c, skill: 99, stress: 0 } : c
          ),
          districts: {
            ...frontBase.districts,
            [frontOp.districtId]: {
              ...frontBase.districts[frontOp.districtId],
              decay: decayVal,
            },
          },
        };
        s = dispatchOperation(s, frontOp.id, 'ken', null, 'fair');
        return skipToEvening(s).operations.find((o) => o.id === frontOp.id)!.actualOutcome!.actualProfit;
      };
      expect(runWithDecay(60)).toBeLessThan(runWithDecay(10));
    });

    it('wires character.ambition into skim rate & coup risk, and high stress into -12 skill penalty & direct burnout warning', () => {
      // Ambition coup risk when ambition >= 80 && loyalty <= 25
      let state = startNewGame('ghost_architect');
      state = {
        ...state,
        control: 50,
        characters: state.characters.map((c) =>
          c.id === 'himuro' ? { ...c, ambition: 88, loyalty: 20 } : c
        ),
      };
      const eveningCoup = skipToEvening(state);
      // Himuro loyalty=20, Ken=74, Misaki=82 => avgInnerLoyalty=58.67 (neutral drift 0), coupRiskOfficers (-8) => control 42
      expect(eveningCoup.control).toBe(42);
      expect(
        eveningCoup.lastDaySummary?.autonomousLogs.some((l) => l.includes('乗っ取り'))
      ).toBe(true);

      // Direct character high stress >= 70 triggers burnout warning & reduces success rate (-12 skill)
      let directStressState = startNewGame('neon_fixer');
      directStressState = {
        ...directStressState,
        characters: directStressState.characters.map((c) =>
          c.id === 'ken' ? { ...c, stress: 78 } : c
        ),
      };
      const burnoutEvening = skipToEvening(directStressState);
      expect(
        burnoutEvening.messages.some((m) => m.id.startsWith('evt_burnout_ken'))
      ).toBe(true);

      // Verify -12 stress penalty noticeably lowers operation success rate across seeds
      const countSuccesses = (stressVal: number) => {
        let wins = 0;
        for (let i = 0; i < 40; i++) {
          let s = startNewGame('neon_fixer');
          const hardOp = { ...s.operations[0], difficulty: 78 };
          s = {
            ...s,
            nextEntityId: 10 + i * 19,
            operations: [hardOp, ...s.operations.slice(1)],
            characters: s.characters.map((c) =>
              c.id === 'ken' ? { ...c, skill: 68, stress: stressVal } : c
            ),
          };
          s = dispatchOperation(s, hardOp.id, 'ken', null, 'fair');
          const ev = skipToEvening(s);
          if (ev.operations.find((o) => o.id === hardOp.id)?.status === 'completed') wins++;
        }
        return wins;
      };
      expect(countSuccesses(75)).toBeLessThan(countSuccesses(10));
    });

    it('prevents yakiniku free-refund exploit, avoids ghost_architect Day-2 Rena overflow, and defers bankruptcy until proceedToNextDay', () => {
      // 1. Rena joins ghost_architect on Day 2 as 'external' (slots stay 3/3)
      let state = startNewGame('ghost_architect');
      expect(getDirectSlotUsage(state)).toBe(3);
      state = skipToEvening(state);
      state = proceedToNextDay(state);
      state = skipToEvening(state);
      const rena = state.characters.find((c) => c.id === 'rena');
      expect(rena).toBeDefined();
      expect(rena?.tier).toBe('external');
      expect(getDirectSlotUsage(state)).toBe(3);

      // 2. Yakiniku event: no lieHint spoiler; un-audited reject_expense gives -16 loyalty & -2 control vs audited +4 control & -6 loyalty
      const yakinikuMsg = state.messages.find((m) => m.id.startsWith('evt_yakiniku_'));
      expect(yakinikuMsg).toBeDefined();
      expect(yakinikuMsg?.lieHint).toBeUndefined();

      const senderBefore = state.characters.find((c) => c.id === yakinikuMsg!.senderId)!;
      const unAuditedReject = resolveMessageChoice(state, yakinikuMsg!.id, 'reject_expense');
      expect(unAuditedReject.control).toBe(state.control - 2);
      expect(
        unAuditedReject.characters.find((c) => c.id === senderBefore.id)?.loyalty
      ).toBe(Math.max(0, senderBefore.loyalty - 16));

      const auditedFirst = auditMessage(state, yakinikuMsg!.id);
      const auditedReject = resolveMessageChoice(auditedFirst, yakinikuMsg!.id, 'reject_expense');
      expect(auditedReject.control).toBe(auditedFirst.control + 4);
      expect(
        auditedReject.characters.find((c) => c.id === senderBefore.id)?.loyalty
      ).toBe(Math.max(0, senderBefore.loyalty - 6));

      // 3. Bankruptcy is NOT triggered in settleEvening, allowing player to inspect evening & audit/reclaim before proceedToNextDay
      let lowCashDay2 = startNewGame('ghost_architect');
      lowCashDay2 = {
        ...lowCashDay2,
        day: 2,
        cash: 100_000,
      };
      const eveningBroke = skipToEvening(lowCashDay2);
      expect(eveningBroke.cash).toBeLessThan(0);
      expect(eveningBroke.phase).toBe('evening');
      expect(eveningBroke.ending).toBeNull();

      const morningBankrupt = proceedToNextDay(eveningBroke);
      expect(morningBankrupt.phase).toBe('ended');
      expect(morningBankrupt.ending?.id).toBe('bankrupt');
    });

    it('grants leverageReady on overlook and applies +12% bonus trace cut on subsequent cutOffCharacter', () => {
      let state = startNewGame('ghost_architect');
      state = {
        ...state,
        policeTrace: 60,
        messages: [
          {
            id: 'msg_lev_test',
            day: 3,
            hour: 15,
            senderId: 'himuro',
            senderName: '氷室',
            type: 'report',
            subject: '完了報告',
            body: '売上回収しました。',
            read: false,
            isUrgent: false,
            audited: true,
            containsLie: true,
            lieType: 'skimming',
            skimmedAmount: 400_000,
            resolved: false,
          },
          ...state.messages,
        ],
      };

      const overlooked = confrontCharacter(state, 'msg_lev_test', 'overlook');
      const himuroAfterOverlook = overlooked.characters.find((c) => c.id === 'himuro')!;
      expect(himuroAfterOverlook.leverageReady).toBe(true);

      // Coordinator base trace cut is 12 + leverage bonus 12 = 24
      const cut = cutOffCharacter(overlooked, 'himuro');
      expect(cut.policeTrace).toBe(60 - 24);
    });

    it('delivers Day 3 escalation briefing message from Misaki upon entering Day 3', () => {
      let state = startNewGame('ghost_architect');
      state = { ...state, day: 2, cash: 5_000_000 };
      const evening = skipToEvening(state);
      const day3 = proceedToNextDay(evening);
      expect(day3.day).toBe(3);
      expect(day3.messages.some((m) => m.id === 'msg_phase2_day3')).toBe(true);
    });
  });
});

