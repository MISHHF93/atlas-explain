# Dependency audit

`npm audit` must report **0 vulnerabilities** before a release (`npm run release:check` enforces it).

## 2026-11-13 — 14 findings (10 moderate, 4 high) → 0

| Advisory | Severity | Path | Fix |
| --- | --- | --- | --- |
| GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4 (`@grpc/grpc-js` < 1.13.6) | high | `firebase` → `@firebase/firestore` → `@grpc/grpc-js@1.9.16` | `overrides["@grpc/grpc-js"] = "^1.13.6"` (resolves 1.14.x). grpc-js is only used by Firestore's Node build; the browser bundle uses WebChannel, so nothing in the shipped app changes. |
| GHSA-g3hv-75wg-m249 (`minimatch` 7.0.0–11.0.0) | moderate | `eslint`, `@eslint/config-array`, `typescript-eslint` → `minimatch@10.2.6` | `overrides.minimatch = "^11.0.1"`. Dev-only (lint); lint output unchanged. |

`npm audit fix --force` would have downgraded `firebase` to 9.14.0 and `eslint` to 9.x, both breaking, so overrides were used instead. Remove each override once the upstream package ships a patched range.

## Runtime

Node `^22.12.0 || ^24.0.0` (Vitest 5 requires `^22.12 || ^24 || >=26`). `.nvmrc` pins 24 LTS.
