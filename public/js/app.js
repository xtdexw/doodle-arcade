// public/js/app.js
import { runPipeline, checkAndRepair, defaultPostJson } from './pipeline.js';
import { createSandbox } from './sandbox.js';

const $ = (id) => document.getElementById(id);
const upload = $('upload'), preview = $('preview'), timeline = $('timeline');
const panel = $('panel'), panelBody = $('panel-body'), stage = $('stage');
const versionsEl = $('versions'), reviseForm = $('revise-form'), reviseInput = $('revise-input');

const sandbox = createSandbox(stage);
let currentHtml = null;
const STEP_LABELS = { preprocess: '🖼️ 预处理', analyze: '👀 看图', design: '📋 设计', generate: '💻 写码', repair: '🔧 自检修复', revise: '✏️ 修改' };

function renderStep(name, state, data) {
  let li = timeline.querySelector(`[data-step="${name}"]`);
  if (!li) {
    li = document.createElement('li');
    li.dataset.step = name;
    li.innerHTML = `<span>${STEP_LABELS[name] || name}</span><span class="state"></span>`;
    timeline.appendChild(li);
  }
  li.className = state;
  const st = li.querySelector('.state');
  st.textContent = state === 'running' ? '进行中…' : state === 'done' ? '完成' : state === 'error' ? '失败' : '';
  if (name === 'repair' && state === 'running' && data) {
    st.textContent = `第${data.round}轮：${(data.errors || []).slice(0, 2).join('；').slice(0, 60)}`;
  }
}

function renderPanel(analysis) {
  panel.hidden = false;
  const chars = analysis.characters.map((c) =>
    `<div class="card"><b>${c.name}</b>（${c.personality || ''}）<br>${c.desc || ''}</div>`).join('');
  const sw = analysis.palette.map((p) => `<span class="swatch" style="background:${p}" title="${p}"></span>`).join('');
  panelBody.innerHTML = `
    <div class="swatches">${sw}</div>
    <span class="chip">画风：${analysis.style || '—'}</span>
    <span class="chip">情绪：${analysis.mood || '—'}</span>
    <span class="chip">类型决策：${analysis.suggested_genre}（${analysis.genre_reason || ''}）</span>
    ${chars}`;
}

function renderVersions() {
  versionsEl.innerHTML = '';
  sandbox.versions.forEach((v, i) => {
    const b = document.createElement('button');
    b.textContent = v.label;
    b.className = i === sandbox.current ? 'active' : '';
    b.onclick = async () => { await sandbox.show(i); renderVersions(); }; // show 改 current 后重刷高亮
    versionsEl.appendChild(b);
  });
}

upload.addEventListener('change', async () => {
  const file = upload.files[0];
  if (!file) return;
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  timeline.innerHTML = '';
  sandbox.reset(); // 新图重开一局：清空历史版本栈与沙箱
  renderVersions();
  reviseForm.hidden = true;
  try {
    const result = await runPipeline(file, { onStep: renderStep });
    renderPanel(result.analysis);
    if (result.spriteMissing) {
      timeline.insertAdjacentHTML('beforeend', '<li class="error">⚠️ 模型未使用精灵占位符，主角可能缺失——建议重新生成</li>');
    }
    sandbox.pushVersion('v1 初版', result.html);
    const verdict = await checkAndRepair(result.html, sandbox, { onStep: renderStep });
    currentHtml = verdict.html;
    if (verdict.repaired > 0) sandbox.pushVersion(`v1 修复版（第${verdict.repaired}轮）`, verdict.html);
    if (verdict.repaired === -1) renderStep('repair', 'error', {});
    await sandbox.show(sandbox.versions.length - 1);
    renderVersions();
    reviseForm.hidden = false;
  } catch (e) {
    renderStep('generate', 'error', {});
    timeline.insertAdjacentHTML('beforeend', `<li class="error">出错了：${e.message}</li>`);
  }
});

reviseForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const instruction = reviseInput.value.trim();
  if (!instruction || !currentHtml) return;
  renderStep('revise', 'running');
  try {
    const { html } = await defaultPostJson('/api/revise', { html: currentHtml, instruction });
    currentHtml = html;
    sandbox.pushVersion(`v${sandbox.versions.length + 1}：${instruction.slice(0, 8)}`, html);
    const v = await checkAndRepair(html, sandbox, { onStep: renderStep });
    currentHtml = v.html;
    if (v.repaired > 0) sandbox.pushVersion(`修复版（第${v.repaired}轮）`, v.html);
    if (v.repaired === -1) renderStep('repair', 'error', {});
    await sandbox.show(sandbox.versions.length - 1);
    renderVersions();
    renderStep('revise', 'done');
    reviseInput.value = '';
  } catch (err) {
    renderStep('revise', 'error', {});
  }
});
