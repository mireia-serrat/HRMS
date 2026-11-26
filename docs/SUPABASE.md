# Setting up Supabase

Supabase only stores the samples. There are no user accounts to manage: everyone signs in with the same laboratory user and password.

## 1. Create the project

1. Go to <https://supabase.com> and sign in.
2. Click **New project**, name it (`hrms-manager`), choose a database password and a European region.
3. Wait until the project is ready.

## 2. Create the database

1. Open **SQL Editor** → **New query**.
2. Paste the whole content of `supabase/schema.sql` and click **Run**. You should see `Success. No rows returned`.

The file is safe to run again: it keeps every sample.

## 3. Set the laboratory password

In a new query, run this line with the password you want, and click **Run**:

```sql
select public.set_lab_password('the laboratory password');
```

The password is stored only as an encrypted hash, so nobody can read it back. To change it, run the same line with the new password: everyone will have to sign in again. Use letters, numbers and basic symbols (no accents).

## 4. Connect the app

1. Open **Project Settings** → **API Keys** (or click **Connect**).
2. Copy the **Project URL** and the **publishable** (or `anon`) key into `js/config.js`.
3. `SHARED_USERNAME` in the same file is the user name typed on the login screen.

Never use the `service_role` / `secret` key: it bypasses every security rule.

## Checking that it works

Sign in on the website, register a sample and open **Table Editor** → `samples`: the row must be there with its eight m/z values. Close the browser, open the website again and check that the sample is still listed.
