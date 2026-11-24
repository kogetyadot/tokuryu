export type DistrictId =
  | 'kasumigahama'
  | 'shintoshin'
  | 'konan'
  | 'sakuradai'
  | 'kurokawa'
  | 'chuo';

export type DoctrineId = 'ghost_architect' | 'neon_fixer' | 'ruthless_broker';

export type CharacterTier = 'direct' | 'coordinator' | 'subordinate' | 'external';

export type CharacterStatus =
  | 'idle'
  | 'on_mission'
  | 'arrested'
  | 'fled'
  | 'betrayed'
  | 'cut_off';

export type CharacterTrait =
  | 'calculating'
  | 'hotheaded'
  | 'paranoid'
  | 'conscientious'
  | 'greedy'
  | 'loyal'
  | 'ambitious'
  | 'desperate'
  | 'slick';

export interface Character {
  id: string;
  codename: string;
  handle: string;
  roleLabel: string;
  portraitUrl: string;
  bio: string;
  isNamed: boolean;
  tier: CharacterTier;
  supervisorId: string | null;
  status: CharacterStatus;
  homeDistrict: DistrictId;
  activeOperationId: string | null;
  // True underlying state
  skill: number; // 1-100
  discretion: number; // 1-100
  loyalty: number; // 0-100
  ambition: number; // 0-100
  stress: number; // 0-100 (guilt / fear / burnout)
  skimmedTotal: number; // Yen secretly pocketed
  // Information asymmetry
  isFogged: boolean;
  lastAuditDay: number;
  reportedLoyalty: number;
  reportedSkill: number;
  // Dynamics
  traits: CharacterTrait[];
  relationships: Record<string, number>; // -100 to +100
  dailyUpkeep: number; // Yen
  unpaidCount: number;
  missionsCompleted: number;
  lastAutonomousNote?: string;
}

export type OperationCategory =
  | 'fraud_mirage'
  | 'bogus_repair'
  | 'nightlife_ring'
  | 'fenced_goods'
  | 'cyber_parlor'
  | 'smash_grab'
  | 'front_business';

export type PayPolicy = 'fair' | 'stingy' | 'exploit';

export interface OperationOutcome {
  success: boolean;
  actualProfit: number;
  reportedProfit: number;
  actualTraceDelta: number;
  actualHarmDelta: number;
  incidentOccurred: boolean;
  incidentHiddenInReport: boolean;
  arrestedCharId?: string;
  summary: string;
}

export interface Operation {
  id: string;
  title: string;
  category: OperationCategory;
  districtId: DistrictId;
  flavor: string;
  estimatedYield: number; // Yen
  traceRisk: number; // 1-30
  harmImpact: number; // 0-25
  difficulty: number; // 20-95
  durationHours: number; // in-game hours
  expiresDay: number;
  status: 'available' | 'active' | 'completed' | 'failed' | 'busted';
  assignedLeadId: string | null;
  assignedSubId: string | null;
  delegatedViaId: string | null; // if run through a coordinator
  payPolicy: PayPolicy;
  progress: number; // 0..1
  worldPos: [number, number]; // [x, z] in 3D city space
  actualOutcome?: OperationOutcome;
}

export type MessageType = 'report' | 'drama' | 'police' | 'rival' | 'system' | 'audit';

export interface MessageChoice {
  id: string;
  label: string;
  hint: string;
  cost?: number;
  tone: 'pragmatic' | 'ruthless' | 'generous' | 'audit';
}

export interface PhoneMessage {
  id: string;
  day: number;
  hour: number;
  senderId: string | null;
  senderName: string;
  senderRole?: string;
  senderPortrait?: string;
  type: MessageType;
  subject: string;
  body: string;
  read: boolean;
  resolved: boolean;
  isUrgent?: boolean;
  // Lie / Information asymmetry system
  containsLie?: boolean;
  lieType?: 'skimming' | 'coverup' | 'blame_shift' | 'false_loyalty';
  lieHint?: string;
  linkedNewsId?: string;
  linkedOpId?: string;
  skimmedAmount?: number;
  audited?: boolean;
  auditResultText?: string;
  confronted?: boolean;
  choices?: MessageChoice[];
}

export interface NewsItem {
  id: string;
  day: number;
  headline: string;
  subhead: string;
  districtId: DistrictId | null;
  severity: 'info' | 'warning' | 'breaking';
  relatedOpId?: string;
  contradictsMessageId?: string;
  isSatire?: boolean;
}

export interface DistrictState {
  id: DistrictId;
  name: string;
  englishName: string;
  tagline: string;
  center: [number, number];
  heat: number; // 0-100
  decay: number; // 0-100
  influence: number; // 0-100
  accentColor: string;
}

export interface DaySummary {
  day: number;
  reportedIncome: number;
  actualIncome: number;
  hiddenSkimSuspected: boolean;
  upkeepPaid: number;
  netCashDelta: number;
  traceDelta: number;
  controlDelta: number;
  harmDelta: number;
  headline: NewsItem;
  autonomousLogs: string[];
}

export type EndingId =
  | 'vanished_ghost'
  | 'quiet_exit'
  | 't3_takedown'
  | 'internal_coup'
  | 'bankrupt'
  | 'hollow_empire';

export interface CharacterFate {
  charId: string;
  codename: string;
  roleLabel: string;
  portraitUrl: string;
  fate: string;
}

export interface EndingReport {
  id: EndingId;
  title: string;
  subtitle: string;
  newspaperHeadline: string;
  description: string;
  rank: 'S' | 'A' | 'B' | 'C' | 'D';
  score: number;
  characterFates: CharacterFate[];
  timelineHighlights: string[];
}

export interface GameStats {
  totalEarned: number;
  totalSkimmedCaught: number;
  liesExposed: number;
  tempsLost: number;
  opsCompleted: number;
  opsBusted: number;
  autonomousIncidents: number;
}

export interface DoctrineConfig {
  id: DoctrineId;
  name: string;
  english: string;
  tagline: string;
  bonuses: string[];
  tradeoff: string;
  startingCash: number;
  directCapacity: number;
  startingTrace: number;
  startingControl: number;
  auditCost: number;
}

export interface GameState {
  phase: 'title' | 'playing' | 'evening' | 'ended';
  doctrine: DoctrineId;
  day: number;
  maxDays: number;
  hour: number; // 8.0 to 22.0
  speed: 0 | 1 | 2;
  cash: number;
  targetCash: number;
  earlyExitCash: number;
  control: number; // 0-100
  policeTrace: number; // 0-100
  cityHarm: number; // 0-100
  directCapacity: number;
  auditCost: number;
  districts: Record<DistrictId, DistrictState>;
  characters: Character[];
  operations: Operation[];
  messages: PhoneMessage[];
  news: NewsItem[];
  lastDaySummary: DaySummary | null;
  timeline: { day: number; text: string }[];
  ending: EndingReport | null;
  stats: GameStats;
  dailyReportedIncome: number;
  dailyActualIncome: number;
  dailyStartTrace: number;
  dailyStartControl: number;
  dailyStartHarm: number;
  dailyAutonomousLogs: string[];
  auditCounter: number;
  nextEntityId: number;
}

export interface SceneCallbacks {
  onSelectDistrict: (districtId: DistrictId) => void;
  onSelectOperation: (opId: string) => void;
  onClearSelection: () => void;
}
