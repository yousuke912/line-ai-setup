function getConfig() {
var props = PropertiesService.getScriptProperties();
return {
LINE_TOKEN: props.getProperty('LINE_CHANNEL_ACCESS_TOKEN'),
ANTHROPIC_KEY: props.getProperty('ANTHROPIC_API_KEY'),
USER_ID: props.getProperty('LINE_USER_ID')
};
}
var REMOTE_CONFIG_CACHE_KEY = 'remote_config';
var REMOTE_CONFIG_TTL = 21600;
var SCRIPT_CACHE = CacheService.getScriptCache();
var HISTORY_PREFIX = 'h_';
var MAX_TURNS = 3;
function getRemoteConfig() {
var cached = SCRIPT_CACHE.get(REMOTE_CONFIG_CACHE_KEY);
if (cached) {
try { return JSON.parse(cached); } catch(e) {}
}
var props = PropertiesService.getScriptProperties();
var configUrl = props.getProperty('MASTER_CONFIG_URL');
if (!configUrl) {
configUrl = 'https://script.google.com/macros/s/AKfycbyVsCDTmvXjwKzF82bGUHD5Sp3RF3SJVIKuIG0WFGyMzmlbvy--O9qqoDiXLi4zP4O-xw/exec';
}
try {
var res = UrlFetchApp.fetch(configUrl, { muteHttpExceptions: true });
var config = JSON.parse(res.getContentText());
if (config._status === 'ok') {
SCRIPT_CACHE.put(REMOTE_CONFIG_CACHE_KEY, JSON.stringify(config), REMOTE_CONFIG_TTL);


return config;
}
} catch(e) {


}
return getDefaultConfig();
}
function getDefaultConfig() {
return {
system_prompt: 'あなたは優秀なAI秘書です。丁寧で簡潔な日本語・箇条書きは「・」で回答。',
ai_tone: '丁寧・親しみやすい',
greeting: 'こんにちは！何かお手伝いできますか？😊',
max_history: '8',
announcement: '',
maintenance: 'FALSE',
maintenance_msg: 'ただいまメンテナンス中です。しばらくお待ちください。',
version: '3.3.0',
_status: 'default'
};
}
function getJSTNow() {
return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy年M月d日（E） HH:mm');
}
function fmtDate(d, fmt) {
return Utilities.formatDate(new Date(d), 'Asia/Tokyo', fmt);
}
function getJSTDate(offsetDays) {
offsetDays = offsetDays || 0;
var str = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
var y = parseInt(str.substring(0, 4));
var m = parseInt(str.substring(5, 7)) - 1;
var d = parseInt(str.substring(8, 10));
return new Date(y, m, d + offsetDays);
}
function splitMsg(text) {
var max = 3500;
if (text.length <= max) { return [text]; }
var parts = [];
for (var i = 0; i < text.length; i += max) { parts.push(text.slice(i, i + max)); }
return parts;
}
function getHistory(uid) {
var cached = SCRIPT_CACHE.get(HISTORY_PREFIX + uid);
if (cached) { return JSON.parse(cached); }
var props = PropertiesService.getScriptProperties();
var raw = props.getProperty(HISTORY_PREFIX + uid);
if (!raw) { return []; }
try { SCRIPT_CACHE.put(HISTORY_PREFIX + uid, raw, 21600); } catch(e) {}
return JSON.parse(raw);
}
function saveHistory(uid, history) {
if (history.length > MAX_TURNS * 2) { history = history.slice(-MAX_TURNS * 2); }
var json = JSON.stringify(history);
try { SCRIPT_CACHE.put(HISTORY_PREFIX + uid, json, 43200); } catch(e) {}
try { PropertiesService.getScriptProperties().setProperty(HISTORY_PREFIX + uid, json); } catch(e) {}
}
function clearHistory(uid) {
try { SCRIPT_CACHE.remove(HISTORY_PREFIX + uid); } catch(e) {}
try { PropertiesService.getScriptProperties().deleteProperty(HISTORY_PREFIX + uid); } catch(e) {}
}
var REPLY_MODE_PREFIX = 'replymode_';
function getReplyMode(uid) {
var cached = SCRIPT_CACHE.get(REPLY_MODE_PREFIX + uid);
if (cached) { return cached === 'true'; }
var val = PropertiesService.getScriptProperties().getProperty(REPLY_MODE_PREFIX + uid);
return val === 'true';
}
function setReplyMode(uid, bool) {
var val = bool ? 'true' : 'false';
try { SCRIPT_CACHE.put(REPLY_MODE_PREFIX + uid, val, 43200); } catch(e) {}
PropertiesService.getScriptProperties().setProperty(REPLY_MODE_PREFIX + uid, val);
}
function getDataSheet(sheetName) {
var props = PropertiesService.getScriptProperties();
var ssId = props.getProperty('DATA_SS_ID');
var ss;
if (ssId) { try { ss = SpreadsheetApp.openById(ssId); } catch(e) { ss = null; } }
if (!ss) {
ss = SpreadsheetApp.create('LINE AI秘書 データ管理');
props.setProperty('DATA_SS_ID', ss.getId());
}
var sheet = ss.getSheetByName(sheetName);
if (!sheet) { sheet = ss.insertSheet(sheetName); }
return sheet;
}
function doPost(e) {
try {
var events = JSON.parse(e.postData.contents).events;
for (var i = 0; i < events.length; i++) {
var ev = events[i];
if (ev.type === 'follow') {
var followUid = ev.source.userId;
saveUserId(followUid);
replyToLine(ev.replyToken, 'ご登録ありがとうございます！🎉\nLINE AI秘書をご利用いただけます。\n\n機能一覧👇');
Utilities.sleep(300);
pushCarousel(followUid);
continue;
}
if (ev.source.type === 'group' || ev.source.type === 'room') {
if (!ev.message || ev.message.type !== 'text') { continue; }
var msgText = ev.message.text.trim();
var senderUid = ev.source.userId;
var grpProps = PropertiesService.getScriptProperties();
var ownerUid = grpProps.getProperty('LINE_USER_ID') || '';
var isMentioned = false;
if (ev.message.mention && ev.message.mention.mentionees) {
for (var mi = 0; mi < ev.message.mention.mentionees.length; mi++) {
if (ev.message.mention.mentionees[mi].userId === ownerUid) { isMentioned = true; break; }
}
}
if (isMentioned && senderUid !== ownerUid) {
processGroupMention(ev);
} else if (senderUid === ownerUid) {
processGroupMessage(senderUid, msgText, grpProps);
}
continue;
}
if (ev.type === 'message' && ev.message.type === 'image') {
var uid2 = ev.source.userId;
saveUserId(uid2);
var cfg2 = getConfig();
try {
var imgRes = UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/' + ev.message.id + '/content', {
headers: { Authorization: 'Bearer ' + cfg2.LINE_TOKEN },
muteHttpExceptions: true
});
var blob = imgRes.getBlob();
var fname = '📸 ' + Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd_HH-mm-ss') + '.jpg';
var file = DriveApp.createFile(blob.setName(fname));
file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
replyToLine(ev.replyToken, '📸 Driveに保存しました！\n' + fname + '\n' + file.getUrl());
} catch(imgErr) {
replyToLine(ev.replyToken, '画像の保存に失敗しました: ' + imgErr.toString());
}
continue;
}
if (ev.type !== 'message' || ev.message.type !== 'text') { continue; }
var uid = ev.source.userId;
var message = ev.message.text.trim();
saveUserId(uid);
if (message === 'ヘルプ' || message === 'help') {
var carouselSent = sendCarousel(ev.replyToken);
if (!carouselSent) { replyToLine(ev.replyToken, helpText()); }
continue;
}
var reply = processMessage(uid, message);
if (reply) { replyToLine(ev.replyToken, reply); }
}
} catch (err) {


try {
var cfg = getConfig();
if (cfg.LINE_TOKEN && cfg.USER_ID) {
pushToLine(cfg.USER_ID,
'🔴 システムエラーが発生しました\n\n' +
'エラー内容:\n' + err.toString() + '\n\n' +
'繰り返し発生する場合は\nhttps://console.anthropic.com\nのBillingでクレジット残高をご確認ください。'
);
}
} catch(e2) {  }
}
return ContentService.createTextOutput('OK');
}
function saveUserId(uid) {
var props = PropertiesService.getScriptProperties();
if (!props.getProperty('LINE_USER_ID')) { props.setProperty('LINE_USER_ID', uid); }
}
function processMessage(uid, message) {
var demoWarning = '';
try{if(uid==='U029395d561dbfe988aceae03cbf6affc'){saveToMyCompanyAuto(message);}}catch(e){}
var config = getConfig();
if (!config.ANTHROPIC_KEY) { return 'ANTHROPIC_API_KEY が未設定です。スクリプトプロパティを確認してください。'; }
var remoteConfig = getRemoteConfig();
if (remoteConfig.maintenance === 'TRUE') {
return remoteConfig.maintenance_msg || 'ただいまメンテナンス中です。しばらくお待ちください。';
}
var props = PropertiesService.getScriptProperties();
var announcementText = remoteConfig.announcement || '';
if (announcementText) {
var announceSentKey = 'ann_sent_' + announcementText.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '_');
if (!props.getProperty(announceSentKey)) {
props.setProperty(announceSentKey, 'TRUE');
var cfg2 = getConfig();
if (cfg2.LINE_TOKEN && cfg2.USER_ID) {
pushToLine(cfg2.USER_ID, '📢 お知らせ\n\n' + announcementText);
}
}
}
var demoMode = props.getProperty('DEMO_MODE');
if (demoMode === 'TRUE') {
var countKey = 'demo_count_' + uid;
var countProp = props.getProperty(countKey);
var count = countProp ? parseInt(countProp) : 0;
if (count >= 10) {
return 'デモ版は10回までです。\n\nご購入はこちら👇\nhttps://omoseka.com/plan';
}
try {
props.setProperty(countKey, String(count + 1));
} catch(e) {


}
var remaining = 10 - (count + 1);
if (remaining <= 3 && remaining > 0) {
demoWarning = '\n\n---\n⚠️ デモ版：残り' + remaining + '回です';
}
}
if (message === 'リセット' || message === 'reset') {
clearHistory(uid);
setReplyMode(uid, false);
return '🔄 会話履歴をリセットしました！新しい話題から始めましょう。';
}
if (message === '返信終了') {
setReplyMode(uid, false);
clearHistory(uid);
return '✅ 返信作成モードを終了しました。通常モードに戻りました。';
}
var categoryHelp = getCategoryHelp(message);
if (categoryHelp) { return categoryHelp; }
if (message === '残高確認' || message === 'クレジット確認' || message === 'API残高') {
return getMonthlyUsageText(props);
}
if (/^(タスク|スキップ):/.test(message)) {
var isTask = message.indexOf('タスク:') === 0;
var sk = message.replace(/^(タスク|スキップ):/, '').trim();
var ap = props.getProperties();
for (var pk in ap) {
if (pk.indexOf('pt_') === 0 && pk.slice(-6) === sk) {
if (isTask) {
var _ts2 = getDataSheet('タスク');
if (_ts2.getLastRow() === 0) { _ts2.appendRow(['ID','追加日時','期限','優先度','タスク','状態']); }
_ts2.appendRow([new Date().getTime().toString(), getJSTNow(), '', '中', ap[pk], '未完了']);
props.deleteProperty(pk);
return '✅ タスク登録: ' + ap[pk];
}
props.deleteProperty(pk);
return '🗑 スキップしました';
}
}
return '⚠️ 見つかりません';
}
if (message === '口調変更' || message === '口調設定') {
return '🗣 口調設定\n1.丁寧 2.フレンドリー 3.ビジネス 4.カスタム\n\n例:「カスタム:関西弁で」\n現在: '+(getTone(uid,props)||'丁寧');
}
if (/^(1|2|3|丁寧|フレンドリー|ビジネス)$/.test(message)) {
var toneMap = {'1':'丁寧','2':'フレンドリー','3':'ビジネス'};
var newTone = toneMap[message] || message;
setTone(uid, newTone, props);
var toneLabels = {'丁寧':'丁寧（デフォルト）','フレンドリー':'フレンドリー（タメ口・絵文字多め）','ビジネス':'ビジネス（簡潔・敬語）'};
return '✅ 口調を「' + (toneLabels[newTone] || newTone) + '」に変更しました！\n\n次のメッセージから反映されます。';
}
if (message.indexOf('カスタム:') === 0 || message.indexOf('カスタム：') === 0) {
var customTone = message.replace(/^カスタム[：:]/, '').trim();
if (customTone) {
setTone(uid, customTone, props);
return '✅ 口調を「' + customTone + '」に設定しました！\n\n次のメッセージから反映されます。';
}
return '「カスタム:関西弁で」と送信してください';
}
if (message === '4') {
return '「カスタム:関西弁で」のように送信してください';
}
if (message === '返信開始') {
setReplyMode(uid, true);
clearHistory(uid);
return '✉️ 返信作成モード開始\n①お客様メッセージ②伝えたいこと\n終了:「返信終了」';
}
var history = getHistory(uid);
var isReplyMode = getReplyMode(uid);
var tonePrompt = getTonePrompt(uid, props);
if (tonePrompt && remoteConfig) {
remoteConfig = JSON.parse(JSON.stringify(remoteConfig));
remoteConfig.system_prompt = (remoteConfig.system_prompt || '') + tonePrompt;
}
history.push({ role: 'user', content: message });
var maxLoops = 3;
var finalReply = '';
for (var loop = 0; loop < maxLoops; loop++) {
var response = callClaudeWithTools(config.ANTHROPIC_KEY, history, isReplyMode, remoteConfig);
if (!response) { finalReply = 'エラーが発生しました。もう一度お試しください。'; break; }
var stopReason = response.stop_reason;
var content = response.content;
if (response._credit_error) {
finalReply =
'⚠️ APIクレジット残高が不足しています。\n\n' +
'以下の手順でチャージしてください:\n' +
'① https://console.anthropic.com を開く\n' +
'② 左メニュー「Billing」をクリック\n' +
'③「Add credit」でクレジットカードからチャージ\n' +
' （$5〜$10程度がおすすめ）\n\n' +
'チャージ後はすぐにご利用いただけます。';
break;
}
if (stopReason === 'end_turn') {
for (var ci = 0; ci < content.length; ci++) {
if (content[ci].type === 'text') { finalReply = content[ci].text; break; }
}
history.push({ role: 'assistant', content: content });
if (response.usage) {
var usageResult = trackTokenUsage(response.usage.input_tokens, response.usage.output_tokens, props);
if (usageResult.newWarn) {
var cfg3 = getConfig();
if (cfg3.LINE_TOKEN && cfg3.USER_ID) {
var warnMsg = '⚠️ 今月のAPI推定コストが¥' + usageResult.newWarn + 'に達しました\n\n' + getMonthlyUsageText(props);
pushToLine(cfg3.USER_ID, warnMsg);
}
}
}
break;
}
if (stopReason === 'tool_use') {
history.push({ role: 'assistant', content: content });
var toolResults = [];
for (var ti = 0; ti < content.length; ti++) {
if (content[ti].type !== 'tool_use') { continue; }
var toolName = content[ti].name;
var toolInput = content[ti].input;
var toolCallId = content[ti].id;
var toolResult = executeTool(toolName, toolInput, uid);
var trimmedResult = typeof toolResult === 'string' && toolResult.length > 1500
? toolResult.slice(0, 1500) + '…（省略）'
: toolResult;
toolResults.push({ type:'tool_result', tool_use_id: toolCallId, content: trimmedResult });
}
history.push({ role: 'user', content: toolResults });
continue;
}
finalReply = 'すみません、処理できませんでした。もう一度お試しください。';
break;
}
if (!finalReply) { finalReply = 'エラーが発生しました。\n繰り返しエラーが出る場合はAPIクレジットの残高をご確認ください:\nhttps://console.anthropic.com → Billing'; }
var cleanHistory = [];
for (var hi = 0; hi < history.length; hi++) {
var h = history[hi];
if (h.role === 'user' && Array.isArray(h.content)) {
var hasToolResult = false;
for (var hci = 0; hci < h.content.length; hci++) {
if (h.content[hci].type === 'tool_result') { hasToolResult = true; break; }
}
if (hasToolResult) { continue; }
}
if (h.role === 'assistant' && Array.isArray(h.content)) {
var hasText = false;
for (var hci2 = 0; hci2 < h.content.length; hci2++) {
if (h.content[hci2].type === 'text') { hasText = true; break; }
}
if (!hasText) { continue; }
var textContent = '';
for (var hci3 = 0; hci3 < h.content.length; hci3++) {
if (h.content[hci3].type === 'text') { textContent = h.content[hci3].text; break; }
}
cleanHistory.push({ role: 'assistant', content: textContent });
continue;
}
cleanHistory.push(h);
}
saveHistory(uid, cleanHistory);
if (demoWarning) {
finalReply = finalReply + demoWarning;
}
return finalReply;
}
function callClaudeWithTools(apiKey, history, isReplyMode, remoteConf) {
var tools = getToolDefinitions();
if (!remoteConf) { remoteConf = getRemoteConfig(); }
var basePrompt = remoteConf.system_prompt ||
'あなたは優秀なAI秘書です。LINEを通じてユーザーの仕事をサポートします。丁寧で簡潔な日本語で回答してください。';
var announceTxt = '';
var systemPrompt;
if (isReplyMode) {
systemPrompt =
'あなたはお店・事業者のLINE返信文案を作る専門アシスタントです。\n' +
'ユーザーが「お客様からのメッセージ」と「伝えたいこと（箇条書きや音声メモ）」を入力します。\n' +
'それをもとに、丁寧・自然・親しみやすい返信文を作成してください。\n\n' +
'【ルール】\n' +
'・返信文だけをそのまま使えるように仕上げる（説明や前置き不要）\n' +
'・敬語は丁寧すぎず、お客様に寄り添うトーンで\n' +
'・LINEらしい読みやすい改行を入れる\n' +
'・絵文字は1〜2個まで、使いすぎない\n' +
'・修正依頼（「もっと柔らかく」「短くして」「絵文字なし」など）にも対応する\n' +
'・ツールは使わない\n' +
'・現在の日時: ' + getJSTNow();
} else {
systemPrompt =
basePrompt +
'\n・Google系の質問は必ずツールを使って回答。推測禁止。' +
'\n・「〇〇を英語にして」「〇〇に翻訳して」などの翻訳依頼はツールなしで直接翻訳してください。' +
'\n・「この文章を丁寧にして」「校正して」「わかりやすくして」などの文章校正依頼はツールなしで直接対応してください。' +
'\n・「〇〇円の消費税は？」「〇〇を計算して」などの計算・単位変換はツールなしで直接計算してください。' +
'\n・「今日の予定は？」「メールは？」「タスクは？」など情報を尋ねる質問は、必ず対応するツールを実行してから答えてください。' +
'\n・前の会話を踏まえて行動してください' +
'\n・削除・変更は対象を確認してから実行してください' +
'\n・曖昧な指示は文脈から意図を推測して実行してください' +
announceTxt +
'\n・現在の日時: ' + getJSTNow();
}
var lastMsg = '';
for (var hi = history.length - 1; hi >= 0; hi--) {
if (history[hi].role === 'user' && typeof history[hi].content === 'string') {
lastMsg = history[hi].content;
break;
}
}
var selectedTools = isReplyMode ? [] : selectTools(lastMsg);
var payload = {
model: 'claude-sonnet-4-5',
max_tokens: 800,
system: [{ type:'text', text: systemPrompt, cache_control: { type:'ephemeral' } }],
tools: selectedTools,
messages: history
};
try {
var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
method: 'post',
contentType: 'application/json',
headers: {
'x-api-key': apiKey,
'anthropic-version': '2023-06-01',
'anthropic-beta': 'prompt-caching-2024-07-31'
},
payload: JSON.stringify(payload),
muteHttpExceptions: true
});
var rawText = res.getContentText();
if (rawText.charAt(0) === '<') return { _credit_error: true };
var result = JSON.parse(rawText);
if (result.error) {
var errType = result.error.type || '';
var errMsg = result.error.message || '';
if (errType === 'billing_error' || errMsg.indexOf('credit') !== -1 || errMsg.indexOf('balance') !== -1 || result.error.type === 'insufficient_quota') {
return { _credit_error: true };
}
return null;
}
return result;
} catch (err) {


return null;
}
}
function _T(n,d,p,r){return{name:n,description:d,input_schema:{type:'object',properties:p||{},required:r||[]}};}
function _S(d){return{type:'string',description:d};}
function _N(d){return{type:'number',description:d};}
function _B(d){return{type:'boolean',description:d};}
function _E(d,e){return{type:'string',description:d,enum:e};}
function _G(){return{
gmail:['gmail_check','gmail_send'],calendar:['calendar_view','calendar_add','calendar_delete','calendar_edit'],
docs:['docs_create','docs_read','docs_delete'],sheets:['sheets_create','sheets_read','sheets_delete','sheets_write'],
drive:['drive_folder_create','drive_file_list','drive_file_delete','drive_file_move','drive_file_rename','drive_file_search'],
memo:['memo_add','memo_view','memo_delete'],task:['task_add','task_view','task_done','task_delete'],
reminder:['reminder_add','reminder_view','reminder_delete','birthday_reminder'],briefing:['briefing_setting'],
tone:['set_tone'],search:['web_search'],weather:['weather'],route:['route_search','hotel_search'],
url:['url_summarize'],photo:['drive_file_search'],report:['report_generate'],company:['company']};}
function getToolDefinitions() {
var s=_S,n=_N,b=_B,e=_E;
return [
_T('gmail_check','未読メール確認',{count:n('件数(デフォルト5)')}),
_T('gmail_send','メール送信',{to_email:s('宛先メール'),to_name:s('宛先名'),subject:s('件名'),body:s('本文')},['subject','body']),
_T('calendar_view','予定確認',{range:s('today/tomorrow/week'),date_from:s('開始日date'),date_to:s('終了日date'),find_free:b('trueで空き時間')},['range']),
_T('calendar_add','予定追加',{title:s('タイトル'),start:s('開始日時datetime'),end:s('終了日時datetime'),location:s('場所'),description:s('詳細'),all_day:b('終日true')},['title','start']),
_T('calendar_delete','予定削除',{keyword:s('予定キーワード'),date:s('日付date'),range_days:n('検索範囲'),time_hint:s('時刻ヒント')},['keyword']),
_T('calendar_edit','予定変更',{keyword:s('予定キーワード'),search_date:s('検索日date'),new_title:s('新タイトル'),new_start:s('新開始datetime'),new_end:s('新終了datetime'),new_location:s('新場所')},['keyword']),
_T('sheets_create','スプシ作成',{title:s('タイトル'),headers:{type:'array',items:{type:'string'},description:'列名配列'}},['title','headers']),
_T('docs_create','ドキュメント作成',{title:s('タイトル'),content:s('初期内容')},['title']),
_T('memo_add','メモ保存',{content:s('内容'),tag:s('タグ')},['content']),
_T('memo_view','メモ一覧',{limit:n('取得件数')}),
_T('memo_delete','メモ削除',{keyword:s('キーワードまたは番号')},['keyword']),
_T('reminder_add','リマインダー設定',{content:s('内容'),datetime:s('日時datetime'),repeat:e('繰返し',['none','daily','weekly','monthly','monthly_weekday']),nth_week:n('第N週'),weekday:n('曜日0=日〜6=土')},['content','datetime']),
_T('reminder_view','リマインダー一覧',{}),
_T('reminder_delete','リマインダー削除',{keyword:s('キーワード')},['keyword']),
_T('task_add','タスク追加',{task:s('内容'),due:s('期限date'),priority:e('優先度',['高','中','低'])},['task']),
_T('task_view','タスク一覧',{show_done:b('完了済み表示')}),
_T('task_done','タスク完了',{keyword:s('キーワード')},['keyword']),
_T('task_delete','タスク削除',{keyword:s('キーワード')},['keyword']),
_T('set_tone','口調設定。口調変更の要望があれば必ず呼ぶ',{tone:s('口調')},['tone']),
_T('web_search','情報を検索',{query:s('クエリ')},['query']),
_T('briefing_setting','ブリーフィング設定',{action:e('start/stop',['start','stop']),hour:n('送信時刻')},['action']),
_T('weather','天気取得',{city:s('都市名')},['city']),
_T('drive_folder_create','フォルダ作成',{name:s('フォルダ名'),parent:s('親フォルダ名')},['name']),
_T('drive_file_list','ファイル一覧',{folder:s('フォルダ名'),keyword:s('キーワード')}),
_T('drive_file_delete','ファイル削除',{keyword:s('削除キーワード'),folder:s('フォルダ名')},['keyword']),
_T('drive_file_move','ファイル移動',{keyword:s('ファイルキーワード'),to_folder:s('移動先フォルダ')},['keyword','to_folder']),
_T('drive_file_rename','ファイル名変更',{keyword:s('ファイルキーワード'),new_name:s('新しい名前')},['keyword','new_name']),
_T('drive_file_search','ファイル検索',{keyword:s('キーワード')},['keyword']),
_T('route_search','経路検索',{from:s('出発地'),to:s('目的地'),mode:e('移動手段',['transit','driving','walking','bicycling']),depart:s('出発時刻')},['from','to']),
_T('docs_read','ドキュメント読取',{keyword:s('ドキュメント名キーワード')},['keyword']),
_T('docs_delete','ドキュメント削除',{keyword:s('削除キーワード')},['keyword']),
_T('sheets_write','スプシ書込',{keyword:s('スプシ名キーワード'),sheet_name:s('シート名'),mode:e('書込モード',['append','update','clear_and_write']),rows:{type:'array',items:{type:'array'},description:'行データ'},headers:{type:'array',items:{type:'string'},description:'ヘッダー'},updates:{type:'array',items:{type:'object'},description:'[{row,col,value}]'}},['keyword','mode']),
_T('sheets_read','スプシ読取',{keyword:s('スプシ名キーワード'),sheet_name:s('シート名'),max_rows:n('最大行数')},['keyword']),
_T('sheets_delete','スプシ削除',{keyword:s('削除キーワード')},['keyword']),
_T('url_summarize','URL要約',{url:s('URL')},['url']),
_T('birthday_reminder','誕生日リマインダー',{name:s('名前'),birthday:s('誕生日MM-DD'),hour:n('通知時刻')},['name','birthday']),
_T('report_generate','レポート生成',{type:e('種類',['weekly','monthly'])},['type']),
_T('hotel_search','ホテル検索',{area:s('エリア'),checkin:s('チェックインdate'),checkout:s('チェックアウトdate'),guests:n('人数'),keyword:s('条件キーワード')},['area']),
_T('company','部署メモ管理。メモ一覧や全部署の状況確認',{action:e('操作',['view','status']),dept:s('部署名')},['action'])
];
}
function selectTools(message) {
var all = getToolDefinitions();
var msg = message.toLowerCase();
var groups = _G();
var keywords = {
gmail: ['メール','gmail','mail','受信','送信','添付'],
calendar: ['予定','カレンダー','スケジュール','会議','mtg','打ち合わせ','今日','明日','今週','来週','来月','空き'],
docs: ['ドキュメント','ドキュ','文書','議事録','報告書','手順書'],
sheets: ['スプレッドシート','スプシ','表','シート'],
drive: ['ドライブ','フォルダ','ファイル','移動','削除','検索','名前'],
memo: ['メモ','覚え','記録'],
task: ['タスク','やること','todo','完了','締め切り'],
reminder: ['リマインダー','通知','リマインド','誕生日','毎日','毎週','毎月','毎年','第'],
briefing: ['ブリーフィング','朝のスケジュール','朝の予定'],
search: ['調べ','検索','最新','ニュース','情報'],
weather: ['天気','気温','雨','晴れ','曇り','予報'],
route: ['経路','乗換','バス','電車','ホテル','宿','行き方'],
url: ['http','https','url','要約','まとめ'],
photo: ['写真','画像','フォト'],
report: ['レポート','週次','月次'],
tone: ['口調','トーン','しゃべり','話し方','可愛','かわい','カワイ','タメ口','ため口','敬語','フレンドリー','ビジネス口調','キャラ','喋り方'],
company: ['部署','カンパニー','事業','秘書室','line事業','投稿案','ネタ','介護ブログ','学校コンサル','hp運用']
};
var needed = {};
for (var group in keywords) {
var kws = keywords[group];
for (var ki = 0; ki < kws.length; ki++) {
if (msg.indexOf(kws[ki]) !== -1) {
var toolNames = groups[group];
for (var ti = 0; ti < toolNames.length; ti++) {
needed[toolNames[ti]] = true;
}
break;
}
}
}
var matched = Object.keys(needed);
if (matched.length > 0) {
return all.filter(function(t){ return needed[t.name]; });
}
if (msg.indexOf('？') !== -1 || msg.indexOf('?') !== -1 || msg.indexOf('教えて') !== -1 || msg.indexOf('って何') !== -1 || msg.indexOf('とは') !== -1 || msg.indexOf('知りたい') !== -1) {
return all.filter(function(t){ return t.name === 'web_search'; });
}
return [];
}
function getRegisteredToolNames() {
var groups = _G();
var result = {};
for (var g in groups) {
var list = groups[g];
for (var i = 0; i < list.length; i++) { result[list[i]] = true; }
}
return result;
}
function executeTool(name, input, uid) {
try {
if (name === 'set_tone') { return toolSetTone(input, uid); }
if (name === 'company') { return toolCompany(input, uid); }
if (name === 'gmail_check') { return toolGmailCheck(input); }
if (name === 'gmail_send') { return toolGmailSend(input); }
if (name === 'calendar_view') { return toolCalView(input); }
if (name === 'calendar_add') { return toolCalAdd(input); }
if (name === 'calendar_delete') { return toolCalDelete(input); }
if (name === 'calendar_edit') { return toolCalEdit(input); }
if (name === 'sheets_create') { return toolSheetsCreate(input); }
if (name === 'docs_create') { return toolDocsCreate(input); }
if (name === 'memo_add') { return toolMemoAdd(input); }
if (name === 'memo_view') { return toolMemoView(input); }
if (name === 'memo_delete') { return toolMemoDelete(input); }
if (name === 'reminder_add') { return toolReminderAdd(input); }
if (name === 'reminder_view') { return toolReminderView(); }
if (name === 'reminder_delete') { return toolReminderDelete(input); }
if (name === 'task_add') { return toolTaskAdd(input); }
if (name === 'task_view') { return toolTaskView(input); }
if (name === 'task_done') { return toolTaskDone(input); }
if (name === 'task_delete') { return toolTaskDelete(input); }
if (name === 'web_search') { return toolWebSearch(input); }
if (name === 'briefing_setting') { return toolBriefingSetting(input); }
if (name === 'weather') { return toolWeather(input); }
if (name === 'drive_folder_create') { return toolDriveFolderCreate(input); }
if (name === 'drive_file_list') { return toolDriveFileList(input); }
if (name === 'drive_file_delete') { return toolDriveFileDelete(input); }
if (name === 'drive_file_move') { return toolDriveFileMove(input); }
if (name === 'drive_file_rename') { return toolDriveFileRename(input); }
if (name === 'drive_file_search') { return toolDriveFileSearch(input); }
if (name === 'route_search') { return toolRouteSearch(input); }
if (name === 'hotel_search') { return toolHotelSearch(input); }
if (name === 'docs_read') { return toolDocsRead(input); }
if (name === 'docs_delete') { return toolDocsDelete(input); }
if (name === 'sheets_read') { return toolSheetsRead(input); }
if (name === 'sheets_write') { return toolSheetsWrite(input); }
if (name === 'sheets_delete') { return toolSheetsDelete(input); }
if (name === 'url_summarize') { return toolUrlSummarize(input); }
if (name === 'birthday_reminder') { return toolBirthdayReminder(input); }
if (name === 'report_generate') { return toolReportGenerate(input); }
return 'ツール「' + name + '」が見つかりません';
} catch (err) {


return 'ツールの実行中にエラーが発生しました。もう一度お試しください。';
}
}
function toolGmailCheck(input) {
var count = input.count || 3;
var threads = GmailApp.search('is:unread in:inbox', 0, count);
if (threads.length === 0) { return '未読メールはありません'; }
var lines = ['未読メール ' + threads.length + '件:'];
for (var i = 0; i < threads.length; i++) {
var msg = threads[i].getMessages()[0];
var from = msg.getFrom().replace(/<.*?>/g, '').trim();
var subject = msg.getSubject() || '件名なし';
var dateStr = fmtDate(msg.getDate(), 'M/d HH:mm');
var line = (i+1) + '. [' + dateStr + '] ' + from + ' / ' + subject;
var attachments = msg.getAttachments();
if (attachments && attachments.length > 0) {
var urls = [];
for (var ai = 0; ai < attachments.length; ai++) {
try {
var att = attachments[ai];
var file = DriveApp.createFile(att);
file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
urls.push('📎 ' + att.getName() + ' → ' + file.getUrl());
} catch(e) {
urls.push('📎 ' + attachments[ai].getName() + '（保存失敗）');
}
}
line += '\n ' + urls.join('\n ');
}
lines.push(line);
}
return lines.join('\n');
}
function toolGmailSend(input) {
if (!input.to_email) { return 'メールアドレスが指定されていません'; }
GmailApp.sendEmail(input.to_email, input.subject, input.body);
return 'メール送信完了: ' + (input.to_name || input.to_email) + ' 宛 / 件名: ' + input.subject;
}
function toolCalView(input) {
var today = getJSTDate(0);
var start, end, label;
if (input.range === 'today') {
start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
label = '今日';
} else if (input.range === 'tomorrow') {
start = new Date(today.getFullYear(), today.getMonth(), today.getDate()+1, 0, 0, 0);
end = new Date(today.getFullYear(), today.getMonth(), today.getDate()+1, 23, 59, 59);
label = '明日';
} else if (input.range === 'custom' && input.date_from && input.date_to) {
start = new Date(input.date_from + 'T00:00:00+09:00');
end = new Date(input.date_to + 'T23:59:59+09:00');
label = fmtDate(start, 'M/d') + '〜' + fmtDate(end, 'M/d');
} else {
start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0);
end = new Date(today.getFullYear(), today.getMonth(), today.getDate()+7, 23, 59, 59);
label = '今週';
}
var events = [];
var allCals = CalendarApp.getAllCalendars();
for (var ci = 0; ci < allCals.length; ci++) {
var ces = allCals[ci].getEvents(start, end);
for (var ei = 0; ei < ces.length; ei++) { events.push(ces[ei]); }
}
events.sort(function(a, b) { return a.getStartTime() - b.getStartTime(); });
if (input.find_free) { return findFreeDays(start, end, events, label); }
if (events.length === 0) { return label + 'の予定はありません'; }
var lines = [label + 'の予定 ' + events.length + '件:'];
var lastDate = '';
for (var i = 0; i < events.length; i++) {
var ev = events[i];
var dateStr = fmtDate(ev.getStartTime(), 'M/d(E)');
var timeStr = fmtDate(ev.getStartTime(), 'HH:mm');
var loc = ev.getLocation() ? ' @' + ev.getLocation() : '';
if (dateStr !== lastDate) { lines.push(''); lines.push('【' + dateStr + '】'); lastDate = dateStr; }
lines.push(' ' + timeStr + ' ' + ev.getTitle() + loc);
}
return lines.join('\n');
}
function findFreeDays(start, end, events, label) {
var busyDates = {};
for (var i = 0; i < events.length; i++) {
var evStart = events[i].getStartTime();
var h = evStart.getHours();
if (h >= 9 && h < 18) { busyDates[fmtDate(evStart, 'yyyy-MM-dd')] = true; }
}
var freeDays = [];
var cur = new Date(start);
while (cur <= end) {
var key = fmtDate(cur, 'yyyy-MM-dd');
var dow = cur.getDay();
if (dow !== 0 && dow !== 6 && !busyDates[key]) { freeDays.push(fmtDate(cur, 'M/d(E)')); }
cur.setDate(cur.getDate() + 1);
}
if (freeDays.length === 0) { return label + 'の平日に昼間（9〜18時）が空いている日はありません。'; }
return label + 'の昼間（9〜18時）が空いている平日 ' + freeDays.length + '日:\n' + freeDays.join('\n');
}
function toolCalAdd(input) {
function toJST(s) { return (s.indexOf('+') === -1 && s.indexOf('Z') === -1) ? s + '+09:00' : s; }
var s = new Date(toJST(input.start));
var e = input.end ? new Date(toJST(input.end)) : new Date(s.getTime() + 3600000);
var cal = CalendarApp.getDefaultCalendar();
if (input.all_day) {
cal.createAllDayEvent(input.title, s);
} else {
cal.createEvent(input.title, s, e, { location: input.location || '', description: input.description || '' });
}
return '追加完了: ' + input.title + ' / ' + fmtDate(s, 'M月d日(E) HH:mm') + (input.end ? '〜' + fmtDate(e, 'HH:mm') : '');
}
function toolCalDelete(input) {
var start = input.date ? new Date(input.date + 'T00:00:00+09:00') : getJSTDate(0);
var days = input.range_days || 14;
var end = new Date(start.getTime() + days * 86400000);
var matched = [];
var calendars = CalendarApp.getAllCalendars();
for (var ci = 0; ci < calendars.length; ci++) {
var events = calendars[ci].getEvents(start, end);
for (var ei = 0; ei < events.length; ei++) {
if (events[ei].getTitle().indexOf(input.keyword) !== -1) { matched.push(events[ei]); }
}
}
if (matched.length === 0) {
return '「' + input.keyword + '」に該当する予定が見つかりませんでした（検索範囲: ' + days + '日間）\n※予定のタイトルの一部をキーワードにして再度お試しください';
}
if (matched.length > 1 && input.time_hint) {
var hour = parseInt(input.time_hint, 10);
var filtered = matched.filter(function(ev) { return parseInt(Utilities.formatDate(ev.getStartTime(), 'Asia/Tokyo', 'H'), 10) === hour; });
if (filtered.length > 0) { matched = filtered; }
}
if (matched.length > 1) {
var list = matched.map(function(ev, i) {
return (i+1) + '. ' + fmtDate(ev.getStartTime(), 'M/d(E) HH:mm') + ' ' + ev.getTitle();
}).join('\n');
return '複数見つかりました。どれを削除しますか？\n' + list + '\n\n番号か時刻で指定してください。例:「2番目を削除」「18時のMTGを削除」';
}
var title = matched[0].getTitle();
var dt = fmtDate(matched[0].getStartTime(), 'M月d日(E) HH:mm');
try {
matched[0].deleteEvent();
return '✅ 削除完了: ' + title + ' (' + dt + ')';
} catch(e) {
return '❌ 削除できませんでした: ' + title + ' (' + dt + ')\n編集権限がない共有カレンダーの予定の可能性があります。Googleカレンダーアプリで直接削除してください。';
}
}
function toolCalEdit(input) {
var start = input.search_date ? new Date(input.search_date + 'T00:00:00+09:00') : getJSTDate(0);
var end = new Date(start.getTime() + 14 * 86400000);
var matched = [];
var cals = CalendarApp.getAllCalendars();
for (var ci = 0; ci < cals.length; ci++) {
var evs = cals[ci].getEvents(start, end);
for (var ei = 0; ei < evs.length; ei++) {
if (evs[ei].getTitle().indexOf(input.keyword) !== -1) { matched.push(evs[ei]); }
}
}
if (matched.length === 0) { return '「' + input.keyword + '」に該当する予定が見つかりませんでした'; }
if (matched.length > 1) {
var list = matched.map(function(ev, i) {
return (i+1) + '. ' + fmtDate(ev.getStartTime(), 'M/d(E) HH:mm') + ' ' + ev.getTitle();
}).join('\n');
return '複数見つかりました。どれを変更しますか？\n' + list;
}
var ev = matched[0];
var origStart = ev.getStartTime();
var origEnd = ev.getEndTime();
var duration = origEnd.getTime() - origStart.getTime();
if (input.new_title) { ev.setTitle(input.new_title); }
if (input.new_location) { ev.setLocation(input.new_location); }
if (input.new_start) {
var ns = new Date(input.new_start);
if (isNaN(ns.getTime())) {
return '日時の形式が正しくありません: ' + input.new_start;
}
if (ns.getFullYear() < 2000) {
ns = new Date(origStart);
var timeParts = input.new_start.match(/(\d{1,2}):(\d{2})/);
if (timeParts) {
ns.setHours(parseInt(timeParts[1]), parseInt(timeParts[2]), 0, 0);
}
}
var ne = input.new_end ? new Date(input.new_end) : new Date(ns.getTime() + duration);
try {
ev.setTime(ns, ne);
} catch(setErr) {
return '変更に失敗しました。このイベントは編集権限がない可能性があります: ' + ev.getTitle();
}
var updatedStart = ev.getStartTime();
return '変更完了: ' + ev.getTitle() + ' / ' + fmtDate(updatedStart, 'M月d日(E) HH:mm') + '〜' + fmtDate(ev.getEndTime(), 'HH:mm');
}
return '変更完了: ' + ev.getTitle() + ' / ' + fmtDate(ev.getStartTime(), 'M月d日(E) HH:mm') + '〜' + fmtDate(ev.getEndTime(), 'HH:mm');
}
function toolSheetsCreate(input) {
var ss = SpreadsheetApp.create(input.title);
var sheet = ss.getActiveSheet();
sheet.setName('シート1');
if (input.headers && input.headers.length > 0) {
var range = sheet.getRange(1, 1, 1, input.headers.length);
range.setValues([input.headers]);
range.setBackground('#1D9E75');
range.setFontColor('#FFFFFF');
range.setFontWeight('bold');
sheet.setFrozenRows(1);
sheet.autoResizeColumns(1, input.headers.length);
}
return '✅ ' + input.title + '\n' + ss.getUrl();
}
function toolDocsCreate(input) {
var title = input.title || 'ドキュメント';
var content = input.content || '';
var doc = DocumentApp.create(title);
var body = doc.getBody();
if (content) {
var lines = content.split('\n');
for (var i = 0; i < lines.length; i++) {
var line = lines[i];
if (line.trim() === '') { body.appendParagraph(''); continue; }
if (line.indexOf('## ') === 0) {
body.appendParagraph(line.slice(3)).setHeading(DocumentApp.ParagraphHeading.HEADING2);
} else if (line.indexOf('# ') === 0) {
body.appendParagraph(line.slice(2)).setHeading(DocumentApp.ParagraphHeading.HEADING1);
} else if (line.indexOf('- ') === 0 || line.indexOf('・') === 0) {
body.appendListItem(line.replace(/^[-・]\s*/, ''));
} else {
body.appendParagraph(line);
}
}
}
doc.saveAndClose();
return '作成完了: ' + title + '\nURL: https://docs.google.com/document/d/' + doc.getId() + '/edit';
}
function toolMemoAdd(input) {
var sheet = getDataSheet('メモ');
if (sheet.getLastRow() === 0) { sheet.appendRow(['ID', '日時', 'タグ', '内容']); }
var id = new Date().getTime().toString();
sheet.appendRow([id, getJSTNow(), input.tag || '', input.content]);
return '保存完了: ' + input.content + (input.tag ? ' [' + input.tag + ']' : '');
}
function toolMemoView(input) {
var sheet = getDataSheet('メモ');
if (sheet.getLastRow() <= 1) { return 'メモはまだありません'; }
var data = sheet.getDataRange().getValues();
var limit = input.limit || 10;
var lines = ['メモ一覧 ' + (data.length-1) + '件:'];
for (var i = Math.max(1, data.length - limit); i < data.length; i++) {
lines.push((i) + '. ' + data[i][3] + (data[i][2] ? ' [' + data[i][2] + ']' : '') + ' (' + data[i][1] + ')');
}
return lines.join('\n');
}
function toolMemoDelete(input) {
var sheet = getDataSheet('メモ');
if (sheet.getLastRow() <= 1) { return '削除するメモがありません'; }
var data = sheet.getDataRange().getValues();
for (var i = data.length - 1; i >= 1; i--) {
if (data[i][3].indexOf(input.keyword) !== -1 || String(i) === input.keyword) {
var content = data[i][3];
sheet.deleteRow(i + 1);
return '削除完了: ' + content;
}
}
return '「' + input.keyword + '」に該当するメモが見つかりませんでした';
}
function toolReminderAdd(input) {
var sheet = getDataSheet('リマインダー');
if (sheet.getLastRow() === 0) {
sheet.appendRow(['ID', '設定日時', 'リマインド日時', '内容', '送信済み', '繰り返し']);
}
if (sheet.getLastRow() > 0 && sheet.getLastColumn() < 6) {
sheet.getRange(1, 6).setValue('繰り返し');
}
var id = new Date().getTime().toString();
var repeat = input.repeat || 'none';
if (repeat === 'monthly_weekday') {
var nth = input.nth_week || 1;
var weekday = input.weekday !== undefined ? input.weekday : 6;
repeat = 'monthly_weekday_' + nth + '_' + weekday;
}
var dtStr = input.datetime;
if (/^\d{4}-\d{2}-\d{2}$/.test(dtStr)) { dtStr = dtStr + 'T00:00:00'; }
if (dtStr.indexOf('+') === -1 && dtStr.indexOf('Z') === -1) { dtStr = dtStr + '+09:00'; }
var epochMs = new Date(dtStr).getTime();
if (isNaN(epochMs)) { epochMs = new Date(input.datetime).getTime(); }
if (isNaN(epochMs)) { return '❌ 日時の形式が正しくありません: ' + input.datetime + '\n例: 2025-12-25T09:00 または 2025-12-25'; }
if (isNaN(epochMs)) { epochMs = new Date(input.datetime).getTime(); }
sheet.appendRow([id, getJSTNow(), epochMs, input.content, 'FALSE', repeat]);
var dtStr = Utilities.formatDate(new Date(epochMs), 'Asia/Tokyo', 'M月d日(E) HH:mm');
var repeatLabel = { 'none':'1回のみ', 'daily':'毎日', 'weekly':'毎週', 'monthly':'毎月' };
var repeatDisp = repeatLabel[repeat] || getMonthlyWeekdayLabel(repeat) || '1回のみ';
return '設定完了: ' + input.content + ' / ' + dtStr + 'に通知 / ' + repeatDisp;
}
function getMonthlyWeekdayLabel(repeat) {
if (!repeat || repeat.indexOf('monthly_weekday_') !== 0) { return ''; }
var parts = repeat.split('_');
var nth = parseInt(parts[2]);
var weekday = parseInt(parts[3]);
var nthStr = ['', '第1', '第2', '第3', '第4', '第5'][nth] || '第' + nth;
var dayStr = ['日', '月', '火', '水', '木', '金', '土'][weekday];
return '毎月' + nthStr + dayStr + '曜日';
}
function getNextMonthlyWeekday(baseDate, nth, weekday) {
var next = new Date(baseDate);
next.setMonth(next.getMonth() + 1);
next.setDate(1);
var firstDow = next.getDay();
var diff = (weekday - firstDow + 7) % 7;
var targetDate = 1 + diff + (nth - 1) * 7;
next.setDate(targetDate);
var timePart = Utilities.formatDate(baseDate, 'Asia/Tokyo', 'HH:mm:ss');
var datePart = Utilities.formatDate(next, 'Asia/Tokyo', 'yyyy-MM-dd');
next = new Date(datePart + 'T' + timePart + '+09:00');
return next;
}
function toolReminderView() {
var sheet = getDataSheet('リマインダー');
if (sheet.getLastRow() <= 1) { return 'リマインダーは設定されていません'; }
var data = sheet.getDataRange().getValues();
var lines = [];
for (var i = 1; i < data.length; i++) {
if (data[i][4] === 'TRUE' || data[i][4] === true) { continue; }
var rawDtRV = data[i][2];
var dtObjRV;
if (typeof rawDtRV === 'number' && rawDtRV > 1000000000000) {
dtObjRV = new Date(rawDtRV);
} else if (rawDtRV instanceof Date) {
dtObjRV = rawDtRV;
} else {
var sRV = String(rawDtRV || '').trim();
if (/^\d{13}$/.test(sRV)) { dtObjRV = new Date(parseInt(sRV)); }
else { if (sRV.indexOf('+') === -1 && sRV.indexOf('Z') === -1) { sRV += '+09:00'; } dtObjRV = new Date(sRV); }
}
var dtStr = dtObjRV ? Utilities.formatDate(dtObjRV, 'Asia/Tokyo', 'M/d(E) HH:mm') : '不明';
var repeatDisp = { 'daily':'毎日', 'weekly':'毎週', 'monthly':'毎月' };
var repVal = data[i][5] ? String(data[i][5]) : '';
var rep = repeatDisp[repVal] || getMonthlyWeekdayLabel(repVal) || '';
lines.push((lines.length+1) + '. ' + data[i][3] + ' / ' + dtStr + (rep ? ' [' + rep + ']' : ''));
}
if (lines.length === 0) { return '未送信のリマインダーはありません'; }
return 'リマインダー ' + lines.length + '件:\n' + lines.join('\n');
}
function toolReminderDelete(input) {
var sheet = getDataSheet('リマインダー');
if (sheet.getLastRow() <= 1) { return '削除するリマインダーがありません'; }
var data = sheet.getDataRange().getValues();
for (var i = data.length - 1; i >= 1; i--) {
if (data[i][3].indexOf(input.keyword) !== -1) {
var content = data[i][3];
sheet.deleteRow(i + 1);
return '削除完了: ' + content;
}
}
return '「' + input.keyword + '」に該当するリマインダーが見つかりませんでした';
}
function checkReminders() {
var config = getConfig();
if (!config.LINE_TOKEN || !config.USER_ID) { return; }
var demoMode = PropertiesService.getScriptProperties().getProperty('DEMO_MODE');
if (demoMode === 'TRUE') {
var countKey = 'demo_count_' + config.USER_ID;
var count = parseInt(PropertiesService.getScriptProperties().getProperty(countKey) || '0');
if (count >= 10) { return; }
}
var sheet = getDataSheet('リマインダー');
var lastRow = sheet.getLastRow();
if (lastRow <= 1) { return; }
var data = sheet.getRange(1, 1, lastRow, 6).getValues();
var nowEpoch = new Date().getTime();
for (var i = 1; i < data.length; i++) {
if (data[i][4] === 'TRUE' || data[i][4] === true) { continue; }
var remindAt;
try {
var rawDt = data[i][2];
if (typeof rawDt === 'number' && rawDt > 1e12) {
remindAt = new Date(rawDt);
} else if (rawDt instanceof Date) {
remindAt = rawDt;
} else {
var dts = String(rawDt).trim();
if (!dts) { continue; }
if (/^\d{13}$/.test(dts)) { remindAt = new Date(parseInt(dts)); }
else { if (dts.indexOf('+') === -1 && dts.indexOf('Z') === -1) { dts += '+09:00'; } remindAt = new Date(dts); }
}
} catch(e) { continue; }
if (isNaN(remindAt.getTime()) || remindAt.getTime() > nowEpoch) { continue; }
var currentData = sheet.getDataRange().getValues();
var stillExists = false;
for (var ci = 1; ci < currentData.length; ci++) {
if (String(currentData[ci][0]) === String(data[i][0]) &&
(currentData[ci][4] !== 'TRUE' && currentData[ci][4] !== true)) {
stillExists = true;
break;
}
}
if (!stillExists) {


continue;
}
var remindTimeStr = Utilities.formatDate(remindAt, 'Asia/Tokyo', 'M月d日(E) HH:mm');
pushToLine(config.USER_ID, '⏰ リマインダー\n' + remindTimeStr + '\n\n' + data[i][3]);
var repeat = data[i][5] || 'none';
if (repeat === 'none') {
sheet.getRange(i+1, 5).setValue('TRUE');
} else {
var nextDate = new Date(remindAt);
if (repeat === 'daily') { nextDate.setDate(nextDate.getDate() + 1); }
if (repeat === 'weekly') { nextDate.setDate(nextDate.getDate() + 7); }
if (repeat === 'monthly') { nextDate.setMonth(nextDate.getMonth() + 1); }
if (repeat === 'yearly') {
var _curJstStr = Utilities.formatDate(remindAt, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss'+09:00'");
var _nextYear = (parseInt(_curJstStr.slice(0, 4), 10) + 1).toString();
nextDate = new Date(_nextYear + _curJstStr.slice(4));
}
if (repeat.indexOf('monthly_weekday_') === 0) {
var parts = repeat.split('_');
var nth = parseInt(parts[2]);
var weekday = parseInt(parts[3]);
nextDate = getNextMonthlyWeekday(remindAt, nth, weekday);
}
var nextEpoch = nextDate.getTime();
sheet.getRange(i+1, 3).setValue(nextEpoch);
sheet.getRange(i+1, 5).setValue('FALSE');


}
}
}
function toolTaskAdd(input) {
var sheet = getDataSheet('タスク');
if (sheet.getLastRow() === 0) { sheet.appendRow(['ID', '追加日時', '期限', '優先度', 'タスク', '状態']); }
var id = new Date().getTime().toString();
sheet.appendRow([id, getJSTNow(), input.due || '', input.priority || '中', input.task, '未完了']);
return '追加完了: ' + input.task + ' [優先度:' + (input.priority || '中') + ']' + (input.due ? ' 期限:' + input.due : '');
}
function toolTaskView(input) {
var sheet = getDataSheet('タスク');
if (sheet.getLastRow() <= 1) { return 'タスクはまだありません'; }
var data = sheet.getDataRange().getValues();
var pending = [], done = [];
for (var i = 1; i < data.length; i++) {
var row = data[i];
if (!row[4]) { continue; }
var line = row[4] + ' [' + (row[3] || '中') + ']' + (row[2] ? ' 期限:' + row[2] : '');
if (row[5] === '完了') { done.push(line); } else { pending.push(line); }
}
var result = '';
if (pending.length > 0) { result += '未完了 ' + pending.length + '件:\n' + pending.map(function(t,i){return (i+1)+'. '+t;}).join('\n'); }
if (input.show_done && done.length > 0) { result += '\n\n完了済み ' + done.length + '件:\n' + done.map(function(t,i){return (i+1)+'. '+t;}).join('\n'); }
return result || 'タスクはありません';
}
function toolTaskDone(input) {
var sheet = getDataSheet('タスク');
if (sheet.getLastRow() <= 1) { return '完了するタスクがありません'; }
var data = sheet.getDataRange().getValues();
for (var i = 1; i < data.length; i++) {
if (String(data[i][4] || '').indexOf(input.keyword) !== -1 && data[i][5] !== '完了') {
sheet.getRange(i+1, 6).setValue('完了');
return '完了にしました: ' + data[i][4];
}
}
return '「' + input.keyword + '」に該当する未完了タスクが見つかりませんでした';
}
function toolTaskDelete(input) {
var sheet = getDataSheet('タスク');
if (sheet.getLastRow() <= 1) { return 'タスクがありません'; }
var data = sheet.getDataRange().getValues();
for (var i = data.length - 1; i >= 1; i--) {
var taskName = String(data[i][4] || '');
if (!taskName) { sheet.deleteRow(i+1); continue; }
if (taskName.indexOf(input.keyword) !== -1) {
sheet.deleteRow(i+1);
return '削除完了: ' + taskName;
}
}
return '「' + input.keyword + '」に該当するタスクが見つかりませんでした';
}
function findFolder(name) {
if (!name) { return DriveApp.getRootFolder(); }
var it = DriveApp.getFoldersByName(name);
return it.hasNext() ? it.next() : null;
}
function toolDriveFolderCreate(input) {
var parent = input.parent ? findFolder(input.parent) : DriveApp.getRootFolder();
if (!parent) { return '「' + input.parent + '」フォルダが見つかりませんでした'; }
var folder = parent.createFolder(input.name);
return '✅ フォルダを作成しました: ' + input.name + '\nURL: ' + folder.getUrl();
}
function toolDriveFileList(input) {
var folder = input.folder ? findFolder(input.folder) : DriveApp.getRootFolder();
if (!folder) { return '「' + input.folder + '」フォルダが見つかりませんでした'; }
var lines = ['📁 ' + (input.folder || 'マイドライブ') + ' の内容:'];
var folders = folder.getFolders();
var folderCount = 0;
while (folders.hasNext()) {
var f = folders.next();
if (input.keyword && f.getName().indexOf(input.keyword) === -1) { continue; }
lines.push('📁 ' + f.getName());
folderCount++;
}
var files = folder.getFiles();
var fileCount = 0;
while (files.hasNext()) {
var file = files.next();
if (input.keyword && file.getName().indexOf(input.keyword) === -1) { continue; }
lines.push('📄 ' + file.getName() + ' → ' + file.getUrl());
fileCount++;
if (fileCount > 20) { lines.push(' ...（以下省略）'); break; }
}
if (folderCount + fileCount === 0) { return (input.folder || 'マイドライブ') + 'にファイルはありません'; }
return lines.join('\n');
}
function toolDriveFileDelete(input) {
var results = DriveApp.searchFiles('title contains "' + input.keyword + '"');
var deleted = [];
while (results.hasNext()) {
var file = results.next();
if (input.folder) {
var parents = file.getParents();
var inFolder = false;
while (parents.hasNext()) {
if (parents.next().getName() === input.folder) { inFolder = true; break; }
}
if (!inFolder) { continue; }
}
file.setTrashed(true);
deleted.push(file.getName());
if (deleted.length >= 5) { break; }
}
var folderResults = DriveApp.searchFolders('title contains "' + input.keyword + '"');
while (folderResults.hasNext()) {
var f = folderResults.next();
f.setTrashed(true);
deleted.push(f.getName() + '（フォルダ）');
if (deleted.length >= 5) { break; }
}
if (deleted.length === 0) { return '「' + input.keyword + '」に該当するファイルが見つかりませんでした'; }
return '🗑 ゴミ箱に移動しました:\n' + deleted.join('\n');
}
function toolDriveFileMove(input) {
var dest = findFolder(input.to_folder);
if (!dest) { dest = DriveApp.getRootFolder().createFolder(input.to_folder); }
var results = DriveApp.searchFiles('title contains "' + input.keyword + '"');
var moved = [];
while (results.hasNext()) {
var file = results.next();
file.moveTo(dest);
moved.push(file.getName());
if (moved.length >= 5) { break; }
}
if (moved.length === 0) { return '「' + input.keyword + '」に該当するファイルが見つかりませんでした'; }
return '✅ 移動しました → ' + input.to_folder + ':\n' + moved.join('\n');
}
function toolDriveFileRename(input) {
var results = DriveApp.searchFiles('title contains "' + input.keyword + '"');
if (results.hasNext()) {
var file = results.next();
var oldName = file.getName();
file.setName(input.new_name);
return '✅ 名前を変更しました\n' + oldName + ' → ' + input.new_name;
}
var folderResults = DriveApp.searchFolders('title contains "' + input.keyword + '"');
if (folderResults.hasNext()) {
var folder = folderResults.next();
var oldFolderName = folder.getName();
folder.setName(input.new_name);
return '✅ フォルダ名を変更しました\n' + oldFolderName + ' → ' + input.new_name;
}
return '「' + input.keyword + '」に該当するファイル・フォルダが見つかりませんでした';
}
function toolDriveFileSearch(input) {
var results = DriveApp.searchFiles('title contains "' + input.keyword + '"');
var lines = ['🔍 「' + input.keyword + '」の検索結果:'];
var count = 0;
while (results.hasNext()) {
var file = results.next();
lines.push((count+1) + '. ' + file.getName() + '\n → ' + file.getUrl());
count++;
if (count >= 10) { lines.push('...（10件以上のため省略）'); break; }
}
if (count === 0) { return '「' + input.keyword + '」に該当するファイルが見つかりませんでした'; }
return lines.join('\n');
}
function toolRouteSearch(input) {
var from = input.from;
var to = input.to;
var mode = input.mode || 'transit';
var depart = input.depart || '';
var encoded_from = encodeURIComponent(from);
var encoded_to = encodeURIComponent(to);
var mapUrl = 'https://www.google.com/maps/dir/' + encoded_from + '/' + encoded_to + '/?travelmode=' + mode;
var modeLabel = { transit:'電車・バス', driving:'車', walking:'徒歩', bicycling:'自転車' };
var modeText = modeLabel[mode] || '電車・バス';
var result = '🗺 経路情報\n';
result += '出発: ' + from + '\n';
result += '到着: ' + to + '\n';
result += '移動手段: ' + modeText + '\n';
if (depart) { result += '出発時刻: ' + depart + '\n'; }
result += '\n📍 Googleマップで確認:\n' + mapUrl;
result += '\n\n※ リンクをタップすると時刻表・乗換情報が確認できます';
return result;
}
function toolHotelSearch(input) {
var area = input.area;
var checkin = input.checkin || '';
var checkout = input.checkout || '';
var guests = input.guests || 1;
var keyword = input.keyword || '';
var encoded_area = encodeURIComponent(area);
var encoded_keyword = keyword ? encodeURIComponent(keyword) : '';
var rakutenUrl = 'https://travel.rakuten.co.jp/search/result/?' +
'f_teikei=&f_area=' + encoded_area +
(checkin ? '&f_sdate=' + checkin : '') +
(checkout ? '&f_edate=' + checkout : '') +
'&f_adult_num=' + guests +
(keyword ? '&f_keyword=' + encoded_keyword : '');
var jalanUrl = 'https://www.jalan.net/search/contentsSearch/?' +
'keyword=' + encoded_area +
(checkin ? '&checkinDate=' + checkin.replace(/-/g,'') : '') +
(checkout ? '&checkoutDate=' + checkout.replace(/-/g,'') : '') +
'&adultNum=' + guests;
var bookingUrl = 'https://www.booking.com/search.ja.html?ss=' + encoded_area +
(checkin ? '&checkin=' + checkin : '') +
(checkout ? '&checkout=' + checkout : '') +
'&group_adults=' + guests;
var result = '🏨 ホテル検索結果\n';
result += '📍 エリア: ' + area + '\n';
if (checkin) { result += '📅 チェックイン: ' + checkin + '\n'; }
if (checkout) { result += '📅 チェックアウト: ' + checkout + '\n'; }
result += '👥 人数: ' + guests + '名\n';
if (keyword) { result += '🔑 キーワード: ' + keyword + '\n'; }
result += '\n各予約サイトで確認できます:\n';
result += '\n🔴 楽天トラベル\n' + rakutenUrl;
result += '\n\n🔵 じゃらん\n' + jalanUrl;
result += '\n\n🌐 Booking.com\n' + bookingUrl;
result += '\n\n※ リンクをタップして空室・料金を確認してください';
return result;
}
function toolDocsRead(input) {
var results = DriveApp.searchFiles('title contains "' + input.keyword + '" and mimeType = "application/vnd.google-apps.document" and trashed = false');
if (!results.hasNext()) { return '「' + input.keyword + '」というドキュメントが見つかりませんでした'; }
var file = results.next();
var doc = DocumentApp.openById(file.getId());
var text = doc.getBody().getText();
if (text.length > 800) { text = text.slice(0, 800) + '\n...（以下省略）'; }
return '📄 ' + file.getName() + '\n\n' + text + '\n\nURL: ' + file.getUrl();
}
function toolDocsDelete(input) {
var results = DriveApp.searchFiles('title contains "' + input.keyword + '" and mimeType = "application/vnd.google-apps.document" and trashed = false');
if (!results.hasNext()) { return '「' + input.keyword + '」というドキュメントが見つかりませんでした'; }
var file = results.next();
var name = file.getName();
file.setTrashed(true);
return '🗑 ドキュメントをゴミ箱に移動しました: ' + name;
}
function toolSheetsRead(input) {
var results = DriveApp.searchFiles('title contains "' + input.keyword + '" and mimeType = "application/vnd.google-apps.spreadsheet" and trashed = false');
if (!results.hasNext()) { return '「' + input.keyword + '」というスプレッドシートが見つかりませんでした'; }
var file = results.next();
var ss = SpreadsheetApp.openById(file.getId());
var sheet = input.sheet_name ? ss.getSheetByName(input.sheet_name) : ss.getActiveSheet();
if (!sheet) { return 'シート「' + input.sheet_name + '」が見つかりませんでした'; }
var maxRows = input.max_rows || 20;
var data = sheet.getDataRange().getValues();
var lines = ['📊 ' + file.getName() + '（' + sheet.getName() + '）'];
var limit = Math.min(data.length, maxRows);
for (var i = 0; i < limit; i++) {
lines.push(data[i].filter(function(c){ return c !== ''; }).join(' | '));
}
if (data.length > maxRows) { lines.push('...（他' + (data.length - maxRows) + '行省略）'); }
lines.push('\nURL: ' + file.getUrl());
return lines.join('\n');
}
function toolSheetsWrite(input) {
var results = DriveApp.searchFiles(
'title contains "' + input.keyword + '" and mimeType = "application/vnd.google-apps.spreadsheet" and trashed = false'
);
if (!results.hasNext()) { return '「' + input.keyword + '」というスプレッドシートが見つかりませんでした'; }
var ss = SpreadsheetApp.openById(results.next().getId());
var sheet = input.sheet_name ? ss.getSheetByName(input.sheet_name) : ss.getActiveSheet();
if (!sheet) { return 'シート「' + input.sheet_name + '」が見つかりませんでした'; }
var mode = input.mode || 'append';
if (mode === 'append') {
var rows = input.rows || [];
for (var i = 0; i < rows.length; i++) { sheet.appendRow(rows[i]); }
return '✅ ' + rows.length + '行\n' + ss.getUrl();
} else if (mode === 'update') {
var updates = input.updates || [];
for (var j = 0; j < updates.length; j++) {
sheet.getRange(updates[j].row, updates[j].col).setValue(updates[j].value);
}
return '✅ ' + updates.length + 'セルを更新しました\nURL: ' + ss.getUrl();
} else if (mode === 'clear_and_write') {
var headers = input.headers || [];
var dataRows = input.rows || [];
sheet.clearContents();
if (headers.length > 0) {
var hr = sheet.getRange(1, 1, 1, headers.length);
hr.setValues([headers]);
hr.setBackground('#1D9E75');
hr.setFontColor('#FFFFFF');
hr.setFontWeight('bold');
}
for (var k = 0; k < dataRows.length; k++) { sheet.appendRow(dataRows[k]); }
return '✅ シートを更新しました（' + dataRows.length + '行）\nURL: ' + ss.getUrl();
}
return '❌ modeが不正です（append/update/clear_and_write）';
}
function toolSheetsDelete(input) {
var results = DriveApp.searchFiles('title contains "' + input.keyword + '" and mimeType = "application/vnd.google-apps.spreadsheet" and trashed = false');
if (!results.hasNext()) { return '「' + input.keyword + '」というスプレッドシートが見つかりませんでした'; }
var file = results.next();
var name = file.getName();
file.setTrashed(true);
return '🗑 スプレッドシートをゴミ箱に移動しました: ' + name;
}
function toolUrlSummarize(input) {
try {
var res = UrlFetchApp.fetch(input.url, { muteHttpExceptions: true, followRedirects: true });
var html = res.getContentText();
var text = html
.replace(/<script[\s\S]*?<\/script>/gi, '')
.replace(/<style[\s\S]*?<\/style>/gi, '')
.replace(/<[^>]+>/g, ' ')
.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
.replace(/\s+/g,' ').trim();
if (text.length > 1000) { text = text.slice(0, 1000); }
return '以下のWebページの内容を200字以内で日本語で要約してください。\nURL: ' + input.url + '\n\n' + text;
} catch(e) {
return 'URLの取得に失敗しました。URLを確認してください。';
}
}
function toolBirthdayReminder(input) {
if (!input.birthday || !input.name) { return '名前と誕生日（MM-DD形式）を指定してください。例: 03-25'; }
var sheet = getDataSheet('リマインダー');
if (sheet.getLastRow() === 0) {
sheet.appendRow(['ID','設定日時','リマインド日時','内容','送信済み','繰り返し']);
}
var hour = input.hour !== undefined ? input.hour : 8;
var bdStr = input.birthday.replace(/^\d{4}-/, '');
var parts = bdStr.split('-');
var month = parseInt(parts[0]);
var day = parseInt(parts[1]);
var year = new Date().getFullYear();
var nextBirthday = new Date(year, month - 1, day, hour, 0, 0);
if (nextBirthday < new Date()) {
nextBirthday = new Date(year + 1, month - 1, day, hour, 0, 0);
}
var datetimeStr = Utilities.formatDate(nextBirthday, 'Asia/Tokyo', "yyyy-MM-dd'T'HH:mm:ss") + '+09:00';
var content = input.name + 'さんの誕生日🎂';
var id = new Date().getTime().toString();
sheet.appendRow([id, getJSTNow(), datetimeStr, content, 'FALSE', 'yearly']);
return '🎂 誕生日リマインダーを設定しました！\n' + input.name + 'さん（' + input.birthday + '）\n毎年' + month + '月' + day + '日' + hour + '時に通知します';
}
function toolReportGenerate(input) {
var type = input.type || 'weekly';
var now = new Date();
var title, dateLabel;
if (type === 'weekly') {
var weekStart = new Date(now);
weekStart.setDate(now.getDate() - now.getDay());
title = fmtDate(weekStart, 'yyyy年M月d日') + '週 週次レポート';
dateLabel = fmtDate(weekStart, 'M/d') + '〜' + fmtDate(now, 'M/d');
} else {
title = fmtDate(now, 'yyyy年M月') + ' 月次レポート';
dateLabel = fmtDate(now, 'yyyy年M月');
}
var lines = ['# ' + title, '期間: ' + dateLabel, ''];
try {
var taskSheet = getDataSheet('タスク');
if (taskSheet.getLastRow() > 1) {
var taskData = taskSheet.getDataRange().getValues();
var done = [], pending = [];
for (var i = 1; i < taskData.length; i++) {
var row = taskData[i];
var line = '・' + row[4] + (row[2] ? '（期限:' + row[2] + '）' : '');
if (row[5] === '完了') { done.push(line); } else { pending.push(line); }
}
lines.push('## ✅ タスク完了（' + done.length + '件）');
done.forEach(function(t){ lines.push(t); });
lines.push('');
lines.push('## 📋 未完了タスク（' + pending.length + '件）');
pending.forEach(function(t){ lines.push(t); });
lines.push('');
}
} catch(e) {}
try {
var memoSheet = getDataSheet('メモ');
if (memoSheet.getLastRow() > 1) {
var memoData = memoSheet.getDataRange().getValues();
lines.push('## 📝 メモ（' + (memoData.length - 1) + '件）');
for (var mi = 1; mi < Math.min(memoData.length, 11); mi++) {
lines.push('・' + memoData[mi][3] + '（' + memoData[mi][1] + '）');
}
lines.push('');
}
} catch(e) {}
lines.push('## 📅 カレンダー');
lines.push('（カレンダーの予定はGoogleカレンダーでご確認ください）');
lines.push('');
lines.push('---');
lines.push('作成日時: ' + getJSTNow());
var doc = DocumentApp.create(title);
var body = doc.getBody();
lines.forEach(function(line) {
if (line.indexOf('# ') === 0) { body.appendParagraph(line.slice(2)).setHeading(DocumentApp.ParagraphHeading.HEADING1); }
else if (line.indexOf('## ') === 0) { body.appendParagraph(line.slice(3)).setHeading(DocumentApp.ParagraphHeading.HEADING2); }
else { body.appendParagraph(line); }
});
doc.saveAndClose();
return (type === 'weekly' ? '📊 週次レポート' : '📊 月次レポート') + 'を作成しました！\n' +
'期間: ' + dateLabel + '\n\nURL: https://docs.google.com/document/d/' + doc.getId() + '/edit';
}
function toolWebSearch(input) {
var query = input.query;
var results = [];
try {
var encoded = encodeURIComponent(query);
var rssUrl = 'https://news.google.com/rss/search?q=' + encoded + '&hl=ja&gl=JP&ceid=JP:ja';
var rssText = UrlFetchApp.fetch(rssUrl, { muteHttpExceptions: true }).getContentText();
var itemMatches = rssText.match(/<item>([\s\S]*?)<\/item>/g);
if (itemMatches && itemMatches.length > 0) {
for (var i = 0; i < Math.min(itemMatches.length, 5); i++) {
var item = itemMatches[i];
var title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
var pub = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
title = title.replace(/<!\[CDATA\[|\]\]>/g, '').trim()
.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
if (title) { results.push((pub ? '[' + pub.slice(0,16) + '] ' : '') + title); }
}
}
} catch(e) {  }
try {
var ddgUrl = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) + '&format=json&no_html=1&skip_disambig=1';
var ddgData = JSON.parse(UrlFetchApp.fetch(ddgUrl, { muteHttpExceptions: true }).getContentText());
if (ddgData.AbstractText) { results.unshift('[概要] ' + ddgData.AbstractText); }
} catch(e) {  }
if (results.length > 0) { return '検索結果 [' + query + ']:\n' + results.join('\n'); }
return '「' + query + '」の検索結果が見つかりませんでした。Claudeの知識で回答してください。';
}
function toolBriefingSetting(input) {
var props = PropertiesService.getScriptProperties();
if (input.action === 'stop') {
props.setProperty('BRIEFING_ENABLED', 'FALSE');
var triggers = ScriptApp.getProjectTriggers();
for (var i = 0; i < triggers.length; i++) {
if (triggers[i].getHandlerFunction() === 'morningBriefing') { ScriptApp.deleteTrigger(triggers[i]); }
}
return '朝のスケジュール確認を停止しました。\n再開したい場合は「朝のスケジュール確認を〇時に設定して」と送ってください。';
}
var hour = input.hour !== undefined ? input.hour : 7;
props.setProperty('BRIEFING_HOUR', String(hour));
props.setProperty('BRIEFING_ENABLED', 'TRUE');
setupBriefingTrigger();
return '☀️ 毎朝' + hour + '時に予定をお届けします！';
}
function morningBriefing() {
var config = getConfig();
if (!config.LINE_TOKEN || !config.USER_ID) { return; }
var briefingEnabled = PropertiesService.getScriptProperties().getProperty('BRIEFING_ENABLED');
if (briefingEnabled === 'FALSE') { return; }
var demoMode = PropertiesService.getScriptProperties().getProperty('DEMO_MODE');
if (demoMode === 'TRUE') {
var countKey = 'demo_count_' + config.USER_ID;
var countProp = PropertiesService.getScriptProperties().getProperty(countKey);
var count = countProp ? parseInt(countProp) : 0;
if (count >= 10) { return; }
}
var remoteConfig = getRemoteConfig();
var briefingOn = remoteConfig.briefing_enabled !== 'FALSE';
if (!briefingOn) { return; }
var now = new Date();
var hour = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'HH'), 10);
var greeting = hour < 12 ? 'おはようございます！☀️' : hour < 18 ? 'こんにちは！🌤' : 'こんばんは！🌙';
var lines = [greeting, fmtDate(now, 'M月d日（E）') + 'のブリーフィングです。', ''];
try {
var today = getJSTDate(0);
var dateStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
var start = new Date(dateStr + 'T00:00:00+09:00');
var end = new Date(dateStr + 'T23:59:59+09:00');
var events = [];
var allCals2 = CalendarApp.getAllCalendars();
for (var ci2 = 0; ci2 < allCals2.length; ci2++) {
var allEvs = allCals2[ci2].getEvents(start, end);
for (var ei = 0; ei < allEvs.length; ei++) { events.push(allEvs[ei]); }
}
events.sort(function(a, b) { return a.getStartTime() - b.getStartTime(); });
if (events.length === 0) {
lines.push('📅 今日の予定はありません');
} else {
lines.push('📅 今日の予定（' + events.length + '件）');
for (var i = 0; i < Math.min(events.length, 5); i++) {
var ev = events[i];
var loc = ev.getLocation() ? ' @' + ev.getLocation() : '';
lines.push((i+1) + '. ' + fmtDate(ev.getStartTime(), 'HH:mm') + ' ' + ev.getTitle() + loc);
}
if (events.length > 5) { lines.push(' ...他' + (events.length - 5) + '件'); }
}
} catch(e) { lines.push('📅 カレンダーの取得に失敗しました'); }
lines.push('');
try {
var sheet = getDataSheet('タスク');
if (sheet.getLastRow() > 1) {
var data = sheet.getDataRange().getValues();
var pending = [];
for (var ti = 1; ti < data.length; ti++) {
if (data[ti][5] !== '完了') { pending.push(data[ti]); }
}
if (pending.length === 0) {
lines.push('✅ 未完了タスクはありません！');
} else {
lines.push('✅ 未完了タスク（' + pending.length + '件）');
for (var pi = 0; pi < Math.min(pending.length, 5); pi++) {
var pri = pending[pi][3] ? ' [' + pending[pi][3] + ']' : '';
var due = pending[pi][2] ? ' 期限:' + pending[pi][2] : '';
lines.push((pi+1) + '. ' + pending[pi][4] + pri + due);
}
if (pending.length > 5) { lines.push(' ...他' + (pending.length - 5) + '件'); }
}
} else {
lines.push('✅ タスクはまだありません');
}
} catch(e) { lines.push('✅ タスクの取得に失敗しました'); }
lines.push('');
lines.push('今日も頑張りましょう💪');
pushToLine(config.USER_ID, lines.join('\n'));


}
function setupBriefingTrigger() {
var props = PropertiesService.getScriptProperties();
var hour = parseInt(props.getProperty('BRIEFING_HOUR') || '7', 10);
var triggers = ScriptApp.getProjectTriggers();
for (var i = 0; i < triggers.length; i++) {
if (triggers[i].getHandlerFunction() === 'morningBriefing') { ScriptApp.deleteTrigger(triggers[i]); }
}
ScriptApp.newTrigger('morningBriefing')
.timeBased()
.atHour(hour)
.everyDays(1)
.create();
}
function toolWeather(input) {
var cityCoords = {
'東京':{lat:35.6762,lon:139.6503},'大阪':{lat:34.6937,lon:135.5023},
'名古屋':{lat:35.1815,lon:136.9066},'福岡':{lat:33.5904,lon:130.4017},
'札幌':{lat:43.0618,lon:141.3545},'仙台':{lat:38.2682,lon:140.8694},
'広島':{lat:34.3853,lon:132.4553},'京都':{lat:35.0116,lon:135.7681},
'横浜':{lat:35.4437,lon:139.6380},'岡山':{lat:34.6618,lon:133.9344},
'神戸':{lat:34.6901,lon:135.1956},'那覇':{lat:26.2124,lon:127.6809},
'金沢':{lat:36.5613,lon:136.6562},'熊本':{lat:32.7898,lon:130.7417}
};
var city = input.city || '東京';
var coord = cityCoords[city] || cityCoords['東京'];
var name = cityCoords[city] ? city : '東京';
try {
var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + coord.lat + '&longitude=' + coord.lon +
'&current=temperature_2m,weathercode,windspeed_10m&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo&forecast_days=3';
var data = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
var wc = function(c) {
if(c===0)return '快晴';if(c<=2)return '晴れ';if(c===3)return '曇り';
if(c<=49)return '霧';if(c<=59)return '霧雨';if(c<=69)return '雨';
if(c<=79)return '雪';if(c<=82)return '雨';if(c<=86)return '雪';return '雷雨';
};
var cur = data.current || {};
var daily = data.daily || {};
if (cur.temperature_2m === undefined) { return name + 'の天気情報を取得できませんでした'; }
var result = name + 'の天気: ' + wc(cur.weathercode) + ' ' + Math.round(cur.temperature_2m) + '℃ 風' + Math.round(cur.windspeed_10m) + 'km/h\n3日間予報:\n';
for (var i = 0; i < 3; i++) {
result += fmtDate(new Date(daily.time[i]), 'M/d(E)') + ' ' + wc(daily.weathercode[i]) + ' ' +
Math.round(daily.temperature_2m_min[i]) + '〜' + Math.round(daily.temperature_2m_max[i]) + '℃ 雨' + daily.precipitation_sum[i] + 'mm\n';
}
return result;
} catch(e) { return name + 'の天気情報を取得できませんでした'; }
}
function replyToLine(replyToken, text) {
var config = getConfig();
if (!config.LINE_TOKEN) { return; }
var parts = splitMsg(text);
var msgs = [];
for (var i = 0; i < parts.length && i < 5; i++) { msgs.push({ type:'text', text: parts[i] }); }
try {
UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
method: 'post', contentType: 'application/json',
headers: { Authorization: 'Bearer ' + config.LINE_TOKEN },
payload: JSON.stringify({ replyToken: replyToken, messages: msgs }),
muteHttpExceptions: true
});
} catch(e) {  }
}
function trackTokenUsage(inputTokens, outputTokens, props) {
var now = new Date();
var key = 'tokens_' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy_M');
var s = props.getProperty(key);
var data = s ? JSON.parse(s) : { input:0, output:0, w5:false, w10:false };
data.input += (inputTokens || 0);
data.output += (outputTokens || 0);
var cost = (data.input / 1000000 * 3 + data.output / 1000000 * 15) * 150;
var newWarn = null;
if (!data.w10 && cost >= 1000) { data.w10 = true; data.w5 = true; newWarn = 1000; }
else if (!data.w5 && cost >= 500) { data.w5 = true; newWarn = 500; }
try { props.setProperty(key, JSON.stringify(data)); } catch(e) {}
return { cost: Math.round(cost), newWarn: newWarn };
}
function getMonthlyUsageText(props) {
var now = new Date();
var key = 'tokens_' + Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy_M');
var d = props.getProperty(key);
if (!d) { return '今月の使用記録はまだありません。'; }
var data = JSON.parse(d);
var cost = Math.round((data.input / 1000000 * 3 + data.output / 1000000 * 15) * 150);
var mn = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
var monthIdx = parseInt(Utilities.formatDate(now, 'Asia/Tokyo', 'M'), 10) - 1;
return mn[monthIdx] + 'の使用量（概算）\n入力: ' + data.input + ' tok\n出力: ' + data.output + ' tok\n推定: 約¥' + cost + '\n\n⚠️ あくまで目安です。正確な残高👇\nhttps://console.anthropic.com/settings/billing';
}
function getTone(uid, props) {
return (props || PropertiesService.getScriptProperties()).getProperty('tone_' + uid) || '';
}
function setTone(uid, tone, props) {
(props || PropertiesService.getScriptProperties()).setProperty('tone_' + uid, tone);
}
function getTonePrompt(uid, props) {
var tone = getTone(uid, props);
if (!tone) { return ''; }
var presets = {
'1': '',
'丁寧': '',
'2': '\n・タメ口・絵文字多めで話しかけて。',
'フレンドリー': '\n・タメ口・絵文字多めで話しかけて。',
'3': '\n・ビジネス敬語で簡潔に。絵文字なし。',
'ビジネス': '\n・ビジネス敬語で簡潔に。絵文字なし。',
};
if (presets[tone] !== undefined) { return presets[tone]; }
return '\n・口調: ' + tone;
}
function toolSetTone(input, uid) {
if (!uid) return '口調設定に失敗しました';
var t = (input.tone || '').trim();
if (!t) return '口調が指定されていません';
var p = PropertiesService.getScriptProperties();
setTone(uid, t, p);
return '口調を「' + t + '」に設定しました。次のメッセージから反映されます。';
}
function toolCompany(input,uid){
if(uid!=='U029395d561dbfe988aceae03cbf6affc')return'この機能は未設定です';
var root=DriveApp.getFolderById('1RLc-33sobz9UJ-fbcF7pluA6tAez1K3j');
var depts=['秘書室','LINE事業','Instagram','note','介護ブログ','コミュニティ','学校コンサル','HP運用'];
if(input.action==='status'){
var lines=['📊 部署別ステータス'];
for(var i=0;i<depts.length;i++){var sb=root.getFoldersByName(depts[i]);if(!sb.hasNext()){lines.push(depts[i]+': 0件');continue;}
var fs=sb.next().getFiles(),cnt=0,lt='';while(fs.hasNext()){var fl=fs.next();cnt++;if(!lt)lt=fl.getName();}
lines.push(depts[i]+': '+cnt+'件'+(lt?' (最新:'+lt+')':''));}
return lines.join('\n');}
var dept=input.dept||'秘書室';var sb=root.getFoldersByName(dept);
if(!sb.hasNext())return dept+'フォルダが見つかりません';
var fs=sb.next().getFiles(),items=[];
while(fs.hasNext()&&items.length<10){var f=fs.next();items.push(f.getName()+'\n'+f.getBlob().getDataAsString().substring(0,200));}
if(!items.length)return dept+'にメモはまだありません';
return'📁 '+dept+' ('+items.length+'件)\n\n'+items.join('\n---\n');}
function processGroupMention(ev){var c=getConfig();if(!c.ANTHROPIC_KEY)return;var msg=ev.message.text.trim().replace(/@[^\s\u3000]+/g,'').trim();if(!msg)return;var rt=ev.replyToken;try{var res=UrlFetchApp.fetch('https://api.anthropic.com/v1/messages',{method:'post',contentType:'application/json',headers:{'x-api-key':c.ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},payload:JSON.stringify({model:'claude-sonnet-4-5',max_tokens:100,messages:[{role:'user',content:'「'+msg+'」をtask/reminder/memo/skipで分類。迷ったらskip。JSON:{"t":"task","v":"内容"} or {"t":"reminder","v":"内容","dt":"日時"} or {"t":"memo","v":"内容"} or {"t":"skip"}のみ返せ'}]}),muteHttpExceptions:true});var r=JSON.parse(res.getContentText());if(r.error||!r.content)return;var m=r.content[0].text.match(/\{[\s\S]*?\}/);if(!m)return;var d=JSON.parse(m[0]);if(d.t==='task'){var ts=getDataSheet('タスク');if(ts.getLastRow()===0)ts.appendRow(['ID','追加日時','期限','優先度','タスク','状態']);ts.appendRow([Date.now()+'',getJSTNow(),'','中',d.v||msg,'未完了']);replyToLine(rt,'✅ タスク記録');}else if(d.t==='reminder'){var dt=d.dt?new Date(d.dt.includes('+')?d.dt:d.dt+'+09:00'):new Date(Date.now()+3600000);if(isNaN(dt.getTime()))dt=new Date(Date.now()+3600000);var rs=getDataSheet('リマインダー');if(rs.getLastRow()===0)rs.appendRow(['ID','設定日時','リマインド日時','内容','送信済み','繰り返し']);rs.appendRow([Date.now()+'',getJSTNow(),dt.getTime(),d.v||msg,'FALSE','none']);replyToLine(rt,'⏰'+(d.v||msg)+'\n'+Utilities.formatDate(dt,'Asia/Tokyo','M/d H')+'時');}else if(d.t==='memo'){var ms=getDataSheet('メモ');if(ms.getLastRow()===0)ms.appendRow(['ID','日時','タグ','内容']);ms.appendRow([Date.now()+'',getJSTNow(),'グループ',d.v||msg]);replyToLine(rt,'📝 メモ記録');}}catch(e){}}


function saveToMyCompanyAuto(t){var c=getConfig();if(!c.ANTHROPIC_KEY)return;var h={'x-api-key':c.ANTHROPIC_KEY,'anthropic-version':'2023-06-01'};function q(p,m){return JSON.parse(UrlFetchApp.fetch('https://api.anthropic.com/v1/messages',{method:'post',contentType:'application/json',headers:h,payload:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:m,messages:[{role:'user',content:p}]}),muteHttpExceptions:true}).getContentText()).content[0].text.trim();}try{if(q('アイデア/思考/気づき系?\nメッセージ:'+t+'\n「はい」か「いいえ」のみ',5)!=='はい')return;var cat=q('分類:秘書室,LINE事業,Instagram,note,介護ブログ,コミュニティ,学校コンサル,HP運用\nメモ:'+t+'\nカテゴリ名のみ',15);var root=DriveApp.getFolderById('1RLc-33sobz9UJ-fbcF7pluA6tAez1K3j');var subs=root.getFoldersByName(cat);var folder=subs.hasNext()?subs.next():root.createFolder(cat);folder.createFile(Utilities.formatDate(new Date(),'Asia/Tokyo','yyyyMMdd_HHmm')+'.txt','【'+cat+'】\n'+Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd HH:mm')+'\n\n'+t,MimeType.PLAIN_TEXT);}catch(e){}}


function _addTask(t){var s=getDataSheet('タスク');if(s.getLastRow()===0)s.appendRow(['ID','追加日時','期限','優先度','タスク','状態']);s.appendRow([Date.now()+'',getJSTNow(),'','中',t,'未完了']);}
function processGroupMessage(uid, message, props) {
var config = getConfig();
if (!config.USER_ID || uid !== config.USER_ID || !config.ANTHROPIC_KEY) { return; }
try {
var res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
method:'post', contentType:'application/json',
headers:{'x-api-key':config.ANTHROPIC_KEY,'anthropic-version':'2023-06-01'},
payload:JSON.stringify({model:'claude-sonnet-4-5',max_tokens:80,
messages:[{role:'user',content:'「'+message+'」をtask/skip/askで分類。task=自分がやる明確な作業のみ。迷ったらskip。JSON:{"t":"task","v":"内容"} or {"t":"skip"} or {"t":"ask"} のみ返せ'}]}),
muteHttpExceptions:true
});
var r = JSON.parse(res.getContentText());
if (r.error || !r.content) { return; }
var m = r.content[0].text.match(/\{[\s\S]*?\}/);
if (!m) { return; }
var d = JSON.parse(m[0]);
if (d.t === 'task') {
var _ts = getDataSheet('タスク');
if (_ts.getLastRow() === 0) { _ts.appendRow(['ID','追加日時','期限','優先度','タスク','状態']); }
_ts.appendRow([new Date().getTime().toString(), getJSTNow(), '', '中', d.v || message, '未完了']);
pushToLine(config.USER_ID, '✅ タスク登録\n・' + (d.v || message));
} else if (d.t === 'ask') {
var k = 'pt_' + new Date().getTime();
props.setProperty(k, message);
pushToLine(config.USER_ID, '❓ タスクにしますか？\n\n「' + message + '」\n\n「タスク:'+k.slice(-6)+'」→登録\n「スキップ:'+k.slice(-6)+'」→スルー');
}
} catch(e) {  }
}
function pushToLine(userId, text) {
var config = getConfig();
if (!config.LINE_TOKEN || !userId) { return; }
var parts = splitMsg(text);
var msgs = [];
for (var i = 0; i < parts.length && i < 5; i++) { msgs.push({ type:'text', text: parts[i] }); }
try {
UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
method: 'post', contentType: 'application/json',
headers: { Authorization: 'Bearer ' + config.LINE_TOKEN },
payload: JSON.stringify({ to: userId, messages: msgs }),
muteHttpExceptions: true
});
} catch(e) { }
}
function getCategoryHelp(message){var m={'Gmailヘルプ':'📧 Gmail','カレンダーヘルプ':'📅 カレンダー','ドキュメントヘルプ':'📄 ドキュメント','スプレッドシートヘルプ':'📊 スプシ','ドライブヘルプ':'📁 ドライブ','写真保存ヘルプ':'📸 写真保存','メモヘルプ':'📝 メモ','タスクヘルプ':'✅ タスク','レポートヘルプ':'📊 レポート','リマインダーヘルプ':'⏰ リマインダー','誕生日リマインダーヘルプ':'🎂 誕生日','朝のスケジュール確認ヘルプ':'☀️ 朝確認','URL要約ヘルプ':'🌐 URL要約','経路・ホテルヘルプ':'🗺 経路/🏨 ホテル','翻訳ヘルプ':'🌍 翻訳','文章校正ヘルプ':'✍️ 文章校正','AIチャットヘルプ':'💬 AIチャット','Web検索ヘルプ':'🔍 Web検索','天気ヘルプ':'🌤 天気','返信作成ヘルプ':'✉️ 返信作成','翻訳・文章校正ヘルプ':'🌍/✍️','口調変更ヘルプ':'🗣 口調変更','コスト管理ヘルプ':'💰 コスト管理'};return m[message]||null;}


function helpText() {
return '【LINE AI秘書 機能一覧】\n\n' +
'📧Gmail / 📅カレンダー / 📄ドキュメント\n' +
'📊スプレッドシート / 📁ドライブ / 📸写真保存\n' +
'📝メモ / ✅タスク / 📊レポート\n' +
'⏰リマインダー / 🎂誕生日 / ☀️朝のスケジュール確認\n' +
'🌐URL要約 / 🗺経路 / 🏨ホテル\n' +
'🌍翻訳 / ✏️文章校正 / 💬AIチャット\n' +
'🔍Web検索 / 🌤天気 / ✉️返信作成\n\n' +
'各機能の使い方は「ヘルプ」と送るとカードメニューで確認できます。';
}
function setupReminderTrigger() {
var triggers = ScriptApp.getProjectTriggers();
for (var i = 0; i < triggers.length; i++) {
if (triggers[i].getHandlerFunction() === 'checkReminders') {


return;
}
}
ScriptApp.newTrigger('checkReminders')
.timeBased()
.everyMinutes(5)
.create();


}
function getCarouselMessage() {
return {
type:'template',
altText: 'LINE AI秘書 機能一覧',
template: {
type:'carousel',
columns: [
{
title: 'Googleサービス',
text: 'Gmail・カレンダー・書類',
actions: [
{ type:'message', label:'📧 Gmail', text:'Gmailヘルプ' },
{ type:'message', label:'📅 カレンダー', text:'カレンダーヘルプ' },
{ type:'message', label:'📄 ドキュメント', text:'ドキュメントヘルプ' }
]
},
{
title: 'Googleサービス②',
text: 'ファイル・シート管理',
actions: [
{ type:'message', label:'📊 スプレッドシート', text:'スプレッドシートヘルプ' },
{ type:'message', label:'📁 ドライブ', text:'ドライブヘルプ' },
{ type:'message', label:'📸 写真保存', text:'写真保存ヘルプ' }
]
},
{
title: 'メモ・タスク管理',
text: 'やることと記録を管理',
actions: [
{ type:'message', label:'📝 メモ', text:'メモヘルプ' },
{ type:'message', label:'✅ タスク', text:'タスクヘルプ' },
{ type:'message', label:'📊 レポート作成', text:'レポートヘルプ' }
]
},
{
title: 'リマインダー',
text: '通知・スケジュール自動化',
actions: [
{ type:'message', label:'⏰ リマインダー', text:'リマインダーヘルプ' },
{ type:'message', label:'🎂 誕生日リマインダー', text:'誕生日リマインダーヘルプ' },
{ type:'message', label:'☀️ 朝のスケジュール確認', text:'朝のスケジュール確認ヘルプ' }
]
},
{
title: '検索・移動',
text: '調べる・探す',
actions: [
{ type:'message', label:'🌐 URL要約', text:'URL要約ヘルプ' },
{ type:'message', label:'🗺 経路・乗換', text:'経路・ホテルヘルプ' },
{ type:'message', label:'🏨 ホテル検索', text:'経路・ホテルヘルプ' }
]
},
{
title: '便利ツール①',
text: '翻訳・校正・AIチャット',
actions: [
{ type:'message', label:'🌍 翻訳・計算', text:'翻訳ヘルプ' },
{ type:'message', label:'✏️ 文章校正', text:'文章校正ヘルプ' },
{ type:'message', label:'💬 AIチャット', text:'AIチャットヘルプ' }
]
},
{
title: '便利ツール②',
text: '検索・天気・返信作成',
actions: [
{ type:'message', label:'🔍 Web検索', text:'Web検索ヘルプ' },
{ type:'message', label:'🌤 天気', text:'天気ヘルプ' },
{ type:'message', label:'✉️ 返信作成モード', text:'返信作成ヘルプ' }
]
},
{
title: 'カスタマイズ',
text: '口調・コスト管理',
actions: [
{ type:'message', label:'🗣 口調変更', text:'口調変更ヘルプ' },
{ type:'message', label:'💰 コスト確認', text:'コスト管理ヘルプ' },
{ type:'message', label:'❓ その他の使い方', text:'ヘルプ' }
]
}
]
}
};
}
function sendCarousel(replyToken) {
var config = getConfig();
if (!config.LINE_TOKEN) { return false; }
try {
var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/reply', {
method: 'post',
contentType: 'application/json',
headers: { Authorization: 'Bearer ' + config.LINE_TOKEN },
payload: JSON.stringify({ replyToken: replyToken, messages: [getCarouselMessage()] }),
muteHttpExceptions: true
});
var code = res.getResponseCode();


if (code !== 200) { return false; }
return true;
} catch(e) {


return false;
}
}
function pushCarousel(userId) {
var config = getConfig();
if (!config.LINE_TOKEN || !userId) { return; }
try {
var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
method: 'post',
contentType: 'application/json',
headers: { Authorization: 'Bearer ' + config.LINE_TOKEN },
payload: JSON.stringify({ to: userId, messages: [getCarouselMessage()] }),
muteHttpExceptions: true
});


} catch(e) {


}
}
function sendDemoEmails() {
var demoMode = PropertiesService.getScriptProperties().getProperty('DEMO_MODE');
if (demoMode !== 'TRUE') { return; }
var cfg = getConfig();
var countKey = 'demo_count_' + (cfg.USER_ID || '');
var count = parseInt(PropertiesService.getScriptProperties().getProperty(countKey) || '0');
if (count >= 10) { return; }
var myEmail = Session.getActiveUser().getEmail();
var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M月d日');
var emails = [
{
subject: '【' + today + '】株式会社田中商事 田中様より',
body: '先日のご提案についてご確認いただきたく、資料を添付いたします。\nご都合のよい日程でお打ち合わせをお願いできますでしょうか。\n\n田中商事 田中一郎'
},
{
subject: '【' + today + '】来週の会議室予約について',
body: '総務部です。\n来週月曜日14時から会議室Aを予約しました。\n出席者の皆様はご確認ください。\n\n総務部 山本'
},
{
subject: '【' + today + '】月次レポートのご確認依頼',
body: 'お疲れ様です。\n今月の月次レポートをお送りします。\n内容をご確認の上、承認をお願いいたします。\n期限：今週金曜日まで\n\n経理部 佐藤花子'
}
];
for (var i = 0; i < emails.length; i++) {
GmailApp.sendEmail(myEmail, emails[i].subject, emails[i].body);
}


}
function setupDemoEmailTrigger() {
var triggers = ScriptApp.getProjectTriggers();
for (var i = 0; i < triggers.length; i++) {
if (triggers[i].getHandlerFunction() === 'sendDemoEmails') {
ScriptApp.deleteTrigger(triggers[i]);
}
}
ScriptApp.newTrigger('sendDemoEmails').timeBased().atHour(8).everyDays(1).create();
}
function dailyClearCache() {
CacheService.getScriptCache().remove('remote_code_v1');


}
function setupDailyCacheClearTrigger() {
var triggers = ScriptApp.getProjectTriggers();
for (var i = 0; i < triggers.length; i++) {
if (triggers[i].getHandlerFunction() === 'dailyClearCache') {
ScriptApp.deleteTrigger(triggers[i]);
}
}
ScriptApp.newTrigger('dailyClearCache').timeBased().atHour(3).everyDays(1).create();
}
function dailyCheck(){var c=getConfig(),p=PropertiesService.getScriptProperties(),iss=[],fix=[];
if(!c.LINE_TOKEN)iss.push('🔴 LINE_TOKEN未設定');
if(!c.ANTHROPIC_KEY)iss.push('🔴 ANTHROPIC_KEY未設定');
else if(c.ANTHROPIC_KEY.indexOf('sk-ant-')!==0)iss.push('🔴 APIキー形式不正');
if(!c.USER_ID)iss.push('🔴 USER_ID未設定');
try{var at={};ScriptApp.getProjectTriggers().forEach(function(t){at[t.getHandlerFunction()]=1;});['checkReminders','morningBriefing','dailyClearCache','dailyCheck'].forEach(function(n){if(!at[n])iss.push('🔴 トリガー未登録:'+n);});}catch(e){iss.push('⚠️ トリガー確認失敗');}
var mid=p.getProperty('MAIN_CODE_DOC_ID'),ct='';
if(!mid){iss.push('⚠️ MAIN_CODE_DOC_ID未設定');}else{try{ct=DocumentApp.openById(mid).getBody().getText();if(ct.length<50000)iss.push('🔴 本体コード破損の疑い('+Math.round(ct.length/1024)+'KB)');var op=(ct.match(/\(/g)||[]).length,cp=(ct.match(/\)/g)||[]).length;if(Math.abs(op-cp)>5)iss.push('🔴 括弧異常(開'+op+'/閉'+cp+')');}catch(e){iss.push('⚠️ コード取得失敗:'+e.message);}}
var md=p.getProperty('MANUAL_DOC_ID'),mt='';if(md){try{mt=DocumentApp.openById(md).getBody().getText();}catch(e){}}
var td=getToolDefinitions(),ac=td.length;
if(mt){var tm=mt.match(/ツール(\d+)個/);if(tm&&parseInt(tm[1])!==ac)iss.push('🔧 ツール数不一致 コード:'+ac+'個 手順書:'+tm[1]+'個');}
var cols=getCarouselMessage().template.columns,hm=getCategoryHelpMap(),mh=[];
for(var ci=0;ci<cols.length;ci++){var acts=cols[ci].actions;for(var ai=0;ai<acts.length;ai++){if(!hm[acts[ai].text])mh.push('「'+acts[ai].text+'」(カード'+(ci+1)+')');}}
if(mh.length)iss.push('🔧 ヘルプ未定義:\n'+mh.join('\n'));
var rt=getRegisteredToolNames(),mf=[];for(var di=0;di<td.length;di++){if(!rt[td[di].name])mf.push(td[di].name);}
if(mf.length)iss.push('🔧 selectTools未登録:\n'+mf.join('\n'));
if(mt&&ct){var cv=ct.match(/version:\s*["']([0-9.]+)["']/),mv=mt.match(/v([0-9]+\.[0-9]+)/);if(cv&&mv&&cv[1].indexOf(mv[1])===-1&&mv[1].indexOf(cv[1].slice(0,3))===-1)iss.push('🔧 バージョン不一致 コード:v'+cv[1]+' 手順書:v'+mv[1]);}
try{var rs=getDataSheet('リマインダー'),rl=rs.getLastRow();if(rl>1){var rd=rs.getRange(1,1,rl,6).getValues(),nr=[];for(var ri=1;ri<rd.length;ri++){var rv=String(rd[ri][2]);if(rv==='NaN'||rv===''){nr.push(ri+1);rs.getRange(ri+1,5).setValue('TRUE');}}if(nr.length)fix.push('🔧 不正リマインダー無効化:'+nr.length+'件');}}catch(e){}
if(!c.LINE_TOKEN||!c.USER_ID)return;
if(!iss.length&&!fix.length)return;
var msg='🔍 日次チェック '+getJSTNow()+'\n';
if(fix.length)msg+='🔧 自動修正'+fix.length+'件\n'+fix.join('\n')+'\n\n';
if(iss.length)msg+='⚠️ 要確認'+iss.length+'件\n'+iss.join('\n\n');
pushToLine(c.USER_ID,msg);}
function getCategoryHelpMap() {
return {'Gmailヘルプ':1,'カレンダーヘルプ':1,'ドキュメントヘルプ':1,'スプレッドシートヘルプ':1,'ドライブヘルプ':1,'写真保存ヘルプ':1,'メモヘルプ':1,'タスクヘルプ':1,'レポートヘルプ':1,'リマインダーヘルプ':1,'誕生日リマインダーヘルプ':1,'朝のスケジュール確認ヘルプ':1,'URL要約ヘルプ':1,'経路・ホテルヘルプ':1,'翻訳ヘルプ':1,'文章校正ヘルプ':1,'AIチャットヘルプ':1,'Web検索ヘルプ':1,'天気ヘルプ':1,'返信作成ヘルプ':1,'翻訳・文章校正ヘルプ':1,'口調変更ヘルプ':1,'コスト管理ヘルプ':1,'ヘルプ':1};
}
function setupDailyCheckTrigger() {
var triggers = ScriptApp.getProjectTriggers();
for (var i = 0; i < triggers.length; i++) {
if (triggers[i].getHandlerFunction() === 'dailyCheck') {
ScriptApp.deleteTrigger(triggers[i]);
}
}
ScriptApp.newTrigger('dailyCheck')
.timeBased()
.atHour(0)
.everyDays(1)
.create();


}
function testAllPermissions() {
var threads = GmailApp.search('is:unread in:inbox', 0, 1);
var myEmail = Session.getActiveUser().getEmail();
GmailApp.sendEmail(myEmail, '[LINE AI秘書] 権限テスト', 'このメールは削除してください。');
var cal = CalendarApp.getDefaultCalendar();
var s = new Date(); s.setDate(s.getDate()+1); s.setHours(23,0,0,0);
var ev = cal.createEvent('権限テスト', s, new Date(s.getTime()+1800000));
ev.deleteEvent();
var ss = SpreadsheetApp.create('権限テスト（削除OK）');
DriveApp.getFileById(ss.getId()).setTrashed(true);
var doc = DocumentApp.create('権限テスト（削除OK）');
DocumentApp.openById(doc.getId()).saveAndClose();
DriveApp.getFileById(doc.getId()).setTrashed(true);
var form = FormApp.create('権限テスト（削除OK）');
DriveApp.getFileById(form.getId()).setTrashed(true);
var slide = SlidesApp.create('権限テスト（削除OK）');
DriveApp.getFileById(slide.getId()).setTrashed(true);
getDataSheet('メモ');
setupReminderTrigger();
setupBriefingTrigger();
setupDailyCacheClearTrigger();
setupDailyCheckTrigger();
var demoMode = PropertiesService.getScriptProperties().getProperty('DEMO_MODE');
if (demoMode === 'TRUE') { setupDemoEmailTrigger(); }


}
function testSetup() {
var config = getConfig();








}
function clearCodeCache() {
CacheService.getScriptCache().remove('remote_code_v1');


}