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
