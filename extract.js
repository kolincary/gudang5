const fs = require('fs');
const readline = require('readline');
const targetSteps = [1709, 1829, 2021, 2024, 2027, 2037, 2100];
const edits = {};
const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jgilb/.gemini/antigravity-ide/brain/948048ab-a0ba-4f8e-94b1-f20497b289a6/.system_generated/logs/transcript.jsonl')
});
rl.on('line', (line) => {
    for (let step of targetSteps) {
        if (line.includes('"step_index":' + step + ',') || line.includes('"step_index":' + step + '}')) {
            try {
                const entry = JSON.parse(line);
                if (entry.step_index === step && entry.type === 'PLANNER_RESPONSE' && entry.tool_calls) {
                    edits[step] = entry;
                }
            } catch(e) {}
        }
    }
});
rl.on('close', () => {
    fs.writeFileSync('missing_edits.json', JSON.stringify(edits, null, 2));
    console.log('Saved missing_edits.json');
});
