'use strict';
(function(root) {
  const H=typeof module!=='undefined'&&module.exports?require('./training-core.js'):root.HistoryTraining;
  const copy=value=>JSON.parse(JSON.stringify(value));
  function project(state) {
    const attempts={},recognitions={};
    for(const attempt of state.attempts) {
      const base=copy(attempt);
      base.updatedAt=base.submittedAt;
      for(const r of base.results) {
        if(r.manual) {
          (recognitions[base.id]||={})[r.id]=true;
          r.manual=false;
        }
      }
      attempts[base.id]=base;
    }
    return {memory:Object.fromEntries(Object.entries(state.memory).map(([id,m])=>[id,{...m,time:Date.parse(m.updatedAt)}])),attempts,recognitions};
  }
  function decode(raw,bank) {
    const state=H.emptyState();
    let rejected=0;
    if(raw!==null && (!raw||typeof raw!=='object'||Array.isArray(raw))) throw Error('공용 기록 형식을 확인할 수 없습니다.');
    for(const [id,value] of Object.entries(raw?.memory||{})) {
      try { const s=H.emptyState();s.memory[id]=value;Object.assign(state.memory,H.validate(s,bank).memory); }
      catch {rejected++;}
    }
    for(const [id,value] of Object.entries(raw?.attempts||{})) {
      try {
        if(value?.id!==id) throw Error('기록 번호 불일치');
        const s=H.emptyState(), a=copy(value);
        a.answers||={};a.round||=null;
        s.attempts=[a];
        const checked=H.validate(s,bank).attempts[0];
        for(const [qid,recognized] of Object.entries(raw?.recognitions?.[id]||{})) {
          const r=checked.results.find(r=>r.id===qid);
          if(recognized===true && r?.given && bank.byId[qid]?.type==='short') {r.correct=true;r.manual=true;}
        }
        checked.score=checked.results.filter(r=>r.correct).length;
        state.attempts.push(checked);
      } catch {rejected++;}
    }
    if(state.attempts.length>2000) throw Error('공용 기록이 2,000회를 넘었습니다. 기록을 백업해 주세요.');
    state.attempts.sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt)||a.id.localeCompare(b.id));
    return {state:H.rebuildWrong(state),rejected};
  }
  function changes(local,remote) {
    const jobs=[];
    for(const [id,a] of Object.entries(local.attempts)) if(!remote?.attempts?.[id]) jobs.push([`attempts/${id}`,a,true]);
    for(const [id,items] of Object.entries(local.recognitions)) for(const [qid,value] of Object.entries(items))
      if(!remote?.recognitions?.[id]?.[qid]) jobs.push([`recognitions/${id}/${qid}`,value,true]);
    for(const [id,m] of Object.entries(local.memory)) if(!remote?.memory?.[id] || remote.memory[id].updatedAt<m.updatedAt || remote.memory[id].updatedAt===m.updatedAt && m.dueAt && !remote.memory[id].dueAt) jobs.push([`memory/${id}`,m,false]);
    return jobs;
  }
  function connect({url,bank,getState,receive,status,encode=project,decodeState=value=>decode(value,bank),diff=changes,scope='',fetcher=root.fetch?.bind(root),schedule=root.setTimeout?.bind(root),cancel=root.clearTimeout?.bind(root)}) {
    if(!/^https:\/\/[a-z0-9-]+\.(?:firebaseio\.com|(?:[a-z0-9-]+\.)?firebasedatabase\.app)\/history_(?:v1|activity_v1)$/.test(url)||scope&&!/^\d{4}-\d\d-\d\d$/.test(scope)||url.endsWith('/history_activity_v1')!==!!scope) throw Error('온라인 저장소 주소가 올바르지 않습니다.');
    const endpoint=url+(scope?'/'+scope:'');
    let remote=null,busy=false,again=false,stopped=false,timer=null,dirty=false;
    async function request(path,method='GET',value,create=false) {
      const controller=new AbortController(),timeout=schedule(()=>controller.abort(),12000);
      try {
        const response=await fetcher(`${endpoint}${path?'/'+path:''}.json`,{method,cache:'no-store',signal:controller.signal,
          headers:{'Content-Type':'application/json',...(create?{'if-match':'null_etag'}:{})},...(method==='GET'?{}:{body:JSON.stringify(value)})});
        if(response.status===412) return null;
        if(!response.ok) throw Error(`저장소 응답 ${response.status}`);
        return await response.json();
      } finally {cancel(timeout);}
    }
    async function sync() {
      if(stopped) return;
      if(busy) {again=true;return;}
      busy=true;cancel(timer);
      status('공용 기록 연결 중…',false);
      try {
        remote=await request('');
        const decoded=decodeState(remote);
        receive(decoded.state);
        const pending=diff(encode(getState()),remote);
        for(const [path,value,create] of pending) await request(path,'PUT',value,create);
        // Read back after writes, including records another visitor saved concurrently.
        if(pending.length) {remote=await request('');receive(decodeState(remote).state);}
        dirty=false;
        status(decoded.rejected?'공용 저장됨 · 읽을 수 없는 일부 기록 제외':'공용 저장 완료 · 모든 방문자에게 공개',!!decoded.rejected);
      } catch {
        dirty=true;status('온라인 연결 안 됨 · 기기에 보관 중, 연결되면 다시 저장',true);
      } finally {
        busy=false;
        if(!stopped) {const delay=again?900:30000;again=false;timer=schedule(sync,delay);}
      }
    }
    let signature='';
    function queue() {
      const next=JSON.stringify(encode(getState()));
      if(next===signature) return;
      signature=next;dirty=true;
      status('기기에 저장됨 · 공용 저장 대기',false);
      if(busy) {again=true;return;}
      cancel(timer);timer=schedule(sync,900);
    }
    function stop() {stopped=true;cancel(timer);}
    return {sync,queue,stop,pending:()=>dirty};
  }
  const api={project,decode,changes,connect};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;else root.HistoryCloud=api;
})(typeof window!=='undefined'?window:globalThis);
