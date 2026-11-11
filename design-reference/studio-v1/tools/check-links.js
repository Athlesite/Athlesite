// Recruiting profiles and NIL contact: hostile input must never become a link, and a link can only
// carry a trusted site's name if it really goes to that site.  usage: node check-links.js <studio-v1/src>
global.window = {};
const dir = process.argv[2];
for (const f of ['sports.js', 'profile.js', 'color.js', 'render.js', 'looks/cinematic.js', 'looks/editorial.js', 'looks/highlight.js', 'looks/portrait.js', 'looks/prospect.js', 'athletes.js']) require(dir + '/' + f);
const A = window.Athlesite;
const problems = [];

const p = structuredClone(A.ATHLETES.jordan);
p.data.profileLinks = [
  { url: 'javascript:alert(1)' },
  { url: 'data:text/html,<script>alert(1)</script>' },
  { url: 'https://on3.com.evil.example/jordan' },     // look-alike: must show its real domain
  { url: 'https://evil-247sports.com/x' },             // look-alike
  { url: 'https://www.on3.com/db/real/' },             // real: "On3"
  { url: 'https://n.rivals.com/content/prospects/x' }, // real subdomain: "Rivals"
  { url: '"><img src=x onerror=alert(1)>' },
  null,
];
p.data.nilContact = 'javascript:alert(1)';
p.data.recruitingContact = '';
p.data.nilInterests = '<script>alert(1)</script>';
p.data.nilOffers = ['<b>bold</b>'];
p.data.nilAudience = [{ label: '<i>x</i>', value: '"><svg onload=alert(1)>' }];
const html = A.renderSite(A.normalizeProfile(p), { intro: 'never' });

const profileBlock = (html.match(/<div class="profiles">[\s\S]*?<\/ul>/) || [''])[0];
const labels = [...profileBlock.matchAll(/rel="noopener">([^<]+)</g)].map((m) => m[1]);
console.log('profile labels:', labels.join(' | '));
if (/javascript:|data:text/i.test(html)) problems.push('a script link got through');
if (/<script>alert|<img src=x|<svg onload|<b>bold/i.test(html)) problems.push('raw HTML got through');
if (labels.filter((l) => l === 'On3').length !== 1) problems.push('look-alike shown as On3');
if (labels.includes('247Sports')) problems.push('look-alike shown as 247Sports');
if (!labels.includes('on3.com.evil.example') || !labels.includes('evil-247sports.com')) problems.push('look-alike domains not shown plainly');
if (!labels.includes('Rivals')) problems.push('rivals subdomain not recognized');
// A NIL contact that isn't an email or a web link gives no button at all.
const nilBlock = (html.match(/<section class="sec s-nil"[\s\S]*?<\/section>/) || [''])[0];
if (/nil-cta/.test(nilBlock)) problems.push('NIL button rendered for a bad contact');
// NIL hidden when not open
const q = structuredClone(A.ATHLETES.jordan); q.data.nilOpen = false;
if (A.renderSite(q, { intro: 'never' }).includes('id="nil"')) problems.push('NIL shown while closed');
// Old saved orders without NIL put it before the details
const old = A.normalizeProfile({ data: A.ATHLETES.jordan.data, design: { order: ['film', 'stats', 'story', 'custom', 'milestones', 'gallery', 'details'] } });
console.log('old order upgraded:', old.design.order.join(','));
if (old.design.order.indexOf('nil') !== old.design.order.indexOf('details') - 1) problems.push('old order: NIL not before details');
console.log('problems:', problems.length, problems);
