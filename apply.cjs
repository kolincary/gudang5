const fs = require('fs');

let fileContent = fs.readFileSync('StokLantai3_stitched.tsx', 'utf8');
const edits = JSON.parse(fs.readFileSync('missing_edits.json', 'utf8'));

const targetSteps = [1709, 1829, 2021, 2024, 2027, 2037, 2100];

for (let step of targetSteps) {
    const entry = edits[step];
    if (!entry) {
        console.log('No entry for step', step);
        continue;
    }
    
    entry.tool_calls.forEach(call => {
        if ((call.name === 'replace_file_content' || call.name === 'multi_replace_file_content') && call.args.TargetFile && call.args.TargetFile.includes('StokLantai3.tsx')) {
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
                    console.log('Target not found at step', step, 'line', sl);
                }
            }
            if(successAll) {
                fileContent = newLines.join('\n');
                console.log('Applied at step', step);
            }
        }
    });
}

fs.writeFileSync('src/components/StokLantai3.tsx', fileContent);
console.log('Final length:', fileContent.split('\n').length);
