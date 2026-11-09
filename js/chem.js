// Càlcul de masses monoisotòpiques i m/z d'ions protonats.
// Masses: isòtop estable més abundant de cada element, generades de la taula
// "Atomic Weights and Isotopic Compositions" del NIST (physics.nist.gov).
(() => {
  'use strict';

  const PROTON_MASS = 1.0072764665789; // u, CODATA 2022
  const MAX_CHARGE = 8;
  const MAX_FORMULA_LENGTH = 80;
  const MAX_COUNT = 1000000;

  const MONOISOTOPIC_MASS = Object.freeze({
    H: 1.00782503223, // 1H
    D: 2.01410177812, // 2H
    He: 4.00260325413, // 4He
    Li: 7.0160034366, // 7Li
    Be: 9.012183065, // 9Be
    B: 11.00930536, // 11B
    C: 12.0000000, // 12C
    N: 14.00307400443, // 14N
    O: 15.99491461957, // 16O
    F: 18.99840316273, // 19F
    Ne: 19.9924401762, // 20Ne
    Na: 22.9897692820, // 23Na
    Mg: 23.985041697, // 24Mg
    Al: 26.98153853, // 27Al
    Si: 27.97692653465, // 28Si
    P: 30.97376199842, // 31P
    S: 31.9720711744, // 32S
    Cl: 34.968852682, // 35Cl
    Ar: 39.9623831237, // 40Ar
    K: 38.9637064864, // 39K
    Ca: 39.962590863, // 40Ca
    Sc: 44.95590828, // 45Sc
    Ti: 47.94794198, // 48Ti
    V: 50.94395704, // 51V
    Cr: 51.94050623, // 52Cr
    Mn: 54.93804391, // 55Mn
    Fe: 55.93493633, // 56Fe
    Co: 58.93319429, // 59Co
    Ni: 57.93534241, // 58Ni
    Cu: 62.92959772, // 63Cu
    Zn: 63.92914201, // 64Zn
    Ga: 68.9255735, // 69Ga
    Ge: 73.921177761, // 74Ge
    As: 74.92159457, // 75As
    Se: 79.9165218, // 80Se
    Br: 78.9183376, // 79Br
    Kr: 83.9114977282, // 84Kr
    Rb: 84.9117897379, // 85Rb
    Sr: 87.9056125, // 88Sr
    Y: 88.9058403, // 89Y
    Zr: 89.9046977, // 90Zr
    Nb: 92.9063730, // 93Nb
    Mo: 97.90540482, // 98Mo
    Ru: 101.9043441, // 102Ru
    Rh: 102.9054980, // 103Rh
    Pd: 105.9034804, // 106Pd
    Ag: 106.9050916, // 107Ag
    Cd: 113.90336509, // 114Cd
    In: 114.903878776, // 115In
    Sn: 119.90220163, // 120Sn
    Sb: 120.9038120, // 121Sb
    Te: 129.906222748, // 130Te
    I: 126.9044719, // 127I
    Xe: 131.9041550856, // 132Xe
    Cs: 132.9054519610, // 133Cs
    Ba: 137.90524700, // 138Ba
    La: 138.9063563, // 139La
    Ce: 139.9054431, // 140Ce
    Pr: 140.9076576, // 141Pr
    Nd: 141.9077290, // 142Nd
    Sm: 151.9197397, // 152Sm
    Eu: 152.9212380, // 153Eu
    Gd: 157.9241123, // 158Gd
    Tb: 158.9253547, // 159Tb
    Dy: 163.9291819, // 164Dy
    Ho: 164.9303288, // 165Ho
    Er: 165.9302995, // 166Er
    Tm: 168.9342179, // 169Tm
    Yb: 173.9388664, // 174Yb
    Lu: 174.9407752, // 175Lu
    Hf: 179.9465570, // 180Hf
    Ta: 180.9479958, // 181Ta
    W: 183.95093092, // 184W
    Re: 186.9557501, // 187Re
    Os: 191.9614770, // 192Os
    Ir: 192.9629216, // 193Ir
    Pt: 194.9647917, // 195Pt
    Au: 196.96656879, // 197Au
    Hg: 201.97064340, // 202Hg
    Tl: 204.9744278, // 205Tl
    Pb: 207.9766525, // 208Pb
    Bi: 208.9803991, // 209Bi
    Th: 232.0380558, // 232Th
    Pa: 231.0358842, // 231Pa
    U: 238.0507884, // 238U
  });

  class FormulaError extends Error {
    constructor(message) {
      super(message);
      this.name = 'FormulaError';
    }
  }

  // Analitza una fórmula amb elements i subíndexs enters. Admet grups entre
  // parèntesis o claudàtors, p. ex. Ca(OH)2. Distingeix majúscules (Co ≠ CO).
  function parseFormula(input) {
    if (typeof input !== 'string') throw new FormulaError('Introdueix una fórmula molecular.');
    const formula = input.trim();
    if (!formula) throw new FormulaError('Introdueix una fórmula molecular.');
    if (formula.length > MAX_FORMULA_LENGTH) {
      throw new FormulaError(`La fórmula és massa llarga (màxim ${MAX_FORMULA_LENGTH} caràcters).`);
    }

    const closers = { '(': ')', '[': ']' };
    const stack = [{ counts: new Map(), closer: null }];
    let i = 0;

    const readCount = () => {
      const start = i;
      while (i < formula.length && /[0-9]/.test(formula[i])) i += 1;
      if (start === i) return 1;
      const digits = formula.slice(start, i);
      if (digits[0] === '0') {
        throw new FormulaError(`Subíndex no vàlid "${digits}" a la posició ${start + 1}: ha de ser un enter positiu sense zeros inicials.`);
      }
      const value = Number(digits);
      if (value > MAX_COUNT) throw new FormulaError(`El subíndex ${digits} és massa gran.`);
      return value;
    };

    const add = (map, element, count) => {
      const total = (map.get(element) || 0) + count;
      if (total > MAX_COUNT) throw new FormulaError(`El nombre d'àtoms de ${element} és massa gran.`);
      map.set(element, total);
    };

    while (i < formula.length) {
      const ch = formula[i];
      if (ch === '(' || ch === '[') {
        stack.push({ counts: new Map(), closer: closers[ch], open: i });
        i += 1;
      } else if (ch === ')' || ch === ']') {
        const group = stack.pop();
        if (!group.closer || group.closer !== ch) {
          throw new FormulaError(`Parèntesi "${ch}" sense obrir o mal aparellat a la posició ${i + 1}.`);
        }
        if (group.counts.size === 0) throw new FormulaError(`Grup buit a la posició ${group.open + 1}.`);
        i += 1;
        const multiplier = readCount();
        for (const [element, count] of group.counts) add(stack[stack.length - 1].counts, element, count * multiplier);
      } else if (/[A-Z]/.test(ch)) {
        let symbol = ch;
        if (/[a-z]/.test(formula[i + 1] || '')) symbol += formula[i + 1];
        if (!Object.hasOwn(MONOISOTOPIC_MASS, symbol)) {
          throw new FormulaError(`Element desconegut o sense isòtop estable: "${symbol}" (posició ${i + 1}).`);
        }
        i += symbol.length;
        add(stack[stack.length - 1].counts, symbol, readCount());
      } else if (/[a-z]/.test(ch)) {
        throw new FormulaError(`Caràcter inesperat "${ch}" a la posició ${i + 1}: els símbols dels elements comencen amb majúscula.`);
      } else if (/[0-9]/.test(ch)) {
        throw new FormulaError(`Subíndex sense element a la posició ${i + 1}.`);
      } else if (/\s/.test(ch)) {
        throw new FormulaError(`La fórmula no pot contenir espais (posició ${i + 1}).`);
      } else {
        throw new FormulaError(`Caràcter no vàlid "${ch}" a la posició ${i + 1}.`);
      }
    }

    if (stack.length !== 1) throw new FormulaError('Falta tancar un parèntesi.');
    return stack[0].counts;
  }

  function monoisotopicMass(formula) {
    let mass = 0;
    for (const [element, count] of parseFormula(formula)) mass += MONOISOTOPIC_MASS[element] * count;
    return mass;
  }

  function mzForCharge(mass, z) {
    return (mass + z * PROTON_MASS) / z;
  }

  function ionLabel(z) {
    return z === 1 ? '[M+H]+' : `[M+${z}H]${z}+`;
  }

  const formatMass = (value) => value.toFixed(6);

  // Resultat complet per a una fórmula; llança FormulaError si no és vàlida.
  function computeIons(formula) {
    const mass = monoisotopicMass(formula);
    const ions = [];
    for (let z = 1; z <= MAX_CHARGE; z += 1) {
      const mz = mzForCharge(mass, z);
      ions.push({ z, label: ionLabel(z), mz, text: formatMass(mz) });
    }
    return { mass, massText: formatMass(mass), ions };
  }

  window.HRMS = window.HRMS || {};
  window.HRMS.chem = {
    PROTON_MASS,
    MAX_CHARGE,
    MAX_FORMULA_LENGTH,
    MONOISOTOPIC_MASS,
    FormulaError,
    parseFormula,
    monoisotopicMass,
    mzForCharge,
    ionLabel,
    formatMass,
    computeIons,
  };
})();
