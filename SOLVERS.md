# Solvers

<!--
  Rows below are added by solver pull requests, not by hand.
  Each row carries an Ed25519 proof over "theta-solver-v1|<lowercase username>".
  The verification public key (base64, raw 32 bytes) is embedded as a constant
  in .github/scripts/verify-solver.js:

      KZ2Mhj2h6tlcGjEwde/2CYmOzqEXJ49qzWp7kJJIkh4=

  A GitHub Actions workflow runs it against every incoming PR: a PR that
  produces a valid proof is merged automatically, anything else is closed.
  Hand-edits to this table by anyone but that bot will be rejected.
-->

People who opened gate 2.

**To add yourself:** open a pull request appending a row to the table below, with a
valid proof. See [the puzzle page](https://llmspace.github.io/theta-auth/) for how the
proof is generated. Merging happens automatically once your PR verifies.

| # | who | method | date | proof |
|---|-----|--------|------|-------|
| — | *nobody yet* | | | |
|  | llmspace | bisection (200 iterations) | 2026-09-07 | SnX9OVnjLmOwAE0Mpf7GADYgpZs4wS+c0cSlpF6nVM51/nfZJJpBUo4rAq258qsv/NXc8xKUTlWJPQ3PTRuUBQ== |

---

### Notes

Gate 1 (six decimals) is reachable by hand on the calculators and only ever returns a
hint. Gate 2 (twelve decimals) needs real root-finding.

If you're reading this hoping to find the answer: it isn't here, and it isn't anywhere
else in either repository. The payloads are AES-256-GCM and the keys derive from the
solution via PBKDF2-SHA256 at 600,000 iterations. Nothing is stored, nothing is checked
against a server, and there is no server.
