'use strict';
(function(root) {
  const schema='history-midterm-2026-2-activity-v1';
  const types=['start','pause','resume','finish','view','reveal','rate','answer','submit','recognize','round','filter'];
  const reasons=['','manual','hidden','idle','navigation','interrupted','midnight'];
  const pages=['home','study','learn','practice','answers'];
  const statuses=['running','paused','ended','interrupted'];
  const topics=[0,24,27,28,29,30,31,32,33,34,35];
  const idOK=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
  const dateOK=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
  const day=v=>new Date((typeof v==='number'?v:Date.parse(v))+9*3600000).toISOString().slice(0,10);
  const dayOK=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const empty=()=>({version:1,days:{}});
  const emptyDay=()=>({sessions:{},events:{}});
  function fields(v,names) {if(!object(v)||Object.keys(v).some(k=>!names.includes(k))||names.some(k=>!Object.hasOwn(v,k))) throw Error('학습 시간 기록 형식이 올바르지 않습니다.');}
  function validateDay(raw,key) {
    if(!dayOK(key)) throw Error('학습 날짜가 올바르지 않습니다.');
    raw=raw===null?emptyDay():raw;
    if(!object(raw)||Object.keys(raw).some(k=>!['sessions','events'].includes(k))) throw Error('학습 기록 형식이 올바르지 않습니다.');
    const result=emptyDay();
    for(const kind of ['sessions','events']) if(raw[kind]!==undefined&&!object(raw[kind])) throw Error('학습 기록 목록이 올바르지 않습니다.');
    if(Object.keys(raw.sessions||{}).length>1000||Object.keys(raw.events||{}).length>20000) throw Error('하루 기록의 크기 제한을 넘었습니다.');
    for(const [id,s] of Object.entries(raw.sessions||{})) {
      fields(s,['id','startedAt','updatedAt','endedAt','activeMs','status','reason','time']);
      if(!idOK(id)||s.id!==id||!dateOK(s.startedAt)||day(s.startedAt)!==key||!dateOK(s.updatedAt)||s.updatedAt<s.startedAt||s.time!==Date.parse(s.updatedAt)||!Number.isSafeInteger(s.activeMs)||s.activeMs<0||s.activeMs>s.time-Date.parse(s.startedAt)||!statuses.includes(s.status)||!reasons.includes(s.reason)||!(s.endedAt===''||dateOK(s.endedAt)&&s.endedAt>=s.startedAt&&s.endedAt<=s.updatedAt)||((s.status==='ended'||s.status==='interrupted')!==!!s.endedAt)) throw Error('학습 구간 기록을 확인할 수 없습니다.');
      result.sessions[id]={...s};
    }
    for(const [id,v] of Object.entries(raw.events||{})) {
      fields(v,['id','sessionId','at','type','page','topic','ref','label','value']);
      if(!idOK(id)||v.id!==id||!idOK(v.sessionId)||!result.sessions[v.sessionId]||!dateOK(v.at)||day(v.at)!==key||v.at<result.sessions[v.sessionId].startedAt||!types.includes(v.type)||!pages.includes(v.page)||!topics.includes(v.topic)||typeof v.ref!=='string'||v.ref.length>100||typeof v.label!=='string'||v.label.length>120||typeof v.value!=='string'||v.value.length>200) throw Error('세부 학습 기록을 확인할 수 없습니다.');
      result.events[id]={...v};
    }
    return result;
  }
  function validate(raw) {
    fields(raw,['version','days']);
    if(raw.version!==1||!object(raw.days)) throw Error('지원하지 않는 학습 기록입니다.');
    const state=empty();for(const [key,value] of Object.entries(raw.days)) state.days[key]=validateDay(value,key);return state;
  }
  function merge(a,b) {
    const out=empty();
    for(const source of [a,b]) for(const [key,value] of Object.entries(source.days)) {
      const target=out.days[key]||=emptyDay();
      for(const [id,s] of Object.entries(value.sessions)) {
        const old=target.sessions[id];
        if(!old||s.time>old.time||s.time===old.time&&statuses.indexOf(s.status)>=statuses.indexOf(old.status)) target.sessions[id]={...s};
      }
      for(const [id,v] of Object.entries(value.events)) if(!target.events[id]) target.events[id]={...v};
    }
    return out;
  }
  function changes(local,remote) {
    const jobs=[];
    for(const [id,s] of Object.entries(local.sessions)) if(!remote?.sessions?.[id]||s.time>remote.sessions[id].time||s.time===remote.sessions[id].time&&s.status!==remote.sessions[id].status) jobs.push([`sessions/${id}`,s,false]);
    for(const [id,v] of Object.entries(local.events)) if(!remote?.events?.[id]) jobs.push([`events/${id}`,v,true]);
    return jobs;
  }
  // The clock tracks visible, recently active time, not attention or reading comprehension.
  class Tracker {
    constructor({state=empty(),now=()=>Date.now(),uid=()=>`a-${Date.now()}-${Math.random().toString(36).slice(2,10)}`,save=()=>{},page='learn',idleMs=300000}) {
      Object.assign(this,{state,now,uid,save,page,idleMs});this.current=null;this.auto=true;this.lastInput=now();this.lastTick=now();
    }
    session() {return this.current&&this.state.days[this.current.day]?.sessions[this.current.id];}
    emit(type,details={},at=this.now()) {
      const s=this.session();if(!s) return;
      const id=this.uid(),v={id,sessionId:s.id,at:new Date(at).toISOString(),type,page:this.page,topic:details.topic||0,ref:String(details.ref||'').slice(0,100),label:String(details.label||'').slice(0,120),value:String(details.value||'').slice(0,200)};
      this.state.days[this.current.day].events[id]=v;
    }
    stamp(s,at) {s.time=Math.max(s.time,at);s.updatedAt=new Date(s.time).toISOString();}
    checkpoint(at=this.now()) {
      const s=this.session();if(!s||s.status!=='running') return;
      if(day(at)!==this.current.day) {
        const boundary=Date.parse(this.current.day+'T15:00:00.000Z')-1;
        this.checkpoint(boundary);this.finish('midnight',boundary);this.start();return;
      }
      const end=Math.max(this.lastTick,Math.min(at,this.lastInput+this.idleMs));
      // Never count a hidden/crashed interval or time before the current checkpoint.
      s.activeMs+=Math.max(0,end-this.lastTick);this.lastTick=Math.max(this.lastTick,at);this.stamp(s,end);
      if(at>=this.lastInput+this.idleMs) {s.status='paused';s.reason='idle';this.emit('pause',{label:'입력 없음 · 자동 일시정지'},end);}
      this.save();
    }
    start() {
      this.auto=true;
      const old=this.session();if(old?.status==='running') return;
      if(old?.status==='paused'&&this.current.day===day(this.now())) {this.resume();return;}
      if(old) this.finish('midnight',old.time);
      const at=this.now(),id=this.uid(),key=day(at),iso=new Date(at).toISOString();
      (this.state.days[key]||=emptyDay()).sessions[id]={id,startedAt:iso,updatedAt:iso,endedAt:'',activeMs:0,status:'running',reason:'',time:at};
      this.current={day:key,id};this.lastTick=at;this.lastInput=at;this.emit('start',{label:'학습 시작'});this.save();
    }
    resume() {
      const s=this.session();if(!s||s.status!=='paused') return;
      if(this.current.day!==day(this.now())) {this.finish('midnight',s.time);this.start();return;}
      s.status='running';s.reason='';this.lastTick=this.now();this.lastInput=this.now();this.stamp(s,this.now());this.emit('resume',{label:'학습 다시 시작'});this.auto=true;this.save();
    }
    touch() {
      this.checkpoint();
      if(this.session()?.status==='paused'&&this.session().reason==='idle') this.resume();
      this.lastInput=this.now();
    }
    record(type,details={}) {
      if(!types.includes(type)) return;
      this.touch();if(!this.session()&&this.auto) this.start();
      if(this.session()?.status!=='running') return;
      this.stamp(this.session(),this.now());this.emit(type,details);this.save();
    }
    pause(reason='manual') {
      this.checkpoint();const s=this.session();if(!s||s.endedAt) return;
      if(this.current.day!==day(this.now())) {this.finish('midnight',s.time);return;}
      if(s.status==='paused'&&s.reason==='manual'&&reason!=='manual') return;
      s.status='paused';s.reason=reason;this.stamp(s,this.now());this.emit('pause',{label:reason==='manual'?'일시정지':reason==='hidden'?'화면을 떠남':'다른 페이지로 이동'});if(reason==='manual') this.auto=false;this.save();
    }
    finish(reason='manual',at=this.now()) {
      const current=this.session();if(current&&day(at)!==this.current.day) at=current.time;
      this.checkpoint(at);const s=this.session();if(!s) {this.auto=false;return;}
      s.status=reason==='interrupted'?'interrupted':'ended';s.reason=reason;this.stamp(s,at);s.endedAt=s.updatedAt;this.emit('finish',{label:reason==='manual'?'학습 종료':'학습 구간 종료'},at);this.current=null;this.auto=false;this.save();
    }
    recover(pointer) {
      const s=pointer&&this.state.days[pointer.day]?.sessions[pointer.id];
      if(!s||s.endedAt) return;
      this.current=pointer;
      if(s.status==='paused'&&s.reason==='navigation'&&this.now()-s.time<60000) {this.resume();return;}
      if(s.status==='paused'&&s.reason==='manual') {this.auto=false;return;}
      s.status='interrupted';s.reason='interrupted';s.endedAt=s.updatedAt;this.current=null;this.save();
    }
  }
  const api={schema,empty,emptyDay,validate,validateDay,merge,changes,day,dayOK,types,reasons,pages,statuses,Tracker};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;else root.HistoryActivityCore=api;
})(typeof window!=='undefined'?window:globalThis);
