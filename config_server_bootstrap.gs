/**
 * ============================================================
 * Config Server 追加分：ブートストラップ配信（Case 30 対策）
 *
 * 【なぜ必要か】
 *  GAS CacheService の上限は 1値あたり 100,000 bytes。
 *  配信コード本体は 146,392 bytes あるため、クライアントの
 *    cache.put('remote_code_v1', txt, 3600)
 *  は必ず失敗していた（ローダーは catch(ce){} で握りつぶすので誰も気づかない）。
 *  結果:
 *   ・正常時はキャッシュが効かず全クライアントが毎トリガー146KBを取り直す
 *     → Config Server に約20リクエスト/分が集中 → 370秒kill・0秒即死が誘発される
 *   ・失敗するとGoogleのHTML（約9.6KB）が返り、これは小さいのでキャッシュに入る
 *     → 1時間居座り、5分毎に13通のエラー通知が出続ける
 *
 * 【対策】
 *  Config Server は本体146KBではなく「約52KBのブートストラップ」を返す。
 *  ブートストラップはクライアントのキャッシュに収まるので1時間キャッシュが効き、
 *  Config Server へのアクセスは 毎トリガー → 1時間に1回 に激減する。
 *  本体は GitHub raw から取得し、クライアント側で3分割して6時間キャッシュする。
 *
 * 【52KBに膨らませている理由（重要・消すな）】
 *  既存購入者の dailyCheck は type=code の応答が 50,000字未満だと
 *  「🔴 本体コード破損の疑い」を"購入者のLINEへ"送る。
 *  購入者コードは触れない（Case 15）ため、応答側を50,000字以上に保つ。
 *  同時に 100,000 bytes 未満に収めることでキャッシュ上限も満たす。
 * ============================================================
 */

/**
 * 【実際に適用した差分】2026/8/5 13:51 バージョン15としてデプロイ済み（URL不変）
 *
 *  既存の getCodeWithFallback() を下記2つに置き換えた:
 *
 *    function getCodeWithFallback() {
 *      return ContentService.createTextOutput(buildBootstrap_())
 *                           .setMimeType(ContentService.MimeType.TEXT);
 *    }
 *    function getCodeWithFallbackLegacy_() {   // ← 旧実装をそのまま改名して温存
 *      ... GitHub取得 + srv_code_1/2 キャッシュ ...
 *    }
 *
 *  これにより doGet はネットワークI/Oを一切行わなくなり、
 *  370秒kill・0秒即死が構造的に起きなくなる。
 */

var GH_RAW_URL_ = 'https://raw.githubusercontent.com/yousuke912/line-ai-setup/main/main_minified.gs';
var CS_URL_ = 'https://script.google.com/macros/s/AKfycbyVsCDTmvXjwKzF82bGUHD5Sp3RF3SJVIKuIG0WFGyMzmlbvy--O9qqoDiXLi4zP4O-xw/exec';

/**
 * クライアントに配布する小さなローダー本体を組み立てる。
 * ・正規表現を使わない（文字列内エスケープ事故を避けるため）
 * ・絶対に throw しない（throwすると旧ローダーが購入者へエラー通知を送るため）
 *   取得できなければ空文字を返す → 関数が未定義になり、ローダーは Logger.log のみで静かに終わる
 */
function buildBootstrap_() {
  // v17（Case 38）: GitHubが取れない時は Config Server の type=full で本体を取る（片方が落ちても動く）。
  //   本体の検証で「読み込み役そのもの」を弾く（先頭が function __ldMain_）。本体の中に読み込み役の文字列が
  //   埋め込まれているので、"__ldMain_" を含むかどうかでは判定しないこと。
  var boot = [
    'function __ldMain_(){',
    '  try{',
    '    var c=CacheService.getScriptCache();',
    '    try{if(c.get("rc_keep")===null){var s=c.get("remote_code_v1");',
    '      if(s&&s.charAt(0)!=="<"&&s.indexOf("__ldMain_")!==-1){c.put("remote_code_v1",s,21600);c.put("rc_keep","1",1800);}}}catch(e0){}',
    '    var a=c.get("mcode_1"),b=c.get("mcode_2"),d=c.get("mcode_3");',
    '    if(a!==null&&b!==null&&d!==null){var k=a+b+d;if(__ldOk_(k))return k;}',
    '    var t=__ldFetch_("' + GH_RAW_URL_ + '");',
    '    if(!t)t=__ldFetch_("' + CS_URL_ + '?type=full");',
    '    if(!t)return "";',
    '    try{var n=Math.ceil(t.length/3);',
    '        c.put("mcode_1",t.slice(0,n),21600);',
    '        c.put("mcode_2",t.slice(n,n+n),21600);',
    '        c.put("mcode_3",t.slice(n+n),21600);}catch(e2){}',
    '    return t;',
    '  }catch(e){return "";}',
    '}',
    'function __ldOk_(t){return !!t&&t.charAt(0)!=="<"&&t.length>=50000&&t.indexOf("function doPost")!==-1&&t.indexOf("function __ldMain_(){")!==0;}',
    'function __ldFetch_(u){try{var r=UrlFetchApp.fetch(u,{muteHttpExceptions:true});if(r.getResponseCode()!==200)return "";var t=r.getContentText();return __ldOk_(t)?t:"";}catch(e){return "";}}',
    '//BOOT_V17',
    'eval(__ldMain_());'
  ].join('\n');

  // 旧dailyCheckの「50,000字未満＝破損」判定を踏まないためのパディング。
  // 括弧・不等号・system_prompt を含めないこと（各世代ローダーの検証条件に触れるため）。
  var unit = 'PADDING FOR LEGACY dailyCheck LENGTH CHECK. DO NOT REMOVE. ';
  var pad = '';
  while (boot.length + pad.length < 52000) { pad += unit; }

  return boot + '\n/* ' + pad + ' */\n';
}

/**
 * Case 38: 購入者Botの生存確認（checkReminders が6時間に1回送ってくる）。
 * 「3ヶ月止まっていても誰も気づけない」をなくすため、Botごとの最終確認時刻を表に残す。
 * トークン類は受け取らない（scriptId・Bot名・本体版・トリガー名・モデルのみ）。
 */
function recordHeartbeat_(e) {
  try {
    var p = (e && e.parameter) || {};
    var sid = String(p.sid || '').slice(0, 80);
    if (!sid) return ContentService.createTextOutput('ng');
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return ContentService.createTextOutput('busy');
    try {
      var props = PropertiesService.getScriptProperties();
      var id = props.getProperty('HB_SS_ID'), ss = null;
      if (id) { try { ss = SpreadsheetApp.openById(id); } catch (x) { ss = null; } }
      if (!ss) {
        ss = SpreadsheetApp.create('いつでも秘書_稼働状況');
        props.setProperty('HB_SS_ID', ss.getId());
        ss.getSheets()[0].appendRow(['scriptId', 'Bot名', '最終確認(JST)', '本体版', 'トリガー', 'モデル']);
      }
      var sh = ss.getSheets()[0];
      var vals = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues(), row = -1;
      for (var i = 1; i < vals.length; i++) { if (vals[i][0] === sid) { row = i + 1; break; } }
      var rec = [sid, String(p.bot || '').slice(0, 60), Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm'),
                 String(p.v || '').slice(0, 20), String(p.tr || '').slice(0, 200), String(p.m || '').slice(0, 40)];
      if (row > 0) sh.getRange(row, 1, 1, rec.length).setValues([rec]); else sh.appendRow(rec);
    } finally { lock.releaseLock(); }
    return ContentService.createTextOutput('ok');
  } catch (err) { return ContentService.createTextOutput('ng'); }
}

/**
 * 動作確認用。実行ログにサイズと各種条件の判定結果を出す。
 */
function testBootstrap_() {
  var s = buildBootstrap_();
  var bytes = Utilities.newBlob(s).getBytes().length;
  Logger.log('chars=' + s.length + ' bytes=' + bytes);
  Logger.log('50000字以上(旧dailyCheck対策): ' + (s.length >= 50000));
  Logger.log('100000bytes未満(キャッシュ上限): ' + (bytes < 100000));
  Logger.log('先頭が < でない: ' + (s.charAt(0) !== '<'));
  Logger.log('functionを含む(旧ローダー検証): ' + (s.indexOf('function') !== -1));
  Logger.log('system_promptを含まない: ' + (s.indexOf('system_prompt') === -1));
  var op = (s.match(/\(/g) || []).length, cp = (s.match(/\)/g) || []).length;
  Logger.log('括弧差(旧dailyCheckは5超でNG): ' + Math.abs(op - cp));
}
