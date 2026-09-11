const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: fs.createReadStream('C:/Users/jgilb/.gemini/antigravity-ide/brain/d451bf4a-6db0-4901-8cf8-1cd04e60777c/.system_generated/logs/transcript_full.jsonl'),
  crlfDelay: Infinity
});

rl.on('line', (line) => {
  if (line.includes('"step_index":2381') || line.includes('"step_index":2380') || line.includes('"step_index":2379')) {
    try {
      const obj = JSON.parse(line);
      console.log(`=== Step ${obj.step_index} (${obj.type}) ===`);
      console.log(obj.content ? obj.content.substring(0, 500) : (obj.tool_calls ? JSON.stringify(obj.tool_calls) : ''));
    } catch (e) {}
  }
});
