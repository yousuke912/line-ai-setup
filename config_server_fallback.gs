/**
 * ============================================================
 * Config Server 再発防止パッチ
 * 作成: 2026-04-23
 * 目的: Google Doc削除などでコード取得失敗→全クライアント死亡を防ぐ
 *
 * ▼ セットアップ手順（順番通り）
 *   [STEP 1] Config Server GAS を開く
 *   [STEP 2] このファイルの中身を全部コピー → Config Serverの末尾に貼り付け → 保存
 *   [STEP 3] 既存 doGet(e) 内の type === 'code' ブロックを下記【差し替え】の通り修正
 *   [STEP 4] testFallback を実行して ①Primary Doc が ✅OK であることを確認
 *   [STEP 5] setupFallbackSystem を実行（Backup Doc作成）
 *   [STEP 6] スクリプトプロパティに手動追加:
 *             ADMIN_LINE_TOKEN = キッシュさん自身のLINE BotアクセストークンOR
 *                                既存いつでも秘書のトークン流用でも可
 *             ADMIN_LINE_UID   = キッシュさんのLINE User ID（Uxxxxx...）
 *   [STEP 7] testAdminNotification を実行してLINEに届くか確認
 *   [STEP 8] installBackupTrigger を実行（1時間ごとの自動バックアップON）
 *   [STEP 9] ウェブアプリ再デプロイ（「デプロイを管理」→ 鉛筆 → バージョン＝新バージョン → デプロイ）
 *
 * ▼ 守られるケース
 *   - Primary Doc削除 → Backup Docから自動復旧
 *   - Backup Docも削除 → GitHub raw URLから復旧（GITHUB_RAW_URL設定時のみ）
 *   - 全滅 → 管理者LINEに即通知
 *   - 既存クライアント250件のGASは一切変更不要
 * ============================================================
 */

// ============================================================
// 【差し替え】doGet の type === 'code' ブロック
// ============================================================
/*
  ▼ 既存コード（この4行を削除）

    var docId = PropertiesService.getScriptProperties().getProperty('MAIN_CODE_ID');
    var docUrl = 'https://docs.google.com/document/d/' + docId + '/export?format=txt';
    var code = UrlFetchApp.fetch(docUrl, { muteHttpExceptions: true }).getContentText();
    return ContentService.createTextOutput(code).setMimeType(ContentService.MimeType.TEXT);

  ▼ 差し替え後（1行だけ）

    return getCodeWithFallback();

  ▼ 修正後の完全形イメージ

    function doGet(e) {
      var type = (e && e.parameter && e.parameter.type) ? e.parameter.type : 'config';
      if (type === 'code') {
        return getCodeWithFallback();
      }
      // configブランチは触らない、そのまま残す
      ...
    }
*/

// ============================================================
// メイン: 多段Fallback付きコード取得
// ============================================================
function getCodeWithFallback() {
  var sources = [
    { name: 'primary_doc',   fn: fetchFromPrimaryDoc },
    { name: 'backup_doc',    fn: fetchFromBackupDoc },
    { name: 'github_raw',    fn: fetchFromGithub }
  ];

  var lastError = null;
  var usedSource = null;
  var code = null;

  for (var i = 0; i < sources.length; i++) {
    try {
      var c = sources[i].fn();
      if (isValidCode(c)) {
        code = c;
        usedSource = sources[i].name;
        break;
      }
      lastError = sources[i].name + ': invalid code (len=' + (c ? c.length : 0) + ')';
    } catch (err) {
      lastError = sources[i].name + ': ' + err.toString();
    }
  }

  // 全滅
  if (!code) {
    notifyAdmin('🚨 コード取得全滅\n\n' + lastError + '\n\n即対応必要');
    // クライアント側で eval が吐かれないよう、コメントだけ返す
    return ContentService.createTextOutput('// code fetch failed: ' + lastError)
                          .setMimeType(ContentService.MimeType.TEXT);
  }

  // プライマリ成功 → バックアップ更新
  if (usedSource === 'primary_doc') {
    try { saveBackupDoc(code); } catch (e) { Logger.log('backup save failed: ' + e); }
  } else {
    // フォールバック発動中 → 1日1回通知
    notifyAdmin('⚠️ Fallback稼働中\n\n使用ソース: ' + usedSource + '\n理由: ' + lastError + '\n\nPrimary Docを確認してください');
  }

  return ContentService.createTextOutput(code).setMimeType(ContentService.MimeType.TEXT);
}

// ============================================================
// 健全性チェック
// ============================================================
function isValidCode(code) {
  if (!code) return false;
  if (code.length < 50000) return false;          // main_minified.gs は約11万字
  if (code.indexOf('<html') !== -1) return false;  // HTMLページ混入検知
  if (code.indexOf('<!DOCTYPE') !== -1) return false;
  if (code.indexOf('function doPost') === -1) return false;
  return true;
}

// ============================================================
// ソース①: Primary Doc
// ============================================================
function fetchFromPrimaryDoc() {
  var docId = PropertiesService.getScriptProperties().getProperty('MAIN_CODE_ID');
  if (!docId) throw new Error('MAIN_CODE_ID未設定');
  var url = 'https://docs.google.com/document/d/' + docId + '/export?format=txt';
  return UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
}

// ============================================================
// ソース②: Backup Doc（Drive上の自動コピー）
// ============================================================
function fetchFromBackupDoc() {
  var docId = PropertiesService.getScriptProperties().getProperty('BACKUP_DOC_ID');
  if (!docId) throw new Error('BACKUP_DOC_ID未設定');
  var url = 'https://docs.google.com/document/d/' + docId + '/export?format=txt';
  return UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
}

// Backup Docに最新コードを書き戻す
function saveBackupDoc(code) {
  var docId = PropertiesService.getScriptProperties().getProperty('BACKUP_DOC_ID');
  if (!docId) return;
  try {
    var doc = DocumentApp.openById(docId);
    doc.getBody().setText(code);     // 全文置換
    doc.saveAndClose();
    PropertiesService.getScriptProperties().setProperty('BACKUP_UPDATED_AT', new Date().toISOString());
  } catch (e) {
    Logger.log('saveBackupDoc失敗: ' + e);
  }
}

// ============================================================
// ソース③: GitHub raw URL（任意）
// GITHUB_RAW_URLが設定されてれば使う
// private repoならGITHUB_TOKENも設定
// ============================================================
function fetchFromGithub() {
  var rawUrl = PropertiesService.getScriptProperties().getProperty('GITHUB_RAW_URL');
  if (!rawUrl) throw new Error('GITHUB_RAW_URL未設定（任意）');
  var token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  var opts = { muteHttpExceptions: true };
  if (token) opts.headers = { Authorization: 'token ' + token };
  return UrlFetchApp.fetch(rawUrl, opts).getContentText();
}

// ============================================================
// 管理者LINE通知（1日1回制限）
// ============================================================
function notifyAdmin(msg) {
  try {
    var props = PropertiesService.getScriptProperties();
    var tok = props.getProperty('ADMIN_LINE_TOKEN');
    var uid = props.getProperty('ADMIN_LINE_UID');
    if (!tok || !uid) { Logger.log('ADMIN通知未設定: ' + msg); return; }

    // 1日1回制限（重複通知防止）
    var flagKey = 'admin_notified_' + new Date().toISOString().slice(0, 10);
    if (props.getProperty(flagKey)) { Logger.log('本日通知済み: ' + msg); return; }
    props.setProperty(flagKey, '1');

    UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + tok },
      payload: JSON.stringify({
        to: uid,
        messages: [{ type: 'text', text: '【Config Server】\n' + msg }]
      }),
      muteHttpExceptions: true
    });
  } catch (e) {
    Logger.log('notifyAdmin失敗: ' + e);
  }
}

// ============================================================
// セットアップ関数群（キッシュさんが手動実行）
// ============================================================

// ①バックアップDocを作成（1回だけ実行）
function setupFallbackSystem() {
  var props = PropertiesService.getScriptProperties();

  // 既に構築済みチェック（孤立ファイル防止）
  var existingId = props.getProperty('BACKUP_DOC_ID');
  if (existingId) {
    try {
      var existing = DocumentApp.openById(existingId);
      Logger.log('⚠️ 既にBackup Doc構築済み: ' + existingId);
      Logger.log('URL: https://docs.google.com/document/d/' + existingId + '/edit');
      Logger.log('再構築したい場合はBACKUP_DOC_IDを削除してから再実行');
      return;
    } catch (e) {
      Logger.log('既存Backup Docが開けない→再構築します: ' + e);
    }
  }

  // Primary Docから現コードを取得
  var code;
  try { code = fetchFromPrimaryDoc(); } catch (e) {
    throw new Error('Primary Docからコード取得失敗。MAIN_CODE_IDを確認してください: ' + e);
  }
  if (!isValidCode(code)) {
    throw new Error('Primary Docのコードが異常。先に復旧してください。len=' + (code ? code.length : 0));
  }

  // バックアップDoc作成
  var backupDoc = DocumentApp.create('main_code_BACKUP_' + new Date().getTime());
  var backupId = backupDoc.getId();
  backupDoc.getBody().setText(code);
  backupDoc.saveAndClose();

  // 全員閲覧可に（export?format=txt取得のため）
  DriveApp.getFileById(backupId).setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.VIEW
  );

  props.setProperty('BACKUP_DOC_ID', backupId);
  props.setProperty('BACKUP_UPDATED_AT', new Date().toISOString());

  Logger.log('=========================================');
  Logger.log('✅ Fallbackシステム構築完了');
  Logger.log('Backup Doc ID: ' + backupId);
  Logger.log('URL: https://docs.google.com/document/d/' + backupId + '/edit');
  Logger.log('=========================================');
}

// ②管理者LINE通知を設定（1回だけ実行）
function setupAdminNotification() {
  var props = PropertiesService.getScriptProperties();

  // すでに設定済みなら何もしない（誤上書き防止）
  if (props.getProperty('ADMIN_LINE_TOKEN') && props.getProperty('ADMIN_LINE_UID')) {
    Logger.log('⚠️ 既に設定済み。上書きしたい場合は先に削除してから実行');
    Logger.log('ADMIN_LINE_TOKEN: ' + (props.getProperty('ADMIN_LINE_TOKEN') ? 'OK' : '未設定'));
    Logger.log('ADMIN_LINE_UID:   ' + (props.getProperty('ADMIN_LINE_UID') ? 'OK' : '未設定'));
    return;
  }

  Logger.log('=========================================');
  Logger.log('⚠️ 管理者LINE通知のセットアップ');
  Logger.log('=========================================');
  Logger.log('以下の2つをスクリプトプロパティに手動で追加してください:');
  Logger.log('  ADMIN_LINE_TOKEN : キッシュさんのLINE BotのチャネルアクセストークンOR');
  Logger.log('                    既存クライアントのトークン流用でもOK');
  Logger.log('  ADMIN_LINE_UID   : キッシュさんのLINE User ID（Uxxxxx...）');
  Logger.log('');
  Logger.log('設定方法: Config Server GAS → ⚙️プロジェクト設定 → スクリプトプロパティ');
  Logger.log('設定後、testAdminNotification を実行して動作確認');
}

// ③1時間ごとの自動バックアップトリガーをインストール
function installBackupTrigger() {
  // 既存の同名トリガーを削除（重複防止）
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'hourlyBackup') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // 新規作成
  ScriptApp.newTrigger('hourlyBackup').timeBased().everyHours(1).create();
  Logger.log('✅ 1時間ごとの自動バックアップ有効');
}

// トリガー本体: Primary Doc → Backup Doc 同期
function hourlyBackup() {
  try {
    var code = fetchFromPrimaryDoc();
    if (!isValidCode(code)) {
      notifyAdmin('⚠️ 定期バックアップ失敗: Primary Docが異常 (len=' + (code ? code.length : 0) + ')');
      return;
    }
    saveBackupDoc(code);
    Logger.log('定期バックアップ完了: ' + new Date().toISOString());
  } catch (e) {
    notifyAdmin('⚠️ 定期バックアップ例外: ' + e.toString());
  }
}

// ============================================================
// テスト関数（動作確認用）
// ============================================================

// 全Fallbackの動作確認
function testFallback() {
  Logger.log('=========================================');
  Logger.log('Fallback動作確認');
  Logger.log('=========================================');

  try {
    var c1 = fetchFromPrimaryDoc();
    Logger.log('①Primary Doc: ' + (isValidCode(c1) ? '✅OK (' + c1.length + '字)' : '❌異常 (' + (c1 ? c1.length : 0) + '字)'));
  } catch (e) { Logger.log('①Primary Doc: ❌例外 ' + e); }

  try {
    var c2 = fetchFromBackupDoc();
    Logger.log('②Backup Doc:  ' + (isValidCode(c2) ? '✅OK (' + c2.length + '字)' : '❌異常 (' + (c2 ? c2.length : 0) + '字)'));
  } catch (e) { Logger.log('②Backup Doc:  ❌例外 ' + e); }

  try {
    var c3 = fetchFromGithub();
    Logger.log('③GitHub:      ' + (isValidCode(c3) ? '✅OK (' + c3.length + '字)' : '❌異常 (' + (c3 ? c3.length : 0) + '字)'));
  } catch (e) { Logger.log('③GitHub:      ⚪️未設定 or 例外 ' + e); }

  Logger.log('');
  Logger.log('【統合テスト】getCodeWithFallback:');
  var result = getCodeWithFallback();
  var out = result.getContent();
  Logger.log('  返却サイズ: ' + out.length + '字');
  Logger.log('  健全性: ' + (isValidCode(out) ? '✅OK' : '❌異常'));
}

// 管理者LINE通知の疎通確認
function testAdminNotification() {
  // フラグをクリアして強制発火
  var props = PropertiesService.getScriptProperties();
  var flagKey = 'admin_notified_' + new Date().toISOString().slice(0, 10);
  props.deleteProperty(flagKey);

  notifyAdmin('✅ 通知テスト\n\nこれが届けばConfig Serverの監視通知は稼働しています');
  Logger.log('通知送信実行（届いたか確認）');
}

// 1日1回制限フラグを手動リセット（再テストしたい時用）
function resetNotificationFlag() {
  var props = PropertiesService.getScriptProperties();
  var flagKey = 'admin_notified_' + new Date().toISOString().slice(0, 10);
  props.deleteProperty(flagKey);
  Logger.log('✅ 通知フラグリセット完了');
}
