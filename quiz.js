'use strict';
(() => {
  const form = document.querySelector('#practice');
  if (!form) return;
  const key = 'history-midterm-2026-2-practice-v1';
  const fields = [...form.querySelectorAll('[data-question]')];
  const total = fields.length;
  const status = document.querySelector('#save-status');
  const meter = document.querySelector('#progress');
  const count = document.querySelector('#count');
  function answers() {
    return Object.fromEntries(fields.map(field => {
      const input = field.querySelector('input[type=text]');
      const checked = field.querySelector('input[type=radio]:checked');
      return [field.dataset.question, input ? input.value.trim() : (checked?.value || '')];
    }));
  }
  function update(save = true) {
    const values = answers();
    const done = Object.values(values).filter(Boolean).length;
    meter.value = done;
    count.textContent = `${done} / ${total}문항 입력`;
    if (save) {
      try { localStorage.setItem(key, JSON.stringify(values)); status.textContent = '이 브라우저에 임시 저장됨'; }
      catch { status.textContent = '브라우저 임시 저장 불가. 답안 파일을 내려받으세요.'; }
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    for (const field of fields) {
      const value = saved[field.dataset.question];
      if (typeof value !== 'string') continue;
      const input = field.querySelector('input[type=text]');
      if (input) input.value = value;
      else for (const radio of field.querySelectorAll('input[type=radio]')) radio.checked = radio.value === value;
    }
  } catch { status.textContent = '임시 저장된 답안을 읽지 못했습니다.'; }
  form.addEventListener('input', () => update());
  form.addEventListener('submit', event => event.preventDefault());
  document.querySelector('#export').addEventListener('click', () => {
    const payload = { schema: 'history-midterm-2026-2-practice-v1', exported_at: new Date().toISOString(), answers: answers() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '역사_2학기중간_기본연습_내답안.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = '답안 파일 생성 완료';
  });
  document.querySelector('#reset').addEventListener('click', () => {
    if (!confirm('입력한 답안을 모두 지울까요? 먼저 답안 파일을 내려받을 수 있습니다.')) return;
    form.reset();
    update();
  });
  update(false);
})();
