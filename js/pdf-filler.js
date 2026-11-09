// Genera el PDF: escriu els valors variables sobre el formulari oficial exportat amb Microsoft Word.
// El navegador no pot convertir un DOCX a PDF amb fidelitat; així el formulari és el de Word.

(() => {
  'use strict';

  const { computeIons } = window.HRMS.chem;
  const { sampleSizes, userLayout, MAX_SAMPLES } = window.HRMS.docx;

  const EMAIL_LINE_PT = 9;
  const MZ_HALF_POINTS = 18;
  const VALUE_HALF_POINTS = 18;

  const scripts = new Map();
  function loadScript(src) {
    if (!scripts.has(src)) {
      scripts.set(src, new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => {
          scripts.delete(src);
          reject(new Error('No s\'han pogut carregar els fitxers del PDF.'));
        };
        document.head.append(script);
      }));
    }
    return scripts.get(src);
  }

  const decode = (base64) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  // Les bases porten en cada espai utilitzat els valors fixos; els restants queden buits.
  async function generatePdf({ user, samples }) {
    if (!samples.length || samples.length > MAX_SAMPLES) throw new Error(`Selecciona entre 1 i ${MAX_SAMPLES} mostres.`);
    await loadScript('vendor/pdf-lib.min.js');
    await Promise.all([
      loadScript('vendor/fontkit.umd.min.js'),
      loadScript('assets/pdf/layout.js'),
      loadScript('assets/pdf/carlito.js'),
      loadScript(`assets/pdf/base-${samples.length}.js`),
    ]);

    const { layout, bases, font: fontData } = window.HRMS_PDF;
    const pdf = await window.PDFLib.PDFDocument.load(decode(bases[samples.length]));
    pdf.registerFontkit(window.fontkit);
    const font = await pdf.embedFont(decode(fontData), { subset: true });
    const pages = pdf.getPages();
    const put = ({ page, x, y }, text, halfPoints) => {
      pages[page].drawText(text, { x, y, size: halfPoints / 2, font });
    };

    const info = userLayout(user, layout.user.widths);
    if (info.name) put(layout.user.name, info.name.text, info.name.size);
    if (info.group) put(layout.user.group, info.group.text, info.group.size);
    if (info.emails) {
      const { lines, size } = info.emails;
      put(layout.user.email, lines[0], size);
      if (lines[1]) {
        put({ ...layout.user.email, x: layout.user.emailContinuationX, y: layout.user.email.y - EMAIL_LINE_PT }, lines[1], size);
      }
    }

    samples.forEach((sample, index) => {
      const slot = layout.slots[index];
      const sizes = sampleSizes(sample, slot.widths);
      const formula = String(sample.molecular_formula).trim();
      put(slot.code, String(sample.sample_code), sizes.code);
      put(slot.confidence, sample.confidence, VALUE_HALF_POINTS);
      put(slot.purity, sample.purity, VALUE_HALF_POINTS);
      put(slot.publication, sample.publication, VALUE_HALF_POINTS);
      put(sizes.formulaBeside ? slot.formula : slot.formulaWide, formula, sizes.formula);
      computeIons(formula).ions.forEach((ion, i) => {
        const spot = slot.mz[i];
        const width = font.widthOfTextAtSize(ion.text, MZ_HALF_POINTS / 2);
        put({ page: spot.page, x: spot.right - width, y: spot.y }, ion.text, MZ_HALF_POINTS);
      });
    });

    pdf.setTitle('UEM095 COMPACT Request Form');
    return pdf.save();
  }

  window.HRMS = window.HRMS || {};
  window.HRMS.pdf = { generatePdf };
})();
