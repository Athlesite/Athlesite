// Every check in one go: the Node checks, then every drive.js test (headless Chrome) one after the
// other, each on its own port, at the sizes it's meant for. One line per test, then a total.
//   node tools/run-all.js            everything (about 35 minutes; the spacing and a11y sweeps are the long ones)
//   node tools/run-all.js --quick    skips the long sweeps (spacing, a11y over every palette): ~15 minutes
//   node tools/run-all.js --only=studio-start,homepage-s2
// Exit code 0 = all passed. Each test's full output is kept in <tmp>/athlesite-run-all/<name>.log.
// Opening/landing timing checks (opening-landing, number-landing, perf-*) aren't here: they need a
// quiet machine and a person reading the numbers (tools/README.md).
const { spawn, execSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const TOOLS = __dirname, ROOT = path.resolve(TOOLS, '..');
const url = (p) => 'file:///' + path.resolve(ROOT, p).replace(/\\/g, '/');
const SRC = path.resolve(ROOT, 'src').replace(/\\/g, '/');
const WORK = path.join(os.tmpdir(), 'athlesite-run-all');
const PHOTOS = path.join(WORK, 'photos'), OUT = path.join(WORK, 'out');
const args = process.argv.slice(2), quick = args.includes('--quick');
const only = ((args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '').split(',').filter(Boolean);
const DESK = [1440, 900], PHONE = [390, 844];

// [name, kind, how to run, how to read the result, sizes, slow?, timeout minutes]
const node = (script, ok) => ({ kind: 'node', args: [path.join(TOOLS, script), SRC], ok });
const drive = (steps, page, opts = {}) => ({ kind: 'drive', steps, page, env: opts.env || {}, ok: opts.ok || /PROBLEMS none/ });
const TESTS = [
  ['check-freedom', node('check-freedom.js', /problems: 0 \[\]/)],
  ['check-links', node('check-links.js', /problems: 0 \[\]/)],
  ['check-mirror', node('check-mirror.js', /problems: 0 \[\]/)],
  ['studio-rapid', drive('studio-rapid.js', 'studio.html'), [DESK]], // desktop-only by design
  ['studio-content', drive('studio-content.js', 'studio.html'), [DESK]], // desktop-only by design
  ['studio-photos', drive('studio-photos.js', 'studio.html', { env: { PHOTOS } }), [DESK]],
  ['studio-start', drive('studio-start.js', 'studio.html', { env: { PHOTOS, OUT } }), [DESK, PHONE]],
  ['studio-results', drive('studio-results.js', 'studio.html'), [DESK, PHONE]],
  ['studio-focus', drive('studio-focus.js', 'studio.html'), [DESK, PHONE]],
  ['studio-picks', drive('studio-picks.js', 'studio.html'), [DESK, PHONE]],
  ['studio-keys', drive('studio-keys.js', 'studio.html'), [PHONE]],
  ['studio-styles', drive('studio-styles.js', 'studio.html'), [DESK, PHONE]], // phones only: the on-screen keyboard
  ['new-athlete', drive('new-athlete.js', 'studio.html', { env: { PHOTOS, OUT } }), [DESK, PHONE]],
  ['homepage-s2', drive('homepage-s2.js', '../homepage-v2/index.html'), [DESK, PHONE]],
  ['homepage-s3', drive('homepage-s3.js', '../homepage-v2/index.html'), [DESK, PHONE]],
  ['homepage-cta', drive('homepage-cta.js', '../homepage-v2/index.html'), [DESK, PHONE]],
  ['nav-overlap', drive('nav-overlap.js', 'site.html', { ok: /see-through nav: 0/ }), [DESK, PHONE]],
  ['giant-clearance', drive('giant-clearance.js', 'site.html', { ok: /\): 0\b/ }), [PHONE]],
  ['a11y-studio', drive('a11y-audit.js', 'studio.html?ex=jordan-bell', { env: { MODE: 'page' } }), [DESK, PHONE]],
  ['a11y-site', drive('a11y-audit.js', 'site.html', { env: { MODE: 'site' } }), [DESK, PHONE], true, 30],
  // Spacing: the one known real-text note (Spotlight's 14px gap, HANDOFF §16) is allowed.
  ['spacing', drive('spacing-run.js', 'tools/spacing.html', { env: { DEVICES: 'desktop,phone,small' }, ok: /\((0|1) on real text\)/ }), [[1500, 1000]], true, 25],
];

/** Runs a command; kills its whole process tree (Chrome included) if it outlives the timeout. */
function run(cmd, cmdArgs, env, minutes, logFile) {
  return new Promise((resolve) => {
    const child = spawn(cmd, cmdArgs, { env: { ...process.env, ...env }, cwd: ROOT, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => {
      out += `\n[run-all] TIMEOUT after ${minutes} min, stopped`;
      try { if (process.platform === 'win32') execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore' }); else process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }, minutes * 60000);
    child.on('close', (code) => { clearTimeout(timer); fs.writeFileSync(logFile, out); resolve({ out, code }); });
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let port = 9600;
  // Test photos for the upload tests (made once by Chrome itself).
  if (!fs.existsSync(path.join(PHOTOS, 'big.jpg'))) {
    await run('node', [path.join(TOOLS, 'drive.js'), path.join(TOOLS, 'make-test-photos.js'), 'about:blank', WORK, '800', '600', String(port++)], { OUT_DIR: PHOTOS }, 3, path.join(WORK, 'make-test-photos.log'));
  }
  const rows = [];
  const t0 = Date.now();
  for (const [name, spec, sizes = [null], slow = false, minutes = 12] of TESTS) {
    if (only.length && !only.includes(name)) continue;
    if (quick && slow) { rows.push(['SKIP', name, '', '--quick']); console.log(`SKIP  ${name}  (--quick)`); continue; }
    for (const size of sizes) {
      const label = size ? `${size[0]}×${size[1]}` : '';
      const log = path.join(WORK, `${name}${size ? '-' + size[0] : ''}.log`);
      const t = Date.now();
      const { out } = spec.kind === 'node'
        ? await run('node', spec.args, {}, minutes, log)
        : await run('node', [path.join(TOOLS, 'drive.js'), path.join(TOOLS, spec.steps), url(spec.page), path.join(WORK, 'shots'), String(size[0]), String(size[1]), String(port++)],
          { ...spec.env, ...(name === 'nav-overlap' && size === DESK ? { SCROLLBARS: '1' } : {}), ...(name === 'spacing' ? { OUT: path.join(WORK, 'spacing.json') } : {}) }, minutes, log);
      const console_ = /--- console\/exceptions: none/.test(out) || spec.kind === 'node';
      const ok = spec.ok.test(out) && console_ && !/STEP ERROR|TIMEOUT/.test(out);
      const checks = (out.match(/^(ok|FAIL) /gm) || []).length;
      const why = ok ? (checks ? `${checks} checks` : (out.match(/problems[^\n]*|see-through nav: \d+|on real text\)/i) || [''])[0].slice(0, 60))
        : ((out.match(/^FAIL [^\n]*/m) || out.match(/PROBLEMS [^\n]*|STEP ERROR[^\n]*|TIMEOUT[^\n]*|EXCEPTION[^\n]*|ERROR [^\n]*/) || ['no pass line; see ' + log])[0]).slice(0, 140);
      const line = [ok ? 'PASS' : 'FAIL', name, label, `${Math.round((Date.now() - t) / 1000)}s`, why];
      rows.push(line);
      console.log(`${line[0]}  ${name}${label ? ' [' + label + ']' : ''}  ${line[3]}  ${why}`);
    }
  }
  const failed = rows.filter((r) => r[0] === 'FAIL');
  console.log(`\n${rows.filter((r) => r[0] === 'PASS').length} passed, ${failed.length} failed${rows.some((r) => r[0] === 'SKIP') ? ', some skipped (--quick)' : ''} in ${Math.round((Date.now() - t0) / 60000)} min. Logs: ${WORK}`);
  process.exit(failed.length ? 1 : 0);
})();
