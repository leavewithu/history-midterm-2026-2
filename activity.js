'use strict';
(() => {
  const A=window.HistoryActivityCore,$=s=>document.querySelector(s);
  const e=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const icons=()=>window.lucide?.createIcons({attrs:{width:18,height:18,'aria-hidden':'true'}});
  const time=v=>new Date(v).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const duration=ms=>`${Math.floor(ms/3600000)}시간 ${Math.floor(ms%3600000/60000)}분 ${Math.floor(ms%60000/1000)}초`;
  let sequence=0;
  const uid=()=>`a-${Date.now()}-${String(++sequence).padStart(6,'0')}-${window.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)}`;
  const page=document.body.dataset.studyPage||'learn', pointerKey=A.schema+'-tab';
  let state=A.empty(),storageOK=true,selected=A.day(Date.now()),lastContext='',tracker;
  const connections=new Map(),pendingAnswers=new Map(),connectionStatus=new Map();
  try {const raw=localStorage.getItem(A.schema);if(raw) state=A.validate(JSON.parse(raw));} catch {storageOK=false;}
  function persist() {
    if(storageOK) try {
      const raw=localStorage.getItem(A.schema);if(raw) tracker.state=A.merge(A.validate(JSON.parse(raw)),tracker.state);
      localStorage.setItem(A.schema,JSON.stringify(tracker.state));state=tracker.state;
    } catch {storageOK=false;}
    try {tracker.current?sessionStorage.setItem(pointerKey,JSON.stringify(tracker.current)):sessionStorage.removeItem(pointerKey);} catch {}
    if(tracker.current) ensureCloud(tracker.current.day);
    for(const cloud of connections.values()) cloud.queue();
    updateControls();
  }
  tracker=new A.Tracker({state,save:persist,page,uid});
  try {tracker.recover(JSON.parse(sessionStorage.getItem(pointerKey)||'null'));} catch {}
  function updateControls() {
    const s=tracker.session(),running=s?.status==='running';
    $('#activity-start').hidden=!!running;
    $('#activity-start-label').textContent=s?.status==='paused'?'학습 계속':'학습 시작';
    $('#activity-pause').hidden=!running;$('#activity-finish').disabled=!s;
    $('#activity-clock').textContent=s?duration(s.activeMs+(running?Math.max(0,Math.min(Date.now(),tracker.lastInput+tracker.idleMs)-tracker.lastTick):0)):'0시간 0분 0초';
    $('#activity-state').textContent=running?'학습 중':s?.reason==='idle'?'5분간 입력 없음 · 일시정지':s?.status==='paused'?'일시정지':'학습 대기';
    $('#activity-local-warning').hidden=storageOK;
  }
  function ensureCloud(key) {
    if(connections.has(key)) return connections.get(key);
    if(!window.HISTORY_CLOUD_URL||!window.HistoryCloud) return null;
    const cloud=window.HistoryCloud.connect({url:window.HISTORY_CLOUD_URL.replace(/history_v1$/,'history_activity_v1'),scope:key,
      getState:()=>tracker.state.days[key]||A.emptyDay(),encode:value=>value,
      decodeState:raw=>({state:A.validateDay(raw,key),rejected:0}),diff:A.changes,
      receive:incoming=>{
        const merged=A.merge(tracker.state,{version:1,days:{[key]:incoming}});
        if(JSON.stringify(merged)!==JSON.stringify(tracker.state)) {tracker.state=merged;persist();render();}
      },status:(text,bad)=>{connectionStatus.set(key,{text,bad});if(key===selected) updateCloudStatus();}});
    connections.set(key,cloud);return cloud;
  }
  function updateCloudStatus() {
    const status=connectionStatus.get(selected);
    if($('#activity-cloud-status')) {$('#activity-cloud-status').textContent=status?.text||'이 기기의 기록';$('#activity-cloud-status').classList.toggle('save-warning',!!status?.bad);}
  }
  function context() {
    let topic=0,label=document.title.split(' · 역사')[0],ref=page;
    if(page==='learn') {
      const tab=document.querySelector('[data-tab][aria-current]')?.dataset.tab||'memory';
      if(tab==='activity') return null;
      label=document.querySelector(`[data-tab="${tab}"]`)?.textContent.trim()||label;ref=tab;
      if(tab==='memory') topic=Number($('#memory-topic-label')?.textContent.match(/주제 (\d+)/)?.[1])||0;
    } else if(page==='study'||page==='practice') {
      const sections=[...document.querySelectorAll('section[id^="topic-"]')];
      const visible=sections.filter(s=>s.getBoundingClientRect().bottom>100).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0];
      topic=Number(visible?.id.slice(6))||0;label=visible?.querySelector('h2')?.textContent||label;ref=visible?.id||ref;
    }
    return {topic,label,ref};
  }
  function view() {
    const c=context();if(!c||tracker.session()?.status!=='running') return;
    const key=JSON.stringify(c);if(key===lastContext) return;lastContext=key;tracker.record('view',c);
  }
  function record(type,details) {flushAnswers();tracker.record(type,details);view();render();}
  function flushAnswers() {
    for(const [key,item] of pendingAnswers) {clearTimeout(item.timer);pendingAnswers.delete(key);tracker.record('answer',item.details);}
  }
  function answer(details) {
    tracker.touch();if(!tracker.session()&&tracker.auto) tracker.start();
    const key=details.ref,old=pendingAnswers.get(key);if(old) clearTimeout(old.timer);
    const item={details,timer:setTimeout(()=>{pendingAnswers.delete(key);tracker.record('answer',details);render();},900)};pendingAnswers.set(key,item);
  }
  function render() {
    if(!$('#activity-sessions')||$('#view-activity').hidden) return;
    const data=tracker.state.days[selected]||A.emptyDay(),sessions=Object.values(data.sessions).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
    const events=Object.values(data.events),total=sessions.reduce((n,s)=>n+s.activeMs,0);
    $('#activity-total').textContent=duration(total);$('#activity-session-count').textContent=`${sessions.length}구간`;
    $('#activity-memory-count').textContent=`${events.filter(v=>v.type==='rate').length}개`;
    $('#activity-exam-count').textContent=`${events.filter(v=>v.type==='submit').length}회`;
    const open=new Set([...document.querySelectorAll('[data-activity-session][open]')].map(n=>n.dataset.activitySession));
    const labels={running:'학습 중',paused:'일시정지',ended:'종료',interrupted:'마지막 저장까지'};
    const pageNames={home:'공부 자료',study:'전체 요약',learn:'암기·시험',practice:'기본 연습',answers:'답지·채점'};
    const typeNames={start:'시작',pause:'일시정지',resume:'계속',finish:'종료',view:'열어봄',reveal:'정답 확인',rate:'암기 판단',answer:'답 입력',submit:'채점',recognize:'직접 인정',round:'복습',filter:'범위 선택'};
    $('#activity-empty').hidden=!!sessions.length;
    $('#activity-sessions').innerHTML=sessions.map(s=>{
      const items=events.filter(v=>v.sessionId===s.id).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
      const topics=[...new Set(items.map(v=>v.topic).filter(Boolean))].sort((a,b)=>a-b);
      const end=s.endedAt||s.updatedAt;
      return `<details data-activity-session="${s.id}" ${open.has(s.id)?'open':''}><summary><span class="activity-interval">${time(s.startedAt)} ~ ${s.status==='running'?'진행 중':time(end)}</span><span>${duration(s.activeMs)}</span><span class="meta">${topics.length?'주제 '+topics.join('·'):'전체 범위'} · ${items.length}개 활동</span><strong>${labels[s.status]}</strong></summary><ol class="activity-events">${items.map(v=>`<li><time datetime="${v.at}">${time(v.at)}</time><div><strong>${typeNames[v.type]}${v.topic?' · 주제 '+v.topic:''}</strong><span>${e(v.label||pageNames[v.page])}</span>${v.value?`<span class="activity-value">${e(v.value)}</span>`:''}</div></li>`).join('')}</ol></details>`;
    }).join('');updateCloudStatus();
  }
  function selectDate(key) {
    if(!A.dayOK(key)) return;selected=key;$('#activity-date').value=key;
    for(const [date,cloud] of connections) if(date!==key&&date!==tracker.current?.day&&date!==A.day(Date.now())&&!cloud.pending()) {cloud.stop();connections.delete(date);}
    ensureCloud(key)?.sync();render();
  }
  $('#activity-start').addEventListener('click',()=>{tracker.start();lastContext='';view();render();});
  $('#activity-pause').addEventListener('click',()=>{flushAnswers();tracker.pause();render();});
  $('#activity-finish').addEventListener('click',()=>{flushAnswers();tracker.finish();for(const c of connections.values()) if(c.pending()) c.sync();render();});
  $('#activity-date')?.addEventListener('change',event=>selectDate(event.target.value));
  for(const [id,delta] of [['activity-prev',-1],['activity-next',1]]) $('#'+id)?.addEventListener('click',()=>selectDate(new Date(Date.parse(selected+'T12:00:00Z')+delta*86400000).toISOString().slice(0,10)));
  $('#activity-today')?.addEventListener('click',()=>selectDate(A.day(Date.now())));
  $('#activity-retry')?.addEventListener('click',()=>ensureCloud(selected)?.sync());
  const touch=()=>{if(tracker.session()?.status==='running'||tracker.session()?.reason==='idle') tracker.touch();};
  let scrollTimer;window.addEventListener('scroll',()=>{touch();clearTimeout(scrollTimer);scrollTimer=setTimeout(view,400);},{passive:true});
  document.addEventListener('pointerdown',touch,{passive:true});document.addEventListener('keydown',touch);
  document.addEventListener('click',()=>setTimeout(view,0));
  $('#practice')?.addEventListener('input',event=>{
    const ref=event.target.name;if(!ref) return;
    answer({ref,topic:Number(ref.match(/^T(\d+)/)?.[1])||0,label:'기본 연습 · '+ref,value:'답 입력 · 답안 내용은 이 기기에만 보관'});
  });
  document.addEventListener('history-basic-grade',event=>record('submit',{ref:'basic',label:'기본 연습 채점',value:event.detail}));
  document.addEventListener('focusout',flushAnswers);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden) {flushAnswers();tracker.pause('hidden');render();}
    else {if(tracker.session()?.reason==='hidden') tracker.resume();updateControls();view();ensureCloud(A.day(Date.now()))?.sync();}
  });
  window.addEventListener('pagehide',()=>{flushAnswers();if(tracker.session()?.status==='running'||tracker.session()?.reason==='hidden') {if(tracker.session().status==='running') tracker.pause('navigation');else {tracker.session().reason='navigation';persist();}}for(const c of connections.values()) if(c.pending()) c.sync();});
  window.addEventListener('pageshow',event=>{if(event.persisted&&tracker.session()?.reason==='navigation') {tracker.resume();view();}});
  window.addEventListener('online',()=>{for(const c of connections.values()) c.sync();});
  window.addEventListener('storage',event=>{if(event.key!==A.schema||!event.newValue) return;try {tracker.state=A.merge(tracker.state,A.validate(JSON.parse(event.newValue)));updateControls();render();} catch {}});
  setInterval(()=>{tracker.checkpoint();updateControls();render();},15000);
  setInterval(updateControls,1000);
  window.HistoryActivity={record,answer,flush:flushAnswers,show:()=>{selectDate(selected);render();},snapshot:()=>{flushAnswers();tracker.checkpoint();return A.validate(tracker.state);},validate:A.validate,
    restore:incoming=>{tracker.state=A.merge(tracker.state,A.validate(incoming));persist();for(const key of Object.keys(incoming.days)) ensureCloud(key)?.sync();render();}};
  updateControls();icons();if($('#activity-date')) $('#activity-date').value=selected;
  // Old offline days are retried once; only the visible day and current day keep polling.
  for(const key of new Set([...Object.keys(tracker.state.days),selected])) {
    const c=ensureCloud(key);c?.sync().then(()=>{if(key!==selected&&key!==tracker.current?.day) {c.stop();connections.delete(key);}});
  }
  view();render();
})();
