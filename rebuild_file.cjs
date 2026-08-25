const fs = require('fs');
const readline = require('readline');

let fileContent = fs.readFileSync('StokLantai3_base.tsx', 'utf8');
const edits = [];

const rl = readline.createInterface({
    input: fs.createReadStream('C:/Users/jgilb/.gemini/antigravity-ide/brain/948048ab-a0ba-4f8e-94b1-f20497b289a6/.system_generated/logs/transcript.jsonl')
});

rl.on('line', (line) => {
    if (line.includes('replace_file_content') && line.includes('StokLantai3.tsx')) {
        try {
            const entry = JSON.parse(line);
            if (entry.type === 'PLANNER_RESPONSE' && entry.tool_calls) {
                entry.tool_calls.forEach(call => {
                    if ((call.name === 'replace_file_content' || call.name === 'multi_replace_file_content') && call.args.TargetFile && call.args.TargetFile.includes('StokLantai3.tsx')) {
                        edits.push({
                            step: entry.step_index,
                            call: call
                        });
                    }
                });
            }
        } catch(e) {}
    }
});

rl.on('close', () => {
    edits.sort((a,b) => a.step - b.step);
    console.log('Found', edits.length, 'edits');
    
    for (const edit of edits) {
        if (edit.step >= 2123) break; // Stop before user complaints
        const call = edit.call;
        const chunks = call.name === 'multi_replace_file_content' 
            ? (typeof call.args.ReplacementChunks === 'string' ? JSON.parse(call.args.ReplacementChunks) : call.args.ReplacementChunks)
            : [call.args];
        
        chunks.sort((a,b) => b.StartLine - a.StartLine);
        let newLines = fileContent.split('\n');
        let successAll = true;
        for (const chunk of chunks) {
            const sl = chunk.StartLine - 1;
            const el = chunk.EndLine;
            const target = chunk.TargetContent;
            const repl = chunk.ReplacementContent;
            const section = newLines.slice(sl, el).join('\n');
            if (section.includes(target)) {
                const newSection = section.replace(target, repl);
                newLines.splice(sl, el - sl, ...newSection.split('\n'));
            } else {
                successAll = false;
                console.log('Target not found at step', edit.step, 'line', sl);
            }
        }
        if(successAll) {
            fileContent = newLines.join('\n');
            console.log('Applied at step', edit.step);
        }
    }
    fs.writeFileSync('src/components/StokLantai3.tsx', fileContent);
    console.log('Final length:', fileContent.split('\n').length);
});
