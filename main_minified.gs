function _safeJson(text) {
if (!text) return null;
var t = text.trim();
if (t.charAt(0) === '<') return null;
try { return JSON.parse(t); } catch(e) { return null; }
}
function getConfig(){var p=_P();return{LINE_TOKEN:p.getProperty('LINE_CHANNEL_ACCESS_TOKEN'),ANTHROPIC_KEY:p.getProperty('ANTHROPIC_API_KEY'),USER_ID:p.getProperty('LINE_USER_ID')};}
var REMOTE_CONFIG_CACHE_KEY = 'remote_config';
var REMOTE_CONFIG_TTL = 21600;
var SCRIPT_CACHE = CacheService.getScriptCache();
var HISTORY_PREFIX = 'h_';
var MAX_TURNS = 2;
var SYSTEM_PROMPT_CARE_MANAGER = 'あなたは居宅ケアマネジャー専用のAI秘書です。以下のルールに従って動作してください。\n【あなたの役割】在宅で暮らす利用者を支える居宅ケアマネジャーの個人業務をサポートします。\n【得意なこと】\n・担当者会議・モニタリングの議事録を整形・要約する\n・カレンダーへの会議・訪問予定の登録とリマインド設定\n・申し送り・特記事項のメモ保存\n・服薬・処置スケジュールの繰り返しリマインダー\n・退院連携・緊急時のタスクリスト作成\n・ケアプラン関係書類の下書き補助\n・研修資料・プレゼン資料の叩き台作成\n・Google Docsの文字起こしテキストを議事録フォーマットに整形（docs_read→整形→docs_write）\n【Google Docs連携の流れ】\nユーザーがDocsのURLを送ってきたら：1.URLからドキュメントIDを抽出 2.docs_readでfull_read=trueで全文取得 3.内容を整形 4.docs_writeで同じドキュメントに書き戻し（mode=replace）またはdocs_createで新規作成\n【記録の扱い】\n・利用者名が含まれるメッセージは記録として扱う\n・整形後は必ず次のアクション（カレンダー登録・タスク追加・リマインド設定）を提案する\n【返答スタイル】\n・簡潔に、抜け漏れなく\n・介護の専門用語はそのまま使う\n【禁止事項】\n・医療的な診断・判断はしない\n・不明な点は「主治医または専門職にご確認ください」と伝える\n【使用しないツール】以下のツールは呼び出さないでください：hotel_search / drive_folder_create / drive_file_delete / drive_file_move / drive_file_rename / sheets_create / sheets_delete / docs_delete / company';
function selectModel(msg){if(/まとめて|議事録|報告書|ケアプラン|アセスメント|要約|作成して|書いて|研修|資料|整形/.test(msg))return'claude-sonnet-4-5';if(/予定.*(追加|確認|削除|変更)|タスク.*(追加|完了|確認|削除)|メモ.*(保存|確認|追加|削除)|リマインド.*(設定|確認|削除)|今日の予定|天気|経路|ブリーフィング|カレンダー|申し送り.*メモ/.test(msg))return _HAIKU_MODEL;return _HAIKU_MODEL;}
function selectMaxTokens(msg){if(/まとめて|議事録|報告書|整形/.test(msg))return 1500;if(/ケアプラン|アセスメント|作成して|研修|資料/.test(msg))return 1200;if(/ブリーフィング/.test(msg))return 800;if(/検索|天気|経路|教えて/.test(msg))return 600;if(/予定|タスク|メモ|リマインド|追加|完了|削除/.test(msg))return 300;return 500;}
var _ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
var _ANTHROPIC_VER = '2023-06-01';
var _HAIKU_MODEL = _HAIKU_MODEL;
var _LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
var _LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
var _KISHI_UID = _KISHI_UID;
function _haikuAsk(apiKey,prompt,maxTok){try{var r=_safeJson(UrlFetchApp.fetch(_ANTHROPIC_URL,{method:'post',contentType:'application/json',headers:{'x-api-key':apiKey,'anthropic-version':_ANTHROPIC_VER},payload:JSON.stringify({model:_HAIKU_MODEL,max_tokens:maxTok||200,messages:[{role:'user',content:prompt}]}),muteHttpExceptions:true}).getContentText());return r&&r.content&&r.content[0]?r.content[0].text.trim():'';}catch(e){return '';}}
function _sbHeaders(key){return{'apikey':key,'Authorization':'Bearer '+key};}
function _sbGet(url,key,path){return UrlFetchApp.fetch(url+'/rest/v1/'+path,{headers:_sbHeaders(key),muteHttpExceptions:true});}
function _sbPost(url,key,path,data){return UrlFetchApp.fetch(url+'/rest/v1/'+path,{method:'post',contentType:'application/json',headers:{'apikey':key,'Authorization':'Bearer '+key,'Prefer':'return=minimal'},payload:JSON.stringify(data),muteHttpExceptions:true});}
function _lineMsg(url,token,payload){try{UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token},payload:JSON.stringify(payload),muteHttpExceptions:true});}catch(e){}}
function _P(){return PropertiesService.getScriptProperties();}
function _getCmsProps(){var p=_P();return{clientId:p.getProperty('CMS_CLIENT_ID')||null,sbUrl:p.getProperty('CMS_SUPABASE_URL')||'https://dovnjfbayzxpisgqkqvq.supabase.co',sbKey:p.getProperty('CMS_SUPABASE_KEY')||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvdm5qZmJheXp4cGlzZ3FrcXZxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDIzMjI5MCwiZXhwIjoyMDg5ODA4MjkwfQ.5eGGrjrVAoRLDgsYdS-dzRXmY6MnntZbYyqabezIPtc'};}
function getRemoteConfig() {
var cached=SCRIPT_CACHE.get(REMOTE_CONFIG_CACHE_KEY);if(cached)try{return JSON.parse(cached);}catch(e){}
var url=_P().getProperty('MASTER_CONFIG_URL')||'https://script.google.com/macros/s/AKfycbyVsCDTmvXjwKzF82bGUHD5Sp3RF3SJVIKuIG0WFGyMzmlbvy--O9qqoDiXLi4zP4O-xw/exec';
try{var c=JSON.parse(UrlFetchApp.fetch(url,{muteHttpExceptions:true}).getContentText());if(c._status==='ok'){SCRIPT_CACHE.put(REMOTE_CONFIG_CACHE_KEY,JSON.stringify(c),REMOTE_CONFIG_TTL);return c;}}catch(e){}
return getDefaultConfig();
}
function getDefaultConfig(){return{system_prompt:'あなたは優秀なAI秘書です。丁寧で簡潔な日本語・箇条書きは「・」で回答。',ai_tone:'丁寧・親しみやすい',greeting:'こんにちは！何かお手伝いできますか？😊',max_history:'8',announcement:'',maintenance:'FALSE',maintenance_msg:'ただいまメンテナンス中です。しばらくお待ちください。',version:'3.3.0',_status:'default'};}
var _TZ='Asia/Tokyo';
function _F(d,f){return Utilities.formatDate(d instanceof Date?d:new Date(d),_TZ,f);}
function _parseRawDt(raw){if(typeof raw==='number'&&raw>1e12)return new Date(raw);if(raw instanceof Date)return raw;var s=String(raw||'').trim();if(!s)return null;if(/^\d{13}$/.test(s))return new Date(parseInt(s));if(s.indexOf('+')===-1&&s.indexOf('Z')===-1)s+='+09:00';return new Date(s);}
function _searchCals(start,end,keyword){var matched=[],seen={},cals=CalendarApp.getAllCalendars();for(var ci=0;ci<cals.length;ci++){var evs=cals[ci].getEvents(start,end);for(var ei=0;ei<evs.length;ei++){var id=evs[ei].getId();if(!seen[id]&&(!keyword||evs[ei].getTitle().indexOf(keyword)!==-1)){seen[id]=true;matched.push(evs[ei]);}}}return matched;}
function _setupTrigger(fn,cfg){var triggers=ScriptApp.getProjectTriggers();for(var i=0;i<triggers.length;i++){if(triggers[i].getHandlerFunction()===fn)ScriptApp.deleteTrigger(triggers[i]);}return cfg;}
function _notFound(kw,type){return'「'+kw+'」に該当する'+type+'が見つかりませんでした';}
function getJSTNow(){return _F(new Date(),'yyyy年M月d日（E） HH:mm');}
function fmtDate(d,f){return _F(d,f);}
function getJSTDate(o){o=o||0;var s=_F(new Date(),'yyyy-MM-dd');return new Date(parseInt(s.substring(0,4)),parseInt(s.substring(5,7))-1,parseInt(s.substring(8,10))+o);}
function splitMsg(t){if(t.length<=3500)return[t];var p=[];for(var i=0;i<t.length;i+=3500)p.push(t.slice(i,i+3500));return p;}
function getHistory(uid) {
var k=HISTORY_PREFIX+uid,cached=SCRIPT_CACHE.get(k);
if(cached)return JSON.parse(cached);
var raw=_P().getProperty(k);if(!raw)return[];
try{SCRIPT_CACHE.put(k,raw,21600);}catch(e){}return JSON.parse(raw);
}
function saveHistory(uid, history) {
if(history.length>MAX_TURNS*2)history=history.slice(-MAX_TURNS*2);
var k=HISTORY_PREFIX+uid,json=JSON.stringify(history);
try{SCRIPT_CACHE.put(k,json,43200);}catch(e){}
try{_P().setProperty(k,json);}catch(e){}
}
function clearHistory(uid) {
var k=HISTORY_PREFIX+uid;try{SCRIPT_CACHE.remove(k);}catch(e){}try{_P().deleteProperty(k);}catch(e){}
}
var REPLY_MODE_PREFIX='replymode_';
function getReplyMode(uid){var k=REPLY_MODE_PREFIX+uid,c=SCRIPT_CACHE.get(k);if(c)return c==='true';return _P().getProperty(k)==='true';}
function setReplyMode(uid,bool){var k=REPLY_MODE_PREFIX+uid,v=bool?'true':'false';try{SCRIPT_CACHE.put(k,v,43200);}catch(e){}_P().setProperty(k,v);}
function getDataSheet(sheetName) {
var props=_P(),ssId=props.getProperty('DATA_SS_ID'),ss;
if(ssId){try{ss=SpreadsheetApp.openById(ssId);}catch(e){try{Utilities.sleep(2000);ss=SpreadsheetApp.openById(ssId);}catch(e2){ss=null;}}}
if(!ss){if(ssId)props.setProperty('DATA_SS_ID_BACKUP',ssId);ss=SpreadsheetApp.create('LINE AI秘書 データ管理');props.setProperty('DATA_SS_ID',ss.getId());try{var c=getConfig();if(c.LINE_TOKEN&&c.USER_ID)pushToLine(c.USER_ID,'⚠️ データシートの接続が切れたため新規作成しました。旧ID: '+(ssId||'なし')+'\n管理者にお問い合わせください。');}catch(e){}}
var sheet=ss.getSheetByName(sheetName);if(!sheet)sheet=ss.insertSheet(sheetName);return sheet;
}
function doPost(e) {
try{var events=JSON.parse(e.postData.contents).events;
for(var i=0;i<events.length;i++){var ev=events[i];
if(ev.type==='follow'){var fu=ev.source.userId;saveUserId(fu);replyToLine(ev.replyToken,'ご登録ありがとうございます！🎉\nLINE AI秘書をご利用いただけます。\n\n機能一覧👇');Utilities.sleep(300);pushCarousel(fu);continue;}
if(ev.source.type==='group'||ev.source.type==='room'){if(!ev.message||ev.message.type!=='text')continue;var mt=ev.message.text.trim(),su=ev.source.userId,gp=_P(),ou=gp.getProperty('LINE_USER_ID')||'',im=false;
if(ev.message.mention&&ev.message.mention.mentionees)for(var mi=0;mi<ev.message.mention.mentionees.length;mi++)if(ev.message.mention.mentionees[mi].userId===ou){im=true;break;}
if(im&&su!==ou)processGroupMention(ev);else if(su===ou)processGroupMessage(su,mt,gp);else if(su!==ou&&gp.getProperty('GROUP_WATCH')==='TRUE')processGroupWatch(ev,ou,gp);continue;}
if(ev.type==='message'&&ev.message.type==='image'){
var uid2=ev.source.userId;saveUserId(uid2);var cfg2=getConfig();
try{var imgRes=UrlFetchApp.fetch('https://api-data.line.me/v2/bot/message/'+ev.message.id+'/content',{headers:{Authorization:'Bearer '+cfg2.LINE_TOKEN},muteHttpExceptions:true});
var blob=imgRes.getBlob(),fname='📸 '+_F(new Date(),'yyyy-MM-dd_HH-mm-ss')+'.jpg',file=DriveApp.createFile(blob.setName(fname));
file.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);replyToLine(ev.replyToken,'📸 Driveに保存しました！\n'+fname+'\n'+file.getUrl());
}catch(imgErr){replyToLine(ev.replyToken,'画像の保存に失敗しました: '+imgErr.toString());}continue;}
if(ev.type!=='message'||ev.message.type!=='text')continue;
var uid=ev.source.userId,message=ev.message.text.trim();saveUserId(uid);
var _cs=_getCmsAccountStatus();if(_cs==='suspended'){replyToLine(ev.replyToken,'現在ご利用いただけません。お支払い状況をご確認ください。');continue;}if(_cs==='cancelled'){replyToLine(ev.replyToken,'このアカウントは解約済みです。');continue;}
if(message==='ヘルプ'||message==='help'){if(!sendCarousel(ev.replyToken))replyToLine(ev.replyToken,helpText());continue;}
var reply=processMessage(uid,message);if(reply)replyToLine(ev.replyToken,reply);}
}catch(err){try{var cfg=getConfig();if(cfg.LINE_TOKEN&&cfg.USER_ID)pushToLine(cfg.USER_ID,'🔴 システムエラー\n'+err.toString()+'\n\n繰り返す場合はhttps://console.anthropic.com のBillingでクレジット残高を確認');}catch(e2){}}
return ContentService.createTextOutput('OK');
}
function saveUserId(uid){var p=_P();if(!p.getProperty('LINE_USER_ID'))p.setProperty('LINE_USER_ID',uid);}
function processMessage(uid, message) {
message=message.replace(/[\u3000]/g,' ').trim();
if(message.length<=1&&!/[0-9０-９]/.test(message))return null;
var lock=LockService.getScriptLock();try{lock.waitLock(10000);}catch(le){}
var demoWarning='';
try{if(uid===_KISHI_UID)saveToMyCompanyAuto(message);}catch(e){}
var config=getConfig();
if(!config.ANTHROPIC_KEY)return'ANTHROPIC_API_KEY が未設定です。スクリプトプロパティを確認してください。';
var remoteConfig=getRemoteConfig();
if(remoteConfig.maintenance==='TRUE')return remoteConfig.maintenance_msg||'ただいまメンテナンス中です。しばらくお待ちください。';
try{var _cs2=_getCmsSettings();if(_cs2&&_cs2.job_type==='care_manager'){var _ssId=_P().getProperty('DATA_SS_ID');if(_ssId)createCarePlanSheet(_ssId);}}catch(e){}
var props=_P(),announcementText=remoteConfig.announcement||'';
if(announcementText){var ak='ann_sent_'+announcementText.slice(0,20).replace(/[^a-zA-Z0-9]/g,'_');if(!props.getProperty(ak)){props.setProperty(ak,'TRUE');var c2=getConfig();if(c2.LINE_TOKEN&&c2.USER_ID)pushToLine(c2.USER_ID,'📢 お知らせ\n\n'+announcementText);}}
if(props.getProperty('DEMO_MODE')==='TRUE'){var ck='demo_count_'+uid,cnt=parseInt(props.getProperty(ck)||'0');
if(cnt>=10)return'デモ版は10回までです。\n\nご購入はこちら👇\nhttps://omoseka.com/plan';
try{props.setProperty(ck,String(cnt+1));}catch(e){}
var rem=10-(cnt+1);if(rem<=3&&rem>0)demoWarning='\n\n---\n⚠️ デモ版：残り'+rem+'回です';}
if(message==='リセット'||message==='reset'){clearHistory(uid);setReplyMode(uid,false);return'🔄 会話履歴をリセットしました！新しい話題から始めましょう。';}
if(message==='返信終了'){setReplyMode(uid,false);clearHistory(uid);return'✅ 返信作成モードを終了しました。通常モードに戻りました。';}
var categoryHelp=getCategoryHelp(message);if(categoryHelp)return categoryHelp;
if(message==='残高確認'||message==='クレジット確認'||message==='API残高')return getMonthlyUsageText(props);
if (/^(タスク|スキップ):/.test(message)) {
var isTask = message.indexOf('タスク:') === 0;
var sk = message.replace(/^(タスク|スキップ):/, '').trim();
var ap = props.getProperties();
for (var pk in ap) {
if (pk.indexOf('pt_') === 0 && pk.slice(-6) === sk) {
if (isTask) {
var _ts2 = getDataSheet('タスク');
_ensureHeaders(_ts2,_TASK_HEADERS);
_ts2.appendRow([Date.now()+'', getJSTNow(), '', '中', ap[pk], '未完了']);
props.deleteProperty(pk);
return '✅ タスク登録: ' + ap[pk];
}
props.deleteProperty(pk);
return '🗑 スキップしました';
}
}
return '⚠️ 見つかりません';
}
if(message==='口調変更'||message==='口調設定'){props.setProperty('TONE_MENU_'+uid,'true');return'🗣 口調設定\n1.丁寧 2.フレンドリー 3.ビジネス 4.カスタム\n\n例:「カスタム:関西弁で」\n現在: '+(getTone(uid,props)||'丁寧');}
var _toneMenu=props.getProperty('TONE_MENU_'+uid);
if(_toneMenu==='true'&&/^(1|2|3|丁寧|フレンドリー|ビジネス)$/.test(message)){props.deleteProperty('TONE_MENU_'+uid);var tm={'1':'丁寧','2':'フレンドリー','3':'ビジネス'},nt=tm[message]||message;setTone(uid,nt,props);var tl={'丁寧':'丁寧（デフォルト）','フレンドリー':'フレンドリー（タメ口・絵文字多め）','ビジネス':'ビジネス（簡潔・敬語）'};return'✅ 口調を「'+(tl[nt]||nt)+'」に変更しました！\n\n次のメッセージから反映されます。';}
if(message.indexOf('カスタム:')===0||message.indexOf('カスタム：')===0){var ct=message.replace(/^カスタム[：:]/,'').trim();if(ct){setTone(uid,ct,props);return'✅ 口調を「'+ct+'」に設定しました！\n\n次のメッセージから反映されます。';}return'「カスタム:関西弁で」と送信してください';}
if(_toneMenu==='true'&&message==='4'){props.deleteProperty('TONE_MENU_'+uid);return'「カスタム:関西弁で」のように送信してください';}
var _ml=message.toLowerCase();
if(_ml==='週次まとめon'){_P().setProperty('WEEKLY_REPORT_'+uid,'TRUE');return'✅ 週次まとめを毎週金曜にお届けします！';}
if(_ml==='週次まとめoff'){_P().setProperty('WEEKLY_REPORT_'+uid,'FALSE');return'🔕 週次まとめの配信を停止しました。再開したい場合は「週次まとめON」と送ってください。';}
if(_ml==='フォローアップon'){_P().setProperty('FOLLOWUP_'+uid,'TRUE');return'✅ 予定終了後にフォローアップ通知をお届けします！\n（会議終了1時間後に「議事録を残しますか？」とお聞きします）\n停止:「フォローアップOFF」';}
if(_ml==='フォローアップoff'){_P().setProperty('FOLLOWUP_'+uid,'FALSE');return'🔕 フォローアップ通知を停止しました。再開:「フォローアップON」';}
if(message==='返信開始'){setReplyMode(uid,true);clearHistory(uid);return'✉️ 返信作成モード開始\n①お客様メッセージ②伝えたいこと\n終了:「返信終了」';}
var history=getHistory(uid),isReplyMode=getReplyMode(uid),tonePrompt=getTonePrompt(uid,props);
if(tonePrompt&&remoteConfig){remoteConfig=JSON.parse(JSON.stringify(remoteConfig));var sp=remoteConfig.system_prompt||'';remoteConfig.system_prompt=sp.replace(/丁寧で簡潔な日本語/g,'簡潔な日本語').replace(/丁寧・親しみやすい/g,'')+tonePrompt;}
history.push({role:'user',content:message});var maxLoops=3,finalReply='',_usedTools=[];
for(var loop=0;loop<maxLoops;loop++){
var response=callClaudeWithTools(config.ANTHROPIC_KEY,history,isReplyMode,remoteConfig);
if(!response){finalReply='申し訳ありません、処理できませんでした🙏\nもう一度お試しください。';break;}
if(response._api_error){try{pushToLine(_KISHI_UID,'⚠️ APIエラー\nUID:'+uid+'\nHTTP:'+response._http_code+'\n'+response._err_type+'\n'+(response._err_msg||'').substring(0,200));}catch(e){}finalReply='申し訳ありません、処理できませんでした🙏\nしばらくしてからもう一度お試しください。';break;}
var stopReason=response.stop_reason,content=response.content;
if(response._credit_error){finalReply='⚠️ APIクレジット残高不足です。\n\nhttps://console.anthropic.com → Billing → Add credit でチャージしてください（$5〜$10推奨）\n\nチャージ後すぐ利用可能です。';break;}
if(stopReason==='end_turn'){
for(var ci=0;ci<content.length;ci++)if(content[ci].type==='text'){finalReply=content[ci].text;break;}
history.push({role:'assistant',content:content});
if(response.usage){var ur=trackTokenUsage(response.usage.input_tokens,response.usage.output_tokens,props);if(ur.newWarn){var c3=getConfig();if(c3.LINE_TOKEN&&c3.USER_ID)pushToLine(c3.USER_ID,'⚠️ 今月のAPI推定コストが¥'+ur.newWarn+'に達しました\n\n'+getMonthlyUsageText(props));}}break;}
if(stopReason==='tool_use'){
history.push({role:'assistant',content:content});var toolResults=[],_alreadySent=false;
for(var ti=0;ti<content.length;ti++){if(content[ti].type!=='tool_use')continue;
var tn=content[ti].name,tr=executeTool(tn,content[ti].input,uid);_usedTools.push(tn);
if(tr==='__SENT__'){_alreadySent=true;break;}
var _trLim=(tn==='docs_read')?4500:1500;
toolResults.push({type:'tool_result',tool_use_id:content[ti].id,content:typeof tr==='string'&&tr.length>_trLim?tr.slice(0,_trLim)+'…（省略）':tr});}
if(_alreadySent){finalReply='__SENT__';break;}
history.push({role:'user',content:toolResults});continue;}
finalReply='処理できませんでした。もう一度お試しください。';break;}
if(finalReply==='__SENT__')return null;
if(!finalReply)finalReply='エラーが発生しました。\n繰り返す場合はAPIクレジット残高をご確認: https://console.anthropic.com → Billing';
try{var _vR=finalReply,_vT=_usedTools.join(','),_vM=message,_vS=/保存した|メモした|記録した|追加した|登録した|入れた|しといた|完了.*[!！✨]/.test(_vR),_vD=/削除した|消した|取り消した|除した/.test(_vR),_vDn=/完了にした|完了した(?!.*タスク)/.test(_vR),_vF=false;
if(/^メモ[\s\n]|メモ[にをへ]?(追加|保存|記録|して|しといて)/.test(_vM)&&_vS&&_vT.indexOf('memo_add')===-1)_vF=true;
if((/タスク[にをへ]?(追加|登録|して|入れて)|^タスク[\s\n]/.test(_vM))&&_vS&&_vT.indexOf('task_add')===-1)_vF=true;
if(/削除|消して|消す|消去|取り消/.test(_vM)&&_vD&&_vT.indexOf('delete')===-1&&_vT.indexOf('memo_delete')===-1&&_vT.indexOf('task_delete')===-1&&_vT.indexOf('reminder_delete')===-1)_vF=true;
if((/完了[にを]?[しす]|終わった|できた|やった/.test(_vM))&&_vDn&&_vT.indexOf('task_done')===-1)_vF=true;
if((/カレンダー[にをへ]?(追加|登録|入れて)|予定[をにへ]?(追加|登録|入れて)/.test(_vM))&&_vS&&_vT.indexOf('calendar_add')===-1)_vF=true;
if((/リマインダー[にをへ]?(追加|設定|登録|して)|リマインド[をにへ]?(追加|設定|して)/.test(_vM))&&_vS&&_vT.indexOf('reminder_add')===-1)_vF=true;
if(_vF){finalReply='⚠️ 処理がうまくいかなかったかもしれません。もう一度お試しください🙏';try{var _kC=getConfig();if(_kC.USER_ID===_KISHI_UID)pushToLine(_kC.USER_ID,'⚠️ ハルシネーション検知\nメッセージ: '+_vM.substring(0,100)+'\nAI回答: '+_vR.substring(0,100)+'\n実行ツール: '+(_vT||'なし'));}catch(e2){}}}catch(_vErr){}
var cleanHistory=[];
for(var hi=0;hi<history.length;hi++){var h=history[hi];
if(h.role==='user'&&Array.isArray(h.content)){var htr=false;for(var hci=0;hci<h.content.length;hci++)if(h.content[hci].type==='tool_result'){htr=true;break;}if(htr)continue;}
if(h.role==='assistant'&&Array.isArray(h.content)){var txt='';for(var hci2=0;hci2<h.content.length;hci2++)if(h.content[hci2].type==='text'){txt=h.content[hci2].text;break;}if(!txt)continue;cleanHistory.push({role:'assistant',content:txt});continue;}
cleanHistory.push(h);}
saveHistory(uid, cleanHistory);
try {
var _cp=_getCmsProps();
_sbPost(_cp.sbUrl,_cp.sbKey,'ai_logs',{account_id:_cp.clientId,user_id:uid,user_message:message.substring(0,500),ai_response:(finalReply||'').substring(0,500),tools_used:_usedTools.length>0?_usedTools:null});
} catch(e) {}
if (demoWarning) {
finalReply = finalReply + demoWarning;
}
try { lock.releaseLock(); } catch(le2) {}
return finalReply;
}
function callClaudeWithTools(apiKey, history, isReplyMode, remoteConf) {
var tools=getToolDefinitions();if(!remoteConf)remoteConf=getRemoteConfig();
var cs=null;try{cs=_getCmsSettings();}catch(e){}
var jobType=(cs&&cs.job_type)?cs.job_type:'general';
var basePrompt=(jobType==='care_manager')?SYSTEM_PROMPT_CARE_MANAGER:(remoteConf.system_prompt||'あなたは優秀なAI秘書です。LINEを通じてユーザーの仕事をサポートします。丁寧で簡潔な日本語で回答してください。');
var announceTxt='',systemPrompt;
if (isReplyMode) {
systemPrompt='あなたはLINE返信文案を作る専門アシスタントです。ユーザーが「お客様メッセージ」と「伝えたいこと」を入力→丁寧・自然な返信文を作成。\n【ルール】返信文のみ出力（説明不要）/敬語は丁寧すぎず寄り添うトーン/LINE的改行/絵文字1〜2個/修正依頼対応/ツール不使用\n現在の日時: '+getJSTNow();
} else {
var _rules=[
'Google系の質問は必ずツールを使って回答。推測禁止',
'翻訳・文章校正・計算はツールなしで直接対応',
'情報を尋ねる質問は必ず対応ツールを実行してから答える',
'前の会話を踏まえて行動',
'削除・変更は対象を確認してから実行。ただし追加は確認なしで即実行',
'【絶対厳守】メモ・タスク・予定・リマインダーの操作は必ずツール実行。ツールなしで「保存しました」等は絶対禁止。失敗時はエラーを伝える',
'「メモ」で始まるメッセージはmemo_addで保存',
'曖昧な指示は文脈から意図を推測して実行',
'過去の日付に予定追加→「過去の日付ですが追加しますか？」と確認',
'深夜0時前後は「明日」の解釈に注意。現在日時を確認して正しい日付を使う',
'「毎朝〇時に教えて」→briefing_setting。「〇時に教えて」→reminder_add。外部サービスを勧めない',
'「毎週月曜に○○」→repeat=weekly,datetime=次の月曜。「毎月1日に○○」→repeat=monthly。「毎日○時に○○」→repeat=daily',
'ツール結果の[SUGGESTION]に従い提案。タグ自体は非表示',
'【重要】設定された口調を維持。ユーザーが明示しない限り変えない'];
systemPrompt=basePrompt+'\n・'+_rules.join('\n・')+announceTxt+'\n・現在の日時: '+getJSTNow();
}
try{if(cs&&cs.omoiyari_rules){var oR=cs.omoiyari_rules,oM={no_negative:'否定語を使わず肯定的表現',read_between_lines:'行間を読み先回りで情報提供',offer_choices:'曖昧な質問に選択肢提示',warm_words:'温かみのある表現を使う',honest_handoff:'わからないことは正直に伝え次のアクション提示',positive_reframe:'ネガティブをポジティブに言換え',open_door:'最後に「いつでも聞いて」を添える'},oRl=[];
for(var ok in oM)if(oR[ok])oRl.push(oM[ok]);if(oRl.length>0)systemPrompt+='\n\n【応答スタイル】\n・'+oRl.join('\n・');}}catch(e){}
var lastMsg='';for(var hi=history.length-1;hi>=0;hi--)if(history[hi].role==='user'&&typeof history[hi].content==='string'){lastMsg=history[hi].content;break;}
var selTools=isReplyMode?[]:selectTools(lastMsg);
if(selTools.length>0)selTools[selTools.length-1].cache_control={type:'ephemeral'};
var _co=!isReplyMode&&/^(おはよう|こんにちは|こんばんは|ありがとう|ありがと|おやすみ|お疲れ|了解|OK|ok|はい|うん|わかった|なるほど|すごい|いいね|ヘルプ|何ができる|使い方|こんにちわ|よろしく|お願い|大丈夫|わかりました|あ|m|テスト|。|笑|w+|草)$/i.test(lastMsg.trim().replace(/[！!？?。、\s]+$/g,''));
var _mdl=_co?_HAIKU_MODEL:(jobType==='care_manager'?selectModel(lastMsg):'claude-sonnet-4-5');
var _mtk=_co?300:(jobType==='care_manager'?selectMaxTokens(lastMsg):800);
var payload={model:_mdl,max_tokens:_mtk,system:[{type:'text',text:systemPrompt,cache_control:{type:'ephemeral'}}],tools:_co?[]:selTools,messages:history};
try{var res=UrlFetchApp.fetch(_ANTHROPIC_URL,{method:'post',contentType:'application/json',headers:{'x-api-key':apiKey,'anthropic-version':_ANTHROPIC_VER,'anthropic-beta':'prompt-caching-2024-07-31'},payload:JSON.stringify(payload),muteHttpExceptions:true});
var raw=res.getContentText(),hc=res.getResponseCode();if(raw.charAt(0)==='<')return{_credit_error:true};
var r=JSON.parse(raw);if(r.error){var et=r.error.type||'',em=r.error.message||'';if(et==='billing_error'||em.indexOf('credit')!==-1||em.indexOf('balance')!==-1||et==='insufficient_quota')return{_credit_error:true};return{_api_error:true,_err_type:et,_err_msg:em,_http_code:hc};}return r;
}catch(err){return{_api_error:true,_err_type:'exception',_err_msg:String(err),_http_code:0};}
}
function _T(n,d,p,r){return{name:n,description:d,input_schema:{type:'object',properties:p||{},required:r||[]}};}
function _S(d){return{type:'string',description:d};}
function _N(d){return{type:'number',description:d};}
function _B(d){return{type:'boolean',description:d};}
function _E(d,e){return{type:'string',description:d,enum:e};}
function _G(){return{
gmail:['gmail_check','gmail_send'],calendar:['calendar_view','calendar_add','calendar_delete','calendar_edit'],
docs:['docs_create','docs_read','docs_write','docs_delete'],sheets:['sheets_create','sheets_read','sheets_delete','sheets_write'],
drive:['drive_folder_create','drive_file_list','drive_file_delete','drive_file_move','drive_file_rename','drive_file_search'],
memo:['memo_add','memo_view','memo_delete'],task:['task_add','task_view','task_done','task_undone','task_delete','task_restore'],
reminder:['reminder_add','reminder_view','reminder_delete','birthday_reminder'],briefing:['briefing_setting'],
tone:['set_tone'],search:['web_search'],weather:['weather'],route:['route_search','hotel_search'],
url:['url_summarize'],photo:['drive_file_search'],report:['report_generate'],company:['company'],smart:['smart_search']};}
function getToolDefinitions() {
var s=_S,n=_N,b=_B,e=_E;
return [
_T('gmail_check','未読メール確認',{count:n('件数(デフォルト5)')}),
_T('gmail_send','メール送信',{to_email:s('宛先メール'),to_name:s('宛先名'),subject:s('件名'),body:s('本文')},['subject','body']),
_T('calendar_view','予定確認',{range:s('today/tomorrow/week'),date_from:s('開始日'),date_to:s('終了日'),find_free:b('空き時間')},['range']),
_T('calendar_add','予定追加。recurrence:daily/weekly/monthly/weekdays',{title:s('タイトル'),start:s('開始datetime'),end:s('終了datetime'),location:s('場所'),description:s('詳細'),all_day:b('終日'),recurrence:s('繰返し')},['title','start']),
_T('calendar_delete','予定削除。複数時はindex指定',{keyword:s('KW'),date:s('日付'),range_days:n('検索範囲'),time_hint:s('時刻'),index:n('番号')},['keyword']),
_T('calendar_edit','予定変更',{keyword:s('KW'),search_date:s('検索日'),new_title:s('新タイトル'),new_start:s('新開始'),new_end:s('新終了'),new_location:s('新場所')},['keyword']),
_T('sheets_create','スプシ作成',{title:s('タイトル'),headers:{type:'array',items:{type:'string'},description:'列名'}},['title','headers']),
_T('docs_create','ドキュメント作成',{title:s('タイトル'),content:s('初期内容')},['title']),
_T('memo_add','メモ保存',{content:s('内容'),tag:s('タグ')},['content']),
_T('memo_view','メモ一覧',{limit:n('取得件数')}),
_T('memo_delete','メモ削除',{keyword:s('キーワードまたは番号')},['keyword']),
_T('reminder_add','リマインダー設定。毎週→repeat=weekly,毎月→monthly,毎日→daily',{content:s('内容'),datetime:s('日時'),repeat:e('繰返し',['none','daily','weekly','monthly','monthly_weekday']),nth_week:n('第N週'),weekday:n('曜日0-6')},['content','datetime']),
_T('reminder_view','リマインダー一覧',{}),
_T('reminder_delete','リマインダー削除',{keyword:s('キーワード')},['keyword']),
_T('task_add','タスク追加',{task:s('内容'),due:s('期限date'),priority:e('優先度',['高','中','低'])},['task']),
_T('task_view','タスク一覧',{show_done:b('完了済み表示')}),
_T('task_done','タスク完了',{keyword:s('キーワード')},['keyword']),
_T('task_undone','タスク未完了に戻す',{keyword:s('KW')},['keyword']),
_T('task_delete','タスク削除',{keyword:s('キーワード')},['keyword']),
_T('task_restore','削除済みタスク復元',{keyword:s('KW')},['keyword']),
_T('set_tone','口調設定。ユーザーが明示的に要望した場合のみ',{tone:s('口調')},['tone']),
_T('web_search','情報を検索',{query:s('クエリ')},['query']),
_T('briefing_setting','ブリーフィング設定。news_topicでニュース配信',{action:e('start/stop',['start','stop']),hour:n('時刻'),news_topic:s('ニュースKW。停止はoff')},['action']),
_T('weather','天気取得',{city:s('都市名')},['city']),
_T('drive_folder_create','フォルダ作成',{name:s('フォルダ名'),parent:s('親フォルダ名')},['name']),
_T('drive_file_list','ファイル一覧',{folder:s('フォルダ名'),keyword:s('キーワード')}),
_T('drive_file_delete','ファイル削除。confirm=false→一覧,true→実行',{keyword:s('KW'),folder:s('フォルダ'),confirm:b('実行')},['keyword']),
_T('drive_file_move','ファイル移動',{keyword:s('ファイルキーワード'),to_folder:s('移動先フォルダ')},['keyword','to_folder']),
_T('drive_file_rename','ファイル名変更',{keyword:s('ファイルキーワード'),new_name:s('新しい名前')},['keyword','new_name']),
_T('drive_file_search','ファイル検索',{keyword:s('キーワード')},['keyword']),
_T('route_search','経路検索',{from:s('出発地'),to:s('目的地'),mode:e('移動手段',['transit','driving','walking','bicycling']),depart:s('出発時刻')},['from','to']),
_T('docs_read','ドキュメント読取。URLからdoc_idを抽出して指定可。full_read=trueで最大4000文字',{keyword:s('ドキュメント名キーワード'),doc_id:s('ドキュメントID（URLのd/の後ろ）'),full_read:b('全文読取')}),
_T('docs_write','既存ドキュメントに書込・上書き。議事録整形結果の書き戻し等に使用',{keyword:s('ドキュメント名KW'),doc_id:s('ドキュメントID'),content:s('書込む内容（markdown対応）'),mode:e('モード',['append','replace'])},['content']),
_T('docs_delete','ドキュメント削除。confirm=false→確認,true→実行',{keyword:s('KW'),confirm:b('実行')},['keyword']),
_T('sheets_write','スプシ書込',{keyword:s('KW'),sheet_name:s('シート名'),mode:e('モード',['append','update','clear_and_write']),rows:{type:'array',items:{type:'array'},description:'行'},headers:{type:'array',items:{type:'string'},description:'列名'},updates:{type:'array',items:{type:'object'},description:'[{row,col,value}]'}},['keyword','mode']),
_T('sheets_read','スプシ読取',{keyword:s('KW'),sheet_name:s('シート名'),max_rows:n('最大行')},['keyword']),
_T('sheets_delete','スプシ削除。confirm=false→確認,true→実行',{keyword:s('KW'),confirm:b('実行')},['keyword']),
_T('url_summarize','URL要約',{url:s('URL')},['url']),
_T('birthday_reminder','誕生日リマインダー',{name:s('名前'),birthday:s('誕生日MM-DD'),hour:n('通知時刻')},['name','birthday']),
_T('report_generate','レポート生成',{type:e('種類',['weekly','monthly'])},['type']),
_T('smart_search','横断検索',{keyword:s('KW'),range_days:n('日数')},['keyword']),
_T('hotel_search','ホテル検索',{area:s('エリア'),checkin:s('CI date'),checkout:s('CO date'),guests:n('人数'),keyword:s('条件')},['area']),
_T('company','部署メモ管理',{action:e('操作',['view','status']),dept:s('部署名')},['action'])
];
}
function selectTools(message) {
var all=getToolDefinitions(),msg=message.toLowerCase(),groups=_G();
var keywords={
gmail:'メール,gmail,mail,受信,送信,添付,返信,件名',
calendar:'予定,カレンダー,スケジュール,会議,mtg,打ち合わせ,今日,明日,今週,来週,来月,空き,calendar,アポ,面談,面接,シフト,繰り返し',
docs:'ドキュメント,ドキュ,文書,議事録,報告書,手順書,docs.google.com,まとめて,整形,書き戻し',
sheets:'スプレッドシート,スプシ,表,シート,spreadsheet',
drive:'ドライブ,フォルダ,ファイル,移動,削除,検索,名前,drive,さんの,書類,資料',
memo:'メモ,覚え,記録,めも,memo,ノート',
task:'タスク,やること,todo,完了,締め切り,未完了,戻して,復元,元に戻,task,たすく,期限',
reminder:'リマインダー,通知,リマインド,誕生日,毎日,毎週,毎月,毎年,第,reminder',
briefing:'ブリーフィング,朝のスケジュール,朝の予定,毎朝,朝に,予定を教えて,タスクを教えて,定期的に教えて,ニュース',
search:'調べ,検索,最新,ニュース,情報',
weather:'天気,気温,雨,晴れ,曇り,予報',
route:'経路,乗換,バス,電車,ホテル,宿,行き方',
url:'http,https,url,要約,まとめ',
photo:'写真,画像,フォト',
report:'レポート,週次,月次',
tone:'口調,トーン,話し方,可愛,タメ口,ため口,敬語,フレンドリー,ビジネス口調,キャラ,喋り方',
company:'部署,カンパニー,事業,秘書室,line事業,投稿案,介護ブログ,学校コンサル,hp運用,部門,会社,my-company',
smart:'探して,検索して,何か書いた,何書いた,どこかに,見つけて,先週の,先月の,前に,書いたやつ,記録した'
};
var needed = {};
for (var group in keywords) {
var kws = keywords[group].split(',');
for (var ki = 0; ki < kws.length; ki++) {
if (msg.indexOf(kws[ki]) !== -1) {
var toolNames = groups[group];
for (var ti = 0; ti < toolNames.length; ti++) needed[toolNames[ti]] = true;
break;
}
}
}
var AI='calendar_view,calendar_add,calendar_delete,calendar_edit,task_add,task_view,task_done,task_undone,task_delete,task_restore,memo_add,memo_view,memo_delete,reminder_add,reminder_view,reminder_delete,briefing_setting,smart_search'.split(','),AIM={};
for(var ai=0;ai<AI.length;ai++){needed[AI[ai]]=true;AIM[AI[ai]]=1;}
if(Object.keys(needed).length>0)return all.filter(function(t){return needed[t.name];});
if(/[？?]|教えて|って何|とは|知りたい/.test(msg))return all.filter(function(t){return needed[t.name]||t.name==='web_search';});
return all.filter(function(t){return AIM[t.name];});
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
var _TOOL_MAP={set_tone:toolSetTone,company:toolCompany,gmail_check:toolGmailCheck,gmail_send:toolGmailSend,calendar_view:toolCalView,calendar_add:toolCalAdd,calendar_delete:toolCalDelete,calendar_edit:toolCalEdit,sheets_create:toolSheetsCreate,docs_create:toolDocsCreate,memo_add:toolMemoAdd,memo_view:toolMemoView,memo_delete:toolMemoDelete,reminder_add:toolReminderAdd,reminder_view:toolReminderView,reminder_delete:toolReminderDelete,task_add:toolTaskAdd,task_view:toolTaskView,task_done:toolTaskDone,task_undone:toolTaskUndone,task_delete:toolTaskDelete,task_restore:toolTaskRestore,web_search:toolWebSearch,briefing_setting:toolBriefingSetting,weather:toolWeather,drive_folder_create:function(i,u){if(u!==_KISHI_UID)return'フォルダ作成は現在制限されています';return toolDriveFolderCreate(i);},drive_file_list:toolDriveFileList,drive_file_delete:toolDriveFileDelete,drive_file_move:toolDriveFileMove,drive_file_rename:toolDriveFileRename,drive_file_search:toolDriveFileSearch,route_search:toolRouteSearch,hotel_search:toolHotelSearch,docs_read:toolDocsRead,docs_write:toolDocsWrite,docs_delete:toolDocsDelete,sheets_read:toolSheetsRead,sheets_write:toolSheetsWrite,sheets_delete:toolSheetsDelete,url_summarize:toolUrlSummarize,birthday_reminder:toolBirthdayReminder,report_generate:toolReportGenerate,smart_search:toolSmartSearch};
function executeTool(name, input, uid) {
try {
var fn=_TOOL_MAP[name];
if(!fn)return'ツール「'+name+'」が見つかりません';
return fn(input,uid);
} catch (err) {
return 'ツールの実行中にエラーが発生しました。もう一度お試しください。';
}
}
function toolGmailCheck(input) {
var threads=GmailApp.search('is:unread in:inbox',0,input.count||3);
if(!threads.length)return'未読メールはありません';
var lines=['未読メール '+threads.length+'件:'];
for(var i=0;i<threads.length;i++){var msg=threads[i].getMessages()[0],line=(i+1)+'. ['+fmtDate(msg.getDate(),'M/d HH:mm')+'] '+msg.getFrom().replace(/<.*?>/g,'').trim()+' / '+(msg.getSubject()||'件名なし');
var att=msg.getAttachments();if(att&&att.length>0){var urls=[];for(var ai=0;ai<att.length;ai++){try{var f=DriveApp.createFile(att[ai]);f.setSharing(DriveApp.Access.ANYONE_WITH_LINK,DriveApp.Permission.VIEW);urls.push('📎 '+att[ai].getName()+' → '+f.getUrl());}catch(e){urls.push('📎 '+att[ai].getName()+'（保存失敗）');}}line+='\n '+urls.join('\n ');}lines.push(line);}
lines.push('\n[SUGGESTION]日時/締切/会議→カレンダー/タスク追加提案。返信必要→返信作成提案。該当なければ不要。');
return lines.join('\n');
}
function toolGmailSend(input) {
if(!input.to_email)return'メールアドレスが指定されていません';
GmailApp.sendEmail(input.to_email,input.subject,input.body);
return'メール送信完了: '+(input.to_name||input.to_email)+' 宛 / 件名: '+input.subject;
}
function toolCalView(input) {
var today = getJSTDate(0);
var y=today.getFullYear(),m=today.getMonth(),d=today.getDate();
var start, end, label;
if (input.range === 'today') {
start=new Date(y,m,d,0,0,0);end=new Date(y,m,d,23,59,59);label='今日';
} else if (input.range === 'tomorrow') {
start=new Date(y,m,d+1,0,0,0);end=new Date(y,m,d+1,23,59,59);label='明日';
} else if (input.range === 'custom' && input.date_from && input.date_to) {
start=new Date(input.date_from+'T00:00:00+09:00');end=new Date(input.date_to+'T23:59:59+09:00');label=fmtDate(start,'M/d')+'〜'+fmtDate(end,'M/d');
} else {
start=new Date(y,m,d,0,0,0);end=new Date(y,m,d+7,23,59,59);label='今週';
}
var events = _searchCals(start, end);
events.sort(function(a, b) { return a.getStartTime() - b.getStartTime(); });
if(input.find_free)return findFreeDays(start,end,events,label);
if(!events.length)return label+'の予定はありません';
var lines=[label+'の予定 '+events.length+'件:'],ld='';
for(var i=0;i<events.length;i++){var ev=events[i],ds=fmtDate(ev.getStartTime(),'M/d(E)'),loc=ev.getLocation()?' @'+ev.getLocation():'';if(ds!==ld){lines.push('');lines.push('【'+ds+'】');ld=ds;}lines.push(' '+fmtDate(ev.getStartTime(),'HH:mm')+' '+ev.getTitle()+loc);}
return lines.join('\n');
}
function findFreeDays(start,end,events,label) {
var slots={},cur=new Date(start);
while(cur<=end){var dow=cur.getDay();if(dow!==0&&dow!==6){var dk=fmtDate(cur,'yyyy-MM-dd');slots[dk]=[];for(var h=9;h<18;h++)for(var mm=0;mm<60;mm+=30)slots[dk].push({h:h,m:mm,busy:false});}cur.setDate(cur.getDate()+1);}
for(var i=0;i<events.length;i++){var ev=events[i],es=ev.getStartTime(),ee=ev.getEndTime();if(ev.isAllDayEvent())continue;
var ec=new Date(es);while(ec<ee){var dk2=fmtDate(ec,'yyyy-MM-dd'),sl=slots[dk2];if(sl){var eh=ec.getHours(),em2=ec.getMinutes(),si=((eh-9)*2)+(em2>=30?1:0);if(si>=0&&si<sl.length)sl[si].busy=true;}ec=new Date(ec.getTime()+1800000);}}
var lines=[label+'の空き時間（30分単位）:'],hasAny=false;
for(var dk3 in slots){var sl2=slots[dk3],dayFree=[];
for(var j=0;j<sl2.length;j++){if(!sl2[j].busy){var sh=sl2[j].h,sm=sl2[j].m,ts=('0'+sh).slice(-2)+':'+('0'+sm).slice(-2),em3=sm+30,nh=sh;if(em3>=60){em3=0;nh=sh+1;}var te=('0'+nh).slice(-2)+':'+('0'+em3).slice(-2);dayFree.push(ts+'〜'+te);}}
if(dayFree.length>0){hasAny=true;var merged=[],ps=dayFree[0].split('〜')[0],pe=dayFree[0].split('〜')[1];
for(var k=1;k<dayFree.length;k++){var cs2=dayFree[k].split('〜');if(cs2[0]===pe)pe=cs2[1];else{merged.push(ps+'〜'+pe);ps=cs2[0];pe=cs2[1];}}merged.push(ps+'〜'+pe);
lines.push('【'+fmtDate(new Date(dk3+'T00:00:00+09:00'),'M/d(E)')+'】'+merged.join('、'));}}
if(!hasAny)return label+'の平日に空き時間（9〜18時）はありません。';
return lines.join('\n');
}
function toolCalAdd(input) {
function toJ(s){return(s.indexOf('+')===-1&&s.indexOf('Z')===-1)?s+'+09:00':s;}
var s=new Date(toJ(input.start)),e=input.end?new Date(toJ(input.end)):new Date(s.getTime()+3600000);
var cal=CalendarApp.getDefaultCalendar(),ev,loc=input.location||'',desc=input.description||'';
if(input.all_day)ev=cal.createAllDayEvent(input.title,s);
else ev=cal.createEvent(input.title,s,e,{location:loc,description:desc});
if(input.recurrence&&ev){try{var rec=input.recurrence,rule;
if(rec==='daily')rule=CalendarApp.newRecurrence().addDailyRule();
else if(rec==='weekly')rule=CalendarApp.newRecurrence().addWeeklyRule();
else if(rec==='monthly')rule=CalendarApp.newRecurrence().addMonthlyRule();
else if(rec==='weekdays')rule=CalendarApp.newRecurrence().addWeeklyRule().onlyOnWeekdays([CalendarApp.Weekday.MONDAY,CalendarApp.Weekday.TUESDAY,CalendarApp.Weekday.WEDNESDAY,CalendarApp.Weekday.THURSDAY,CalendarApp.Weekday.FRIDAY]);
if(rule){ev.deleteEvent();if(input.all_day)ev=cal.createAllDayEventSeries(input.title,s,rule);else ev=cal.createEventSeries(input.title,s,e,rule,{location:loc,description:desc});}}catch(re){}}
var r='追加完了: '+input.title+' / '+fmtDate(s,'M月d日(E) HH:mm')+(input.end?'〜'+fmtDate(e,'HH:mm'):'')+(input.recurrence?' [繰り返し:'+input.recurrence+']':'');
try{if(!input.all_day){var ex=cal.getEvents(s,e),cf=[];for(var ci=0;ci<ex.length;ci++)if(ex[ci].getTitle()!==input.title)cf.push(ex[ci].getTitle()+'('+fmtDate(ex[ci].getStartTime(),'HH:mm')+')');if(cf.length>0)r+='\n⚠️ 同じ時間帯に既存の予定があります: '+cf.join(', ');}}catch(e2){}
return r;
}
function _evList(matched){return matched.map(function(ev,i){return(i+1)+'. '+fmtDate(ev.getStartTime(),'M/d(E) HH:mm')+' '+ev.getTitle();}).join('\n');}
function toolCalDelete(input) {
var start=input.date?new Date(input.date+'T00:00:00+09:00'):getJSTDate(0),days=input.range_days||14;
var matched=_searchCals(start,new Date(start.getTime()+days*86400000),input.keyword);
if(!matched.length)return _notFound(input.keyword,'予定')+'（検索範囲: '+days+'日間）\n※予定のタイトルの一部をキーワードにして再度お試しください';
if(matched.length>1&&input.time_hint){var h=parseInt(input.time_hint,10),fl=matched.filter(function(ev){return parseInt(Utilities.formatDate(ev.getStartTime(),'Asia/Tokyo','H'),10)===h;});if(fl.length>0)matched=fl;}
if(input.index&&input.index>=1&&input.index<=matched.length)matched=[matched[input.index-1]];
if(matched.length>1)return'複数見つかりました。どれを削除しますか？\n'+_evList(matched)+'\n\n番号で指定してください。';
var t=matched[0].getTitle(),dt=fmtDate(matched[0].getStartTime(),'M月d日(E) HH:mm');
try{matched[0].deleteEvent();return'✅ 削除完了: '+t+' ('+dt+')';}catch(e){return'❌ 削除できませんでした: '+t+' ('+dt+')\n編集権限がない共有カレンダーの予定の可能性があります。';}
}
function toolCalEdit(input) {
var start=input.search_date?new Date(input.search_date+'T00:00:00+09:00'):getJSTDate(0);
var matched=_searchCals(start,new Date(start.getTime()+14*86400000),input.keyword);
if(!matched.length)return _notFound(input.keyword,'予定');
if(input.index&&input.index>=1&&input.index<=matched.length)matched=[matched[input.index-1]];
if(matched.length>1)return'複数見つかりました。どれを変更しますか？番号で指定してください。\n'+_evList(matched);
var ev=matched[0],oS=ev.getStartTime(),dur=ev.getEndTime().getTime()-oS.getTime();
if(input.new_title)ev.setTitle(input.new_title);
if(input.new_location)ev.setLocation(input.new_location);
if(input.new_start){var ns=new Date(input.new_start);if(isNaN(ns.getTime()))return'日時の形式が正しくありません: '+input.new_start;
if(ns.getFullYear()<2000){ns=new Date(oS);var tp=input.new_start.match(/(\d{1,2}):(\d{2})/);if(tp)ns.setHours(parseInt(tp[1]),parseInt(tp[2]),0,0);}
var ne=input.new_end?new Date(input.new_end):new Date(ns.getTime()+dur);
try{ev.setTime(ns,ne);}catch(se){return'変更に失敗しました。編集権限がない可能性: '+ev.getTitle();}
return'変更完了: '+ev.getTitle()+' / '+fmtDate(ev.getStartTime(),'M月d日(E) HH:mm')+'〜'+fmtDate(ev.getEndTime(),'HH:mm');}
return'変更完了: '+ev.getTitle()+' / '+fmtDate(ev.getStartTime(),'M月d日(E) HH:mm')+'〜'+fmtDate(ev.getEndTime(),'HH:mm');
}
function _setHeader(sheet,headers){if(!headers||!headers.length)return;var r=sheet.getRange(1,1,1,headers.length);r.setValues([headers]);r.setBackground('#1D9E75');r.setFontColor('#FFFFFF');r.setFontWeight('bold');}
function toolSheetsCreate(input) {
var ss=SpreadsheetApp.create(input.title),sheet=ss.getActiveSheet();sheet.setName('シート1');
if(input.headers&&input.headers.length>0){_setHeader(sheet,input.headers);sheet.setFrozenRows(1);sheet.autoResizeColumns(1,input.headers.length);}
return'✅ '+input.title+'\n'+ss.getUrl();
}
function _docBody(body,content){if(!content)return;var lines=content.split('\n');for(var i=0;i<lines.length;i++){var l=lines[i];if(!l.trim()){body.appendParagraph('');continue;}if(l.indexOf('## ')===0)body.appendParagraph(l.slice(3)).setHeading(DocumentApp.ParagraphHeading.HEADING2);else if(l.indexOf('# ')===0)body.appendParagraph(l.slice(2)).setHeading(DocumentApp.ParagraphHeading.HEADING1);else if(l.indexOf('- ')===0||l.indexOf('・')===0)body.appendListItem(l.replace(/^[-・]\s*/,''));else body.appendParagraph(l);}}
function toolDocsCreate(input) {
var t=input.title||'ドキュメント',doc=DocumentApp.create(t);
_docBody(doc.getBody(),input.content||'');doc.saveAndClose();
return'作成完了: '+t+'\nURL: https://docs.google.com/document/d/'+doc.getId()+'/edit';
}
function toolMemoAdd(input, uid) {
var ct=(input.content||'').replace(/[\u3000]/g,' ').trim();if(!ct)return'メモの内容が指定されていません。何を保存しますか？';
var sheet=getDataSheet('メモ');_ensureHeaders(sheet,_MEMO_HEADERS);var tag=input.tag||'';
sheet.appendRow([Date.now()+'',getJSTNow(),tag,ct]);
try{if(uid===_KISHI_UID){var cat=tag;if(!cat||_DEPTS.indexOf(cat)===-1){var c=getConfig();if(c.ANTHROPIC_KEY)cat=_haikuAsk(c.ANTHROPIC_KEY,'分類:'+_DEPTS_STR+'\nメモ:'+ct+'\nカテゴリ名のみ',15);}if(cat&&_DEPTS.indexOf(cat)!==-1){_getOrCreateSub(DriveApp.getFolderById(_COMPANY_FOLDER_ID),cat).createFile(_F(new Date(),'yyyyMMdd_HHmm')+'_memo.txt','【'+cat+'】\n'+_F(new Date(),'yyyy-MM-dd HH:mm')+'\n\n'+ct,MimeType.PLAIN_TEXT);if(!tag){sheet.getRange(sheet.getLastRow(),3).setValue(cat);tag=cat;}}}}catch(e){}
return'保存完了: '+ct+(tag?' ['+tag+']':'')+'\n[SUGGESTION]アクション含む場合→タスク追加提案。該当なければ不要。';
}
function toolMemoView(input) {
var sheet=getDataSheet('メモ');if(sheet.getLastRow()<=1)return'メモはまだありません';
var data=sheet.getDataRange().getValues(),lim=input.limit||10,items=[];
for(var i=1;i<data.length;i++)if(data[i][2]!=='DELETED')items.push({c:data[i][3],t:data[i][2],d:data[i][1]});
if(!items.length)return'メモはまだありません';
var lines=['メモ一覧 '+items.length+'件:'],st=Math.max(0,items.length-lim);
for(var j=st;j<items.length;j++)lines.push((j+1)+'. '+items[j].c+(items[j].t?' ['+items[j].t+']':'')+' ('+items[j].d+')');
return lines.join('\n');
}
function toolMemoDelete(input) {
var sheet=getDataSheet('メモ');if(sheet.getLastRow()<=1)return'削除するメモがありません';
var data=sheet.getDataRange().getValues(),ai=[];
for(var mi=1;mi<data.length;mi++)if(data[mi][2]!=='DELETED')ai.push({row:mi,c:data[mi][3]});
var kws=String(input.keyword).split(/[,、，\s]+/),del=[];
for(var k=0;k<kws.length;k++){var kw=kws[k].trim();if(!kw)continue;
var n=parseInt(kw);if(!isNaN(n)&&n>=1&&n<=ai.length){sheet.getRange(ai[n-1].row+1,3).setValue('DELETED');del.push(ai[n-1].c);ai.splice(n-1,1);continue;}
for(var i=ai.length-1;i>=0;i--)if(ai[i].c.indexOf(kw)!==-1){sheet.getRange(ai[i].row+1,3).setValue('DELETED');del.push(ai[i].c);ai.splice(i,1);break;}}
if(!del.length)return _notFound(input.keyword,'メモ');return'削除完了: '+del.join(', ');
}
function toolReminderAdd(input) {
var sheet=getDataSheet('リマインダー');_ensureHeaders(sheet,_REM_HEADERS);
if(sheet.getLastRow()>0&&sheet.getLastColumn()<6)sheet.getRange(1,6).setValue('繰り返し');
var id=Date.now()+'',repeat=input.repeat||'none';
if(repeat==='monthly_weekday')repeat='monthly_weekday_'+(input.nth_week||1)+'_'+(input.weekday!==undefined?input.weekday:6);
var ds=input.datetime;if(/^\d{4}-\d{2}-\d{2}$/.test(ds))ds+='T00:00:00';
if(ds.indexOf('+')===-1&&ds.indexOf('Z')===-1)ds+='+09:00';
var ep=new Date(ds).getTime();if(isNaN(ep))ep=new Date(input.datetime).getTime();
if(isNaN(ep))return'❌ 日時の形式が正しくありません: '+input.datetime+'\n例: 2025-12-25T09:00 または 2025-12-25';
sheet.appendRow([id,getJSTNow(),ep,input.content,'FALSE',repeat]);
var fdt=Utilities.formatDate(new Date(ep),'Asia/Tokyo','M月d日(E) HH:mm');
var rl={'none':'1回のみ','daily':'毎日','weekly':'毎週','monthly':'毎月'};
return'設定完了: '+input.content+' / '+fdt+'に通知 / '+(rl[repeat]||getMonthlyWeekdayLabel(repeat)||'1回のみ');
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
var sheet=getDataSheet('リマインダー');if(sheet.getLastRow()<=1)return'リマインダーは設定されていません';
var data=sheet.getDataRange().getValues(),lines=[],rd={'daily':'毎日','weekly':'毎週','monthly':'毎月'};
for(var i=1;i<data.length;i++){
if(data[i][4]==='TRUE'||data[i][4]===true||data[i][4]==='DELETED')continue;
var dt=_parseRawDt(data[i][2]),ds=dt?Utilities.formatDate(dt,'Asia/Tokyo','M/d(E) HH:mm'):'不明';
var rv=data[i][5]?String(data[i][5]):'',rep=rd[rv]||getMonthlyWeekdayLabel(rv)||'';
lines.push((lines.length+1)+'. '+data[i][3]+' / '+ds+(rep?' ['+rep+']':''));}
if(!lines.length)return'未送信のリマインダーはありません';
return'リマインダー '+lines.length+'件:\n'+lines.join('\n');
}
function toolReminderDelete(input) {
var sheet=getDataSheet('リマインダー');if(sheet.getLastRow()<=1)return'削除するリマインダーがありません';
var data=sheet.getDataRange().getValues(),kws=String(input.keyword).split(/[,、，\s]+/),deleted=[];
for(var k=0;k<kws.length;k++){var kw=kws[k].trim();if(!kw)continue;
for(var i=data.length-1;i>=1;i--){if(data[i][4]==='DELETED')continue;
if(data[i][3].indexOf(kw)!==-1||String(i)===kw){sheet.getRange(i+1,5).setValue('DELETED');deleted.push(data[i][3]);data[i][4]='DELETED';break;}}}
if(!deleted.length)return _notFound(input.keyword,'リマインダー');return'削除完了: '+deleted.join(', ');
}
function checkReminders() {
var config=getConfig();if(!config.LINE_TOKEN||!config.USER_ID)return;
if(_P().getProperty('DEMO_MODE')==='TRUE'&&parseInt(_P().getProperty('demo_count_'+config.USER_ID)||'0')>=10)return;
var sheet=getDataSheet('リマインダー'),lr=sheet.getLastRow();if(lr<=1)return;
var data=sheet.getRange(1,1,lr,6).getValues(),nowEp=Date.now();
for(var i=1;i<data.length;i++){
if(data[i][4]==='TRUE'||data[i][4]===true||data[i][4]==='DELETED')continue;
var ra;try{ra=_parseRawDt(data[i][2]);}catch(e){continue;}if(!ra||isNaN(ra.getTime())||ra.getTime()>nowEp)continue;
var cd=sheet.getDataRange().getValues(),se=false;for(var ci=1;ci<cd.length;ci++)if(String(cd[ci][0])===String(data[i][0])&&cd[ci][4]!=='TRUE'&&cd[ci][4]!==true){se=true;break;}if(!se)continue;
var msg='⏰ リマインダー\n'+Utilities.formatDate(ra,'Asia/Tokyo','M月d日(E) HH:mm')+'\n\n'+data[i][3];
try{var rt=getTone(config.USER_ID);if(rt&&rt!=='丁寧'&&rt!=='1'&&config.ANTHROPIC_KEY){var r=_haikuAsk(config.ANTHROPIC_KEY,'リマインダー通知を「'+rt+'」の口調に変換。情報そのまま。\n\n'+msg,200);if(r)msg=r;}}catch(e){}
pushToLine(config.USER_ID,msg);
var rep=data[i][5]||'none';
if(rep==='none'){sheet.getRange(i+1,5).setValue('TRUE');}else{var nd=new Date(ra);
if(rep==='daily')nd.setDate(nd.getDate()+1);if(rep==='weekly')nd.setDate(nd.getDate()+7);if(rep==='monthly')nd.setMonth(nd.getMonth()+1);
if(rep==='yearly'){var js=Utilities.formatDate(ra,'Asia/Tokyo',"yyyy-MM-dd'T'HH:mm:ss'+09:00'");nd=new Date((parseInt(js.slice(0,4),10)+1)+js.slice(4));}
if(rep.indexOf('monthly_weekday_')===0){var pts=rep.split('_');nd=getNextMonthlyWeekday(ra,parseInt(pts[2]),parseInt(pts[3]));}
sheet.getRange(i+1,3).setValue(nd.getTime());sheet.getRange(i+1,5).setValue('FALSE');}}
try{var nh=parseInt(_F(new Date(),'HH'),10);if(nh===9){var props=_P(),tk='overdue_checked_'+_F(new Date(),'yyyyMMdd');if(!props.getProperty(tk)){props.setProperty(tk,'true');
var ts=getDataSheet('タスク');if(ts.getLastRow()>1){var td=ts.getDataRange().getValues(),tds=_F(new Date(),'yyyy-MM-dd'),od=[];
for(var oi=1;oi<td.length;oi++){if(td[oi][5]==='完了'||td[oi][5]==='削除済み')continue;var dv=String(td[oi][2]||'').trim();if(!dv)continue;var dd=dv.length>=10?dv.substring(0,10):dv;if(dd<tds)od.push(td[oi][4]+'（期限: '+dd+'）');}
if(od.length>0)pushToLine(config.USER_ID,'⚠️ 期限切れタスク:\n\n'+od.map(function(t,i){return(i+1)+'. '+t;}).join('\n')+'\n\n完了 or 期限変更してください🙏');}}}}catch(e){}
try{if(_P().getProperty('FOLLOWUP_'+config.USER_ID)==='TRUE'){var nFU=new Date(),fuEvts=CalendarApp.getDefaultCalendar().getEvents(new Date(nFU.getTime()-7200000),new Date(nFU.getTime()-3600000)),fc=CacheService.getScriptCache();
for(var fi=0;fi<fuEvts.length;fi++){var fk='fu_'+fuEvts[fi].getId();if(fc.get(fk))continue;var ft=fuEvts[fi].getTitle();if(ft.indexOf('📋')===0)continue;fc.put(fk,'1',86400);pushToLine(config.USER_ID,'📝 「'+ft+'」が終了しました。\n\n議事録やメモを残しますか？\n→「'+ft+'のメモ: ○○」と送るだけでOK！');break;}}}catch(e){}
}
function toolSmartSearch(input) {
var kw=input.keyword,days=input.range_days||14,r=[];
try{var ms=getDataSheet('メモ');if(ms.getLastRow()>1){var md=ms.getDataRange().getValues();for(var i=1;i<md.length;i++)if(md[i][2]!=='DELETED'&&String(md[i][3]||'').indexOf(kw)!==-1)r.push('📝メモ: '+md[i][3]+' ('+md[i][1]+')');}}catch(e){}
try{var ts=getDataSheet('タスク');if(ts.getLastRow()>1){var td=ts.getDataRange().getValues();for(var ti=1;ti<td.length;ti++)if(td[ti][5]!=='削除済み'&&String(td[ti][4]||'').indexOf(kw)!==-1)r.push('✅タスク: '+td[ti][4]+' ['+td[ti][5]+'] ('+td[ti][1]+')');}}catch(e){}
try{var now=new Date(),evts=_searchCals(new Date(now.getTime()-days*86400000),new Date(now.getTime()+days*86400000),kw);for(var ei=0;ei<evts.length;ei++)r.push('📅予定: '+evts[ei].getTitle()+' ('+fmtDate(evts[ei].getStartTime(),'M/d(E) HH:mm')+')');}catch(e){}
try{var rs=getDataSheet('リマインダー');if(rs.getLastRow()>1){var rd=rs.getDataRange().getValues();for(var ri=1;ri<rd.length;ri++)if(rd[ri][4]!=='DELETED'&&String(rd[ri][3]||'').indexOf(kw)!==-1)r.push('🔔リマインダー: '+rd[ri][3]);}}catch(e){}
if(!r.length)return'「'+kw+'」に関する記録は見つかりませんでした';
return'🔍「'+kw+'」の検索結果（'+r.length+'件）:\n\n'+r.slice(0,15).join('\n');
}
function _listItems(lines,emoji,label,items,max){if(!items.length)return;lines.push(emoji+' '+label+'（'+items.length+'件）');for(var i=0;i<Math.min(items.length,max);i++)lines.push('・'+items[i]);if(items.length>max)lines.push('  ...他'+(items.length-max)+'件');lines.push('');}
function weeklyReport() {
var c=getConfig();if(!c.LINE_TOKEN||!c.USER_ID)return;
var props=_P(),wp=props.getProperty('WEEKLY_REPORT_'+c.USER_ID);if(wp==='FALSE')return;
var ac=parseInt(props.getProperty('WEEKLY_ASK_COUNT_'+c.USER_ID)||'0');if(!wp&&ac>=2)return;
var lines=['📊 今週のまとめ',''];
try{var ts=getDataSheet('タスク');if(ts.getLastRow()>1){var td=ts.getDataRange().getValues(),comp=[],pend=[],wa=new Date(Date.now()-7*86400000);
for(var i=1;i<td.length;i++){if(td[i][5]==='削除済み')continue;if(td[i][5]==='完了'){if(new Date(td[i][1])>=wa)comp.push(td[i][4]);}else pend.push(td[i][4]);}
_listItems(lines,'✅','完了したタスク',comp,5);_listItems(lines,'📋','未完了タスク',pend,5);}}catch(e){}
try{var now=new Date(),nm=new Date(now.getFullYear(),now.getMonth(),now.getDate()+(8-now.getDay())%7),evts=CalendarApp.getDefaultCalendar().getEvents(nm,new Date(nm.getTime()+4*86400000));
if(evts.length>0){lines.push('📅 来週の予定（'+evts.length+'件）');for(var ei=0;ei<Math.min(evts.length,5);ei++)lines.push('・'+fmtDate(evts[ei].getStartTime(),'M/d(E) HH:mm')+' '+evts[ei].getTitle());if(evts.length>5)lines.push('  ...他'+(evts.length-5)+'件');lines.push('');}}catch(e){}
if(!wp){lines.push('---','📩 この週次まとめを毎週届けますか？','「週次まとめON」→ 毎週届く','「週次まとめOFF」→ 届かない');props.setProperty('WEEKLY_ASK_COUNT_'+c.USER_ID,String(ac+1));}
pushToLine(c.USER_ID,lines.join('\n'));
}
function analyzeAiLogs() {
var props=_P();
var sbUrl=props.getProperty('CMS_SUPABASE_URL'),sbKey=props.getProperty('CMS_SUPABASE_KEY'),apiKey=props.getProperty('ANTHROPIC_API_KEY');
if(!sbUrl||!sbKey||!apiKey)return;
var now=new Date(),weekEnd=Utilities.formatDate(now,'Asia/Tokyo','yyyy-MM-dd'),weekStart=Utilities.formatDate(new Date(now.getTime()-7*86400000),'Asia/Tokyo','yyyy-MM-dd');
try {
var logs=JSON.parse(_sbGet(sbUrl,sbKey,'ai_logs?created_at=gte.'+weekStart+'T00:00:00&created_at=lt.'+weekEnd+'T23:59:59&order=created_at.desc&limit=200').getContentText());
if(!logs.length)return;
var toolCount={},accountMessages={};
for(var i=0;i<logs.length;i++){var log=logs[i],aid=log.account_id||'unknown';if(!accountMessages[aid])accountMessages[aid]=[];accountMessages[aid].push({q:log.user_message,a:log.ai_response});if(log.tools_used)for(var t=0;t<log.tools_used.length;t++)toolCount[log.tools_used[t]]=(toolCount[log.tools_used[t]]||0)+1;}
var sampleLogs=logs.slice(0,50).map(function(l){return'Q:'+(l.user_message||'').substring(0,100)+' A:'+(l.ai_response||'').substring(0,100);}).join('\n');
var analysisText=_haikuAsk(apiKey,'AI秘書1週間ログ分析。JSON:{"top_questions":["質問TOP5"],"failed_patterns":["失敗パターン"],"keyword_suggestions":["ツール名:KW"],"prompt_suggestions":["指示追加"]}\n\nログ:\n'+sampleLogs,800)||'{}';
var jsonMatch=analysisText.match(/\{[\s\S]*\}/),analysis=jsonMatch?JSON.parse(jsonMatch[0]):{};
var hourDist={};for(var hi=0;hi<logs.length;hi++){var h=new Date(logs[hi].created_at).getHours();hourDist[h]=(hourDist[h]||0)+1;}
_sbPost(sbUrl,sbKey,'ai_logs_global_summary',{week_start:weekStart,week_end:weekEnd,total_messages:logs.length,total_accounts:Object.keys(accountMessages).length,tool_usage:toolCount,top_questions:analysis.top_questions||[],failed_patterns:analysis.failed_patterns||[],keyword_suggestions:analysis.keyword_suggestions||[],prompt_suggestions:analysis.prompt_suggestions||[]});
var accountIds=Object.keys(accountMessages);
for(var ai2=0;ai2<accountIds.length;ai2++){var accId=accountIds[ai2];if(accId==='unknown')continue;var accLogs=logs.filter(function(l){return l.account_id===accId;});var accToolCount={};for(var at=0;at<accLogs.length;at++){if(accLogs[at].tools_used)for(var at2=0;at2<accLogs[at].tools_used.length;at2++)accToolCount[accLogs[at].tools_used[at2]]=(accToolCount[accLogs[at].tools_used[at2]]||0)+1;}
_sbPost(sbUrl,sbKey,'ai_logs_summary',{account_id:accId,week_start:weekStart,week_end:weekEnd,total_messages:accLogs.length,tool_usage:accToolCount,top_questions:analysis.top_questions||[],failed_patterns:analysis.failed_patterns||[],suggestions:analysis.prompt_suggestions||[],hour_distribution:hourDist,satisfaction_rate:0});}
var config2=getConfig();
if(config2.LINE_TOKEN){var sm='📊 AIログ週次分析完了\n\n期間: '+weekStart+' 〜 '+weekEnd+'\n総メッセージ数: '+logs.length+'件\nアカウント数: '+Object.keys(accountMessages).length+'\n\n';
if(analysis.failed_patterns&&analysis.failed_patterns.length>0){sm+='⚠️ 改善が必要なパターン:\n';for(var fp=0;fp<Math.min(analysis.failed_patterns.length,3);fp++)sm+='・'+analysis.failed_patterns[fp]+'\n';}
if(analysis.keyword_suggestions&&analysis.keyword_suggestions.length>0){sm+='\n💡 キーワード追加提案:\n';for(var ks=0;ks<Math.min(analysis.keyword_suggestions.length,3);ks++)sm+='・'+analysis.keyword_suggestions[ks]+'\n';}
pushToLine(_KISHI_UID,sm);}
} catch(e) {try{var c3=getConfig();if(c3.LINE_TOKEN)pushToLine(_KISHI_UID,'⚠️ AIログ分析エラー: '+e.message);}catch(e2){}}
}
function toolTaskAdd(input) {
var tn=(input.task||'').replace(/[\u3000]/g,' ').trim();if(!tn)return'タスクの内容が指定されていません。何を追加しますか？';
var sheet=getDataSheet('タスク');_ensureHeaders(sheet,_TASK_HEADERS);
sheet.appendRow([Date.now()+'',getJSTNow(),input.due||'',input.priority||'中',tn,'未完了']);
var r='追加完了: '+tn+' [優先度:'+(input.priority||'中')+']'+(input.due?' 期限:'+input.due:'');
if(input.due){try{var ds=input.due;if(ds.indexOf('+')===-1&&ds.indexOf('Z')===-1&&ds.indexOf('T')===-1)ds+='T09:00:00+09:00';else if(ds.indexOf('+')===-1&&ds.indexOf('Z')===-1)ds+='+09:00';
var dd=new Date(ds);if(!isNaN(dd.getTime())){CalendarApp.getDefaultCalendar().createEvent('📋 '+tn,dd,new Date(dd.getTime()+3600000));r+='\n📅 カレンダー自動登録';
var db=new Date(dd.getTime()-86400000);if(db.getTime()>Date.now()){var rs=getDataSheet('リマインダー');_ensureHeaders(rs,_REM_HEADERS);rs.appendRow([Date.now()+'',getJSTNow(),db.getTime(),'明日期限: '+tn,'FALSE','none']);r+='\n🔔 前日リマインダー自動設定';}}}catch(e){}}
return r;
}
function toolTaskView(input) {
var sheet=getDataSheet('タスク');if(sheet.getLastRow()<=1)return'タスクはまだありません';
var data=sheet.getDataRange().getValues(),pending=[],done=[];
for(var i=1;i<data.length;i++){var row=data[i];if(!row[4]||row[5]==='削除済み')continue;var line=row[4]+' ['+(row[3]||'中')+']'+(row[2]?' 期限:'+row[2]:'');if(row[5]==='完了')done.push(line);else pending.push(line);}
var r='';
if(pending.length>0){r+='未完了 '+pending.length+'件:\n'+pending.slice(0,10).map(function(t,i){return(i+1)+'. '+t;}).join('\n');if(pending.length>10)r+='\n ...他'+(pending.length-10)+'件';}
if(input.show_done&&done.length>0){r+='\n\n完了済み '+done.length+'件:\n'+done.slice(0,5).map(function(t,i){return(i+1)+'. '+t;}).join('\n');if(done.length>5)r+='\n ...他'+(done.length-5)+'件';}
return r||'タスクはありません';
}
function _findTaskByKeyword(data, keyword, statusFilter) {
var kw = String(keyword).trim();
var num = parseInt(kw);
if (!isNaN(num) && num > 0) {
var count = 0;
for (var i = 1; i < data.length; i++) {
if (!data[i][4] || (statusFilter && data[i][5] !== statusFilter)) continue;
if (!statusFilter && (data[i][5] === '完了' || data[i][5] === '削除済み')) continue;
count++;
if (count === num) return i;
}
}
for (var j = 1; j < data.length; j++) {
if (!data[j][4]) continue;
if (statusFilter && data[j][5] !== statusFilter) continue;
if (!statusFilter && (data[j][5] === '完了' || data[j][5] === '削除済み')) continue;
if (String(data[j][4]).indexOf(kw) !== -1) return j;
}
return -1;
}
function toolTaskDone(input) {
var sheet=getDataSheet('タスク');if(sheet.getLastRow()<=1)return'完了するタスクがありません';
var data=sheet.getDataRange().getValues(),i=_findTaskByKeyword(data,input.keyword,null);
if(i>0&&data[i][5]!=='完了'&&data[i][5]!=='削除済み'){sheet.getRange(i+1,6).setValue('完了');var r='完了にしました: '+data[i][4];
try{var rs=getDataSheet('リマインダー');if(rs.getLastRow()>1){var rd=rs.getDataRange().getValues(),tn=String(data[i][4]);
for(var ri=1;ri<rd.length;ri++){if(rd[ri][4]==='TRUE'||rd[ri][4]==='DELETED')continue;if(String(rd[ri][3]||'').indexOf(tn)!==-1){rs.getRange(ri+1,5).setValue('DELETED');r+='\n🔕 関連リマインダー自動解除';break;}}}}catch(e){}return r;}
return _notFound(input.keyword,'未完了タスク');
}
function toolTaskDelete(input) {
var sheet=getDataSheet('タスク');if(sheet.getLastRow()<=1)return'タスクがありません';
var data=sheet.getDataRange().getValues(),kws=String(input.keyword).split(/[,、，\s]+/),deleted=[];
for(var k=0;k<kws.length;k++){var kw=kws[k].trim();if(!kw)continue;
for(var i=data.length-1;i>=1;i--){var tn=String(data[i][4]||'');if(!tn||data[i][5]==='削除済み')continue;
if(tn.indexOf(kw)!==-1||String(i)===kw){sheet.getRange(i+1,6).setValue('削除済み');deleted.push(tn);data[i][5]='削除済み';break;}}}
if(!deleted.length)return _notFound(input.keyword,'タスク');return'削除完了: '+deleted.join(', ');
}
function _taskStatusChange(kw,fromStatus,toStatus,emptyMsg,successMsg,failType){
var sheet=getDataSheet('タスク');if(sheet.getLastRow()<=1)return emptyMsg;
var data=sheet.getDataRange().getValues();
for(var i=1;i<data.length;i++){if(String(data[i][4]||'').indexOf(kw)!==-1&&data[i][5]===fromStatus){sheet.getRange(i+1,6).setValue(toStatus);return successMsg+data[i][4];}}
return _notFound(kw,failType);
}
function toolTaskUndone(input){return _taskStatusChange(input.keyword,'完了','未完了','戻すタスクがありません','未完了に戻しました: ','完了済みタスク');}
function toolTaskRestore(input){return _taskStatusChange(input.keyword,'削除済み','未完了','復元するタスクがありません','復元しました: ','削除済みタスク');}
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
var folder=input.folder?findFolder(input.folder):DriveApp.getRootFolder();
if(!folder)return _notFound(input.folder,'フォルダ');
var kw=input.keyword,lines=['📁 '+(input.folder||'マイドライブ')+' の内容:'],fc=0,flc=0;
var fds=folder.getFolders();while(fds.hasNext()){var f=fds.next();if(kw&&f.getName().indexOf(kw)===-1)continue;lines.push('📁 '+f.getName());fc++;}
var fls=folder.getFiles();while(fls.hasNext()){var fl=fls.next();if(kw&&fl.getName().indexOf(kw)===-1)continue;lines.push('📄 '+fl.getName()+' → '+fl.getUrl());flc++;if(flc>20){lines.push(' ...（以下省略）');break;}}
if(fc+flc===0)return(input.folder||'マイドライブ')+'にファイルはありません';
return lines.join('\n');
}
function toolDriveFileDelete(input) {
var PT=['application/vnd.google-apps.script','application/vnd.google-apps.form'],PI=['1RLc-33sobz9UJ-fbcF7pluA6tAez1K3j'];
var results=DriveApp.searchFiles('title = "'+input.keyword+'"'),targets=[];
while(results.hasNext()&&targets.length<5){var file=results.next();if(PT.indexOf(file.getMimeType())!==-1||PI.indexOf(file.getId())!==-1)continue;
if(input.folder){var ps=file.getParents(),inf=false;while(ps.hasNext()){if(ps.next().getName()===input.folder){inf=true;break;}}if(!inf)continue;}targets.push(file);}
if(!targets.length)return _notFound(input.keyword,'ファイル');
if(!input.confirm){var names=targets.map(function(f){return'・'+f.getName()+' ('+f.getMimeType().split('.').pop()+')';});return'⚠️ 以下のファイルが見つかりました:\n'+names.join('\n')+'\n\n削除してよいかユーザーに確認してください。確認後にconfirm=trueで再度呼んでください。';}
var deleted=[];for(var i=0;i<targets.length;i++){targets[i].setTrashed(true);deleted.push(targets[i].getName());}
return'🗑 ゴミ箱に移動しました:\n'+deleted.join('\n');
}
function toolDriveFileMove(input) {
var dest=findFolder(input.to_folder);if(!dest)dest=DriveApp.getRootFolder().createFolder(input.to_folder);
var results=DriveApp.searchFiles('title contains "'+input.keyword+'"'),moved=[];
while(results.hasNext()&&moved.length<5){var f=results.next();f.moveTo(dest);moved.push(f.getName());}
if(!moved.length)return _notFound(input.keyword,'ファイル');
return'✅ 移動しました → '+input.to_folder+':\n'+moved.join('\n');
}
function toolDriveFileRename(input) {
var r=DriveApp.searchFiles('title contains "'+input.keyword+'"');
if(r.hasNext()){var f=r.next(),old=f.getName();f.setName(input.new_name);return'✅ 名前を変更しました\n'+old+' → '+input.new_name;}
var fr=DriveApp.searchFolders('title contains "'+input.keyword+'"');
if(fr.hasNext()){var fd=fr.next(),oldn=fd.getName();fd.setName(input.new_name);return'✅ フォルダ名を変更しました\n'+oldn+' → '+input.new_name;}
return _notFound(input.keyword,'ファイル・フォルダ');
}
function toolDriveFileSearch(input) {
var kw=input.keyword,lines=['🔍 「'+kw+'」の検索結果:'],c=0;
var folders=DriveApp.searchFolders('title contains "'+kw+'" and trashed = false');
while(folders.hasNext()&&c<3){var fo=folders.next();lines.push('📁 '+fo.getName()+'\n → https://drive.google.com/drive/folders/'+fo.getId());
var children=fo.getFiles(),cc=0;while(children.hasNext()&&cc<5){var cf=children.next();lines.push('  └ '+cf.getName());cc++;}if(cc>=5)lines.push('  └ ...（他にもファイルあり）');c++;}
var r=DriveApp.searchFiles('title contains "'+kw+'" and trashed = false'),fc=0;
while(r.hasNext()&&fc<10){var f=r.next();var mime=f.getMimeType(),icon=mime.indexOf('document')!==-1?'📄':mime.indexOf('spreadsheet')!==-1?'📊':mime.indexOf('folder')!==-1?'📁':'📎';
lines.push(icon+' '+f.getName()+'\n → '+f.getUrl());fc++;}
if(fc>=10)lines.push('...（10件以上のため省略）');
if(!c&&!fc)return _notFound(kw,'ファイル・フォルダ');
return lines.join('\n');
}
function toolRouteSearch(input,uid) {
var f=input.from,t=input.to,mode=input.mode||'transit',dep=input.depart||'';
var ml={transit:'電車・バス',driving:'車',walking:'徒歩',bicycling:'自転車'};
var r='はい！経路を調べたよ！🗺✨\n\n出発: '+f+'\n到着: '+t+'\n移動手段: '+(ml[mode]||'電車・バス')+'\n';
if(dep)r+='出発時刻: '+dep+'\n';
r+='\n📍 Googleマップはこちら👇\nhttps://www.google.com/maps/dir/'+encodeURIComponent(f)+'/'+encodeURIComponent(t)+'/?travelmode='+mode+'\n\nリンクをタップして時刻表・乗換情報を確認してね！😊';
pushToLine(uid,r);
return '__SENT__';
}
function toolHotelSearch(input) {
var a=input.area,ci=input.checkin||'',co=input.checkout||'',g=input.guests||1,kw=input.keyword||'',ea=encodeURIComponent(a),ek=kw?encodeURIComponent(kw):'';
var r='🏨 ホテル検索結果\n📍 エリア: '+a+'\n';
if(ci)r+='📅 チェックイン: '+ci+'\n';if(co)r+='📅 チェックアウト: '+co+'\n';
r+='👥 人数: '+g+'名\n';if(kw)r+='🔑 キーワード: '+kw+'\n';
r+='\n🔴 楽天トラベル\nhttps://travel.rakuten.co.jp/search/result/?f_teikei=&f_area='+ea+(ci?'&f_sdate='+ci:'')+(co?'&f_edate='+co:'')+'&f_adult_num='+g+(ek?'&f_keyword='+ek:'');
r+='\n\n🔵 じゃらん\nhttps://www.jalan.net/search/contentsSearch/?keyword='+ea+(ci?'&checkinDate='+ci.replace(/-/g,''):'')+(co?'&checkoutDate='+co.replace(/-/g,''):'')+'&adultNum='+g;
r+='\n\n🌐 Booking.com\nhttps://www.booking.com/search.ja.html?ss='+ea+(ci?'&checkin='+ci:'')+(co?'&checkout='+co:'')+'&group_adults='+g;
return r+'\n\n※ リンクをタップして空室・料金を確認';
}
function _searchDrive(kw,mime,exact){return DriveApp.searchFiles('title '+(exact?'= ':'contains ')+'"'+kw+'" and mimeType = "'+mime+'" and trashed = false');}
function toolDocsRead(input) {
var r;
if(input.doc_id){try{var df=DriveApp.getFileById(input.doc_id);r={hasNext:function(){return true;},next:function(){return df;}};}catch(e){return'ドキュメントが見つかりません（ID: '+input.doc_id+'）';}}
else{r=_searchDrive(input.keyword,'application/vnd.google-apps.document');}
if(!r.hasNext())return _notFound(input.keyword||input.doc_id,'ドキュメント');
var f=r.next(),text=DocumentApp.openById(f.getId()).getBody().getText();
var lim=input.full_read?4000:800;
if(text.length>lim)text=text.slice(0,lim)+'\n...（以下省略、全'+text.length+'文字）';
return'📄 '+f.getName()+'\n\n'+text+'\n\nURL: '+f.getUrl();
}
function toolDocsWrite(input) {
var doc;
if(input.doc_id){try{doc=DocumentApp.openById(input.doc_id);}catch(e){return'ドキュメントが見つかりません（ID: '+input.doc_id+'）';}}
else{var r=_searchDrive(input.keyword,'application/vnd.google-apps.document');if(!r.hasNext())return _notFound(input.keyword,'ドキュメント');doc=DocumentApp.openById(r.next().getId());}
var body=doc.getBody();
if(input.mode==='replace'){body.clear();_docBody(body,input.content||'');}
else{body.appendParagraph('\n');_docBody(body,input.content||'');}
doc.saveAndClose();
return'✅ ドキュメント更新完了: '+doc.getName()+'\nURL: https://docs.google.com/document/d/'+doc.getId()+'/edit';
}
function toolDocsDelete(input) {
var r=_searchDrive(input.keyword,'application/vnd.google-apps.document',true);
if(!r.hasNext())return _notFound(input.keyword,'ドキュメント');
var f=r.next(),name=f.getName();
if(!input.confirm)return'⚠️ ドキュメント「'+name+'」が見つかりました。削除してよいかユーザーに確認してください。確認後にconfirm=trueで再度呼んでください。';
f.setTrashed(true);return'🗑 ドキュメントをゴミ箱に移動しました: '+name;
}
function toolSheetsRead(input) {
var r=_searchDrive(input.keyword,'application/vnd.google-apps.spreadsheet');
if(!r.hasNext())return _notFound(input.keyword,'スプレッドシート');
var f=r.next(),ss=SpreadsheetApp.openById(f.getId());
var sheet=input.sheet_name?ss.getSheetByName(input.sheet_name):ss.getActiveSheet();
if(!sheet)return'シート「'+input.sheet_name+'」が見つかりませんでした';
var mx=input.max_rows||20,data=sheet.getDataRange().getValues(),lines=['📊 '+f.getName()+'（'+sheet.getName()+'）'];
for(var i=0;i<Math.min(data.length,mx);i++)lines.push(data[i].filter(function(c){return c!=='';}).join(' | '));
if(data.length>mx)lines.push('...（他'+(data.length-mx)+'行省略）');
lines.push('\nURL: '+f.getUrl());return lines.join('\n');
}
function toolSheetsWrite(input) {
var results=_searchDrive(input.keyword,'application/vnd.google-apps.spreadsheet');
if(!results.hasNext())return _notFound(input.keyword,'スプレッドシート');
var tf=results.next(),dsId=_P().getProperty('DATA_SS_ID');
if(dsId&&tf.getId()===dsId)return'⚠️ データ管理シートは直接編集できません';
var ss=SpreadsheetApp.openById(tf.getId()),sheet=input.sheet_name?ss.getSheetByName(input.sheet_name):ss.getActiveSheet();
if(!sheet)return'シート「'+input.sheet_name+'」が見つかりませんでした';
var mode=input.mode||'append',rows=input.rows||[];
if(mode==='append'){for(var i=0;i<rows.length;i++)sheet.appendRow(rows[i]);return'✅ '+rows.length+'行\n'+ss.getUrl();}
if(mode==='update'){var ups=input.updates||[];for(var j=0;j<ups.length;j++)sheet.getRange(ups[j].row,ups[j].col).setValue(ups[j].value);return'✅ '+ups.length+'セルを更新\nURL: '+ss.getUrl();}
if(mode==='clear_and_write'){sheet.clearContents();_setHeader(sheet,input.headers||[]);for(var k=0;k<rows.length;k++)sheet.appendRow(rows[k]);return'✅ シート更新（'+rows.length+'行）\nURL: '+ss.getUrl();}
return'❌ modeが不正です';
}
function toolSheetsDelete(input) {
var results=_searchDrive(input.keyword,'application/vnd.google-apps.spreadsheet',true);
if(!results.hasNext())return _notFound(input.keyword,'スプレッドシート');
var f=results.next(),name=f.getName(),dsId2=_P().getProperty('DATA_SS_ID');
if(dsId2&&f.getId()===dsId2)return'⚠️ データ管理シートは削除できません';
if(!input.confirm)return'⚠️ スプレッドシート「'+name+'」が見つかりました。削除してよいかユーザーに確認してください。確認後にconfirm=trueで再度呼んでください。';
f.setTrashed(true);return'🗑 スプレッドシートをゴミ箱に移動しました: '+name;
}
function toolUrlSummarize(input) {
try{var html=UrlFetchApp.fetch(input.url,{muteHttpExceptions:true,followRedirects:true}).getContentText();
var text=html.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
if(text.length>1000)text=text.slice(0,1000);
return'以下のWebページを200字以内で日本語要約。\nURL: '+input.url+'\n\n'+text;
}catch(e){return'URLの取得に失敗しました。';}
}
function toolBirthdayReminder(input) {
if(!input.birthday||!input.name)return'名前と誕生日（MM-DD形式）を指定してください。例: 03-25';
var sheet=getDataSheet('リマインダー');_ensureHeaders(sheet,_REM_HEADERS);
var h=input.hour!==undefined?input.hour:8,pts=input.birthday.replace(/^\d{4}-/,'').split('-'),mo=parseInt(pts[0]),dy=parseInt(pts[1]),yr=new Date().getFullYear();
var nb=new Date(yr,mo-1,dy,h,0,0);if(nb<new Date())nb=new Date(yr+1,mo-1,dy,h,0,0);
sheet.appendRow([Date.now()+'',getJSTNow(),Utilities.formatDate(nb,'Asia/Tokyo',"yyyy-MM-dd'T'HH:mm:ss")+'+09:00',input.name+'さんの誕生日🎂','FALSE','yearly']);
return'🎂 誕生日リマインダー設定！\n'+input.name+'さん（'+input.birthday+'）\n毎年'+mo+'月'+dy+'日'+h+'時に通知';
}
function toolReportGenerate(input) {
var type=input.type||'weekly',now=new Date(),title,dateLabel;
if(type==='weekly'){var ws=new Date(now);ws.setDate(now.getDate()-now.getDay());title=fmtDate(ws,'yyyy年M月d日')+'週 週次レポート';dateLabel=fmtDate(ws,'M/d')+'〜'+fmtDate(now,'M/d');}
else{title=fmtDate(now,'yyyy年M月')+' 月次レポート';dateLabel=fmtDate(now,'yyyy年M月');}
var lines=['# '+title,'期間: '+dateLabel,''];
try{var ts=getDataSheet('タスク');if(ts.getLastRow()>1){var td=ts.getDataRange().getValues(),dn=[],pd=[];
for(var i=1;i<td.length;i++){var ln='・'+td[i][4]+(td[i][2]?'（期限:'+td[i][2]+'）':'');if(td[i][5]==='完了')dn.push(ln);else pd.push(ln);}
lines.push('## ✅ タスク完了（'+dn.length+'件）');dn.forEach(function(t){lines.push(t);});lines.push('');
lines.push('## 📋 未完了タスク（'+pd.length+'件）');pd.forEach(function(t){lines.push(t);});lines.push('');}}catch(e){}
try{var ms=getDataSheet('メモ');if(ms.getLastRow()>1){var md=ms.getDataRange().getValues();lines.push('## 📝 メモ（'+(md.length-1)+'件）');
for(var mi=1;mi<Math.min(md.length,11);mi++)lines.push('・'+md[mi][3]+'（'+md[mi][1]+'）');lines.push('');}}catch(e){}
lines.push('## 📅 カレンダー','（Googleカレンダーでご確認ください）','','---','作成日時: '+getJSTNow());
var doc=DocumentApp.create(title);_docBody(doc.getBody(),lines.join('\n'));doc.saveAndClose();
return(type==='weekly'?'📊 週次レポート':'📊 月次レポート')+'を作成しました！\n'+
'期間: ' + dateLabel + '\n\nURL: https://docs.google.com/document/d/' + doc.getId() + '/edit';
}
function _decodeHtml(s){return s.replace(/<!\[CDATA\[|\]\]>/g,'').trim().replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"');}
function _fetchRss(query,limit){var r=[];try{var rss=UrlFetchApp.fetch('https://news.google.com/rss/search?q='+encodeURIComponent(query)+'&hl=ja&gl=JP&ceid=JP:ja',{muteHttpExceptions:true}).getContentText();var items=rss.match(/<item>([\s\S]*?)<\/item>/g);if(items)for(var i=0;i<Math.min(items.length,limit||5);i++){var t=_decodeHtml((items[i].match(/<title>([\s\S]*?)<\/title>/)||[])[1]||''),p=(items[i].match(/<pubDate>([\s\S]*?)<\/pubDate>/)||[])[1]||'';if(t)r.push((p?'['+p.slice(0,16)+'] ':'')+t);}}catch(e){}return r;}
function toolWebSearch(input) {
var q=input.query,results=_fetchRss(q,5);
try{var d=JSON.parse(UrlFetchApp.fetch('https://api.duckduckgo.com/?q='+encodeURIComponent(q)+'&format=json&no_html=1&skip_disambig=1',{muteHttpExceptions:true}).getContentText());if(d.AbstractText)results.unshift('[概要] '+d.AbstractText);}catch(e){}
if(results.length>0)return'検索結果 ['+q+']:\n'+results.join('\n');
return'「'+q+'」の検索結果が見つかりませんでした。Claudeの知識で回答してください。';
}
function toolBriefingSetting(input) {
var props = _P();
if (input.action === 'stop') {
props.setProperty('BRIEFING_ENABLED', 'FALSE');
_setupTrigger('morningBriefing');
return '朝のスケジュール確認を停止しました。\n再開したい場合は「朝のスケジュール確認を〇時に設定して」と送ってください。';
}
if (input.news_topic !== undefined) {
if (input.news_topic === '' || input.news_topic === 'off' || input.news_topic === 'OFF') {
props.deleteProperty('BRIEFING_NEWS_TOPIC');
return '📰 ニュース配信を停止しました';
}
props.setProperty('BRIEFING_NEWS_TOPIC', input.news_topic);
return '📰 毎朝のブリーフィングに「' + input.news_topic + '」のニュースを追加しました！';
}
var hour = input.hour !== undefined ? input.hour : 7;
props.setProperty('BRIEFING_HOUR', String(hour));
props.setProperty('BRIEFING_ENABLED', 'TRUE');
setupBriefingTrigger();
return '☀️ 毎朝' + hour + '時に予定をお届けします！';
}
function morningBriefing() {
var config=getConfig();if(!config.LINE_TOKEN||!config.USER_ID)return;
if(_P().getProperty('BRIEFING_ENABLED')==='FALSE')return;
if(_P().getProperty('DEMO_MODE')==='TRUE'&&parseInt(_P().getProperty('demo_count_'+config.USER_ID)||'0')>=10)return;
if(getRemoteConfig().briefing_enabled==='FALSE')return;
var now=new Date(),hour=parseInt(_F(now,'HH'),10);
var greeting=hour<12?'おはようございます！☀️':hour<18?'こんにちは！🌤':'こんばんは！🌙';
var lines=[greeting,fmtDate(now,'M月d日（E）')+'のブリーフィングです。',''];
try{var ds=_F(new Date(),'yyyy-MM-dd'),events=_searchCals(new Date(ds+'T00:00:00+09:00'),new Date(ds+'T23:59:59+09:00'));
events.sort(function(a,b){return a.getStartTime()-b.getStartTime();});
if(!events.length)lines.push('📅 今日の予定はありません');
else{lines.push('📅 今日の予定（'+events.length+'件）');for(var i=0;i<Math.min(events.length,5);i++){var ev=events[i],loc=ev.getLocation()?' @'+ev.getLocation():'';lines.push((i+1)+'. '+fmtDate(ev.getStartTime(),'HH:mm')+' '+ev.getTitle()+loc);}if(events.length>5)lines.push(' ...他'+(events.length-5)+'件');}}catch(e){lines.push('📅 カレンダーの取得に失敗しました');}
lines.push('');
try{var sh=getDataSheet('タスク');if(sh.getLastRow()>1){var data=sh.getDataRange().getValues(),pend=[];
for(var ti=1;ti<data.length;ti++)if(data[ti][5]!=='完了'&&data[ti][5]!=='削除済み')pend.push(data[ti]);
if(!pend.length)lines.push('✅ 未完了タスクはありません！');
else{lines.push('✅ 未完了タスク（'+pend.length+'件）');for(var pi=0;pi<Math.min(pend.length,5);pi++)lines.push((pi+1)+'. '+pend[pi][4]+(pend[pi][3]?' ['+pend[pi][3]+']':'')+(pend[pi][2]?' 期限:'+pend[pi][2]:''));if(pend.length>5)lines.push(' ...他'+(pend.length-5)+'件');}}
else lines.push('✅ タスクはまだありません');}catch(e){lines.push('✅ タスクの取得に失敗しました');}
lines.push('');
try{var rs=getDataSheet('リマインダー');if(rs.getLastRow()>1){var rd=rs.getDataRange().getValues(),tr=[],ts2=new Date(_F(new Date(),'yyyy-MM-dd')+'T00:00:00+09:00').getTime(),te2=ts2+86400000;
for(var ri=1;ri<rd.length;ri++){if(rd[ri][4]==='TRUE'||rd[ri][4]===true||rd[ri][4]==='DELETED')continue;var dtB=_parseRawDt(rd[ri][2]);if(dtB&&dtB.getTime()>=ts2&&dtB.getTime()<te2)tr.push({text:rd[ri][3],time:dtB});}
if(tr.length>0){tr.sort(function(a,b){return a.time-b.time;});lines.push('🔔 今日のリマインダー（'+tr.length+'件）');for(var tri=0;tri<Math.min(tr.length,5);tri++)lines.push((tri+1)+'. '+Utilities.formatDate(tr[tri].time,'Asia/Tokyo','HH:mm')+' '+tr[tri].text);if(tr.length>5)lines.push(' ...他'+(tr.length-5)+'件');lines.push('');}}}catch(e){}
try{var ts3=getDataSheet('タスク');if(ts3.getLastRow()>1){var td3=ts3.getDataRange().getValues(),tds=_F(new Date(),'yyyy-MM-dd'),tms=Utilities.formatDate(new Date(Date.now()+86400000),'Asia/Tokyo','yyyy-MM-dd'),urg=[],dtt=[];
for(var dti=1;dti<td3.length;dti++){if(td3[dti][5]==='完了'||td3[dti][5]==='削除済み')continue;var dv=String(td3[dti][2]||''),pr=String(td3[dti][3]||''),dd=dv.length>=10?dv.substring(0,10):'',hp=(pr==='高'||pr==='緊急'),idt=dd===tds,idm=dd===tms,iov=dd&&dd<tds;
if(hp&&(idt||idm||iov))urg.push(td3[dti][4]+(iov?'（期限切れ！）':idt?'（今日まで）':'（明日まで）'));else if(idt)dtt.push(td3[dti][4]);}
if(urg.length>0){lines.push('🔥 最優先タスク:');for(var ui=0;ui<urg.length;ui++)lines.push('・'+urg[ui]);lines.push('');}
if(dtt.length>0){lines.push('⚡ 今日が期限のタスク:');for(var ddi=0;ddi<dtt.length;ddi++)lines.push('・'+dtt[ddi]);lines.push('');}}}catch(e){}
try{var newsTopic=_P().getProperty('BRIEFING_NEWS_TOPIC');if(newsTopic){var news=_fetchRss(newsTopic+' 最新',5);if(news.length>0){lines.push('📰 '+newsTopic+'ニュース');for(var ni=0;ni<news.length;ni++)lines.push((ni+1)+'. '+news[ni]);lines.push('');}}}catch(e){}
lines.push('今日も頑張りましょう💪');
var briefingText = lines.join('\n');
try {
var tone = getTone(config.USER_ID);
if (tone && tone !== '丁寧' && tone !== '1' && config.ANTHROPIC_KEY) {
var r=_haikuAsk(config.ANTHROPIC_KEY,'以下のブリーフィングを「'+tone+'」の口調に変換してください。情報は一切変更せず、口調だけ変えてください。日時・件数・タイトル等はそのまま。\n\n'+briefingText,600);
if(r)briefingText=r;
}
} catch(e) {}
pushToLine(config.USER_ID, briefingText);
}
function setupBriefingTrigger() {
var hour = parseInt(_P().getProperty('BRIEFING_HOUR') || '7', 10);
_setupTrigger('morningBriefing');
ScriptApp.newTrigger('morningBriefing').timeBased().atHour(hour).everyDays(1).create();
}
function setupWeeklyReportTrigger() {
_setupTrigger('weeklyReport');
ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(17).create();
}
var _CC={'東京':[35.68,139.65],'大阪':[34.69,135.50],'名古屋':[35.18,136.91],'福岡':[33.59,130.40],'札幌':[43.06,141.35],'仙台':[38.27,140.87],'広島':[34.39,132.46],'京都':[35.01,135.77],'横浜':[35.44,139.64],'岡山':[34.66,133.93],'神戸':[34.69,135.20],'那覇':[26.21,127.68],'金沢':[36.56,136.66],'熊本':[32.79,130.74]};
function _wc(c){if(c===0)return'快晴';if(c<=2)return'晴れ';if(c===3)return'曇り';if(c<=49)return'霧';if(c<=59)return'霧雨';if(c<=69)return'雨';if(c<=79)return'雪';if(c<=82)return'雨';if(c<=86)return'雪';return'雷雨';}
function toolWeather(input) {
var city=input.city||'東京',co=_CC[city]||_CC['東京'],nm=_CC[city]?city:'東京';
try{var d=JSON.parse(UrlFetchApp.fetch('https://api.open-meteo.com/v1/forecast?latitude='+co[0]+'&longitude='+co[1]+'&current=temperature_2m,weathercode,windspeed_10m&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo&forecast_days=3',{muteHttpExceptions:true}).getContentText());
var cr=d.current||{},dy=d.daily||{};if(cr.temperature_2m===undefined)return nm+'の天気情報を取得できませんでした';
var r=nm+'の天気: '+_wc(cr.weathercode)+' '+Math.round(cr.temperature_2m)+'℃ 風'+Math.round(cr.windspeed_10m)+'km/h\n3日間予報:\n';
for(var i=0;i<3;i++)r+=fmtDate(new Date(dy.time[i]),'M/d(E)')+' '+_wc(dy.weathercode[i])+' '+Math.round(dy.temperature_2m_min[i])+'〜'+Math.round(dy.temperature_2m_max[i])+'℃ 雨'+dy.precipitation_sum[i]+'mm\n';
return r;}catch(e){return nm+'の天気情報を取得できませんでした';}
}
function _buildMsgs(text){var p=splitMsg(text),m=[];for(var i=0;i<p.length&&i<5;i++)m.push({type:'text',text:p[i]});return m;}
function replyToLine(replyToken, text) {
var c=getConfig();if(!c.LINE_TOKEN)return;
_lineMsg(_LINE_REPLY_URL,c.LINE_TOKEN,{replyToken:replyToken,messages:_buildMsgs(text)});
}
function trackTokenUsage(inputTokens,outputTokens,props) {
var k='tokens_'+_F(new Date(),'yyyy_M'),s=props.getProperty(k),d=s?JSON.parse(s):{input:0,output:0,w5:false,w10:false};
d.input+=(inputTokens||0);d.output+=(outputTokens||0);
var cost=(d.input/1e6*3+d.output/1e6*15)*150,nw=null;
if(!d.w10&&cost>=1000){d.w10=true;d.w5=true;nw=1000;}else if(!d.w5&&cost>=500){d.w5=true;nw=500;}
try{props.setProperty(k,JSON.stringify(d));}catch(e){}return{cost:Math.round(cost),newWarn:nw};
}
function getMonthlyUsageText(props) {
var now=new Date(),k='tokens_'+_F(now,'yyyy_M'),d=props.getProperty(k);
if(!d)return'今月の使用記録はまだありません。';
var data=JSON.parse(d),cost=Math.round((data.input/1e6*3+data.output/1e6*15)*150);
return _F(now,'M')+'月の使用量（概算）\n入力: '+data.input+' tok\n出力: '+data.output+' tok\n推定: 約¥'+cost+'\n\n⚠️ 目安です。正確な残高→\nhttps://console.anthropic.com/settings/billing';
}
function getTone(uid, props) {
return (props || _P()).getProperty('tone_' + uid) || '';
}
function setTone(uid, tone, props) {
(props || _P()).setProperty('tone_' + uid, tone);
}
function getTonePrompt(uid, props) {
var tone = getTone(uid, props);
if (!tone || tone === '丁寧' || tone === '1') return '';
var _TP='\n\n【口調ルール（最優先で厳守）】\n';
var friendly=_TP+'タメ口で話して。敬語禁止。語尾は「〜だよ」「〜だね」「〜しよう！」。絵文字を毎回2〜3個使って。親しい友達に話すように。この口調を会話中ずっと維持すること。';
var biz=_TP+'ビジネス敬語で簡潔に。絵文字なし。「です・ます」調。冗長な表現を避け要点のみ。この口調を会話中ずっと維持すること。';
if(tone==='2'||tone==='フレンドリー')return friendly;
if(tone==='3'||tone==='ビジネス')return biz;
return _TP+'口調:'+tone+'。この口調を会話中ずっと維持すること。';
}
function toolSetTone(input, uid) {
if (!uid) return '口調設定に失敗しました';
var t = (input.tone || '').trim();
if (!t) return '口調が指定されていません';
var p = _P();
setTone(uid, t, p);
return '口調を「' + t + '」に設定しました。次のメッセージから反映されます。';
}
function toolCompany(input,uid){
if(uid!==_KISHI_UID)return'この機能は未設定です';
var root=DriveApp.getFolderById(_COMPANY_FOLDER_ID);
var depts=_DEPTS;
function _ssMemos(dept){try{var sh=getDataSheet('メモ');if(sh.getLastRow()<=1)return[];var d=sh.getDataRange().getValues();var r=[];for(var i=1;i<d.length;i++){if(d[i][2]===dept&&d[i][2]!=='DELETED'){r.push({content:d[i][3],date:d[i][1]});}}return r;}catch(e){return[];}}
if(input.action==='status'){
var lines=['📊 部署別ステータス'];
for(var i=0;i<depts.length;i++){var dCnt=0;var sb=root.getFoldersByName(depts[i]);if(sb.hasNext()){var fs=sb.next().getFiles();while(fs.hasNext()){fs.next();dCnt++;}}
var sm=_ssMemos(depts[i]);
lines.push(depts[i]+': Drive '+dCnt+'件 / メモ '+sm.length+'件');}
return lines.join('\n');}
var dept=input.dept||'秘書室';var items=[];
var sb=root.getFoldersByName(dept);
if(sb.hasNext()){var fs=sb.next().getFiles();while(fs.hasNext()&&items.length<10){var f=fs.next();items.push('📄 '+f.getName()+'\n'+f.getBlob().getDataAsString().substring(0,200));}}
var sm=_ssMemos(dept);for(var j=0;j<sm.length&&items.length<15;j++){items.push('📝 '+sm[j].content+' ('+sm[j].date+')');}
if(!items.length)return dept+'にメモはまだありません';
return'📁 '+dept+' ('+items.length+'件)\n\n'+items.join('\n---\n');}
function _getGroupSender(c,ev){try{var gid=ev.source.groupId||ev.source.roomId;var r=UrlFetchApp.fetch('https://api.line.me/v2/bot/group/'+gid+'/member/'+ev.source.userId+'/profile',{headers:{Authorization:'Bearer '+c.LINE_TOKEN},muteHttpExceptions:true});if(r.getResponseCode()===200)return JSON.parse(r.getContentText()).displayName||'';}catch(e){}return'メンバー';}
var _TASK_HEADERS=['ID','追加日時','期限','優先度','タスク','状態'];
var _MEMO_HEADERS=['ID','日時','タグ','内容'];
var _REM_HEADERS=['ID','設定日時','リマインド日時','内容','送信済み','繰り返し'];
function _ensureHeaders(sheet,headers){if(sheet.getLastRow()===0)sheet.appendRow(headers);}
function processGroupMention(ev){var c=getConfig();if(!c.ANTHROPIC_KEY||!c.USER_ID)return;var msg=ev.message.text.trim().replace(/@[^\s\u3000]+/g,'').trim();if(!msg)return;var senderName=_getGroupSender(c,ev);try{var txt=_haikuAsk(c.ANTHROPIC_KEY,'「'+msg+'」をtask/reminder/memo/skipで分類。迷ったらskip。JSON:{"t":"task","v":"内容"} or {"t":"reminder","v":"内容","dt":"日時"} or {"t":"memo","v":"内容"} or {"t":"skip"}のみ返せ',100);if(!txt)return;var m=txt.match(/\{[\s\S]*?\}/);if(!m)return;var d=JSON.parse(m[0]);var pfx='📢 グループで'+senderName+'さんからメンション\n';if(d.t==='task'){var ts=getDataSheet('タスク');_ensureHeaders(ts,_TASK_HEADERS);ts.appendRow([Date.now()+'',getJSTNow(),'','中',d.v||msg,'未完了']);pushToLine(c.USER_ID,pfx+'✅ タスク登録: '+(d.v||msg));}else if(d.t==='reminder'){var dt=d.dt?new Date(d.dt.indexOf('+')!==-1?d.dt:d.dt+'+09:00'):new Date(Date.now()+3600000);if(isNaN(dt.getTime()))dt=new Date(Date.now()+3600000);var rs=getDataSheet('リマインダー');_ensureHeaders(rs,_REM_HEADERS);rs.appendRow([Date.now()+'',getJSTNow(),dt.getTime(),d.v||msg,'FALSE','none']);pushToLine(c.USER_ID,pfx+'⏰ リマインダー登録: '+(d.v||msg));}else if(d.t==='memo'){var ms=getDataSheet('メモ');_ensureHeaders(ms,_MEMO_HEADERS);ms.appendRow([Date.now()+'',getJSTNow(),'グループ',d.v||msg]);pushToLine(c.USER_ID,pfx+'📝 メモ登録: '+(d.v||msg));}}catch(e){}}
var _DEPTS=['秘書室','LINE事業','Instagram','note','介護ブログ','コミュニティ','学校コンサル','HP運用'];
var _DEPTS_STR=_DEPTS.join(',');
var _COMPANY_FOLDER_ID='1RLc-33sobz9UJ-fbcF7pluA6tAez1K3j';
function _getOrCreateSub(root,name){var s=root.getFoldersByName(name);return s.hasNext()?s.next():root.createFolder(name);}
function _saveCompanyFile(cat,content){var root=DriveApp.getFolderById(_COMPANY_FOLDER_ID);var folder=_getOrCreateSub(root,cat);folder.createFile(Utilities.formatDate(new Date(),'Asia/Tokyo','yyyyMMdd_HHmm')+'.txt','【'+cat+'】\n'+Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd HH:mm')+'\n\n'+content,MimeType.PLAIN_TEXT);}
function saveToMyCompanyAuto(t){var c=getConfig();if(!c.ANTHROPIC_KEY)return;try{if(_haikuAsk(c.ANTHROPIC_KEY,'アイデア/思考/気づき系?\nメッセージ:'+t+'\n「はい」か「いいえ」のみ',5)!=='はい')return;var cat=_haikuAsk(c.ANTHROPIC_KEY,'分類:'+_DEPTS_STR+'\nメモ:'+t+'\nカテゴリ名のみ',15);if(_DEPTS.indexOf(cat)===-1)cat='秘書室';_saveCompanyFile(cat,t);}catch(e){}}
function processGroupMessage(uid,message,props) {
var c=getConfig();if(!c.USER_ID||uid!==c.USER_ID||!c.ANTHROPIC_KEY)return;
try{var txt=_haikuAsk(c.ANTHROPIC_KEY,'「'+message+'」をtask/skip/askで分類。task=明確な作業のみ。迷→skip。JSON:{"t":"task","v":"内容"} or {"t":"skip"} or {"t":"ask"}',80);
if(!txt)return;var m=txt.match(/\{[\s\S]*?\}/);if(!m)return;var d=JSON.parse(m[0]);
if(d.t==='task'){var ts=getDataSheet('タスク');_ensureHeaders(ts,_TASK_HEADERS);ts.appendRow([Date.now()+'',getJSTNow(),'','中',d.v||message,'未完了']);pushToLine(c.USER_ID,'✅ タスク登録\n・'+(d.v||message));}
else if(d.t==='ask'){var k='pt_'+Date.now();props.setProperty(k,message);pushToLine(c.USER_ID,'❓ タスクにしますか？\n\n「'+message+'」\n\n「タスク:'+k.slice(-6)+'」→登録\n「スキップ:'+k.slice(-6)+'」→スルー');}}catch(e){}
}
function processGroupWatch(ev,ownerUid,props) {
var c=getConfig();if(!c.ANTHROPIC_KEY||!ownerUid)return;var msg=(ev.message.text||'').trim();if(!msg||msg.length<5)return;
var sn=_getGroupSender(c,ev);
try{var on=props.getProperty('OWNER_NAME')||'',nn=props.getProperty('OWNER_NICKNAMES')||'';
var txt=_haikuAsk(c.ANTHROPIC_KEY,'グループLINE発言。オーナー('+(on||'持ち主')+')にとってタスク・予定・依頼あるか？\nオーナー:'+on+(nn?','+nn:'')+'\n発言者:'+sn+'\n発言:'+msg+'\n判定:依頼/予定/締切→YES,雑談/相槌→NO,迷→NO\nJSON:{"judge":"YES","type":"task/calendar/info","summary":"要約"} or {"judge":"NO"}',80);
if(!txt)return;var m=txt.match(/\{[\s\S]*?\}/);if(!m)return;var d=JSON.parse(m[0]);if(d.judge!=='YES')return;
var te=d.type==='task'?'✅':d.type==='calendar'?'📅':'💡',act=d.type==='task'?'タスクにする':d.type==='calendar'?'予定にする':'メモする';
pushToLine(ownerUid,'📢 グループLINEより\n'+sn+'さん:\n「'+(msg.length>100?msg.slice(0,100)+'…':msg)+'」\n\n'+te+' '+(d.summary||msg)+'\n\n→「'+act+'」で登録');}catch(e){}
}
function pushToLine(userId, text) {
var c=getConfig();if(!c.LINE_TOKEN||!userId)return;
_lineMsg(_LINE_PUSH_URL,c.LINE_TOKEN,{to:userId,messages:_buildMsgs(text)});
}
var _HELP_MAP=(function(){var m={},d='Gmail:📧 Gmail\n\n「メール確認して」→ 未読メールを表示\n「○○さんにメールして」→ 送信\n「返信開始」→ 返信作成モード,カレンダー:📅 カレンダー\n\n「今日の予定」「来週の予定」\n「○月○日に○○を追加」\n「来週の空き時間」→ 30分単位で空きを表示,ドキュメント:📄 ドキュメント\n\n「○○のドキュメント読んで」\n「ドキュメント作成」→ 新規作成\nDocsのURLを送信→ 内容を読み取り,スプレッドシート:📊 スプシ\n\n「○○のスプシ読んで」\n「スプシ作成」→ 新規作成,ドライブ:📁 ドライブ\n\n「○○を検索」→ ファイル・フォルダを横断検索\n「○○さんの書類」→ 利用者名で検索,写真保存:📸 写真保存\n\nLINEに写真を送るだけ！\n→ 自動でGoogleドライブに保存,メモ:📝 メモ\n\n「メモ ○○」→ 保存\n「メモ確認」→ 一覧表示\n「○○のメモ削除」,タスク:✅ タスク\n\n「タスク ○○」→ 追加\n「タスク確認」→ 一覧\n「○○完了」→ 完了にする,レポート:📊 レポート\n\n「週次レポート」「月次レポート」\n→ 期間の活動サマリーを自動生成,リマインダー:⏰ リマインダー\n\n「○時に○○リマインド」\n「毎週月曜に○○」→ 繰り返し設定\n「リマインダー確認」,誕生日リマインダー:🎂 誕生日\n\n「○○さんの誕生日は○月○日」\n→ 毎年自動でお知らせ,朝のスケジュール確認:☀️ 朝の確認\n\n「朝のスケジュール確認ON」\n→ 毎朝、今日の予定+天気をお届け\n停止:「朝のスケジュール確認OFF」,URL要約:🌐 URL要約\n\nURLを送るだけで内容を要約,経路・ホテル:🗺 経路検索\n\n「○○から○○への行き方」\n→ Googleマップのリンクを表示,翻訳:🌍 翻訳・計算\n\n「○○を英語に翻訳」\n「○○を計算して」,文章校正:✏️ 文章校正\n\n「この文章を校正して」\n→ 誤字脱字・表現を修正,AIチャット:💬 AIチャット\n\n何でも質問OK！\n「○○について教えて」\n「○○を調べて」,Web検索:🔍 Web検索\n\n「○○を検索して」\n→ 最新情報をWeb検索,天気:🌤 天気\n\n「今日の天気」「倉敷の天気」\n→ 天気予報を取得,返信作成:✉️ 返信作成\n\n「返信開始」→ 返信作成モードON\n① お客様メッセージ ② 伝えたいこと\n→ 丁寧な返信文を生成\n「返信終了」で通常モードに戻る,口調変更:🗣 口調変更\n\n「口調変更」→ 設定メニュー表示\n丁寧/フレンドリー/ビジネス/カスタム,コスト管理:💰 コスト管理\n\n「残高確認」→ 今月のAPI利用状況を表示'.split(',');
for(var i=0;i<d.length;i++){var sp=d[i].indexOf(':'),k=d[i].slice(0,sp),v=d[i].slice(sp+1);m[k+'ヘルプ']=v;}
var care='議事録:📝 議事録の作り方\n\n① PlauDの文字起こしをGoogle Docsに貼付\n② DocsのURLをLINEに送信\n③「議事録にまとめて」と一言添える\n→ 担当者会議録フォーマットに自動整形！\n\nLINEに直接メモを送ってもOK,ケアプラン:📄 ケアプラン下書き\n\n「ケアプランの下書き作って」\n「アセスメントからニーズ整理して」\n「モニタリングまとめて」\n\nDocsのURLを送れば読み取って整形します,研修資料:📑 研修資料作成\n\n「○○について研修資料の叩き台作って」\n「この内容をスライド構成にして」\n\nテーマを伝えるだけでAIが構成・内容を提案,申し送り:📋 申し送り検索\n\n「○○さんのメモ確認」→ 利用者名で検索\n「メモ一覧」→ 最近のメモを表示\n「○○さんの書類」→ Driveから検索,訪問予定:📅 訪問予定管理\n\n「火曜10時に○○さん訪問」→ 即登録\n「来週の空き時間」→ 30分単位で空き表示\n「今日の訪問予定」→ 一覧表示,服薬リマインド:💊 服薬・処置リマインド\n\n「毎週月曜に○○さんの服薬確認」\n「毎月1日にモニタリング」\n→ 繰り返しリマインダーで自動化'.split(',');
for(var j=0;j<care.length;j++){var sp2=care[j].indexOf(':'),k2=care[j].slice(0,sp2),v2=care[j].slice(sp2+1);m[k2+'ヘルプ']=v2;}
m['ヘルプ']=1;return m;})();
function getCategoryHelp(message){return _HELP_MAP[message]||null;}
function helpText(){var jt='general';try{var cs=_getCmsSettings();if(cs&&cs.job_type)jt=cs.job_type;}catch(e){}
if(jt==='care_manager')return'【いつでも秘書 ケアマネ版】\n\n📝議事録作成 / 📄ケアプラン下書き / 📑研修資料\n📅訪問予定管理 / 🕐空き時間検索\n📋申し送りメモ / ✅タスク管理\n📁ドキュメント / 📁ドライブ / 📸写真保存\n⏰リマインダー / 💊服薬リマインド / ☀️朝の確認\n📧メール / ✉️返信作成 / 🔍Web検索 / 🌤天気\n\n「ヘルプ」でカードメニューを表示';
return'【LINE AI秘書 機能一覧】\n\n📧Gmail / 📅カレンダー / 📄ドキュメント\n📊スプレッドシート / 📁ドライブ / 📸写真保存\n📝メモ / ✅タスク / 📊レポート\n⏰リマインダー / 🎂誕生日 / ☀️朝のスケジュール確認\n🌐URL要約 / 🗺経路 / 🏨ホテル\n🌍翻訳 / ✏️文章校正 / 💬AIチャット\n🔍Web検索 / 🌤天気 / ✉️返信作成\n\n「ヘルプ」でカードメニューを表示';}
function setupReminderTrigger() {
var triggers = ScriptApp.getProjectTriggers();
for (var i = 0; i < triggers.length; i++) {if(triggers[i].getHandlerFunction()==='checkReminders')return;}
ScriptApp.newTrigger('checkReminders').timeBased().everyMinutes(5).create();
}
var _CAROUSEL_DATA='Googleサービス|Gmail・カレンダー・書類|📧 Gmail|Gmailヘルプ|📅 カレンダー|カレンダーヘルプ|📄 ドキュメント|ドキュメントヘルプ;Googleサービス②|ファイル・シート管理|📊 スプレッドシート|スプレッドシートヘルプ|📁 ドライブ|ドライブヘルプ|📸 写真保存|写真保存ヘルプ;メモ・タスク管理|やることと記録を管理|📝 メモ|メモヘルプ|✅ タスク|タスクヘルプ|📊 レポート作成|レポートヘルプ;リマインダー|通知・スケジュール自動化|⏰ リマインダー|リマインダーヘルプ|🎂 誕生日リマインダー|誕生日リマインダーヘルプ|☀️ 朝のスケジュール確認|朝のスケジュール確認ヘルプ;検索・移動|調べる・探す|🌐 URL要約|URL要約ヘルプ|🗺 経路・乗換|経路・ホテルヘルプ|🏨 ホテル検索|経路・ホテルヘルプ;便利ツール①|翻訳・校正・AIチャット|🌍 翻訳・計算|翻訳ヘルプ|✏️ 文章校正|文章校正ヘルプ|💬 AIチャット|AIチャットヘルプ;便利ツール②|検索・天気・返信作成|🔍 Web検索|Web検索ヘルプ|🌤 天気|天気ヘルプ|✉️ 返信作成モード|返信作成ヘルプ;カスタマイズ|口調・コスト管理|🗣 口調変更|口調変更ヘルプ|💰 コスト確認|コスト管理ヘルプ|❓ その他の使い方|ヘルプ'.split(';').map(function(s){return s.split('|');});
var _CAROUSEL_DATA_CARE='📝 議事録・書類作成|PlauD文字起こし→整形もOK|📝 議事録作成|議事録ヘルプ|📄 ケアプラン|ケアプランヘルプ|📑 研修資料|研修資料ヘルプ;📅 訪問予定管理|30分単位で空き時間を表示|📅 今日の予定|今日の予定|🕐 空き時間|来週の空き時間|➕ 予定追加|訪問予定ヘルプ;📋 申し送り・メモ|利用者ごとの記録を管理|📝 メモ保存|メモヘルプ|🔍 メモ検索|申し送りヘルプ|✅ タスク管理|タスクヘルプ;📁 Google連携|Docs・ドライブを声で操作|📄 ドキュメント|ドキュメントヘルプ|📁 ファイル検索|ドライブヘルプ|📸 写真保存|写真保存ヘルプ;⏰ リマインダー|服薬・モニタリング時期も|⏰ リマインダー|リマインダーヘルプ|💊 服薬リマインド|服薬リマインドヘルプ|☀️ 朝の確認|朝のスケジュール確認ヘルプ;✉️ メール・返信|Gmail確認・返信をLINEで|📧 メール確認|Gmailヘルプ|✉️ 返信作成|返信作成ヘルプ|🌐 URL要約|URL要約ヘルプ;🔍 調べもの|天気・経路・Web検索|🔍 Web検索|Web検索ヘルプ|🌤 天気|天気ヘルプ|🗺 経路検索|経路・ホテルヘルプ;⚙️ 設定|口調・コスト管理|🗣 口調変更|口調変更ヘルプ|💰 コスト確認|コスト管理ヘルプ|❓ 使い方|ヘルプ'.split(';').map(function(s){return s.split('|');});
function getCarouselMessage() {
var jt='general';try{var cs=_getCmsSettings();if(cs&&cs.job_type)jt=cs.job_type;}catch(e){}
var data=(jt==='care_manager')?_CAROUSEL_DATA_CARE:_CAROUSEL_DATA;
var alt=(jt==='care_manager')?'いつでも秘書 ケアマネ版 機能一覧':'LINE AI秘書 機能一覧';
var cols=[];for(var i=0;i<data.length;i++){var d=data[i];cols.push({title:d[0],text:d[1],actions:[{type:'message',label:d[2],text:d[3]},{type:'message',label:d[4],text:d[5]},{type:'message',label:d[6],text:d[7]}]});}
return{type:'template',altText:alt,template:{type:'carousel',columns:cols}};
}
function sendCarousel(replyToken) {
var c=getConfig();if(!c.LINE_TOKEN)return false;
try{var res=UrlFetchApp.fetch(_LINE_REPLY_URL,{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+c.LINE_TOKEN},payload:JSON.stringify({replyToken:replyToken,messages:[getCarouselMessage()]}),muteHttpExceptions:true});return res.getResponseCode()===200;}catch(e){return false;}
}
function pushCarousel(userId) {
var c=getConfig();if(!c.LINE_TOKEN||!userId)return;
_lineMsg(_LINE_PUSH_URL,c.LINE_TOKEN,{to:userId,messages:[getCarouselMessage()]});
}
function sendDemoEmails() {
if(_P().getProperty('DEMO_MODE')!=='TRUE')return;
var cfg=getConfig(),count=parseInt(_P().getProperty('demo_count_'+(cfg.USER_ID||''))||'0');
if(count>=10)return;
var me=Session.getActiveUser().getEmail(),d=_F(new Date(),'M月d日');
[['株式会社田中商事 田中様より','先日のご提案についてご確認いただきたく、資料を添付いたします。\nご都合のよい日程でお打ち合わせをお願いできますでしょうか。\n\n田中商事 田中一郎'],
['来週の会議室予約について','総務部です。\n来週月曜日14時から会議室Aを予約しました。\n出席者の皆様はご確認ください。\n\n総務部 山本'],
['月次レポートのご確認依頼','お疲れ様です。\n今月の月次レポートをお送りします。\n内容をご確認の上、承認をお願いいたします。\n期限：今週金曜日まで\n\n経理部 佐藤花子']
].forEach(function(e){GmailApp.sendEmail(me,'【'+d+'】'+e[0],e[1]);});
}
function setupDemoEmailTrigger() {
_setupTrigger('sendDemoEmails');
ScriptApp.newTrigger('sendDemoEmails').timeBased().atHour(8).everyDays(1).create();
}
function dailyClearCache() {
CacheService.getScriptCache().remove('remote_code_v1');
try { dailyBackup(); } catch(e) {}
try { cleanOldAiLogs(); } catch(e) {}
}
function cleanOldAiLogs() {
var cp=_getCmsProps();if(!cp.sbUrl||!cp.sbKey)return;
var cutoff=new Date(Date.now()-30*86400000).toISOString();
UrlFetchApp.fetch(cp.sbUrl+'/rest/v1/ai_logs?created_at=lt.'+cutoff,{method:'delete',headers:_sbHeaders(cp.sbKey),muteHttpExceptions:true});
}
function dailyBackup() {
var p=_P(),ssId=p.getProperty('DATA_SS_ID');if(!ssId)return;
var ss;try{ss=SpreadsheetApp.openById(ssId);}catch(e){return;}
var bd={};['タスク','メモ','リマインダー'].forEach(function(n){var s=ss.getSheetByName(n);if(s&&s.getLastRow()>0)bd[n]=s.getDataRange().getValues();});
if(!Object.keys(bd).length)return;
var fid=p.getProperty('BACKUP_FOLDER_ID'),folder;
if(fid)try{folder=DriveApp.getFolderById(fid);}catch(e){folder=null;}
if(!folder){folder=DriveApp.createFolder('LINE秘書バックアップ');p.setProperty('BACKUP_FOLDER_ID',folder.getId());}
var fn='backup_'+_F(new Date(),'yyyy-MM-dd')+'.json';if(folder.getFilesByName(fn).hasNext())return;
folder.createFile(fn,JSON.stringify(bd,null,2),'application/json');
var fs=folder.getFiles(),all=[];while(fs.hasNext())all.push(fs.next());
all.sort(function(a,b){return a.getDateCreated()-b.getDateCreated();});while(all.length>7)all.shift().setTrashed(true);
}
function setupDailyCacheClearTrigger() {
_setupTrigger('dailyClearCache');
ScriptApp.newTrigger('dailyClearCache').timeBased().atHour(3).everyDays(1).create();
}
function dailyCheck(){var c=getConfig(),p=_P(),iss=[],fix=[];
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
function getCategoryHelpMap(){return _HELP_MAP;}
function setupDailyCheckTrigger() {
_setupTrigger('dailyCheck');
ScriptApp.newTrigger('dailyCheck').timeBased().atHour(0).everyDays(1).create();
}
function testAllPermissions() {
GmailApp.search('is:unread in:inbox',0,1);
var me=Session.getActiveUser().getEmail();GmailApp.sendEmail(me,'[LINE AI秘書] 権限テスト','このメールは削除してください。');
var cal=CalendarApp.getDefaultCalendar(),s=new Date();s.setDate(s.getDate()+1);s.setHours(23,0,0,0);
cal.createEvent('権限テスト',s,new Date(s.getTime()+1800000)).deleteEvent();
function _tc(fn){var id=fn.getId();try{if(fn.saveAndClose)fn.saveAndClose();}catch(e){}DriveApp.getFileById(id).setTrashed(true);}
_tc(SpreadsheetApp.create('権限テスト（削除OK）'));_tc(DocumentApp.create('権限テスト（削除OK）'));
_tc(FormApp.create('権限テスト（削除OK）'));_tc(SlidesApp.create('権限テスト（削除OK）'));
getDataSheet('メモ');setupReminderTrigger();setupBriefingTrigger();setupDailyCacheClearTrigger();setupDailyCheckTrigger();
if(_P().getProperty('DEMO_MODE')==='TRUE')setupDemoEmailTrigger();
}
function testSetup() {}
function _getCmsAccountStatus() {
var cp=_getCmsProps();if(!cp.clientId)return'active';
var cache=SCRIPT_CACHE,ck='cms_status_'+cp.clientId,cached=cache.get(ck);
if(cached)return cached;
try{var res=_sbGet(cp.sbUrl,cp.sbKey,'accounts?id=eq.'+cp.clientId+'&select=status');if(res.getResponseCode()!==200)return'active';var d=_safeJson(res.getContentText());var st=(d&&d[0])?d[0].status:'active';try{cache.put(ck,st,60);}catch(e){}return st;}catch(e){return'active';}
}
function _getCmsSettings() {
var cp=_getCmsProps();if(!cp.clientId)return null;
var cache=SCRIPT_CACHE,ck='cms_settings_'+cp.clientId,cached=cache.get(ck);
if(cached){try{return JSON.parse(cached);}catch(e){}}
try{var res=_sbGet(cp.sbUrl,cp.sbKey,'account_settings?account_id=eq.'+cp.clientId+'&select=*');if(res.getResponseCode()!==200)return null;var d=_safeJson(res.getContentText());if(!d||!d.length)return null;try{cache.put(ck,JSON.stringify(d[0]),60);}catch(e){}return d[0];}catch(e){return null;}
}
function createCarePlanSheet(ssId){try{var ss=SpreadsheetApp.openById(ssId);if(ss.getSheetByName('担当者会議記録'))return;var sh=ss.insertSheet('担当者会議記録');var hd=['日付','利用者名','出席者','決定事項','次回会議予定','担当CM備考','作成日時'];sh.getRange(1,1,1,hd.length).setValues([hd]);var hr=sh.getRange(1,1,1,hd.length);hr.setBackground('#1E4E8C');hr.setFontColor('#FFFFFF');hr.setFontWeight('bold');sh.setColumnWidth(1,100);sh.setColumnWidth(2,120);sh.setColumnWidth(3,200);sh.setColumnWidth(4,300);sh.setFrozenRows(1);}catch(e){}}