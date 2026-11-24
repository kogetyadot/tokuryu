import type {
  DistrictId,
  DistrictState,
  DoctrineConfig,
  DoctrineId,
  GameState,
} from '../types/game';

export const DISTRICT_IDS: DistrictId[] = [
  'kasumigahama',
  'shintoshin',
  'konan',
  'sakuradai',
  'kurokawa',
  'chuo',
];

export const DOCTRINES: Record<DoctrineId, DoctrineConfig> = {
  ghost_architect: {
    id: 'ghost_architect',
    name: '幽霊の設計図',
    english: 'THE GHOST ARCHITECT',
    tagline: '徹底した匿名化と多重委任で、中核の存在を霧に隠す設計思想。',
    bonuses: [
      '初期警察捜査線 6%（極めて目立ちにくい開始）',
      '裏取り調査コスト ¥15万（最安コストで嘘と情報の霧を暴ける）',
      '情報担当・ミサキとの暗号連帯が安定',
    ],
    tradeoff: '直轄管理枠が3名のみ。組織を広げるには仲介役への委任と「情報の霧」が不可避。',
    startingCash: 4_500_000,
    directCapacity: 3,
    startingTrace: 6,
    startingControl: 58,
    auditCost: 150_000,
  },
  neon_fixer: {
    id: 'neon_fixer',
    name: '歓楽街の顔役',
    english: 'THE NEON FIXER',
    tagline: '霞ヶ浜と黒川裏町の顔役として、直轄の信頼と人脈で回す現場主義。',
    bonuses: [
      '直轄管理枠 5名・初期統制力 72% の高い掌握度',
      '1日目からスカウト統括・レナが直轄メンバーとして参加',
      '霞ヶ浜・黒川裏町の初期影響力が高い',
    ],
    tradeoff: '初期資金が少なめ（¥380万）で、最初からT3特捜班の捜査線(14%)に載っている。',
    startingCash: 3_800_000,
    directCapacity: 5,
    startingTrace: 14,
    startingControl: 72,
    auditCost: 250_000,
  },
  ruthless_broker: {
    id: 'ruthless_broker',
    name: '冷酷な資本家',
    english: 'THE RUTHLESS BROKER',
    tagline: '潤沢な軍資金で使い捨ての実行網を買い叩き、短期回収を狙う資本型。',
    bonuses: [
      '初期資金 ¥800万 で初日から積極的な採用・案件展開が可能',
      '外部ブローカー黒田との初期関係が良好で外注しやすい',
      '早期手仕舞い・目標金額への到達スピードが速い',
    ],
    tradeoff: '初期統制力 48%・裏取りコスト ¥35万。カネで繋いだ幹部は中抜きと離反を起こしやすい。',
    startingCash: 8_000_000,
    directCapacity: 4,
    startingTrace: 11,
    startingControl: 48,
    auditCost: 350_000,
  },
};

export function createInitialDistricts(): Record<DistrictId, DistrictState> {
  return {
    kasumigahama: {
      id: 'kasumigahama',
      name: '霞ヶ浜',
      englishName: 'NEON NIGHTLIFE',
      tagline: 'ネオン看板と深夜の雑居ビルが並ぶ歓楽街。高額案件とスカウト網の温床。',
      center: [-16, -10],
      heat: 22,
      decay: 35,
      influence: 38,
      accentColor: '#e63946',
    },
    shintoshin: {
      id: 'shintoshin',
      name: '新都心',
      englishName: 'FINANCIAL TOWERS',
      tagline: 'ガラス張りの高層オフィス街。架空コンサルや詐欺収益の通過点。',
      center: [16, -12],
      heat: 18,
      decay: 10,
      influence: 16,
      accentColor: '#2ec4b6',
    },
    konan: {
      id: 'konan',
      name: '港南埠頭',
      englishName: 'BAY DOCKS',
      tagline: '倉庫とコンテナが連なる湾岸地帯。監視の目が届きにくい夜の物流拠点。',
      center: [18, 14],
      heat: 14,
      decay: 48,
      influence: 25,
      accentColor: '#f0a500',
    },
    sakuradai: {
      id: 'sakuradai',
      name: '桜台団地',
      englishName: 'RESIDENTIAL ESTATES',
      tagline: '高度経済成長期に建てられた団地群。訪問型詐欺や悪質点検の標的になりやすい。',
      center: [-18, 12],
      heat: 10,
      decay: 42,
      influence: 20,
      accentColor: '#e09f3e',
    },
    kurokawa: {
      id: 'kurokawa',
      name: '黒川裏町',
      englishName: 'BACKSTREET HUB',
      tagline: '高架下の雑多な飲み屋と中古端末店。名簿屋・道具屋が息を潜める裏路地。',
      center: [-2, 16],
      heat: 16,
      decay: 64,
      influence: 42,
      accentColor: '#c97b63',
    },
    chuo: {
      id: 'chuo',
      name: '中央官庁街',
      englishName: 'CIVIC & T3 HQ',
      tagline: '県警本部とトクリュウ専従「T3特捜班」が睨みを利かせる行政中枢。',
      center: [0, -2],
      heat: 35,
      decay: 8,
      influence: 8,
      accentColor: '#4ea8de',
    },
  };
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function createSeededRng(seed: number): () => number {
  let a = (seed | 0) || 1337;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveStateSeed(state: Pick<
  GameState,
  'doctrine' | 'day' | 'hour' | 'cash' | 'policeTrace' | 'control' | 'nextEntityId' | 'auditCounter' | 'operations' | 'messages'
>): number {
  const docHash =
    state.doctrine === 'ghost_architect'
      ? 101
      : state.doctrine === 'neon_fixer'
      ? 202
      : 303;
  return (
    docHash * 997 +
    state.day * 7919 +
    Math.round(state.hour * 100) * 131 +
    Math.round(state.cash / 1000) * 37 +
    Math.round(state.policeTrace * 10) * 53 +
    Math.round(state.control * 10) * 71 +
    state.nextEntityId * 419 +
    state.auditCounter * 613 +
    state.operations.length * 173 +
    state.messages.length * 257
  );
}

export function formatYen(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded === 0) return '¥0';
  const sign = rounded < 0 ? '-' : '';
  const abs = Math.abs(rounded);
  if (abs >= 10_000) {
    const man = Math.round(abs / 10_000);
    return `${sign}¥${man.toLocaleString('en-US')}万`;
  }
  return `${sign}¥${abs.toLocaleString('en-US')}`;
}
