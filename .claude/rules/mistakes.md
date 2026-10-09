# 過去のミスと対策

## Case 1: GAS実行時間オーバー
状況: Claude APIへのリクエストが長くなり6分制限に引っかかった。
→ 対策: レスポンス生成は必ずmax_tokensを設定しろ。

## Case 2: ローダー更新が全クライアントに即反映
状況: config serverのコードを修正したら全250件に即反映されてバグが広がった。
→ 対策: 本番反映前にステージング環境で必ず動作確認しろ。

## Case 3: minifiedを直接編集した
状況: main_minified.gsを直接修正してmasterとの差分が生まれた。
→ 対策: 必ずmain_master.gsを修正してからminifyしろ。

## Case 4: PropertiesServiceの9KB制限で会話履歴が消える
状況: 会話が長くなるとsaveHistory()がsilent failし、次のメッセージで文脈が全消失。
→ 対策: saveHistory前にJSON.stringify(history).lengthを確認。9KBを超える場合はさらに古い履歴を削って9KB以内に収めろ。catchブロックでLogger.logに記録しろ。

## Case 5: eval()でSyntaxError連発→購入者にエラー通知が何十回も届く
状況: GitHubからのfetchがHTMLページ（エラーページ）を返し、eval()で「Unexpected token <」が発生。checkRemindersが5分間隔で実行されるため、同じエラーが何十回も購入者に届いた。
→ 対策: loadAndExecのcatch内で、doPost以外（checkReminders, morningBriefing等）はLogger.logのみにする。購入者への通知はdoPost経由のエラーのみ。

## Case 6: ハルシネーション検知メッセージが購入者に届く
状況: pushToLine(_KISHI_UID, ...)でデバッグ情報を送っていたが、購入者のLINEボットでは_KISHI_UIDがフォールバック値になり、結果的に購入者に内部情報が漏れた。
→ 対策: デバッグ通知は`uid === _KISHI_UID`でガードする。購入者環境ではLogger.logのみ。

## Case 7: リマインダーの重複送信
状況: checkRemindersが並行実行され、同じリマインダーが複数回送信された。dataを関数開始時に一括読み込みし、送信→TRUE更新の間にタイムラグがあるため競合する。
→ 対策: CacheServiceでリマインダーID単位の送信済みフラグ（5分TTL）を設定。送信前にTRUEマークを先にセット。

## Case 8: トリガーが消えてリマインダー・ブリーフィングが動かなくなる
状況: setupReminderTrigger()はtestAllPermissions()（初回セットアップ）でしか呼ばれない。何らかの理由でトリガーが消えると二度と復旧しない。
→ 対策: doPost内で1日1回トリガー存在チェック+自動復旧。toolReminderAdd/toolBriefingSetting内でもsetupReminderTrigger()を呼ぶ。

## Case 9: トリガー間隔の変更が購入者に反映されない
状況: everyMinutes(5)をeveryMinutes(1)に変えたが、既存購入者のGASには古いトリガーが残ったまま。
→ 対策: フラグ方式の自動移行（reminder_1minフラグで判定→古いトリガー削除→新しいトリガー作成→フラグ保存）。購入者に手動作業させない。

## Case 10: AIがツールを使わずに嘘をつく（ハルシネーション）
状況: AIが「登録しました」「送信しました」と言いながらツールを呼んでいない。請求書・領収書のデータを完全に捏造。存在しないURLを返す。
→ 対策: ハルシネーション検知+自動リトライ。システムプロンプトに「URL生成禁止」「データ捏造禁止」「ツール実行前に完了報告禁止」ルールを追加。

## Case 11: AIが天気をツールなしで回答する
状況: 天気の質問に対し、weatherツールを呼ばずに自前の知識（「四国の気候は〜」）で回答。都市マップに追加しても意味がなかった。
→ 対策: システムプロンプトに「天気は絶対にweatherツールを使え」「自分の知識で答えるの禁止」を明記。

## Case 12: Supabaseキー・URLがmain_minified.gsにハードコード
状況: anon keyとURLがコード内に直書きされている。GitHubが公開リポジトリの場合、誰でもアクセス可能。
→ 対策: 将来的にPropertiesServiceまたはCMS経由で取得する設計に移行すべき。現時点ではリポジトリをprivateにして対処。

## Case 13: スプレッドシート削除で全データ消失
状況: DATA_SS_IDのスプレッドシートが削除されると、新しいスプレッドシートを自動作成するが、過去のタスク・メモ・リマインダーは全て失われる。DATA_SS_ID_BACKUPは保存するが復旧ロジックはない。
→ 対策: 重要データの定期バックアップ、またはBACKUP IDからの復旧ロジックを追加すべき。

## Case 14: _HAIKU_MODELのハードコード
状況: モデルIDがコード内に直書きされている。Anthropicがモデルを廃止すると全250件が同時に壊れる。
→ 対策: CMS設定またはremoteConfigからモデルIDを取得する設計に変更すべき。最低限フォールバックモデルを定義しろ。

## Case 15: 購入者に手動作業をさせた
状況: トリガー変更やキャッシュクリア等で「購入者のGASで○○を実行してください」と案内した。購入者はITに詳しくない。
→ 対策: 購入者に作業させない（絶対ルール）。コード内で自動検出→自動移行する設計にする。フラグ方式が有効。

## Case 16: Config Server参照Doc削除で全250件がSyntaxError連発
状況: Config ServerがコードをGoogle Docから取得して返す設計。そのDocが削除されると、export?format=txt が「ファイル削除」HTMLを返す。クライアントのgetRemoteCode()はそのHTMLをキャッシュ（1時間）してeval→SyntaxError: Unexpected token '<'。5分毎のトリガー（checkReminders）で旧版ローダーは毎回エラー通知を送信→250件全員のLINEに何十回もエラーが届いた。クライアントGASは触れないため、キャッシュTTL満了まで止める手段なし。
→ 対策: Config Serverに多段Fallbackを実装した（config_server_fallback.gs）。
  1. Primary Doc → 失敗 → Backup Doc（Drive上に自動コピー、1時間ごと同期）→ 失敗 → GitHub raw URL（任意）
  2. 健全性チェック（文字数5万字以上/`<html`含まない/`function doPost`含む）で garbage を弾く
  3. 全滅時は管理者LINEに即通知（1日1回制限）
  4. Fallback作動時も通知（プライマリ復旧を促す）
  5. setupFallbackSystem / installBackupTrigger で1回だけセットアップ
  これでDoc削除・権限破壊・export失敗のいずれにも耐える。既存250件のクライアントGASは一切変更不要（Config Serverの応答が正しいコードである限り、クライアント側の eval は成功する）。

## Case 17: dailyCheckがMAIN_CODE_DOC_IDを直接openByIdしていてDoc削除時に毎日通知が届く
状況: dailyCheckが `DocumentApp.openById(MAIN_CODE_DOC_ID)` でコード本体を取得して健全性チェックしていた。Primary Docを別Docに切り替えた後も、購入者のGAS内のMAIN_CODE_DOC_IDプロパティは古いIDを指したまま。古いDocが削除された瞬間から毎日0時のdailyCheckで「コード取得失敗: Document is missing」が届き続けた。購入者GASのプロパティは触れない（Case 15）。
→ 対策: dailyCheckの健全性チェックを `LOADER_URL` 経由に変更。UrlFetchAppでConfig ServerからコードをGETして検証する。Config Server側はFallbackシステム（Case 16）で守られているので、Doc切り替え・削除にも影響を受けない。

## Case 18: カルーセルのコマンド系ボタン（ヘルプで終わらないtext）が「ヘルプ未定義」と誤検出される
状況: dailyCheckのヘルプマップ整合性チェックが、カルーセルの全アクションのtextがhelpMapに存在するかを検査。しかし一部ボタン（例: 「📅 カレンダー設定」→ text=「カレンダー設定」）はヘルプ表示ではなく `handleCalendarSetting` を呼ぶコマンド系。helpMapに無いのは正常なのに「🔧 ヘルプ未定義」としてアラートされていた。
→ 対策: `text.indexOf('ヘルプ') === -1` なら continue。「〜ヘルプ」で終わるtextのみ検査対象にする。コマンド系のtextは検査から除外する。

## Case 19: morningBriefingが処理前にフラグを立てるため、内部失敗で当日リカバリ不可
状況: `briefing_sent_YYYYMMDD` フラグを処理開始直後に立てる設計だった。pushToLine が失敗（LINE Token無効/ネットワーク等）してもフラグは立つため、その日のブリーフィングは送信されないまま終わる。checkRemindersの保険呼び出しも `bH===bTarget && bM<=2` の2分窓のみで、7:00ジャストの発火を逃すと何もしない。
→ 対策3点:
  1. **morningBriefing**: `pushToLine` 成功後にフラグを立てるよう変更。送信失敗時はフラグを立てず次のcheckRemindersで再試行可能に
  2. **checkReminders内のbriefing呼び出し**: 時刻条件を `bH===bTarget&&bM<=2` から `bH>=bTarget&&bH<bTarget+2` に拡大。指定時刻〜2時間後の間で未送信なら送信
  3. **AI応答ルール**: 「ブリーフィング来なかった」と言われたら再設定を即提案・即実行するルールをsystemPromptに追加。放置厳禁を明記
  これでトリガー消失/送信失敗/フラグ早立ち、いずれも保険ルートで救済される。

## Case 27: 3月から続く「クレジット誤通知」発作の真因はdoGetの370秒タイムアウト（Doc fallbackのハング）
状況: 3/21・4/23・7/9・7/28・8/1・8/2 と断続的に、購入者LINEへ「APIクレジット残高が…」「SyntaxError: Unexpected token '<'」が5分毎/毎分で数十〜数百件届く発作が再発し続けた。再デプロイ（Case 26）で一時的に収まっても数時間後にまた起きる。
真因特定の決め手: **Config Serverの実行ログを「失敗しました」でフィルタ**したところ、過去7日で25件のdoGet失敗が出て、**全て実行時間369.9秒（GASの6分制限で強制kill）**だった。しかも失敗時刻（8/2 10:08 等）が購入者LINEの発作開始時刻と完全一致。
メカニズム（確定）:
  1. doGet の多段Fallbackが Primary Doc → Backup Doc → GitHub の順。**Doc export は帯域超過状態だと1本あたり約4分ハングする**
  2. GitHubが瞬断した時など Doc に落ちると Primary 4分 + Backup 4分 = 370秒 → **GASが強制kill → GoogleのHTMLエラーページがクライアントに返る**
  3. 旧ローダーはHTML内の「function」文字で検証をすり抜け**1時間キャッシュ** → eval失敗 → 毎分/5分毎に誤通知
  4. 1時間後にキャッシュが切れて自然回復 → 数時間後にまた同じ条件が揃って再発（＝発作の周期性の説明）
→ 対策（2段構え）:
  1. **コード側**: getCodeWithFallback から Doc fallback を全撤去。①Config Server自身のScriptCache（2分割・TTL6h）→ ②GitHub（成功時cache更新）→ ③静かなコメント返し、の構成に変更。ハング源が存在しなくなる
  2. **設定側（本命・即効）**: スクリプトプロパティの **MAIN_CODE_ID と BACKUP_DOC_ID を空にする**。GASウェブアプリはデプロイ時のバージョンに固定されるため、コードを保存しても旧バージョンが動き続ける（UIでの新バージョン作成が繰り返し失敗した）。**プロパティを空にすれば旧コードのままでも `if(!docId) throw` で即例外 → GitHubへ直行**し、370秒ハングが構造的に消滅する
検証: 対策後に外部から5回連続で叩き、全て **1.2〜1.7秒 / HTTP200 / 146,392字 / 構文OK**（旧構成なら4〜6分ハングしていた）。
教訓:
  1. **「サーバは正常」と判断する前に必ず実行ログを「失敗」でフィルタする**。成功ログだけ見ると全て緑に見えるが、失敗だけを抽出すると370秒killが一発で見つかった。今回これを最初にやっていれば数日短縮できた
  2. **GASウェブアプリはデプロイ時のバージョンに固定される**。コード保存＝反映ではない。UIでの新バージョン作成が不安定な時は、**コードではなく「コードが読む設定値」を変えて挙動を変える**方が確実
  3. fallback は「遅い経路」を後ろに置くと、前段が失敗した時に全体がタイムアウトする。**外部fetchのfallbackは、遅い経路そのものを持たない設計にする**

## Case 26: 「APIクレジット残高が不足している可能性」毎分通知の正体はv3ローダーのeval失敗誤表示
状況: 8/1 14:16から購入者LINEに「⚠️ APIクレジット残高が不足している可能性があります」が毎分・計297件。購入者のAnthropicコンソールは残高$11.89・使用0%で、クレジットは完全に無関係だった。
特定方法: 文言が現行コードに存在しない → `git log --all -S "不足している可能性"` でsetup-v3.html（3月末世代のローダー）から発見。v3ローダーのloadAndExec catchは `errStr.indexOf("Unexpected token") !== -1` のとき（=evalの構文エラー）この文言を送る。レート制限なし＋checkRemindersの1分トリガー → 毎分通知。
真因: GAS→GASのUrlFetchでConfig ServerがGoogleのHTML認証壁（ppConfigページ）を返した（4月と同じ現象。外部からのcurl/ブラウザは正常なのにGAS発だけHTMLが返る）。HTMLには「function」という語が含まれるためv3ローダーの`indexOf("function")`検証をすり抜けてキャッシュ（1時間）され、eval→Unexpected token→誤表示のループ。
→ 対処: **Config Serverのウェブアプリを新バージョンで再デプロイ**（URL不変）。4月に続き2回目の実績で、GAS発fetchへのHTML壁はこれで解消する。Chrome操作で再デプロイまで実施（バージョン13・2026/08/01 20:13）。
教訓:
  1. **エラー文言はまずgit履歴を全文検索**（`git log -S`）。どの世代のローダー/コードが出してるか一発で特定でき、「現行コードに無い=旧世代が動いてる」が分かる
  2. 「APIクレジット」系の文言でも実態はeval失敗のことがある。残高確認と切り分けを最初にやる
  3. GAS→GAS fetchのHTML壁は外部からのcurlでは再現しない。購入者側だけ落ちてインフラ検査が全部緑のときはこれを疑い、再デプロイを試す

## Case 25: トリガー関数の例外→旧ローダーのエラー通知が止まらない（構造的遮断で解決）
状況: Case 24対策（doPost二重try-catch + top-level API保護）後もエラー通知が継続。エラー全文が入手できず個別原因の特定は不能だった。
根本構造: 旧ローダー（既存購入者のconfig.gs）は checkReminders / morningBriefing / dailyCheck / dailyClearCache 等のトリガー関数が例外を投げるたびに「🔴 エラーが発生しました…APIクレジット残高もご確認ください」を購入者LINEに送信する（新ローダーはdoPost以外Logger.logのみだが、既存購入者のローダーは更新できない=Case 15）。トリガー関数の内部には getDataSheet / getRange().getValue() 等、GAS一時障害で例外を投げうる箇所が多数あり、個別に潰してもキリがない。
→ 対策: **トリガー入口の全関数を never-throw ラッパーで包む（構造的遮断）**
  - 全トリガー関数（checkReminders, morningBriefing, sendDemoEmails, dailyClearCache, dailyCheck, weeklyReport, analyzeAiLogs）を `_xxxCore` にリネームし、`function xxx(){try{return _xxxCore();}catch(e){Logger.log}}` のラッパーを追加
  - トリガーは関数名文字列で解決されるためラッパー名が元名ならトリガー・内部呼び出しとも無変更で動く
  - これで「配信コードのeval成功 + 全入口がnever-throw」となり、旧ローダーのcatchは構造的に発動不能
  - 個別エラーの原因が何であれ、購入者への誤誘導通知は二度と送られない（エラー自体はLogger.logに残る）
検証: node --check + GAS APIモックでのeval再現テスト（doPost/全ラッパー定義確認）を実施してからpush。

## Case 24: ローダー側のエラー通知文言「APIクレジット...」が購入者に誤誘導
状況: 6/3購入者に「🔴 エラーが発生しました\n\nException: ドキュメント...にアクセス中にスプレッドシートのサービスに接続できなくなりました。\n\nAPIクレジット残高もご確認ください https://console.anthropic.com → Billing」が届いた。実態はGAS側のSpreadsheetApp一時障害だが、ローダー文言が「APIクレジット残高」を案内するためAnthropicの問題と誤認させる。既存購入者のローダーは触れない（Case 15）ため、文言修正は不可。
原因: main_minified.gs の doPost には try-catch があるが、catch ブロック内の処理（pushToLine, getConfig 等）で別例外が発生し、内側 catch(e2) で握りつぶされなかった場合に、doPost関数全体が例外スロー→ローダー側のcatchに到達→誤誘導文言が送信される。
→ 対策: **doPost を二重try-catch で外側からも保護**
  - 既存 try-catch の外側にもう一層 try{}catch(eOuter){} を追加
  - 何があっても return ContentService.createTextOutput('OK') を保証
  - ローダー側の catch を発動させない（誤誘導文言を防ぐ）
  これでローダー側の「APIクレジット...」が購入者に届かなくなる。

## Case 23: 想定外stop_reasonで「処理できませんでした」が誤表示される
状況: 6/1購入者から「カレンダー登録」「タスク追加」のメッセージに対してAIが「処理できませんでした。もう一度お試しください。」を連続で返した。実際にはツール実行は成功してる可能性が高い（カレンダー/タスクには登録された）が、応答が誤エラー文言。
原因: processMessage のループ内で `stop_reason` を `end_turn` / `tool_use` のみ判定していて、それ以外（`max_tokens`, `pause_turn` (extended thinking), `refusal`, 不明な新値、undefined等）が来た場合に問答無用で「処理できませんでした」と返していた。Anthropic API側で新stop_reasonが追加されると即発症する設計上の脆弱性。
→ 対策:
  1. **想定外stop_reason時もcontent からtext抽出を試みる**: textがあれば返す（ツール実行後の最終応答textが含まれてるケース多い）
  2. textが無い場合のみ従来のエラー文言を返す
  3. Logger.logでstop_reason+content先頭300字を記録（後追い原因究明用）
  これでAnthropic API側の仕様変更（新stop_reason追加等）に強くなる。
状況: 5/25購入者から「朝7時に来たリマインドが13時にも同じ日に来た」報告。Case 20でCacheService TTLを86400秒(24時間)に設定したつもりだが、**GAS CacheServiceの実上限は21600秒(6時間)** で、86400設定しても内部クランプ。7時送信→13時(+6時間)にcache消失→sheet書き込みが何かで反映されてない場合に再送信される。さらにminified版にはmaster版にあった「sheet最新値再取得」ロジックが欠けていた。
→ 対策3点:
  1. **送信前にsheet最新値を必ずgetValue()で再取得**: dataキャッシュ（チェック開始時に1回取得）は古い可能性。送信直前に最新値を取得し、TRUEなら絶対スキップ。これがCache TTL切れの最終防衛線
  2. **setValue('TRUE')後にgetValue()で検証→失敗時はリトライ最大3回**: API障害でsetValueが失敗した時のリカバリ。3回失敗ならその回は送信スキップ（次回トリガーで再試行）
  3. **CacheService TTLを86400→21600（6時間）に修正**: GAS実上限に合わせる。sheet検証があれば実害なし
  これで「7時送信→13時再送信」のような6時間後の重複は完全に防止される。

## Case 21: monthly_weekday リマインダーの日付がズレる（AI解釈ミス＋無補正）
状況: 「毎月第2金曜日と第4金曜日の朝9:00に朱々さん配信人数設定」とユーザー指示。AIが `briefing_setting` ではなく `reminder_add(repeat=monthly_weekday, nth_week=4, weekday=5)` で登録したが、初回datetimeを **5/23(土) 09:00** に誤設定。コード側は datetime をそのまま採用するだけで「第N週Weekday」と一致するか検証してなかった。結果、土曜日に発火し、繰り返しの次回計算も「土曜日基準」になり、毎月誤った曜日にリマインドが来る。さらに getNextMonthlyWeekday には `next.setDate(targetDate)` が抜けてるバグもあった（master側）。
→ 対策3点:
  1. **getNextMonthlyWeekday の setDate(targetDate) 抜けバグ修正**: master側のみのバグ
  2. **getMonthlyWeekday 関数を新規追加**: 当月の第N週Weekdayを返す。toolReminderAdd 初回datetime補正と checkReminders 自動補正で使用
  3. **toolReminderAdd で初回datetime補正**: `repeat='monthly_weekday'` の場合、初回datetime を強制的に第N週Weekdayに合わせる。過去なら翌月に
  4. **checkReminders で既存リマインダー自動補正**: 既に間違って登録されたリマインダーも、checkReminders 実行時に曜日が一致してなければ自動修正→今回はスキップ→次回正しい時刻で発火
  これで購入者にリマインダー削除→再登録の手間を取らせず、コード側で自動修復される（Case 15遵守）。

## Case 20: リマインダーが5分毎に重複送信される（Case 7再発）
状況: にんじん秘書（購入者）で9:00, 9:05, 9:10と同じリマインダーが3連発で送信された。コードは「09:00」の同じリマインダーIDを3回処理してる。Case 7対策（CacheService TTL=300秒, sheet setValue('TRUE')）は入っていたが、TTLがcheckRemindersのトリガー間隔（5分）と同じため、次回実行時にキャッシュが切れていて重複検知できない。SpreadsheetApp.flush()も無いため、setValue('TRUE')の反映が遅延した可能性。
→ 対策3点:
  1. **CacheService TTLを300秒→86400秒（24時間）に延長**: トリガー間隔より十分長くする
  2. **キーにremindAt時刻を含める**: `'rem_sent_'+rid+'_'+ra.getTime()` 形式。繰り返しリマインダーの次回時刻と衝突しない
  3. **SpreadsheetApp.flush()を追加**: setValue('TRUE')/('FALSE')の直後に呼んで即時書き込み
  これで5分毎/1分毎どちらのトリガーでも重複しない。繰り返しリマインダー（daily/weekly等）も次回時刻に変わったら別キーで正常送信される。

## Case 28: 【デモ】LINE秘書のエラー発作は「omoseka2525以外のGoogleアカウント」から出ている（2026/8/4 判明）
状況: 8/1〜8/3、【デモ】LINE秘書から `SyntaxError: Unexpected token '<'` ＋「APIクレジット残高もご確認ください」が **正確に5分間隔** で届き続けた。Config Server修正（Case 27）もLINE AI秘書のローダー修正も効かなかった。

**なぜ何日も特定できなかったか（最大の教訓）**:
- ローダーは例外を **catchしてLINE通知を送るだけ** で正常終了する。よってGASの実行ログ上は **「完了」＝エラー率0%** になる。
- そのため「エラー率が高いトリガーを探す」という探し方をしていた自分は、**構造的に絶対に見つけられなかった**。
- → **正しい探し方は「エラー率」ではなく「実行間隔が通知間隔と一致するトリガー」を探すこと。**

**実施した全数調査（2026/8/4）**:
- Drive API で `mimeType='application/vnd.google-apps.script'` を全件列挙 → GASプロジェクト27件を確定
- `script.google.com/home/triggers` を **authuser=0〜4 の全アカウント** で確認
- 時間ベーストリガーは以下のみ:
  - せんせい秘書: morningBriefing / checkReminders（**5分間隔**）
  - 教育DX記事収集, Config server(hourlyBackup), デモクリニック×2
  - LINE AI秘書: checkReminders（**1分間隔**・全て完了）, morningBriefing, dailyCheck, weeklyReport
- **せんせい秘書は5分間隔で最有力だったが、コードを検査したところ**:
  - ファイルは `コード.gs` 1本のみ、**ローダー無し（getRemoteCode / loadAndExec が存在しない）**
  - 「APIクレジット残高もご確認ください」の文字列が**存在しない**
  - checkReminders に **try/catch が無い** → 例外を投げれば実行ログが「失敗」になるはずだが全て「完了」
  - → **せんせい秘書はシロ**
- 結論: **エラーを出しているGASは、このMacのChromeにログイン済みのどのGoogleアカウントにも存在しない。**

**確実に止める手段（GASを特定できなくても効く）**:
1. LINE Developers Console → 【デモ】LINE秘書 → Messaging API → **チャネルアクセストークンを再発行**
   → 旧トークンが失効し、どのGASからpushしても401で弾かれる＝**発信源を特定せずに確実に止まる**
2. 応急処置: LINEアプリで【デモ】LINE秘書を**ブロック**（3秒・リスクゼロ・ただし原因は残る）

**次にやること**: 【デモ】LINE秘書のGASがどのGoogleアカウントにあるかを本人に確認する。

## Case 29: 全数調査の結果と、Config Server再デプロイ（2026/8/5）
Case 28で「このアカウントに該当GASは無い」と結論したが、キッシュさんの指示で**全数チェックをやり直した**。その過程で判明したこと。

### 追加で判明した重大な盲点
- **`script.google.com/home/triggers`（マイトリガー）は「自分が作成したトリガー」しか出さない**。
  他アカウントが自分のプロジェクトに仕掛けたトリガーは映らない。
  → **必ずプロジェクト個別の `/triggers` ページを見ること**（こちらは「オーナー」列があり全員分が出る）。
- 全27プロジェクトの個別トリガーページを1件ずつ確認 → **全て「自分」所有。隠れトリガーは無し**。

### 全数調査で見つかった実際の不具合（デモBotとは別件）
| プロジェクト | トリガー | 状態 |
|---|---|---|
| LINE AI秘書 | dailyClearCache | **エラー率100%** |
| LINE AI秘書 | weeklyReport | **エラー率100%** |
| 無題のプロジェクト(10ErVq2…) | sendMorningBriefing / sendNoonReminder | **100%失敗**。コードに当該関数が存在しない（死んだトリガー）|
| LINE AI秘書 | processQueue ×8 | 無効のまま放置 |

### 決定的な発見：ローダーのバリデーションはHTMLをすり抜ける
過去に配布・使用された GAS ウェブアプリURL 9本を全て叩いたところ、**7本が Google のログイン/OAuth認証HTML（ppConfigページ・約9,653バイト・HTTP 200）を返した**。
- このHTMLには **JavaScriptが大量に含まれるため「function」という語が入っている**
- 旧ローダーの検証は `txt.indexOf("function") !== -1` だけ → **HTMLが「正しいコード」として通り、1時間キャッシュされ、evalされる**
- 結果 `SyntaxError: Unexpected token '<'` が延々出る。HTTP 200なので**永久に自己回復しない**
- **curlでは再現しない**（Case 26と同じ。外部からは正常に見えるのにGAS→GASのfetchだけHTML壁を食らう）。
  → **「外から叩いて正常だからサーバは正常」は成立しない。この症状の検査に curl は使えない。**

### 実施した対処（2026/8/5 7:55）
**Config Server を バージョン14 で再デプロイ（URL不変）**。Case 26で2回実績のある唯一の対処。
- 手順の落とし穴①: **コードが前バージョンと同一だとGASは新バージョンを作らない**。
  「デプロイを更新しました」と出てもバージョン番号が変わらない。→ **先にコードへ変更（コメント1行でよい）を入れて保存する**
- 手順の落とし穴②: バージョン選択のプルダウンで「新バージョン」を**座標クリックしても選択が反映されない**（Case 27で繰り返し失敗していた原因）。
  → **JSで `[role=option]` を拾い `mouseover→mousedown→mouseup→click` を dispatch すると確実に入る**（note editorのCase 20と同種の回避策）
- 検証: 3回連続 HTTP200 / 1.4〜1.9秒 / 146,392字 / `node --check` 通過

### 未解決
【デモ】LINE秘書のGASプロジェクト本体は依然として未特定（このMacのChromeにログイン済みの全Googleアカウントに存在しない）。
再デプロイで直らない場合の確実な停止手段は Case 28 に記載のチャネルアクセストークン再発行。

## Case 30 ★真因確定★: 配信コードが146KBでGAS CacheServiceの100KB上限を超えており、クライアントのキャッシュが必ず失敗している（2026/8/5）
LINEログの**発生時刻を全部並べたこと**で連鎖が完全に証明できた。

### 発作は「きっかり60分・13通」で自然に止まる
```
8/4  01:44–02:43 (13通) / 08:04–09:03 (13通) / 20:19–21:18 (13通) / 23:24–00:23 (13通)
8/5  10:13–11:13 (13通)
```
5分間隔 × 60分 = 13通。これは**ローダーの `cache.put(key, txt, 3600)`（1時間）そのもの**。

### Config Serverの失敗ログと完全一致
| doGet失敗 | LINE発作開始 |
|---|---|
| **8/5 10:07:20（0秒失敗）** | **10:13** |
| 8/4 9:33 / 14:34 / 15:48 / 19:36 / 21:09 / 22:11（いずれも**369.9秒**＝6分制限kill） | 各発作 |

### なぜキャッシュが「悪いHTMLだけ」効くのか ← ここが真因
- **GAS CacheService の上限は 1値あたり 100,000 bytes**
- **配信コードは 146,392 bytes（119,030 chars／うち日本語27%＝40KB）→ 上限を46KB超過**
- → **正常コードは `cache.put` が必ず失敗する**（ローダーは `catch(ce){}` で握りつぶすので誰も気づかない）
- → 正常時はキャッシュが効かず、**全クライアントが毎トリガー毎にConfig Serverから146KBを取り直す**
  （実測：Config Serverへの doGet が **約20リクエスト/分**。購入者10件規模ではありえない量）
- → その過負荷がConfig Serverの失敗（370秒kill・0秒即死）を誘発する
- → **一方エラーHTMLは約9.6KBしかないのでキャッシュに入ってしまう** → 1時間居座る → 5分毎に13通 → 期限切れで自然回復

つまり **「正常なコードはキャッシュできず、壊れたHTMLだけキャッシュできる」** という最悪の状態だった。

### 実施済みの対処（2026/8/5 7:55）
Config Server を **バージョン14** で再デプロイ（Doc fallback完全撤去版が初めて実際に配信された）。
- **8/4は370秒killが6件。7:55以降は0件** → 支配的な失敗要因は消滅
- 残るのは0秒失敗（8/3・8/4・8/5に各1件＝おおよそ1日1回）→ **1日1回・13通の発作が残る計算**

### 恒久対策（未実施・要判断）
**配信コードを100,000 bytes未満に落とす**しかない。そうすればクライアントのキャッシュが効き、
- Config Serverへの負荷が約1/12（毎トリガー→1時間に1回）に落ちて失敗自体が起きにくくなる
- 万一HTMLを掴んでも状況は変わらないが、掴む機会が激減する

削減の当て：日本語テキストが40,067 bytes（27%）を占める。コメント削除では3KBしか減らない。
※ 本番コードの大改修になるため、購入者への影響を考えると**単独判断で実施しない**。

### 教訓
1. **「1時間ちょうどで止まる」は1時間キャッシュの動かぬ証拠**。エラーの発生時刻を全部並べるだけで構造が割れる。最初にやるべきだった
2. **`cache.put` の失敗は `catch(ce){}` で消えるので、サイズ超過に何ヶ月も気づけない**。100KB上限は必ず意識する
3. Case 27で入れた対策が「効いていなかった」のは**デプロイのバージョン固定**が理由。**対策を入れたら必ずバージョン番号が上がったことを確認する**

## Case 31: Case 30の恒久対策を実施 — Config Serverは本体ではなく「ブートストラップ」を配る（2026/8/5 13:51 バージョン15）
Case 30で確定した「配信コード146KB > CacheService上限100KB」を、**購入者のGASを一切触らずに**解消した。

### やったこと
Config Server の `getCodeWithFallback()` を、本体146KBではなく **約52KBのブートストラップ**を返すように変更。
```js
function getCodeWithFallback() {
  return ContentService.createTextOutput(buildBootstrap_()).setMimeType(ContentService.MimeType.TEXT);
}
function getCodeWithFallbackLegacy_() { /* 旧実装は改名して温存 */ }
```
ブートストラップの中身（クライアント上で動く）:
1. ScriptCacheの `mcode_1..3` があれば結合して返す（6時間キャッシュ）
2. 無ければ GitHub raw から本体を取得 → 検証（先頭が`<`でない／5万字以上／`function doPost`を含む）→ 3分割してキャッシュ
3. `eval(__ldMain_())` で本体を同スコープに展開（sloppy modeの直接evalは呼び出し元スコープに関数を定義する）

### 設計上ハマりどころだった3点
1. **52,000字に膨らませている**のは、既存購入者の `dailyCheck` が
   「type=codeの応答が50,000字未満＝🔴本体コード破損」と誤検知して**購入者のLINEへ警告を送る**ため。
   購入者コードは触れない（Case 15）ので、応答側を50,000字以上かつ100,000bytes未満に収める。パディングは
   括弧・`<`・`system_prompt` を含まない文字列にすること（各世代ローダーの検証条件に触れるため）。
2. **ブートストラップは絶対に throw させない**。throwすると旧ローダーのcatchが発動して
   購入者へ「🔴 エラーが発生しました」が飛ぶ。取得失敗時は空文字を返す
   → 関数が未定義 → ローダーは `Logger.log('関数が見つかりません')` のみで**静かに終わる**。
3. **doGetからネットワークI/Oを完全に排除**した。これで370秒kill・0秒即死が構造的に起きない。

### 検証（すべてNodeで実施、本番応答を実物のまま使用）
- 本番 `?type=code` 応答: HTTP200 / 52,052 bytes / 2.7秒
- 旧dailyCheck条件（5万字以上・括弧差5以内・先頭が`<`でない）: 全て充足
- 旧ローダー条件（`function`を含む・`system_prompt`と`<html`を含まない）: 全て充足
- 購入者ローダーと同じeval方式で **doPost / checkReminders / morningBriefing / dailyCheck /
  dailyClearCache / weeklyReport / sendDemoEmails / analyzeAiLogs の8関数すべてが定義される**ことを確認
- クライアント側キャッシュ: mcode_1=51,961B / mcode_2=44,128B / mcode_3=50,303B（全て100KB未満）put失敗0件
- 7回evalしてGitHub取得は1回のみ＝2回目以降はキャッシュ命中
- 異常系7ケース（GitHubがHTML／404／空／fetch例外／短すぎるコード／CacheService障害）で
  **1件も throw しない**ことを確認 ＝ 購入者にエラー通知が飛ばない

### 期待される効果
- 購入者ローダーの `remote_code_v1` キャッシュが**初めて成立**する（52KB < 100KB）
- Config Serverへのアクセスが **毎トリガー → 1時間に1回** に激減（実測20req/分だった）
- 過負荷起因の doGet 失敗が消える → HTMLがクライアントに返らない → 発作が起きない

### 補足: 本番コードに `processQueue` は存在しない
LINE AI秘書プロジェクトに `processQueue` トリガーが8個あるが**全て「無効」**で、
配信コードにも該当関数は無い。検証時に「未定義」と出るのは正常（不要なら削除してよい）。

## Case 32: LINE AI秘書（キッシュさん本人のBot）のローダーが「全トリガー関数のエラーを無制限にLINE通知」していた（2026/8/5 修正）
Case 31の後片付けで発覚。**エラー連投の直接の発生源はここだった。**

### 見つかった問題
このプロジェクトの `loadAndExec` の catch は
- **doPost限定になっていない**（checkReminders等のトリガー関数でも通知を送る）
- **1日1回制限（err_notified_）が無い**
→ checkReminders は **1分おき** なので、コード取得が壊れると**毎分エラー通知が飛ぶ**。

さらに `dailyClearCache` / `weeklyReport` / `processQueue` は
**トリガーは登録されているのにローダー側に関数が存在せず**、毎回「関数が見つかりません」で失敗していた
（dailyClearCache はエラー率100%・毎日3:34、weeklyReport も100%）。

### 実施した修正
1. `loadAndExec` の catch を新ローダー相当に置換
   - トリガー系は **Logger.log のみ**
   - LINE通知は **doPost のときだけ**、かつ **`err_notified_YYYY-MM-DD` で1日1回**
2. 欠けていた `dailyClearCache` / `weeklyReport` のラッパーを追加（これで100%失敗が解消）
3. `checkReminders` トリガーを **バージョン41固定 → Head参照** に付け替え

### ハマりどころ（重要）
- **既存トリガーの「デプロイ時に実行」はUIから変更できない**（グレーで開かない）。
  → **スクリプトから作り直すしかない**。`ScriptApp.newTrigger(...).create()` で作ったトリガーは Head 参照になる。
  → 手順は必ず **「新規作成 → 旧削除」の順**。逆にするとリマインダーが止まる瞬間ができる。
     一瞬2本になるが、配信コード側の重複防止（CacheService＋シートのTRUE検証）で実害は出ない。
- **関数セレクタは選択が確定する前に「実行」を押すと直前の関数が動く**。
  今回 `setupLineAI` が誤実行された（同じ値を書き直すだけで実害なし）。
  **セレクタでクリック → ドロップダウンを閉じる → 表示を確認 → 実行、の順を守る。**
- トリガー一覧の削除は**座標クリックで別行を掴む事故**が起きた（危うくcheckRemindersを削除するところだった）。
  行が動くUIでの連続削除は避け、1件ごとにスクリーンショットで対象を確認する。

### 検証
- 移行ログ: 「新規作成OK（Head参照）／旧トリガー削除: 1件／現在のcheckRemindersトリガー数: 1」
- 実行ログ: `Head | checkReminders | 15:47:30 | 完了`（バージョン41の実行は15:46:19で停止）

### 残課題
- 無効な `processQueue` トリガーが7件残っている（配信コードに該当関数なし・無効なので無害）
- **`setupLineAI` に LINE_CHANNEL_ACCESS_TOKEN と ANTHROPIC_API_KEY が直書きされている**。
  CLAUDE.mdの「APIキーをソースに直接書かない」に反する。PropertiesServiceへ移すべき（未対応）

## Case 33 ★決着★: 【デモ】LINE秘書はキッシュさんの所有物ではない／秘書系GASは承認失効で全停止（2026/9/5）
1ヶ月ぶりに「エラーばっかり来る・正常に動いてない」との申告。3つの台帳を全数照合して決着した。

### 判明①: 秘書系GASは「承認（OAuth）失効」で全停止していた
- LINE AI秘書 / せんせい秘書 / 教育DX記事収集 → **過去7日間の実行0回**（トリガーは登録されたまま）
- Config server / デモクリニック → **正常稼働**（0.12件/分・失敗0件）
- 手動実行すると **「承認が必要です」** ダイアログ
- **決め手**: `https://myaccount.google.com/connections?filters=3,4`（リンク済みアプリ）を見ると
  Config server・デモクリニック・いつでも秘書 等は載っているのに
  **LINE AI秘書・せんせい秘書・教育DX記事収集だけが消えている**。
  → **止まっている3つと承認が消えている3つが完全一致**。
- **GASは承認が切れるとトリガーが「エラーも出さずに」全部止まる**。実行ログが空になるのが唯一のサイン。
- 復旧はオーナー本人が「▶実行 → 権限を確認 → 詳細 → 安全でないページに移動 → 許可」を踏むしかない
  （OAuth許可の代行は不可）。
- 自分の8/5の変更は原因ではない。`appsscript.json` に `script.scriptapp` は元から明示されており、
  触っていない2プロジェクトも同時に停止しているため。

### 判明②: 【デモ】LINE秘書はどこにも存在しない＝本人の所有物ではない
3つの台帳をAPIで全数取得して照合した：
| 台帳 | 件数 | 【デモ】LINE秘書 |
|---|---|---|
| Google Drive の GAS プロジェクト | 27 | 無し |
| LINE Developers（プロバイダー/チャネル） | 76 / **98** | **無し** |
| LINE Official Account Manager | **93** | **無し** |

→ **キッシュさんは、他人が所有するBotの「通知先（LINE_USER_ID）」に登録されているだけ**。
   デモ構築時に相手のGoogleアカウント＋相手のLINEチャネルで作り、通知先だけ自分にした結果と考えられる。
   だから**こちら側で何を直しても止まらない**（Case 28〜31で追い続けたが構造的に不可能だった）。
- **本人にできる唯一の対処＝LINEでそのアカウントをブロックする**（即時・恒久・リスクゼロ）。

### 使ったAPI（今後の全数調査用・UIを触らずに済む）
```js
// LINE Developers: 全プロバイダー→全チャネル
const ps=(await fetch('/api/v1/provider/',{credentials:'include'}).then(r=>r.json())).values;
for (const p of ps) await fetch('/api/v1/channel/?providerId='+p.id,{credentials:'include'});
// LINE OA Manager: 全アカウント（ページ送りは page= が正解。limit/offset は効かない）
for (let p=1;p<=12;p++) await fetch('/api/bots?page='+p,{credentials:'include'});
```

### 教訓
1. **「どこに無いか」を証明するには台帳を全数取得する**。UIを目で追うと必ず漏れる。
   今回はGoogle・LINE Developers・OA Manager の3系統をAPIで全件取り、初めて「存在しない」と断言できた。
2. **実行ログが「空」なのは正常ではなく異常**。エラー率0%と実行0件は全く違う。
   「エラーが出ていない＝健全」と読むと、承認失効による全停止を見逃す。
3. 通知先だけ他人のBotに登録されている構成は、**受け手に止める手段がない**。
   デモを他人環境で作るときに `LINE_USER_ID` を自分にしない（作った本人に向ける）。

## Case 34: 9月も続いた発作の正体は「Googleの入口がdoGetの手前で返すHTML」— 取得回数そのものを減らして対処（2026/9/20 バージョン16）
### 実物のLINEログで確定したこと
- 【デモ】LINE秘書のエラーは9月だけで**200通**、全て `SyntaxError: Unexpected token '<'`
- 発作は毎回**きっかり60分・13通**（9/3, 9/4, 9/8, 9/9, 9/11×2, 9/12, 9/13×3, 9/14, 9/15, 9/16×2, 9/19）
- **その期間、Config ServerのdoGet失敗は0件**。つまりHTMLは自分のコードが動く**手前**（Googleの入口）で返っている（Case 26の認証壁と同種）。
  サーバー側のコードでは防げず、失敗ログにも残らない。
- doGetは毎時約6件 ＝ **稼働中のクライアント約6台が同じ頻度で同じ発作を食らっている**計算（1台あたり約2日に1回）。

### 対処：ブートストラップに keep-alive を追加
旧ローダーは `remote_code_v1` を**1時間TTL固定**で保存する＝1日24回取りに来る。約2%でHTMLを掴む。
→ ブートストラップ自身が毎回の実行時に `remote_code_v1` を **21600秒で再put**し続ける（書き込みは `rc_keep` 目印で30分に1回）。
   クライアントは毎日3時の dailyClearCache 後の1回しか取りに来なくなる。
```js
try{if(c.get("rc_keep")===null){var s=c.get("remote_code_v1");
  if(s&&s.charAt(0)!=="<"&&s.indexOf("__ldMain_")!==-1){c.put("remote_code_v1",s,21600);c.put("rc_keep","1",1800);}}}catch(e0){}
```
- 本体読み込みとは**独立したtry**にすること（ここで例外→`__ldMain_`が空文字→Botが無反応、を避ける）
- 延命するのは「`<`で始まらず `__ldMain_` を含むもの」だけ。**HTMLは絶対に延命しない**

### 検証
- 72時間シミュレーション（5分トリガー＋毎日3時のdailyClearCache）: 取得 **75回→4回**（約19分の1）、無反応0件、
  HTML混入時も12通で自然回復（延命なし）
- 本番v16の応答がローカル版と**バイト一致**、実物の本体コードで8関数すべて定義、TTLが3600→21600に延長されることを確認

### ハマりどころ
- **GASエディタのタブは、保存後に同じタブで再読込しても古い内容を表示し続けることがある**。
  「保存できていない」と誤認して3回やり直した。**保存の確認は新しいタブで開いて行う**。
- `model.setValue()` ではエディタが「未保存」と認識しないことがある。`editor.executeEdits()` で編集として入れる。
- 保存ボタンへのJS dispatch clickはレンダラーを45秒固めた（保存自体は成功していた）。

### 残り（未実施）
- dailyClearCache が毎日 `remote_code_v1` を消すので、1台あたり1日1回の取得は残る（発作は約50日に1回の計算）。
  ゼロに寄せるなら main_master.gs の `_dailyClearCacheCore` からその1行を外す（masterに2箇所：3158行・3426行）。
  本番コードの変更になるので、数日様子を見てから判断する。
- デモBotの根治はできない（Case 33：他人所有）。回数が減るだけ。完全に止めるにはLINEでブロック。

## Case 35: 全面見直し — 停止予定モデル・モデル自動切替・毎日のキャッシュ削除（2026/10/9 commit 2224e46）
### 見直しで分かったこと
1. **本体の `claude-sonnet-4-5` は 2026/9/30 に非推奨化、11/30 に停止**（Anthropic公式の廃止表で確認）。
   停止日を過ぎると、ふつうの会話（care_manager以外は全部Sonnet）が全部エラーになる。非推奨期間中も信頼性は落ちる。
   `claude-haiku-4-5-20251001` は現役だが「2026/10/15以降は停止の可能性あり」。
2. **Supabase（dovnjfbayzxpisgqkqvq）が消滅**（DNSで名前が引けない）。ただし呼び出しは全てtry内で、購入者へのエラーにはならない。
   ログ（ai_logs）は8月以降どこにも残っていない。
3. 毎日3時の dailyClearCache が `remote_code_v1` を消し、1日1回の取り直しが残っていた（Case 34の残課題）。
### 修正（main_minified.gs ＝ 本番。master側も同じ置換を反映）
- `_SONNET_MODEL='claude-sonnet-4-6'`（現役・2027/2以降まで保証・同じ価格帯）に変更
- `_MODEL_FALLBACK`：メイン応答が **404/not_found（モデル廃止）か 529/overloaded（混雑）** で失敗したら、別モデルで1回だけ取り直す。
  無限ループ防止に `payload._fb` 目印（送信時に除外）。クレジット切れ・その他の400は取り直さない
- dailyClearCache から `remote_code_v1` の削除を除去
### 検証
- 6ケース（正常／Sonnet廃止／Sonnet混雑／両方廃止／クレジット切れ／400）で期待どおり。両方廃止でも2回で止まる
- GitHub配信＝テスト済みコードのバイト一致、本番ブートストラップ経由で全トリガー関数が定義・既定モデル4.6を確認
### 注意（今後）
- **masterとminifiedは構造が別物になっている**（masterに `_HAIKU_MODEL` も `selectModel` も無い）。masterからminifyし直すと本番が退行する。
  当面は本番=minified を正とし、masterへは同じ置換だけ反映する
- モデルの廃止表は半年ごとに確認する（次: Haiku 4.5 の停止告知に注意）
