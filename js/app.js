// Application interface: routes, views and actions.
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
  const MIME_PDF = 'application/pdf';
  const USER_INFO_KEY = 'hrms-manager-user-info';
  const LICENSE_URL = 'https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.en';

  const CONFIDENCE = ['High', 'Medium', 'Low'];
  const PURITY = ['Pure', 'Impure'];
  const PUBLICATION = ['Yes', 'No'];

  const emptyDraft = () => ({
    sample_code: '', confidence: '', purity: '', publication: '', molecular_formula: '', author: '', analyzed_by: '',
  });

  const todayIso = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };

  // User Info is kept per device: everyone shares one login, but each person fills the form with their own details.
  function readUserInfo() {
    try {
      const stored = JSON.parse(localStorage.getItem(USER_INFO_KEY) || 'null');
      if (stored) return { name: stored.name || '', email: stored.email || '', research_group: stored.research_group || '' };
    } catch { /* storage unavailable: start empty */ }
    return { name: '', email: '', research_group: '' };
  }

  function writeUserInfo(info) {
    try {
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(info));
      return true;
    } catch {
      return false;
    }
  }

  const state = {
    session: null,
    samples: [],
    loading: false,
    loadError: '',
    loaded: false,
    selection: [],
    prefs: readUserInfo(),
    request: { date: todayIso() },
    filters: { search: '', confidence: '', purity: '', publication: '', sort: 'date-desc' },
    draft: emptyDraft(),
    editingId: null,
    busy: false,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const appRoot = $('#app');

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const dateFormat = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' });
  const formatDate = (iso) => dateFormat.format(new Date(iso));
  const byId = (id) => state.samples.find((s) => s.id === id);
  const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const defaultAuthor = () => state.prefs.name || '';
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const icon = (name, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{
    plus: '<path d="M12 5v14M5 12h14"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
    settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
  }[name]}</svg>`;

  const logo = '<svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#1f4e8c"/><path d="M7 24v-6M12 24V9M17 24v-9M22 24v-4M26 24v-2" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';

  const footer = (variant = '') => `<footer class="site-footer ${variant}">
    <a href="${LICENSE_URL}" target="_blank" rel="license noopener"><img src="assets/img/cc-by-nc-nd.png" alt="Creative Commons BY-NC-ND 4.0 license" width="88" height="31"></a>
    <p>PGLearn © 2026 Mireia Serrat. This work is licensed under the <a href="${LICENSE_URL}" target="_blank" rel="license noopener">Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License (CC BY-NC-ND 4.0)</a>.</p>
  </footer>`;

  // --- Notifications and dialogs ---

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

  function openModal(html, wide = false) {
    const modal = $('#modal');
    modal.classList.toggle('modal--wide', wide);
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
          <button class="btn btn--ghost" data-answer="no" autofocus>Cancel</button>
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

  // --- Data ---

  async function loadData() {
    state.loading = true;
    state.loadError = '';
    render();
    try {
      state.samples = await db.listSamples();
      state.selection = state.selection.filter((id) => byId(id));
      state.loaded = true;
    } catch (error) {
      state.loadError = db.friendlyError(error);
    } finally {
      state.loading = false;
      // When an edit link is opened directly, the form can only be filled once the data is here.
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

  // --- View fragments ---

  const ionHtml = (label) => label.replace(/^\[(.*)\](\d*\+)$/, '[$1]<sup>$2</sup>');

  function ionsTable(formula) {
    const { massText, ions } = computeIons(formula);
    return `<div class="mass-head"><span>Monoisotopic mass (M)</span><b>${massText}</b></div>
      <table class="ions"><tbody>${ions.map((ion) => `<tr><th scope="row">${ionHtml(ion.label)}</th><td>${ion.text}</td></tr>`).join('')}</tbody></table>`;
  }

  function livePanel(formula) {
    if (!formula.trim()) return '<div class="ions-empty">Enter a molecular formula to calculate the m/z values.</div>';
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

  const loadingBlock = '<div class="card"><div class="loading"><span class="spinner spinner--dark"></span> Loading samples…</div></div>';

  const loadErrorBanner = () => (state.loadError
    ? `<div class="banner banner--error"><span>${esc(state.loadError)}</span><button class="btn btn--ghost btn--small" data-action="reload">Try again</button></div>`
    : '');

  const userInfoFields = (prefix, p) => `
    <div class="field"><label for="${prefix}-name">Name <span class="req">*</span></label><input id="${prefix}-name" type="text" name="name" maxlength="60" autocomplete="name" value="${esc(p.name)}"><div class="error" data-error="name"></div></div>
    <div class="field"><label for="${prefix}-email">Email <span class="req">*</span></label><input id="${prefix}-email" type="text" inputmode="email" name="email" maxlength="150" autocomplete="off" value="${esc(p.email)}"><div class="hint">For more than one address, separate them with ; or a comma.</div><div class="error" data-error="email"></div></div>
    <div class="field"><label for="${prefix}-group">Research group and IP/Company <span class="req">*</span></label><input id="${prefix}-group" type="text" name="research_group" maxlength="80" autocomplete="organization" value="${esc(p.research_group)}"><div class="error" data-error="research_group"></div></div>`;

  // --- Views ---

  function viewForm() {
    const editing = state.editingId ? byId(state.editingId) : null;
    if (state.editingId && !editing && state.loading) return loadingBlock;
    if (state.editingId && !editing) {
      return `<div class="card"><div class="empty">This sample no longer exists.<br><a class="btn btn--primary" href="#/database">Back to the database</a></div></div>`;
    }
    const d = state.draft;
    return `<div class="page-head"><div><h1>${editing ? 'Edit sample' : 'New sample'}</h1><p>${editing ? `You are editing <strong>${esc(editing.sample_code)}</strong>.` : 'Enter the sample details; the m/z values are calculated automatically.'}</p></div></div>
    <div class="grid-2">
      <form class="card" id="sample-form" novalidate>
        <div class="field"><label for="f-code">Sample code <span class="req">*</span></label>
          <input id="f-code" type="text" name="sample_code" maxlength="${MAX_CODE_LENGTH}" autocomplete="off" value="${esc(d.sample_code)}">
          <div class="error" data-error="sample_code"></div></div>
        <div class="field"><label for="f-confidence">Confidence in Structure <span class="req">*</span></label>
          <select id="f-confidence" name="confidence">${options(CONFIDENCE, d.confidence, 'Select…')}</select>
          <div class="error" data-error="confidence"></div></div>
        <div class="field"><label for="f-purity">Purity <span class="req">*</span></label>
          <select id="f-purity" name="purity">${options(PURITY, d.purity, 'Select…')}</select>
          <div class="error" data-error="purity"></div></div>
        <div class="field"><label for="f-publication">For publication? <span class="req">*</span></label>
          <select id="f-publication" name="publication">${options(PUBLICATION, d.publication, 'Select…')}</select>
          <div class="error" data-error="publication"></div></div>
        <div class="field"><label for="f-formula">Molecular Formula <span class="req">*</span></label>
          <input id="f-formula" class="mono" type="text" name="molecular_formula" maxlength="${MAX_FORMULA_LENGTH}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="C222H285N75O51" value="${esc(d.molecular_formula)}">
          <div class="error" data-error="molecular_formula"></div></div>
        <div class="field"><label for="f-author">Author</label>
          <input id="f-author" type="text" name="author" maxlength="80" autocomplete="off" value="${esc(d.author || (editing ? '' : defaultAuthor()))}">
          <div class="error" data-error="author"></div></div>
        ${editing ? `<div class="field"><label for="f-analyzed">Analyzed by</label>
          <input id="f-analyzed" type="text" name="analyzed_by" maxlength="80" autocomplete="off" value="${esc(d.analyzed_by)}">
          <div class="error" data-error="analyzed_by"></div></div>` : ''}
        <div class="form-actions">
          <button class="btn btn--primary btn--large" type="submit" id="save-btn">${editing ? 'Save changes' : 'Save sample'}</button>
          ${editing ? '<button class="btn btn--ghost btn--large" type="button" data-action="cancel-edit">Cancel</button>' : ''}
        </div>
      </form>
      <section class="card"><h2>Calculated m/z values</h2><div id="live-panel">${livePanel(d.molecular_formula)}</div></section>
    </div>`;
  }

  function selectionBarHtml() {
    const n = state.selection.length;
    return `<span class="pill">${n} of ${MAX_SAMPLES} selected</span>
      <button class="btn btn--primary btn--small" data-action="open-request" ${n ? '' : 'disabled title="Select at least one sample"'}>${icon('file', 16)} Request form</button>`;
  }

  function dbResultsHtml() {
    const rows = filteredSamples();
    if (state.loading && !state.samples.length) return '<div class="loading"><span class="spinner spinner--dark"></span> Loading samples…</div>';
    const meta = `<div class="table-meta"><span class="count">${rows.length === state.samples.length ? `${plural(state.samples.length, 'sample')} registered` : `${rows.length} of ${plural(state.samples.length, 'sample')}`}</span>
      <span class="table-meta" id="selection-bar">${selectionBarHtml()}</span></div>`;
    if (!state.samples.length) {
      return `<div class="empty">No samples registered yet.<br><a class="btn btn--primary" href="#/new">Register the first sample</a></div>`;
    }
    if (!rows.length) return `${meta}<div class="empty">No samples match the search or filters.</div>`;
    const full = state.selection.length >= MAX_SAMPLES;
    return `${meta}<p class="hint table-hint">Tick up to ${MAX_SAMPLES} samples and press <strong>Request form</strong> to download the official form as Word or PDF.</p>
      <div class="table-wrap"><table class="samples">
      <thead><tr><th><span class="hidden">Select</span></th><th>Sample code</th><th>Molecular Formula</th><th>Confidence</th><th>Purity</th><th>Publication</th><th>Author</th><th>Analyzed by</th><th>Date</th><th>Actions</th></tr></thead>
      <tbody>${rows.map((s) => {
      const selected = state.selection.includes(s.id);
      return `<tr class="${selected ? 'selected' : ''}">
        <td data-label="Select"><input type="checkbox" data-select="${s.id}" aria-label="Select ${esc(s.sample_code)}" ${selected ? 'checked' : ''} ${!selected && full ? 'disabled title="Five samples are already selected"' : ''}></td>
        <td data-label="Sample code" class="code">${esc(s.sample_code)}</td>
        <td data-label="Formula" class="formula">${esc(s.molecular_formula)}</td>
        <td data-label="Confidence">${confidenceTag(s.confidence)}</td>
        <td data-label="Purity">${purityTag(s.purity)}</td>
        <td data-label="Publication">${publicationTag(s.publication)}</td>
        <td data-label="Author" class="small">${esc(s.author) || '<span class="muted">—</span>'}</td>
        <td data-label="Analyzed by" class="small">${s.analyzed_by
    ? `<button class="link" data-action="set-analyst" data-id="${s.id}" title="Change who analyzed it">${esc(s.analyzed_by)}</button>`
    : `<button class="btn btn--ghost btn--small" data-action="set-analyst" data-id="${s.id}">Add</button>`}</td>
        <td data-label="Date" class="small">${formatDate(s.created_at)}</td>
        <td class="actions-cell"><div class="actions">
          <button class="btn btn--ghost btn--small" data-action="show-mz" data-id="${s.id}">m/z</button>
          <a class="btn btn--ghost btn--small" href="#/edit/${s.id}">Edit</a>
          <button class="btn btn--ghost btn--small" data-action="duplicate" data-id="${s.id}">Duplicate</button>
          <button class="btn btn--danger-ghost btn--small" data-action="delete" data-id="${s.id}">Delete</button>
        </div></td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function viewDatabase() {
    const f = state.filters;
    return `<div class="page-head"><div><h1>Database</h1><p>Search, filter and manage the samples.</p></div><a class="btn btn--primary" href="#/new">${icon('plus')} New sample</a></div>
    ${loadErrorBanner()}
    <section class="card">
      <div class="toolbar">
        <div class="search"><label for="q">Search</label><input id="q" type="search" data-filter="search" placeholder="Code, formula or person" value="${esc(f.search)}"></div>
        <div><label for="fc">Confidence</label><select id="fc" data-filter="confidence">${options(CONFIDENCE, f.confidence, 'All')}</select></div>
        <div><label for="fp">Purity</label><select id="fp" data-filter="purity">${options(PURITY, f.purity, 'All')}</select></div>
        <div><label for="fb">Publication</label><select id="fb" data-filter="publication">${options(PUBLICATION, f.publication, 'All')}</select></div>
        <div><label for="fs">Sort by</label><select id="fs" data-filter="sort">
          ${[['date-desc', 'Date (newest)'], ['date-asc', 'Date (oldest)'], ['code-asc', 'Code (A-Z)'], ['code-desc', 'Code (Z-A)']].map(([v, l]) => `<option value="${v}"${v === f.sort ? ' selected' : ''}>${l}</option>`).join('')}
        </select></div>
      </div>
      <div id="db-results">${dbResultsHtml()}</div>
    </section>`;
  }

  function viewSettings() {
    return `<div class="page-head"><div><h1>Settings</h1><p>Your details for the form and the session.</p></div></div>
    <div class="grid-2">
      <form class="card" id="settings-form" novalidate><h2>User Info for the form</h2>
        <p class="hint" style="margin-bottom:14px">Saved on this device only, so each person keeps their own details.</p>
        ${userInfoFields('s', state.prefs)}
        <button class="btn btn--primary" type="submit" id="settings-save">Save details</button>
      </form>
      <div class="stack">
        ${db.isDemo ? '<section class="card"><h2>Session</h2><p class="small muted">Local test mode: there is no login and the data stays in this browser.</p></section>' : `<section class="card"><h2>Session</h2>
          <p class="small muted">Signed in with the shared laboratory account. All samples are shared.</p>
          <div class="form-actions" style="margin-top:14px"><button class="btn btn--ghost" data-action="sign-out">Sign out</button></div>
        </section>`}
        <section class="card"><h2>Checks</h2>
          <p class="small muted">Runs the automatic tests for masses, m/z values and the Word and PDF forms.</p>
          <div class="form-actions" style="margin-top:12px"><a class="btn btn--ghost" href="tests.html" target="_blank" rel="noopener">Open the tests</a></div>
        </section>
      </div>
    </div>`;
  }

  function viewSetup() {
    return `<div class="auth"><div class="auth-card setup"><h1>Supabase is not configured</h1>
      <p class="sub">The application is not connected to a database yet.</p>
      <ol><li>Create a Supabase project.</li><li>Run <code>supabase/schema.sql</code> in the SQL Editor.</li><li>Fill in <code>js/config.js</code> with the URL and the public key.</li></ol>
      <p class="hint" style="margin-top:12px">README.md has the detailed steps.</p></div>${footer('site-footer--dark')}</div>`;
  }

  function viewAuth() {
    return `<div class="auth"><form class="auth-card" id="auth-form" novalidate>
      <h1>HRMS Manager</h1><p class="sub">HRMS-ESI sample management</p>
      <div class="field"><label for="a-user">User</label><input id="a-user" type="text" name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required></div>
      <div class="field"><label for="a-password">Password</label><input id="a-password" type="password" name="password" autocomplete="current-password" required></div>
      <div class="error" id="auth-error" role="alert"></div>
      <button class="btn btn--primary btn--large btn--block" type="submit" id="auth-submit">Sign in</button>
      <p class="hint" style="margin-top:14px;text-align:center">Use the shared laboratory account. You stay signed in on this device.</p>
    </form>${footer('site-footer--dark')}</div>`;
  }

  // --- Rendering and routes ---

  function currentRoute() {
    const [, page = 'database', param] = window.location.hash.split('/');
    return { page, param };
  }

  const NAV = [
    ['new', 'New sample', 'plus', 'New'],
    ['database', 'Database', 'database', 'Samples'],
    ['settings', 'Settings', 'settings', 'Settings'],
  ];

  function navBadge() {
    return state.selection.length ? `<span class="badge">${state.selection.length}</span>` : '';
  }

  function render() {
    if (!db.isAvailable) { appRoot.innerHTML = viewSetup(); return; }
    if (!state.session) { appRoot.innerHTML = viewAuth(); return; }

    const { page } = currentRoute();
    const views = { new: viewForm, edit: viewForm, database: viewDatabase, settings: viewSettings };
    const view = views[page] || viewDatabase;
    const activePage = page === 'edit' || !views[page] ? 'database' : page;
    const narrow = window.matchMedia('(max-width: 820px)').matches;

    appRoot.innerHTML = `<div class="shell">
      <aside class="sidebar">
        <div class="brand">${logo}<div>HRMS Manager<small>HRMS-ESI samples</small></div></div>
        <nav class="nav">${NAV.map(([id, label, ic, short]) => `<a href="#/${id}" class="${activePage === id ? 'active' : ''}">${icon(ic)}<span>${narrow ? short : label}</span>${id === 'database' ? navBadge() : ''}</a>`).join('')}</nav>
        <div class="account">${db.isDemo ? '<span>Local test mode</span>' : '<span>Shared lab account</span><button class="btn btn--on-dark btn--small" data-action="sign-out">Sign out</button>'}</div>
      </aside>
      <main class="main">
        <div class="main-content">
          ${db.isDemo ? '<div class="banner banner--info"><strong>Local test mode.</strong> Samples are only stored in this browser. Real use needs Supabase and the published website.</div>' : ''}
          ${navigator.onLine || db.isDemo ? '' : '<div class="banner">You are offline. You can browse what is already loaded, but changes will not be saved.</div>'}
          ${view()}
        </div>
        ${footer()}
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

  // --- Sample actions ---

  function validateSampleForm(fields) {
    const errors = {};
    const code = fields.sample_code.trim();
    if (!code) errors.sample_code = 'Sample code is required.';
    else if (code.length > MAX_CODE_LENGTH) errors.sample_code = `At most ${MAX_CODE_LENGTH} characters.`;
    if (!CONFIDENCE.includes(fields.confidence)) errors.confidence = 'Choose a value.';
    if (!PURITY.includes(fields.purity)) errors.purity = 'Choose a value.';
    if (!PUBLICATION.includes(fields.publication)) errors.publication = 'Choose a value.';
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
        title: 'Duplicate code',
        body: `A sample with the code <strong>${esc(code)}</strong> already exists. Save it anyway?`,
        confirmLabel: 'Save anyway',
      });
      if (!proceed) return;
    }

    const button = $('#save-btn');
    state.busy = true;
    setButtonBusy(button, true, 'Saving…');
    try {
      const row = editingId ? await db.updateSample(editingId, fields) : await db.insertSample(fields);
      upsertLocal(row);
      state.busy = false;
      toast(editingId ? `Changes to ${row.sample_code} saved.` : `Sample ${row.sample_code} saved to the database.`, 'success');
      if (editingId) {
        window.location.hash = '#/database';
      } else {
        state.draft = emptyDraft();
        render();
        $('#f-code')?.focus();
      }
    } catch (error) {
      // The form keeps its values so the save can be retried.
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
      toast(`Duplicated as ${row.sample_code}.`, 'success');
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
      title: 'Delete this sample?',
      body: `<strong>${esc(sample.sample_code)}</strong> (<span class="mono">${esc(sample.molecular_formula)}</span>) will be removed from the shared database.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!accepted) return;
    try {
      await db.deleteSample(id);
      state.samples = state.samples.filter((s) => s.id !== id);
      state.selection = state.selection.filter((x) => x !== id);
      render();
      toast(`${sample.sample_code} deleted.`, 'info', { label: 'Undo', run: () => undoDelete(sample) });
    } catch (error) {
      toast(db.friendlyError(error), 'error');
    }
  }

  async function undoDelete(sample) {
    try {
      upsertLocal(await db.restoreSample(sample));
      render();
      toast(`${sample.sample_code} restored.`, 'success');
    } catch (error) {
      toast(db.friendlyError(error), 'error');
    }
  }

  function askAnalyst(id) {
    const sample = byId(id);
    if (!sample) return;
    const known = [...new Set(state.samples.map((s) => s.analyzed_by).filter(Boolean))];
    openModal(`<form class="modal-body" id="analyst-form" data-id="${id}" novalidate>
      <h2>Who analyzed ${esc(sample.sample_code)}?</h2>
      <div class="field"><label for="analyst-name">Analyzed by</label>
        <input id="analyst-name" type="text" name="analyzed_by" maxlength="80" autocomplete="off" list="known-analysts" value="${esc(sample.analyzed_by)}" autofocus>
        <datalist id="known-analysts">${known.map((name) => `<option value="${esc(name)}"></option>`).join('')}</datalist>
        <div class="hint">Leave it empty to remove it.</div></div>
      <div class="modal-actions">
        <button class="btn btn--ghost" type="button" data-action="close-modal">Cancel</button>
        <button class="btn btn--primary" type="submit" id="analyst-save">Save</button>
      </div></form>`);
  }

  async function saveAnalyst(form) {
    const button = $('#analyst-save');
    setButtonBusy(button, true, 'Saving…');
    try {
      const row = await db.setAnalyzedBy(form.dataset.id, form.elements.analyzed_by.value);
      upsertLocal(row);
      closeModal();
      refreshDatabase();
      toast(row.analyzed_by ? `${row.sample_code}: analyzed by ${row.analyzed_by}.` : `Analyst removed from ${row.sample_code}.`, 'success');
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
      <div class="modal-actions"><button class="btn btn--primary" data-action="close-modal" autofocus>Close</button></div></div>`);
  }

  // --- Selection ---

  function refreshSelectionViews() {
    refreshDatabase();
    const slots = $('#request-slots');
    if (slots) slots.innerHTML = slotsHtml();
    const link = $('.nav a[href="#/database"]');
    if (link) {
      link.querySelector('.badge')?.remove();
      link.insertAdjacentHTML('beforeend', navBadge());
    }
  }

  function toggleSelection(id, checked) {
    if (checked) {
      if (state.selection.length >= MAX_SAMPLES) {
        toast(`The form holds at most ${MAX_SAMPLES} samples.`, 'error');
      } else if (!state.selection.includes(id)) {
        state.selection.push(id);
      }
    } else {
      state.selection = state.selection.filter((x) => x !== id);
    }
    refreshSelectionViews();
    if (!state.selection.length && $('#request-form')) closeModal();
  }

  function moveSlot(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= state.selection.length) return;
    const list = state.selection;
    [list[index], list[target]] = [list[target], list[index]];
    refreshSelectionViews();
  }

  // --- Request form (Word and PDF) ---

  function slotsHtml() {
    const slots = [];
    for (let i = 0; i < MAX_SAMPLES; i += 1) {
      const sample = byId(state.selection[i]);
      slots.push(sample
        ? `<li class="slot"><span class="slot-num">SAMPLE ${i + 1}</span>
            <div class="slot-body"><b>${esc(sample.sample_code)}</b><span>${esc(sample.molecular_formula)}</span></div>
            <div class="slot-tools">
              <button class="icon-btn" type="button" data-action="slot-up" data-index="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up', 16)}</button>
              <button class="icon-btn" type="button" data-action="slot-down" data-index="${i}" aria-label="Move down" ${i === state.selection.length - 1 ? 'disabled' : ''}>${icon('down', 16)}</button>
              <button class="icon-btn" type="button" data-action="slot-remove" data-index="${i}" aria-label="Remove">${icon('close', 16)}</button>
            </div></li>`
        : `<li class="slot slot--empty"><span class="slot-num">SAMPLE ${i + 1}</span><div class="slot-body">Empty</div></li>`);
    }
    return slots.join('');
  }

  function openRequestForm() {
    if (!state.selection.length) {
      toast('Select at least one sample first.', 'error');
      return;
    }
    const p = state.prefs;
    openModal(`<form class="modal-body" id="request-form" novalidate>
      <h2>Request form</h2>
      <p class="hint" style="margin-bottom:16px">The samples fill the official UEM095 form in this order.</p>
      <div class="request-grid">
        <div><h3 class="subhead">Samples</h3><ul class="slots" id="request-slots">${slotsHtml()}</ul></div>
        <div><h3 class="subhead">User Info</h3>
          ${userInfoFields('r', p)}
          <div class="field"><label for="r-date">Date Submitted <span class="req">*</span></label><input id="r-date" type="date" name="date" value="${esc(state.request.date)}"><div class="error" data-error="date"></div></div>
          <label class="check"><input type="checkbox" name="remember" checked> Remember my details on this device</label>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn--ghost" type="button" data-action="close-modal">Close</button>
        <button class="btn btn--primary" type="button" data-action="download" data-format="docx">${icon('file', 16)} Download Word</button>
        <button class="btn btn--primary" type="button" data-action="download" data-format="pdf">${icon('file', 16)} Download PDF</button>
      </div></form>`, true);
  }

  function validateUserInfo(fields) {
    const errors = {};
    if (!fields.name.trim()) errors.name = 'Enter the name.';
    const emails = parseEmails(fields.email);
    if (!emails.length || !emails.every(isEmail)) errors.email = 'Enter valid email addresses, separated with ; or a comma.';
    else if (!emailsFit(emails)) errors.email = 'Too many email addresses for the space in the form.';
    if (!fields.research_group.trim()) errors.research_group = 'Enter the research group or company.';
    return errors;
  }

  const cleanUserInfo = (fields) => ({
    name: fields.name.trim(), email: parseEmails(fields.email).join('; '), research_group: fields.research_group.trim(),
  });

  // "2026-11-26" → "26/11/2026" for the form, "26-11-2026" for the file name.
  const isoParts = (iso) => iso.split('-');
  const formDate = (iso) => { const [y, m, d] = isoParts(iso); return `${d}/${m}/${y}`; };
  const fileDate = (iso) => { const [y, m, d] = isoParts(iso); return `${d}-${m}-${y}`; };
  const safeFileName = (text) => text.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim() || 'Request';

  function saveFile(bytes, type, filename) {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function downloadRequest(button, format) {
    const samples = state.selection.map(byId).filter(Boolean);
    if (!samples.length || samples.length > MAX_SAMPLES) {
      toast(`Select between 1 and ${MAX_SAMPLES} samples.`, 'error');
      return;
    }
    const form = $('#request-form');
    const fields = formFields(form);
    const errors = validateUserInfo(fields);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date || '')) errors.date = 'Choose the date.';
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) return;

    const user = cleanUserInfo(fields);
    const date = formDate(fields.date);
    const baseName = `${safeFileName(user.name)}_${fileDate(fields.date)}`;
    state.request.date = fields.date;
    if (form.elements.remember.checked) {
      state.prefs = user;
      if (!writeUserInfo(user)) toast('Your details could not be remembered on this device.', 'error');
    }

    setButtonBusy(button, true, 'Preparing…');
    try {
      if (format === 'pdf') {
        saveFile(await generatePdf({ user, samples, date, title: baseName }), MIME_PDF, `${baseName}.pdf`);
      } else {
        const bytes = await generateDocx(await loadTemplate(), { user, samples, date }, window.JSZip);
        saveFile(bytes, MIME_DOCX, `${baseName}.docx`);
      }
      toast(`${format === 'pdf' ? 'PDF' : 'Word'} file ready with ${plural(samples.length, 'sample')}.`, 'success');
    } catch (error) {
      toast(error.message || 'The file could not be created.', 'error');
    } finally {
      setButtonBusy(button, false);
    }
  }

  function saveSettings(form) {
    const fields = formFields(form);
    const errors = validateUserInfo(fields);
    showFieldErrors(form, errors);
    if (Object.keys(errors).length) return;
    state.prefs = cleanUserInfo(fields);
    if (writeUserInfo(state.prefs)) toast('Details saved on this device.', 'success');
    else toast('Your details could not be saved on this device.', 'error');
  }

  // --- Access ---

  async function submitAuth(form) {
    const button = $('#auth-submit');
    const errorEl = $('#auth-error');
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    errorEl.textContent = '';
    if (!username || !password) { errorEl.textContent = 'Enter the user and the password.'; return; }

    setButtonBusy(button, true, 'Signing in…');
    try {
      await db.signIn(username, password);
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
    });
  }

  // --- Events ---

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const { action, id, index, format } = trigger.dataset;
    const handlers = {
      reload: loadData,
      'sign-out': handleSignOut,
      'cancel-edit': () => { window.location.hash = '#/database'; },
      'show-mz': () => showMz(id),
      'set-analyst': () => askAnalyst(id),
      duplicate: () => duplicateSample(id, trigger),
      delete: () => removeSample(id),
      'open-request': openRequestForm,
      'slot-up': () => moveSlot(Number(index), -1),
      'slot-down': () => moveSlot(Number(index), 1),
      'slot-remove': () => toggleSelection(state.selection[Number(index)], false),
      download: () => downloadRequest(trigger, format),
      'close-modal': closeModal,
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

  // --- Start ---

  async function start() {
    if (!db.isAvailable) { render(); return; }

    db.onAuthChange((authEvent, session) => {
      // Supabase asks not to call its own methods inside this callback.
      setTimeout(() => {
        const previous = state.session?.user?.id;
        state.session = session;
        if (!session) { resetSessionData(); render(); return; }
        if (session.user.id !== previous) loadData();
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
