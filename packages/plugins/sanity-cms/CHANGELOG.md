# @voyant-travel/plugin-sanity-cms

## 0.105.25

### Patch Changes

- Updated dependencies [0c30250]
  - @voyant-travel/core@0.137.0

## 0.105.24

### Patch Changes

- Updated dependencies [952d817]
  - @voyant-travel/core@0.136.0
  - @voyant-travel/utils@0.110.0

## 0.105.23

### Patch Changes

- Updated dependencies [3651ff7]
  - @voyant-travel/core@0.135.0

## 0.105.22

### Patch Changes

- Updated dependencies [b07a0a3]
  - @voyant-travel/core@0.134.0

## 0.105.21

### Patch Changes

- Updated dependencies [bf548af]
- Updated dependencies [a6460e2]
- Updated dependencies [8a4f3cd]
  - @voyant-travel/core@0.133.0

## 0.105.20

### Patch Changes

- Updated dependencies [a668d0d]
  - @voyant-travel/core@0.132.0

## 0.105.19

### Patch Changes

- Updated dependencies [9848276]
- Updated dependencies [dffbdad]
- Updated dependencies [f2c9404]
  - @voyant-travel/core@0.131.0

## 0.105.18

### Patch Changes

- Updated dependencies [9db4363]
  - @voyant-travel/utils@0.109.0

## 0.105.17

### Patch Changes

- Updated dependencies [a160a81]
  - @voyant-travel/core@0.130.0

## 0.105.16

### Patch Changes

- Updated dependencies [b8b25b7]
  - @voyant-travel/core@0.129.0

## 0.105.15

### Patch Changes

- Updated dependencies [f6f22e7]
  - @voyant-travel/core@0.128.0
  - @voyant-travel/utils@0.108.0

## 0.105.14

### Patch Changes

- Updated dependencies [117fa05]
  - @voyant-travel/core@0.127.0

## 0.105.13

### Patch Changes

- Updated dependencies [698ddb6]
  - @voyant-travel/core@0.126.0

## 0.105.12

### Patch Changes

- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
- Updated dependencies [52352c4]
  - @voyant-travel/core@0.125.0

## 0.105.11

### Patch Changes

- Updated dependencies [cabf662]
- Updated dependencies [c9b6144]
  - @voyant-travel/core@0.124.0

## 0.105.10

### Patch Changes

- Updated dependencies [7e9f77a]
- Updated dependencies [9c85101]
  - @voyant-travel/core@0.123.0

## 0.105.9

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.
- Updated dependencies [8d62a7c]
  - @voyant-travel/core@0.122.1
  - @voyant-travel/utils@0.107.1

## 0.105.8

### Patch Changes

- Updated dependencies [cc85042]
- Updated dependencies [07a6ee3]
  - @voyant-travel/core@0.122.0

## 0.105.7

### Patch Changes

- Updated dependencies [3f6694b]
  - @voyant-travel/core@0.121.0

## 0.105.6

### Patch Changes

- Updated dependencies [4d0eeed]
- Updated dependencies [bef5b7c]
  - @voyant-travel/utils@0.107.0
  - @voyant-travel/core@0.120.0

## 0.105.5

### Patch Changes

- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [490d132]
- Updated dependencies [047c3f9]
  - @voyant-travel/core@0.119.0

## 0.105.4

### Patch Changes

- Updated dependencies [8f4c242]
- Updated dependencies [d771be3]
- Updated dependencies [8f537b0]
- Updated dependencies [d26a820]
- Updated dependencies [d771be3]
- Updated dependencies [bd7a830]
  - @voyant-travel/core@0.118.0
  - @voyant-travel/utils@0.106.1

## 0.105.3

### Patch Changes

- Updated dependencies [c66f9a5]
  - @voyant-travel/core@0.117.0

## 0.105.2

### Patch Changes

- Updated dependencies [8576451]
  - @voyant-travel/core@0.116.0

## 0.105.1

### Patch Changes

- Updated dependencies [e4e6621]
- Updated dependencies [953e418]
- Updated dependencies [2153e48]
  - @voyant-travel/core@0.115.0

## 0.105.0

### Minor Changes

- a370024: Publish package-owned deployment manifests for legal, storefront, and first-party edge plugins.
- e3dc5a9: Declare package-owned Node application resources, providers, configuration, secrets, events, subscribers, access, and retain-data lifecycle metadata in deployment manifests.

### Patch Changes

- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [a370024]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
- Updated dependencies [e3dc5a9]
  - @voyant-travel/core@0.114.0

## 0.104.13

### Patch Changes

- Updated dependencies [496f2ef]
  - @voyant-travel/core@0.113.0

## 0.104.12

### Patch Changes

- Updated dependencies [425f92e]
  - @voyant-travel/utils@0.106.0
  - @voyant-travel/core@0.112.3

## 0.104.11

### Patch Changes

- Updated dependencies [c9a356f]
  - @voyant-travel/core@0.112.0
  - @voyant-travel/utils@0.105.6

## 0.104.10

### Patch Changes

- Updated dependencies [021ec00]
  - @voyant-travel/core@0.111.0

## 0.104.9

### Patch Changes

- Updated dependencies [98f4a40]
- Updated dependencies [3b27dcc]
- Updated dependencies [39d48fe]
  - @voyant-travel/core@0.110.0

## 0.104.8

### Patch Changes

- a224ef6: Refine plugin HTTP fetch adapters to avoid unsafe implementation casts.

## 0.104.7

### Patch Changes

- b0f1e21: Sanity client calls now go through `resilientFetch` (RFC #1687 Phase 3.3): 10s per-attempt timeout, capped jittered retries (3 attempts on network errors/timeouts/429/5xx) and a per-client circuit breaker that fails fast with `CircuitOpenError` after repeated upstream failures. All calls retry — including POST mutations — because they are idempotent by construction (mutations keyed by `_id`/`voyantId`). Behavior change: calls against a hung CMS now fail after ~10s per attempt instead of hanging for the platform ceiling; subscribers remain fire-and-forget (errors are caught and logged). The final failing response is still surfaced to error mapping (status + body preserved). Tune via the new `resilience` client/plugin option (`timeoutMs`, `retry`, `breaker`).
- Updated dependencies [b0f1e21]
  - @voyant-travel/utils@0.105.0

## 0.104.6

### Patch Changes

- Updated dependencies [b7056f1]
  - @voyant-travel/core@0.109.0

## 0.104.5

### Patch Changes

- Updated dependencies [7255353]
- Updated dependencies [7255353]
  - @voyant-travel/core@0.108.0

## 0.104.4

### Patch Changes

- Updated dependencies [418fa82]
  - @voyant-travel/core@0.107.0

## 0.104.3

### Patch Changes

- Updated dependencies [eeb23df]
  - @voyant-travel/core@0.106.0

## 0.104.2

### Patch Changes

- Updated dependencies [c2aef18]
  - @voyant-travel/core@0.105.0

## 0.104.1

### Patch Changes

- @voyant-travel/core@0.104.1

## 0.104.0

### Patch Changes

- @voyant-travel/core@0.104.0

## 0.103.0

### Patch Changes

- @voyant-travel/core@0.103.0

## 0.102.0

### Patch Changes

- @voyant-travel/core@0.102.0

## 0.101.2

### Patch Changes

- @voyant-travel/core@0.101.2

## 0.101.1

### Patch Changes

- @voyant-travel/core@0.101.1

## 0.101.0

### Patch Changes

- @voyant-travel/core@0.101.0

## 0.100.0

### Patch Changes

- @voyant-travel/core@0.100.0

## 0.99.0

### Patch Changes

- @voyant-travel/core@0.99.0

## 0.98.0

### Patch Changes

- @voyant-travel/core@0.98.0

## 0.97.0

### Patch Changes

- @voyant-travel/core@0.97.0

## 0.96.0

### Patch Changes

- @voyant-travel/core@0.96.0

## 0.95.0

### Patch Changes

- @voyant-travel/core@0.95.0

## 0.94.0

### Patch Changes

- @voyant-travel/core@0.94.0

## 0.93.0

### Patch Changes

- @voyant-travel/core@0.93.0

## 0.92.0

### Patch Changes

- @voyant-travel/core@0.92.0

## 0.91.0

### Patch Changes

- @voyant-travel/core@0.91.0

## 0.90.0

### Patch Changes

- @voyant-travel/core@0.90.0

## 0.89.0

### Patch Changes

- @voyant-travel/core@0.89.0

## 0.88.0

### Patch Changes

- @voyant-travel/core@0.88.0

## 0.87.1

### Patch Changes

- @voyant-travel/core@0.87.1

## 0.87.0

### Patch Changes

- @voyant-travel/core@0.87.0

## 0.86.0

### Patch Changes

- @voyant-travel/core@0.86.0

## 0.85.4

### Patch Changes

- @voyant-travel/core@0.85.4

## 0.85.3

### Patch Changes

- @voyant-travel/core@0.85.3

## 0.85.2

### Patch Changes

- @voyant-travel/core@0.85.2

## 0.85.1

### Patch Changes

- @voyant-travel/core@0.85.1

## 0.85.0

### Patch Changes

- @voyant-travel/core@0.85.0

## 0.84.4

### Patch Changes

- @voyant-travel/core@0.84.4

## 0.84.3

### Patch Changes

- @voyant-travel/core@0.84.3

## 0.84.2

### Patch Changes

- @voyant-travel/core@0.84.2

## 0.84.1

### Patch Changes

- @voyant-travel/core@0.84.1

## 0.84.0

### Patch Changes

- @voyant-travel/core@0.84.0

## 0.83.1

### Patch Changes

- @voyant-travel/core@0.83.1

## 0.83.0

### Patch Changes

- @voyant-travel/core@0.83.0

## 0.82.1

### Patch Changes

- @voyant-travel/core@0.82.1

## 0.82.0

### Patch Changes

- @voyant-travel/core@0.82.0

## 0.81.21

### Patch Changes

- @voyant-travel/core@0.81.21

## 0.81.20

### Patch Changes

- @voyant-travel/core@0.81.20

## 0.81.19

### Patch Changes

- @voyant-travel/core@0.81.19

## 0.81.18

### Patch Changes

- @voyant-travel/core@0.81.18

## 0.81.17

### Patch Changes

- @voyant-travel/core@0.81.17

## 0.81.16

### Patch Changes

- @voyant-travel/core@0.81.16

## 0.81.15

### Patch Changes

- @voyant-travel/core@0.81.15

## 0.81.14

### Patch Changes

- @voyant-travel/core@0.81.14

## 0.81.13

### Patch Changes

- @voyant-travel/core@0.81.13

## 0.81.12

### Patch Changes

- @voyant-travel/core@0.81.12

## 0.81.11

### Patch Changes

- @voyant-travel/core@0.81.11

## 0.81.10

### Patch Changes

- @voyant-travel/core@0.81.10

## 0.81.9

### Patch Changes

- @voyant-travel/core@0.81.9

## 0.81.8

### Patch Changes

- @voyant-travel/core@0.81.8

## 0.81.7

### Patch Changes

- @voyant-travel/core@0.81.7

## 0.81.6

### Patch Changes

- @voyant-travel/core@0.81.6

## 0.81.5

### Patch Changes

- @voyant-travel/core@0.81.5

## 0.81.4

### Patch Changes

- @voyant-travel/core@0.81.4

## 0.81.3

### Patch Changes

- @voyant-travel/core@0.81.3

## 0.81.2

### Patch Changes

- @voyant-travel/core@0.81.2

## 0.81.1

### Patch Changes

- @voyant-travel/core@0.81.1

## 0.81.0

### Patch Changes

- @voyant-travel/core@0.81.0

## 0.80.18

### Patch Changes

- @voyant-travel/core@0.80.18

## 0.80.17

### Patch Changes

- @voyant-travel/core@0.80.17

## 0.80.16

### Patch Changes

- @voyant-travel/core@0.80.16

## 0.80.15

### Patch Changes

- @voyant-travel/core@0.80.15

## 0.80.14

### Patch Changes

- @voyant-travel/core@0.80.14

## 0.80.13

### Patch Changes

- @voyant-travel/core@0.80.13

## 0.80.12

### Patch Changes

- @voyant-travel/core@0.80.12

## 0.80.11

### Patch Changes

- @voyant-travel/core@0.80.11

## 0.80.10

### Patch Changes

- @voyant-travel/core@0.80.10

## 0.80.9

### Patch Changes

- @voyant-travel/core@0.80.9

## 0.80.8

### Patch Changes

- @voyant-travel/core@0.80.8

## 0.80.7

### Patch Changes

- @voyant-travel/core@0.80.7

## 0.80.6

### Patch Changes

- @voyant-travel/core@0.80.6

## 0.80.5

### Patch Changes

- @voyant-travel/core@0.80.5

## 0.80.4

### Patch Changes

- @voyant-travel/core@0.80.4

## 0.80.3

### Patch Changes

- @voyant-travel/core@0.80.3

## 0.80.2

### Patch Changes

- @voyant-travel/core@0.80.2

## 0.80.1

### Patch Changes

- @voyant-travel/core@0.80.1

## 0.80.0

### Patch Changes

- @voyant-travel/core@0.80.0

## 0.79.0

### Patch Changes

- @voyant-travel/core@0.79.0

## 0.78.0

### Patch Changes

- @voyant-travel/core@0.78.0

## 0.77.13

### Patch Changes

- @voyant-travel/core@0.77.13

## 0.77.12

### Patch Changes

- @voyant-travel/core@0.77.12

## 0.77.11

### Patch Changes

- @voyant-travel/core@0.77.11

## 0.77.10

### Patch Changes

- @voyant-travel/core@0.77.10

## 0.77.9

### Patch Changes

- @voyant-travel/core@0.77.9

## 0.77.8

### Patch Changes

- @voyant-travel/core@0.77.8

## 0.77.7

### Patch Changes

- @voyant-travel/core@0.77.7

## 0.77.6

### Patch Changes

- @voyant-travel/core@0.77.6

## 0.77.5

### Patch Changes

- @voyant-travel/core@0.77.5

## 0.77.4

### Patch Changes

- @voyant-travel/core@0.77.4

## 0.77.3

### Patch Changes

- @voyant-travel/core@0.77.3

## 0.77.2

### Patch Changes

- @voyant-travel/core@0.77.2

## 0.77.1

### Patch Changes

- @voyant-travel/core@0.77.1

## 0.77.0

### Patch Changes

- @voyant-travel/core@0.77.0

## 0.76.0

### Patch Changes

- @voyant-travel/core@0.76.0

## 0.75.7

### Patch Changes

- @voyant-travel/core@0.75.7

## 0.75.6

### Patch Changes

- @voyant-travel/core@0.75.6

## 0.75.5

### Patch Changes

- @voyant-travel/core@0.75.5

## 0.75.4

### Patch Changes

- @voyant-travel/core@0.75.4

## 0.75.3

### Patch Changes

- @voyant-travel/core@0.75.3

## 0.75.2

### Patch Changes

- @voyant-travel/core@0.75.2

## 0.75.1

### Patch Changes

- @voyant-travel/core@0.75.1

## 0.75.0

### Patch Changes

- @voyant-travel/core@0.75.0

## 0.74.2

### Patch Changes

- @voyant-travel/core@0.74.2

## 0.74.1

### Patch Changes

- @voyant-travel/core@0.74.1

## 0.74.0

### Patch Changes

- @voyant-travel/core@0.74.0

## 0.73.1

### Patch Changes

- @voyant-travel/core@0.73.1

## 0.73.0

### Patch Changes

- @voyant-travel/core@0.73.0

## 0.72.0

### Patch Changes

- @voyant-travel/core@0.72.0

## 0.71.0

### Patch Changes

- @voyant-travel/core@0.71.0

## 0.70.0

### Patch Changes

- @voyant-travel/core@0.70.0

## 0.69.1

### Patch Changes

- @voyant-travel/core@0.69.1

## 0.69.0

### Patch Changes

- @voyant-travel/core@0.69.0

## 0.68.0

### Patch Changes

- @voyant-travel/core@0.68.0

## 0.67.0

### Patch Changes

- @voyant-travel/core@0.67.0

## 0.66.6

### Patch Changes

- @voyant-travel/core@0.66.6

## 0.66.5

### Patch Changes

- @voyant-travel/core@0.66.5

## 0.66.4

### Patch Changes

- @voyant-travel/core@0.66.4

## 0.66.3

### Patch Changes

- @voyant-travel/core@0.66.3

## 0.66.2

### Patch Changes

- @voyant-travel/core@0.66.2

## 0.66.1

### Patch Changes

- @voyant-travel/core@0.66.1

## 0.66.0

### Patch Changes

- @voyant-travel/core@0.66.0

## 0.65.0

### Patch Changes

- @voyant-travel/core@0.65.0

## 0.64.1

### Patch Changes

- @voyant-travel/core@0.64.1

## 0.64.0

### Patch Changes

- Updated dependencies [6d0c8f3]
  - @voyant-travel/core@0.64.0

## 0.63.1

### Patch Changes

- @voyant-travel/core@0.63.1

## 0.63.0

### Patch Changes

- @voyant-travel/core@0.63.0

## 0.62.3

### Patch Changes

- @voyant-travel/core@0.62.3

## 0.62.2

### Patch Changes

- @voyant-travel/core@0.62.2

## 0.62.1

### Patch Changes

- @voyant-travel/core@0.62.1

## 0.62.0

### Patch Changes

- Updated dependencies [77aad68]
  - @voyant-travel/core@0.62.0

## 0.61.0

### Patch Changes

- @voyant-travel/core@0.61.0

## 0.60.0

### Patch Changes

- @voyant-travel/core@0.60.0

## 0.59.0

### Patch Changes

- @voyant-travel/core@0.59.0

## 0.58.0

### Patch Changes

- @voyant-travel/core@0.58.0

## 0.57.0

### Patch Changes

- @voyant-travel/core@0.57.0

## 0.56.0

### Patch Changes

- @voyant-travel/core@0.56.0

## 0.55.1

### Patch Changes

- @voyant-travel/core@0.55.1

## 0.55.0

### Patch Changes

- @voyant-travel/core@0.55.0

## 0.54.0

### Patch Changes

- @voyant-travel/core@0.54.0

## 0.53.2

### Patch Changes

- @voyant-travel/core@0.53.2

## 0.53.1

### Patch Changes

- @voyant-travel/core@0.53.1

## 0.53.0

### Patch Changes

- @voyant-travel/core@0.53.0

## 0.52.4

### Patch Changes

- @voyant-travel/core@0.52.4

## 0.52.3

### Patch Changes

- @voyant-travel/core@0.52.3

## 0.52.2

### Patch Changes

- @voyant-travel/core@0.52.2

## 0.52.1

### Patch Changes

- @voyant-travel/core@0.52.1

## 0.52.0

### Patch Changes

- @voyant-travel/core@0.52.0

## 0.51.1

### Patch Changes

- @voyant-travel/core@0.51.1

## 0.51.0

### Patch Changes

- @voyant-travel/core@0.51.0

## 0.50.8

### Patch Changes

- @voyant-travel/core@0.50.8

## 0.50.7

### Patch Changes

- @voyant-travel/core@0.50.7

## 0.50.6

### Patch Changes

- @voyant-travel/core@0.50.6

## 0.50.5

### Patch Changes

- @voyant-travel/core@0.50.5

## 0.50.4

### Patch Changes

- @voyant-travel/core@0.50.4

## 0.50.3

### Patch Changes

- @voyant-travel/core@0.50.3

## 0.50.2

### Patch Changes

- @voyant-travel/core@0.50.2

## 0.50.1

### Patch Changes

- @voyant-travel/core@0.50.1

## 0.50.0

### Patch Changes

- @voyant-travel/core@0.50.0

## 0.49.0

### Patch Changes

- @voyant-travel/core@0.49.0

## 0.48.0

### Patch Changes

- @voyant-travel/core@0.48.0

## 0.47.0

### Patch Changes

- @voyant-travel/core@0.47.0

## 0.46.0

### Patch Changes

- @voyant-travel/core@0.46.0

## 0.45.0

### Patch Changes

- @voyant-travel/core@0.45.0

## 0.44.0

### Patch Changes

- @voyant-travel/core@0.44.0

## 0.43.0

### Patch Changes

- Updated dependencies [d07215e]
  - @voyant-travel/core@0.43.0

## 0.42.0

### Patch Changes

- @voyant-travel/core@0.42.0

## 0.41.3

### Patch Changes

- @voyant-travel/core@0.41.3

## 0.41.2

### Patch Changes

- @voyant-travel/core@0.41.2

## 0.41.1

### Patch Changes

- @voyant-travel/core@0.41.1

## 0.41.0

### Patch Changes

- @voyant-travel/core@0.41.0

## 0.40.1

### Patch Changes

- @voyant-travel/core@0.40.1

## 0.40.0

### Patch Changes

- @voyant-travel/core@0.40.0

## 0.39.0

### Patch Changes

- @voyant-travel/core@0.39.0

## 0.38.2

### Patch Changes

- @voyant-travel/core@0.38.2

## 0.38.1

### Patch Changes

- @voyant-travel/core@0.38.1

## 0.38.0

### Patch Changes

- @voyant-travel/core@0.38.0

## 0.37.1

### Patch Changes

- @voyant-travel/core@0.37.1

## 0.37.0

### Patch Changes

- @voyant-travel/core@0.37.0

## 0.36.0

### Patch Changes

- @voyant-travel/core@0.36.0

## 0.35.0

### Patch Changes

- @voyant-travel/core@0.35.0

## 0.34.0

### Patch Changes

- @voyant-travel/core@0.34.0

## 0.33.1

### Patch Changes

- @voyant-travel/core@0.33.1

## 0.33.0

### Patch Changes

- @voyant-travel/core@0.33.0

## 0.32.3

### Patch Changes

- @voyant-travel/core@0.32.3

## 0.32.2

### Patch Changes

- @voyant-travel/core@0.32.2

## 0.32.1

### Patch Changes

- @voyant-travel/core@0.32.1

## 0.32.0

### Patch Changes

- @voyant-travel/core@0.32.0

## 0.31.4

### Patch Changes

- @voyant-travel/core@0.31.4

## 0.31.3

### Patch Changes

- @voyant-travel/core@0.31.3

## 0.31.2

### Patch Changes

- @voyant-travel/core@0.31.2

## 0.31.1

### Patch Changes

- @voyant-travel/core@0.31.1

## 0.31.0

### Patch Changes

- @voyant-travel/core@0.31.0

## 0.30.7

### Patch Changes

- @voyant-travel/core@0.30.7

## 0.30.6

### Patch Changes

- @voyant-travel/core@0.30.6

## 0.30.5

### Patch Changes

- @voyant-travel/core@0.30.5

## 0.30.4

### Patch Changes

- @voyant-travel/core@0.30.4

## 0.30.3

### Patch Changes

- @voyant-travel/core@0.30.3

## 0.30.2

### Patch Changes

- @voyant-travel/core@0.30.2

## 0.30.1

### Patch Changes

- @voyant-travel/core@0.30.1

## 0.30.0

### Patch Changes

- @voyant-travel/core@0.30.0

## 0.29.0

### Patch Changes

- @voyant-travel/core@0.29.0

## 0.28.3

### Patch Changes

- @voyant-travel/core@0.28.3

## 0.28.2

### Patch Changes

- @voyant-travel/core@0.28.2

## 0.28.1

### Patch Changes

- @voyant-travel/core@0.28.1

## 0.28.0

### Patch Changes

- @voyant-travel/core@0.28.0

## 0.27.0

### Patch Changes

- @voyant-travel/core@0.27.0

## 0.26.9

### Patch Changes

- @voyant-travel/core@0.26.9

## 0.26.8

### Patch Changes

- @voyant-travel/core@0.26.8

## 0.26.7

### Patch Changes

- @voyant-travel/core@0.26.7

## 0.26.6

### Patch Changes

- @voyant-travel/core@0.26.6

## 0.26.5

### Patch Changes

- @voyant-travel/core@0.26.5

## 0.26.4

### Patch Changes

- @voyant-travel/core@0.26.4

## 0.26.3

### Patch Changes

- @voyant-travel/core@0.26.3

## 0.26.2

### Patch Changes

- @voyant-travel/core@0.26.2

## 0.26.1

### Patch Changes

- @voyant-travel/core@0.26.1

## 0.26.0

### Patch Changes

- @voyant-travel/core@0.26.0

## 0.25.0

### Patch Changes

- @voyant-travel/core@0.25.0

## 0.24.3

### Patch Changes

- @voyant-travel/core@0.24.3

## 0.24.2

### Patch Changes

- @voyant-travel/core@0.24.2

## 0.24.1

### Patch Changes

- @voyant-travel/core@0.24.1

## 0.24.0

### Patch Changes

- @voyant-travel/core@0.24.0

## 0.23.0

### Patch Changes

- @voyant-travel/core@0.23.0

## 0.22.0

### Patch Changes

- @voyant-travel/core@0.22.0

## 0.21.1

### Patch Changes

- @voyant-travel/core@0.21.1

## 0.21.0

### Patch Changes

- @voyant-travel/core@0.21.0

## 0.20.0

### Patch Changes

- @voyant-travel/core@0.20.0

## 0.19.0

### Patch Changes

- @voyant-travel/core@0.19.0

## 0.18.0

### Patch Changes

- @voyant-travel/core@0.18.0

## 0.17.0

### Patch Changes

- Updated dependencies [66d722d]
  - @voyant-travel/core@0.17.0

## 0.16.0

### Patch Changes

- @voyant-travel/core@0.16.0

## 0.15.0

### Patch Changes

- @voyant-travel/core@0.15.0

## 0.14.0

### Patch Changes

- @voyant-travel/core@0.14.0

## 0.13.0

### Patch Changes

- @voyant-travel/core@0.13.0

## 0.12.0

### Patch Changes

- @voyant-travel/core@0.12.0

## 0.11.0

### Patch Changes

- @voyant-travel/core@0.11.0

## 0.10.0

### Patch Changes

- @voyant-travel/core@0.10.0

## 0.9.0

### Patch Changes

- @voyant-travel/core@0.9.0

## 0.8.0

### Patch Changes

- @voyant-travel/core@0.8.0

## 0.7.0

### Patch Changes

- @voyant-travel/core@0.7.0

## 0.6.9

### Patch Changes

- @voyant-travel/core@0.6.9

## 0.6.8

### Patch Changes

- @voyant-travel/core@0.6.8

## 0.6.7

### Patch Changes

- @voyant-travel/core@0.6.7

## 0.6.6

### Patch Changes

- @voyant-travel/core@0.6.6

## 0.6.5

### Patch Changes

- @voyant-travel/core@0.6.5

## 0.6.4

### Patch Changes

- @voyant-travel/core@0.6.4

## 0.6.3

### Patch Changes

- Updated dependencies [d3c6937]
  - @voyant-travel/core@0.6.3

## 0.6.2

### Patch Changes

- @voyant-travel/core@0.6.2

## 0.6.1

### Patch Changes

- @voyant-travel/core@0.6.1

## 0.6.0

### Patch Changes

- @voyant-travel/core@0.6.0

## 0.5.0

### Patch Changes

- @voyant-travel/core@0.5.0

## 0.4.5

### Patch Changes

- Updated dependencies [e3f6e72]
  - @voyant-travel/core@0.4.5

## 0.4.4

### Patch Changes

- @voyant-travel/core@0.4.4

## 0.4.3

### Patch Changes

- @voyant-travel/core@0.4.3

## 0.4.2

### Patch Changes

- @voyant-travel/core@0.4.2

## 0.4.1

### Patch Changes

- @voyant-travel/core@0.4.1

## 0.4.0

### Patch Changes

- @voyant-travel/core@0.4.0

## 0.3.1

### Patch Changes

- @voyant-travel/core@0.3.1

## 0.3.0

### Patch Changes

- @voyant-travel/core@0.3.0

## 0.2.0

### Patch Changes

- 99c6dac: Fix the published package layout so plugin build output lands at `dist/*` without leaking `dist/src/*` or compiled tests into npm tarballs.
  - @voyant-travel/core@0.2.0

## 0.1.1

### Patch Changes

- @voyant-travel/core@0.1.1
