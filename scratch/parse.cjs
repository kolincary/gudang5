const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch/full_transfer_analysis.cjs', 'utf8').split('console.log(JSON.stringify(results, null, 2));')[0] || '[]');
