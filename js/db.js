// Accés a les dades: Supabase o, només amb doble clic i sense configurar, mode de prova local.

(() => {
  'use strict';

  const { computeIons, MAX_CHARGE } = window.HRMS.chem;
  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.HRMS_CONFIG;

  const PAGE_SIZE = 1000;
  const DEMO_KEY = 'hrms-manager-demo';
  const DEMO_SESSION = { user: { id: 'demo', email: '' } };

  const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const isDemo = !isConfigured && window.location.protocol === 'file:';
  const isAvailable = isConfigured || isDemo;

  const supabase = isConfigured
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    : null;

  const redirectUrl = () => window.location.origin + window.location.pathname;

  function friendlyError(error) {
    const message = String(error?.message || error || '');
    const code = error?.code || '';
    if (isDemo) return `No s'han pogut guardar les dades en aquest navegador: ${message}`;
    if (!navigator.onLine || /failed to fetch|networkerror|load failed/i.test(message)) {
      return 'No hi ha connexió amb la base de dades. Comprova la connexió i torna-ho a provar; no s\'ha desat cap canvi.';
    }
    if (/invalid login credentials/i.test(message)) return 'Correu o contrasenya incorrectes.';
    if (/email not confirmed/i.test(message)) return 'Encara no has confirmat el correu. Revisa la safata d\'entrada.';
    if (/user already registered/i.test(message)) return 'Ja existeix un compte amb aquest correu.';
    if (/password should be/i.test(message)) return 'La contrasenya és massa curta (mínim 6 caràcters).';
    if (/rate limit/i.test(message)) return 'Massa intents seguits. Espera uns minuts i torna-ho a provar.';
    if (/jwt|session/i.test(message) || code === 'PGRST301') return 'La sessió ha caducat. Torna a iniciar sessió.';
    if (code === '42501') return 'No tens permís per fer aquesta operació.';
    if (code === 'PGRST204') return 'Falten columnes a Supabase. Torna a executar supabase/schema.sql (mira el README).';
    if (code === '42P01' || code === 'PGRST205') return 'Falten les taules a Supabase. Executa supabase/schema.sql (mira el README).';
    if (code === '23514') return 'Les dades no compleixen les regles de la base de dades.';
    return `Error de la base de dades: ${message || 'desconegut'}`;
  }

  function unwrap({ data, error }) {
    if (error) throw error;
    return data;
  }

  // Els valors numèrics es calculen sempre de la fórmula, mai del que arriba del formulari.
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
    getSession: async () => unwrap(await supabase.auth.getSession()).session,
    onAuthChange: (callback) => supabase.auth.onAuthStateChange(callback),
    signIn: async (email, password) => unwrap(await supabase.auth.signInWithPassword({ email, password })),
    signUp: async (email, password) => unwrap(await supabase.auth.signUp({
      email, password, options: { emailRedirectTo: redirectUrl() },
    })),
    resetPassword: async (email) => unwrap(await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() })),
    updatePassword: async (password) => unwrap(await supabase.auth.updateUser({ password })),
    signOut: async () => unwrap(await supabase.auth.signOut()),

    async listSamples() {
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
      if (removed.length !== 1) throw new Error('No s\'ha trobat la mostra a la base de dades.');
    },
    // Desfà una eliminació tornant a inserir la fila amb el mateix identificador i dates.
    restoreSample: async (row) => unwrap(await supabase.from('samples').insert(row).select().single()),

    getPreferences: async () => unwrap(await supabase.from('user_preferences').select('*').maybeSingle()),
    savePreferences: async (userId, { name, email, research_group }) => unwrap(await supabase.from('user_preferences')
      .upsert({ user_id: userId, name, email, research_group })
      .select().single()),
  };

  // Mode de prova: mateixa interfície que Supabase, sobre l'emmagatzematge del navegador.
  const readDemo = () => {
    const stored = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null');
    return stored || { samples: [], preferences: null };
  };
  const writeDemo = (store) => localStorage.setItem(DEMO_KEY, JSON.stringify(store));
  const newId = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

  const demo = {
    getSession: async () => DEMO_SESSION,
    onAuthChange: () => {},
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
      const row = store.samples.find((s) => s.id === id);
      if (!row) throw new Error('No s\'ha trobat la mostra.');
      Object.assign(row, buildSampleRow(fields), { updated_at: new Date().toISOString() });
      writeDemo(store);
      return row;
    },
    async setAnalyzedBy(id, name) {
      const store = readDemo();
      const row = store.samples.find((s) => s.id === id);
      if (!row) throw new Error('No s\'ha trobat la mostra.');
      Object.assign(row, { analyzed_by: name.trim(), updated_at: new Date().toISOString() });
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
    getPreferences: async () => readDemo().preferences,
    async savePreferences(userId, preferences) {
      const store = readDemo();
      store.preferences = preferences;
      writeDemo(store);
      return preferences;
    },
  };

  window.HRMS.db = {
    isConfigured, isDemo, isAvailable, friendlyError, buildSampleRow, ...(isDemo ? demo : remote),
  };
})();
