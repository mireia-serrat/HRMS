// Emplena el DOCX oficial UEM095 sobre el seu propi XML.
// Només es reescriu word/document.xml i només als punts d'inserció: la resta de
// bytes del fitxer (logotips, capçaleres, estils, taules...) no es toquen.
(() => {
  'use strict';

  const { computeIons } = window.HRMS.chem;

  const MAX_SAMPLES = 5;
  const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const JUSTIFICATION = "Without HRMS-ESI, we cannot confirm the compound's identity or determine its structure. Obtaining these results is absolutely critical to proceed with the synthesis, which cannot move forward without them.";

  // La fila de "If urgent, justify:" només admet una línia sense créixer. La resta
  // de la justificació continua a "Other Remarks", que té alçada de sobres.
  const JUSTIFICATION_HEAD = 'Without HRMS-ESI, we cannot confirm';
  const JUSTIFICATION_TAIL = JUSTIFICATION.slice(JUSTIFICATION_HEAD.length + 1);
  const REMARKS_PREFIX = 'Justification (cont.): ';

  const FIXED = {
    returned: 'Yes',
    toxicity: 'No',
    sensitivity: 'N/A',
    solvent: 'H2O',
    ionization: ' Positive',
    priority: 'High',
    developedFormula: 'Peptide with Lysines',
  };

  const TEMPLATE_URL = 'assets/UEM095_COMPACT_Request_Form_v1_eng.docx';
  const TEMPLATE_SCRIPT = 'assets/template-data.js';
  const CELL_MARGINS_TWIPS = 216;
  const TEXT_SIZES = [18, 16, 14, 12];
  const USER_LABEL_PT = 40;
  const EMAIL_CELL_PT = (4286 - CELL_MARGINS_TWIPS) / 20;
  const NEW_SDT_ID = '1957204163';
  const T_ELEMENT = /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g;

  class TemplateError extends Error {
    constructor(message) {
      super(`La plantilla Word no té l'estructura esperada: ${message}`);
      this.name = 'TemplateError';
    }
  }

  const escapeXml = (text) => String(text)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Final (exclusiu) de l'element que comença a `start`, respectant niuaments.
  function elementEnd(xml, start, name) {
    const re = new RegExp(`<(/?)${name}(?=[ />])[^>]*?(/?)>`, 'g');
    re.lastIndex = start;
    let depth = 0;
    for (let m = re.exec(xml); m; m = re.exec(xml)) {
      if (m[1]) depth -= 1;
      else if (!m[2]) depth += 1;
      if (depth === 0) return re.lastIndex;
    }
    throw new TemplateError(`element ${name} sense tancar.`);
  }

  // Elements del rang sense entrar dins dels que ja s'han trobat.
  function findElements(xml, from, to, name) {
    const re = new RegExp(`<${name}(?=[ />])`, 'g');
    const found = [];
    re.lastIndex = from;
    for (let m = re.exec(xml); m && m.index < to; m = re.exec(xml)) {
      const end = elementEnd(xml, m.index, name);
      found.push({ start: m.index, end });
      re.lastIndex = end;
    }
    return found;
  }

  const plainText = (fragment) => [...fragment.matchAll(T_ELEMENT)].map((m) => m[1]).join('');

  function bodyRange(xml) {
    const open = xml.indexOf('<w:body>');
    const close = xml.lastIndexOf('</w:body>');
    if (open < 0 || close < 0) throw new TemplateError('no hi ha cos de document.');
    return { start: open + '<w:body>'.length, end: close };
  }

  function locateTables(xml) {
    const body = bodyRange(xml);
    const tables = findElements(xml, body.start, body.end, 'w:tbl');
    if (tables.length !== 6) throw new TemplateError(`s'esperaven 6 taules i n'hi ha ${tables.length}.`);
    return tables;
  }

  function locateGrid(xml, table) {
    return findElements(xml, table.start, table.end, 'w:tr')
      .map((row) => findElements(xml, row.start, row.end, 'w:tc'));
  }

  function requireLabel(xml, cell, label) {
    if (!plainText(xml.slice(cell.start, cell.end)).includes(label)) {
      throw new TemplateError(`falta l'etiqueta "${label}".`);
    }
  }

  class Edits {
    constructor() { this.list = []; }

    replace(start, end, text) { this.list.push({ start, end, text }); }

    apply(xml) {
      const sorted = [...this.list].sort((a, b) => b.start - a.start);
      let out = xml;
      for (const { start, end, text } of sorted) out = out.slice(0, start) + text + out.slice(end);
      return out;
    }
  }

  // Elimina de la Sample 1 els camps LINK a un Excel local i els valors antics
  // (High, NNANA, TATATA) i hi restaura l'estructura idèntica a la de la Sample 2.
  function normalizeTemplate(xml) {
    const tables = locateTables(xml);
    const sample1 = locateGrid(xml, tables[1]);
    const sample2 = locateGrid(xml, tables[2]);
    const confidence1 = sample1[1][1];
    const fragment = xml.slice(confidence1.start, confidence1.end);
    if (!fragment.includes(' LINK ')) throw new TemplateError('falta el camp de Confidence de la Sample 1.');

    const runs = findElements(fragment, 0, fragment.length, 'w:r');
    const beginRun = runs.find((r) => fragment.slice(r.start, r.end).includes('w:fldCharType="begin"'));
    const endRun = runs.find((r) => fragment.slice(r.start, r.end).includes('w:fldCharType="end"'));
    if (!beginRun || !endRun) throw new TemplateError('camp LINK incomplet.');

    const [sdt] = findElements(xml, sample2[1][1].start, sample2[1][1].end, 'w:sdt');
    if (!sdt) throw new TemplateError('falta el desplegable de Confidence de la Sample 2.');
    const clone = xml.slice(sdt.start, sdt.end).replace(/<w:id w:val="-?\d+"\/>/, `<w:id w:val="${NEW_SDT_ID}"/>`);

    const edits = new Edits();
    edits.replace(confidence1.start + beginRun.start, confidence1.start + endRun.end, clone);

    const mzCell1 = sample1[6][1];
    const mzCell2 = sample2[6][1];
    const contentStart = (cell) => xml.indexOf('</w:tcPr>', cell.start) + '</w:tcPr>'.length;
    const contentEnd = (cell) => cell.end - '</w:tc>'.length;
    edits.replace(contentStart(mzCell1), contentEnd(mzCell1), xml.slice(contentStart(mzCell2), contentEnd(mzCell2)));
    return edits.apply(xml);
  }

  const valueRpr = (halfPoints, extra = '') => `<w:rPr><w:bCs/><w:iCs/><w:sz w:val="${halfPoints}"/><w:szCs w:val="${halfPoints}"/>${extra}<w:lang w:val="en-GB"/></w:rPr>`;
  const textRun = (text, halfPoints, extra) => `<w:r>${valueRpr(halfPoints, extra)}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;

  // Estimació conservadora de l'amplada en Calibri; la mida es tria perquè no salti de línia.
  const fitsAt = (text, halfPoints, availablePt) => text.length * 0.56 * (halfPoints / 2) <= availablePt;
  const fitSize = (text, availablePt, sizes) => sizes.find((size) => fitsAt(text, size, availablePt)) || null;

  const cellWidthPt = (xml, cell) => {
    const m = xml.slice(cell.start, cell.end).match(/<w:tcW w:w="(\d+)"/);
    return (Number(m[1]) - CELL_MARGINS_TWIPS) / 20;
  };

  const paragraphsOf = (xml, cell) => findElements(xml, cell.start, cell.end, 'w:p');
  const dropdownsIn = (xml, cell) => findElements(xml, cell.start, cell.end, 'w:sdt');

  function appendToParagraph(edits, xml, paragraph, runs) {
    const at = paragraph.end - '</w:p>'.length;
    if (xml.slice(at, paragraph.end) !== '</w:p>') throw new TemplateError('paràgraf sense contingut editable.');
    edits.replace(at, at, runs);
  }

  function dropdownText(xml, sdt) {
    const contentStart = xml.indexOf('<w:sdtContent>', sdt.start);
    const texts = [...xml.slice(contentStart, sdt.end).matchAll(T_ELEMENT)];
    if (texts.length !== 1) throw new TemplateError('desplegable amb contingut inesperat.');
    const start = contentStart + texts[0].index;
    return { start, end: start + texts[0][0].length, value: texts[0][1] };
  }

  function setDropdown(edits, xml, sdt, value) {
    const { start, end } = dropdownText(xml, sdt);
    edits.replace(start, end, `<w:t xml:space="preserve">${escapeXml(value)}</w:t>`);
  }

  // Un espai de mostra sense utilitzar: desplegable intacte, sense punts suspensius.
  function clearDropdown(edits, xml, sdt) {
    const { start, end, value } = dropdownText(xml, sdt);
    edits.replace(start, end, `<w:t xml:space="preserve">${' '.repeat(value.length)}</w:t>`);
  }

  function sampleDropdowns(xml, grid) {
    const [returned, toxicity] = dropdownsIn(xml, grid[0][2]);
    const [confidence] = dropdownsIn(xml, grid[1][1]);
    const [purity] = dropdownsIn(xml, grid[1][2]);
    const [sensitivity] = dropdownsIn(xml, grid[2][1]);
    const [solvent] = dropdownsIn(xml, grid[2][2]);
    const [ionization, publication] = dropdownsIn(xml, grid[3][1]);
    const [priority] = dropdownsIn(xml, grid[3][2]);
    const all = { returned, toxicity, confidence, purity, sensitivity, solvent, ionization, publication, priority };
    for (const [name, range] of Object.entries(all)) {
      if (!range) throw new TemplateError(`falta el desplegable ${name}.`);
    }
    return all;
  }

  function mzRuns(ions) {
    return ions.map((ion, index) => {
      const lineBreak = index ? `<w:r>${valueRpr(18)}<w:br/></w:r>` : '';
      const prefix = ion.z === 1 ? '[M+H]' : `[M+${ion.z}H]`;
      const charge = ion.z === 1 ? '+' : `${ion.z}+`;
      return `${lineBreak}${textRun(prefix, 18)}${textRun(charge, 18, '<w:vertAlign w:val="superscript"/>')}`
        + `<w:r>${valueRpr(18)}<w:tab/></w:r>${textRun(ion.text, 18)}`;
    }).join('');
  }

  function fillMzCell(edits, xml, cell, ions) {
    const [paragraph] = paragraphsOf(xml, cell);
    const pPrOpen = xml.indexOf('<w:pPr>', paragraph.start);
    if (pPrOpen < 0 || pPrOpen > paragraph.end || !xml.startsWith('<w:rPr>', pPrOpen + 7)) {
      throw new TemplateError('format inesperat a la cel·la de m/z.');
    }
    const tabPos = cellWidthPt(xml, cell) * 20 - 40;
    edits.replace(pPrOpen + 7, pPrOpen + 7, `<w:tabs><w:tab w:val="right" w:pos="${tabPos}"/></w:tabs><w:spacing w:after="0" w:line="240" w:lineRule="auto"/>`);
    appendToParagraph(edits, xml, paragraph, mzRuns(ions));
  }

  const slotWidths = (xml, grid) => ({
    code: cellWidthPt(xml, grid[0][1]),
    formula: cellWidthPt(xml, grid[4][1]),
    formulaWide: cellWidthPt(xml, grid[4][2]),
  });

  // Mida de cada valor variable; el PDF fa servir la mateixa decisió que el Word.
  function sampleSizes(sample, widths) {
    const code = String(sample.sample_code);
    const formula = String(sample.molecular_formula).trim();
    const beside = fitSize(` ${formula}`, widths.formula - 104, [18, 16, 14]);
    return {
      code: fitSize(` ${code}`, widths.code - 68, TEXT_SIZES) || 12,
      formulaBeside: Boolean(beside),
      formula: beside || fitSize(formula, widths.formulaWide, TEXT_SIZES) || 12,
    };
  }

  function fillSample(edits, xml, grid, sample) {
    const { ions } = computeIons(sample.molecular_formula);
    requireLabel(xml, grid[0][1], 'Sample code:');
    requireLabel(xml, grid[4][1], 'Molecular');
    requireLabel(xml, grid[5][1], 'Expected');
    requireLabel(xml, grid[5][2], 'Developed Formula');
    requireLabel(xml, grid[5][3], 'Other Remarks');
    requireLabel(xml, grid[3][2], 'If urgent, justify:');

    const sizes = sampleSizes(sample, slotWidths(xml, grid));
    const code = String(sample.sample_code);
    appendToParagraph(edits, xml, paragraphsOf(xml, grid[0][1])[0], textRun(` ${code}`, sizes.code));

    const dropdowns = sampleDropdowns(xml, grid);
    setDropdown(edits, xml, dropdowns.returned, FIXED.returned);
    setDropdown(edits, xml, dropdowns.toxicity, FIXED.toxicity);
    setDropdown(edits, xml, dropdowns.confidence, sample.confidence);
    setDropdown(edits, xml, dropdowns.purity, sample.purity);
    setDropdown(edits, xml, dropdowns.sensitivity, FIXED.sensitivity);
    setDropdown(edits, xml, dropdowns.solvent, FIXED.solvent);
    setDropdown(edits, xml, dropdowns.ionization, FIXED.ionization);
    setDropdown(edits, xml, dropdowns.publication, sample.publication);
    setDropdown(edits, xml, dropdowns.priority, FIXED.priority);

    appendToParagraph(edits, xml, paragraphsOf(xml, grid[3][2])[0], textRun(` ${JUSTIFICATION_HEAD}`, 14));

    const formula = String(sample.molecular_formula).trim();
    if (sizes.formulaBeside) {
      appendToParagraph(edits, xml, paragraphsOf(xml, grid[4][1])[0], textRun(` ${formula}`, sizes.formula));
    } else {
      appendToParagraph(edits, xml, paragraphsOf(xml, grid[4][2])[0], textRun(formula, sizes.formula));
    }

    fillMzCell(edits, xml, grid[6][1], ions);
    appendToParagraph(edits, xml, paragraphsOf(xml, grid[6][2])[0], textRun(FIXED.developedFormula, 18));
    appendToParagraph(edits, xml, paragraphsOf(xml, grid[6][3])[0], textRun(REMARKS_PREFIX + JUSTIFICATION_TAIL, 16));
  }

  const parseEmails = (value) => String(value || '').split(/[;,\s]+/).filter(Boolean);

  // Els correus ocupen una línia o, si no hi caben, dues sense que la fila creixi.
  function layoutEmails(emails, width) {
    const first = width - USER_LABEL_PT;
    const joined = emails.join('; ');
    const twoLines = (size) => {
      for (let i = 1; i < emails.length; i += 1) {
        const lines = [`${emails.slice(0, i).join('; ')};`, emails.slice(i).join('; ')];
        if (fitsAt(` ${lines[0]}`, size, first) && fitsAt(lines[1], size, width)) return { size, lines };
      }
      return null;
    };
    const single = fitSize(` ${joined}`, first, [18, 16, 14]);
    if (single) return { size: single, lines: [joined] };
    const compact = twoLines(14);
    if (compact) return compact;
    if (fitsAt(` ${joined}`, 12, first) || emails.length === 1) return { size: 12, lines: [joined] };
    return twoLines(12);
  }

  const emailsFit = (emails) => Boolean(layoutEmails(emails, EMAIL_CELL_PT));

  const userWidths = (xml, grid) => ({
    name: cellWidthPt(xml, grid[0][1]),
    email: cellWidthPt(xml, grid[1][1]),
    group: cellWidthPt(xml, grid[0][2]),
  });

  function userLayout(user, widths) {
    const name = String(user.name || '').trim();
    const group = String(user.research_group || '').trim();
    const emails = parseEmails(user.email);
    const emailLayout = emails.length ? layoutEmails(emails, widths.email) : null;
    if (emails.length && !emailLayout) throw new Error('Hi ha massa correus per a l\'espai del formulari.');
    return {
      name: name ? { text: name, size: fitSize(` ${name}`, widths.name - USER_LABEL_PT, TEXT_SIZES) || 12 } : null,
      emails: emailLayout,
      group: group ? { text: group, size: fitSize(group, widths.group, TEXT_SIZES) || 12 } : null,
    };
  }

  function fillUserInfo(edits, xml, grid, user) {
    requireLabel(xml, grid[0][1], 'ame:');
    requireLabel(xml, grid[1][1], 'Email');
    requireLabel(xml, grid[0][2], 'Research group');
    const layout = userLayout(user, userWidths(xml, grid));

    if (layout.name) {
      appendToParagraph(edits, xml, paragraphsOf(xml, grid[0][1])[0], textRun(` ${layout.name.text}`, layout.name.size));
    }
    if (layout.emails) {
      const { lines, size } = layout.emails;
      const paragraph = paragraphsOf(xml, grid[1][1])[0];
      const runs = lines.map((line, i) => (i
        ? `<w:r>${valueRpr(size)}<w:br/></w:r>${textRun(line, size)}`
        : textRun(` ${line}`, size))).join('');
      appendToParagraph(edits, xml, paragraph, runs);
      if (lines.length > 1) {
        // Dues línies exactes ocupen el mateix que la línia original a 1,5.
        const oldSpacing = 'w:line="360" w:lineRule="auto"';
        const at = xml.indexOf(oldSpacing, paragraph.start);
        if (at < 0 || at > paragraph.end) throw new TemplateError('format inesperat a la cel·la Email.');
        edits.replace(at, at + oldSpacing.length, 'w:line="201" w:lineRule="exact"');
      }
    }
    if (layout.group) {
      const paragraph = paragraphsOf(xml, grid[0][2])[1];
      appendToParagraph(edits, xml, paragraph, textRun(layout.group.text, layout.group.size));
      // La cel·la s'alinea a baix: es fixa l'alçada de la línia buida original perquè l'etiqueta no es mogui.
      const pPr = xml.indexOf('<w:pPr>', paragraph.start) + '<w:pPr>'.length;
      edits.replace(pPr, pPr, '<w:spacing w:line="269" w:lineRule="exact"/>');
    }
  }

  // Amplades de les cel·les de la plantilla, per col·locar els valors del PDF.
  function templateWidths(xml) {
    const tables = locateTables(xml);
    return {
      user: userWidths(xml, locateGrid(xml, tables[0])),
      slots: tables.slice(1).map((table) => slotWidths(xml, locateGrid(xml, table))),
    };
  }

  // Retorna el document.xml emplenat. `samples` en l'ordre desitjat (1 a 5).
  function fillDocumentXml(originalXml, { user, samples }) {
    if (!Array.isArray(samples) || samples.length < 1) throw new Error('Selecciona almenys una mostra.');
    if (samples.length > MAX_SAMPLES) throw new Error(`El formulari només admet ${MAX_SAMPLES} mostres.`);

    const xml = normalizeTemplate(originalXml);
    const tables = locateTables(xml);
    const edits = new Edits();
    fillUserInfo(edits, xml, locateGrid(xml, tables[0]), user || {});

    for (let slot = 0; slot < MAX_SAMPLES; slot += 1) {
      const grid = locateGrid(xml, tables[slot + 1]);
      if (grid.length !== 7) throw new TemplateError(`la Sample ${slot + 1} no té 7 files.`);
      if (samples[slot]) {
        fillSample(edits, xml, grid, samples[slot]);
      } else {
        for (const sdt of Object.values(sampleDropdowns(xml, grid))) clearDropdown(edits, xml, sdt);
      }
    }
    return edits.apply(xml);
  }

  // `template` és el contingut binari del DOCX; retorna el nou DOCX com a Uint8Array.
  async function generateDocx(template, data, JSZip) {
    const zip = await JSZip.loadAsync(template);
    const entry = zip.file('word/document.xml');
    if (!entry) throw new TemplateError('falta word/document.xml.');
    // createFolders: false perquè el ZIP no guanyi una entrada "word/" que l'original no té.
    zip.file('word/document.xml', fillDocumentXml(await entry.async('string'), data), { createFolders: false });
    return zip.generateAsync({
      type: 'uint8array',
      mimeType: MIME_DOCX,
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
  }

  // Des de file:// el navegador no deixa llegir fitxers: s'usa la mateixa plantilla en base64.
  function loadEmbeddedTemplate() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TEMPLATE_SCRIPT;
      script.onload = () => resolve(Uint8Array.from(atob(window.HRMS_TEMPLATE_BASE64), (c) => c.charCodeAt(0)).buffer);
      script.onerror = () => reject(new Error('No s\'ha pogut carregar la plantilla oficial del Word.'));
      document.head.append(script);
    });
  }

  async function fetchTemplate() {
    const response = await fetch(TEMPLATE_URL, { cache: 'no-cache' });
    if (!response.ok) throw new Error('No s\'ha pogut carregar la plantilla oficial del Word.');
    return response.arrayBuffer();
  }

  let templatePromise = null;
  function loadTemplate() {
    if (!templatePromise) {
      templatePromise = (window.location.protocol === 'file:' ? loadEmbeddedTemplate() : fetchTemplate())
        .catch((error) => { templatePromise = null; throw error; });
    }
    return templatePromise;
  }

  window.HRMS = window.HRMS || {};
  window.HRMS.docx = {
    MAX_SAMPLES,
    MIME_DOCX,
    JUSTIFICATION,
    JUSTIFICATION_HEAD,
    JUSTIFICATION_TAIL,
    TemplateError,
    normalizeTemplate,
    fillDocumentXml,
    generateDocx,
    loadTemplate,
    sampleSizes,
    userLayout,
    templateWidths,
    parseEmails,
    emailsFit,
  };
})();
