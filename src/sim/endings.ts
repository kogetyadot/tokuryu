import type {
  EndingId,
  EndingReport,
  GameState,
} from '../types/game';
import { formatYen } from './districts';

export function evaluateEnding(
  state: GameState,
  manualExit = false,
  ignoreBankrupt = false
): EndingReport | null {
  let endingId: EndingId | null = null;

  if (state.policeTrace >= 100) {
    endingId = 't3_takedown';
  } else if (state.control <= 0) {
    endingId = 'internal_coup';
  } else if (state.cash < 0 && state.day >= 2) {
    if (ignoreBankrupt) return null;
    endingId = 'bankrupt';
  } else if (manualExit && state.cash >= state.earlyExitCash) {
    endingId = 'quiet_exit';
  } else if (state.day >= state.maxDays && state.phase === 'evening') {
    if (state.cash >= state.targetCash && state.policeTrace < 65) {
      endingId = 'vanished_ghost';
    } else if (state.cash >= state.earlyExitCash && state.policeTrace < 85) {
      endingId = 'quiet_exit';
    } else {
      endingId = 'hollow_empire';
    }
  }

  if (!endingId) return null;

  const dayScale = Math.min(1, state.day / state.maxDays);
  const cashScore = Math.max(0, Math.min(4000, Math.round(state.cash / 10_000) * 1.2));
  const stealthBonus = Math.max(0, Math.round((100 - state.policeTrace) * 28 * dayScale));
  const controlBonus = Math.round(state.control * 18 * dayScale);
  const auditBonus = state.stats.liesExposed * 350;
  const harmPenalty = Math.round(state.cityHarm * 15);
  const bustPenalty = state.stats.opsBusted * 400;
  const rawScore = Math.max(
    100,
    Math.round(cashScore + stealthBonus + controlBonus + auditBonus - harmPenalty - bustPenalty)
  );

  const isWin = endingId === 'vanished_ghost' || endingId === 'quiet_exit';
  const isFailure =
    endingId === 'bankrupt' ||
    endingId === 't3_takedown' ||
    endingId === 'internal_coup';

  let rank: EndingReport['rank'] = 'D';
  if (endingId === 'vanished_ghost' && rawScore >= 7500) rank = 'S';
  else if (isWin && rawScore >= 5800) rank = 'A';
  else if (isWin || rawScore >= 4200) rank = 'B';
  else if (rawScore >= 2400) rank = 'C';

  if (isFailure) {
    const canEarnC = state.day >= 10 && state.stats.opsCompleted >= 6;
    if (!canEarnC) {
      rank = 'D';
    } else if (rank === 'S' || rank === 'A' || rank === 'B') {
      rank = 'C';
    }
  }

  const meta: Record<
    EndingId,
    { title: string; subtitle: string; headline: string; desc: string }
  > = {
    vanished_ghost: {
      title: '霧散した中核（完全逃亡）',
      subtitle: 'VANISHED GHOST — S級匿名離脱',
      headline: '「海湾市の匿名犯罪網、中核人物の正体掴めぬまま忽然と消滅」',
      desc: `目標額を超える資金（${formatYen(state.cash)}）を確保し、T3特捜班の捜査線が中枢に届く前にすべての秘匿回線と仲介層を焼き切った。ニュースでは残された実行役たちの供述が食い違い、あなたの名前はどこにも載らなかった。`,
    },
    quiet_exit: {
      title: '静かなる手仕舞い',
      subtitle: 'QUIET EXIT — 損切り撤退',
      headline: '「海湾市内の不審な詐欺・強奪関連案件が急減、組織は解散か」',
      desc: `深追いを避け、手元資金${formatYen(state.cash)}を抱えて早期に回線を閉じた。完璧な支配者にはならなかったが、トクリュウという底なし沼から生き延びて足を抜いた数少ない勝者となった。`,
    },
    t3_takedown: {
      title: 'T3特捜班・一斉摘発',
      subtitle: 'T3 TAKEDOWN — 指示役検挙',
      headline: '【号外】海湾市警T3特捜班、匿名・流動型犯罪グループの指示役を逮捕',
      desc: `捜査線が100%に到達。佐伯警部補率いるT3特捜班が、末端の供述と通信履歴の矛盾からついにあなたの隠れ家へ踏み込んだ。「匿名で使い捨てれば逃げ切れる」という計算は、押収された端末の山とともに崩れ去った。`,
    },
    internal_coup: {
      title: '内部崩壊・下剋上',
      subtitle: 'INTERNAL COUP — 統制喪失',
      headline: '「海湾市の裏社会で仲間割れか、主要グループが突如機能停止」',
      desc: `統制力が0%に低下。幹部たちの不信と中抜きが臨界点を超え、あなたの指令は誰にも届かなくなった。残高も顧客名簿も、昨日まで部下だった者たちに持ち去られた。`,
    },
    bankrupt: {
      title: '資金ショート・空中分解',
      subtitle: 'BANKRUPT — 信用失墜',
      headline: '「報酬未払い相次ぐ闇ネットワーク、実行役の離反で自然消滅」',
      desc: `資金繰りに行き詰まり、幹部への上納も末端への報酬も払えなくなった。カネでしか繋がっていなかった流動型ネットワークは、支払いが止まった瞬間に砂のように崩れ落ちた。`,
    },
    hollow_empire: {
      title: '空洞の帝国',
      subtitle: 'HOLLOW EMPIRE — 期限切れの迷走',
      headline: '「海湾市の連続事件、実行役の検挙続くも実態は支離滅裂」',
      desc: `${state.maxDays}日間の運営を終えたものの、手元に残ったのは目標に届かぬ資金（${formatYen(state.cash)}）と、傷つき疑心暗鬼に陥った空虚なネットワークだけだった。誰もあなたを信じておらず、次の捜査の手がすぐ後ろに迫っている。`,
    },
  };

  const namedIds = ['himuro', 'ken', 'misaki', 'takeru', 'rena', 'kuroda'];
  const characterFates = state.characters
    .filter((c) => c.isNamed && namedIds.includes(c.id))
    .map((c) => {
      let fate = '';
      if (c.status === 'arrested') {
        fate = '作戦中の失敗により県警に身柄を拘束。取調べで「上の人物の顔は知らない」と繰り返している。';
      } else if (c.status === 'cut_off') {
        fate = '「トカゲの尻尾切り」で切り離され、組織から完全に孤立。後に別件で職質を受け行方を晦ました。';
      } else if (c.status === 'betrayed') {
        fate = '組織への恨みから警察相談窓口や捜査員へ証言を提供。ネットワーク崩壊の引き金を引いた。';
      } else if (c.status === 'fled') {
        fate = '騒動が大きくなる前にSIMカードを折り、海湾市から姿を消した。';
      } else if (endingId === 't3_takedown') {
        fate =
          c.skimmedTotal > 300_000
            ? `一斉摘発の直前に密かに中抜きした${formatYen(c.skimmedTotal)}を持って逃亡を図ったが、駅構内で確保された。`
            : 'T3特捜班の同時家宅捜索により検挙。グループ内での役割が法廷で追及されている。';
      } else if (c.id === 'himuro') {
        fate =
          c.skimmedTotal > 400_000
            ? `ちゃっかり中抜きした${formatYen(c.skimmedTotal)}を元手に、別名義で「コンプライアンス・コンサル会社」を設立した。`
            : '全データが消去された後、次の“最適化”先を探して再び高層ビルのカフェに姿を現した。';
      } else if (c.id === 'ken') {
        fate =
          c.loyalty >= 65
            ? '最後まであなたの義理を通し、黒川裏町の小さなスナックの裏手で静かに店番を続けている。'
            : '「やり方がセコすぎる」と言い残し、昔馴染みのシマへ戻っていった。';
      } else if (c.id === 'misaki') {
        fate =
          'すべてのログを完全消去したあと、架空のパスポートで海外のレンタルサーバー管理者を名乗っているとの噂がある。';
      } else if (c.id === 'takeru') {
        fate =
          c.stress >= 60
            ? '深い後悔とともに法テラスと#9110へ相談し、生活再建の支援を受け始めた。'
            : '危うい綱渡りからなんとか生還し、日雇いの清掃作業員として地道に借金を返し始めた。';
      } else if (c.id === 'rena') {
        fate =
          c.loyalty >= 65
            ? '霞ヶ浜のVIPラウンジのオーナーの座をちゃっかり手に入れ、夜の街で次の顔役として君臨している。'
            : '氷室への悪態をSNSの裏垢に残したまま、別の夜の街へ移っていった。';
      } else {
        fate =
          '「俺はただの道具屋だ」とうそぶき、何事もなかったかのように蒼龍会周辺と新しい取引を続けている。';
      }

      return {
        charId: c.id,
        codename: c.codename,
        roleLabel: c.roleLabel,
        portraitUrl: c.portraitUrl,
        fate,
      };
    });

  const info = meta[endingId];
  return {
    id: endingId,
    title: info.title,
    subtitle: info.subtitle,
    newspaperHeadline: info.headline,
    description: info.desc,
    rank,
    score: rawScore,
    characterFates,
    timelineHighlights: state.timeline.slice(-8).map((t) => `Day ${t.day}: ${t.text}`),
  };
}
