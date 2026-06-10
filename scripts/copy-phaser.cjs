const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'phaser', 'dist', 'phaser.min.js');
const destDir = path.join(__dirname, '..', 'vendor');
const dest = path.join(destDir, 'phaser.min.js');

if (!fs.existsSync(src)) {
  console.warn('copy-phaser: phaser no instalado aún; se copiará tras npm install.');
  process.exit(0);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Phaser copiado a vendor/phaser.min.js');
