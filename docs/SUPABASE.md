# Setting up Supabase

## 1. Create the project

1. Go to <https://supabase.com> and sign in.
2. Click **New project**, name it (`hrms-manager`), choose a database password and a European region.
3. Wait until the project is ready.

## 2. Create the tables and the security rules

1. Open **SQL Editor** → **New query**.
2. Paste the whole content of `supabase/schema.sql` and click **Run**. You should see `Success. No rows returned`.

The file is safe to run again: it keeps every sample and replaces the security rules. Run it again whenever it changes.

## 3. Create the shared account

1. Open **Authentication** → **Users** → **Add user** → **Create new user**.
2. Email: `estudiantslippso@example.com`. This address is never used to send mail; it only identifies the account and must match `SHARED_LOGIN_EMAIL` in `js/config.js`.
3. Password: the shared laboratory password.
4. Tick **Auto Confirm User** and click **Create user**.

On the login screen people type the user `estudiantsLIPPSO` and that password.

To change the password later, open the user in **Authentication** → **Users** and set a new one. To use another user name or email, change `SHARED_USERNAME` or `SHARED_LOGIN_EMAIL` in `js/config.js`.

## 4. Close sign-ups

In **Authentication** → **Sign In / Providers**, turn off **Allow new users to sign up** and save. This way the shared account is the only one that can get in.

## 5. Connect the app

1. Open **Project Settings** → **API Keys** (or click **Connect**).
2. Copy the **Project URL** and the **publishable** (or `anon`) key into `js/config.js`.

Never use the `service_role` / `secret` key: it bypasses every security rule.

## Checking that it works

Sign in on the website, register a sample and open **Table Editor** → `samples`: the row must be there with its eight m/z values. Close the browser, open the website again and check that the sample is still listed.
