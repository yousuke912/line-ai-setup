/**
 * ============================================================
 *  LINE AI秘書 — 設定サーバー（キッシュさん側で管理するGAS）
 *  copyright キッシュ
 *
 *  スクリプトプロパティ:
 *     DATA_SS_ID       → 1YjbNUDuDgyIDlgFb6XYxbngBXf52v_8mrQ9N_x-y0I8
 *     MAIN_CODE_ID     → main_code Primary Doc ID
 *     BACKUP_DOC_ID    → main_code_BACKUP Doc ID（setupFallbackSystemで自動作成）
 *     ADMIN_EMAIL      → 任意。指定なければスクリプト所有者のGmailに届く
 *     GITHUB_RAW_URL   → 任意。GitHub raw URL（Fallback③）
 *     GITHUB_TOKEN     → 任意。private repo 用
 * ============================================================
 */

// ============================================================
// 既存ユーティリティ
// ============================================================

function initPermissions() {
  var ss = SpreadsheetApp.openById('1YjbNUDuDgyIDlgFb6XYxbngBXf52v_8mrQ9N_x-y0I8');
  Logger.log('接続OK: ' + ss.getName());
  var docId = PropertiesService.getScriptProperties().getProperty('MAIN_CODE_ID');
  var doc = DocumentApp.openById(docId);
  Logger.log('Doc接続OK: ' + doc.getName());
}

function testFetch() {
  Logger.log(doGet({ parameter: {} }).getContent());
}

function testFetchCode() {
  var r = doGet({ parameter: { type: 'code' } });
  Logger.log('文字数: ' + r.getContent().length);
}

// ============================================================
// GETリクエスト（設定・コード配信）
// ============================================================
function doGet(e) {
  try {
    var type = (e && e.parameter && e.parameter.type) ? e.parameter.type : 'config';

    // ── type=code：多段Fallback付きでコードを返す
    if (type === 'code') {
      return getCodeWithFallback();
    }

    // ── type=config（デフォルト）：設定JSONを返す
    var ssId = PropertiesService.getScriptProperties().getProperty('DATA_SS_ID');
    if (!ssId) { return jsonResponse({ error: 'DATA_SS_ID未設定', _status: 'error' }); }
    var sheet = SpreadsheetApp.openById(ssId).getSheetByName('AI設定');
    if (!sheet) { return jsonResponse({ error: 'AI設定シートが見つかりません', _status: 'error' }); }
    var data = sheet.getDataRange().getValues();
    var config = {};
    for (var i = 3; i < data.length; i++) {
      var key = String(data[i][0]).trim();
      var val = String(data[i][1]).trim();
      if (key) { config[key] = val; }
    }
    config['_fetched_at'] = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
    config['_status'] = 'ok';
    return jsonResponse(config);

  } catch(err) {
    return jsonResponse({ error: err.toString(), _status: 'error' });
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 緊急復旧用: Primary Doc を新規作成（必要な時だけ手動実行）
// ============================================================
function fixMainCodeDoc() {
  var doc = DocumentApp.create('main_code_' + new Date().getTime());
  var docId = doc.getId();
  DriveApp.getFileById(docId).setSharing(
    DriveApp.Access.ANYONE_WITH_LINK,
    DriveApp.Permission.VIEW
  );
  PropertiesService.getScriptProperties().setProperty('MAIN_CODE_ID', docId);
  var url = 'https://docs.google.com/document/d/' + docId + '/edit';
  Logger.log('=========================================');
  Logger.log('新Doc作成完了');
  Logger.log('URL: ' + url);
  Logger.log('=========================================');
  Logger.log('1. 上のURLを開く');
  Logger.log('2. main_minified.gs の中身を全コピー → Doc に貼り付け');
  Logger.log('3. testFetchCode で文字数確認');
}

// ============================================================
// 多段Fallback本体
// ============================================================
function getCodeWithFallback() {
  // ============================================================
  // ▼ 2026-08-02 Case 27: Doc fallback全撤去 + 自前キャッシュ化
  //   旧構成の Primary/Backup Doc export は帯域超過時に1本4分ハングし、
  //   doGet全体が370秒 → GASの6分制限で強制kill → GoogleのHTMLエラーページが
  //   クライアントに返り、旧ローダーがそれを1時間キャッシュしてeval失敗
  //   →「APIクレジット」誤通知が毎分/5分毎に連発していた（3月からの全発作の真因）。
  //   新構成: ①自ScriptCache(50KB×分割・TTL6h) → ②GitHub(成功時cache更新)
  //           → ③期限なしバックアップ(PropertiesServiceは9KB制限のため使わない・
  //              cacheの期限切れコピーをTTL延長で持つ) → ④コメント返し
  //   これで doGet は常に数秒以内に応答し、370秒failが構造的に消滅する。
  // ============================================================
  var cache = CacheService.getScriptCache();

  // ①自前キャッシュ（100KB/キー制限のため2分割保存）
  var c1 = cache.get('srv_code_1'), c2 = cache.get('srv_code_2');
  if (c1 !== null && c2 !== null) {
    return ContentService.createTextOutput(c1 + c2).setMimeType(ContentService.MimeType.TEXT);
  }

  // ②GitHub（唯一の外部ソース。Doc fetchは撤去済み）
  var code = null, lastError = null;
  try {
    var c = fetchFromGithub();
    if (isValidCode(c)) { code = c; }
    else { lastError = 'github_raw: invalid (len=' + (c ? c.length : 0) + ')'; }
  } catch (err) { lastError = 'github_raw: ' + err.toString(); }

  if (code) {
    // 成功 → キャッシュ更新（TTL 6時間 = ScriptCache上限）
    try {
      var half = Math.ceil(code.length / 2);
      cache.put('srv_code_1', code.slice(0, half), 21600);
      cache.put('srv_code_2', code.slice(half), 21600);
    } catch (ce) { Logger.log('srv cache put失敗: ' + ce); }
    return ContentService.createTextOutput(code).setMimeType(ContentService.MimeType.TEXT);
  }

  // ③全滅 → 管理者通知 + コメント返し（クライアントは"function"無しと判定して静かにスキップ→次回再試行）
  notifyAdmin('🚨 コード取得失敗（GitHub）\n\n' + lastError + '\n\nキャッシュも空のため配信不能。GITHUB_RAW_URL/GITHUB_TOKENを確認してください');
  return ContentService.createTextOutput('// code fetch failed: ' + lastError)
                        .setMimeType(ContentService.MimeType.TEXT);
}

function isValidCode(code) {
  if (!code) return false;
  if (code.length < 50000) return false;
  if (code.indexOf('<html') !== -1) return false;
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

function saveBackupDoc(code) {
  var docId = PropertiesService.getScriptProperties().getProperty('BACKUP_DOC_ID');
  if (!docId) return;
  try {
    var doc = DocumentApp.openById(docId);
    doc.getBody().setText(code);
    doc.saveAndClose();
    PropertiesService.getScriptProperties().setProperty('BACKUP_UPDATED_AT', new Date().toISOString());
  } catch (e) {
    Logger.log('saveBackupDoc失敗: ' + e);
  }
}

// ============================================================
// ソース③: GitHub raw URL（任意）
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
// 管理者メール通知（1日1回制限）
// 宛先: ADMIN_EMAIL > Session.getActiveUser().getEmail() の優先順
// ============================================================
function notifyAdmin(msg) {
  try {
    var props = PropertiesService.getScriptProperties();
    var to = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
    if (!to) { Logger.log('ADMIN宛先取得失敗: ' + msg); return; }

    var flagKey = 'admin_notified_' + new Date().toISOString().slice(0, 10);
    if (props.getProperty(flagKey)) { Logger.log('本日通知済み: ' + msg); return; }
    props.setProperty(flagKey, '1');

    var subject = '【Config Server】' + msg.split('\n')[0].slice(0, 60);
    var body = msg + '\n\n---\n発生時刻: ' + new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    GmailApp.sendEmail(to, subject, body);
    Logger.log('管理者通知送信: ' + to);
  } catch (e) {
    Logger.log('notifyAdmin失敗: ' + e);
  }
}

// ============================================================
// セットアップ関数群
// ============================================================

function setupFallbackSystem() {
  var props = PropertiesService.getScriptProperties();
  var existingId = props.getProperty('BACKUP_DOC_ID');
  if (existingId) {
    try {
      DocumentApp.openById(existingId);
      Logger.log('⚠️ 既にBackup Doc構築済み: ' + existingId);
      Logger.log('URL: https://docs.google.com/document/d/' + existingId + '/edit');
      Logger.log('再構築したい場合はBACKUP_DOC_IDを削除してから再実行');
      return;
    } catch (e) {
      Logger.log('既存Backup Docが開けない→再構築します: ' + e);
    }
  }

  var code;
  try { code = fetchFromPrimaryDoc(); } catch (e) {
    throw new Error('Primary Docからコード取得失敗。MAIN_CODE_IDを確認してください: ' + e);
  }
  if (!isValidCode(code)) {
    throw new Error('Primary Docのコードが異常。先に復旧してください。len=' + (code ? code.length : 0));
  }

  var backupDoc = DocumentApp.create('main_code_BACKUP_' + new Date().getTime());
  var backupId = backupDoc.getId();
  backupDoc.getBody().setText(code);
  backupDoc.saveAndClose();
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

function setupAdminNotification() {
  var props = PropertiesService.getScriptProperties();
  var to = props.getProperty('ADMIN_EMAIL') || Session.getActiveUser().getEmail();
  Logger.log('=========================================');
  Logger.log('管理者メール通知の宛先: ' + (to || '取得失敗'));
  Logger.log('=========================================');
  Logger.log('指定なし → スクリプト所有者のGmailに自動で送ります');
  Logger.log('別アドレスにしたい場合: スクリプトプロパティに ADMIN_EMAIL を追加');
  Logger.log('testAdminNotification を実行してメール届くか確認');
}

function installBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'hourlyBackup') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('hourlyBackup').timeBased().everyHours(1).create();
  Logger.log('✅ 1時間ごとの自動バックアップ有効');
}

function hourlyBackup() {
  // ▼ 2026-08-02: Doc同期は廃止（Case 27）。トリガーが残っていても何もしない。
  Logger.log('hourlyBackup: 廃止済み（Case 27でDoc fallback撤去）');
}

// ============================================================
// テスト関数
// ============================================================

function testFallback() {
  Logger.log('=========================================');
  Logger.log('コード配信テスト（Case 27構成: cache → GitHub → コメント）');
  Logger.log('=========================================');
  var cache = CacheService.getScriptCache();
  var c1 = cache.get('srv_code_1'), c2 = cache.get('srv_code_2');
  Logger.log('サーバキャッシュ: ' + ((c1 !== null && c2 !== null) ? '✅あり (' + (c1.length + c2.length) + '字)' : '⚪️なし'));
  try {
    var g = fetchFromGithub();
    Logger.log('GitHub: ' + (isValidCode(g) ? '✅OK (' + g.length + '字)' : '❌異常 (' + (g ? g.length : 0) + '字)'));
  } catch (e) { Logger.log('GitHub: ❌例外 ' + e); }
  var result = getCodeWithFallback();
  var out = result.getContent();
  Logger.log('【統合】返却: ' + out.length + '字 / 健全性: ' + (isValidCode(out) ? '✅OK' : '❌異常'));
}

function clearServerCodeCache() {
  var cache = CacheService.getScriptCache();
  cache.remove('srv_code_1'); cache.remove('srv_code_2');
  Logger.log('✅ サーバコードキャッシュをクリアしました');
}

function testAdminNotification() {
  var props = PropertiesService.getScriptProperties();
  var flagKey = 'admin_notified_' + new Date().toISOString().slice(0, 10);
  props.deleteProperty(flagKey);
  notifyAdmin('✅ 通知テスト\n\nこれが届けばConfig Serverの監視通知は稼働しています');
  Logger.log('通知送信実行（届いたか確認）');
}

function resetNotificationFlag() {
  var props = PropertiesService.getScriptProperties();
  var flagKey = 'admin_notified_' + new Date().toISOString().slice(0, 10);
  props.deleteProperty(flagKey);
  Logger.log('✅ 通知フラグリセット完了');
}
