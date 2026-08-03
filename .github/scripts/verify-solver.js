// Verifies a solver's leaderboard pull request against the theta-auth proof
// contract. Node stdlib only — no dependencies.
//
// Usage: node verify-solver.js <path-to-input.json>
//
// Input JSON shape:
//   {
//     number: <pr number>,
//     authorLogin: "<pr author's GitHub login>",
//     createdAt: "<ISO 8601 timestamp>",
//     files: [ { filename, status, additions, deletions, patch } ],
//     solversContent: "<current main-branch SOLVERS.md text>"
//   }
//
// Output: a single JSON object on stdout, {verdict: "pass"|"fail", reason: "..."},
// and process.exit(0) on pass / exit(1) on fail.
//
// The reason string is OUR text, written for public posting on the PR — it must
// never echo back anything the submitter wrote (usernames, method text, row
// content, etc.).

'use strict';

const fs = require('fs');
const crypto = require('crypto');

// ---- constants -----------------------------------------------------------------

// base64 of the raw 32-byte Ed25519 public key used to verify solver proofs.
const PUBLIC_KEY_B64 = 'KZ2Mhj2h6tlcGjEwde/2CYmOzqEXJ49qzWp7kJJIkh4=';

// SPKI DER wrapper for a raw Ed25519 public key: fixed 12-byte ASN.1 prefix
// followed by the 32 raw key bytes.
const SPKI_PREFIX_HEX = '302a300506032b6570032100';

const ROW_RE = /^\|\s*\d{0,4}\s*\|\s*([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\s*\|\s*([A-Za-z0-9 .,+/()'"_:-]{1,60}?)\s*\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([A-Za-z0-9+/]{86}==)\s*\|\s*$/;

const MESSAGE_PREFIX = 'theta-solver-v1|';

// ---- helpers --------------------------------------------------------------------

function fail(reason) {
    process.stdout.write(JSON.stringify({ verdict: 'fail', reason }) + '\n');
    process.exit(1);
}

function pass(reason) {
    process.stdout.write(JSON.stringify({ verdict: 'pass', reason }) + '\n');
    process.exit(0);
}

function countPatchLines(patch) {
    // Returns { added, deleted } counts from a unified-diff patch body, ignoring
    // the "@@ ... @@" hunk headers and any "---"/"+++" file-header lines.
    let added = 0;
    let deleted = 0;
    if (typeof patch !== 'string') return { added: NaN, deleted: NaN };
    for (const line of patch.split('\n')) {
        if (line.startsWith('+++') || line.startsWith('---')) continue;
        if (line.startsWith('+')) added++;
        else if (line.startsWith('-')) deleted++;
    }
    return { added, deleted };
}

function extractAddedLine(patch) {
    for (const line of patch.split('\n')) {
        if (line.startsWith('+++')) continue;
        if (line.startsWith('+')) return line.slice(1);
    }
    return null;
}

function existingUsernames(solversContent) {
    const names = new Set();
    for (const raw of String(solversContent || '').split('\n')) {
        const line = raw.trim();
        if (!line.startsWith('|')) continue;
        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length < 2) continue;
        // Skip header row.
        if (/^#$/.test(cells[0]) && /^who$/i.test(cells[1] || '')) continue;
        // Skip separator row.
        if (cells.every(c => /^:?-+:?$/.test(c))) continue;
        const who = cells[1];
        if (!who) continue;
        if (/nobody yet/i.test(who)) continue;
        names.add(who.toLowerCase());
    }
    return names;
}

function daysBetweenUTC(dateOnlyStr, isoTimestamp) {
    const rowDate = new Date(dateOnlyStr + 'T00:00:00Z');
    const created = new Date(isoTimestamp);
    const createdDayOnly = new Date(Date.UTC(
        created.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate(),
    ));
    const diffMs = Math.abs(rowDate.getTime() - createdDayOnly.getTime());
    return diffMs / (24 * 60 * 60 * 1000);
}

// ---- main -------------------------------------------------------------------

function main() {
    const inputPath = process.argv[2];
    if (!inputPath) {
        fail('Internal error: missing verification input.');
        return;
    }

    let input;
    try {
        input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    } catch {
        fail('Internal error: could not read verification input.');
        return;
    }

    const { authorLogin, createdAt, files, solversContent } = input;
    const fileList = Array.isArray(files) ? files : [];

    // Check 0: PRs that don't touch SOLVERS.md are none of our business — stay
    // silent so ordinary repository PRs aren't commented on or closed by the bot.
    if (!fileList.some(f => f && f.filename === 'SOLVERS.md')) {
        process.stdout.write(JSON.stringify({ verdict: 'skip', reason: 'Not a solver PR.' }) + '\n');
        process.exit(0);
    }

    // Check 1: exactly one changed file.
    if (fileList.length !== 1) {
        fail('This PR must change exactly one file: SOLVERS.md.');
        return;
    }

    const file = fileList[0];

    // Check 2: it is SOLVERS.md with status "modified".
    if (file.filename !== 'SOLVERS.md' || file.status !== 'modified') {
        fail('This PR must modify SOLVERS.md only, with no renames, adds, or deletes.');
        return;
    }

    // Check 3: patch has exactly 1 added line and 0 deleted lines.
    const { added, deleted } = countPatchLines(file.patch);
    if (added !== 1 || deleted !== 0) {
        fail('This PR must add exactly one line to SOLVERS.md and remove none.');
        return;
    }

    const addedLine = extractAddedLine(file.patch);

    // Check 4: the added line matches the strict row grammar.
    const match = addedLine ? ROW_RE.exec(addedLine) : null;
    if (!match) {
        fail('The added line does not match the required leaderboard row format.');
        return;
    }
    const [, rowUsername, rowMethod, rowDate, rowSignature] = match;
    if (rowMethod.includes('--')) {
        fail('The added line does not match the required leaderboard row format.');
        return;
    }

    // Check 5: row username equals authorLogin case-insensitively.
    if (typeof authorLogin !== 'string' || rowUsername.toLowerCase() !== authorLogin.toLowerCase()) {
        fail('The username in the added row must match the PR author.');
        return;
    }

    // Check 6: row date within 48 hours of createdAt (day granularity, +/-2 days).
    if (!createdAt || daysBetweenUTC(rowDate, createdAt) > 2) {
        fail('The date in the added row is not close enough to when this PR was opened.');
        return;
    }

    // Check 7: username not already present in solversContent.
    if (existingUsernames(solversContent).has(rowUsername.toLowerCase())) {
        fail('This username already has an entry on the leaderboard.');
        return;
    }

    // Check 8: Ed25519 signature verifies.
    let sigValid = false;
    try {
        const message = Buffer.from(MESSAGE_PREFIX + rowUsername.toLowerCase(), 'utf8');
        const signature = Buffer.from(rowSignature, 'base64');
        const rawKey = Buffer.from(PUBLIC_KEY_B64, 'base64');
        const spkiDer = Buffer.concat([Buffer.from(SPKI_PREFIX_HEX, 'hex'), rawKey]);
        const publicKey = crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
        sigValid = crypto.verify(null, message, publicKey, signature);
    } catch {
        sigValid = false;
    }
    if (!sigValid) {
        fail('The proof signature in the added row does not verify.');
        return;
    }

    pass('Verified solver proof.');
}

main();
