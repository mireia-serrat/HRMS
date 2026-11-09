# Configurar Supabase

## 1. Crea el projecte

1. Entra a <https://supabase.com> i crea un compte.
2. Fes clic a **New project**. Tria un nom (`hrms-manager`), una contrasenya de base de dades i una regió europea.
3. Espera que el projecte estigui a punt.

## 2. Crea les taules i la seguretat

1. Al menú lateral, obre **SQL Editor** → **New query**.
2. Enganxa-hi tot el contingut de `supabase/schema.sql`.
3. Fes clic a **Run**. Ha de sortir `Success`.

Si ja havies executat una versió anterior, torna'l a executar: afegeix les columnes noves sense esborrar cap mostra.

Comprovació: a **Table Editor** han d'aparèixer `samples` i `user_preferences`, totes dues sense l'avís "RLS disabled".

## 3. Connecta l'aplicació

1. Obre **Project Settings** → **API** (o **API Keys**).
2. Copia la **Project URL** i la clau pública, anomenada `anon` o `publishable`.
3. Enganxa-les a `js/config.js`:

```js
window.HRMS_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'la-teva-clau-publica',
};
```

> No facis servir mai la clau `service_role` / `secret`: dona accés total i saltaria RLS.

## 4. Configura els enllaços de correu

A **Authentication** → **URL Configuration**:

- **Site URL:** `https://USUARI.github.io/hrms-manager/`
- **Redirect URLs:** afegeix la mateixa adreça.

Sense això, els enllaços de confirmació i de recuperació de contrasenya no tornen a l'aplicació.

## 5. Tanca el registre (recomanat)

1. Obre l'aplicació publicada i crea el compte de cadascuna de les persones que l'han d'utilitzar.
2. A **Authentication** → **Sign In / Providers**, desactiva **Allow new users to sign up**.

Si no ho fas, qualsevol persona amb la URL es pot crear un compte. No veuria les teves mostres, però podria guardar-ne de pròpies a la teva base de dades.

Cada compte té les seves mostres: dues persones del laboratori no veuen les dades de l'altra si no comparteixen compte.

## Comprovar que les dades es guarden

Registra una mostra a l'aplicació i obre **Table Editor** → `samples`: hi ha de ser la fila amb els vuit m/z. Tanca el navegador, torna a entrar i la mostra ha de continuar a la llista.
