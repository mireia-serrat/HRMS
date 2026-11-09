// Interfície de l'aplicació: rutes, vistes i accions.
(() => {
  'use strict';

  const { computeIons, parseFormula, FormulaError, MAX_FORMULA_LENGTH } = window.HRMS.chem;
  const {
    generateDocx, loadTemplate, parseEmails, emailsFit, MAX_SAMPLES, MIME_DOCX,
  } = window.HRMS.docx;
  const { generatePdf } = window.HRMS.pdf;
  const { db } = window.HRMS;

  const MAX_CODE_LENGTH = 35;
  const UNDO_MS = 9000;

  const CONFIDENCE = ['High', 'Medium', 'Low'];
  const PURITY = ['Pure', 'Impure'];
  const PUBLICATION = ['Yes', 'No'];

  const emptyDraft = () => ({
    sample_code: '', confidence: '', purity: '', publication: '', molecular_formula: '', author: '', analyzed_by: '',
  });

  const state = {
    session: null,
    samples: [],
    loading: false,
    loadError: '',
    loaded: false,
    selection: [],
    prefs: { name: '', email: '', research_group: '' },
    filters: { search: '', confidence: '', purity: '', publication: '', sort: 'date-desc' },
    draft: emptyDraft(),
    editingId: null,
    pickerSearch: '',
    authMode: 'login',
    recovery: false,
    busy: false,
    remember: true,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const appRoot = $('#app');

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const dateFormat = new Intl.DateTimeFormat('ca-ES', { dateStyle: 'short', timeStyle: 'short' });
  const formatDate = (iso) => dateFormat.format(new Date(iso));
  const byId = (id) => state.samples.find((s) => s.id === id);
  const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const defaultAuthor = () => state.prefs.name || state.session?.user?.email || '';

  const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
  }[name]}</svg>`;

  const logo = '<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#1f4e8c"/><path d="M7 24v-6M12 24V9M17 24v-9M22 24v-4M26 24v-2" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';

  // --- Avisos i diàlegs ---

  function toast(message, type = 'info', action = null) {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    const close = () => el.remove();
    if (action) {
      const button = document.createElement('button');
      button.textContent = action.label;
      button.addEventListener('click', () => { close(); action.run(); });
      el.append(button);
    }
    $('#toasts').append(el);
    setTimeout(close, action ? UNDO_MS : type === 'error' ? 8000 : 4000);
  }

  function openModal(html) {
    const modal = $('#modal');
    modal.innerHTML = html;
    if (!modal.open) modal.showModal();
    return modal;
  }

  function closeModal() {
    const modal = $('#modal');
    if (modal.open) modal.close();
  }

  function confirmDialog({ title, body, confirmLabel, danger = false }) {
    return new Promise((resolve) => {
      const modal = openModal(`<div class="modal-body">
        <h2>${esc(title)}</h2><p>${body}</p>
        <div class="modal-actions">
          <button class="btn btn--ghost" data-answer="no" autofocus>Cancel·la</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-answer="yes">${esc(confirmLabel)}</button>
        </div></div>`);
      const finish = (value) => {
        modal.removeEventListener('click', onClick);
        modal.removeEventListener('close', onClose);
        closeModal();
        resolve(value);
      };
      const onClick = (event) => {
        const answer = event.target.closest('[data-answer]')?.dataset.answer;
        if (answer) finish(answer === 'yes');
      };
      const onClose = () => finish(false);
      modal.addEventListener('click', onClick);
      modal.addEventListener('close', onClose);
    });
  }

  function setButtonBusy(button, busy, label) {
    if (!button) return;
    button.disabled = busy;
    if (busy) {
      button.dataset.label = button.innerHTML;
      button.innerHTML = `<span class="spinner"></span> ${esc(label)}`;
    } else if (button.dataset.label) {
      button.innerHTML = button.dataset.label;
    }
  }

  // --- Dades ---

  async function loadData() {
    state.loading = true;
    state.loadError = '';
    render();
    try {
      const [samples, prefs] = await Promise.all([db.listSamples(), db.getPreferences()]);
      state.samples = samples;
      if (prefs) state.prefs = { name: prefs.name, email: prefs.email, research_group: prefs.research_group };
      else if (!state.prefs.email) state.prefs.email = state.session?.user?.email || '';
      state.selection = state.selection.filter((id) => byId(id));
      state.loaded = true;
    } catch (error) {
      state.loadError = db.friendlyError(error);
    } finally {
      state.loading = false;
      // En obrir directament un enllaç d'edició cal omplir el formulari ara que hi ha dades.
      if (currentRoute().page === 'edit') state.editingId = null;
      route();
    }
  }

  function upsertLocal(row) {
    const index = state.samples.findIndex((s) => s.id === row.id);
    if (index >= 0) state.samples[index] = row;
    else state.samples.unshift(row);
  }

  function filteredSamples() {
    const { search, confidence, purity, publication, sort } = state.filters;
    const needle = search.trim().toLowerCase();
    const rows = state.samples.filter((s) => (!needle
      || s.sample_code.toLowerCase().includes(needle)
      || s.molecular_formula.toLowerCase().includes(needle)
      || (s.author || '').toLowerCase().includes(needle)
      || (s.analyzed_by || '').toLowerCase().includes(needle))
      && (!confidence || s.confidence === confidence)
      && (!purity || s.purity === purity)
      && (!publication || s.publication === publication));
    const compareCode = (a, b) => a.sample_code.localeCompare(b.sample_code, undefined, { numeric: true, sensitivity: 'base' });
    const compareDate = (a, b) => new Date(a.created_at) - new Date(b.created_at);
    const comparators = {
      'date-desc': (a, b) => compareDate(b, a),
      'date-asc': compareDate,
      'code-asc': compareCode,
      'code-desc': (a, b) => compareCode(b, a),
    };
    return rows.sort(comparators[sort]);
  }

  // --- Fragments de vista ---

  const ionHtml = (label) => label.replace(/^\[(.*)\](\d*\+)$/, '[$1]<sup>$2</sup>');

  function ionsTable(formula) {
    const { massText, ions } = computeIons(formula);
    return `<div class="mass-head"><span>Massa monoisotòpica (M)</span><b>${massText}</b></div>
      <table class="ions"><tbody>${ions.map((ion) => `<tr><th scope="row">${ionHtml(ion.label)}</th><td>${ion.text}</td></tr>`).join('')}</tbody></table>`;
  }

  function livePanel(formula) {
    if (!formula.trim()) return '<div class="ions-empty">Escriu una fórmula molecular per calcular els m/z.</div>';
    try {
      return ionsTable(formula);
    } catch (error) {
      if (error instanceof FormulaError) return `<div class="ions-error">${esc(error.message)}</div>`;
      throw error;
    }
  }

  const confidenceTag = (value) => `<span class="tag ${{ High: 'tag--good', Medium: 'tag--warn', Low: 'tag--bad' }[value]}">${esc(value)}</span>`;
  const purityTag = (value) => `<span class="tag ${value === 'Pure' ? 'tag--good' : 'tag--warn'}">${esc(value)}</span>`;
  const publicationTag = (value) => `<span class="tag ${value === 'Yes' ? 'tag--navy' : ''}">${esc(value)}</span>`;

  const options = (values, selected, placeholder) => `${placeholder === undefined ? '' : `<option value="">${esc(placeholder)}</option>`}${values
    .map((v) => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('')}`;

  const loadingBlock = '<div class="card"><div class="loading"><span class="spinner spinner--dark"></span> Carregant les mostres…</div></div>';

  const loadErrorBanner = () => (state.loadError
    ? `<div class="banner banner--error"><span>${esc(state.loadError)}</span><button class="btn btn--ghost btn--small" data-action="reload">Torna-ho a provar</button></div>`
    : '');

  // --- Vistes ---

  function viewDashboard() {
    const total = state.samples.length;
    const forPublication = state.samples.filter((s) => s.publication === 'Yes').length;
    const highConfidence = state.samples.filter((s) => s.confidence === 'High').length;
    const recent = [...state.samples].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
    return `<div class="page-head"><div><h1>Dashboard</h1><p>Resum de les mostres d'HRMS-ESI.</p></div></div>
    ${loadErrorBanner()}
    <div class="stats">
      <div class="stat stat--primary"><b id="total-count">${total}</b><span>Mostres registrades</span></div>
      <div class="stat"><b>${highConfidence}</b><span>Confiança alta</span></div>
      <div class="stat"><b>${forPublication}</b><span>Per a publicació</span></div>
      <div class="stat"><b>${state.selection.length}/${MAX_SAMPLES}</b><span>Seleccionades per al Word</span></div>
    </div>
    <div class="grid-2">
      <section class="card"><div class="card-head"><h2>Últimes mostres</h2><a class="btn btn--ghost btn--small" href="#/database">Veure-les totes</a></div>
        ${state.loading ? '<div class="loading"><span class="spinner spinner--dark"></span> Carregant…</div>' : recent.length ? `<ul class="recent">${recent.map((s) => `<li><span class="code">${esc(s.sample_code)}</span><span class="mono small">${esc(s.molecular_formula)}</span><span class="muted small">${formatDate(s.created_at)}</span></li>`).join('')}</ul>` : '<div class="empty">Encara no hi ha cap mostra.</div>'}
      </section>
      <section class="card"><h2>Accessos ràpids</h2><div class="quick">
        <a class="btn btn--primary btn--large" href="#/new">${icon('plus')} Nova mostra</a>
        <a class="btn btn--ghost btn--large" href="#/database">${icon('database')} Consultar la base de dades</a>
        <a class="btn btn--ghost btn--large" href="#/word">${icon('file')} Generar Word</a>
      </div></section>
    </div>`;
  }

  function viewForm() {
    const editing = state.editingId ? byId(state.editingId) : null;
    if (state.editingId && !editing && state.loading) return loadingBlock;
    if (state.editingId && !editing) {
      return `<div class="card"><div class="empty">Aquesta mostra ja no existeix.<br><a class="btn btn--primary" href="#/database">Torna a la base de dades</a></div></div>`;
    }
    const d = state.draft;
    return `<div class="page-head"><div><h1>${editing ? 'Editar mostra' : 'Nova mostra'}</h1><p>${editing ? `Estàs modificant <strong>${esc(editing.sample_code)}</strong>.` : 'Introdueix les cinc dades; els m/z es calculen automàticament.'}</p></div></div>
    <div class="grid-2">
      <form class="card" id="sample-form" novalidate>
        <div class="field"><label for="f-code">Sample code <span class="req">*</span></label>
          <input id="f-code" type="text" name="sample_code" maxlength="${MAX_CODE_LENGTH}" autocomplete="off" value="${esc(d.sample_code)}">
          <div class="error" data-error="sample_code"></div></div>
        <div class="field"><label for="f-confidence">Confidence in Structure <span class="req">*</span></label>
          <select id="f-confidence" name="confidence">${options(CONFIDENCE, d.confidence, 'Selecciona…')}</select>
          <div class="error" data-error="confidence"></div></div>
        <div class="field"><label for="f-purity">Purity <span class="req">*</span></label>
          <select id="f-purity" name="purity">${options(PURITY, d.purity, 'Selecciona…')}</select>
          <div class="error" data-error="purity"></div></div>
        <div class="field"><label for="f-publication">For publication? <span class="req">*</span></label>
          <select id="f-publication" name="publication">${options(PUBLICATION, d.publication, 'Selecciona…')}</select>
          <div class="error" data-error="publication"></div></div>
        <div class="field"><label for="f-formula">Molecular Formula <span class="req">*</span></label>
          <input id="f-formula" class="mono" type="text" name="molecular_formula" maxlength="${MAX_FORMULA_LENGTH}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="C222H285N75O51" value="${esc(d.molecular_formula)}">
          <div class="error" data-error="molecular_formula"></div></div>
        <div class="field"><label for="f-author">Autor de la mostra</label>
          <input id="f-author" type="text" name="author" maxlength="80" autocomplete="off" value="${esc(d.author || (editing ? '' : defaultAuthor()))}">
          <div class="error" data-error="author"></div></div>
        ${editing ? `<div class="field"><label for="f-analyzed">Analitzada per</label>
          <input id="f-analyzed" type="text" name="analyzed_by" maxlength="80" autocomplete="off" value="${esc(d.analyzed_by)}">
          <div class="error" data-error="analyzed_by"></div></div>` : ''}
        <div class="form-actions">
          <button class="btn btn--primary btn--large" type="submit" id="save-btn">${editing ? 'Guardar canvis' : 'Guardar mostra'}</button>
          ${editing ? '<button class="btn btn--ghost btn--large" type="button" data-action="cancel-edit">Cancel·la</button>' : ''}
        </div>
      </form>
      <section class="card"><h2>Valors m/z calculats</h2><div id="live-panel">${livePanel(d.molecular_formula)}</div></section>
    </div>`;
  }

  function dbResultsHtml() {
    const rows = filteredSamples();
    if (state.loading && !state.samples.length) return '<div class="loading"><span class="spinner spinner--dark"></span> Carregant les mostres…</div>';
    const meta = `<div class="table-meta"><span class="count">${rows.length === state.samples.length ? `${state.samples.length} mostres registrades` : `${rows.length} de ${state.samples.length} mostres`}</span>
      <span class="table-meta"><span class="pill">${state.selection.length} de ${MAX_SAMPLES} seleccionades</span>${state.selection.length ? `<a class="btn btn--primary btn--small" href="#/word">Generar Word</a>` : ''}</span></div>`;
    if (!state.samples.length) {
      return `<div class="empty">Encara no hi ha cap mostra registrada.<br><a class="btn btn--primary" href="#/new">Registra la primera mostra</a></div>`;
    }
    if (!rows.length) return `${meta}<div class="empty">Cap mostra coincideix amb la cerca o els filtres.</div>`;
    const full = state.selection.length >= MAX_SAMPLES;
    return `${meta}<div class="table-wrap"><table class="samples">
      <thead><tr><th><span class="hidden">Seleccionar</span></th><th>Sample code</th><th>Molecular Formula</th><th>Confidence</th><th>Purity</th><th>Publication</th><th>Author</th><th>Analyzed by</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((s) => {
      const selected = state.selection.includes(s.id);
      return `<tr class="${selected ? 'selected' : ''}">
        <td data-label="Seleccionar"><input type="checkbox" data-select="${s.id}" aria-label="Selecciona ${esc(s.sample_code)}" ${selected ? 'checked' : ''} ${!selected && full ? 'disabled title="Ja hi ha cinc mostres seleccionades"' : ''}></td>
        <td data-label="Sample code" class="code">${esc(s.sample_code)}</td>
        <td data-label="Formula" class="formula">${esc(s.molecular_formula)}</td>
        <td data-label="Confidence">${confidenceTag(s.confidence)}</td>
        <td data-label="Purity">${purityTag(s.purity)}</td>
        <td data-label="Publication">${publicationTag(s.publication)}</td>
        <td data-label="Author" class="small">${esc(s.author) || '<span class="muted">—</span>'}</td>
        <td data-label="Analyzed by" class="small">${s.analyzed_by
    ? `<button class="link" data-action="set-analyst" data-id="${s.id}" title="Canvia qui l'ha analitzada">${esc(s.analyzed_by)}</button>`
    : `<button class="btn btn--ghost btn--small" data-action="set-analyst" data-id="${s.id}">Afegir</button>`}</td>
        <td data-label="Date" class="small">${formatDate(s.created_at)}</td>
        <td class="actions-cell"><div class="actions">
          <button class="btn btn--ghost btn--small" data-action="show-mz" data-id="${s.id}">m/z</button>
          <a class="btn btn--ghost btn--small" href="#/edit/${s.id}">Editar</a>
          <button class="btn btn--ghost btn--small" data-action="duplicate" data-id="${s.id}">Duplicar</button>
          <button class="btn btn--danger-ghost btn--small" data-action="delete" data-id="${s.id}">Eliminar</button>
        </div></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function viewDatabase() {
    const f = state.filters;
    return `<div class="page-head"><div><h1>Base de dades</h1><p>Cerca, filtra i gestiona les mostres.</p></div><a class="btn btn--primary" href="#/new">${icon('plus')} Nova mostra</a></div>
    ${loadErrorBanner()}
    <section class="card">
      <div class="toolbar">
        <div class="search"><label for="q">Cerca</label><input id="q" type="search" data-filter="search" placeholder="Codi, fórmula o persona" value="${esc(f.search)}"></div>
        <div><label for="fc">Confidence</label><select id="fc" data-filter="confidence">${options(CONFIDENCE, f.confidence, 'Totes')}</select></div>
        <div><label for="fp">Purity</label><select id="fp" data-filter="purity">${options(PURITY, f.purity, 'Totes')}</select></div>
        <div><label for="fb">Publication</label><select id="fb" data-filter="publication">${options(PUBLICATION, f.publication, 'Totes')}</select></div>
        <div><label for="fs">Ordena per</label><select id="fs" data-filter="sort">
          ${[['date-desc', 'Data (recents)'], ['date-asc', 'Data (antigues)'], ['code-asc', 'Codi (A-Z)'], ['code-desc', 'Codi (Z-A)']].map(([v, l]) => `<option value="${v}"${v === f.sort ? ' selected' : ''}>${l}</option>`).join('')}
        </select></div>
      </div>
      <div id="db-results">${dbResultsHtml()}</div>
    </section>`;
  }

  function slotsHtml() {
    const slots = [];
    for (let i = 0; i < MAX_SAMPLES; i += 1) {
      const sample = byId(state.selection[i]);
      slots.push(sample
        ? `<li class="slot"><span class="slot-num">SAMPLE ${i + 1}</span>
            <div class="slot-body"><b>${esc(sample.sample_code)}</b><span>${esc(sample.molecular_formula)}</span></div>
            <div class="slot-tools">
              <button class="icon-btn" data-action="slot-up" data-index="${i}" aria-label="Puja" ${i === 0 ? 'disabled' : ''}>${icon('up', 16)}</button>
              <button class="icon-btn" data-action="slot-down" data-index="${i}" aria-label="Baixa" ${i === state.selection.length - 1 ? 'disabled' : ''}>${icon('down', 16)}</button>
              <button class="icon-btn" data-action="slot-remove" data-index="${i}" aria-label="Treu">${icon('close', 16)}</button>
            </div></li>`
        : `<li class="slot slot--empty"><span class="slot-num">SAMPLE ${i + 1}</span><div class="slot-body">Buit</div></li>`);
    }
    return slots.join('');
  }

  function pickerHtml() {
    const needle = state.pickerSearch.trim().toLowerCase();
    const rows = [...state.samples]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .filter((s) => !needle || s.sample_code.toLowerCase().includes(needle) || s.molecular_formula.toLowerCase().includes(needle));
    if (!state.samples.length) return `<div class="empty">No hi ha mostres.<br><a class="btn btn--primary" href="#/new">Registra'n una</a></div>`;
    if (!rows.length) return '<div class="empty">Cap coincidència.</div>';
    const full = state.selection.length >= MAX_SAMPLES;
    return rows.map((s) => {
      const selected = state.selection.includes(s.id);
      const disabled = !selected && full;
      return `<label class="${disabled ? 'disabled' : ''}"><input type="checkbox" data-select="${s.id}" ${selected ? 'checked' : ''} ${disabled ? 'disabled' : ''}><b>${esc(s.sample_code)}</b><span>${esc(s.molecular_formula)}</span></label>`;
    }).join('');
  }

  function selectionSummary() {
    const n = state.selection.length;
    return n === 0 ? 'Cap mostra seleccionada' : `${n} ${n === 1 ? 'mostra seleccionada' : 'mostres seleccionades'} de ${MAX_SAMPLES}`;
  }

  function wordPanelsHtml() {
    return `<div class="card-head"><h2>Ordre al formulari</h2><span class="pill" id="selection-count">${selectionSummary()}</span></div>
      <ul class="slots">${slotsHtml()}</ul>`;
  }

  function generateButtonHtml() {
    const n = state.selection.length;
    return `<button class="btn btn--primary btn--large btn--block" data-action="generate" id="generate-btn" ${n === 0 ? 'disabled' : ''}>${icon('file')} Generar Word i PDF</button>
      <p class="hint generate-note">${n === 0 ? 'Selecciona almenys una mostra per generar el document.' : `El document s'emplenarà amb ${n} ${n === 1 ? 'mostra' : 'mostres'} en aquest ordre.`}</p>`;
  }

  function viewWord() {
    const p = state.prefs;
    return `<div class="page-head"><div><h1>Generar Word</h1><p>Selecciona fins a ${MAX_SAMPLES} mostres per emplenar el formulari oficial UEM095.</p></div></div>
    ${loadErrorBanner()}
    <div class="grid-word">
      <div class="stack">
        <section class="card" id="word-slots">${wordPanelsHtml()}</section>
        <section class="card"><h2>Mostres disponibles</h2>
          <input type="search" id="picker-search" placeholder="Cerca per codi o fórmula" aria-label="Cerca mostres" value="${esc(state.pickerSearch)}">
          <div class="picker" id="picker">${state.loading && !state.samples.length ? '<div class="loading"><span class="spinner spinner--dark"></span></div>' : pickerHtml()}</div>
        </section>
      </div>
      <section class="card"><h2>User Info</h2>
        <form id="user-form" novalidate>
          <div class="field"><label for="w-name">Name <span class="req">*</span></label><input id="w-name" type="text" name="name" maxlength="60" autocomplete="name" value="${esc(p.name)}"><div class="error" data-error="name"></div></div>
          <div class="field"><label for="w-email">Email <span class="req">*</span></label><input id="w-email" type="text" inputmode="email" name="email" maxlength="150" autocomplete="off" value="${esc(p.email)}"><div class="hint">Si n'hi ha més d'un, separa'ls amb ; o amb una coma.</div><div class="error" data-error="email"></div></div>
          <div class="field"><label for="w-group">Research group and IP/Company <span class="req">*</span></label><input id="w-group" type="text" name="research_group" maxlength="80" autocomplete="organization" value="${esc(p.research_group)}"><div class="error" data-error="research_group"></div></div>
          <label class="check"><input type="checkbox" id="remember" ${state.remember ? 'checked' : ''}> Guarda aquestes dades per a la propera vegada</label>
        </form>
        <div style="margin-top:18px" id="generate-area">${generateButtonHtml()}</div>
        <div id="generate-result" class="generate-result"></div>
      </section>
    </div>`;
  }

  function viewSettings() {
    const p = state.prefs;
    return `<div class="page-head"><div><h1>Configuració</h1><p>Dades de l'usuari i preferències.</p></div></div>
    ${loadErrorBanner()}
    <div class="grid-2">
      <form class="card" id="settings-form" novalidate><h2>Dades per al formulari (User Info)</h2>
        <div class="field"><label for="s-name">Name <span class="req">*</span></label><input id="s-name" type="text" name="name" maxlength="60" autocomplete="name" value="${esc(p.name)}"><div class="error" data-error="name"></div></div>
        <div class="field"><label for="s-email">Email <span class="req">*</span></label><input id="s-email" type="text" inputmode="email" name="email" maxlength="150" autocomplete="off" value="${esc(p.email)}"><div class="hint">Si n'hi ha més d'un, separa'ls amb ; o amb una coma.</div><div class="error" data-error="email"></div></div>
        <div class="field"><label for="s-group">Research group and IP/Company <span class="req">*</span></label><input id="s-group" type="text" name="research_group" maxlength="80" autocomplete="organization" value="${esc(p.research_group)}"><div class="error" data-error="research_group"></div></div>
        <button class="btn btn--primary" type="submit" id="settings-save">Guardar preferències</button>
      </form>
      <div class="stack">
        ${db.isDemo ? '<section class="card"><h2>Compte</h2><p class="small muted">Mode de prova local: no hi ha inici de sessió i les dades només són en aquest navegador.</p></section>' : `<section class="card"><h2>Compte</h2>
          <p class="small muted">Sessió iniciada com a</p><p style="overflow-wrap:anywhere"><strong>${esc(state.session?.user?.email)}</strong></p>
          <div class="form-actions" style="margin-top:14px"><button class="btn btn--ghost" data-action="sign-out">Tanca la sessió</button></div>
        </section>`}
        <section class="card"><h2>Comprovacions</h2>
          <p class="small muted">Executa les proves automàtiques de masses, m/z i de la generació del Word.</p>
          <div class="form-actions" style="margin-top:12px"><a class="btn btn--ghost" href="tests.html" target="_blank" rel="noopener">Obre les proves</a></div>
        </section>
      </div>
    </div>`;
  }

  function viewSetup() {
    return `<div class="auth"><div class="auth-card setup"><h1>Falta configurar Supabase</h1>
      <p class="sub">L'aplicació encara no està connectada a cap base de dades.</p>
      <ol><li>Crea un projecte a Supabase.</li><li>Executa <code>supabase/schema.sql</code> al SQL Editor.</li><li>Omple <code>js/config.js</code> amb la URL i la clau pública.</li></ol>
      <p class="hint" style="margin-top:12px">Tens els passos detallats al fitxer README.md.</p></div></div>`;
  }

  function viewAuth() {
    const mode = state.recovery ? 'recovery' : state.authMode;
    const titles = { login: 'Entra', signup: 'Crea un compte', reset: 'Recupera la contrasenya', recovery: 'Nova contrasenya' };
    const submit = { login: 'Entra', signup: 'Crea el compte', reset: 'Envia l\'enllaç', recovery: 'Desa la contrasenya' };
    return `<div class="auth"><form class="auth-card" id="auth-form" novalidate>
      <h1>HRMS Manager</h1><p class="sub">Gestió de mostres d'HRMS-ESI</p>
      ${mode === 'login' || mode === 'signup' ? `<div class="tabs"><button type="button" class="${mode === 'login' ? 'active' : ''}" data-action="auth-mode" data-mode="login">Entra</button><button type="button" class="${mode === 'signup' ? 'active' : ''}" data-action="auth-mode" data-mode="signup">Crea un compte</button></div>` : `<h2 style="font-size:16px;margin-bottom:14px">${titles[mode]}</h2>`}
      ${mode !== 'recovery' ? '<div class="field"><label for="a-email">Correu electrònic</label><input id="a-email" type="email" name="email" autocomplete="email" required></div>' : ''}
      ${mode !== 'reset' ? `<div class="field"><label for="a-password">Contrasenya</label><input id="a-password" type="password" name="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="6"></div>` : ''}
      <div class="error" id="auth-error" role="alert"></div>
      <button class="btn btn--primary btn--large btn--block" type="submit" id="auth-submit">${submit[mode]}</button>
      <p style="margin-top:14px;text-align:center">${mode === 'login' ? '<button type="button" class="link" data-action="auth-mode" data-mode="reset">He oblidat la contrasenya</button>' : mode === 'reset' ? '<button type="button" class="link" data-action="auth-mode" data-mode="login">Torna a l\'inici</button>' : ''}</p>
    </form></div>`;
  }

  // --- Renderització i rutes ---

  function currentRoute() {
    const [, page = 'dashboard', param] = window.location.hash.split('/');
    return { page, param };
  }

  const NAV = [
    ['dashboard', 'Dashboard', 'dashboard', 'Dashboard'],
    ['new', 'Nova mostra', 'plus', 'Nova'],
    ['database', 'Base de dades', 'database', 'Mostres'],
    ['word', 'Generar Word', 'file', 'Word'],
    ['settings', 'Configuració', 'settings', 'Ajustos'],
  ];

  function render() {
    if (!db.isAvailable) { appRoot.innerHTML = viewSetup(); return; }
    if (!state.session || state.recovery) { appRoot.innerHTML = viewAuth(); return; }

    const { page } = currentRoute();
    const views = { dashboard: viewDashboard, new: viewForm, edit: viewForm, database: viewDatabase, word: viewWord, settings: viewSettings };
    const view = views[page] || viewDashboard;
    const activePage = page === 'edit' ? 'database' : page;
    const narrow = window.matchMedia('(max-width: 820px)').matches;

    appRoot.innerHTML = `<div class="shell">
      <aside class="sidebar">
        <div class="brand">${logo}<div>HRMS Manager<small>Mostres HRMS-ESI</small></div></div>
        <nav class="nav">${NAV.map(([id, label, ic, short]) => `<a href="#/${id}" class="${activePage === id ? 'active' : ''}">${icon(ic)}<span>${narrow ? short : label}</span>${id === 'word' && state.selection.length ? `<span class="badge">${state.selection.length}</span>` : ''}</a>`).join('')}</nav>
        <div class="account">${db.isDemo ? '<span>Mode de prova local</span>' : `<span>${esc(state.session.user.email)}</span><button class="btn btn--on-dark btn--small" data-action="sign-out">Surt</button>`}</div>
      </aside>
      <main class="main">
        ${db.isDemo ? '<div class="banner banner--info"><strong>Mode de prova local.</strong> Les mostres es guarden només en aquest navegador. Per a l\'ús real cal configurar Supabase i publicar la web.</div>' : ''}
        ${navigator.onLine || db.isDemo ? '' : '<div class="banner">Sense connexió. Pots consultar el que ja s\'ha carregat, però els canvis no es desaran.</div>'}
        ${view()}
      </main></div>`;
  }

  function route() {
    const { page, param } = currentRoute();
    if (page === 'edit') {
      if (state.editingId !== param) {
        state.editingId = param;
        const sample = byId(param);
        state.draft = sample ? {
          sample_code: sample.sample_code,
          confidence: sample.confidence,
          purity: sample.purity,
          publication: sample.publication,
          molecular_formula: sample.molecular_formula,
          author: sample.author || '',
          analyzed_by: sample.analyzed_by || '',
        } : emptyDraft();
      }
    } else if (state.editingId) {
      state.editingId = null;
      state.draft = emptyDraft();
    }
    render();
    window.scrollTo(0, 0);
  }

  // --- Accions de mostres ---

  function validateSampleForm(fields) {
    const errors = {};
    const code = fields.sample_code.trim();
    if (!code) errors.sample_code = 'El Sample code és obligatori.';
    else if (code.length > MAX_CODE_LENGTH) errors.sample_code = `Màxim ${MAX_CODE_LENGTH} caràcters.`;
    if (!CONFIDENCE.includes(fields.confidence)) errors.confidence = 'Tria un valor.';
    if (!PURITY.includes(fields.purity)) errors.purity = 'Tria un valor.';
    if (!PUBLICATION.includes(fields.publication)) errors.publication = 'Tria un valor.';
    try {
      parseFormula(fields.molecular_formula);
    } catch (error) {
      if (!(error instanceof FormulaError)) throw error;
      errors.molecular_formula = error.message;
    }
    return errors;
  }

  function showFieldErrors(form, errors) {
    form.querySelectorAll('[data-error]').forEach((el) => {
      const key = el.dataset.error;
      el.textContent = errors[key] || '';
      form.elements[key]?.setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
    });
    const first = Object.keys(errors)[0];
    if (first) form.elements[first]?.focus();
  }

  function formFields(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  async function submitSample(form) {
    if (state.busy) return;
    const fields = formFields(form);
    const errors = validateSampleForm(fields);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) return;

    const editingId = state.editingId;
    if (!editingId) fields.author = fields.author.trim() || defaultAuthor();
    const code = fields.sample_code.trim();
    const clash = state.samples.some((s) => s.id !== editingId && s.sample_code.toLowerCase() === code.toLowerCase());
    if (clash) {
      const proceed = await confirmDialog({
        title: 'Codi repetit',
        body: `Ja hi ha una mostra amb el codi <strong>${esc(code)}</strong>. Vols guardar-la igualment?`,
        confirmLabel: 'Guarda igualment',
      });
      if (!proceed) return;
    }

    const button = $('#save-btn');
    state.busy = true;
    setButtonBusy(button, true, 'Guardant…');
    try {
      const row = editingId ? await db.updateSample(editingId, fields) : await db.insertSample(fields);
      upsertLocal(row);
      state.busy = false;
      toast(editingId ? `Canvis guardats a ${row.sample_code}.` : `Mostra ${row.sample_code} guardada a la base de dades.`, 'success');
      if (editingId) {
        window.location.hash = '#/database';
      } else {
        state.draft = emptyDraft();
        render();
        $('#f-code')?.focus();
      }
    } catch (error) {
      // El formulari no es buida: les dades continuen a la pantalla per reintentar.
      state.busy = false;
      setButtonBusy(button, false);
      toast(db.friendlyError(error), 'error');
    }
  }

  function nextCopyCode(code) {
    const base = `${code}-copy`.slice(0, MAX_CODE_LENGTH);
    const taken = new Set(state.samples.map((s) => s.sample_code.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let n = 2; ; n += 1) {
      const suffix = `-copy${n}`;
      const candidate = code.slice(0, MAX_CODE_LENGTH - suffix.length) + suffix;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
  }

  async function duplicateSample(id, button) {
    const sample = byId(id);
    if (!sample) return;
    setButtonBusy(button, true, '…');
    try {
      const row = await db.insertSample({ ...sample, sample_code: nextCopyCode(sample.sample_code), analyzed_by: '' });
      upsertLocal(row);
      toast(`Duplicada com a ${row.sample_code}.`, 'success');
      refreshDatabase();
    } catch (error) {
      setButtonBusy(button, false);
      toast(db.friendlyError(error), 'error');
    }
  }

  function refreshDatabase() {
    const results = $('#db-results');
    if (results) results.innerHTML = dbResultsHtml();
  }

  async function removeSample(id) {
    const sample = byId(id);
    if (!sample) return;
    const accepted = await confirmDialog({
      title: 'Eliminar la mostra?',
      body: `S'eliminarà <strong>${esc(sample.sample_code)}</strong> (<span class="mono">${esc(sample.molecular_formula)}</span>) de la base de dades.`,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!accepted) return;
    try {
      await db.deleteSample(id);
      state.samples = state.samples.filter((s) => s.id !== id);
      state.selection = state.selection.filter((x) => x !== id);
      render();
      toast(`S'ha eliminat ${sample.sample_code}.`, 'info', { label: 'Desfés', run: () => undoDelete(sample) });
    } catch (error) {
      toast(db.friendlyError(error), 'error');
    }
  }

  async function undoDelete(sample) {
    try {
      upsertLocal(await db.restoreSample(sample));
      render();
      toast(`S'ha recuperat ${sample.sample_code}.`, 'success');
    } catch (error) {
      toast(db.friendlyError(error), 'error');
    }
  }

  function askAnalyst(id) {
    const sample = byId(id);
    if (!sample) return;
    const known = [...new Set(state.samples.map((s) => s.analyzed_by).filter(Boolean))];
    openModal(`<form class="modal-body" id="analyst-form" data-id="${id}" novalidate>
      <h2>Qui ha analitzat ${esc(sample.sample_code)}?</h2>
      <div class="field"><label for="analyst-name">Analitzada per</label>
        <input id="analyst-name" type="text" name="analyzed_by" maxlength="80" autocomplete="off" list="known-analysts" value="${esc(sample.analyzed_by)}" autofocus>
        <datalist id="known-analysts">${known.map((name) => `<option value="${esc(name)}"></option>`).join('')}</datalist>
        <div class="hint">Deixa-ho buit per treure-ho.</div></div>
      <div class="modal-actions">
        <button class="btn btn--ghost" type="button" data-action="close-modal">Cancel·la</button>
        <button class="btn btn--primary" type="submit" id="analyst-save">Guardar</button>
      </div></form>`);
  }

  async function saveAnalyst(form) {
    const button = $('#analyst-save');
    setButtonBusy(button, true, 'Guardant…');
    try {
      const row = await db.setAnalyzedBy(form.dataset.id, form.elements.analyzed_by.value);
      upsertLocal(row);
      closeModal();
      refreshDatabase();
      toast(row.analyzed_by ? `${row.sample_code}: analitzada per ${row.analyzed_by}.` : `S'ha tret l'analista de ${row.sample_code}.`, 'success');
    } catch (error) {
      setButtonBusy(button, false);
      toast(db.friendlyError(error), 'error');
    }
  }

  function showMz(id) {
    const sample = byId(id);
    if (!sample) return;
    openModal(`<div class="modal-body"><h2>${esc(sample.sample_code)}</h2>
      <p class="mono small muted" style="margin-bottom:12px;overflow-wrap:anywhere">${esc(sample.molecular_formula)}</p>
      ${ionsTable(sample.molecular_formula)}
      <div class="modal-actions"><button class="btn btn--primary" data-action="close-modal" autofocus>Tanca</button></div></div>`);
  }

  // --- Selecció ---

  function refreshSelectionViews() {
    const slots = $('#word-slots');
    if (slots) {
      slots.innerHTML = wordPanelsHtml();
      $('#picker').innerHTML = pickerHtml();
      $('#generate-area').innerHTML = generateButtonHtml();
    }
    refreshDatabase();
    const badgeLink = $('.nav a[href="#/word"]');
    if (badgeLink) {
      badgeLink.querySelector('.badge')?.remove();
      if (state.selection.length) badgeLink.insertAdjacentHTML('beforeend', `<span class="badge">${state.selection.length}</span>`);
    }
  }

  function toggleSelection(id, checked) {
    if (checked) {
      if (state.selection.length >= MAX_SAMPLES) {
        toast(`El formulari només admet ${MAX_SAMPLES} mostres.`, 'error');
      } else if (!state.selection.includes(id)) {
        state.selection.push(id);
      }
    } else {
      state.selection = state.selection.filter((x) => x !== id);
    }
    refreshSelectionViews();
  }

  function moveSlot(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.selection.length) return;
    const list = state.selection;
    [list[index], list[target]] = [list[target], list[index]];
    refreshSelectionViews();
  }

  // --- Generació del Word ---

  function validateUserInfo(fields) {
    const errors = {};
    if (!fields.name.trim()) errors.name = 'Introdueix el nom.';
    const emails = parseEmails(fields.email);
    if (!emails.length || !emails.every(isEmail)) errors.email = 'Introdueix correus vàlids, separats amb ; o amb una coma.';
    else if (!emailsFit(emails)) errors.email = 'Hi ha massa correus per a l\'espai del formulari.';
    if (!fields.research_group.trim()) errors.research_group = 'Introdueix el grup o l\'empresa.';
    return errors;
  }

  const MIME_PDF = 'application/pdf';
  let generatedUrls = [];

  function saveFile(url, filename) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  }

  // Descarrega els fitxers i deixa enllaços per si el navegador bloqueja la segona descàrrega.
  function deliverFiles(files) {
    generatedUrls.forEach((url) => URL.revokeObjectURL(url));
    const ready = files.map((file) => ({ ...file, url: URL.createObjectURL(new Blob([file.bytes], { type: file.type })) }));
    generatedUrls = ready.map((file) => file.url);
    ready.forEach((file, index) => setTimeout(() => saveFile(file.url, file.name), index * 500));
    const area = $('#generate-result');
    if (area) {
      area.innerHTML = ready.map((file) => `<a class="btn btn--ghost" href="${file.url}" download="${esc(file.name)}">Descarrega el ${esc(file.label)}</a>`).join('');
    }
  }

  async function generateWord(button) {
    const samples = state.selection.map(byId).filter(Boolean);
    if (!samples.length || samples.length > MAX_SAMPLES) {
      toast('Selecciona entre una i cinc mostres.', 'error');
      return;
    }
    const form = $('#user-form');
    const user = formFields(form);
    const errors = validateUserInfo(user);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) return;

    state.remember = $('#remember').checked;
    setButtonBusy(button, true, 'Generant…');
    try {
      const template = await loadTemplate();
      const bytes = await generateDocx(template, { user, samples }, window.JSZip);
      const baseName = `UEM095_COMPACT_Request_Form_${new Date().toISOString().slice(0, 10)}`;
      const files = [{ bytes, type: MIME_DOCX, name: `${baseName}.docx`, label: 'Word' }];
      let pdfError = null;
      try {
        files.push({ bytes: await generatePdf({ user, samples }), type: MIME_PDF, name: `${baseName}.pdf`, label: 'PDF' });
      } catch (error) {
        pdfError = error;
      }
      deliverFiles(files);
      if (pdfError) toast(`S'ha generat el Word, però no el PDF: ${pdfError.message}`, 'error');
      else toast(`Word i PDF generats amb ${samples.length} ${samples.length === 1 ? 'mostra' : 'mostres'}.`, 'success');
      state.prefs = { name: user.name.trim(), email: parseEmails(user.email).join('; '), research_group: user.research_group.trim() };
      if (state.remember) {
        await db.savePreferences(state.session.user.id, state.prefs)
          .catch((error) => toast(`El Word s'ha generat, però no s'han guardat les preferències. ${db.friendlyError(error)}`, 'error'));
      }
    } catch (error) {
      toast(error.name === 'TemplateError' || error.name === 'FormulaError' ? error.message : db.friendlyError(error), 'error');
    } finally {
      setButtonBusy(button, false);
      button.disabled = state.selection.length === 0;
    }
  }

  async function saveSettings(form) {
    const fields = formFields(form);
    const errors = validateUserInfo(fields);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) return;
    const button = $('#settings-save');
    setButtonBusy(button, true, 'Guardant…');
    try {
      const clean = { name: fields.name.trim(), email: parseEmails(fields.email).join('; '), research_group: fields.research_group.trim() };
      await db.savePreferences(state.session.user.id, clean);
      state.prefs = clean;
      toast('Preferències guardades.', 'success');
    } catch (error) {
      toast(db.friendlyError(error), 'error');
    } finally {
      setButtonBusy(button, false);
    }
  }

  // --- Accés ---

  async function submitAuth(form) {
    const button = $('#auth-submit');
    const errorEl = $('#auth-error');
    const email = form.elements.email?.value.trim() ?? '';
    const password = form.elements.password?.value ?? '';
    const mode = state.recovery ? 'recovery' : state.authMode;
    errorEl.textContent = '';
    if (mode !== 'recovery' && !isEmail(email)) { errorEl.textContent = 'Introdueix un correu vàlid.'; return; }
    if (mode !== 'reset' && password.length < 6) { errorEl.textContent = 'La contrasenya ha de tenir almenys 6 caràcters.'; return; }

    setButtonBusy(button, true, 'Un moment…');
    try {
      if (mode === 'login') {
        await db.signIn(email, password);
      } else if (mode === 'signup') {
        const result = await db.signUp(email, password);
        if (!result.session) {
          toast('Compte creat. Revisa el correu per confirmar-lo.', 'success');
          state.authMode = 'login';
          render();
        }
      } else if (mode === 'reset') {
        await db.resetPassword(email);
        toast('T\'hem enviat un enllaç per canviar la contrasenya.', 'success');
        state.authMode = 'login';
        render();
      } else {
        await db.updatePassword(password);
        state.recovery = false;
        toast('Contrasenya actualitzada.', 'success');
        await loadData();
      }
    } catch (error) {
      errorEl.textContent = db.friendlyError(error);
      setButtonBusy(button, false);
    }
  }

  async function handleSignOut() {
    try {
      await db.signOut();
    } catch (error) {
      toast(db.friendlyError(error), 'error');
    }
  }

  function resetSessionData() {
    Object.assign(state, {
      samples: [], selection: [], loaded: false, loadError: '', draft: emptyDraft(), editingId: null,
      prefs: { name: '', email: '', research_group: '' },
    });
  }

  // --- Esdeveniments ---

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const { action, id, index, mode } = trigger.dataset;
    const handlers = {
      reload: loadData,
      'sign-out': handleSignOut,
      'cancel-edit': () => { window.location.hash = '#/database'; },
      'show-mz': () => showMz(id),
      'set-analyst': () => askAnalyst(id),
      duplicate: () => duplicateSample(id, trigger),
      delete: () => removeSample(id),
      'slot-up': () => moveSlot(Number(index), -1),
      'slot-down': () => moveSlot(Number(index), 1),
      'slot-remove': () => toggleSelection(state.selection[Number(index)], false),
      generate: () => generateWord(trigger),
      'close-modal': closeModal,
      'auth-mode': () => { state.authMode = mode; render(); },
    };
    handlers[action]?.();
  });

  document.addEventListener('submit', (event) => {
    event.preventDefault();
    const { id } = event.target;
    if (id === 'sample-form') submitSample(event.target);
    if (id === 'settings-form') saveSettings(event.target);
    if (id === 'analyst-form') saveAnalyst(event.target);
    if (id === 'auth-form') submitAuth(event.target);
  });

  document.addEventListener('input', (event) => {
    const { target } = event;
    if (target.closest('#sample-form') && target.name) {
      state.draft[target.name] = target.value;
      if (target.name === 'molecular_formula') $('#live-panel').innerHTML = livePanel(target.value);
      const errorEl = $(`[data-error="${target.name}"]`);
      if (errorEl?.textContent) { errorEl.textContent = ''; target.setAttribute('aria-invalid', 'false'); }
    } else if (target.dataset.filter) {
      state.filters[target.dataset.filter] = target.value;
      refreshDatabase();
    } else if (target.id === 'picker-search') {
      state.pickerSearch = target.value;
      $('#picker').innerHTML = pickerHtml();
    }
  });

  document.addEventListener('change', (event) => {
    const id = event.target.dataset.select;
    if (id) toggleSelection(id, event.target.checked);
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  window.addEventListener('beforeunload', (event) => {
    if (state.busy) event.preventDefault();
  });

  // --- Inici ---

  async function start() {
    if (!db.isAvailable) { render(); return; }

    db.onAuthChange((authEvent, session) => {
      // Supabase demana no fer crides seves dins d'aquest callback.
      setTimeout(() => {
        const previous = state.session?.user?.id;
        state.session = session;
        if (authEvent === 'PASSWORD_RECOVERY') { state.recovery = true; render(); return; }
        if (!session) { resetSessionData(); state.recovery = false; render(); return; }
        if (session.user.id !== previous && !state.recovery) loadData();
      }, 0);
    });

    try {
      state.session = await db.getSession();
    } catch (error) {
      toast(db.friendlyError(error), 'error');
    }
    if (state.session) {
      route();
      if (!state.loaded && !state.loading) await loadData();
    } else {
      render();
    }
  }

  start();
})();
