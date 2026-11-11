// Steps for drive.js (any page): writes test photos for the upload tests into OUT_DIR:
// big.jpg (2400×1600, a "subject" off to the right), small.jpg (800×600), tall.jpg (1200×1800).
const fs = require('fs'), path = require('path');
module.exports = async (t) => {
  const dir = process.env.OUT_DIR;
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, w, h, type] of [['big.jpg', 2400, 1600, 'image/jpeg'], ['small.jpg', 800, 600, 'image/jpeg'], ['tall.jpg', 1200, 1800, 'image/jpeg']]) {
    const data = await t.ev(`
      const c = document.createElement('canvas'); c.width = ${w}; c.height = ${h};
      const g = c.getContext('2d');
      const grd = g.createLinearGradient(0, 0, ${w}, ${h}); grd.addColorStop(0, '#1d2a44'); grd.addColorStop(1, '#c2733a');
      g.fillStyle = grd; g.fillRect(0, 0, ${w}, ${h});
      g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(${w} * 0.72, ${h} * 0.38, ${Math.min(w, h)} * 0.16, 0, 7); g.fill();
      g.fillStyle = '#0b0b0f'; g.font = 'bold ${Math.round(Math.min(w, h) * 0.12)}px sans-serif'; g.fillText('${name}', ${w} * 0.06, ${h} * 0.9);
      return c.toDataURL('${type}', 0.9);`);
    fs.writeFileSync(path.join(dir, name), Buffer.from(data.split(',')[1], 'base64'));
    t.log('wrote', name);
  }
};
