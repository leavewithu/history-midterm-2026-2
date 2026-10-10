'use strict';
(() => {
  const dataElement = document.querySelector('#answer-data');
  if (!dataElement) return;
  const questions = JSON.parse(dataElement.textContent);
  const file = document.querySelector('#answer-file');
  const status = document.querySelector('#grade-status');
  const result = document.querySelector('#results');
  const score = document.querySelector('#score');
  const filter = document.querySelector('#review-only');
  const normalize = value => String(value).normalize('NFKC').toLowerCase().replace(/[\s'"「」『』·.,→\-:()[\]\/]/g, '');
  const element = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
  function applyFilter() {
    for (const node of result.children) node.hidden = filter.checked && node.dataset.state === 'match';
  }
  filter.addEventListener('change', applyFilter);
  file.addEventListener('change', async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    result.replaceChildren(); score.textContent = '';
    try {
      if (selected.size > 1024 * 1024) throw new Error('답안 파일이 너무 큽니다. 기본 연습에서 내려받은 파일을 선택하세요.');
      const payload = JSON.parse(await selected.text());
      if (payload.schema !== 'history-midterm-2026-2-practice-v1' || !payload.answers || Array.isArray(payload.answers) || typeof payload.answers !== 'object')
        throw new Error('이번 기본 연습의 답안 파일이 아닙니다.');
      const known = new Set(questions.map(q => q.id));
      if (Object.keys(payload.answers).some(id => !known.has(id))) throw new Error('다른 문제의 답안이 섞여 있습니다.');
      if (Object.values(payload.answers).some(v => typeof v !== 'string' || v.length > 2000)) throw new Error('답안 형식이 올바르지 않습니다.');
      let matched = 0, empty = 0, review = 0;
      for (const q of questions) {
        const own = (payload.answers[q.id] || '').trim();
        const match = own && [q.answer, ...(q.accept || [])].some(a => normalize(a) === normalize(own));
        const state = !own ? 'empty' : match ? 'match' : 'review';
        if (!own) empty++; else if (match) matched++; else review++;
        const node = element('article', ''); node.className = `result ${state}`; node.dataset.state = state;
        node.append(element('strong', `${q.label} · ${!own ? '미응답' : match ? '정답 일치' : q.type === 'blank' ? '불일치 · 표현 확인' : '오답'}`));
        node.append(element('p', q.prompt));
        node.append(element('p', `내 답: ${own || '미응답'} / 정답: ${q.display_answer || q.answer}`));
        if (q.why) node.append(element('p', q.why));
        result.append(node);
      }
      score.textContent = `정답 일치 ${matched} / ${questions.length} · 불일치 ${review} · 미응답 ${empty}`;
      document.dispatchEvent(new CustomEvent('history-basic-grade',{detail:score.textContent}));
      status.textContent = '자동 일치 결과입니다. 주관식의 다른 타당한 표현은 답지와 비교해 최종 확인하세요.';
      applyFilter();
    } catch (error) { status.textContent = error instanceof Error ? error.message : '답안 파일을 읽지 못했습니다.'; }
  });
  document.querySelector('#show-key').addEventListener('click', event => {
    const key = document.querySelector('#full-key');
    key.hidden = !key.hidden;
    event.currentTarget.textContent = key.hidden ? '전체 답지 펼치기' : '전체 답지 접기';
    event.currentTarget.setAttribute('aria-expanded', String(!key.hidden));
  });
})();
