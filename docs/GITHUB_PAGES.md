# Publicar a GitHub Pages

Abans de publicar, omple `js/config.js` seguint [SUPABASE.md](SUPABASE.md).

## Des del navegador

1. Entra a <https://github.com> i crea un compte si no en tens.
2. Fes clic a **+** → **New repository**.
3. Posa-li de nom `hrms-manager`, deixa'l **Public** i fes clic a **Create repository**.
4. Fes clic a **uploading an existing file**.
5. Descomprimeix el ZIP i arrossega **el contingut** de la carpeta `hrms-manager` (`index.html`, `tests.html`, `css`, `js`, `assets`, `vendor`, `supabase`, `docs`, `README.md`). `index.html` ha de quedar a l'arrel del repositori.
6. Fes clic a **Commit changes**.
7. Obre **Settings** → **Pages**.
8. A **Build and deployment**, tria **Deploy from a branch**, branca `main` i carpeta `/ (root)`, i fes clic a **Save**.
9. Espera un o dos minuts i recarrega la pàgina: a dalt apareixerà l'adreça, `https://USUARI.github.io/hrms-manager/`.

## Després de publicar

1. Posa aquesta adreça a Supabase, tal com s'explica al pas 4 de [SUPABASE.md](SUPABASE.md).
2. Obre `https://USUARI.github.io/hrms-manager/tests.html` i comprova que totes les proves s'han superat.
3. Crea el compte a l'aplicació i registra una mostra de prova.

## Actualitzar l'aplicació

Puja de nou els fitxers modificats amb **Add file** → **Upload files**. GitHub Pages es publica sol en un o dos minuts. Si no veus el canvi, recarrega amb Ctrl+F5.

## Problemes habituals

| Què passa | Solució |
|---|---|
| Surt "Falta configurar Supabase" | `js/config.js` està buit o no s'ha pujat la versió omplerta. |
| Error 404 en obrir la URL | `index.html` no és a l'arrel del repositori, o Pages encara s'està publicant. |
| "Falten les taules a Supabase" | Executa `supabase/schema.sql` al SQL Editor. |
| L'enllaç del correu porta a localhost | Revisa la **Site URL** a Supabase. |
| No es pot connectar a la base de dades | Pot ser que el projecte de Supabase estigui pausat; reactiva'l des del panell. |
