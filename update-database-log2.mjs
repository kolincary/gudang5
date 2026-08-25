import fs from 'fs';

const filePath = 'src/components/DatabaseLog.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const oldEffect = `  useEffect(() => {
    // Auto-grant access to Dev Mode users
    const isDevUser = userEmail?.toLowerCase().includes('devmode');
    if (isDevUser) {
      setIsAccessGranted(true);
      setIsPinModalOpen(false);
    }
  }, [userEmail]);`;

const newEffect = `  useEffect(() => {
    const checkBypass = async () => {
      if (!userEmail) return;
      
      const isDevUser = userEmail.toLowerCase().includes('devmode');
      if (isDevUser) {
        setIsAccessGranted(true);
        setIsPinModalOpen(false);
        return;
      }
      
      try {
        const { data } = await supabase
          .from('app_users')
          .select('allowed_menus')
          .eq('email', userEmail)
          .single();
          
        if (data?.allowed_menus?.includes('bypass_pin_log')) {
          setIsAccessGranted(true);
          setIsPinModalOpen(false);
        }
      } catch (err) {
        console.error('Failed to check bypass_pin_log:', err);
      }
    };
    checkBypass();
  }, [userEmail]);`;

if (content.includes(oldEffect)) {
  content = content.replace(oldEffect, newEffect);
  fs.writeFileSync(filePath, content);
  console.log('DatabaseLog updated successfully');
} else {
  console.log('Old effect not found');
}
