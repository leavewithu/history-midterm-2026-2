'use strict';
(function (root) {
  const schema = 'history-midterm-2026-2-training-v1';
  const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s'"「」『』·.,→\-:()[\]\/]/g, '');
  function shuffle(items, seed) {
    let n = 2166136261;
    for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619) >>> 0;
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
      const j = n % (i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function buildBank(data) {
    const concepts = [], questions = [];
    for (const group of data.groups) group.items.forEach((item, i) => {
      const id = `T${group.topic}-K${i + 1}`;
      // Keep a cached pre-update page readable until its HTML is refreshed.
      const recall = data.recall ? data.recall[id] : {prompt:item.asks[0],answer:item.answer};
      if (!recall?.prompt || !recall.answer) throw Error(`암기용 질문과 정답이 없습니다: ${id}`);
      const concept = { ...item, id, topic:group.topic, recall };
      concepts.push(concept);
      item.asks.forEach((prompt, v) => {
        const type = i === 2 || i === 5 ? 'short' : 'choice';
        questions.push({ id:`${id}-V${v + 1}`, conceptId:id, topic:group.topic, type, prompt,
          answer:item.answer, accept:item.accept || [], why:item.detail,
          options:type === 'choice' ? shuffle([item.answer,...item.wrong], `${id}-${v}`) : [] });
      });
      const [prompt, answer, ...wrong] = item.review;
      questions.push({ id:`${id}-V4`, conceptId:id, topic:group.topic, type:'choice', prompt, answer,
        accept:[], why:item.detail, options:shuffle([answer,...wrong],`${id}-review`) });
    });
    return { concepts, questions, byId:Object.fromEntries(questions.map(q=>[q.id,q])),
      byConcept:Object.fromEntries(concepts.map(c=>[c.id,c])) };
  }
  function paper(bank, round) {
    if (!Number.isInteger(round) || round < 1 || round > 6) throw Error('회차가 올바르지 않습니다.');
    const offset = (round - 1) % 2 * 3;
    const variant = Math.floor((round - 1) / 2) + 1;
    const topics = [...new Set(bank.concepts.map(c=>c.topic))];
    const result = [];
    for (let layer = 0; layer < 3; layer++) {
      const order = shuffle(topics,`paper-${round}-${layer}`);
      if (order[0] === result.at(-1)?.topic) order.push(order.shift());
      for (const topic of order) result.push(bank.byId[`T${topic}-K${offset+layer+1}-V${variant}`]);
    }
    return shuffleLayers(result, round);
  }
  function shuffleLayers(questions, seed) {
    const queues = new Map();
    for (const q of questions) {
      if (!queues.has(q.topic)) queues.set(q.topic, []);
      queues.get(q.topic).push(q);
    }
    for (const [topic, list] of queues) queues.set(topic,shuffle(list,`${seed}-topic-${topic}`));
    const result = [];
    for (let layer=0;layer<3;layer++) {
      const order = shuffle([...queues.keys()],`${seed}-layer-${layer}`);
      if (order[0]===result.at(-1)?.topic) order.push(order.shift());
      for (const topic of order) result.push(queues.get(topic).shift());
    }
    return result;
  }
  const emptyState = () => ({ version:1, memory:{}, drafts:{}, attempts:[], wrong:{} });
  const grade = (q, answer) => Boolean(String(answer || '').trim()) && [q.answer,...q.accept].some(a=>normalize(a)===normalize(answer));
  const memoryIntervals = [1,3,7,14,30];
  function memoryDueAt(value) {
    if (!value) return null;
    return value.dueAt || new Date(Date.parse(value.updatedAt)+(value.rating==='known'?86400000:0)).toISOString();
  }
  function memoryDue(value,now=new Date().toISOString()) {
    return !value || value.rating==='hard' || memoryDueAt(value)<=now;
  }
  function rateMemory(bank,state,id,rating,now=new Date().toISOString()) {
    if (!Object.hasOwn(bank.byConcept,id) || !['known','hard'].includes(rating) || !Number.isFinite(Date.parse(now))) throw Error('암기 기록을 확인할 수 없습니다.');
    const previous=state.memory[id];
    const early=previous?.rating==='known' && !memoryDue(previous,now);
    const streak=rating==='hard'?0:Math.min(5,early?(previous.streak||1):(previous?.rating==='known'?(previous.streak||1)+1:1));
    const dueAt=rating==='hard'?now:early?memoryDueAt(previous):new Date(Date.parse(now)+memoryIntervals[streak-1]*86400000).toISOString();
    state.memory[id]={rating,updatedAt:now,streak,dueAt};
    return state.memory[id];
  }
  function rebuildWrong(state) {
    const wrong = {};
    for (const attempt of state.attempts) for (const result of attempt.results) {
      let entry = wrong[result.conceptId];
      if (!result.correct) {
        if (!entry) entry = wrong[result.conceptId] = { conceptId:result.conceptId, topic:result.topic, wrongCount:0, active:true, seen:[] };
        entry.wrongCount++;
        entry.active=true;
        entry.lastWrongQuestionId=result.id;
        entry.lastAnswer=result.given;
        entry.lastWrongAt=attempt.submittedAt;
      }
      if (entry) {
        entry.lastUsedQuestionId=result.id;
        entry.lastTestAt=attempt.submittedAt;
        if (!entry.seen.includes(result.id)) entry.seen.push(result.id);
        if (result.correct && attempt.kind==='review') entry.active=false;
      }
    }
    state.wrong=wrong;
    return state;
  }
  function review(bank, state, ids, size=30) {
    const chosen = ids ? new Set(ids) : null;
    const entries = Object.values(state.wrong).filter(w=>chosen ? chosen.has(w.conceptId) : w.active)
      .sort((a,b)=>b.wrongCount-a.wrongCount || a.lastTestAt.localeCompare(b.lastTestAt)).slice(0,size);
    const seen = new Set(state.attempts.flatMap(a=>a.results.map(r=>r.id)));
    return shuffle(entries.map(entry=>{
      const variants = bank.questions.filter(q=>q.conceptId===entry.conceptId && q.id!==entry.lastWrongQuestionId && q.id!==entry.lastUsedQuestionId);
      return variants.find(q=>!seen.has(q.id) && q.id.endsWith('-V4')) || variants.find(q=>!seen.has(q.id)) || variants[0];
    }),`review-${state.attempts.length}`);
  }
  function createAttempt(bank, session, answers, now) {
    const cleanAnswers = Object.fromEntries(session.questionIds.map(id=>[id,String(answers[id] || '').trim().slice(0,200)]));
    const results=session.questionIds.map(id=>{
      const q=bank.byId[id];
      if (!q) throw Error('알 수 없는 문항입니다.');
      return { id, conceptId:q.conceptId, topic:q.topic, given:cleanAnswers[id], correct:grade(q,cleanAnswers[id]), manual:false };
    });
    return { id:session.id, sessionId:session.id, kind:session.kind, round:session.round || null,
      title:session.title, submittedAt:now, updatedAt:now, questionIds:[...session.questionIds], answers:cleanAnswers,
      results, score:results.filter(r=>r.correct).length, total:results.length };
  }
  function submit(bank, state, session, answers, now=new Date().toISOString()) {
    if (state.attempts.some(a=>a.sessionId===session.id)) throw Error('이미 채점된 답안입니다.');
    if (state.attempts.length>=2000) throw Error('기록 한도에 도달했습니다. 기록을 백업해 주세요.');
    const attempt=createAttempt(bank,session,answers,now);
    state.attempts.push(attempt);
    delete state.drafts[session.key];
    rebuildWrong(state);
    return attempt;
  }
  function recognize(bank,state,attemptId,questionId,now=new Date().toISOString()) {
    const attempt=state.attempts.find(a=>a.id===attemptId), q=bank.byId[questionId];
    const result=attempt?.results.find(r=>r.id===questionId);
    if (!result || q.type!=='short' || result.correct || !result.given) throw Error('표현 확인이 필요한 단답형만 인정할 수 있습니다.');
    result.correct=true; result.manual=true;
    attempt.score=attempt.results.filter(r=>r.correct).length;
    attempt.updatedAt=now;
    rebuildWrong(state);
  }
  function validate(raw,bank) {
    const fail = () => { throw Error('학습 기록 형식이 올바르지 않습니다. 기존 기록은 유지됩니다.'); };
    if (!raw || raw.version!==1 || !raw.memory || typeof raw.memory!=='object' || Array.isArray(raw.memory) || !raw.drafts || typeof raw.drafts!=='object' || Array.isArray(raw.drafts) || !Array.isArray(raw.attempts) || raw.attempts.length>2000) fail();
    const state=emptyState();
    const validDate = value => typeof value==='string' && value.length<40 && Number.isFinite(Date.parse(value));
    for (const [id,value] of Object.entries(raw.memory)) {
      if (!Object.hasOwn(bank.byConcept,id) || !value || !['known','hard'].includes(value.rating) || !validDate(value.updatedAt)) fail();
      state.memory[id]={rating:value.rating,updatedAt:value.updatedAt};
      if (value.streak!==undefined || value.dueAt!==undefined) {
        if (!Number.isInteger(value.streak) || value.streak<0 || value.streak>5 || !validDate(value.dueAt) || (value.rating==='known'?value.streak===0:value.streak!==0)) fail();
        state.memory[id].streak=value.streak;state.memory[id].dueAt=value.dueAt;
      }
    }
    function questionIds(value) {
      if (!Array.isArray(value) || value.length<1 || value.length>30 || new Set(value).size!==value.length || value.some(id=>typeof id!=='string'||!Object.hasOwn(bank.byId,id))) fail();
      return [...value];
    }
    function answers(value,ids) {
      if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(id=>!ids.includes(id))) fail();
      for (const v of Object.values(value)) if(typeof v!=='string' || v.length>200) fail();
      return Object.fromEntries(ids.map(id=>[id,value[id] || '']));
    }
    const sessionIds=new Set();
    for (const a of raw.attempts) {
      if (!a || typeof a.id!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(a.id) || sessionIds.has(a.id) || !['paper','review'].includes(a.kind) || !validDate(a.submittedAt) || !validDate(a.updatedAt) || typeof a.title!=='string' || a.title.length>100) fail();
      sessionIds.add(a.id);
      const ids=questionIds(a.questionIds);
      if(a.kind==='paper' && (!Number.isInteger(a.round) || a.round<1 || a.round>6 || ids.join('|')!==paper(bank,a.round).map(q=>q.id).join('|'))) fail();
      const own=answers(a.answers,ids);
      const checked=createAttempt(bank,{id:a.id,kind:a.kind,round:a.round,title:a.title,questionIds:ids},own,a.submittedAt);
      state.attempts.push(checked);
      checked.updatedAt=a.updatedAt;
      if (!Array.isArray(a.results) || a.results.length!==ids.length || new Set(a.results.map(r=>r?.id)).size!==ids.length) fail();
      for(const old of a.results) {
        if (!old || !ids.includes(old.id) || typeof old.manual!=='boolean') fail();
        if (old.manual===true) {
          const result=checked.results.find(r=>r.id===old.id);
          if(bank.byId[old.id].type!=='short' || !result.given) fail();
          result.correct=true; result.manual=true;
        }
      }
      checked.score=checked.results.filter(r=>r.correct).length;
    }
    const drafts=Object.entries(raw.drafts);
    if(drafts.length>7) fail();
    for (const [key,d] of drafts) {
      if(!d || typeof d.id!=='string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(d.id) || !validDate(d.updatedAt) || typeof d.title!=='string' || d.title.length>100 || !['paper','review'].includes(d.kind)) fail();
      if(sessionIds.has(d.id)) continue;
      if(key!==d.key || (d.kind==='review' ? key!=='review' : key!==`paper-${d.round}`)) fail();
      const ids=questionIds(d.questionIds);
      if(d.kind==='paper' && (!Number.isInteger(d.round) || d.round<1 || d.round>6 || ids.join('|')!==paper(bank,d.round).map(q=>q.id).join('|'))) fail();
      state.drafts[key]={id:d.id,key,kind:d.kind,round:d.round || null,title:d.title,updatedAt:d.updatedAt,questionIds:ids,answers:answers(d.answers,ids)};
    }
    state.attempts.sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id));
    return rebuildWrong(state);
  }
  function merge(a,b) {
    const state=emptyState();
    for(const source of [a,b]) {
      for(const [id,m] of Object.entries(source.memory)) if(!state.memory[id] || state.memory[id].updatedAt<m.updatedAt || state.memory[id].updatedAt===m.updatedAt && (!state.memory[id].dueAt || m.dueAt)) state.memory[id]={...m};
      for(const d of Object.values(source.drafts)) if(!state.drafts[d.key] || state.drafts[d.key].updatedAt<=d.updatedAt) state.drafts[d.key]=structuredClone(d);
      for(const attempt of source.attempts) {
        const index=state.attempts.findIndex(a=>a.id===attempt.id);
        if(index===-1) state.attempts.push(structuredClone(attempt));
        else {
          const previous=state.attempts[index];
          if(previous.questionIds.join('|')!==attempt.questionIds.join('|') || previous.questionIds.some(id=>previous.answers[id]!==attempt.answers[id]))
            throw Error('같은 기록 번호에 서로 다른 답안이 있습니다. 기존 기록은 유지됩니다.');
          const combined=structuredClone(previous.updatedAt<=attempt.updatedAt?attempt:previous);
          const recognized=new Set([...previous.results,...attempt.results].filter(r=>r.manual).map(r=>r.id));
          for(const result of combined.results) if(recognized.has(result.id)) {result.manual=true;result.correct=true;}
          combined.score=combined.results.filter(r=>r.correct).length;
          state.attempts[index]=combined;
        }
      }
    }
    if(state.attempts.length>2000) throw Error('합쳐진 기록이 저장 한도를 초과합니다.');
    const completed=new Set(state.attempts.map(a=>a.sessionId));
    for(const [key,d] of Object.entries(state.drafts)) if(completed.has(d.id)) delete state.drafts[key];
    state.attempts.sort((a,b)=>a.submittedAt.localeCompare(b.submittedAt) || a.id.localeCompare(b.id));
    return rebuildWrong(state);
  }
  const api={schema,normalize,shuffle,buildBank,paper,review,emptyState,grade,memoryDueAt,memoryDue,rateMemory,submit,recognize,validate,merge,rebuildWrong};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.HistoryTraining=api;
})(typeof window!=='undefined' ? window : globalThis);
