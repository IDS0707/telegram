/**
 * postinstall patch: react-native-screens package.json dagi
 * "react-native" field TypeScript src/index ga ishora qiladi.
 * Metro uni compile qila olmaydi, shuning uchun compiled
 * lib/commonjs/index ga o'zgartiramiz.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-screens',
  'package.json'
);

if (!fs.existsSync(pkgPath)) {
  console.log('[patch] react-native-screens topilmadi, skip');
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const current = pkg['react-native'];

if (current === 'lib/commonjs/index') {
  console.log('[patch] react-native-screens allaqachon patch qilingan, skip');
  process.exit(0);
}

const compiled = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-screens',
  'lib',
  'commonjs',
  'index.js'
);

if (!fs.existsSync(compiled)) {
  console.warn('[patch] lib/commonjs/index.js topilmadi, patch qilinmadi');
  process.exit(0);
}

pkg['react-native'] = 'lib/commonjs/index';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
console.log(`[patch] react-native-screens patched: "${current}" → "lib/commonjs/index"`);
