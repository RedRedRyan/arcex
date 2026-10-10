# Completeness Classification Reference

How to classify a service or submodule from disk evidence alone, without running it.

| Evidence on disk | Classification | Meaning |
|---|---|---|
| package.json + src/ with real files + tests | implemented | built and wired |
| package.json + src/ present, no tests | partial | built but untested |
| package.json + env.example | env-only scaffold | documented contract; no source |
| package.json alone, no src/, no env.example | declared-only | package exists but scope not started |
| README + scripts but no src/ | handoff or process-only | steps documented, not built |
| native dependency fails to install / node_modules absent | broken dependency | surface gap; ask before proceeding |

Rules:

- env.example declares required variables; it never supplies a value. "Referencing .env.example" is not a config check.
- An empty node_modules/ is not a measurement of installed dependencies in this repo (services ship node_modules), but as a general rule it means install was skipped or failed.
- A service with an env.example and a run script but no src/ is config-driven and implementation-pending, not configured.
- "Contracts present in a metadata directory" (contract-metadata/) is not deployment state: it is an older artifact that may disagree with live addresses in frontend constants.
