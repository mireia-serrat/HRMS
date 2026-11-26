# HRMS Manager

Web application to register HRMS-ESI samples, calculate their m/z values and fill in the official **UEM095 COMPACT Request Form** of the Mass Spectrometry Unit (UdG) as Word or PDF.

It runs entirely in the browser: HTML, CSS and JavaScript on GitHub Pages, with the data in Supabase. Nothing has to be installed.

## Using it

1. Open the website and sign in with the shared laboratory account (user `estudiantsLIPPSO`; ask the coordinator for the password). The browser keeps you signed in.
2. **New sample**: enter the sample details. The monoisotopic mass and the eight m/z values are calculated as you type.
3. **Database**: search, filter, edit, duplicate or delete samples, and add who analyzed them. Everyone using the shared account sees every sample.
4. Tick between one and five samples and press **Request form**. Check the order, fill in User Info and the date, and choose **Download Word** or **Download PDF**. The file is named `Name_Date`, for example `Mireia Serrat_26-11-2026.docx`.
5. **Settings**: your User Info is remembered on your own device, so each person keeps their own details.

## Setting it up

1. **Supabase**: follow [docs/SUPABASE.md](docs/SUPABASE.md) to create the tables, the shared account and close sign-ups.
2. **GitHub Pages**: follow [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md).
3. Open `tests.html` on the published site and check that every test passes.

If `js/config.js` has no Supabase URL and `index.html` is opened by double click, the app runs in a local test mode that keeps samples only in that browser.

## Structure

```
hrms-manager/
├── index.html              The application
├── tests.html              Automatic tests, run in the browser
├── css/styles.css          Design
├── js/
│   ├── config.js           Supabase URL, public key and shared account
│   ├── chem.js             Formula parser, masses and m/z
│   ├── docx-filler.js      Fills the official DOCX
│   ├── pdf-filler.js       Builds the PDF
│   ├── db.js               Sign-in and database
│   ├── app.js              Interface
│   └── test-suite.js       Mass, Word and PDF tests
├── assets/                 Official DOCX (unchanged), its base64 copy for double-click use,
│   ├── img/                license badge
│   └── pdf/                form exported with Word, value positions and the Carlito font
├── vendor/                 JSZip 3.10.1, supabase-js 2.119.0, pdf-lib 1.17.1, fontkit 1.1.1
├── supabase/schema.sql     Tables, constraints and security policies
└── docs/                   Setup guides
```

## Calculations

- **Masses**: most abundant stable isotope of each element, from the [NIST](https://physics.nist.gov/cgi-bin/Compositions/stand_alone.pl) table (84 elements plus deuterium, `D`).
- **Proton**: 1.0072764665789 u (CODATA 2022); the hydrogen atom mass is not used.
- **Formula**: `m/z = (M + z × proton mass) / z`, for z = 1 to 8, with six decimals.
- **Parser**: elements, integer subscripts and groups such as `Ca(OH)2`. It is case-sensitive (`Co` ≠ `CO`) and rejects unknown elements, invalid subscripts, unbalanced brackets and charges written in the formula.

## The Word form

`assets/UEM095_COMPACT_Request_Form_v1_eng.docx` is the original file. The app only edits `word/document.xml` at the insertion points; logos, headers, footers, styles and every other part stay identical byte for byte. The result is checked to keep both pages and every table in place.

| Item | Behaviour |
|---|---|
| Leftovers in Sample 1 of the template | Links to a local Excel file and old values (`High`, `NNANA`, `TATATA`) are replaced with the same drop-down and empty cell as Sample 2. |
| Drop-downs | They are combo boxes, which accept free text, so the requested values go inside the original controls. |
| Date Submitted | Filled with the date chosen in the request form (DD/MM/YYYY). |
| Long justification | Its start goes after "If urgent, justify:" and the rest continues in **Other Remarks**. |
| Several emails | Separated with `;` or a comma; if they do not fit on one line they use two without growing the row. |
| Unused sample slots | Keep their structure and drop-downs, without the dots. |

## The PDF form

A browser cannot convert DOCX to PDF faithfully, and an online converter would receive the data. So `assets/pdf/` holds the official form exported with Microsoft Word, with the fixed values already in place, and the app writes the variable values at the positions read from that same export. Values use Carlito, a free font with the same metrics as Calibri. If the official template changes, the PDF bases must be exported again with Word.

## Security

- `js/config.js` holds the **public** Supabase key, which is meant for the browser. The data is protected by Row Level Security: without signing in nothing can be read or changed.
- There is a single shared account. Its password is checked by Supabase and is not stored in this repository.
- Never put the `service_role` / `secret` key in the code.
- Deleting asks for confirmation and can be undone for a few seconds.

## Limitations

- **Free Supabase plan**: projects without activity for a week can be paused. The data is kept; reactivate the project from the dashboard.
- **Shared account**: everyone can edit and delete every sample, and the database cannot tell who did what. The Author and Analyzed by fields record the people involved.
- **Text limits in the form**: Sample code up to 35 characters and Research group up to 80, so they fit without moving the tables.

## License

PGLearn © 2026 Mireia Serrat. This work is licensed under the [Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International License (CC BY-NC-ND 4.0)](https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode.en).

The libraries in `vendor/` and the Carlito font keep their own licenses (MIT, and SIL OFL 1.1 in `assets/pdf/CARLITO-LICENSE.txt`).
