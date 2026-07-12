# WP4 Creator Experience

WP4 is the experience glue layer. It owns no semantic, asset, project-file or
provider truth. It consumes only Runtime and ProjectStore APIs and lets a player
do five continuous things: choose a project, describe a new idea, watch stable
stages, play a saved version, and continue or roll back that project.

`server/local-runtime/creator-experience.js` converts runtime codes into stable
user debt cards. Browser UI receives a title, a plain-language message and
allowed actions; raw pipeline output and owner diagnostics remain private.

Automatic repair remains inside domain runtimes and is bounded to one attempt.
When that budget is exhausted, WP4 presents actionable debt and preserves the
previous playable version. It never silently retries, calls a provider from the
browser, or overwrites a project.

The UI has a project selector, stable build stages, embedded play iframe,
natural-language continue drawer, version history, rollback action and cancel.
`npm run check:creator` validates the experience contract, API flow and platform
build.
