import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/export-homepage-preview.mjs /absolute/path/preview.html');
const mime = { '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const embed = (file) => `data:${mime[path.extname(file)] || 'application/octet-stream'};base64,${fs.readFileSync(file).toString('base64')}`;
let html = fs.readFileSync(path.join(root, '.next/server/app/index.html'), 'utf8');
html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
html = html.replace(/<link\b[^>]*>/g, tag => {
  const href = tag.match(/href="([^"]+)"/);
  if (!tag.includes('rel="stylesheet"') || !href) return '';
  let css = fs.readFileSync(path.join(root, '.next', href[1].replace('/_next/', '')), 'utf8');
  css = css.replace(/url\((?:"|')?([^)'" ]+)(?:"|')?\)/g, (full, url) => {
    const resolved = url.startsWith('/_next/') ? path.join(root, '.next', url.replace('/_next/', '')) : path.resolve(root, '.next', path.dirname(href[1].replace('/_next/', '')), url);
    return fs.existsSync(resolved) ? `url("${embed(resolved)}")` : full;
  });
  return `<style>${css}</style>`;
});
html = html.replace(/<img\b[^>]*>/g, tag => {
  const raw = tag.match(/src="([^"]+)"/)?.[1]?.replaceAll('&amp;', '&');
  if (!raw) return tag;
  let source = raw;
  if (source.startsWith('/_next/image')) source = new URL('http://preview.invalid' + source).searchParams.get('url');
  if (!source?.startsWith('/')) return tag;
  const file = path.join(root, 'public', source);
  if (!fs.existsSync(file)) return tag;
  return tag.replace(/\s(?:srcset|sizes|loading)="[^"]*"/gi, '').replace(/src="[^"]*"/, `src="${embed(file)}"`);
});
html = html.replace(/href="\/#/g, 'href="#');
html = html.replace(/href="\/(?!#)[^"]*"/g, 'aria-disabled="true" title="Open the running app to use this link"');
html = html.replace(/<button\b/g, '<button disabled title="Mobile navigation requires the running app"');
html = html.replace(/(<body[^>]*>)/, '$1<aside style="padding:10px 20px;background:#162034;color:#cbd5e1;font:11px/1.6 Arial,sans-serif;text-align:center">ATHLESITE / DESIGN REVIEW — Scroll to see the section transitions. Features and FAQ expand. Signup and mobile navigation require the running app. Browser visual QA pending.</aside>');
const motionSource = fs.readFileSync(path.join(root, 'src/components/marketing/editorial/motion.ts'), 'utf8');
const motion = ts.transpileModule(motionSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ES2020 } }).outputText.replace('export function', 'function');
html = html.replace('</body>', '<script>' + motion + '\nstartHomepageMotion(document.querySelector("[data-home-root]"));</script></body>');
if (html.includes('/_next/')) throw new Error('Unresolved Next asset in export');
fs.writeFileSync(output, html);
console.log('Prepared self-contained animated review with embedded photos, fonts, CSS and shared motion.');
