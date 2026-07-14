import fs from 'fs';
import path from 'path';

const src = path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs');
const destDir = path.resolve('public');
const dest = path.join(destDir, 'pdf.worker.mjs');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(src, dest);
console.log('✅ pdf.worker.mjs copied to public directory successfully!');
