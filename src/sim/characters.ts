import type {
  Character,
  CharacterTier,
  CharacterTrait,
  DistrictId,
  DoctrineId,
} from '../types/game';
import { clamp, createSeededRng } from './districts';

interface FluidTemplate {
  codename: string;
  handle: string;
  roleLabel: string;
  portraitUrl: string;
  bio: string;
  traits: CharacterTrait[];
  skill: number;
  discretion: number;
  loyalty: number;
  ambition: number;
  stress: number;
  dailyUpkeep: number;
}

const FLUID_TEMPLATES: FluidTemplate[] = [
  {
    codename: 'カゲ',
    handle: '@kage_04',
    roleLabel: '短期回収ランナー',
    portraitUrl: './assets/portraits/temp_hoodie.jpg',
    bio: 'SNSの「即日高収入・書類配送」募集経由で接触した22歳。指示内容の全体像は知らされていない。',
    traits: ['desperate', 'conscientious'],
    skill: 46,
    discretion: 42,
    loyalty: 52,
    ambition: 22,
    stress: 30,
    dailyUpkeep: 60_000,
  },
  {
    codename: 'モモ',
    handle: '@momo_99',
    roleLabel: '夜間スポット手配',
    portraitUrl: './assets/portraits/temp_suit.jpg',
    bio: 'レンタルスーツ姿で新都心に出入りする軽薄な若者。報酬さえ弾めば細かいことは気にしない。',
    traits: ['greedy', 'slick'],
    skill: 54,
    discretion: 48,
    loyalty: 45,
    ambition: 55,
    stress: 18,
    dailyUpkeep: 70_000,
  },
  {
    codename: 'リョウ',
    handle: '@ryo_x',
    roleLabel: '現場見張り・ドライバー',
    portraitUrl: './assets/portraits/temp_hoodie.jpg',
    bio: '元宅配ドライバー。気性が荒く運転は速いが、警察の職質に過敏でトラブルを起こしやすい。',
    traits: ['hotheaded', 'desperate'],
    skill: 60,
    discretion: 34,
    loyalty: 48,
    ambition: 36,
    stress: 26,
    dailyUpkeep: 75_000,
  },
  {
    codename: 'ユウタ',
    handle: '@yuta_quick',
    roleLabel: '雑務・電話待機',
    portraitUrl: './assets/portraits/temp_hoodie.jpg',
    bio: '奨学金返済に追われて連絡を入れてきた元学生。良心の呵責に弱く、荒事には耐えられない。',
    traits: ['conscientious', 'paranoid'],
    skill: 44,
    discretion: 50,
    loyalty: 55,
    ambition: 15,
    stress: 34,
    dailyUpkeep: 55_000,
  },
  {
    codename: 'シンジ',
    handle: '@shinji_v2',
    roleLabel: '偽装点検アルバイト',
    portraitUrl: './assets/portraits/temp_suit.jpg',
    bio: '営業経験があり口が達者。しかし自分の取り分が少ないと露骨に手を抜く。',
    traits: ['slick', 'greedy'],
    skill: 62,
    discretion: 52,
    loyalty: 42,
    ambition: 60,
    stress: 20,
    dailyUpkeep: 80_000,
  },
  {
    codename: 'ソウタ',
    handle: '@souta_77',
    roleLabel: '深夜倉庫シフト',
    portraitUrl: './assets/portraits/temp_hoodie.jpg',
    bio: '無口で目立たないが、状況が飲み込めないまま現場に放り込まれ不安を溜め込みやすい。',
    traits: ['desperate', 'paranoid'],
    skill: 49,
    discretion: 56,
    loyalty: 50,
    ambition: 20,
    stress: 32,
    dailyUpkeep: 60_000,
  },
  {
    codename: 'アキラ',
    handle: '@akira_neo',
    roleLabel: '即席リクルーター補佐',
    portraitUrl: './assets/portraits/temp_suit.jpg',
    bio: 'SNS上の小遣い稼ぎアカウントを量産する要領の良い男。忠誠心は薄いが仕事は早い。',
    traits: ['calculating', 'slick'],
    skill: 58,
    discretion: 55,
    loyalty: 44,
    ambition: 64,
    stress: 16,
    dailyUpkeep: 85_000,
  },
  {
    codename: 'ハルト',
    handle: '@haruto_k',
    roleLabel: '端末運搬係',
    portraitUrl: './assets/portraits/temp_hoodie.jpg',
    bio: '「ただ荷物を受け取るだけ」と聞かされて参加。家族に知られることを極端に恐れている。',
    traits: ['conscientious', 'desperate'],
    skill: 42,
    discretion: 45,
    loyalty: 54,
    ambition: 18,
    stress: 36,
    dailyUpkeep: 55_000,
  },
];

export function createRenaCharacter(
  tier: CharacterTier,
  supervisorId: string | null,
  doctrine: DoctrineId
): Character {
  const isFogged = supervisorId !== null;
  const trueLoyalty = doctrine === 'neon_fixer' ? 68 : 54;
  const trueSkill = 76;
  return {
    id: 'rena',
    codename: 'レナ',
    handle: '@velvet_rena',
    roleLabel: '歓楽街スカウト統括',
    portraitUrl: './assets/portraits/rena.jpg',
    bio: '霞ヶ浜の夜を仕切る情報通のスカウト統括。人脈と色気で若者を集めるが、自分の取り分と序列にはシビア。氷室とは犬猿の仲。',
    isNamed: true,
    tier,
    supervisorId,
    status: 'idle',
    homeDistrict: 'kasumigahama',
    activeOperationId: null,
    skill: trueSkill,
    discretion: 68,
    loyalty: trueLoyalty,
    ambition: 84,
    stress: 18,
    skimmedTotal: 0,
    isFogged,
    lastAuditDay: isFogged ? 0 : 1,
    reportedLoyalty: isFogged ? clamp(trueLoyalty + 16, 0, 100) : trueLoyalty,
    reportedSkill: isFogged ? clamp(trueSkill + 8, 1, 100) : trueSkill,
    traits: ['ambitious', 'slick', 'greedy'],
    relationships: {
      himuro: -40,
      ken: 30,
      misaki: 5,
      kuroda: 15,
      takeru: 10,
    },
    dailyUpkeep: 220_000,
    unpaidCount: 0,
    missionsCompleted: 0,
  };
}

export function createInitialCharacters(doctrine: DoctrineId): Character[] {
  const himuroLoyalty =
    doctrine === 'ghost_architect' ? 66 : doctrine === 'ruthless_broker' ? 52 : 58;
  const kenLoyalty =
    doctrine === 'neon_fixer' ? 84 : doctrine === 'ruthless_broker' ? 64 : 74;
  const misakiLoyalty =
    doctrine === 'ghost_architect' ? 82 : doctrine === 'neon_fixer' ? 68 : 62;
  const kurodaLoyalty = doctrine === 'ruthless_broker' ? 66 : 48;

  const himuro: Character = {
    id: 'himuro',
    codename: '氷室',
    handle: '@cold_ledger',
    roleLabel: '仲介統括（元コンサル）',
    portraitUrl: './assets/portraits/himuro.jpg',
    bio: '元大手経営コンサルタント。非合法シノギを「KPIと損益分岐点」で語る男。現場の末端を数値でしか見ないため反発も多い。',
    isNamed: true,
    tier: 'coordinator',
    supervisorId: null,
    status: 'idle',
    homeDistrict: 'shintoshin',
    activeOperationId: null,
    skill: 82,
    discretion: 78,
    loyalty: himuroLoyalty,
    ambition: 86,
    stress: 14,
    skimmedTotal: 0,
    isFogged: false,
    lastAuditDay: 1,
    reportedLoyalty: himuroLoyalty,
    reportedSkill: 82,
    traits: ['ambitious', 'calculating', 'slick'],
    relationships: {
      ken: -35,
      rena: -40,
      misaki: 10,
      kuroda: 20,
      takeru: -15,
    },
    dailyUpkeep: 250_000,
    unpaidCount: 0,
    missionsCompleted: 0,
    lastAutonomousNote: '「案件の標準化を進めています。末端の士気は問題ありません（書類上は）。」',
  };

  const ken: Character = {
    id: 'ken',
    codename: '鉄腕のケン',
    handle: '@iron_ken',
    roleLabel: '歓楽街の顔役',
    portraitUrl: './assets/portraits/ken.jpg',
    bio: '黒川裏町と霞ヶ浜の裏路地を知る武闘派のまとめ役。義理堅く頼れるが短気で、コンサル気取りの氷室を毛嫌いしている。',
    isNamed: true,
    tier: 'direct',
    supervisorId: null,
    status: 'idle',
    homeDistrict: 'kurokawa',
    activeOperationId: null,
    skill: 74,
    discretion: 54,
    loyalty: kenLoyalty,
    ambition: 42,
    stress: 20,
    skimmedTotal: 0,
    isFogged: false,
    lastAuditDay: 1,
    reportedLoyalty: kenLoyalty,
    reportedSkill: 74,
    traits: ['loyal', 'hotheaded'],
    relationships: {
      himuro: -35,
      rena: 30,
      misaki: 15,
      kuroda: -10,
      takeru: 20,
    },
    dailyUpkeep: 200_000,
    unpaidCount: 0,
    missionsCompleted: 0,
  };

  const misaki: Character = {
    id: 'misaki',
    codename: 'ミサキ',
    handle: '@zero_signal',
    roleLabel: '情報・暗号担当',
    portraitUrl: './assets/portraits/misaki.jpg',
    bio: '秘匿端末とダミー回線を組む技術者。極めて慎重で口が堅いが、警察の足音が近づくと誰よりも早く見切りをつけて姿を消す。',
    isNamed: true,
    tier: 'direct',
    supervisorId: null,
    status: 'idle',
    homeDistrict: 'shintoshin',
    activeOperationId: null,
    skill: 79,
    discretion: 92,
    loyalty: misakiLoyalty,
    ambition: 34,
    stress: 22,
    skimmedTotal: 0,
    isFogged: false,
    lastAuditDay: 1,
    reportedLoyalty: misakiLoyalty,
    reportedSkill: 79,
    traits: ['paranoid', 'calculating'],
    relationships: {
      himuro: 10,
      ken: 15,
      rena: 5,
      kuroda: -20,
      takeru: 5,
    },
    dailyUpkeep: 180_000,
    unpaidCount: 0,
    missionsCompleted: 0,
  };

  const takeru: Character = {
    id: 'takeru',
    codename: 'タケル',
    handle: '@tkr_22',
    roleLabel: '借金持ちの実行役',
    portraitUrl: './assets/portraits/takeru.jpg',
    bio: '生活費と多重債務の穴埋めのために氷室のラインへ流れてきた22歳。根は真面目で良心が痛むため、荒事や未払いが続くと限界を迎えやすい。',
    isNamed: true,
    tier: 'subordinate',
    supervisorId: 'himuro',
    status: 'idle',
    homeDistrict: 'sakuradai',
    activeOperationId: null,
    skill: 48,
    discretion: 44,
    loyalty: 46,
    ambition: 18,
    stress: 42,
    skimmedTotal: 0,
    isFogged: true,
    lastAuditDay: 0,
    reportedLoyalty: 70, // Himuro inflates his subordinate metrics
    reportedSkill: 56,
    traits: ['desperate', 'conscientious'],
    relationships: {
      himuro: -20,
      ken: 20,
      misaki: 5,
      rena: 10,
      kuroda: -15,
    },
    dailyUpkeep: 70_000,
    unpaidCount: 0,
    missionsCompleted: 0,
  };

  const kuroda: Character = {
    id: 'kuroda',
    codename: '黒田',
    handle: '@broker_k',
    roleLabel: '外部ブローカー・道具屋',
    portraitUrl: './assets/portraits/kuroda.jpg',
    bio: '指定暴力団「蒼龍会」の周辺にも顔が利く独立系ブローカー。案件ごとの取り分を要求する守銭奴だが、厄介な汚れ仕事の抜け道を知っている。',
    isNamed: true,
    tier: 'external',
    supervisorId: null,
    status: 'idle',
    homeDistrict: 'konan',
    activeOperationId: null,
    skill: 77,
    discretion: 65,
    loyalty: kurodaLoyalty,
    ambition: 74,
    stress: 12,
    skimmedTotal: 0,
    isFogged: false,
    lastAuditDay: 1,
    reportedLoyalty: kurodaLoyalty,
    reportedSkill: 77,
    traits: ['greedy', 'calculating'],
    relationships: {
      himuro: 20,
      ken: -10,
      misaki: -20,
      rena: 15,
      takeru: -10,
    },
    dailyUpkeep: 0,
    unpaidCount: 0,
    missionsCompleted: 0,
  };

  // Initial fluid subordinate under Himuro so delegation + information fog is tangible on Day 1
  const initialTemp = createFluidRecruit(1, 'himuro', 'sakuradai');

  const baseRoster: Character[] = [himuro, ken, misaki];

  if (doctrine === 'neon_fixer') {
    baseRoster.push(createRenaCharacter('direct', null, doctrine));
  }

  baseRoster.push(takeru, initialTemp, kuroda);
  return baseRoster;
}

export function createFluidRecruit(
  nextId: number,
  supervisorId: string | null,
  homeDistrict: DistrictId
): Character {
  const rng = createSeededRng(nextId * 3137 + homeDistrict.length * 97);
  const templateIndex = (nextId - 1) % FLUID_TEMPLATES.length;
  const tmpl = FLUID_TEMPLATES[templateIndex];
  const suffix = nextId > FLUID_TEMPLATES.length ? `_${nextId}` : '';

  const skillJitter = Math.round((rng() - 0.5) * 10);
  const loyaltyJitter = Math.round((rng() - 0.5) * 10);
  const trueSkill = clamp(tmpl.skill + skillJitter, 30, 82);
  const trueLoyalty = clamp(tmpl.loyalty + loyaltyJitter, 25, 80);
  const isFogged = supervisorId !== null;

  return {
    id: `temp_${String(nextId).padStart(2, '0')}`,
    codename: `${tmpl.codename}${suffix}`,
    handle: suffix ? `${tmpl.handle}${suffix}` : tmpl.handle,
    roleLabel: tmpl.roleLabel,
    portraitUrl: tmpl.portraitUrl,
    bio: tmpl.bio,
    isNamed: false,
    tier: 'subordinate',
    supervisorId,
    status: 'idle',
    homeDistrict,
    activeOperationId: null,
    skill: trueSkill,
    discretion: clamp(tmpl.discretion + Math.round((rng() - 0.5) * 8), 25, 78),
    loyalty: trueLoyalty,
    ambition: tmpl.ambition,
    stress: tmpl.stress,
    skimmedTotal: 0,
    isFogged,
    lastAuditDay: isFogged ? 0 : 1,
    // Fogged temps appear cleaner/more loyal via supervisor filter
    reportedLoyalty: isFogged ? clamp(trueLoyalty + 18, 0, 100) : trueLoyalty,
    reportedSkill: isFogged ? clamp(trueSkill + 9, 1, 100) : trueSkill,
    traits: [...tmpl.traits],
    relationships: supervisorId ? { [supervisorId]: 5 } : {},
    dailyUpkeep: tmpl.dailyUpkeep,
    unpaidCount: 0,
    missionsCompleted: 0,
  };
}
