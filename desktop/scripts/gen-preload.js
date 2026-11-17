// Builds preload/page.js: the page preload with the YouTube script (assets/yt.js) inlined as a
// function, because preloads run sandboxed and can't read files.
const fs = require('fs');
const path = require('path');
const r = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const yt = r('assets/yt.js');
const out = r('preload/src/page-head.js') + '\n// assets/yt.js\nfunction lullYouTube() {\n' + yt + '\n}\n' + r('preload/src/page-tail.js');
fs.writeFileSync(path.join(__dirname, '..', 'preload', 'page.js'), out);
console.log('preload/page.js', out.length, 'bytes');
