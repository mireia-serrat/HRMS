# HRMS Manager

Aplicació web per registrar mostres d'HRMS-ESI, calcular-ne els m/z i emplenar el formulari oficial **UEM095 COMPACT Request Form** de la Unitat d'Espectrometria de Masses (UdG).

S'executa del tot al navegador: HTML, CSS i JavaScript a GitHub Pages, i les dades a Supabase. No cal instal·lar res.

## Provar-la amb doble clic

Obre `index.html` amb doble clic. Mentre `js/config.js` estigui buit, funciona en **mode de prova local**: no demana iniciar sessió i les mostres es guarden només en aquest navegador i en aquest ordinador. Tot funciona igual, inclosa la generació del Word i del PDF. No s'ha d'utilitzar per a dades reals: si esborres les dades del navegador, es perden.

## Posada en marxa

1. **Supabase:** segueix [docs/SUPABASE.md](docs/SUPABASE.md). Crea la base de dades i omple `js/config.js`.
2. **GitHub Pages:** segueix [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md). Publica la web a `https://USUARI.github.io/hrms-manager/`.
3. Obre la URL, crea el compte i comprova que `tests.html` indica que totes les proves s'han superat.

## Estructura

```
hrms-manager/
├── index.html              Aplicació (SPA)
├── tests.html              Proves automàtiques al navegador
├── css/styles.css          Disseny
├── js/
│   ├── config.js           URL i clau pública de Supabase  ← cal omplir-lo
│   ├── chem.js             Analitzador de fórmules, masses i m/z
│   ├── docx-filler.js      Emplenat del DOCX oficial
│   ├── pdf-filler.js       Generació del PDF
│   ├── db.js               Autenticació i base de dades
│   ├── app.js              Interfície
│   └── test-suite.js       Proves de masses i del Word
├── assets/                 DOCX oficial, sense modificar, i la seva còpia en base64 per al doble clic
│   └── pdf/                Formulari exportat amb Word, posicions i tipus de lletra del PDF
├── vendor/                 JSZip 3.10.1, supabase-js 2.119.0, pdf-lib 1.17.1 i fontkit 1.1.1
├── supabase/schema.sql     Taules, restriccions i polítiques RLS
└── docs/                   Guies de publicació
```

## Càlculs

- **Masses:** isòtop estable més abundant de cada element, generades de la taula del [NIST](https://physics.nist.gov/cgi-bin/Compositions/stand_alone.pl). Inclou 84 elements i el deuteri (`D`).
- **Protó:** 1.0072764665789 u (CODATA 2022). No s'utilitza la massa de l'àtom d'hidrogen.
- **Fórmula:** `m/z = (M + z × massa del protó) / z`, amb z de 1 a 8 i sis decimals.
- **Analitzador:** admet elements, subíndexs enters i grups com `Ca(OH)2`. Distingeix majúscules (`Co` ≠ `CO`) i rebutja elements desconeguts, subíndexs no vàlids, parèntesis mal aparellats i càrregues escrites a la fórmula.

## Com s'omple el Word

`assets/UEM095_COMPACT_Request_Form_v1_eng.docx` és el fitxer original. L'aplicació el descarrega, edita només `word/document.xml` als punts d'inserció i torna a comprimir el paquet. Logotips, capçaleres, peus, estils i la resta de fitxers interns es mantenen idèntics byte a byte.

Decisions sobre el formulari:

| Punt | Comportament |
|---|---|
| Restes a la Sample 1 de la plantilla | Porta enllaços a `C:\Users\Usuario\Desktop\Book1.xlsx` i valors antics (`High`, `NNANA`, `TATATA`). Se substitueixen pel desplegable i la cel·la buida idèntics als de la Sample 2. Sense això, Word demana actualitzar enllaços i el document no queda net. |
| Desplegables | Són `comboBox`, que admeten text lliure, així que els valors demanats s'escriuen dins del control original encara que no siguin a la llista. |
| Justificació llarga | La fila de "If urgent, justify:" només admet una línia. El principi hi queda i la resta continua a **Other Remarks**, precedida de `Justification (cont.):`. |
| Diversos correus | Al camp Email es poden posar separats amb `;` o amb una coma. Si no caben en una línia, se'n fan dues sense que la fila creixi. |
| Espais sense mostra | Conserven l'estructura i els desplegables, amb els punts suspensius substituïts per espais. |
| Textos llargs | La mida es redueix fins que hi cap en una línia. Una fórmula que no cap al costat de l'etiqueta passa a la cel·la buida de la dreta. |

Si es canvia la plantilla per una versió amb una altra estructura, l'aplicació mostra un error en lloc de generar un document incorrecte.

## Com es genera el PDF

El navegador no pot convertir un DOCX a PDF amb fidelitat, i un servei extern hauria de rebre les dades. Per això `assets/pdf/` conté el formulari oficial exportat amb Microsoft Word, amb els textos fixos ja posats, i l'aplicació hi escriu els valors variables a les posicions llegides d'aquesta mateixa exportació.

- El PDF i el Word es generen alhora a partir de les mateixes dades.
- Els valors variables utilitzen Carlito, un tipus de lletra lliure amb les mateixes mètriques que Calibri. La resta del formulari és Calibri original.
- Si canvia la plantilla oficial, cal tornar a exportar les bases del PDF amb Word.
- El PDF no reflecteix els canvis que facis manualment al Word després de generar-lo.

## Autoria de les mostres

Cada mostra guarda l'**autor** i **qui l'ha analitzada**. L'autor es proposa a partir del nom de Configuració i es pot canviar. "Analitzada per" s'afegeix des de la taula de la base de dades, amb el botó **Afegir**, o editant la mostra. Tots dos camps entren a la cerca. No apareixen al Word, perquè el formulari oficial no té cap camp per a aquestes dades.

## Seguretat

- La clau de `js/config.js` és la **pública** (`anon` / `publishable`). Està pensada per anar al navegador; qui protegeix les dades és RLS.
- Mai no s'ha de posar al codi la clau `service_role` / `secret`.
- Les polítiques RLS limiten cada usuari a les seves files, i les consultes sense sessió es rebutgen.
- En eliminar una mostra es demana confirmació i durant uns segons es pot desfer.
- Si falla la connexió en guardar, el formulari conserva les dades per tornar-ho a provar.

## Limitacions

- **Pla gratuït de Supabase:** els projectes sense activitat durant una setmana es poden pausar. Les dades no es perden, però cal reactivar el projecte des del panell. Aquest pla tampoc inclou còpies de seguretat descarregables.
- **Repositori públic:** a GitHub Pages gratuït el repositori és públic, per tant el codi i la plantilla DOCX són visibles. Les mostres no hi són mai, perquè viuen a Supabase.
- **Límits de text al Word:** Sample code fins a 35 caràcters i Research group fins a 80, perquè càpiguen sense moure les taules.
- **Date Submitted:** el formulari té aquest camp, però no es va demanar emplenar-lo i queda en blanc.
