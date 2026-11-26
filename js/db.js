// Data access: Supabase or, only when opened by double click without configuration, local test mode.

(() => {
  'use strict';

  const { computeIons, MAX_CHARGE } = window.HRMS.chem;
  const { SUPABASE_URL, SUPABASE_ANON_KEY, SHARED_USERNAME } = window.HRMS_CONFIG;

  const PAGE_SIZE = 1000;
  const DEMO_KEY = 'hrms-manager-demo';
  const PASSWORD_KEY = 'hrms-manager-lab-password';
  const DEMO_SESSION = { user: { id: 'demo' } };
  const LAB_SESSION = { user: { id: 'lab' } };

  const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const isDemo = !isConfigured && window.location.protocol === 'file:';
  const isAvailable = isConfigured || isDemo;

  // There are no accounts: every request carries the laboratory password, which the database checks.
  let supabase = null;
  const connect = (password) => {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-lab-password': password } },
    });
  };

  const storage = {
    get() { try { return localStorage.getItem(PASSWORD_KEY); } catch { return null; } },
    set(value) { try { localStorage.setItem(PASSWORD_KEY, value); } catch { /* stays signed in until reload */ } },
    clear() { try { localStorage.removeItem(PASSWORD_KEY); } catch { /* nothing stored */ } },
  };

  function friendlyError(error) {
    const message = String(error?.message || error || '');
    const code = error?.code || '';
    if (isDemo) return `The data could not be saved in this browser: ${message}`;
    if (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(message)) {
      return 'There is no connection to the database. Check the connection and try again; nothing was saved.';
    }
    if (/invalid login credentials/i.test(message)) return 'Wrong user or password.';
    if (/password has changed/i.test(message)) return 'The laboratory password has changed. Sign in again.';
    if (/ISO-8859-1|non ISO|Headers/i.test(message)) return 'The password can only contain basic Latin characters.';
    if (code === '42883' || code === 'PGRST202') return 'The database is not set up. Run supabase/schema.sql (see the README).';
    if (/rate limit|too many/i.test(message)) return 'Too many attempts. Wait a few minutes and try again.';
    if (/jwt|session/i.test(message) || code === 'PGRST301') return 'The session has expired. Sign in again.';
    if (code === '42501') return 'You are not allowed to do this.';
    if (code === 'PGRST204') return 'Columns are missing in Supabase. Run supabase/schema.sql again (see the README).';
    if (code === '42P01' || code === 'PGRST205') return 'The tables are missing in Supabase. Run supabase/schema.sql (see the README).';
    if (code === '23514') return 'The data does not meet the database rules.';
    return `Database error: ${message || 'unknown'}`;
  }

  function unwrap({ data, error }) {
    if (error) throw error;
    return data;
  }

  // Numbers are always calculated from the formula, never taken from the form.
  function buildSampleRow({
    sample_code, molecular_formula, confidence, purity, publication, author, analyzed_by,
  }) {
    const { mass, ions } = computeIons(molecular_formula);
    const round = (value) => Number(value.toFixed(6));
    const row = {
      sample_code: sample_code.trim(),
      molecular_formula: molecular_formula.trim(),
      monoisotopic_mass: round(mass),
      confidence,
      purity,
      publication,
      author: (author || '').trim(),
      analyzed_by: (analyzed_by || '').trim(),
    };
    for (let z = 1; z <= MAX_CHARGE; z += 1) row[`mz_${z}`] = round(ions[z - 1].mz);
    return row;
  }

  const remote = {
    // A password remembered on this device signs in straight away.
    async getSession() {
      const password = storage.get();
      if (!password) return null;
      connect(password);
      return LAB_SESSION;
    },
    async signIn(username, password) {
      if (username.toLowerCase() !== String(SHARED_USERNAME || '').toLowerCase()) {
        throw new Error('Invalid login credentials');
      }
      connect(password);
      if (!unwrap(await supabase.rpc('lab_password_ok'))) throw new Error('Invalid login credentials');
      storage.set(password);
      return LAB_SESSION;
    },
    async signOut() {
      storage.clear();
      supabase = null;
    },

    async listSamples() {
      // A wrong password would only return an empty list, so it is checked first.
      if (!unwrap(await supabase.rpc('lab_password_ok'))) throw new Error('The laboratory password has changed.');
      const rows = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const page = unwrap(await supabase.from('samples').select('*')
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, from + PAGE_SIZE - 1));
        rows.push(...page);
        if (page.length < PAGE_SIZE) return rows;
      }
    },
    insertSample: async (fields) => unwrap(await supabase.from('samples').insert(buildSampleRow(fields)).select().single()),
    updateSample: async (id, fields) => unwrap(await supabase.from('samples').update(buildSampleRow(fields)).eq('id', id).select().single()),
    setAnalyzedBy: async (id, name) => unwrap(await supabase.from('samples').update({ analyzed_by: name.trim() }).eq('id', id).select().single()),
    async deleteSample(id) {
      const removed = unwrap(await supabase.from('samples').delete().eq('id', id).select());
      if (removed.length !== 1) throw new Error('The sample was not found in the database.');
    },
    // Undoes a deletion by inserting the row again with the same id and dates.
    restoreSample: async (row) => unwrap(await supabase.from('samples').insert(row).select().single()),
  };

  // Test mode: same interface as Supabase, on top of the browser's storage.
  const readDemo = () => {
    const stored = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null');
    return stored || { samples: [] };
  };
  const writeDemo = (store) => localStorage.setItem(DEMO_KEY, JSON.stringify(store));
  const newId = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  function demoRow(store, id) {
    const row = store.samples.find((s) => s.id === id);
    if (!row) throw new Error('The sample was not found.');
    return row;
  }

  const demo = {
    getSession: async () => DEMO_SESSION,
    signOut: async () => {},
    listSamples: async () => readDemo().samples.sort((a, b) => b.created_at.localeCompare(a.created_at)),
    async insertSample(fields) {
      const store = readDemo();
      const now = new Date().toISOString();
      const row = {
        id: newId(), user_id: 'demo', ...buildSampleRow(fields), created_at: now, updated_at: now,
      };
      store.samples.push(row);
      writeDemo(store);
      return row;
    },
    async updateSample(id, fields) {
      const store = readDemo();
      const row = Object.assign(demoRow(store, id), buildSampleRow(fields), { updated_at: new Date().toISOString() });
      writeDemo(store);
      return row;
    },
    async setAnalyzedBy(id, name) {
      const store = readDemo();
      const row = Object.assign(demoRow(store, id), { analyzed_by: name.trim(), updated_at: new Date().toISOString() });
      writeDemo(store);
      return row;
    },
    async deleteSample(id) {
      const store = readDemo();
      store.samples = store.samples.filter((s) => s.id !== id);
      writeDemo(store);
    },
    async restoreSample(row) {
      const store = readDemo();
      store.samples.push(row);
      writeDemo(store);
      return row;
    },
  };

  window.HRMS.db = {
    isConfigured, isDemo, isAvailable, friendlyError, buildSampleRow, ...(isDemo ? demo : remote),
  };
})();
