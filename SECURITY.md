# Security Policy

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Report vulnerabilities privately via GitHub's [Security Advisories](../../security/advisories/new) feature.

We will respond within 48 hours and aim to release a fix within 7 days for confirmed issues.

## Threat model

`rrule-ts` parses user-supplied RRULE strings. The primary threat class is:

- **Input that causes excessive computation.** A malicious RRULE that expands into billions
  of occurrences. The `expand()` function (planned) will include a configurable limit with
  a safe default. Never expand without a bound in untrusted contexts.
- **Prototype pollution via field names.** Parsed values are stored in plain objects.
  We guard against `__proto__`, `constructor`, and `prototype` as field names.

## Automated security

- **Supply chain:** `rrule-ts` publishes to npm via OIDC Trusted Publishing. There is no
  long-lived npm token stored in the repository or CI.
