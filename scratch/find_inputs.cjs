const fs = require('fs');

const content = fs.readFileSync('src/components/Dashboard.tsx', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('<input')) {
    console.log(`Line ${idx + 1}: ${l}`);
  }
});
