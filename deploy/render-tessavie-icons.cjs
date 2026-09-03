// Run with sharp installed or exposed through NODE_PATH. SVG is the source.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const brand = path.resolve(__dirname, '../web/brand');
const svg = fs.readFileSync(path.join(brand, 'tessavie-mark.svg'));
(async () => {
  for (const size of [32, 180, 192, 512]) {
    await sharp(svg).resize(size, size).png().toFile(path.join(brand, `tessavie-${size}.png`));
  }
  const inset = await sharp(svg).resize(384, 384).png().toBuffer();
  await sharp({create: {width: 512, height: 512, channels: 4, background: '#202824'}})
    .composite([{input: inset, left: 64, top: 64}]).png().toFile(path.join(brand, 'tessavie-maskable-512.png'));
  console.log('Generated Tessavie icons');
})().catch(error => { console.error(error); process.exitCode = 1; });
