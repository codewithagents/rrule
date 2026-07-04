# Changelog

## [0.3.0](https://github.com/codewithagents/rrule/compare/rrule-ts-v0.2.1...rrule-ts-v0.3.0) (2026-07-04)


### Features

* **rrule-ts:** add fromText English parser and finalize toText i18n ([971676f](https://github.com/codewithagents/rrule/commit/971676ff2b044651ec99af98b0633ffafbe06438))
* **rrule-ts:** German locale for toText ([09a8534](https://github.com/codewithagents/rrule/commit/09a8534b05032766c314f5cb7db1cb371dead5dd))


### Bug Fixes

* **rrule-ts:** correct toText for negative BYDAY ordinals and route ambiguous rules to the complex fallback ([e40b305](https://github.com/codewithagents/rrule/commit/e40b305dee20a19ac61f47ddff130ccd2a83924d))

## [0.2.1](https://github.com/codewithagents/rrule/compare/rrule-ts-v0.2.0...rrule-ts-v0.2.1) (2026-07-04)


### Bug Fixes

* **rrule-ts:** sub-daily BY limits and sparse-COUNT horizon (RFC 5545 conformance) ([a2b0828](https://github.com/codewithagents/rrule/commit/a2b08288b4b118d0cec314a72a0a5d3310a8ae71))

## [0.2.0](https://github.com/codewithagents/rrule/compare/rrule-ts-v0.1.0...rrule-ts-v0.2.0) (2026-07-04)


### Features

* **rrule-ts:** implement recurrence expansion (expand, iterate, RRuleSet) ([eea857f](https://github.com/codewithagents/rrule/commit/eea857f6efdb4bdd3cdec23c26128b3341135e7c))


### Bug Fixes

* **rrule-ts:** correct BY* intersection, BYMONTH restriction, and BYWEEKNO/WKST anchoring in expansion ([51b407c](https://github.com/codewithagents/rrule/commit/51b407caadb43402e0101e0abc08de843e6a0b9b))

## 0.1.0 (2026-06-28)

### Features

* initial release: RFC 5545 RRULE parser, validator, stringifier, and Temporal accessor
