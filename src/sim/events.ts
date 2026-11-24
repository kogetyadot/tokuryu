import type {
  Character,
  GameState,
  PhoneMessage,
} from '../types/game';
import { clamp, formatYen } from './districts';
import { createRenaCharacter } from './characters';

function hasActiveChoiceTag(messages: PhoneMessage[], prefix: string): boolean {
  return messages.some((m) => m.id.startsWith(prefix) && !m.resolved);
}

function hasTriggeredEver(messages: PhoneMessage[], prefix: string): boolean {
  return messages.some((m) => m.id.startsWith(prefix));
}

function addRelationshipDelta(
  characters: Character[],
  idA: string,
  idB: string,
  delta: number
): Character[] {
  return characters.map((c) => {
    if (c.id === idA) {
      return {
        ...c,
        relationships: {
          ...c.relationships,
          [idB]: clamp((c.relationships[idB] ?? 0) + delta, -100, 100),
        },
      };
    }
    if (c.id === idB) {
      return {
        ...c,
        relationships: {
          ...c.relationships,
          [idA]: clamp((c.relationships[idA] ?? 0) + delta, -100, 100),
        },
      };
    }
    return c;
  });
}

export function runAutonomousCrewTick(state: GameState): GameState {
  let nextState = state;
  let characters = state.characters.map((c) => ({ ...c, relationships: { ...c.relationships } }));
  let messages = [...state.messages];
  let news = [...state.news];
  let timeline = [...state.timeline];
  const logs = [...state.dailyAutonomousLogs];
  let nextId = state.nextEntityId;
  let cash = state.cash;
  let policeTrace = state.policeTrace;
  let control = state.control;
  let autonomousIncidents = state.stats.autonomousIncidents;

  const isCharActive = (c: Character) => c.status === 'idle' || c.status === 'on_mission';
  const findChar = (id: string) => characters.find((c) => c.id === id);

  // 1. Day 2: Rena joins automatically if she wasn't recruited at start (non-neon_fixer)
  if (
    state.day >= 2 &&
    !characters.some((c) => c.id === 'rena') &&
    !hasTriggeredEver(messages, 'evt_rena_join')
  ) {
    const directUsed = characters.filter(
      (c) =>
        isCharActive(c) &&
        (c.tier === 'direct' ||
          c.tier === 'coordinator' ||
          (c.tier === 'subordinate' && c.supervisorId === null))
    ).length;
    const hasDirectRoom = directUsed < state.directCapacity;
    const renaTier = hasDirectRoom ? 'direct' : 'external';
    const rena = createRenaCharacter(renaTier, null, state.doctrine);
    characters.push(rena);
    messages.unshift({
      id: `evt_rena_join_${nextId++}`,
      day: state.day,
      hour: state.hour,
      senderId: rena.id,
      senderName: rena.codename,
      senderRole: rena.roleLabel,
      senderPortrait: rena.portraitUrl,
      type: 'drama',
      subject: '霞ヶ浜のレナより合流の挨拶',
      body: hasDirectRoom
        ? '「話はミサキちゃんから聞いたよ。あんたのライン、面白そうじゃない。霞ヶ浜の夜回り枠、あたしにも一口乗せてよ。ただし——あの元コンサルの氷室さんとは机を並べる気はないから、そこはよろしくね。」'
        : '「話はミサキちゃんから聞いたよ。直轄枠が満杯らしいから、空きが出るまではフリーの外部協力枠として霞ヶ浜の案件を拾わせてもらうわ。ただし——あの元コンサルの氷室さんとは机を並べる気はないから、そこはよろしくね。」',
      read: false,
      resolved: true,
    });
    logs.push(
      hasDirectRoom
        ? 'スカウト統括・レナが直轄ラインに合流（氷室との不仲に注意）。'
        : 'スカウト統括・レナが直轄枠満杯のため外部協力枠として合流（氷室との不仲に注意）。'
    );
    timeline.push({ day: state.day, text: '霞ヶ浜のスカウト統括「レナ」がネットワークに合流。' });
    autonomousIncidents++;
  }

  // 2. Detective Saiki / T3 Special Taskforce warnings at 40%, 65%, 85%
  const thresholds: { level: number; tag: string; title: string; headline: string; body: string }[] = [
    {
      level: 40,
      tag: 'evt_t3_40',
      title: '【警戒警報】T3特捜班が海湾市の通信解析を開始',
      headline: '県警T3特捜班、海湾市内の不審な匿名口座網を重点監視',
      body:
        'ミサキより緊急共有。「海湾市警・T3特捜班の佐伯警部補が、複数の匿名資金移動に同じ“設計癖”があると記者会見で匂わせました。捜査線40%突破。しばらくは派手なシノギや使い捨て人員の乱用に注意してください。」',
    },
    {
      level: 65,
      tag: 'evt_t3_65',
      title: '【緊急警告】佐伯警部補が仮装身分捜査を投入',
      headline: 'T3特捜班が海湾市に覆面捜査官を増派、指示役の特定へ包囲網',
      body:
        'ミサキより緊急暗号電。「まずい。佐伯警部補の班が闇バイト募集を装った仮装身分捜査を本格化させています（捜査線65%超）。不満を持つ末端や外注ブローカーが踏み台にされたら一気に中枢まで抜かれます。」',
    },
    {
      level: 85,
      tag: 'evt_t3_85',
      title: '【最高警戒】家宅捜索令状請求の噂——撤退か切り捨てか',
      headline: '【速報】海湾市警T3特捜班、匿名犯罪ネットワークの中核特定か',
      body:
        'ミサキより。「捜査線85%超。佐伯が令状を握る寸前です。誰かを『トカゲの尻尾切り』で切り離すか、今すぐ手仕舞いの準備に入らないと、全員まとめて持っていかれます！」',
    },
  ];

  for (const t of thresholds) {
    if (policeTrace >= t.level && !hasTriggeredEver(messages, t.tag)) {
      messages.unshift({
        id: `${t.tag}_${nextId++}`,
        day: state.day,
        hour: state.hour,
        senderId: 'saiki',
        senderName: '佐伯 剛（T3特捜班・警戒網）',
        senderRole: '県警トクリュウ専従班',
        senderPortrait: './assets/portraits/saiki.jpg',
        type: 'police',
        subject: t.title,
        body: t.body,
        read: false,
        resolved: true,
        isUrgent: true,
      });
      news.unshift({
        id: `news_t3_${t.level}_${nextId++}`,
        day: state.day,
        headline: t.headline,
        subhead: '佐伯警部補「末端の使い捨てで逃げ切れる時代は終わった。指示役の輪郭は見えている」',
        districtId: 'chuo',
        severity: t.level >= 65 ? 'breaking' : 'warning',
      });
      logs.push(`T3特捜班の佐伯警部補が捜査網を圧縮（捜査線 ${Math.round(policeTrace)}%）。`);
      timeline.push({ day: state.day, text: `T3特捜班の包囲網が ${t.level}% ラインに到達。` });
      autonomousIncidents++;
    }
  }

  // 3. Paranoid Misaki bolts if policeTrace > 82 and loyalty < 55
  let operations = state.operations.map((o) => ({ ...o }));
  const misaki = findChar('misaki');
  if (
    misaki &&
    isCharActive(misaki) &&
    policeTrace > 82 &&
    misaki.loyalty < 55 &&
    !hasTriggeredEver(messages, 'evt_misaki_bolt')
  ) {
    if (misaki.activeOperationId) {
      operations = operations.map((op) =>
        op.id === misaki.activeOperationId && op.status === 'active'
          ? { ...op, status: 'failed' as const }
          : op
      );
    }
    characters = characters.map((c) =>
      c.id === 'misaki'
        ? {
            ...c,
            status: 'fled',
            activeOperationId: null,
            lastAutonomousNote: '「限界。これ以上残れば私も道連れだわ。端末は焼き捨てたから追わないで。」',
          }
        : c
    );
    control = clamp(control - 8, 0, 100);
    messages.unshift({
      id: `evt_misaki_bolt_${nextId++}`,
      day: state.day,
      hour: state.hour,
      senderId: 'misaki',
      senderName: 'ミサキ',
      senderRole: '情報・暗号担当',
      senderPortrait: './assets/portraits/misaki.jpg',
      type: 'drama',
      subject: '【緊急離脱】@zero_signal の暗号チャンネルが消滅',
      body:
        '最後の自動消去メッセージが着信。「捜査線が82%を超えて私の忠誠度も限界を切った。プロの臆病者としてここで降りる。予備サーバーのパスワードは破棄済み。お元気で。」',
      read: false,
      resolved: true,
      isUrgent: true,
    });
    logs.push('情報担当ミサキが警察の接近を察知し、秘匿端末を破棄して逃亡した。');
    timeline.push({ day: state.day, text: 'ミサキが捜査線悪化を理由に音信不通・逃亡。' });
    autonomousIncidents++;
  }

  // 4. High-stress conscientious subordinate (Takeru or fluid temp) threatens #9110 or walkout
  const stressedSub = characters.find(
    (c) =>
      isCharActive(c) &&
      c.tier === 'subordinate' &&
      c.stress >= 68 &&
      (c.traits.includes('conscientious') || c.traits.includes('desperate'))
  );
  if (stressedSub && !hasActiveChoiceTag(messages, `evt_walkout_${stressedSub.id}`)) {
    const choiceCost = 350_000;
    messages.unshift({
      id: `evt_walkout_${stressedSub.id}_${nextId++}`,
      day: state.day,
      hour: state.hour,
      senderId: stressedSub.id,
      senderName: stressedSub.codename,
      senderRole: stressedSub.roleLabel,
      senderPortrait: stressedSub.portraitUrl,
      type: 'drama',
      subject: `【離脱危機】${stressedSub.codename}が精神的限界・#9110相談を示唆`,
      body: `震える声のボイスメモが転送されてきた。「こんな仕事だとは聞いていなかった……。家にも連絡が来そうで眠れない。もう抜けさせてほしい。もし脅して引き止めるなら、警察相談ダイヤル（#9110）に全部話すしかないかと思ってます……」`,
      read: false,
      resolved: false,
      isUrgent: true,
      choices: [
        {
          id: 'release_cleanly',
          label: '手切れ金を払わず静かに解放する',
          hint: '人員を1名失うが、通報リスクや捜査線悪化を抑えられる。',
          tone: 'pragmatic',
        },
        {
          id: 'pay_severance',
          label: `口止め・清算金を払って円満に外す（${formatYen(choiceCost)}）`,
          hint: '人員は離脱するが、T3への密告を完全に防ぎ統制への悪影響を和らげる。',
          cost: choiceCost,
          tone: 'generous',
        },
        {
          id: 'threaten_keep',
          label: '個人情報を盾に脅して現場に繋ぎ止める',
          hint: '目先の人員は残るが、強い反発・通報・検挙時の供述リスクが急増する。',
          tone: 'ruthless',
        },
      ],
    });
    logs.push(`${stressedSub.codename}がストレス限界に達し、離脱・#9110相談の危機が発生。`);
    autonomousIncidents++;
  }

  // 4b. High-stress direct operative burnout / friction warning
  const stressedDirect = characters.find(
    (c) => isCharActive(c) && c.tier === 'direct' && c.stress >= 70
  );
  if (
    stressedDirect &&
    !hasTriggeredEver(messages, `evt_burnout_${stressedDirect.id}_d${state.day}`)
  ) {
    messages.unshift({
      id: `evt_burnout_${stressedDirect.id}_d${state.day}_${nextId++}`,
      day: state.day,
      hour: state.hour,
      senderId: stressedDirect.id,
      senderName: stressedDirect.codename,
      senderRole: stressedDirect.roleLabel,
      senderPortrait: stressedDirect.portraitUrl,
      type: 'drama',
      subject: `【過労警告】${stressedDirect.codename}の判断力が鈍化（負荷${stressedDirect.stress}%）`,
      body: `${stressedDirect.codename}から苛立ち混じりの連絡。「立て続けに現場へ出すぎて頭が回らねえ。今の状態だと次のヤマでボロを出す恐れがあるぞ。しばらく休ませるか、手当でも弾んでくれ。」`,
      read: false,
      resolved: true,
    });
    logs.push(
      `直轄・${stressedDirect.codename}の負荷が${stressedDirect.stress}%に達し、判断力低下の警告が出た。`
    );
    autonomousIncidents++;
  }

  // 5. Rival clash: Himuro vs Rena (or Ken)
  const himuro = findChar('himuro');
  const rena = findChar('rena');
  const ken = findChar('ken');
  const rivalPair =
    himuro && isCharActive(himuro) && rena && isCharActive(rena) && (himuro.relationships.rena ?? 0) <= -30
      ? { a: himuro, b: rena }
      : himuro && isCharActive(himuro) && ken && isCharActive(ken) && (himuro.relationships.ken ?? 0) <= -30
      ? { a: himuro, b: ken }
      : null;

  if (
    rivalPair &&
    state.day >= 2 &&
    !hasActiveChoiceTag(messages, 'evt_rival_clash') &&
    !hasTriggeredEver(messages, `evt_rival_clash_d${state.day}`)
  ) {
    const { a, b } = rivalPair;
    messages.unshift({
      id: `evt_rival_clash_d${state.day}_${nextId++}`,
      day: state.day,
      hour: state.hour,
      senderId: a.id,
      senderName: `${a.codename} vs ${b.codename}`,
      senderRole: '内部対立アラート',
      senderPortrait: a.portraitUrl,
      type: 'drama',
      subject: `【内部対立】${a.codename}と${b.codename}が縄張りと経費で衝突`,
      body:
        b.id === 'rena'
          ? `氷室から長文のエクセル報告：「レナ氏の霞ヶ浜ラインはコンプライアンス意識が欠如し、雑費の水増しが顕著です。」直後にレナから追撃：「あのメガネ、現場の苦労も知らずに『暗号スマホ勉強会』の名目で高級焼肉の領収書を切ってるの、あんた知ってる？」`
          : `氷室からの報告：「鉄腕のケン氏の現場は属人的でログが残らず極めて危険です。」直後にケンから怒号のボイス：「あの野郎、俺のシマの名簿を勝手に買い叩いて『最適化』だァ？ どっちのやり方で回すかハッキリさせろ！」`,
      read: false,
      resolved: false,
      isUrgent: true,
      containsLie: true,
      lieType: 'blame_shift',
      choices: [
        {
          id: 'side_himuro',
          label: `${a.codename}の合理化案を支持する`,
          hint: `${a.codename}の忠誠+10・効率改善。ただし${b.codename}の忠誠と関係が急落。`,
          tone: 'pragmatic',
        },
        {
          id: 'side_rival',
          label: `${b.codename}の現場裁量を認める`,
          hint: `${b.codename}の忠誠+10・統制+3。ただし${a.codename}が根に持つ。`,
          tone: 'generous',
        },
        {
          id: 'punish_both',
          label: '両方から罰金を徴収して黙らせる（+¥30万）',
          hint: '現金+¥30万・統制+4。ただし両者の忠誠が下がる。',
          tone: 'ruthless',
        },
      ],
    });
    logs.push(`${a.codename}と${b.codename}の間で責任の押し付け合いが表面化した。`);
    autonomousIncidents++;
  }

  // 6. Satirical Skimming / Fake Expense Report ("暗号スマホ勉強会という名目の高級焼肉領収書")
  const greedyOfficer = characters.find(
    (c) =>
      isCharActive(c) &&
      (c.tier === 'coordinator' || c.tier === 'direct') &&
      (c.traits.includes('greedy') || c.traits.includes('ambitious') || c.traits.includes('slick')) &&
      c.loyalty < 78
  );
  if (
    greedyOfficer &&
    state.day >= 2 &&
    !hasTriggeredEver(messages, `evt_yakiniku_${greedyOfficer.id}`) &&
    !hasActiveChoiceTag(messages, 'evt_yakiniku')
  ) {
    const fakeExpense = 280_000;
    cash -= fakeExpense;
    greedyOfficer.skimmedTotal += fakeExpense;
    messages.unshift({
      id: `evt_yakiniku_${greedyOfficer.id}_${nextId++}`,
      day: state.day,
      hour: state.hour,
      senderId: greedyOfficer.id,
      senderName: greedyOfficer.codename,
      senderRole: greedyOfficer.roleLabel,
      senderPortrait: greedyOfficer.portraitUrl,
      type: 'report',
      subject: `【経費精算】セキュリティ研修費 ${formatYen(fakeExpense)} 処理完了`,
      body: `${greedyOfficer.codename}より事後報告。「末端の秘匿通信リテラシー向上のため『暗号スマホ勉強会（懇親枠）』を開催し、経費として${formatYen(fakeExpense)}を計上・引き落とし済みです。これで全員の意識が引き締まりました！」`,
      read: false,
      resolved: false,
      containsLie: true,
      lieType: 'skimming',
      skimmedAmount: fakeExpense,
      choices: [
        {
          id: 'approve_expense',
          label: '必要経費として承認する',
          hint: '関係は保たれるが、幹部の甘えと中抜き癖が助長される。',
          tone: 'generous',
        },
        {
          id: 'reject_expense',
          label: `私的流用を咎めて返金させる（+${formatYen(fakeExpense)}）`,
          hint: '裏取り後に詰問すれば統制+4・忠誠-6。証拠なし(未裏取り)で咎めると忠誠-16・統制-2。',
          tone: 'ruthless',
        },
      ],
    });
    news.unshift({
      id: `news_yakiniku_${nextId++}`,
      day: state.day,
      headline: '霞ヶ浜の高級焼肉店「深夜の謎の“IT勉強会”団体客がシャンパン12本」',
      subhead: '店員証言「パソコンは誰も開かず、名刺交換と時計自慢ばかりしていました」',
      districtId: 'kasumigahama',
      severity: 'info',
      contradictsMessageId: messages[0].id,
      isSatire: true,
    });
    messages[0].linkedNewsId = news[0].id;
    logs.push(`${greedyOfficer.codename}が「暗号スマホ勉強会」名目で謎の経費を計上した。`);
    autonomousIncidents++;
  }

  // 7. Front business comedy: Pancake cafe or Ramen shop goes viral!
  const activeFrontOp = state.operations.find(
    (o) => o.category === 'front_business' && (o.status === 'completed' || o.status === 'active')
  );
  if (
    activeFrontOp &&
    !hasTriggeredEver(messages, 'evt_front_viral')
  ) {
    messages.unshift({
      id: `evt_front_viral_${nextId++}`,
      day: state.day,
      hour: state.hour,
      senderId: 'misaki',
      senderName: 'ミサキ',
      senderRole: '情報・暗号担当',
      senderPortrait: './assets/portraits/misaki.jpg',
      type: 'drama',
      subject: `【珍事】フロント店「${activeFrontOp.title}」がSNSで大バズり`,
      body:
        'ミサキより困惑した連絡。「資金混ぜ込み用に作ったダミー店舗が、グルメ系インフルエンサーに『逆にエモい深夜の名店』として紹介され、現在40人待ちの行列ができています。アルバイトまで真面目に仕込みを始めました。どうします？」',
      read: false,
      resolved: false,
      choices: [
        {
          id: 'ride_hype',
          label: '行列を活かして帳簿の売上を堂々と水増しする',
          hint: '現金+¥90万、捜査線+2。皮肉なことにフロント事業として大成功する。',
          tone: 'pragmatic',
        },
        {
          id: 'close_quietly',
          label: '目立ちすぎるので「店主の腰痛」で臨時休業にする',
          hint: '捜査線-3、統制+3。せっかくの合法的カモフラージュを捨てることに。',
          tone: 'ruthless',
        },
      ],
    });
    news.unshift({
      id: `news_viral_${nextId++}`,
      day: state.day,
      headline: `海湾市グルメ通信：「${activeFrontOp.title}」に若者の長蛇の列`,
      subhead: 'SNSでは「店員の目つきが鋭すぎて逆に本格派」と謎の高評価が拡散中',
      districtId: activeFrontOp.districtId,
      severity: 'info',
      isSatire: true,
    });
    logs.push(`フロント店舗「${activeFrontOp.title}」が予期せぬ行列店になってしまった。`);
    autonomousIncidents++;
  }

  // 8. Rival Syndicate 蒼龍会 via Kuroda
  const kuroda = findChar('kuroda');
  if (
    kuroda &&
    isCharActive(kuroda) &&
    state.day >= 3 &&
    !hasTriggeredEver(messages, `evt_soryukai_d${state.day}`) &&
    !hasActiveChoiceTag(messages, 'evt_soryukai') &&
    state.day % 2 === 1
  ) {
    messages.unshift({
      id: `evt_soryukai_d${state.day}_${nextId++}`,
      day: state.day,
      hour: state.hour,
      senderId: kuroda.id,
      senderName: `${kuroda.codename}（蒼龍会筋）`,
      senderRole: kuroda.roleLabel,
      senderPortrait: kuroda.portraitUrl,
      type: 'rival',
      subject: '【外部案件】指定暴力団「蒼龍会」周辺からの共同シノギ打診',
      body:
        '黒田より暗号通話の要約。「港南埠頭の倉庫整理で、蒼龍会の若い衆が人手不足らしい。あんたのところの余剰ルートを貸せば手数料込みでまとまった現金を落とすと言っている。ただし、向こうの顔を立てないと後が面倒だぞ。」',
      read: false,
      resolved: false,
      isUrgent: true,
      choices: [
        {
          id: 'accept_soryukai',
          label: '共同案件を受けて一時金を得る（+¥160万）',
          hint: '現金+¥160万・黒田の忠誠+8。ただし警察捜査線+6、市民被害+3。',
          tone: 'pragmatic',
        },
        {
          id: 'decline_soryukai',
          label: '足がつく連携は丁寧に断る',
          hint: '捜査線-2・ミサキが評価。ただし黒田の機嫌と関係が-8下がる。',
          tone: 'generous',
        },
        {
          id: 'double_cross_fee',
          label: '仲介料を上乗せして強気に交渉する（+¥240万 / リスク大）',
          hint: '黒田の忠誠が低ければ蒼龍会との摩擦で統制-10＆捜査線+9。高ければ¥240万獲得。',
          tone: 'ruthless',
        },
      ],
    });
    logs.push('外部ブローカー黒田を通じて「蒼龍会」周辺からの接触があった。');
    autonomousIncidents++;
  }

  // 9. Unpaid wages automatic loyalty erosion
  characters = characters.map((c) => {
    if (c.unpaidCount > 0 && isCharActive(c)) {
      return {
        ...c,
        loyalty: clamp(c.loyalty - c.unpaidCount * 4, 0, 100),
        stress: clamp(c.stress + c.unpaidCount * 5, 0, 100),
      };
    }
    return c;
  });

  nextState = {
    ...state,
    cash,
    policeTrace: clamp(policeTrace, 0, 100),
    control: clamp(control, 0, 100),
    characters,
    operations,
    messages,
    news,
    timeline,
    dailyAutonomousLogs: logs,
    nextEntityId: nextId,
    stats: {
      ...state.stats,
      autonomousIncidents,
    },
  };

  return nextState;
}

export function resolveMessageChoice(
  state: GameState,
  messageId: string,
  choiceId: string
): GameState {
  const msg = state.messages.find((m) => m.id === messageId);
  if (!msg || msg.resolved) return state;

  let characters = state.characters.map((c) => ({ ...c, relationships: { ...c.relationships } }));
  let operations = state.operations.map((o) => ({ ...o }));
  let cash = state.cash;
  let control = state.control;
  let policeTrace = state.policeTrace;
  let cityHarm = state.cityHarm;
  let tempsLost = state.stats.tempsLost;
  const timeline = [...state.timeline];
  const logs = [...state.dailyAutonomousLogs];

  const choice = msg.choices?.find((ch) => ch.id === choiceId);
  if (choice?.cost && cash < choice.cost) {
    // Insufficient cash: ignore or cannot afford
    return state;
  }

  // Handle #9110 walkout dilemma
  if (msg.id.startsWith('evt_walkout_')) {
    const targetId = msg.senderId;
    const cancelTargetOp = (opId: string | null) => {
      if (!opId) return;
      operations = operations.map((op) =>
        op.id === opId && op.status === 'active' ? { ...op, status: 'failed' as const } : op
      );
    };
    const targetChar = characters.find((c) => c.id === targetId);
    if (choiceId === 'release_cleanly') {
      if (targetChar?.activeOperationId) cancelTargetOp(targetChar.activeOperationId);
      characters = characters.map((c) =>
        c.id === targetId
          ? {
              ...c,
              status: 'fled',
              activeOperationId: null,
              lastAutonomousNote: '「本当に帰してくれて助かりました。もう二度と近づきません。」',
            }
          : c
      );
      policeTrace = clamp(policeTrace + 2, 0, 100);
      control = clamp(control - 2, 0, 100);
      tempsLost++;
      timeline.push({ day: state.day, text: `${msg.senderName}の離脱を認め、静かにラインから外した。` });
    } else if (choiceId === 'pay_severance') {
      cash -= choice?.cost ?? 350_000;
      if (targetChar?.activeOperationId) cancelTargetOp(targetChar.activeOperationId);
      characters = characters.map((c) =>
        c.id === targetId
          ? {
              ...c,
              status: 'fled',
              activeOperationId: null,
              lastAutonomousNote: '「精算分は受け取りました。お互い関わりはなかったことにします。」',
            }
          : c
      );
      policeTrace = clamp(policeTrace - 1, 0, 100);
      tempsLost++;
      timeline.push({ day: state.day, text: `${msg.senderName}に清算金を支払い円満に手を切った。` });
    } else if (choiceId === 'threaten_keep') {
      // Backfires! High chance of #9110 tip-off
      let betrayed = false;
      characters = characters.map((c) => {
        if (c.id !== targetId) return c;
        const nextStress = clamp(c.stress + 15, 0, 100);
        const triggersBetrayal = nextStress >= 75;
        if (triggersBetrayal) {
          betrayed = true;
          if (c.activeOperationId) cancelTargetOp(c.activeOperationId);
        }
        return {
          ...c,
          loyalty: clamp(c.loyalty - 28, 0, 100),
          stress: nextStress,
          status: triggersBetrayal ? 'betrayed' : c.status,
          activeOperationId: triggersBetrayal ? null : c.activeOperationId,
          lastAutonomousNote: triggersBetrayal
            ? '「脅迫されたので#9110と警察署へ全部話しました。」'
            : '「……分かりました。でも、もう無理です。」',
        };
      });
      if (betrayed) tempsLost++;
      policeTrace = clamp(policeTrace + 12, 0, 100);
      control = clamp(control - 6, 0, 100);
      logs.push(`${msg.senderName}への脅迫が裏目に出た！警察相談ダイヤル経由で情報が漏洩（捜査線+12%）。`);
      timeline.push({ day: state.day, text: `${msg.senderName}を脅して引き止めた結果、#9110通報により捜査線が急拡大。` });
    }
  } else if (msg.id.startsWith('evt_rival_clash')) {
    const hasRena = characters.some((c) => c.id === 'rena' && (c.status === 'idle' || c.status === 'on_mission'));
    const rivalId = msg.body.includes('レナ') && hasRena ? 'rena' : 'ken';
    if (choiceId === 'side_himuro') {
      characters = characters.map((c) => {
        if (c.id === 'himuro') return { ...c, loyalty: clamp(c.loyalty + 10, 0, 100), stress: clamp(c.stress - 5, 0, 100) };
        if (c.id === rivalId) return { ...c, loyalty: clamp(c.loyalty - 12, 0, 100), stress: clamp(c.stress + 8, 0, 100) };
        return c;
      });
      characters = addRelationshipDelta(characters, 'himuro', rivalId, -10);
      control = clamp(control + 2, 0, 100);
      timeline.push({ day: state.day, text: `内部対立で氷室を支持。${rivalId === 'rena' ? 'レナ' : 'ケン'}が不満を溜めた。` });
    } else if (choiceId === 'side_rival') {
      characters = characters.map((c) => {
        if (c.id === rivalId) return { ...c, loyalty: clamp(c.loyalty + 10, 0, 100), stress: clamp(c.stress - 6, 0, 100) };
        if (c.id === 'himuro') return { ...c, loyalty: clamp(c.loyalty - 10, 0, 100), ambition: clamp(c.ambition + 4, 0, 100) };
        return c;
      });
      characters = addRelationshipDelta(characters, 'himuro', rivalId, -10);
      control = clamp(control + 3, 0, 100);
      timeline.push({ day: state.day, text: `内部対立で${rivalId === 'rena' ? 'レナ' : 'ケン'}の現場裁量を擁護した。` });
    } else if (choiceId === 'punish_both') {
      cash += 300_000;
      characters = characters.map((c) =>
        c.id === 'himuro' || c.id === rivalId
          ? { ...c, loyalty: clamp(c.loyalty - 6, 0, 100), stress: clamp(c.stress + 6, 0, 100) }
          : c
      );
      control = clamp(control + 4, 0, 100);
      timeline.push({ day: state.day, text: '幹部同士の抗争に双方罰金を科し、強権で押さえ込んだ。' });
    }
  } else if (msg.id.startsWith('evt_yakiniku_')) {
    const senderId = msg.senderId;
    const refund = msg.skimmedAmount ?? 280_000;
    if (choiceId === 'approve_expense') {
      characters = characters.map((c) =>
        c.id === senderId
          ? { ...c, loyalty: clamp(c.loyalty + 6, 0, 100), ambition: clamp(c.ambition + 6, 0, 100) }
          : c
      );
      control = clamp(control - 3, 0, 100);
    } else if (choiceId === 'reject_expense') {
      const hasProof = Boolean(msg.audited);
      const loyaltyPenalty = hasProof ? -6 : -16;
      const controlDelta = hasProof ? 4 : -2;
      cash += refund;
      characters = characters.map((c) =>
        c.id === senderId
          ? {
              ...c,
              loyalty: clamp(c.loyalty + loyaltyPenalty, 0, 100),
              skimmedTotal: Math.max(0, c.skimmedTotal - refund),
            }
          : c
      );
      control = clamp(control + controlDelta, 0, 100);
      if (hasProof) {
        logs.push(`裏取り済みの証拠で${msg.senderName}の架空経費を突き崩し、+${formatYen(refund)}を返金させた。`);
        timeline.push({ day: state.day, text: `${msg.senderName}の架空「勉強会」経費を証拠付きで却下し返金させた。` });
      } else {
        logs.push(`証拠なしに${msg.senderName}の経費を疑って返金させたため、強い反発と現場の動揺を招いた。`);
        timeline.push({ day: state.day, text: `${msg.senderName}を裏取りなしで詰問し返金させたが信頼が大きく損なわれた。` });
      }
    }
  } else if (msg.id.startsWith('evt_front_viral')) {
    if (choiceId === 'ride_hype') {
      cash += 900_000;
      policeTrace = clamp(policeTrace + 2, 0, 100);
      logs.push('フロント店の行列ブームを逆手に取り、+¥90万の売上水増しに成功。');
      timeline.push({ day: state.day, text: 'フロント店舗の予期せぬ大行列を利用し¥90万を吸い上げた。' });
    } else if (choiceId === 'close_quietly') {
      policeTrace = clamp(policeTrace - 3, 0, 100);
      control = clamp(control + 3, 0, 100);
      logs.push('目立ちすぎたフロント店を「店主の腰痛」名目で即座にシャッター封鎖した。');
    }
  } else if (msg.id.startsWith('evt_soryukai_')) {
    const kuroda = characters.find((c) => c.id === 'kuroda');
    if (choiceId === 'accept_soryukai') {
      cash += 1_600_000;
      policeTrace = clamp(policeTrace + 6, 0, 100);
      cityHarm = clamp(cityHarm + 3, 0, 100);
      characters = characters.map((c) =>
        c.id === 'kuroda' ? { ...c, loyalty: clamp(c.loyalty + 8, 0, 100) } : c
      );
      timeline.push({ day: state.day, text: '蒼龍会との共同シノギで¥160万を得たが、T3の視線を引き寄せた。' });
    } else if (choiceId === 'decline_soryukai') {
      policeTrace = clamp(policeTrace - 2, 0, 100);
      characters = characters.map((c) => {
        if (c.id === 'kuroda') return { ...c, loyalty: clamp(c.loyalty - 8, 0, 100) };
        if (c.id === 'misaki') return { ...c, loyalty: clamp(c.loyalty + 5, 0, 100) };
        return c;
      });
    } else if (choiceId === 'double_cross_fee') {
      if (kuroda && kuroda.loyalty >= 58) {
        cash += 2_400_000;
        policeTrace = clamp(policeTrace + 7, 0, 100);
        cityHarm = clamp(cityHarm + 4, 0, 100);
        characters = characters.map((c) =>
          c.id === 'kuroda' ? { ...c, loyalty: clamp(c.loyalty - 5, 0, 100) } : c
        );
        timeline.push({ day: state.day, text: '黒田経由で蒼龍会案件から¥240万を強気に引き出した。' });
      } else {
        control = clamp(control - 10, 0, 100);
        policeTrace = clamp(policeTrace + 9, 0, 100);
        characters = characters.map((c) =>
          c.id === 'kuroda' ? { ...c, loyalty: clamp(c.loyalty - 15, 0, 100) } : c
        );
        logs.push('蒼龍会への強気交渉が決裂し、黒田から報復的な圧力がかかった（統制-10%、捜査線+9%）。');
        timeline.push({ day: state.day, text: '蒼龍会との条件交渉が決裂し組織の統制が大きく揺らいだ。' });
      }
    }
  }

  const updatedMessages = state.messages.map((m) =>
    m.id === messageId ? { ...m, read: true, resolved: true } : m
  );

  return {
    ...state,
    cash,
    control,
    policeTrace,
    cityHarm,
    characters,
    operations,
    messages: updatedMessages,
    timeline,
    dailyAutonomousLogs: logs,
    stats: {
      ...state.stats,
      tempsLost,
    },
  };
}
