const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jgilb/.gemini/antigravity-ide/brain/d451bf4a-6db0-4901-8cf8-1cd04e60777c/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (line.includes('"step_index":2381')) {
    try {
      const obj = JSON.parse(line);
      console.log(obj.content);
    } catch (e) {}
  }
});
