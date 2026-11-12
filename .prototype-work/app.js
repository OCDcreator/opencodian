(() => {
  const scriptData = document.getElementById('prototype-data');
  const DATA = JSON.parse(scriptData?.textContent || '[]');
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const state = { backend: DATA[0]?.id || '', task: '', index: false, query: '', showKeys: true, theme: document.documentElement.dataset.theme || 'light', values: new Map() };
  const backendById = (id) => DATA.find((backend) => backend.id === id);
  const taskById = (backend, id) => backend?.tabs.find((tab) => tab.id === id) || backend?.tabs[0];
  const allFields = (backend) => (backend?.tabs || []).flatMap((tab) => (tab.groups || []).flatMap((group) => (group.fields || []).map((field) => ({ ...field, tabId: tab.id, tabLabel: tab.label, tabTitle: tab.title, groupTitle: group.title }))));
  const demoKey = (field) => `${state.backend}::${field.key}`;
  const originalValue = (field) => JSON.parse(JSON.stringify(field.value));
  const currentValue = (field) => state.values.has(demoKey(field)) ? state.values.get(demoKey(field)) : originalValue(field);
  const setValue = (field, value) => state.values.set(demoKey(field), value);
  const isChanged = (field) => state.values.has(demoKey(field));
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  const normalize = (value) => String(value ?? '').toLocaleLowerCase('zh-CN');
  const labelForOrigin = (origin) => ({ plugin: '插件设置', native: '原生配置', shared: '共享配置', action: '操作', readback: '运行时只读' }[origin] || origin || '演示');
  const optionLabel = (field, value) => field.options?.find((option) => String(option.value) === String(value))?.label || (value === '' ? '继承 / 默认' : String(value));
  const displayValue = (field) => {
    const value = currentValue(field);
    if (Array.isArray(value)) return value.join('、') || '空';
    if (value && typeof value === 'object') return JSON.stringify(value);
    return optionLabel(field, value);
  };
  const icon = (name) => {
    const icons = {
      chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
      check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
      plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
      minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
      arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
    };
    return icons[name] || '';
  };
  const showToast = (message) => {
    const toast = $('#toast');
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { toast.hidden = true; }, 2200);
  };
  const renderBackendNav = () => {
    $('#backend-nav').innerHTML = DATA.map((backend) => `<button class="backend-tab" role="tab" aria-selected="${backend.id === state.backend}" data-backend="${escapeHtml(backend.id)}"><span class="backend-mark">${escapeHtml(backend.mark || backend.id.toUpperCase())}</span><span>${escapeHtml(backend.name)}</span></button>`).join('');
    $$('#backend-nav .backend-tab').forEach((button) => button.addEventListener('click', () => {
      state.backend = button.dataset.backend;
      const backend = backendById(state.backend);
      state.task = backend?.tabs[0]?.id || '';
      state.index = false;
      state.query = '';
      $('#field-search').value = '';
      render();
    }));
  };
  const renderTaskNav = () => {
    const backend = backendById(state.backend);
    $('#task-nav').hidden = state.index;
    $('#task-nav').innerHTML = (backend?.tabs || []).map((tab) => `<button class="task-tab" role="tab" aria-selected="${tab.id === state.task}" data-task="${escapeHtml(tab.id)}">${escapeHtml(tab.label)}</button>`).join('');
    $$('#task-nav .task-tab').forEach((button) => button.addEventListener('click', () => {
      state.task = button.dataset.task;
      state.index = false;
      renderContent();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
  };
  const renderMeta = (field) => {
    const bits = [];
    if (field.origin) bits.push(`<span class="field-origin">${escapeHtml(labelForOrigin(field.origin))}</span>`);
    if (field.scope) bits.push(`<span>${escapeHtml(field.scope)}</span>`);
    if (field.effect) bits.push(`<span>${escapeHtml(field.effect)}</span>`);
    if (field.risk && field.risk !== 'low') bits.push(`<span>${escapeHtml(field.risk === 'high' ? '高风险' : '中风险')}</span>`);
    return bits.length ? `<div class="field-meta">${bits.map((bit) => `<span>${bit}</span>`).join(' · ')}</div>` : '';
  };
  const renderKey = (field) => `<div class="field-key"><code>${escapeHtml(field.key)}</code><span class="field-origin">${escapeHtml(labelForOrigin(field.origin))}</span>${field.source ? `<span class="field-origin">${escapeHtml(field.source)}</span>` : ''}</div>`;
  const renderSelect = (field) => {
    const value = currentValue(field);
    const options = field.options || [{ value: value, label: String(value) }];
    return `<div class="select-wrap" data-select-key="${escapeHtml(field.key)}"><button type="button" class="select-trigger" aria-haspopup="listbox" aria-expanded="false"><span>${escapeHtml(optionLabel(field, value))}</span>${icon('chevron')}</button><div class="select-menu" role="listbox" hidden>${options.map((option) => `<button type="button" class="select-option" role="option" aria-selected="${String(option.value) === String(value)}" data-value="${escapeHtml(option.value)}"><span>${escapeHtml(option.label)}</span>${String(option.value) === String(value) ? icon('check') : ''}</button>`).join('')}</div></div>`;
  };
  const renderSegment = (field) => `<div class="segment">${(field.options || []).map((option) => `<label><input type="radio" name="${escapeHtml(state.backend + field.key)}" value="${escapeHtml(option.value)}" ${String(currentValue(field)) === String(option.value) ? 'checked' : ''}><span>${escapeHtml(option.label)}</span></label>`).join('')}</div>`;
  const renderToggle = (field) => `<label class="switch"><input type="checkbox" ${currentValue(field) ? 'checked' : ''}><span>${currentValue(field) ? '已开启' : '已关闭'}</span></label>`;
  const renderList = (field) => {
    const values = Array.isArray(currentValue(field)) ? currentValue(field) : [];
    return `<div class="list-stack">${values.map((value, index) => `<div class="list-pair"><input type="text" value="${escapeHtml(value)}" data-list-index="${index}"><button type="button" class="icon-action" data-remove-index="${index}" aria-label="删除第 ${index + 1} 项">${icon('minus')}</button></div>`).join('')}<button type="button" class="action" data-add-list>${icon('plus')} 添加一项</button></div>`;
  };
  const renderKv = (field) => {
    const values = Array.isArray(currentValue(field)) ? currentValue(field) : [];
    return `<div class="kv-stack">${values.map((pair, index) => `<div class="kv-pair"><input type="text" value="${escapeHtml(pair.name || '')}" placeholder="名称" data-kv-index="${index}" data-kv-part="name"><input type="text" value="${escapeHtml(pair.value || '')}" placeholder="值" data-kv-index="${index}" data-kv-part="value"><button type="button" class="icon-action" data-remove-index="${index}" aria-label="删除第 ${index + 1} 项">${icon('minus')}</button></div>`).join('')}<button type="button" class="action" data-add-kv>${icon('plus')} 添加变量</button></div>`;
  };
  const renderControl = (field) => {
    if (field.type === 'notice') return `<div class="notice">${field.strong ? `<strong>${escapeHtml(field.strong)}</strong> ` : ''}${escapeHtml(field.text || field.description || '')}</div>`;
    if (field.type === 'readback') return `<div class="readonly-note">${escapeHtml(field.value || field.description || '当前只读状态')}</div>`;
    if (field.type === 'action') return `<div class="actions"><button type="button" class="action ${field.primary ? 'primary' : ''}" data-action="${escapeHtml(field.key)}">${escapeHtml(field.button || field.label)} ${field.icon ? icon('arrow') : ''}</button></div>`;
    if (field.readonly) return `<div class="readonly-note">只读 · ${escapeHtml(displayValue(field))}</div>`;
    if (field.type === 'select') return renderSelect(field);
    if (field.type === 'segment') return renderSegment(field);
    if (field.type === 'toggle') return renderToggle(field);
    if (field.type === 'list') return renderList(field);
    if (field.type === 'kv') return renderKv(field);
    const value = currentValue(field);
    if (field.type === 'number') return `<input type="number" value="${escapeHtml(value)}" ${field.min !== undefined ? `min="${field.min}"` : ''} ${field.max !== undefined ? `max="${field.max}"` : ''} ${field.step !== undefined ? `step="${field.step}"` : ''}>`;
    if (field.type === 'code' || field.type === 'json') return `<textarea class="code">${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value, null, 2))}</textarea>`;
    if (field.type === 'textarea') return `<textarea>${escapeHtml(Array.isArray(value) ? value.join('\n') : value)}</textarea>`;
    if (field.type === 'password') return `<input type="password" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || '保持现有值不变')}">`;
    return `<input type="text" value="${escapeHtml(value)}" ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''}>`;
  };
  const renderField = (field) => {
    const wide = ['textarea', 'code', 'json', 'list', 'kv', 'notice', 'readback', 'action'].includes(field.type);
    return `<div class="field ${wide ? 'wide-field' : ''}" id="field-${encodeURIComponent(field.key)}" data-field-key="${escapeHtml(field.key)}" data-field-search="${escapeHtml(normalize([field.key, field.label, field.description, field.origin].join(' ')))}"><div class="field-info"><span class="field-name">${escapeHtml(field.label)}</span>${field.description ? `<p class="field-description">${escapeHtml(field.description)}</p>` : ''}${renderMeta(field)}${renderKey(field)}</div><div class="field-control">${renderControl(field)}${field.hint ? `<p class="control-hint">${escapeHtml(field.hint)}</p>` : ''}${field.type !== 'notice' && field.type !== 'readback' && field.type !== 'action' ? `<p class="feedback" data-feedback></p>` : ''}</div></div>`;
  };
  const groupMatches = (group, query) => !query || (group.fields || []).some((field) => normalize([field.key, field.label, field.description, field.origin].join(' ')).includes(query));
  const renderGroup = (group) => {
    if (!groupMatches(group, state.query)) return '';
    const body = (group.fields || []).map(renderField).join('');
    if (!body) return '';
    if (group.collapsible) return `<details class="disclosure group" ${group.open ? 'open' : ''}><summary><span>${escapeHtml(group.title || '高级配置')}</span>${icon('chevron')}</summary><div class="disclosure-body">${group.description ? `<p class="group-description">${escapeHtml(group.description)}</p>` : ''}${body}</div></details>`;
    return `<section class="group"><h2>${escapeHtml(group.title || '')}</h2>${group.description ? `<p class="group-description">${escapeHtml(group.description)}</p>` : ''}${body}</section>`;
  };
  const renderTask = (backend, task) => {
    if (!task) return '<div class="empty">当前后端没有可显示的任务。</div>';
    const groups = (task.groups || []).map(renderGroup).join('');
    return `<div class="workspace-top"><div><h1>${escapeHtml(task.title || task.label)}</h1><p class="intro">${escapeHtml(task.description || backend.description || '')}</p>${task.note ? `<p class="page-note">${escapeHtml(task.note)}</p>` : ''}</div></div>${groups || `<div class="empty">没有匹配的字段。清空搜索后查看完整任务。</div>`}`;
  };
  const renderIndex = () => {
    const query = normalize(state.query);
    const fields = DATA.flatMap((backend) => allFields(backend).map((field) => ({ ...field, backendId: backend.id, backendName: backend.name }))).filter((field) => !query || normalize([field.key, field.label, field.description, field.backendName, field.tabLabel, field.origin].join(' ')).includes(query));
    $('#index-count').textContent = `${fields.length} 个结果`;
    return `<div class="results-head">字段索引</div>${fields.length ? fields.map((field) => `<button class="result" data-index-backend="${escapeHtml(field.backendId)}" data-index-task="${escapeHtml(field.tabId)}" data-index-key="${escapeHtml(field.key)}"><span><span class="result-title">${escapeHtml(field.label)} · ${escapeHtml(field.backendName)}</span><span class="result-meta">${escapeHtml(field.tabLabel)} · ${escapeHtml(labelForOrigin(field.origin))}</span><code>${escapeHtml(field.key)}</code></span><span class="result-path">${icon('arrow')}</span></button>`).join('') : '<div class="empty">输入字段名、键路径或后端名称开始查找。</div>'}`;
  };
  const renderContent = () => {
    const backend = backendById(state.backend);
    const task = taskById(backend, state.task);
    $('#content').innerHTML = state.index ? renderIndex() : renderTask(backend, task);
    if (!state.index) $('#index-count').textContent = `${allFields(backend).length} 个字段`;
    $$('.field-control', $('#content')).forEach((control) => wireControl(control));
    $$('#content [data-action]').forEach((button) => button.addEventListener('click', () => { showToast(`${button.textContent.trim()} · 母本操作已触发`); }));
    $$('#content .result').forEach((button) => button.addEventListener('click', () => {
      state.backend = button.dataset.indexBackend;
      state.task = button.dataset.indexTask;
      state.index = false;
      state.query = '';
      $('#field-search').value = '';
      render();
      const target = document.getElementById(`field-${encodeURIComponent(button.dataset.indexKey)}`);
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'center' }); target.classList.add('flash'); window.setTimeout(() => target.classList.remove('flash'), 1300); }
    }));
    updateLabels();
  };
  const updateFieldValueFromControl = (field, control, value) => {
    setValue(field, value);
    const feedback = $('[data-feedback]', control);
    if (feedback) { feedback.textContent = '仅演示：值保存在当前页面'; feedback.className = 'feedback ok'; }
  };
  const wireControl = (control) => {
    const fieldEl = control.closest('.field');
    const key = fieldEl?.dataset.fieldKey;
    const backend = backendById(state.backend);
    const field = allFields(backend).find((item) => item.key === key);
    if (!field) return;
    const select = $('.select-wrap', control);
    if (select) {
      const trigger = $('.select-trigger', select); const menu = $('.select-menu', select);
      trigger.addEventListener('click', () => { const open = menu.hidden; $$('.select-menu').forEach((item) => { item.hidden = true; }); menu.hidden = !open; trigger.setAttribute('aria-expanded', String(open)); });
      $$('.select-option', menu).forEach((option) => option.addEventListener('click', () => { updateFieldValueFromControl(field, control, option.dataset.value); menu.hidden = true; trigger.setAttribute('aria-expanded', 'false'); renderContent(); }));
      return;
    }
    const segment = $('.segment', control);
    if (segment) { $$('input', segment).forEach((input) => input.addEventListener('change', () => updateFieldValueFromControl(field, control, input.value))); return; }
    const checkbox = $('input[type="checkbox"]', control);
    if (checkbox) { checkbox.addEventListener('change', () => { updateFieldValueFromControl(field, control, checkbox.checked); const text = $('span', control); if (text) text.textContent = checkbox.checked ? '已开启' : '已关闭'; }); return; }
    const addList = $('[data-add-list]', control);
    if (addList) { $$('[data-list-index]', control).forEach((input) => input.addEventListener('input', () => { const values = $$('[data-list-index]', control).map((item) => item.value); updateFieldValueFromControl(field, control, values); })); $$('[data-remove-index]', control).forEach((button) => button.addEventListener('click', () => { const values = $$('[data-list-index]', control).map((item) => item.value).filter((_, index) => index !== Number(button.dataset.removeIndex)); updateFieldValueFromControl(field, control, values); renderContent(); })); addList.addEventListener('click', () => { const values = $$('[data-list-index]', control).map((item) => item.value); updateFieldValueFromControl(field, control, [...values, '']); renderContent(); }); return; }
    const addKv = $('[data-add-kv]', control);
    if (addKv) { $$('[data-kv-index]', control).forEach((input) => input.addEventListener('input', () => { const indexes = [...new Set($$('[data-kv-index]', control).map((item) => item.dataset.kvIndex))]; updateFieldValueFromControl(field, control, indexes.map((index) => ({ name: $('[data-kv-index="' + index + '"][data-kv-part="name"]', control)?.value || '', value: $('[data-kv-index="' + index + '"][data-kv-part="value"]', control)?.value || '' }))); })); $$('[data-remove-index]', control).forEach((button) => button.addEventListener('click', () => { const values = $$('[data-kv-index]', control).filter((item) => item.dataset.kvPart === 'name').map((item) => ({ name: item.value, value: $('[data-kv-index="' + item.dataset.kvIndex + '"][data-kv-part="value"]', control)?.value || '' })).filter((_, index) => index !== Number(button.dataset.removeIndex)); updateFieldValueFromControl(field, control, values); renderContent(); })); addKv.addEventListener('click', () => { const values = $$('[data-kv-index]', control).filter((item) => item.dataset.kvPart === 'name').map((item) => ({ name: item.value, value: $('[data-kv-index="' + item.dataset.kvIndex + '"][data-kv-part="value"]', control)?.value || '' })); updateFieldValueFromControl(field, control, [...values, { name: '', value: '' }]); renderContent(); }); return; }
    const input = $('input:not([type=checkbox],[type=radio]),textarea', control);
    if (input) input.addEventListener('change', () => { let value = input.value; if (field.type === 'number') value = Number(value); if (field.type === 'textarea' && Array.isArray(field.value)) value = value.split('\n').map((item) => item.trim()).filter(Boolean); if (field.type === 'json' || field.type === 'code') { try { value = field.type === 'json' ? JSON.parse(value) : value; } catch { const feedback = $('[data-feedback]', control); if (feedback) { feedback.textContent = 'JSON 格式暂不可解析'; feedback.className = 'feedback error'; } return; } } updateFieldValueFromControl(field, control, value); });
  };
  const updateLabels = () => { document.documentElement.classList.toggle('hide-keys', !state.showKeys); $('#keys-toggle').classList.toggle('active', state.showKeys); $('#keys-toggle').setAttribute('aria-pressed', String(state.showKeys)); $('#index-toggle').classList.toggle('active', state.index); $('#index-toggle').setAttribute('aria-pressed', String(state.index)); $('#theme-toggle').setAttribute('aria-label', state.theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'); };
  const render = () => { renderBackendNav(); renderTaskNav(); renderContent(); const backend = backendById(state.backend); $('#footer-source').textContent = backend ? `${backend.name} · ${backend.source || '当前仓库设置字段调研'}` : ''; };
  $('#field-search').addEventListener('input', (event) => { state.query = normalize(event.target.value); renderContent(); });
  $('#keys-toggle').addEventListener('click', () => { state.showKeys = !state.showKeys; updateLabels(); });
  $('#index-toggle').addEventListener('click', () => { state.index = !state.index; state.query = ''; $('#field-search').value = ''; renderTaskNav(); renderContent(); });
  $('#theme-toggle').addEventListener('click', () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = state.theme; updateLabels(); });
  $('#reset-demo').addEventListener('click', () => { [...state.values.keys()].filter((key) => key.startsWith(`${state.backend}::`)).forEach((key) => state.values.delete(key)); renderContent(); showToast('已重置当前后端的演示值'); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.select-wrap')) $$('.select-menu').forEach((menu) => { menu.hidden = true; }); });
  render();
})();
