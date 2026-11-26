# Changelog

## [1.0.0] - 2026-11-26

### Added
- OpenChamber quota provider service reading `agy -p /usage --output-format json` with two-decimal precision (`5-Hour`, `Weekly`, `Claude/GPT | 5-Hour`, `Claude/GPT | Weekly`).
- Stable bucket `id` matching with group/window/name fallback and invalid `1970` epoch reset handling (`null`).
- Constant-time Bearer token auth (`timingSafeEqual`), allowlisted child environment (`execFile` without shell), concurrent `/quota` request coalescing, and `18s` CLI timeout.
- Verification suite (`scripts/verify.sh`), unit & HTTP handler tests (`scripts/quota-test.mjs`), secret scanner, and GitHub release helper.
