'use strict';
(() => {
  const H=window.HistoryTraining;
  const {materials,data}=JSON.parse(document.querySelector('#training-data').textContent);
  const bank=H.buildBank(data), storageKey=H.schema;
  const topics=Object.fromEntries(materials.topics.map(t=>[t.id,t]));
  const $=selector=>document.querySelector(selector);
  const e=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
  const icon=name=>`<i data-lucide="${name}" aria-hidden="true"></i>`;
  const icons=()=>window.lucide?.createIcons({attrs:{width:18,height:18,'aria-hidden':'true','stroke-width':1.8}});
  const date=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const uid=()=>`s-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  let state=H.emptyState(), storageOK=true, lastSavedRaw=null, tab='memory', session=null, shownAttempt=null;
  let memoryFilter='all', memoryQueue=[], memoryPosition=0, wrongFilter='open',cloud=null;
  function message(text,bad=false) {
    $('#storage-status').textContent=text+(!storageOK&&!text.includes('저장')?' · 브라우저 저장 불가: 기록 백업으로 보관해 주세요.':'');
    $('#storage-status').classList.toggle('save-warning',bad||!storageOK);
  }
  try { const saved=localStorage.getItem(storageKey); if(saved) state=H.validate(JSON.parse(saved),bank); lastSavedRaw=saved; }
  catch { storageOK=false; message('기존 저장 기록을 읽을 수 없습니다. 기존 데이터는 덮어쓰지 않으며, 현재 풀이는 기록 백업으로 보관할 수 있습니다.',true); }
  function save() {
    if(!storageOK) {cloud?.queue();return;}
    try {
      const saved=localStorage.getItem(storageKey);
      if(saved&&saved!==lastSavedRaw) state=H.merge(H.validate(JSON.parse(saved),bank),state);
      const raw=JSON.stringify(state);
      localStorage.setItem(storageKey,raw);lastSavedRaw=raw;
      message('이 브라우저에 학습 기록 저장됨');
    } catch { storageOK=false; message('브라우저 저장을 사용할 수 없습니다. 현재 기록은 이 창에서 유지되며 기록 백업으로 보관할 수 있습니다.',true); }
    cloud?.queue();
  }
  if(storageOK) message('기록을 불러왔습니다.');
  function sources(topic,photo=false) {
    const t=topics[topic];
    if(materials.public) return `<div class="sources"><a href="study.html#topic-${topic}">주제 ${topic} 요약</a><span>프린트 ${t.print_page}쪽 · 자습서 ${t.book.map(b=>b.page).join('·')}쪽</span></div>`;
    const src=`assets/handouts/topic${topic}_p${String(t.print_page).padStart(2,'0')}.jpg`;
    return `<div class="sources"><a href="study.html#topic-${topic}">주제 ${topic} 요약</a><a href="${src}" target="_blank" rel="noopener">프린트 ${t.print_page}쪽</a>${t.book.map(b=>`<a href="assets/selfstudy/topic${topic}_p${b.page}.jpg" target="_blank" rel="noopener">자습서 ${b.page}쪽${b.page_inferred?'(추정)':''}</a>`).join('')}</div>${photo?`<details class="recall-source"><summary>원자료 보기</summary><a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${e(t.title)} 프린트 ${t.print_page}쪽" width="360" height="510"></a></details>`:''}`;
  }
  function badge() { $('#wrong-badge').textContent=Object.values(state.wrong).filter(w=>w.active).length; }
  function showTab(name) {
    tab=name;
    document.querySelectorAll('[data-tab]').forEach(b=>name===b.dataset.tab?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current'));
    document.querySelectorAll('.learning-view').forEach(view=>view.hidden=view.id!==`view-${name}`);
    if(name==='memory') { updateMemoryQueue(); renderMemory(); }
    if(name==='exams' && !session && !shownAttempt) renderExams();
    if(name==='wrong') renderWrong();
    if(name==='history') renderHistory();
    badge(); icons();
  }
  function updateMemoryQueue(mix=false) {
    const topic=$('#memory-topic').value;
    memoryQueue=bank.concepts.filter(c=>(topic==='all'||c.topic===Number(topic)) && (memoryFilter==='all'||memoryFilter==='new'&&!state.memory[c.id]||memoryFilter==='hard'&&(state.memory[c.id]?.rating==='hard'||state.wrong[c.id]?.active)));
    if(mix) memoryQueue=H.shuffle(memoryQueue,uid());
    memoryPosition=0;
  }
  function renderMemory() {
    const known=Object.values(state.memory).filter(m=>m.rating==='known').length;
    $('#memory-progress').textContent=`기억 완료 ${known} / ${bank.concepts.length}개`;
    $('#memory-empty').hidden=memoryQueue.length>0;
    $('#memory-tool').hidden=!memoryQueue.length;
    if(!memoryQueue.length) return;
    memoryPosition=(memoryPosition+memoryQueue.length)%memoryQueue.length;
    const c=memoryQueue[memoryPosition];
    $('#memory-topic-label').textContent=`주제 ${c.topic} · ${topics[c.topic].title}`;
    $('#memory-position').textContent=`${memoryPosition+1} / ${memoryQueue.length}`;
    $('#memory-prompt').textContent=c.asks[0];
    $('#memory-answer').value='';
    $('#memory-correct').textContent=c.answer;
    $('#memory-detail').textContent=c.detail;
    $('#memory-source').innerHTML=sources(c.topic,true);
    $('#memory-solution').hidden=true;
    $('#memory-reveal').hidden=false;
  }
  $('#memory-reveal').addEventListener('click',()=>{ $('#memory-solution').hidden=false; $('#memory-reveal').hidden=true; });
  $('#memory-answer').addEventListener('keydown',event=>{if(event.key==='Enter') {event.preventDefault(); $('#memory-reveal').click();}});
  for(const rating of ['hard','known']) $(`#memory-${rating}`).addEventListener('click',()=>{
    const c=memoryQueue[memoryPosition]; if(!c) return;
    state.memory[c.id]={rating,updatedAt:new Date().toISOString()}; save();
    if(memoryFilter==='new'||memoryFilter==='hard'&&rating==='known'&&!state.wrong[c.id]?.active) memoryQueue.splice(memoryPosition,1);
    else memoryPosition++;
    renderMemory();
  });
  $('#memory-prev').addEventListener('click',()=>{memoryPosition--;renderMemory();});
  $('#memory-next').addEventListener('click',()=>{memoryPosition++;renderMemory();});
  $('#memory-topic').addEventListener('change',()=>{updateMemoryQueue();renderMemory();});
  $('#memory-shuffle').addEventListener('click',()=>{updateMemoryQueue(true);renderMemory();});
  document.querySelectorAll('[data-memory-filter]').forEach(b=>b.addEventListener('click',()=>{
    memoryFilter=b.dataset.memoryFilter;
    document.querySelectorAll('[data-memory-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    updateMemoryQueue();renderMemory();
  }));
  function renderExams() {
    $('#exam-list').hidden=false; $('#workbench').hidden=true;
    $('#exam-rows').innerHTML=Array.from({length:6},(_,i)=>{
      const round=i+1, draft=state.drafts[`paper-${round}`], attempts=state.attempts.filter(a=>a.kind==='paper'&&a.round===round);
      const latest=attempts.at(-1), best=attempts.length?Math.max(...attempts.map(a=>a.score)):null;
      const count=draft?Object.values(draft.answers).filter(v=>v.trim()).length:0;
      return `<tr><td><strong>혼합 ${round}회</strong></td><td>객관식 20 · 단답형 10</td><td>${draft?`진행 중 ${count}/30`:latest?`${attempts.length}회 완료`:'미시작'}</td><td>${best===null?'미응시':`${best}/30 · ${Math.round(best/30*100)}점`}</td><td><div class="actions"><button data-paper="${round}">${icon(draft?'play':'pencil-line')}${draft?'이어풀기':'풀기'}</button>${latest?`<button data-attempt="${latest.id}">${icon('list-checks')}최근 결과</button>`:''}</div></td></tr>`;
    }).join('');
    $('#resume-review').innerHTML=state.drafts.review?`<button id="resume-review-button">${icon('play')}진행 중인 변형 재시험 이어풀기</button>`:'';
    icons();
  }
  function startPaper(round) {
    const key=`paper-${round}`;
    session=state.drafts[key] || {id:uid(),key,kind:'paper',round,title:`전 범위 혼합 ${round}회`,questionIds:H.paper(bank,round).map(q=>q.id),answers:{},updatedAt:new Date().toISOString()};
    state.drafts[key]=session; shownAttempt=null;save(); renderSession();showTab('exams');
  }
  function startReview(ids) {
    if(state.drafts.review) {session=state.drafts.review;shownAttempt=null;renderSession();showTab('exams');return;}
    const questions=H.review(bank,state,ids);
    if(!questions.length) {message('재시험으로 확인할 오답이 없습니다.');return;}
    session={id:uid(),key:'review',kind:'review',round:null,title:`오답 변형 재시험 · ${questions.length}문항`,questionIds:questions.map(q=>q.id),answers:{},updatedAt:new Date().toISOString()};
    state.drafts.review=session;shownAttempt=null;save();renderSession();showTab('exams');
  }
  function questionHtml(q,i,answer) {
    return `<div class="question" data-training-question="${q.id}"><${q.type==='short'?'label':'div'} class="prompt" ${q.type==='short'?`for="answer-${q.id}"`:`id="prompt-${q.id}"`}><span class="qtag">${i+1} · ${q.type==='short'?'단답형':'객관식'}</span>${e(q.prompt)}</${q.type==='short'?'label':'div'}>${q.type==='short'?`<input id="answer-${q.id}" name="${q.id}" type="text" autocomplete="off" maxlength="200" value="${e(answer||'')}">`:`<div class="options choices" role="radiogroup" aria-labelledby="prompt-${q.id}">${q.options.map((value,n)=>`<label><input type="radio" name="${q.id}" value="${e(value)}" ${answer===value?'checked':''}><span>${n+1}. ${e(value)}</span></label>`).join('')}</div>`}</div>`;
  }
  function progress() {
    const count=Object.values(session.answers).filter(v=>v.trim()).length;
    $('#exam-progress').textContent=`${count} / ${session.questionIds.length}문항 입력`;
    $('#exam-meter').max=session.questionIds.length;$('#exam-meter').value=count;
  }
  function renderSession() {
    $('#exam-list').hidden=true;$('#workbench').hidden=false;
    $('#session-title').textContent=session.title;
    $('#print-session-title').textContent=session.title;
    $('#session-summary').hidden=true;$('#result-tools').hidden=true;$('#submit-exam').hidden=false;$('#exam-meter').hidden=false;
    $('#exam-form').innerHTML=session.questionIds.map((id,i)=>questionHtml(bank.byId[id],i,session.answers[id])).join('');
    progress();icons();
  }
  $('#exam-form').addEventListener('input',event=>{
    if(!session || !session.questionIds.includes(event.target.name)) return;
    session.answers[event.target.name]=event.target.value;
    session.updatedAt=new Date().toISOString();state.drafts[session.key]=session;save();progress();
  });
  $('#exam-form').addEventListener('submit',event=>{
    event.preventDefault();if(!session) return;
    const count=session.questionIds.filter(id=>!session.answers[id]?.trim()).length;
    if(count&&!confirm(`미응답 ${count}문항도 오답 노트에 기록됩니다. 채점할까요?`)) return;
    try {
      const attempt=H.submit(bank,state,session,session.answers);
      session=null;save();showResult(attempt.id);
    } catch(error) {message(error.message,true);}
  });
  function showResult(id) {
    shownAttempt=state.attempts.find(a=>a.id===id);session=null;if(!shownAttempt) return;
    showTab('exams');$('#exam-list').hidden=true;$('#workbench').hidden=false;
    $('#session-title').textContent=shownAttempt.title;
    $('#print-session-title').textContent=shownAttempt.title;
    $('#exam-progress').textContent='채점 완료';$('#exam-meter').hidden=true;$('#submit-exam').hidden=true;
    const incorrect=shownAttempt.results.filter(r=>!r.correct).length;
    $('#session-summary').hidden=false;
    $('#session-summary').textContent=`${shownAttempt.score} / ${shownAttempt.total}문항 정답 · ${Math.round(shownAttempt.score/shownAttempt.total*100)}점 · 오답·미응답 ${incorrect}개 · ${date(shownAttempt.submittedAt)}`;
    $('#result-tools').hidden=false;$('#result-retest').disabled=!incorrect;
    $('#exam-form').innerHTML=shownAttempt.results.map((r,i)=>{
      const q=bank.byId[r.id];
      return `<article class="result ${r.correct?'match':r.given?'review':'empty'}" data-result-id="${r.id}" data-correct="${r.correct}"><strong>${i+1} · ${r.correct?r.manual?'정답 · 표현 직접 인정':'정답':r.given?q.type==='short'?'오답 · 표현 확인 가능':'오답':'미응답'}</strong><p>${e(q.prompt)}</p><p>내 답: ${e(r.given||'미응답')}</p><p><strong>정답: ${e(q.answer)}</strong></p><p>${e(q.why)}</p>${sources(q.topic)}${q.type==='short'&&!r.correct&&r.given?`<button type="button" class="recognize no-print" data-recognize="${q.id}">${icon('badge-check')}같은 뜻의 답으로 인정</button>`:''}</article>`;
    }).join('');
    filterResults();badge();icons();
  }
  function filterResults() {document.querySelectorAll('[data-result-id]').forEach(node=>node.hidden=$('#only-wrong').checked&&node.dataset.correct==='true');}
  $('#only-wrong').addEventListener('change',filterResults);
  $('#result-retest').addEventListener('click',()=>startReview([...new Set(shownAttempt.results.filter(r=>!r.correct).map(r=>r.conceptId))]));
  $('#exam-form').addEventListener('click',event=>{
    const button=event.target.closest('[data-recognize]');if(!button||!shownAttempt) return;
    if(!confirm('입력한 답이 정답과 같은 뜻임을 확인했나요? 정답으로 인정하고 기록을 수정합니다.')) return;
    H.recognize(bank,state,shownAttempt.id,button.dataset.recognize);save();showResult(shownAttempt.id);
  });
  $('#exam-back').addEventListener('click',()=>{session=null;shownAttempt=null;renderExams();});
  $('#print-exam').addEventListener('click',()=>window.print());
  $('#view-exams').addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button) return;
    if(button.dataset.paper) startPaper(Number(button.dataset.paper));
    if(button.dataset.attempt) showResult(button.dataset.attempt);
    if(button.id==='resume-review-button') startReview();
  });
  function visibleWrong() {
    const topic=$('#wrong-topic').value;
    return Object.values(state.wrong).filter(w=>(topic==='all'||w.topic===Number(topic))&&(wrongFilter==='all'||wrongFilter==='open'&&w.active||wrongFilter==='resolved'&&!w.active)).sort((a,b)=>b.wrongCount-a.wrongCount||b.lastWrongAt.localeCompare(a.lastWrongAt));
  }
  function renderWrong() {
    const entries=visibleWrong(), total=Object.values(state.wrong).length, active=Object.values(state.wrong).filter(w=>w.active).length;
    $('#wrong-count').textContent=`복습 필요 ${active}개 · 전체 오답 개념 ${total}개`;
    $('#wrong-empty').hidden=entries.length>0;$('#wrong-table').hidden=!entries.length;$('#select-all-wrong').checked=false;
    $('#wrong-rows').innerHTML=entries.map(w=>{
      const c=bank.byConcept[w.conceptId], q=bank.byId[w.lastWrongQuestionId];
      return `<tr><td><input type="checkbox" data-wrong-id="${c.id}" aria-label="${e(c.name)} 선택"></td><td><strong>${e(c.name)}</strong><span class="meta topic-line">주제 ${c.topic} · ${e(topics[c.topic].title)}</span><details><summary>최근 오답 확인</summary><p>${e(q.prompt)}</p><p>내 답: ${e(w.lastAnswer||'미응답')} / 정답: ${e(q.answer)}</p><p>${e(q.why)}</p>${sources(c.topic)}</details></td><td>${w.wrongCount}회</td><td><span class="${w.active?'needs-review':'is-resolved'}">${w.active?'복습 필요':'복습 완료'}</span></td><td>${date(w.lastWrongAt)}</td></tr>`;
    }).join('');updateReviewCount();icons();
  }
  function selectedWrong() {return [...document.querySelectorAll('[data-wrong-id]:checked')].map(n=>n.dataset.wrongId);}
  function updateReviewCount() {
    const selected=selectedWrong(), available=selected.length || visibleWrong().length;
    $('#review-count').textContent=state.drafts.review?'진행 중인 재시험이 있습니다.':`${selected.length?'선택':'현재 목록'} ${available}개 · 이번 재시험 ${Math.min(30,available)}문항`;
    $('#start-review').disabled=!available&&!state.drafts.review;
    $('#start-review').innerHTML=icon(state.drafts.review?'play':'repeat-2')+(state.drafts.review?'변형 재시험 이어풀기':'변형 재시험');icons();
  }
  $('#start-review').addEventListener('click',()=>{const ids=selectedWrong();startReview(ids.length?ids:visibleWrong().map(w=>w.conceptId));});
  $('#wrong-topic').addEventListener('change',renderWrong);
  $('#wrong-rows').addEventListener('change',updateReviewCount);
  $('#select-all-wrong').addEventListener('change',()=>{document.querySelectorAll('[data-wrong-id]').forEach(x=>x.checked=$('#select-all-wrong').checked);updateReviewCount();});
  document.querySelectorAll('[data-wrong-filter]').forEach(b=>b.addEventListener('click',()=>{
    wrongFilter=b.dataset.wrongFilter;document.querySelectorAll('[data-wrong-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderWrong();
  }));
  function renderHistory() {
    const attempts=state.attempts, total=attempts.reduce((n,a)=>n+a.total,0), correct=attempts.reduce((n,a)=>n+a.score,0);
    $('#history-count').textContent=`${attempts.length}회 채점`;
    $('#history-stats').innerHTML=`<div><strong>${attempts.length}회</strong><span>완료한 시험</span></div><div><strong>${total?Math.round(correct/total*100):0}%</strong><span>누적 정답률</span></div><div><strong>${Object.values(state.wrong).filter(w=>!w.active).length}개</strong><span>복습 완료 개념</span></div>`;
    $('#topic-stats').innerHTML=materials.topics.map(t=>{
      const results=attempts.flatMap(a=>a.results).filter(r=>r.topic===t.id), n=results.filter(r=>r.correct).length;
      return `<div><span>${t.id} · ${e(t.title)}</span><progress value="${n}" max="${results.length||1}" aria-label="${e(t.title)} 정답 비율"></progress><span>${n}/${results.length}</span></div>`;
    }).join('');
    $('#history-empty').hidden=attempts.length>0;
    $('#history-rows').innerHTML=[...attempts].reverse().map(a=>`<tr><td>${date(a.submittedAt)}</td><td>${e(a.title)}</td><td>${a.score}/${a.total}</td><td>${Math.round(a.score/a.total*100)}점</td><td><button data-history-attempt="${a.id}">${icon('list-checks')}결과</button></td></tr>`).join('');icons();
  }
  $('#history-rows').addEventListener('click',event=>{const b=event.target.closest('[data-history-attempt]');if(b) showResult(b.dataset.historyAttempt);});
  $('#backup').addEventListener('click',()=>{
    const payload={schema:storageKey,exportedAt:new Date().toISOString(),state};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const localDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const a=document.createElement('a');a.href=url;a.download=`역사_암기혼합시험_학습기록_${localDate}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    message('학습 기록 백업 파일을 만들었습니다.');
  });
  $('#restore').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file) return;
    try {
      if(file.size>25*1024*1024) throw Error('기록 파일이 너무 큽니다.');
      const payload=JSON.parse(await file.text());if(payload.schema!==storageKey) throw Error('이번 암기·혼합 시험의 기록 파일이 아닙니다.');
      state=H.merge(state,H.validate(payload.state,bank));save();session=null;shownAttempt=null;showTab(tab);
      message(`기존 기록과 합쳤습니다. 총 ${state.attempts.length}회 풀이 기록${storageOK?'':' · 브라우저 저장 불가: 다시 백업해 주세요.'}`,!storageOK);
    } catch(error) {message(error.message || '파일을 읽지 못했습니다. 기존 기록은 유지됩니다.',true);}
    event.target.value='';
  });
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
  $('#go-exams').addEventListener('click',()=>showTab('exams'));
  window.addEventListener('storage',event=>{
    if(event.key!==storageKey||!event.newValue) return;
    try {
      state=H.merge(state,H.validate(JSON.parse(event.newValue),bank));badge();
      if(session&&state.attempts.some(a=>a.id===session.id)) {showResult(session.id);message('다른 창에서 채점한 결과를 반영했습니다.');}
      if(tab==='wrong')renderWrong();if(tab==='history')renderHistory();
    }
    catch {message('다른 창의 저장 기록을 읽지 못했습니다. 현재 기록은 유지됩니다.',true);}
  });
  const topicParam=new URLSearchParams(location.search).get('topic');if(Object.hasOwn(topics,topicParam)) $('#memory-topic').value=topicParam;
  const initial=location.hash.slice(1);showTab(['memory','exams','wrong','history'].includes(initial)?initial:'memory');
  if(window.HISTORY_CLOUD_URL && window.HistoryCloud) {
    $('#cloud-bar').hidden=false;
    cloud=window.HistoryCloud.connect({url:window.HISTORY_CLOUD_URL,bank,getState:()=>state,
      status:(text,bad)=>{$('#cloud-status').textContent=text;$('#cloud-status').classList.toggle('save-warning',bad);},
      receive:incoming=>{
        const merged=H.merge(state,incoming);
        if(JSON.stringify(merged)===JSON.stringify(state)) return;
        state=merged;save();badge();
        if(tab==='wrong') renderWrong();
        if(tab==='history') renderHistory();
        if(tab==='exams'&&!session&&!shownAttempt) renderExams();
        if(shownAttempt && !document.activeElement?.closest('#exam-form')) showResult(shownAttempt.id);
        $('#memory-progress').textContent=`기억 완료 ${Object.values(state.memory).filter(m=>m.rating==='known').length} / ${bank.concepts.length}개`;
      }});
    $('#cloud-retry').addEventListener('click',()=>cloud.sync());
    window.addEventListener('online',()=>cloud.sync());
    document.addEventListener('visibilitychange',()=>{if(!document.hidden) cloud.sync();});
    cloud.sync();
  }
})();
