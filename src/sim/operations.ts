import type {
  DistrictId,
  GameState,
  Operation,
  OperationCategory,
} from '../types/game';
import { clamp, createSeededRng, deriveStateSeed } from './districts';

interface OpBlueprint {
  title: string;
  category: OperationCategory;
  preferredDistricts: DistrictId[];
  flavor: string;
  baseYield: number;
  traceRisk: number;
  harmImpact: number;
  difficulty: number;
  durationHours: number;
}

const OP_BLUEPRINTS: OpBlueprint[] = [
  // front_business (Low harm, modest steady cash, comedy/satire potential)
  {
    title: '駅前テイクアウト専門パンケーキ店',
    category: 'front_business',
    preferredDistricts: ['sakuradai', 'kurokawa'],
    flavor: '帳簿上の売上が妙に跳ね上がる小規模フロント店舗。なぜか生クリームだけ評判になりつつある。',
    baseYield: 1_250_000,
    traceRisk: 4,
    harmImpact: 1,
    difficulty: 28,
    durationHours: 4.5,
  },
  {
    title: '深夜営業・無店舗型ラーメン仕込み拠点',
    category: 'front_business',
    preferredDistricts: ['kurokawa', 'konan'],
    flavor: '現金商売を装って収益を混ぜ込むための幽霊キッチン。意外と近所の夜勤客に人気。',
    baseYield: 1_450_000,
    traceRisk: 5,
    harmImpact: 2,
    difficulty: 32,
    durationHours: 5.0,
  },
  {
    title: '架空Webデザイン事務所の名義貸し案件',
    category: 'front_business',
    preferredDistricts: ['shintoshin'],
    flavor: '新都心のシェアオフィス一室を借りた見せかけのIT法人。実体のないコンサル請求書を回す。',
    baseYield: 1_700_000,
    traceRisk: 6,
    harmImpact: 2,
    difficulty: 36,
    durationHours: 4.8,
  },

  // fenced_goods
  {
    title: '港南コンテナ・出所不明ブランド品の深夜流用',
    category: 'fenced_goods',
    preferredDistricts: ['konan', 'kurokawa'],
    flavor: '正規ルートから外れた在庫品や盗品をフリマ・中古ルートへ素早く捌く物流シノギ。',
    baseYield: 1_900_000,
    traceRisk: 8,
    harmImpact: 4,
    difficulty: 40,
    durationHours: 4.2,
  },
  {
    title: '黒川裏町・中古スマート端末の大量転売',
    category: 'fenced_goods',
    preferredDistricts: ['kurokawa', 'kasumigahama'],
    flavor: '契約経緯の曖昧な端末や金属資材を買い叩き、別ルートへ流し込む仲介案件。',
    baseYield: 2_100_000,
    traceRisk: 9,
    harmImpact: 5,
    difficulty: 44,
    durationHours: 4.0,
  },

  // bogus_repair
  {
    title: '桜台団地・老朽屋根の不安煽り点検ビジネス',
    category: 'bogus_repair',
    preferredDistricts: ['sakuradai'],
    flavor: '作業着を着せた実行役に「今すぐ直さないと危険」と過剰な工事契約を迫らせる悪質事業。',
    baseYield: 2_650_000,
    traceRisk: 11,
    harmImpact: 12,
    difficulty: 48,
    durationHours: 5.2,
  },
  {
    title: '水回り緊急駆けつけ・高額請求フランチャイズ',
    category: 'bogus_repair',
    preferredDistricts: ['sakuradai', 'kurokawa'],
    flavor: '格安広告で呼び出し、現場で法外な追加作業費を突きつける典型的な生活密着型ボッタクリ。',
    baseYield: 2_900_000,
    traceRisk: 12,
    harmImpact: 13,
    difficulty: 52,
    durationHours: 5.5,
  },

  // fraud_mirage
  {
    title: 'SNS型「AI自動売買サロン」投資誘導スキーム',
    category: 'fraud_mirage',
    preferredDistricts: ['shintoshin', 'kasumigahama'],
    flavor: '派手な暮らしを装う架空プロフィール群から投資意欲を煽り、虚偽の運用枠へ送金させる。',
    baseYield: 3_600_000,
    traceRisk: 15,
    harmImpact: 15,
    difficulty: 58,
    durationHours: 6.0,
  },
  {
    title: '公的機関を名乗る特別調査・還付金アラート',
    category: 'fraud_mirage',
    preferredDistricts: ['sakuradai', 'chuo'],
    flavor: '不安を突く電話連絡と回収役のリレーで現金を抜き取る特殊詐欺パッケージ。',
    baseYield: 3_800_000,
    traceRisk: 17,
    harmImpact: 17,
    difficulty: 62,
    durationHours: 5.8,
  },
  {
    title: '新都心エリート偽装・ロマンス投資勧誘網',
    category: 'fraud_mirage',
    preferredDistricts: ['shintoshin'],
    flavor: '長期のメッセージ交流を装って信頼を取り付け、偽の海外口座へ資金を誘導する。',
    baseYield: 4_100_000,
    traceRisk: 16,
    harmImpact: 16,
    difficulty: 64,
    durationHours: 6.5,
  },

  // cyber_parlor
  {
    title: '無認可オンラインカジノ・夜間決済代行網',
    category: 'cyber_parlor',
    preferredDistricts: ['shintoshin', 'kasumigahama'],
    flavor: '海外サーバーを看板に掲げた違法賭博の国内ポイント換金窓口。足がつきにくいが規模が膨らみやすい。',
    baseYield: 3_400_000,
    traceRisk: 13,
    harmImpact: 11,
    difficulty: 60,
    durationHours: 5.5,
  },
  {
    title: 'セキュリティ警告偽装・サポート窓口コール拠点',
    category: 'cyber_parlor',
    preferredDistricts: ['chuo', 'shintoshin'],
    flavor: '架空のウイルス感染画面からプリペイド決済へ誘導する遠隔型ネット詐欺ライン。',
    baseYield: 3_200_000,
    traceRisk: 14,
    harmImpact: 12,
    difficulty: 56,
    durationHours: 5.0,
  },

  // nightlife_ring
  {
    title: '霞ヶ浜VIPラウンジ・過剰請求＆違法スカウト網',
    category: 'nightlife_ring',
    preferredDistricts: ['kasumigahama'],
    flavor: '雑居ビルの高額ツケ請求と違法スカウトの斡旋料を束ねる歓楽街の大型シノギ。',
    baseYield: 4_600_000,
    traceRisk: 19,
    harmImpact: 18,
    difficulty: 68,
    durationHours: 6.2,
  },
  {
    title: '会員制アフターバー・泥酔客カードの不正清算',
    category: 'nightlife_ring',
    preferredDistricts: ['kasumigahama', 'kurokawa'],
    flavor: '深夜帯の歓楽街で判断力を失った客に法外な会計を押し付ける搾取型ビジネス。',
    baseYield: 4_200_000,
    traceRisk: 18,
    harmImpact: 16,
    difficulty: 63,
    durationHours: 5.6,
  },

  // smash_grab
  {
    title: '新都心・高級宝飾セレクトショップ深夜襲撃',
    category: 'smash_grab',
    preferredDistricts: ['shintoshin', 'konan'],
    flavor: '即席で集めた実行役に短時間でガラスを破らせ、換金性の高い貴金属を奪取する荒事。被害・捜査リスクが極めて高い。',
    baseYield: 6_200_000,
    traceRisk: 27,
    harmImpact: 24,
    difficulty: 78,
    durationHours: 3.8,
  },
  {
    title: '港南倉庫街・高価電子部品の強硬搬出',
    category: 'smash_grab',
    preferredDistricts: ['konan', 'sakuradai'],
    flavor: '警備の手薄な深夜帯を狙った実力行使の強奪案件。末端の精神的負荷と警察の本気度が一気に跳ね上がる。',
    baseYield: 5_500_000,
    traceRisk: 24,
    harmImpact: 22,
    difficulty: 74,
    durationHours: 4.0,
  },
];

function computeNonOverlappingWorldPos(
  center: [number, number],
  existing: Operation[],
  rng: () => number
): [number, number] {
  for (let attempt = 0; attempt < 18; attempt++) {
    const angle = rng() * Math.PI * 2;
    const radius = 4.0 + rng() * 3.0;
    const rawX = center[0] + Math.cos(angle) * radius;
    const rawZ = center[1] + Math.sin(angle) * radius;
    const x = Number(clamp(rawX, -24.5, 24.5).toFixed(2));
    const z = Number(clamp(rawZ, -20.0, 19.6).toFixed(2));
    const tooClose = existing.some((op) => {
      if (op.status !== 'available' && op.status !== 'active') return false;
      const dx = op.worldPos[0] - x;
      const dz = op.worldPos[1] - z;
      return dx * dx + dz * dz < 9.5;
    });
    if (!tooClose) {
      return [x, z];
    }
  }
  const fallbackAngle = (existing.length * 1.9) % (Math.PI * 2);
  return [
    Number(clamp(center[0] + Math.cos(fallbackAngle) * 5.2, -24.5, 24.5).toFixed(2)),
    Number(clamp(center[1] + Math.sin(fallbackAngle) * 5.2, -20.0, 19.6).toFixed(2)),
  ];
}

function buildOperationFromBlueprint(
  bp: OpBlueprint,
  idNum: number,
  day: number,
  state: GameState,
  existingOps: Operation[],
  rng: () => number
): Operation {
  const districtPool = bp.preferredDistricts;
  const districtId = districtPool[Math.floor(rng() * districtPool.length)];
  const district = state.districts[districtId];
  const worldPos = computeNonOverlappingWorldPos(district.center, existingOps, rng);

  // Slight day scaling and district influence bonus
  const dayFactor = 1 + Math.min(day - 1, 10) * 0.05;
  const influenceFactor = 1 + (district.influence - 25) * 0.0025;
  const jitter = 0.92 + rng() * 0.16;
  const estimatedYield = Math.round((bp.baseYield * dayFactor * influenceFactor * jitter) / 50_000) * 50_000;

  return {
    id: `op_${day}_${idNum}`,
    title: bp.title,
    category: bp.category,
    districtId,
    flavor: bp.flavor,
    estimatedYield,
    traceRisk: clamp(bp.traceRisk + Math.round(district.heat / 35), 1, 30),
    harmImpact: clamp(bp.harmImpact, 0, 25),
    difficulty: clamp(bp.difficulty + Math.floor((day - 1) / 3) * 2, 20, 95),
    durationHours: bp.durationHours,
    expiresDay: day + (bp.category === 'front_business' ? 2 : 1),
    status: 'available',
    assignedLeadId: null,
    assignedSubId: null,
    delegatedViaId: null,
    payPolicy: 'fair',
    progress: 0,
    worldPos,
  };
}

export function generateOperationsForDay(
  day: number,
  state: GameState,
  count: number
): Operation[] {
  const rng = createSeededRng(deriveStateSeed(state) + day * 1049 + count * 17);
  const generated: Operation[] = [];
  const allExisting = [...state.operations];
  let nextId = state.nextEntityId;

  if (day === 1) {
    // Curated Day 1 spread so strategic trade-offs are immediately clear:
    // 1. Low-harm front_business or fenced_goods
    // 2. fraud_mirage
    // 3. bogus_repair
    // 4. High-yield nightlife_ring or smash_grab
    const day1Categories: OperationCategory[][] = [
      ['front_business', 'fenced_goods'],
      ['fraud_mirage'],
      ['bogus_repair'],
      ['nightlife_ring', 'smash_grab'],
    ];

    for (let i = 0; i < Math.min(count, day1Categories.length); i++) {
      const allowed = day1Categories[i];
      const candidates = OP_BLUEPRINTS.filter((b) => allowed.includes(b.category));
      const pick = candidates[Math.floor(rng() * candidates.length)];
      const op = buildOperationFromBlueprint(pick, nextId++, day, state, allExisting, rng);
      generated.push(op);
      allExisting.push(op);
    }

    // If caller requested > 4 on Day 1, fill remaining randomly
    while (generated.length < count) {
      const pick = OP_BLUEPRINTS[Math.floor(rng() * OP_BLUEPRINTS.length)];
      const op = buildOperationFromBlueprint(pick, nextId++, day, state, allExisting, rng);
      generated.push(op);
      allExisting.push(op);
    }
    return generated;
  }

  // Subsequent days: ensure category diversity and escalate stakes naturally
  const activeTitles = new Set(
    allExisting
      .filter((o) => o.status === 'available' || o.status === 'active')
      .map((o) => o.title)
  );

  const shuffled = [...OP_BLUEPRINTS];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const pickedCategories = new Set<OperationCategory>();

  for (const bp of shuffled) {
    if (generated.length >= count) break;
    if (activeTitles.has(bp.title)) continue;
    if (pickedCategories.has(bp.category) && generated.length < count - 1) continue;
    // Gate smash_grab slightly until day 2+ (or anytime here since day >= 2)
    const op = buildOperationFromBlueprint(bp, nextId++, day, state, allExisting, rng);
    generated.push(op);
    allExisting.push(op);
    pickedCategories.add(bp.category);
    activeTitles.add(bp.title);
  }

  while (generated.length < count) {
    const pick = OP_BLUEPRINTS[Math.floor(rng() * OP_BLUEPRINTS.length)];
    const op = buildOperationFromBlueprint(pick, nextId++, day, state, allExisting, rng);
    generated.push(op);
    allExisting.push(op);
  }

  return generated;
}
