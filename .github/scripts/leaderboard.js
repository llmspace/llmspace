// Rebuilds the Solvers block in README.md from the table in SOLVERS.md.
//
// Invoked by .github/workflows/leaderboard.yml on every push that touches
// SOLVERS.md. No dependencies, no network, no manual step.
//
// Contract: README.md contains a region delimited by
//   <!-- LEADERBOARD:START -->  ...  <!-- LEADERBOARD:END -->
// Everything between those markers is replaced. Everything else is untouched,
// so the rest of the README — including the calculator art — is safe.

const fs = require('fs');

const START = '<!-- LEADERBOARD:START -->';
const END = '<!-- LEADERBOARD:END -->';
const MAX_SHOWN = 10;

const readme = fs.readFileSync('README.md', 'utf8');
const solvers = fs.readFileSync('SOLVERS.md', 'utf8');

// ---- parse the pipe table out of SOLVERS.md ---------------------------------
// Tolerant by design: a solver's pull request is hand-written, and a stray space
// or a missing trailing pipe must not break the profile page.

// Every cell here originates in a pull request from a stranger, and the result is
// written straight back into README.md. An unsanitised cell containing
// "<!-- LEADERBOARD:END -->" would land inside the managed block, and the next run's
// indexOf(END) would match the injected marker instead of the real one and eat the
// rest of the file. So: no angle brackets, no comment delimiters, no line breaks,
// and a length cap.
function clean(value) {
    return String(value || '')
        .replace(/<!--|-->/g, '')
        .replace(/[<>]/g, '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
}

function parseRows(md) {
    const rows = [];
    for (const raw of md.split('\n')) {
        const line = raw.trim();
        if (!line.startsWith('|')) continue;

        const cells = line.split('|').slice(1, -1).map(c => c.trim());
        if (cells.length < 2) continue;

        // Skip the header and its separator row.
        if (/^-{1,}$/.test(cells[0].replace(/[:\s-]/g, '-')) && cells.every(c => /^:?-+:?$/.test(c))) continue;
        if (/^#$/.test(cells[0]) && /^who$/i.test(cells[1] || '')) continue;

        const [num, who, method, date] = cells.map(clean);
        // The placeholder row shipped with an empty board.
        if (/nobody yet/i.test(who || '')) continue;
        if (!who || who === '—' || who === '-') continue;

        rows.push({ num, who, method: method || '', date: date || '' });
    }
    return rows;
}

const rows = parseRows(solvers);

// ---- render ------------------------------------------------------------------

const esc = s => s.replace(/\|/g, '\\|');

let block;
if (rows.length === 0) {
    block = [
        '### Solvers',
        '',
        '*Nobody has opened gate 2 yet.*',
    ].join('\n');
} else {
    const shown = rows.slice(0, MAX_SHOWN);
    const lines = [
        `### Solvers &nbsp;·&nbsp; ${rows.length}`,
        '',
        '| # | who | method | date |',
        '|---|-----|--------|------|',
        ...shown.map((r, i) => `| ${r.num || i + 1} | ${esc(r.who)} | ${esc(r.method)} | ${esc(r.date)} |`),
    ];
    if (rows.length > shown.length) {
        lines.push('', `<sub>and ${rows.length - shown.length} more in [SOLVERS.md](SOLVERS.md)</sub>`);
    }
    block = lines.join('\n');
}

// ---- splice ------------------------------------------------------------------

const s = readme.indexOf(START);
const e = readme.indexOf(END);
if (s === -1 || e === -1 || e < s) {
    console.error('leaderboard markers missing or out of order in README.md — refusing to write');
    process.exit(1);
}

const next = readme.slice(0, s + START.length) + '\n' + block + '\n' + readme.slice(e);

if (next === readme) {
    console.log(`leaderboard unchanged (${rows.length} solver${rows.length === 1 ? '' : 's'})`);
} else {
    fs.writeFileSync('README.md', next);
    console.log(`leaderboard updated — ${rows.length} solver${rows.length === 1 ? '' : 's'}`);
}
