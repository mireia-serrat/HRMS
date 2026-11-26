# Publishing on GitHub Pages

Fill in `js/config.js` first, following [SUPABASE.md](SUPABASE.md).

## From the browser

1. Create a repository on <https://github.com> (for example `HRMS`) and leave it **Public**.
2. Click **uploading an existing file** and drag the **contents** of the `hrms-manager` folder: `index.html`, `tests.html`, `css`, `js`, `assets`, `vendor`, `supabase`, `docs` and `README.md`. `index.html` must be at the root of the repository.
3. Click **Commit changes**.
4. Open **Settings** → **Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and click **Save**. A "Deploy static content to Pages" workflow also works.
5. After a minute or two the address appears at the top, for example `https://USER.github.io/HRMS/`.

## After publishing

1. Open `https://USER.github.io/HRMS/tests.html` and check that every test passes.
2. Sign in with the laboratory user and password and register a test sample.

## Updating

Upload the changed files again with **Add file** → **Upload files**. GitHub Pages republishes in a minute or two; reload with Ctrl+F5 if you still see the old version.

## Common problems

| What happens | Fix |
|---|---|
| "Supabase is not configured" | `js/config.js` is empty or the filled-in version was not uploaded. |
| 404 when opening the address | `index.html` is not at the repository root, or Pages is still publishing. |
| "Wrong user or password" with the right password | The password was not set in Supabase yet (step 3 of SUPABASE.md), or `SHARED_USERNAME` differs. |
| "The tables are missing in Supabase" | Run `supabase/schema.sql` in the SQL Editor. |
| No connection to the database | The Supabase project may be paused; reactivate it from the dashboard. |
