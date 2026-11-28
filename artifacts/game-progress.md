# 『トクリュウ』 Director Overhaul Progress

## 1. Design Brief (抜本リデザイン方針)
- **Player Promise**: 匿名の元締め『白紙』として、14日間の裏社会を「2タップの発注」と「一瞬の人間ドラマ決断」でテンポよく回しながら、裏切り・中抜き・T3捜査網を捌いて ¥2,500万 を稼ぎ逃げ切るネオノワール戦略シム。
- **Target Feeling**: 事務作業や待ち時間の退屈さを徹底排除し、「案件を出す → 街が動く → 結果とヤバい着信が飛び込む → 即決断」の**途切れない緊張と爽快なテンポ**。
- **Primary Verb**: 案件へ担当を送り込み、次のビート（完了・着信・夜）へ進め、嘘と裏切りを捌く。
- **Secondary Verbs**: 裏取り調査、詰問／尻尾切り／泳がせ（弱み掌握）、組織再編（昇格・移管・報奨金）。
- **5–30 Second Loop**: 案件を1タップ選択 → 担当を1タップ実行 → `⏩ 次の出来事へ` で即結果着地 → 獲得演出＆ライブ着信に1タップ応答。
- **1–5 Minute Arc**: Day 1–2で直轄/委任の手触り → Day 3から中抜き・情報の霧・裏取り3択の心理戦 → 中盤以降はT3捜査網と幹部の野心・下剋上の危機管理 → 早期雲隠れ（¥1,400万）か満額完全逃亡（¥2,500万）の勝負。
- **How Next Decision Is Communicated**:
  1. 3D都市マップ上の脈動ピン＆地区ハイライト
  2. 画面下部の **1-button Context Action Bar**（次に押すべき最優先アクションが常に1つだけ明確）
  3. 緊急ドラマ・不整合検知時の **ライブ着信バナー**（顔写真＋切羽詰まった一言＋1タップ応答）
- **Non-Goals**: 実在犯罪手順の再現禁止。表計算的なマイクロ管理の追加禁止。

## 2. Core Loop Contract
- **Contract**: `Player dispatches an operative (direct or delegated) and advances to the next beat to earn ¥25M within 14 days while T3 trace, information fog, and crew betrayal create escalating pressure; success pays cash and unlocks leverage, failure spikes trace or loses crew and teaches via instant outcome feedback and quick restart.`
- **Code Verification Plan**:
  - `advanceToNextBeat(state)` in `src/sim/engine.ts` advances cleanly to next op completion / urgent message / 22:00 evening.
  - Real-input Playwright playtest verifies Title → Briefing → 2-tap Dispatch → Next-Beat Fast Forward → Live Call / Outcome Toast → Organization Tab (Roster & Graph) → Evening Report → Day 2.

## 3. Structural Overhaul Checklist
- [x] **Sim**: Add `advanceToNextBeat(state)` + unit tests (`src/sim/engine.ts`, `src/sim/__tests__/engine.test.ts` — 21/21 pass)
- [x] **3D Feel**: Add trauma shake, FOV punch, and dispatch/success/bust VFX triggers (`src/scene/CityScene.ts`)
- [x] **HUD Simplification**: Focus TopHud on 3 core pillars (裏資金 / T3捜査網 / 統制力), move 社会被害 to MENU & Evening Report, add HUD counter punch (`src/components/TopHud.tsx`)
- [x] **3-Tab Dock + Unified Organization**: Merge 人員 & 関係網 into single `組織・相関` tab with `メンバー` ⇄ `組織相関図` switch, simplify crew card actions behind `人事・処分 ▼` (`src/components/CrewPanel.tsx`, `src/components/NetworkGraphModal.tsx`, `src/App.tsx`)
- [x] **Live Flow & Context CTA**: Create `LiveActionOverlay.tsx` (Primary Next-Action Pill + Incoming Urgent Call Banner + Outcome Burst Toast with HUD counter punch) anchored cleanly above dock on both desktop (`verticalGap: 9px`) and mobile (`src/components/LiveActionOverlay.tsx`, `src/App.tsx`, `src/styles/hud.css`)
- [x] **QA & Deploy**: 21/21 Vitest + `pnpm typecheck` + `pnpm build` + Playwright mobile/desktop E2E + subagent 6-screenshot visual QA + P1 fixes verified + GitHub Pages deploy.

