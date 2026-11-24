import type {
  Character,
  DaySummary,
  DistrictId,
  DoctrineId,
  GameState,
  NewsItem,
  Operation,
  PayPolicy,
  PhoneMessage,
} from '../types/game';
import {
  DOCTRINES,
  clamp,
  createInitialDistricts,
  createSeededRng,
  deriveStateSeed,
  formatYen,
} from './districts';
import { createFluidRecruit, createInitialCharacters } from './characters';
import { generateOperationsForDay } from './operations';
import { resolveMessageChoice, runAutonomousCrewTick } from './events';
import { evaluateEnding } from './endings';

export { DOCTRINES, formatYen } from './districts';
export { resolveMessageChoice } from './events';
export { evaluateEnding } from './endings';

const MAX_DAYS = 14;
const TARGET_CASH = 25_000_000;
const EARLY_EXIT_CASH = 14_000_000;
const RECRUIT_COST = 400_000;

function isCharacterActive(c: Character): boolean {
  return c.status === 'idle' || c.status === 'on_mission';
}

export function getDirectSlotUsage(state: Pick<GameState, 'characters'>): number {
  return state.characters.filter(
    (c) =>
      isCharacterActive(c) &&
      (c.tier === 'direct' ||
        c.tier === 'coordinator' ||
        (c.tier === 'subordinate' && c.supervisorId === null))
  ).length;
}

export function createInitialState(doctrine: DoctrineId = 'ghost_architect'): GameState {
  const cfg = DOCTRINES[doctrine];
  const districts = createInitialDistricts();

  if (doctrine === 'neon_fixer') {
    districts.kasumigahama.influence = clamp(districts.kasumigahama.influence + 14, 0, 100);
    districts.kurokawa.influence = clamp(districts.kurokawa.influence + 10, 0, 100);
  }

  const characters = createInitialCharacters(doctrine);

  return {
    phase: 'title',
    doctrine,
    day: 1,
    maxDays: MAX_DAYS,
    hour: 8.0,
    speed: 1,
    cash: cfg.startingCash,
    targetCash: TARGET_CASH,
    earlyExitCash: EARLY_EXIT_CASH,
    control: cfg.startingControl,
    policeTrace: cfg.startingTrace,
    cityHarm: 12,
    directCapacity: cfg.directCapacity,
    auditCost: cfg.auditCost,
    districts,
    characters,
    operations: [],
    messages: [],
    news: [
      {
        id: 'news_init_1',
        day: 1,
        headline: '海湾市警、新設「T3特捜班」の捜査体制を強化——匿名犯罪網を警戒',
        subhead: '佐伯警部補「末端の使い捨てで逃げ切れる構図は許さない」',
        districtId: 'chuo',
        severity: 'info',
      },
    ],
    lastDaySummary: null,
    timeline: [{ day: 1, text: `作戦方針「${cfg.name}」で海湾市のネットワークを起動。` }],
    ending: null,
    stats: {
      totalEarned: 0,
      totalSkimmedCaught: 0,
      liesExposed: 0,
      tempsLost: 0,
      opsCompleted: 0,
      opsBusted: 0,
      autonomousIncidents: 0,
    },
    dailyReportedIncome: 0,
    dailyActualIncome: 0,
    dailyStartTrace: cfg.startingTrace,
    dailyStartControl: cfg.startingControl,
    dailyStartHarm: 12,
    dailyAutonomousLogs: [],
    auditCounter: 0,
    nextEntityId: 10,
  };
}

export function startNewGame(doctrine: DoctrineId): GameState {
  const base = createInitialState(doctrine);
  const cfg = DOCTRINES[doctrine];
  const ops = generateOperationsForDay(1, base, 4);

  const welcomeMessage: PhoneMessage = {
    id: 'msg_welcome_day1',
    day: 1,
    hour: 8.0,
    senderId: 'misaki',
    senderName: 'ミサキ',
    senderRole: '情報・暗号担当',
    senderPortrait: './assets/portraits/misaki.jpg',
    type: 'system',
    subject: '【初期接続完了】秘匿回線セットアップ＆本日の案件一覧',
    body:
      `秘匿端末の初期設定を完了しました。方針「${cfg.name}」に基づき、直轄管理枠は${cfg.directCapacity}名です。\n` +
      '仲介統括（氷室など）へ案件を委任すれば捜査線を遮断できますが、配下の実態には「情報の霧」がかかり、報告に中抜きや隠蔽が混じる恐れがあります。\n' +
      '海湾ニュースの速報と報告に食い違いを見つけたら「裏取り調査」で真相を暴いてください。まずはマップ上の4件の機会から着手しましょう。',
    read: false,
    resolved: true,
  };

  return {
    ...base,
    phase: 'playing',
    hour: 8.0,
    speed: 1,
    operations: ops,
    messages: [welcomeMessage],
    nextEntityId: base.nextEntityId + ops.length + 1,
  };
}

export function setSpeed(state: GameState, speed: 0 | 1 | 2): GameState {
  return {
    ...state,
    speed,
  };
}

export function markMessageRead(state: GameState, messageId: string): GameState {
  const exists = state.messages.some((m) => m.id === messageId && !m.read);
  if (!exists) return state;
  return {
    ...state,
    messages: state.messages.map((m) => (m.id === messageId ? { ...m, read: true } : m)),
  };
}

export function dispatchOperation(
  state: GameState,
  opId: string,
  leadId: string,
  subId: string | null,
  payPolicy: PayPolicy
): GameState {
  if (state.phase !== 'playing') return state;

  const op = state.operations.find((o) => o.id === opId);
  if (!op || op.status !== 'available') return state;

  const lead = state.characters.find((c) => c.id === leadId);
  if (!lead || !isCharacterActive(lead)) return state;

  let chosenSub: Character | undefined;
  let delegatedViaId: string | null = null;

  if (lead.tier === 'coordinator') {
    delegatedViaId = lead.id;
    if (subId) {
      chosenSub = state.characters.find(
        (c) => c.id === subId && c.supervisorId === lead.id && c.status === 'idle'
      );
      if (!chosenSub) return state;
    } else {
      chosenSub = state.characters.find(
        (c) => c.supervisorId === lead.id && c.status === 'idle'
      );
    }

    // If coordinator has no idle subordinates, they must step in personally (if idle)
    if (!chosenSub && lead.status !== 'idle') {
      return state;
    }
  } else {
    // Direct / External / unattached subordinate must be idle to execute
    if (lead.status !== 'idle') return state;
    if (subId && subId !== lead.id) {
      chosenSub = state.characters.find(
        (c) => c.id === subId && c.status === 'idle'
      );
    }
  }

  const executorId = chosenSub ? chosenSub.id : lead.id;
  // Coordinator stays idle when delegating to a subordinate; non-coordinator lead is always locked on mission
  const lockLead = lead.tier !== 'coordinator' || !chosenSub;

  const updatedOps = state.operations.map((o) =>
    o.id === opId
      ? {
          ...o,
          status: 'active' as const,
          assignedLeadId: lead.id,
          assignedSubId: chosenSub ? chosenSub.id : null,
          delegatedViaId,
          payPolicy,
          progress: 0,
        }
      : o
  );

  const updatedChars = state.characters.map((c) => {
    if (c.id === executorId) {
      return {
        ...c,
        status: 'on_mission' as const,
        activeOperationId: op.id,
      };
    }
    if (lockLead && c.id === lead.id) {
      return {
        ...c,
        status: 'on_mission' as const,
        activeOperationId: op.id,
      };
    }
    return c;
  });

  return {
    ...state,
    operations: updatedOps,
    characters: updatedChars,
  };
}

function buildCategoryReportNews(
  op: Operation,
  districtName: string,
  reportedScale: number,
  day: number,
  newsId: string,
  contradictsMessageId?: string
): NewsItem {
  const categoryClue: Record<Operation['category'], { head: string; sub: string }> = {
    fraud_mirage: {
      head: `${districtName}で大型投資・架空請求被害の相談相次ぐ`,
      sub: `関係者試算では「動いた金額は少なくとも${formatYen(reportedScale)}規模」とみられる。`,
    },
    bogus_repair: {
      head: `${districtName}の高齢者宅で高額点検契約トラブル、被害額は約${formatYen(reportedScale)}か`,
      sub: `消費生活センターが「急な屋根・水回り点検」に警戒を呼びかけ。`,
    },
    nightlife_ring: {
      head: `${districtName}のVIPラウンジ周辺で高額決済トラブル、深夜に謎の豪遊客も`,
      sub: `業界関係者は「一晩で${formatYen(reportedScale)}近く抜かれた客がいる」と証言。`,
    },
    fenced_goods: {
      head: `${districtName}の深夜倉庫から高額品の大量搬出目撃`,
      sub: `流通業界では総額${formatYen(reportedScale)}前後の品が闇市場へ流れたとの見方。`,
    },
    cyber_parlor: {
      head: `${districtName}経由の無認可オンライン決済が急増、推定流通${formatYen(reportedScale)}`,
      sub: `セキュリティ調査会社が異常な深夜トランザクションを検知。`,
    },
    smash_grab: {
      head: `【警戒】${districtName}で深夜の貴金属・電子部品強奪、被害推定${formatYen(reportedScale)}`,
      sub: `防犯カメラに複数人の逃走姿。警察が緊急配備を敷いている。`,
    },
    front_business: {
      head: `${districtName}の謎の新規店舗、帳簿外の現金取引${formatYen(reportedScale)}規模の噂`,
      sub: `近隣商店主「客足以上に羽振りが良すぎる」と首を傾げる。`,
    },
  };
  const clue = categoryClue[op.category];
  return {
    id: newsId,
    day,
    headline: clue.head,
    subhead: clue.sub,
    districtId: op.districtId,
    severity: op.harmImpact >= 15 ? 'warning' : 'info',
    relatedOpId: op.id,
    contradictsMessageId,
  };
}

function buildNewsForOutcome(
  op: Operation,
  districtName: string,
  outcomeStatus: 'completed' | 'failed' | 'busted',
  actualProfit: number,
  reportedProfit: number,
  hiddenInReport: boolean,
  isDelegated: boolean,
  containsLie: boolean,
  linkedMsgId: string,
  day: number,
  newsId: string,
  newsRoll: number
): NewsItem | null {
  if (outcomeStatus === 'busted') {
    return {
      id: newsId,
      day,
      headline: `【速報】${districtName}で組織的犯行の実行役を現行犯・緊急逮捕`,
      subhead: `案件「${op.title}」に関連し、現場で不審人物が取り押さえられた模様。T3特捜班が背後の指示役を追及。`,
      districtId: op.districtId,
      severity: 'breaking',
      relatedOpId: op.id,
      contradictsMessageId: hiddenInReport ? linkedMsgId : undefined,
    };
  }

  if (outcomeStatus === 'failed') {
    if (hiddenInReport) {
      return {
        id: newsId,
        day,
        headline: `${districtName}付近で不審車両の目撃情報、警察が周辺を事情聴取`,
        subhead: `現場周辺でトラブルが発生し住民が110番通報。関与グループは車両を乗り捨てて逃走か。`,
        districtId: op.districtId,
        severity: 'warning',
        relatedOpId: op.id,
        contradictsMessageId: linkedMsgId,
      };
    }
    if (isDelegated && newsRoll < 0.65) {
      return {
        id: newsId,
        day,
        headline: `${districtName}の路上で深夜の職質・小規模トラブル、大きな被害はなし`,
        subhead: `周辺パトロール中の警察官が不審車両を確認したが、現場に目立った混乱はなく鎮静化した。`,
        districtId: op.districtId,
        severity: 'info',
        relatedOpId: op.id,
      };
    }
    return null;
  }

  if (outcomeStatus === 'completed' && containsLie) {
    return buildCategoryReportNews(
      op,
      districtName,
      actualProfit,
      day,
      newsId,
      linkedMsgId
    );
  }

  // Honest delegated operations (~65%) also surface Kaiwan News matching reported scale
  if (outcomeStatus === 'completed' && isDelegated && !containsLie && newsRoll < 0.65) {
    return buildCategoryReportNews(op, districtName, reportedProfit, day, newsId);
  }

  if (outcomeStatus === 'completed' && op.harmImpact >= 15) {
    return {
      id: newsId,
      day,
      headline: `${districtName}で住民・商店からの被害通報が増加傾向`,
      subhead: `T3特捜班が海湾市内の流動型グループによる連続事案として警戒を強めている。`,
      districtId: op.districtId,
      severity: 'warning',
      relatedOpId: op.id,
    };
  }

  return null;
}

function resolveCompletedOperation(state: GameState, op: Operation): GameState {
  const rng = createSeededRng(deriveStateSeed(state) + op.id.length * 733 + state.nextEntityId * 41);
  const lead = state.characters.find((c) => c.id === op.assignedLeadId);
  const sub = op.assignedSubId ? state.characters.find((c) => c.id === op.assignedSubId) : undefined;
  const coordinator = op.delegatedViaId
    ? state.characters.find((c) => c.id === op.delegatedViaId)
    : undefined;
  const executor = sub ?? lead;
  if (!executor || !lead) return state;

  const district = state.districts[op.districtId];
  const isDelegated = Boolean(coordinator && sub);
  const isExternal = lead.tier === 'external';

  // Effective skill & success chance (apply -12 stress penalty if >= 70 on executor or lead)
  const coordinatorSupport =
    coordinator && sub ? Math.max(0, (coordinator.skill - sub.skill) * 0.25) : 0;
  const doctrineStealthBonus = state.doctrine === 'ghost_architect' ? 4 : 0;
  const executorStressPenalty = executor.stress >= 70 ? 12 : 0;
  const leadStressPenalty =
    lead.id !== executor.id && lead.stress >= 70 ? 12 : 0;
  const coordinatorStressPenalty =
    coordinator &&
    coordinator.id !== executor.id &&
    coordinator.id !== lead.id &&
    coordinator.stress >= 70
      ? 12
      : 0;
  const effectiveSkill =
    executor.skill +
    coordinatorSupport +
    doctrineStealthBonus -
    executorStressPenalty -
    leadStressPenalty -
    coordinatorStressPenalty;
  const effectiveDiff = op.difficulty + district.heat * 0.14;

  let successProb = 0.72 + (effectiveSkill - effectiveDiff) * 0.0065;
  if (op.payPolicy === 'stingy') successProb -= 0.04;
  if (op.payPolicy === 'exploit') successProb -= 0.09;
  successProb = clamp(successProb, 0.22, 0.94);

  const roll = rng();
  const succeeded = roll < successProb;
  const busted = !succeeded && roll > successProb + 0.16;
  const outcomeStatus: Operation['status'] = succeeded
    ? 'completed'
    : busted
    ? 'busted'
    : 'failed';

  // Compute profit, trace, harm (with high district.decay drag on front_business / bogus_repair)
  const decayYieldFactor =
    district.decay >= 45 &&
    (op.category === 'front_business' || op.category === 'bogus_repair')
      ? 0.86
      : 1.0;

  let actualProfit = 0;
  if (succeeded) {
    const yieldVar = 0.92 + rng() * 0.18;
    const payMultiplier =
      op.payPolicy === 'exploit' ? 1.14 : op.payPolicy === 'stingy' ? 1.07 : 1.0;
    const brokerCut = isExternal ? 0.76 : 1.0;
    actualProfit =
      Math.round(
        (op.estimatedYield * yieldVar * payMultiplier * brokerCut * decayYieldFactor) /
          10_000
      ) * 10_000;
  } else if (!busted) {
    actualProfit = Math.round((op.estimatedYield * 0.12 * decayYieldFactor) / 10_000) * 10_000;
  }

  const discretionMitigation = clamp(1 - executor.discretion * 0.004, 0.55, 1.05);
  const delegationInsulation = isDelegated ? 0.42 : 0.78;
  let actualTraceDelta = 0;
  let actualHarmDelta = 0;

  if (outcomeStatus === 'completed') {
    actualTraceDelta = Math.max(
      1,
      Math.round(op.traceRisk * 0.42 * delegationInsulation * discretionMitigation)
    );
    actualHarmDelta = Math.round(op.harmImpact * 0.42);
  } else if (outcomeStatus === 'failed') {
    actualTraceDelta = Math.max(
      2,
      Math.round(op.traceRisk * 0.75 * delegationInsulation * discretionMitigation)
    );
    actualHarmDelta = Math.round(op.harmImpact * 0.35);
  } else {
    // Busted!
    actualTraceDelta = Math.max(
      5,
      Math.round(op.traceRisk * (isDelegated ? 0.95 : 1.45) * discretionMitigation)
    );
    actualHarmDelta = Math.round(op.harmImpact * 0.55);
  }

  // Lie generation (Information Asymmetry)
  let containsLie = false;
  let lieType: PhoneMessage['lieType'] | undefined;
  let skimmedAmount = 0;
  let reportedProfit = actualProfit;
  let incidentHiddenInReport = false;

  if (isDelegated && coordinator) {
    const traitBonus =
      (coordinator.traits.includes('ambitious') ? 0.14 : 0) +
      (coordinator.traits.includes('greedy') ? 0.18 : 0) +
      (coordinator.traits.includes('slick') ? 0.12 : 0);
    const ambitionFactor = (coordinator.ambition - 50) * 0.004;
    const payIncentive =
      op.payPolicy === 'exploit' ? 0.22 : op.payPolicy === 'stingy' ? 0.12 : 0;
    const loyaltyPenalty = Math.max(0, (78 - coordinator.loyalty) * 0.005);

    if (outcomeStatus === 'completed' && actualProfit >= 600_000) {
      const skimChance = clamp(
        0.18 + traitBonus + ambitionFactor + payIncentive + loyaltyPenalty,
        0.12,
        0.88
      );
      if (rng() < skimChance) {
        containsLie = true;
        lieType = 'skimming';
        const skimRate = 0.18 + rng() * 0.14;
        skimmedAmount = Math.max(200_000, Math.round((actualProfit * skimRate) / 10_000) * 10_000);
        skimmedAmount = Math.min(skimmedAmount, actualProfit - 200_000);
        if (skimmedAmount <= 0) {
          containsLie = false;
          lieType = undefined;
          skimmedAmount = 0;
        } else {
          reportedProfit = actualProfit - skimmedAmount;
        }
      }
    } else if (outcomeStatus !== 'completed') {
      const coverupChance = clamp(0.45 + traitBonus + loyaltyPenalty, 0.35, 0.9);
      if (rng() < coverupChance) {
        containsLie = true;
        lieType = 'coverup';
        incidentHiddenInReport = true;
        actualProfit = 0;
        reportedProfit = 0;
      }
    }
  }

  let nextId = state.nextEntityId;
  const msgId = `msg_op_${op.id}_${nextId++}`;
  const newsId = `news_op_${op.id}_${nextId++}`;

  // Stress, loyalty & possible arrest
  let arrestedCharId: string | undefined;
  const stressGain =
    (op.harmImpact >= 15 ? 16 : 8) +
    (op.payPolicy === 'exploit' ? 18 : op.payPolicy === 'stingy' ? 9 : 0) +
    (outcomeStatus === 'busted' ? 20 : outcomeStatus === 'failed' ? 10 : 0);

  const loyaltyDelta =
    op.payPolicy === 'exploit'
      ? -9
      : op.payPolicy === 'stingy'
      ? -3
      : outcomeStatus === 'completed'
      ? 2
      : -4;

  if (outcomeStatus === 'busted') {
    arrestedCharId = executor.id;
  }

  const updatedChars = state.characters.map((c) => {
    if (c.id === executor.id) {
      const nextStatus = arrestedCharId === c.id ? ('arrested' as const) : ('idle' as const);
      return {
        ...c,
        status: nextStatus,
        activeOperationId: null,
        stress: clamp(c.stress + stressGain, 0, 100),
        loyalty: clamp(c.loyalty + loyaltyDelta, 0, 100),
        missionsCompleted: outcomeStatus === 'completed' ? c.missionsCompleted + 1 : c.missionsCompleted,
      };
    }
    if (coordinator && c.id === coordinator.id) {
      return {
        ...c,
        status: c.activeOperationId === op.id ? ('idle' as const) : c.status,
        activeOperationId: c.activeOperationId === op.id ? null : c.activeOperationId,
        skimmedTotal: c.skimmedTotal + skimmedAmount,
        missionsCompleted: outcomeStatus === 'completed' ? c.missionsCompleted + 1 : c.missionsCompleted,
      };
    }
    return c;
  });

  // Update district heat, decay & influence
  const updatedDistricts = {
    ...state.districts,
    [op.districtId]: {
      ...district,
      heat: clamp(district.heat + Math.round(actualTraceDelta * 1.15), 0, 100),
      decay: clamp(district.decay + Math.round(actualHarmDelta * 1.4), 0, 100),
      influence: clamp(
        district.influence + (outcomeStatus === 'completed' ? 4 : -3),
        0,
        100
      ),
    },
  };

  // Build news item (both deceptive clues and ~65% of honest delegated ops)
  const newsRoll = rng();
  const linkedNews = buildNewsForOutcome(
    op,
    district.name,
    outcomeStatus,
    actualProfit,
    reportedProfit,
    incidentHiddenInReport,
    isDelegated,
    containsLie,
    msgId,
    state.day,
    newsId,
    newsRoll
  );

  // Build report message
  const reporter = coordinator ?? lead;
  let subject = '';
  let body = '';
  if (containsLie && lieType === 'skimming') {
    subject = `【完了報告】${op.title} — 売上回収`;
    body = `${reporter.codename}より報告。「${op.title}」は無事完了しました。現地の諸経費・現場手当を差し引き、純上納額 ${formatYen(reportedProfit)} を送金済みです。`;
  } else if (containsLie && lieType === 'coverup') {
    subject = `【撤収報告】${op.title} — 異常なし`;
    body = `${reporter.codename}より報告。「${op.title}」は先方の警戒が強く収益化を見送りましたが、${executor.codename}は無事撤収し警察への露出は一切ありません。`;
  } else if (outcomeStatus === 'completed') {
    subject = `【作戦成功】${op.title} — +${formatYen(reportedProfit)}`;
    body = `${reporter.codename}より報告。「${op.title}」は予定通り完了し、${formatYen(reportedProfit)} を回収しました。${isExternal ? '（外部ブローカー手数料差引済）' : ''}`;
  } else if (outcomeStatus === 'failed') {
    subject = `【失敗報告】${op.title} — 中断・回収僅少`;
    body = `${reporter.codename}より報告。「${op.title}」は現場の警戒に阻まれ中断。回収額は ${formatYen(reportedProfit)} に留まり、捜査線がわずかに伸びています。`;
  } else {
    subject = `【緊急事態】${op.title} — 現場摘発・${executor.codename}拘束`;
    body = `緊急通知！「${op.title}」の現場に警察が踏み込み、${executor.codename}の身柄が拘束されました。捜査線が急速に伸びています（+${actualTraceDelta}%）。`;
  }

  const reportMsg: PhoneMessage = {
    id: msgId,
    day: state.day,
    hour: state.hour,
    senderId: reporter.id,
    senderName: reporter.codename,
    senderRole: reporter.roleLabel,
    senderPortrait: reporter.portraitUrl,
    type: outcomeStatus === 'busted' && !containsLie ? 'police' : 'report',
    subject,
    body,
    read: false,
    resolved: !containsLie,
    isUrgent: outcomeStatus === 'busted',
    containsLie,
    lieType,
    linkedNewsId: linkedNews?.id,
    linkedOpId: op.id,
    skimmedAmount: skimmedAmount > 0 ? skimmedAmount : undefined,
  };

  const outcomeSummary =
    outcomeStatus === 'completed'
      ? `成功（実収益 ${formatYen(actualProfit)} / 報告 ${formatYen(reportedProfit)}）`
      : outcomeStatus === 'failed'
      ? `失敗（回収 ${formatYen(reportedProfit)}）`
      : `摘発（${executor.codename}拘束）`;

  const updatedOps = state.operations.map((o) =>
    o.id === op.id
      ? {
          ...o,
          status: outcomeStatus,
          progress: 1,
          actualOutcome: {
            success: outcomeStatus === 'completed',
            actualProfit,
            reportedProfit,
            actualTraceDelta,
            actualHarmDelta,
            incidentOccurred: outcomeStatus !== 'completed',
            incidentHiddenInReport,
            arrestedCharId,
            summary: outcomeSummary,
          },
        }
      : o
  );

  const nextNews = linkedNews ? [linkedNews, ...state.news] : state.news;
  const nextTimeline = [...state.timeline];
  if (outcomeStatus === 'busted') {
    nextTimeline.push({
      day: state.day,
      text: `${district.name}「${op.title}」が摘発され、${executor.codename}が逮捕。`,
    });
  }

  const nextTempsLost =
    arrestedCharId && executor.tier === 'subordinate'
      ? state.stats.tempsLost + 1
      : state.stats.tempsLost;

  return {
    ...state,
    cash: state.cash + reportedProfit,
    policeTrace: clamp(state.policeTrace + actualTraceDelta, 0, 100),
    cityHarm: clamp(state.cityHarm + actualHarmDelta, 0, 100),
    control: clamp(
      state.control + (outcomeStatus === 'busted' ? -6 : outcomeStatus === 'completed' ? 1 : -2),
      0,
      100
    ),
    districts: updatedDistricts,
    characters: updatedChars,
    operations: updatedOps,
    messages: [reportMsg, ...state.messages],
    news: nextNews,
    timeline: nextTimeline,
    dailyReportedIncome: state.dailyReportedIncome + reportedProfit,
    dailyActualIncome: state.dailyActualIncome + actualProfit,
    stats: {
      ...state.stats,
      totalEarned: state.stats.totalEarned + reportedProfit,
      opsCompleted:
        outcomeStatus === 'completed' ? state.stats.opsCompleted + 1 : state.stats.opsCompleted,
      opsBusted: outcomeStatus === 'busted' ? state.stats.opsBusted + 1 : state.stats.opsBusted,
      tempsLost: nextTempsLost,
    },
    nextEntityId: nextId,
  };
}

function settleEvening(state: GameState): GameState {
  // 1. Upkeep settlement
  const salariedActive = state.characters.filter(
    (c) => isCharacterActive(c) && c.tier !== 'external' && c.dailyUpkeep > 0
  );
  const totalUpkeep = salariedActive.reduce((sum, c) => sum + c.dailyUpkeep, 0);

  let cash = state.cash;
  let upkeepPaid = 0;
  let characters = state.characters;
  const logs = [...state.dailyAutonomousLogs];

  if (cash >= totalUpkeep) {
    cash -= totalUpkeep;
    upkeepPaid = totalUpkeep;
    characters = characters.map((c) =>
      isCharacterActive(c) ? { ...c, unpaidCount: 0 } : c
    );
  } else if (state.day === 1) {
    upkeepPaid = Math.max(0, cash);
    cash = 0;
    characters = characters.map((c) =>
      isCharacterActive(c) && c.dailyUpkeep > 0
        ? {
            ...c,
            unpaidCount: c.unpaidCount + 1,
            loyalty: clamp(c.loyalty - 8, 0, 100),
            stress: clamp(c.stress + 8, 0, 100),
          }
        : c
    );
    logs.push('資金不足により初日の報酬・維持費を一部未払いとした（構成員の不満上昇）。');
  } else {
    cash -= totalUpkeep;
    upkeepPaid = totalUpkeep;
    characters = characters.map((c) =>
      isCharacterActive(c) && c.dailyUpkeep > 0
        ? { ...c, unpaidCount: c.unpaidCount + 1 }
        : c
    );
    logs.push('報酬・維持費の支払いが資金ショートした！');
  }

  let workingState: GameState = {
    ...state,
    cash,
    characters,
    dailyAutonomousLogs: logs,
  };

  // 2. Run autonomous crew tick
  workingState = runAutonomousCrewTick(workingState);

  // 3. Control drift based on active inner loyalty + ambition coup risk
  const innerActive = workingState.characters.filter(
    (c) => isCharacterActive(c) && (c.tier === 'direct' || c.tier === 'coordinator')
  );
  const avgInnerLoyalty =
    innerActive.length > 0
      ? innerActive.reduce((s, c) => s + c.loyalty, 0) / innerActive.length
      : 40;

  let controlDelta = 0;
  if (avgInnerLoyalty >= 72) controlDelta = 1;
  else if (avgInnerLoyalty < 45) controlDelta = -3;

  const coupRiskOfficers = innerActive.filter((c) => c.ambition >= 80 && c.loyalty <= 25);
  if (coupRiskOfficers.length > 0) {
    controlDelta -= coupRiskOfficers.length * 8;
    const names = coupRiskOfficers.map((c) => c.codename).join('・');
    workingState = {
      ...workingState,
      dailyAutonomousLogs: [
        ...workingState.dailyAutonomousLogs,
        `${names}が極端な野心と不信から組織乗っ取りの動きを見せ、統制が大きく揺らいだ！`,
      ],
    };
  }

  const finalControl = clamp(workingState.control + controlDelta, 0, 100);
  workingState = { ...workingState, control: finalControl };

  // 4. Headline for DaySummary
  let headline: NewsItem | undefined = workingState.news.find((n) => n.day === workingState.day);
  if (!headline) {
    headline = {
      id: `news_evening_${workingState.day}_${workingState.nextEntityId}`,
      day: workingState.day,
      headline: `海湾市・第${workingState.day}日夜の治安概況：繁華街で職質強化`,
      subhead: 'T3特捜班は匿名型犯罪グループの資金ルート解明を継続中。',
      districtId: null,
      severity: 'info',
    };
    workingState = {
      ...workingState,
      news: [headline, ...workingState.news],
      nextEntityId: workingState.nextEntityId + 1,
    };
  }

  const hiddenSkimSuspected = workingState.dailyActualIncome > workingState.dailyReportedIncome;

  const summary: DaySummary = {
    day: workingState.day,
    reportedIncome: workingState.dailyReportedIncome,
    actualIncome: workingState.dailyActualIncome,
    hiddenSkimSuspected,
    upkeepPaid,
    netCashDelta: workingState.dailyReportedIncome - upkeepPaid,
    traceDelta: Math.round(workingState.policeTrace - workingState.dailyStartTrace),
    controlDelta: Math.round(workingState.control - workingState.dailyStartControl),
    harmDelta: Math.round(workingState.cityHarm - workingState.dailyStartHarm),
    headline,
    autonomousLogs: workingState.dailyAutonomousLogs,
  };

  let settled: GameState = {
    ...workingState,
    phase: 'evening',
    hour: 22.0,
    lastDaySummary: summary,
  };

  // 5. Evaluate non-bankrupt ending conditions (bankrupt is checked in proceedToNextDay after evening inspection/reclaim)
  const ending = evaluateEnding(settled, false, true);
  if (ending) {
    settled = {
      ...settled,
      phase: 'ended',
      speed: 0,
      ending,
    };
  }

  return settled;
}

function advanceTimeByHours(state: GameState, dtHours: number): GameState {
  if (state.phase !== 'playing' || dtHours <= 0) return state;

  const targetHour = Math.min(22.0, state.hour + dtHours);
  const actualDtHours = Math.max(0, targetHour - state.hour);

  // Advance progress of active operations
  const completedIds: string[] = [];
  const progressedOps = state.operations.map((op) => {
    if (op.status !== 'active') return op;
    const nextProgress = op.progress + actualDtHours / Math.max(0.5, op.durationHours);
    if (nextProgress >= 1) {
      completedIds.push(op.id);
    }
    return {
      ...op,
      progress: Math.min(1, nextProgress),
    };
  });

  let nextState: GameState = {
    ...state,
    hour: targetHour,
    operations: progressedOps,
  };

  for (const opId of completedIds) {
    const opToResolve = nextState.operations.find((o) => o.id === opId);
    if (opToResolve && opToResolve.status === 'active') {
      nextState = resolveCompletedOperation(nextState, opToResolve);
    }
  }

  // Immediate fail check if trace hit 100 or control hit 0 mid-day
  const immediateEnding = evaluateEnding(nextState);
  if (immediateEnding) {
    return {
      ...nextState,
      phase: 'ended',
      speed: 0,
      ending: immediateEnding,
    };
  }

  if (nextState.hour >= 22.0) {
    return settleEvening(nextState);
  }

  return nextState;
}

export function tickSimulation(state: GameState, dtSeconds: number): GameState {
  if (state.phase !== 'playing' || state.speed === 0 || dtSeconds <= 0) {
    return state;
  }
  const hoursPerSecond = state.speed === 2 ? 0.9 : 0.45;
  const dtHours = dtSeconds * hoursPerSecond;
  return advanceTimeByHours(state, dtHours);
}

export function skipToEvening(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  const remainingHours = Math.max(0, 22.0 - state.hour);
  if (remainingHours === 0) {
    return settleEvening(state);
  }
  return advanceTimeByHours(state, remainingHours);
}

export function proceedToNextDay(state: GameState): GameState {
  if (state.phase === 'ended') return state;
  if (state.phase !== 'evening') return state;

  const endingCheck = evaluateEnding(state);
  if (endingCheck) {
    return {
      ...state,
      phase: 'ended',
      speed: 0,
      ending: endingCheck,
    };
  }

  const nextDay = state.day + 1;
  if (nextDay > state.maxDays) {
    const end = evaluateEnding({ ...state, day: state.maxDays, phase: 'evening' });
    return {
      ...state,
      phase: 'ended',
      speed: 0,
      ending: end,
    };
  }

  // Decay district heat overnight (high decay >= 45 adds +2 local heat pressure) and refresh fog after 4 days
  const updatedDistricts = { ...state.districts };
  for (const key of Object.keys(updatedDistricts) as DistrictId[]) {
    const d = updatedDistricts[key];
    const decayHeatPressure = d.decay >= 45 ? 2 : 0;
    updatedDistricts[key] = {
      ...d,
      heat: clamp(d.heat - 4 + decayHeatPressure, 5, 100),
    };
  }

  const updatedChars = state.characters.map((c) => {
    if (c.tier === 'subordinate' && c.supervisorId !== null) {
      const fogExpired = nextDay - c.lastAuditDay >= 4;
      const shouldBeFogged = c.lastAuditDay === 0 || fogExpired;
      return {
        ...c,
        isFogged: shouldBeFogged,
        stress: clamp(c.stress - 5, 0, 100),
      };
    }
    return {
      ...c,
      stress: clamp(c.stress - 4, 0, 100),
    };
  });

  // Remove expired available operations, keep active and recent history
  const keptOps = state.operations.filter(
    (o) =>
      o.status === 'active' ||
      (o.status === 'available' && o.expiresDay >= nextDay) ||
      o.expiresDay >= nextDay - 1
  );

  const traceCool = state.cityHarm < 35 ? 2 : state.cityHarm < 60 ? 1 : 0;
  const nextTrace = clamp(state.policeTrace - traceCool, 0, 100);

  const prepState: GameState = {
    ...state,
    phase: 'playing',
    day: nextDay,
    hour: 8.0,
    policeTrace: nextTrace,
    districts: updatedDistricts,
    characters: updatedChars,
    operations: keptOps,
    dailyReportedIncome: 0,
    dailyActualIncome: 0,
    dailyStartTrace: nextTrace,
    dailyStartControl: state.control,
    dailyStartHarm: state.cityHarm,
    dailyAutonomousLogs: [],
  };

  const activeAvailCount = keptOps.filter((o) => o.status === 'available').length;
  const spawnCount = Math.max(2, Math.min(4, 6 - activeAvailCount));
  const freshOps = generateOperationsForDay(nextDay, prepState, spawnCount);

  return {
    ...prepState,
    operations: [...keptOps, ...freshOps],
    nextEntityId: prepState.nextEntityId + freshOps.length + 1,
  };
}

export function auditMessage(state: GameState, messageId: string): GameState {
  const msg = state.messages.find((m) => m.id === messageId);
  if (!msg || msg.audited || state.cash < state.auditCost) {
    return state;
  }

  const cashAfter = state.cash - state.auditCost;
  const isLie = Boolean(msg.containsLie);

  let auditResultText = '';
  let charUpdates = state.characters;

  if (isLie) {
    if (msg.lieType === 'skimming') {
      const skim = msg.skimmedAmount ?? 280_000;
      auditResultText = `【虚偽検知・中抜き発覚】通信・決済照合の結果、${msg.senderName}が実際には ${formatYen(skim)} 多く回収し私的流用していた証拠を押さえました。`;
    } else if (msg.lieType === 'coverup') {
      auditResultText = `【虚偽検知・隠蔽発覚】周辺監視ログと警察無線照合により、${msg.senderName}が現場での摘発・トラブルを報告書から意図的に隠蔽したことが判明しました。`;
    } else {
      auditResultText = `【虚偽検知・責任転嫁】内部メールと領収書を突き合わせた結果、${msg.senderName}の報告に虚偽の水増し・責任転嫁が含まれていることが確認されました。`;
    }
  } else {
    auditResultText = `【照合完了・虚偽なし】関係者の証言と資金ログを照合した結果、${msg.senderName}の報告内容に矛盾は見つかりませんでした。`;
    if (msg.senderId) {
      charUpdates = charUpdates.map((c) =>
        c.id === msg.senderId ? { ...c, loyalty: clamp(c.loyalty - 2, 0, 100) } : c
      );
    }
  }

  const updatedMessages = state.messages.map((m) =>
    m.id === messageId
      ? {
          ...m,
          read: true,
          audited: true,
          auditResultText,
          resolved: isLie ? m.resolved : true,
        }
      : m
  );

  return {
    ...state,
    cash: cashAfter,
    characters: charUpdates,
    messages: updatedMessages,
    auditCounter: state.auditCounter + 1,
    stats: {
      ...state.stats,
      liesExposed: isLie ? state.stats.liesExposed + 1 : state.stats.liesExposed,
    },
  };
}

export function confrontCharacter(
  state: GameState,
  messageId: string,
  action: 'reclaim' | 'cut_off' | 'overlook'
): GameState {
  const msg = state.messages.find((m) => m.id === messageId);
  if (
    !msg ||
    !msg.audited ||
    !msg.containsLie ||
    msg.confronted ||
    (msg.resolved && msg.choices && msg.choices.length > 0)
  ) {
    return state;
  }

  const targetId = msg.senderId;
  let nextState: GameState = {
    ...state,
    messages: state.messages.map((m) =>
      m.id === messageId ? { ...m, confronted: true, resolved: true, read: true } : m
    ),
  };

  if (action === 'reclaim') {
    const recovered = msg.lieType === 'skimming' ? msg.skimmedAmount ?? 280_000 : 0;
    const updatedChars = nextState.characters.map((c) =>
      c.id === targetId
        ? {
            ...c,
            loyalty: clamp(c.loyalty - 10, 0, 100),
            ambition: clamp(c.ambition - 12, 0, 100),
            stress: clamp(c.stress + 10, 0, 100),
            skimmedTotal: Math.max(0, c.skimmedTotal - recovered),
          }
        : c
    );
    nextState = {
      ...nextState,
      cash: nextState.cash + recovered,
      control: clamp(nextState.control + 6, 0, 100),
      policeTrace:
        msg.lieType === 'coverup'
          ? clamp(nextState.policeTrace - 4, 0, 100)
          : nextState.policeTrace,
      characters: updatedChars,
      timeline: [
        ...nextState.timeline,
        {
          day: nextState.day,
          text: `${msg.senderName}の虚偽報告を詰問${recovered > 0 ? `し${formatYen(recovered)}を回収` : 'し隠蔽穴を塞いだ'}。`,
        },
      ],
      stats: {
        ...nextState.stats,
        totalSkimmedCaught: nextState.stats.totalSkimmedCaught + recovered,
      },
    };
  } else if (action === 'cut_off') {
    const recovered = msg.lieType === 'skimming' ? Math.round((msg.skimmedAmount ?? 0) * 0.5) : 0;
    if (targetId) {
      nextState = cutOffCharacter(nextState, targetId);
    }
    nextState = {
      ...nextState,
      cash: nextState.cash + recovered,
      stats: {
        ...nextState.stats,
        totalSkimmedCaught: nextState.stats.totalSkimmedCaught + recovered,
      },
    };
  } else if (action === 'overlook') {
    const updatedChars = nextState.characters.map((c) =>
      c.id === targetId
        ? {
            ...c,
            loyalty: clamp(c.loyalty + 4, 0, 100),
            ambition: clamp(c.ambition + 8, 0, 100),
          }
        : c
    );
    nextState = {
      ...nextState,
      control: clamp(nextState.control - 4, 0, 100),
      characters: updatedChars,
    };
  }

  return nextState;
}

export function promoteToCoordinator(state: GameState, charId: string): GameState {
  const char = state.characters.find((c) => c.id === charId);
  if (!char || !isCharacterActive(char) || char.tier === 'coordinator' || char.tier === 'external') {
    return state;
  }

  const consumesNewDirectSlot = char.tier === 'subordinate' && char.supervisorId !== null;
  if (consumesNewDirectSlot && getDirectSlotUsage(state) >= state.directCapacity) {
    return state;
  }

  const updatedChars = state.characters.map((c) =>
    c.id === charId
      ? {
          ...c,
          tier: 'coordinator' as const,
          supervisorId: null,
          isFogged: false,
          reportedLoyalty: c.loyalty,
          reportedSkill: c.skill,
          loyalty: clamp(c.loyalty + 6, 0, 100),
          ambition: clamp(c.ambition + 8, 0, 100),
          dailyUpkeep: Math.max(c.dailyUpkeep, 180_000),
        }
      : c
  );

  return {
    ...state,
    characters: updatedChars,
    timeline: [
      ...state.timeline,
      { day: state.day, text: `${char.codename}を仲介統括（Coordinator）へ昇格させた。` },
    ],
  };
}

export function reassignSupervisor(
  state: GameState,
  subId: string,
  newSupervisorId: string | null
): GameState {
  const char = state.characters.find((c) => c.id === subId);
  if (!char || !isCharacterActive(char) || char.tier === 'external' || char.tier === 'coordinator') {
    return state;
  }

  if (newSupervisorId === null) {
    // Move to Direct tier
    const currentlyCountsInDirect =
      char.tier === 'direct' || (char.tier === 'subordinate' && char.supervisorId === null);
    if (!currentlyCountsInDirect && getDirectSlotUsage(state) >= state.directCapacity) {
      return state;
    }

    return {
      ...state,
      characters: state.characters.map((c) =>
        c.id === subId
          ? {
              ...c,
              tier: 'direct' as const,
              supervisorId: null,
              isFogged: false,
              lastAuditDay: state.day,
              reportedLoyalty: c.loyalty,
              reportedSkill: c.skill,
            }
          : c
      ),
    };
  }

  // Move under a Coordinator
  if (newSupervisorId === subId) return state;
  const supervisor = state.characters.find(
    (c) => c.id === newSupervisorId && isCharacterActive(c) && c.tier === 'coordinator'
  );
  if (!supervisor) return state;

  const fogExpired = char.lastAuditDay === 0 || state.day - char.lastAuditDay >= 4;
  return {
    ...state,
    characters: state.characters.map((c) =>
      c.id === subId
        ? {
            ...c,
            tier: 'subordinate' as const,
            supervisorId: newSupervisorId,
            isFogged: fogExpired,
            reportedLoyalty: fogExpired ? clamp(c.loyalty + 16, 0, 100) : c.loyalty,
            reportedSkill: fogExpired ? clamp(c.skill + 8, 1, 100) : c.skill,
          }
        : c
    ),
  };
}

export function recruitFluidOperative(
  state: GameState,
  supervisorId: string | null
): GameState {
  if (state.cash < RECRUIT_COST) return state;

  if (supervisorId === null) {
    if (getDirectSlotUsage(state) >= state.directCapacity) {
      return state;
    }
  } else {
    const sup = state.characters.find(
      (c) => c.id === supervisorId && isCharacterActive(c) && c.tier === 'coordinator'
    );
    if (!sup) return state;
  }

  const districtKeys: DistrictId[] = [
    'kasumigahama',
    'shintoshin',
    'konan',
    'sakuradai',
    'kurokawa',
    'chuo',
  ];
  const recruitNum = state.nextEntityId;
  const district = districtKeys[recruitNum % districtKeys.length];
  const recruit = createFluidRecruit(recruitNum, supervisorId, district);
  if (supervisorId === null) {
    recruit.tier = 'direct';
    recruit.isFogged = false;
    recruit.lastAuditDay = state.day;
  }

  return {
    ...state,
    cash: state.cash - RECRUIT_COST,
    characters: [...state.characters, recruit],
    nextEntityId: state.nextEntityId + 1,
    timeline: [
      ...state.timeline,
      {
        day: state.day,
        text: `新規実行役「${recruit.codename}（${recruit.handle}）」を採用した。`,
      },
    ],
  };
}

export function cutOffCharacter(state: GameState, charId: string): GameState {
  const target = state.characters.find((c) => c.id === charId);
  if (!target || !isCharacterActive(target)) return state;

  const traceCut = target.tier === 'coordinator' ? 12 : target.tier === 'direct' ? 10 : 7;
  let tempsLostDelta = target.tier === 'subordinate' ? 1 : 0;

  // Cancel any active operation that only this target was executing
  const updatedOps = state.operations.map((o) => {
    if (
      o.status === 'active' &&
      (o.assignedSubId === charId || (o.assignedSubId === null && o.assignedLeadId === charId))
    ) {
      return {
        ...o,
        status: 'failed' as const,
        actualOutcome: {
          success: false,
          actualProfit: 0,
          reportedProfit: 0,
          actualTraceDelta: 0,
          actualHarmDelta: 0,
          incidentOccurred: true,
          incidentHiddenInReport: false,
          summary: `${target.codename}の切り捨てに伴い中断`,
        },
      };
    }
    return o;
  });

  let freeDirectSlots = Math.max(
    0,
    state.directCapacity -
      state.characters.filter(
        (c) =>
          c.id !== charId &&
          isCharacterActive(c) &&
          (c.tier === 'direct' ||
            c.tier === 'coordinator' ||
            (c.tier === 'subordinate' && c.supervisorId === null))
      ).length
  );

  const updatedChars = state.characters.map((c) => {
    if (c.id === charId) {
      return {
        ...c,
        status: 'cut_off' as const,
        activeOperationId: null,
        lastAutonomousNote: '「回線を切られた。もう戻れない。」',
      };
    }

    if (!isCharacterActive(c)) return c;

    // Relationship ripple: friends of target lose loyalty
    const relToTarget = c.relationships[charId] ?? 0;
    const targetToRel = target.relationships[c.id] ?? 0;
    const friendship = Math.max(relToTarget, targetToRel);
    const loyaltyHit = friendship >= 15 ? -12 : friendship >= 5 ? -5 : -2;
    const nextRelationships =
      charId in c.relationships
        ? { ...c.relationships, [charId]: clamp(c.relationships[charId] - 15, -100, 100) }
        : c.relationships;

    // Handle subordinates orphaned by coordinator cut-off
    if (c.supervisorId === charId) {
      if (freeDirectSlots > 0) {
        freeDirectSlots--;
        return {
          ...c,
          tier: 'direct' as const,
          supervisorId: null,
          isFogged: false,
          reportedLoyalty: clamp(c.loyalty + loyaltyHit, 0, 100),
          reportedSkill: c.skill,
          loyalty: clamp(c.loyalty + loyaltyHit, 0, 100),
          relationships: nextRelationships,
        };
      }
      tempsLostDelta++;
      return {
        ...c,
        supervisorId: null,
        status: 'fled' as const,
        activeOperationId: null,
        loyalty: clamp(c.loyalty + loyaltyHit, 0, 100),
        relationships: nextRelationships,
      };
    }

    return {
      ...c,
      loyalty: clamp(c.loyalty + loyaltyHit, 0, 100),
      reportedLoyalty: c.isFogged ? c.reportedLoyalty : clamp(c.loyalty + loyaltyHit, 0, 100),
      relationships: nextRelationships,
    };
  });

  const nextState: GameState = {
    ...state,
    policeTrace: clamp(state.policeTrace - traceCut, 0, 100),
    control: clamp(state.control - 5, 0, 100),
    characters: updatedChars,
    operations: updatedOps,
    timeline: [
      ...state.timeline,
      {
        day: state.day,
        text: `${target.codename}を「トカゲの尻尾切り」で切り離した（捜査線-${traceCut}%）。`,
      },
    ],
    stats: {
      ...state.stats,
      tempsLost: state.stats.tempsLost + tempsLostDelta,
    },
  };

  const ending = evaluateEnding(nextState);
  if (ending) {
    return {
      ...nextState,
      phase: 'ended',
      speed: 0,
      ending,
    };
  }
  return nextState;
}

export function giveBonus(state: GameState, charId: string, amount: number): GameState {
  if (amount <= 0 || state.cash < amount) return state;
  const char = state.characters.find((c) => c.id === charId);
  if (!char || !isCharacterActive(char)) return state;

  const loyaltyGain = clamp(Math.round((amount / 100_000) * 5), 2, 25);
  const stressRelief = clamp(Math.round((amount / 100_000) * 6), 3, 30);

  return {
    ...state,
    cash: state.cash - amount,
    characters: state.characters.map((c) => {
      if (c.id !== charId) return c;
      const newLoyalty = clamp(c.loyalty + loyaltyGain, 0, 100);
      return {
        ...c,
        loyalty: newLoyalty,
        reportedLoyalty: c.isFogged ? clamp(c.reportedLoyalty + Math.round(loyaltyGain / 2), 0, 100) : newLoyalty,
        stress: clamp(c.stress - stressRelief, 0, 100),
        unpaidCount: 0,
      };
    }),
  };
}

export function auditCharacter(state: GameState, charId: string): GameState {
  if (state.cash < state.auditCost) return state;
  const char = state.characters.find((c) => c.id === charId);
  if (!char || !isCharacterActive(char)) return state;

  const nextId = state.nextEntityId;
  const auditMsg: PhoneMessage = {
    id: `msg_char_audit_${char.id}_${nextId}`,
    day: state.day,
    hour: state.hour,
    senderId: 'misaki',
    senderName: 'ミサキ（内部監査）',
    senderRole: '情報・暗号担当',
    senderPortrait: './assets/portraits/misaki.jpg',
    type: 'audit',
    subject: `【人物裏取り】${char.codename}（${char.handle}）の実態把握完了`,
    body:
      `対象「${char.codename}」の独立調査を完了しました（霧の解除：4日間有効）。\n` +
      `・真の忠誠度: ${char.loyalty}%（報告値 ${char.reportedLoyalty}%）\n` +
      `・真の実行能力: ${char.skill}（報告値 ${char.reportedSkill}）\n` +
      `・現在のストレス/限界度: ${char.stress}%` +
      (char.skimmedTotal > 0 ? `\n・累計中抜き疑義: ${formatYen(char.skimmedTotal)}` : ''),
    read: false,
    resolved: true,
  };

  return {
    ...state,
    cash: state.cash - state.auditCost,
    auditCounter: state.auditCounter + 1,
    nextEntityId: nextId + 1,
    characters: state.characters.map((c) =>
      c.id === charId
        ? {
            ...c,
            isFogged: false,
            lastAuditDay: state.day,
            reportedLoyalty: c.loyalty,
            reportedSkill: c.skill,
          }
        : c
    ),
    messages: [auditMsg, ...state.messages],
  };
}

export function triggerQuietExit(state: GameState): GameState {
  if (state.cash < state.earlyExitCash || state.phase === 'ended') {
    return state;
  }

  const exitState: GameState = {
    ...state,
    timeline: [
      ...state.timeline,
      {
        day: state.day,
        text: `手元資金${formatYen(state.cash)}で回線破棄・早期撤退を決断。`,
      },
    ],
  };

  const ending = evaluateEnding(exitState, true);
  if (!ending) return state;

  return {
    ...exitState,
    phase: 'ended',
    speed: 0,
    ending,
  };
}
