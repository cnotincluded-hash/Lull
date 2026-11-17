// Downloads Ghostery's prebuilt ads-and-tracking lists and saves the compiled engine to engine/engine.bin,
// which electron-builder ships with the app. Run by the GitHub workflow before packaging.
const fs = require('fs');
const path = require('path');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

(async () => {
  const e = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch);
  const out = path.join(__dirname, '..', 'engine');
  fs.mkdirSync(out, { recursive: true });
  const buf = Buffer.from(e.serialize());
  fs.writeFileSync(path.join(out, 'engine.bin'), buf);
  console.log('engine.bin', (buf.length / 1024 / 1024).toFixed(1), 'MB');
})().catch((err) => { console.error(err); process.exit(1); });
