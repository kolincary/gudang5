import fs from 'fs';

const filePath = 'src/components/DataGudang.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Add sortConfig to DataGudang
content = content.replace(
  "  // State management\n  const [searchTerm, setSearchTerm] = useState('');",
  "  // State management\n  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });\n  const [searchTerm, setSearchTerm] = useState('');"
);

fs.writeFileSync(filePath, content);
console.log('Fixed sortConfig position properly');
