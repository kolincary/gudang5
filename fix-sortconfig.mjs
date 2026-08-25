import fs from 'fs';

const filePath = 'src/components/DataGudang.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove sortConfig from FilterPopover
content = content.replace(
  "const [searchTerm, setSearchTerm] = useState('');\n  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });",
  "const [searchTerm, setSearchTerm] = useState('');"
);

// 2. Add sortConfig to DataGudang
content = content.replace(
  "export function DataGudang() {\n  const { user, role } = useAuth();",
  "export function DataGudang() {\n  const { user, role } = useAuth();\n  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });"
);

fs.writeFileSync(filePath, content);
console.log('Fixed sortConfig position');
