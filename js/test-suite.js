// Proves automàtiques de masses, m/z i Word. S'executen a tests.html.
(() => {
  'use strict';

  const {
    computeIons, monoisotopicMass, mzForCharge, parseFormula, FormulaError, PROTON_MASS, MONOISOTOPIC_MASS,
  } = window.HRMS.chem;
  const {
    generateDocx, fillDocumentXml, parseEmails, emailsFit, JUSTIFICATION, JUSTIFICATION_HEAD, JUSTIFICATION_TAIL,
  } = window.HRMS.docx;

  const near = (actual, expected, tolerance) => {
    if (Math.abs(actual - expected) > tolerance) throw new Error(`${actual} ≠ ${expected} (±${tolerance})`);
  };
  const equal = (actual, expected) => {
    if (actual !== expected) throw new Error(`Esperat ${JSON.stringify(expected)}, obtingut ${JSON.stringify(actual)}`);
  };
  const ok = (condition, message) => { if (!condition) throw new Error(message); };
  const fails = (formula) => {
    try { parseFormula(formula); } catch (error) {
      ok(error instanceof FormulaError, `Error inesperat: ${error}`);
      return;
    }
    throw new Error(`"${formula}" s'hauria d'haver rebutjat`);
  };

  // Masses de referència publicades. C222: càlcul independent amb decimals exactes.
  const KNOWN_MASSES = [
    ['H2O', 18.0105647, 1e-6],
    ['CO2', 43.9898292, 1e-6],
    ['C6H12O6', 180.0633881, 1e-6],
    ['C8H10N4O2', 194.0803760, 1e-6],
    ['C50H71N13O12', 1045.5345, 1e-3],
    ['C50H73N15O11', 1059.5614, 1e-3],
    ['C222H285N75O51', 4817.201330, 1e-6],
  ];

  const C222_IONS = ['4818.208607', '2409.607942', '1606.741053', '1205.307609', '964.447542', '803.874165', '689.178895', '603.157443'];

  const MASS_TESTS = [
    ...KNOWN_MASSES.map(([formula, expected, tol]) => [`Massa de ${formula}`, () => near(monoisotopicMass(formula), expected, tol)]),
    ['Massa del protó (no de l\'àtom d\'H)', () => {
      near(PROTON_MASS, 1.00727646658, 1e-10);
      near(MONOISOTOPIC_MASS.H - PROTON_MASS, 0.000548579909 + 0, 1e-5);
    }],
    ['Fórmula m/z = (M + z·mp) / z', () => {
      for (let z = 1; z <= 8; z += 1) near(mzForCharge(1000, z), (1000 + z * 1.0072764665789) / z, 1e-9);
    }],
    ['[M+H]+ de la cafeïna = 195.087652', () => equal(computeIons('C8H10N4O2').ions[0].text, '195.087652')],
    ['Els vuit m/z de C222H285N75O51', () => {
      const { ions, massText } = computeIons('C222H285N75O51');
      equal(massText, '4817.201330');
      equal(ions.length, 8);
      ions.forEach((ion, i) => equal(ion.text, C222_IONS[i]));
    }],
    ['Etiquetes dels ions', () => {
      const labels = computeIons('H2O').ions.map((ion) => ion.label);
      equal(labels[0], '[M+H]+');
      equal(labels[1], '[M+2H]2+');
      equal(labels[7], '[M+8H]8+');
    }],
    ['Sis decimals exactes', () => {
      computeIons('C6H12O6').ions.forEach((ion) => ok(/^\d+\.\d{6}$/.test(ion.text), ion.text));
    }],
    ['Parèntesis', () => near(monoisotopicMass('Ca(OH)2'), monoisotopicMass('CaO2H2'), 1e-9)],
    ['Elements de dues lletres (Co ≠ CO)', () => {
      equal(parseFormula('Co').get('Co'), 1);
      equal(parseFormula('CO').get('C'), 1);
    }],
    ...['', ' ', 'c6h12o6', 'C0H2', 'H02', 'Xx3', 'C6H12O6+', 'C6 H12', '2H2O', '(C', 'C)', '()2', 'C1.5', 'Tc2', 'C-2']
      .map((formula) => [`Rebutja "${formula}"`, () => fails(formula)]),
  ];

  const sample = (i, formula = 'C222H285N75O51') => ({
    sample_code: `PEP-${i}`, molecular_formula: formula, confidence: 'Medium', purity: 'Impure', publication: 'No',
  });
  const USER = { name: 'Nom Cognom', email: 'a@b.cat', research_group: 'Grup & <IP>' };

  const textOf = (xml) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
  const count = (text, needle) => text.split(needle).length - 1;

  function docxTests(template, JSZip) {
    const fill = async (samples) => {
      const bytes = await generateDocx(template, { user: USER, samples }, JSZip);
      const zip = await JSZip.loadAsync(bytes);
      return { zip, xml: await zip.file('word/document.xml').async('string') };
    };
    const original = () => JSZip.loadAsync(template);

    return [
      ['Conserva intactes tots els altres fitxers del DOCX', async () => {
        const [a, { zip: b }] = [await original(), await fill([sample(1)])];
        const names = Object.keys(a.files).sort();
        equal(Object.keys(b.files).sort().join(), names.join());
        for (const name of names) {
          if (name !== 'word/document.xml' && !a.files[name].dir) {
            const [x, y] = await Promise.all([a.file(name).async('base64'), b.file(name).async('base64')]);
            equal(x === y, true);
          }
        }
      }],
      ...[1, 2, 3, 4, 5].map((n) => [`Genera amb ${n} mostra/es`, async () => {
        const samples = Array.from({ length: n }, (_, i) => sample(i + 1));
        const { xml } = await fill(samples);
        const text = textOf(xml);
        samples.forEach((s) => ok(text.includes(s.sample_code), `falta ${s.sample_code}`));
        equal(count(text, 'Peptide with Lysines'), n);
        equal(count(text, '[M+8H]'), n);
        equal(count(text, 'Positive'), n);
      }]),
      ['Respecta l\'ordre seleccionat', async () => {
        const { xml } = await fill([sample('B'), sample('A'), sample('C')]);
        const text = textOf(xml);
        ok(text.indexOf('PEP-B') < text.indexOf('PEP-A') && text.indexOf('PEP-A') < text.indexOf('PEP-C'), 'ordre incorrecte');
      }],
      ['Sense punts suspensius ni valors antics', async () => {
        const { xml } = await fill([sample(1), sample(2)]);
        const text = textOf(xml);
        ['...', 'NNANA', 'TATATA'].forEach((bad) => equal(count(text, bad), 0));
        equal(count(text, 'High') , 2); // Priority de les dues mostres
      }],
      ['Elimina els enllaços a l\'Excel local', async () => {
        const { xml } = await fill([sample(1)]);
        ok(!xml.includes('Book1.xlsx') && !xml.includes('fldChar'), 'queden camps LINK');
      }],
      ['Manté els 45 desplegables i les taules', async () => {
        const { xml } = await fill([sample(1)]);
        equal(count(xml, '<w:sdt>'), 45);
        equal(count(xml, '<w:tbl>'), 6);
        const ids = [...xml.matchAll(/<w:sdtPr>.*?<w:id w:val="(-?\d+)"/g)].map((m) => m[1]);
        equal(new Set(ids).size, ids.length);
      }],
      ['Justificació completa i sense repetir', async () => {
        const { xml } = await fill([sample(1)]);
        const text = textOf(xml);
        equal(`${JUSTIFICATION_HEAD} ${JUSTIFICATION_TAIL}`, JUSTIFICATION);
        equal(count(text, JUSTIFICATION_HEAD), 1);
        equal(count(text, JUSTIFICATION_TAIL), 1);
      }],
      ['Escapa caràcters especials XML', async () => {
        const { xml } = await fill([sample(1)]);
        ok(xml.includes('Grup &amp; &lt;IP&gt;'), 'no escapat');
      }],
      ['XML ben format', async () => {
        if (typeof DOMParser === 'undefined') return;
        const { xml } = await fill([sample(1), sample(2), sample(3), sample(4), sample(5)]);
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        equal(doc.getElementsByTagName('parsererror').length, 0);
      }],
      ['Diversos correus en una línia', async () => {
        const bytes = await generateDocx(template, { user: { ...USER, email: 'a@udg.edu, b@udg.edu;c@udg.edu' }, samples: [sample(1)] }, JSZip);
        const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
        ok(textOf(xml).includes('a@udg.edu; b@udg.edu; c@udg.edu'), 'correus no units');
      }],
      ['Molts correus passen a dues línies', async () => {
        const email = 'primera.persona@udg.edu; segona.persona@udg.edu; tercera.persona@udg.edu';
        const bytes = await generateDocx(template, { user: { ...USER, email }, samples: [sample(1)] }, JSZip);
        const xml = await (await JSZip.loadAsync(bytes)).file('word/document.xml').async('string');
        ['primera.persona@udg.edu', 'segona.persona@udg.edu', 'tercera.persona@udg.edu'].forEach((e) => equal(count(textOf(xml), e), 1));
        ok(xml.includes('w:line="201" w:lineRule="exact"'), 'sense interlineat exacte');
      }],
      ['Detecta si no hi caben els correus', async () => {
        equal(parseEmails('a@b.cat; c@d.cat, e@f.cat').length, 3);
        equal(emailsFit(parseEmails('a@b.cat; c@d.cat')), true);
        equal(emailsFit(Array.from({ length: 12 }, (_, i) => `persona.numero.${i}@universitat.cat`)), false);
      }],
      ['Rebutja 0 i 6 mostres', async () => {
        const xml = await (await original()).file('word/document.xml').async('string');
        for (const samples of [[], Array.from({ length: 6 }, (_, i) => sample(i))]) {
          let thrown = false;
          try { fillDocumentXml(xml, { user: USER, samples }); } catch { thrown = true; }
          ok(thrown, `${samples.length} mostres acceptades`);
        }
      }],
    ];
  }

  function pdfTests() {
    const data = (n) => ({
      user: { ...USER, email: 'a@udg.edu; b@udg.edu' },
      samples: Array.from({ length: n }, (_, i) => sample(i + 1)),
    });
    return [1, 2, 3, 4, 5].map((n) => [`PDF amb ${n} mostra/es`, async () => {
      const bytes = await window.HRMS.pdf.generatePdf(data(n));
      const pdf = await window.PDFLib.PDFDocument.load(bytes);
      equal(pdf.getPageCount(), 2);
    }]);
  }

  async function runTests(tests) {
    const results = [];
    for (const [name, run] of tests) {
      try {
        await run();
        results.push({ name, passed: true });
      } catch (error) {
        results.push({ name, passed: false, message: error.message });
      }
    }
    return results;
  }

  window.HRMS = window.HRMS || {};
  window.HRMS.tests = {
    MASS_TESTS,
    docxTests,
    pdfTests,
    runTests,
  };
})();
