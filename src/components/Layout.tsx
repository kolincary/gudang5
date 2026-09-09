import React from 'react';
import logo from '../assets/logo.jpeg';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { APP_VERSION } from './AppUpdateListener';
import { DailyQuestOverlay } from './DailyQuestOverlay';
import { 
  navigationItems, 
  devNavigationItems, 
  masterDataItems, 
  monitoringItems, 
  additionalMenuItems 
} from '../lib/menuConfig';
import {
  LayoutDashboard,
  Package,
  PackageOpen,
  History,
  MapPin,
  Database,
  Menu,
  X,
  ChevronDown,
  Building2,
  Package2,
  Scale,
  Tag,
  ArrowRightLeft,
  Database as DatabaseIcon,
  PackageCheck,
  Building,
  Settings,
  Wrench,
  Bell,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FolderTree,
  ShieldAlert,
  QrCode,
  LogOut,
  Users,
  Activity
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

// Hook untuk mendeteksi devmode
const useDevMode = (userName?: string | null, userEmail?: string | null) => {
  const [isDevMode, setIsDevMode] = React.useState(() => {
    return localStorage.getItem('devmode') === 'true';
  });
  const [keySequence, setKeySequence] = React.useState('');
  const navigate = useNavigate();

  React.useEffect(() => {
    // Auto-enable for Dev Mode Admin
    if (userName?.toLowerCase().includes('dev mode') || userEmail?.toLowerCase().includes('devmode')) {
      if (localStorage.getItem('devmode') !== 'true') {
        localStorage.setItem('devmode', 'true');
        setIsDevMode(true);
      }
    }
  }, [userName, userEmail]);

  React.useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      if (event.key.length > 1) return;
      
      setKeySequence((prev) => {
        const newSequence = (prev + event.key.toLowerCase()).slice(-25);
        
        if (newSequence.endsWith('devmode')) {
          const newDevMode = !isDevMode;
          setIsDevMode(newDevMode);
          localStorage.setItem('devmode', newDevMode.toString());
          console.log(`Dev mode ${newDevMode ? 'enabled' : 'disabled'}`);
          return '';
        }

        if (newSequence.endsWith('opendatabaselogmenu@')) {
          navigate('/database-log', { state: { showHackerTerminal: true } });
          return '';
        }
        
        return newSequence;
      });
    };

    // Reset sequence after timeout
    const timeoutId = setTimeout(() => {
      setKeySequence('');
    }, 2000);

    window.addEventListener('keydown', handleKeyPress);

    return () => {
      window.removeEventListener('keydown', handleKeyPress);
      clearTimeout(timeoutId);
    };
  }, [keySequence, isDevMode]);

  return isDevMode;
};

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = React.useState(() => {
    return localStorage.getItem('sidebarCollapsed') === 'true';
  });
  const [masterDataOpen, setMasterDataOpen] = React.useState(false);
  const [monitoringOpen, setMonitoringOpen] = React.useState(false);
  const [devModeOpen, setDevModeOpen] = React.useState(false);
  const { userEmail, userName, userAvatar, userRole, userPermissions, signOut } = useAuth();
  const isDevMode = useDevMode(userName, userEmail);
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const hasAccess = (href: string) => {
    if (userRole === 'developer') return true;
    return userPermissions.includes(href);
  };

  const toggleDesktopSidebar = () => {
    const newState = !desktopSidebarCollapsed;
    setDesktopSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', newState.toString());
  };

  const isMasterDataActive = location.pathname.startsWith('/master-data');
  const isMonitoringActive = monitoringItems.some(item => item.href === location.pathname);
  const isDevModeActive = devNavigationItems.some(item => item.href === location.pathname);

  // Get current page name including dev items
  const getCurrentPageName = () => {
    const allItems = [...navigationItems, ...devNavigationItems, ...masterDataItems, ...monitoringItems, ...additionalMenuItems];
    return allItems.find(item => item.href === location.pathname)?.name || 'Dashboard';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <DailyQuestOverlay />
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-[200] lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        {/* Modern Blur Overlay */}
        <div
          className="fixed inset-0 bg-gray-900/60 backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => setSidebarOpen(false)}
        />

        <div className={`fixed inset-y-0 left-0 z-[201] w-80 bg-white shadow-[10px_0_50px_-15px_rgba(0,0,0,0.3)] flex flex-col transform transition-transform duration-500 ease-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>

          {/* Sidebar Header with Gradient Accent */}
          <div className="relative h-48 flex-shrink-0 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800"></div>
            {/* Decorative Shapes */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl"></div>
            <div className="absolute top-24 -left-10 w-32 h-32 bg-blue-400/20 rounded-full blur-xl"></div>
            <div className="absolute top-10 right-10 w-16 h-16 bg-white/5 border border-white/10 rounded-2xl rotate-12 backdrop-blur-sm"></div>
            <div className="absolute -bottom-5 right-20 w-20 h-20 bg-indigo-400/20 rounded-3xl -rotate-12 blur-lg"></div>
            <div className="absolute top-1/2 left-1/3 w-12 h-12 bg-white/5 rounded-full border border-white/10"></div>

            <div className="relative z-10 flex flex-col h-full p-6 justify-between">
              <div className="flex items-center justify-between">
                <div className="p-0">
                  <img src={logo} alt="Logo" className="h-14 w-14 object-contain rounded-2xl shadow-lg border border-white/10" />
                </div>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-all active:scale-90"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div>
                <h2 className="text-2xl font-bold text-white tracking-tight leading-none mb-1">Gudang <span className="text-blue-200">5</span></h2>
                <p className="text-blue-100/70 text-[10px] font-medium uppercase tracking-widest">{isDevMode ? 'Developer Environment' : 'Management System'}</p>
              </div>
            </div>
          </div>

          {/* Navigation with custom scrollbar */}
          <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-7 no-scrollbar">

            {/* Nav Group: Main */}
            <div className="space-y-1.5">
              <div className="px-3 mb-2 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.2em]">Navigasi Utama</span>
              </div>
              {navigationItems.filter(item => hasAccess(item.href)).map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 group ${isActive
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-[0_10px_20px_-5px_rgba(37,99,235,0.4)] translate-x-2'
                      : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                      }`}
                  >
                    <Icon className={`mr-4 h-5 w-5 transition-transform duration-300 ${isActive ? 'text-white scale-110' : 'text-gray-400 group-hover:text-blue-600'}`} />
                    <span className="tracking-tight uppercase">{item.name}</span>
                  </Link>
                );
              })}
            </div>

            {/* Nav Group: Analysis & Monitoring */}
            {(monitoringItems.filter(item => hasAccess(item.href)).length > 0 || masterDataItems.filter(item => hasAccess(item.href)).length > 0) && (
            <div className="space-y-2">
              <div className="px-3 mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.2em]">Analisa & Monitor</span>
              </div>

              {/* Monitoring Dropdown */}
              {monitoringItems.filter(item => hasAccess(item.href)).length > 0 && (
              <>
                <button
                  onClick={() => setMonitoringOpen(!monitoringOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-all ${isMonitoringActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-50'
                    }`}
                >
                  <div className="flex items-center">
                    <ShieldAlert className={`mr-4 h-5 w-5 ${isMonitoringActive ? 'text-emerald-600' : 'text-gray-400'}`} />
                    <span className="uppercase tracking-tight">Monitoring Stok</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${monitoringOpen ? 'rotate-180' : ''}`} />
                </button>

                {monitoringOpen && (
                  <div className="ml-6 space-y-1 animate-in slide-in-from-top-2 duration-200">
                    {monitoringItems.filter(item => hasAccess(item.href)).map((item) => {
                      const isActive = location.pathname === item.href;
                      return (
                        <Link
                          key={item.name}
                          to={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${isActive ? 'text-emerald-600 bg-emerald-100/50' : 'text-gray-500 hover:text-emerald-600 hover:bg-emerald-50/50'}`}
                        >
                          <span className="w-1 h-1 bg-current rounded-full mr-3 opacity-40"></span>
                          <span className="uppercase tracking-tighter">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </>
              )}

              {/* Master Data Dropdown */}
              {masterDataItems.filter(item => hasAccess(item.href)).length > 0 && (
              <>
                <button
                  onClick={() => setMasterDataOpen(!masterDataOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-all ${isMasterDataActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50'
                    }`}
                >
                  <div className="flex items-center">
                    <FolderTree className={`mr-4 h-5 w-5 ${isMasterDataActive ? 'text-blue-600' : 'text-gray-400'}`} />
                    <span className="uppercase tracking-tight">Master Data</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${masterDataOpen ? 'rotate-180' : ''}`} />
                </button>

                {masterDataOpen && (
                  <div className="ml-6 space-y-1 animate-in slide-in-from-top-2 duration-200">
                    {masterDataItems.filter(item => hasAccess(item.href)).map((item) => {
                      const isActive = location.pathname === item.href;
                      return (
                        <Link
                          key={item.name}
                          to={item.href}
                          onClick={() => setSidebarOpen(false)}
                          className={`flex items-center px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${isActive ? 'text-blue-600 bg-blue-100/50' : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50/50'}`}
                        >
                          <span className="w-1 h-1 bg-current rounded-full mr-3 opacity-40"></span>
                          <span className="uppercase tracking-tighter">{item.name}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </>
              )}
            </div>
            )}

            {/* Nav Group: Utilities */}
            {additionalMenuItems.filter(item => hasAccess(item.href)).length > 0 && (
            <div className="space-y-1.5 box-border">
              <div className="px-3 mb-2 flex items-center gap-2 text-none">
                <div className="w-1.5 h-1.5 bg-amber-500 rounded-full"></div>
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-[0.2em]">Tools & Alat</span>
              </div>
              {additionalMenuItems.filter(item => hasAccess(item.href)).map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`flex items-center px-4 py-3 rounded-2xl text-sm font-medium transition-all duration-300 group ${isActive
                      ? 'bg-amber-500 text-white shadow-[0_10px_20px_-5px_rgba(245,158,11,0.4)] translate-x-2'
                      : 'text-gray-600 hover:bg-amber-50 hover:text-amber-600'
                      }`}
                  >
                    <Icon className={`mr-4 h-5 w-5 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-amber-600'}`} />
                    <span className="uppercase tracking-tight">{item.name}</span>
                  </Link>
                );
              })}
            </div>
            )}

            {/* Nav Group: Developer (Conditioned) */}
            {isDevMode && devNavigationItems.filter(item => hasAccess(item.href)).length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <button
                  onClick={() => setDevModeOpen(!devModeOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm font-medium transition-all ${isDevModeActive
                    ? 'bg-rose-50 text-rose-700'
                    : 'text-rose-600 hover:bg-rose-50'
                    }`}
                >
                  <div className="flex items-center">
                    <Wrench className="mr-4 h-5 w-5" />
                    <span className="uppercase tracking-tight">System Debug</span>
                  </div>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${devModeOpen ? 'rotate-180' : ''}`} />
                </button>

                {devModeOpen && (
                  <div className="ml-6 space-y-1 animate-in slide-in-from-top-2 duration-200">
                    {devNavigationItems.filter(item => hasAccess(item.href)).map((item) => (
                      <Link
                        key={item.name}
                        to={item.href}
                        onClick={() => setSidebarOpen(false)}
                        className="flex items-center px-4 py-2.5 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-50 transition-all uppercase tracking-tighter"
                      >
                        <span className="w-1 h-1 bg-current rounded-full mr-3 opacity-40"></span>
                        {item.name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </nav>

          {/* Premium Bottom Profile Card */}
          <div className="p-4 flex-shrink-0 bg-gray-50/80 backdrop-blur-sm border-t border-gray-100">
            <div className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 group">
              {userAvatar ? (
                <img src={userAvatar} alt={userName} className="h-10 w-10 rounded-xl border-2 border-blue-100 flex-shrink-0 shadow-sm" referrerPolicy="no-referrer" />
              ) : (
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-medium text-sm flex-shrink-0 shadow-sm">
                  {(userName || userEmail || '?')[0].toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate uppercase leading-tight">{userName || 'User'}</p>
                <p className="text-[9px] font-medium text-gray-400 truncate tracking-tight">{userEmail}</p>
              </div>
              <button
                onClick={signOut}
                className="p-2.5 rounded-xl bg-gray-50 text-gray-400 hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-90"
                title="Sign Out"
              >
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="mt-2 text-center">
              <span className="text-[8px] font-medium text-gray-300 uppercase tracking-[0.4em]">v{APP_VERSION}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-[110] ${desktopSidebarCollapsed ? 'lg:w-20' : 'lg:w-72'} transition-all duration-500 ease-in-out`}>
        <div className="flex min-h-0 flex-1 flex-col bg-white border-r border-gray-100 shadow-xl shadow-gray-200/20">

          {/* Clean Sidebar Header - Improved Spacing */}
          <div className={`flex-shrink-0 transition-all duration-300 ${desktopSidebarCollapsed ? 'py-8 flex justify-center' : 'p-8 border-b border-gray-50'}`}>
            <div className={`flex items-center ${desktopSidebarCollapsed ? 'flex-col gap-4' : 'gap-4'}`}>
              <div className="relative group shrink-0">
                <div className="absolute -inset-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <img
                  src={logo}
                  alt="Logo"
                  className={`${desktopSidebarCollapsed ? 'h-12 w-12' : 'h-14 w-14'} relative object-contain rounded-xl shadow-lg transition-all duration-300`}
                />
              </div>

              {!desktopSidebarCollapsed && (
                <div className="flex-1 flex flex-col min-w-0">
                  <h2 className="text-xl font-black text-gray-900 tracking-tight leading-none mb-1">
                    Gudang <span className="text-blue-600">Kalindo</span>
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-sm shadow-emerald-200"></div>
                    <span className="text-gray-400 text-[10px] font-bold uppercase tracking-[0.1em] truncate">V5 Online System</span>
                  </div>
                </div>
              )}

              {!desktopSidebarCollapsed && (
                <button
                  onClick={toggleDesktopSidebar}
                  className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-blue-600 transition-all active:scale-90"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
            </div>

            {desktopSidebarCollapsed && (
              <button
                onClick={toggleDesktopSidebar}
                className="mt-6 p-2.5 bg-blue-50 hover:bg-blue-100 rounded-xl text-blue-600 transition-all active:scale-90 shadow-sm"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </div>

          <nav className="mt-8 flex-1 px-4 py-4 pb-6 overflow-y-auto no-scrollbar">
            <div className="space-y-3">
              {navigationItems.filter(item => hasAccess(item.href)).map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    className={`flex items-center ${desktopSidebarCollapsed ? 'justify-center' : ''} px-4 py-3.5 rounded-xl text-[15px] font-bold transition-all duration-200 group ${isActive
                      ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-200 scale-[1.02]'
                      : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                      }`}
                    title={desktopSidebarCollapsed ? item.name : ''}
                  >
                    <Icon className={`h-5.5 w-5.5 transition-colors ${desktopSidebarCollapsed ? '' : 'mr-4'} ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-blue-600'}`} />
                    {!desktopSidebarCollapsed && item.name}
                  </Link>
                );
              })}

              {/* Monitoring & Master Data Section - Desktop */}
              {(monitoringItems.filter(item => hasAccess(item.href)).length > 0 || masterDataItems.filter(item => hasAccess(item.href)).length > 0) && (
                <div className="space-y-1.5 mt-4 pt-4 border-t border-gray-100">
                  {!desktopSidebarCollapsed && (
                    <div className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Monitoring & Master Data
                    </div>
                  )}

                  {/* Monitoring Stok Dropdown - Desktop */}
                  {!desktopSidebarCollapsed && monitoringItems.filter(item => hasAccess(item.href)).length > 0 && (
                    <div className="space-y-1.5">
                      <button
                        onClick={() => setMonitoringOpen(!monitoringOpen)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${isMonitoringActive
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                          }`}
                      >
                        <div className="flex items-center">
                          <ShieldAlert className={`mr-3 h-5 w-5 transition-colors ${isMonitoringActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}`} />
                          Monitoring Stok
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${monitoringOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {monitoringOpen && (
                        <div className="ml-4 pl-3 border-l-2 border-gray-100 space-y-1">
                          {monitoringItems.filter(item => hasAccess(item.href)).map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.href;
                            return (
                              <Link
                                key={item.name}
                                to={item.href}
                                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 group ${isActive
                                  ? 'text-blue-600 bg-blue-50'
                                  : 'text-gray-500 hover:text-blue-600 hover:bg-gray-50'
                                  }`}
                              >
                                <Icon className={`mr-3 h-4 w-4 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}`} />
                                {item.name}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Monitoring Stok Icon Only - Collapsed */}
                  {desktopSidebarCollapsed && monitoringItems.filter(item => hasAccess(item.href)).length > 0 && (
                    <Link
                      to="/stok-minus"
                      className={`flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${isMonitoringActive
                        ? 'bg-blue-50 text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                        }`}
                      title="Monitoring Stok"
                    >
                      <ShieldAlert className={`h-5 w-5 transition-colors ${isMonitoringActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}`} />
                    </Link>
                  )}

                  {/* Master Data Dropdown - Desktop */}
                  {!desktopSidebarCollapsed && masterDataItems.filter(item => hasAccess(item.href)).length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <button
                        onClick={() => setMasterDataOpen(!masterDataOpen)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${isMasterDataActive
                          ? 'bg-blue-50 text-blue-700 font-semibold'
                          : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                          }`}
                      >
                        <div className="flex items-center">
                          <FolderTree className={`mr-3 h-5 w-5 transition-colors ${isMasterDataActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}`} />
                          Master Data
                        </div>
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${masterDataOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {masterDataOpen && (
                        <div className="ml-4 pl-3 border-l-2 border-gray-100 space-y-1">
                          {masterDataItems.filter(item => hasAccess(item.href)).map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.href;
                            return (
                              <Link
                                key={item.name}
                                to={item.href}
                                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 group ${isActive
                                  ? 'text-blue-600 bg-blue-50'
                                  : 'text-gray-500 hover:text-blue-600 hover:bg-gray-50'
                                  }`}
                              >
                                <Icon className={`mr-3 h-4 w-4 transition-colors ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}`} />
                                {item.name}
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Master Data Icon Only - Collapsed */}
                  {desktopSidebarCollapsed && masterDataItems.filter(item => hasAccess(item.href)).length > 0 && (
                    <Link
                      to="/master-data/gudang"
                      className={`flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group ${isMasterDataActive
                        ? 'bg-blue-50 text-blue-700 shadow-sm'
                        : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                        }`}
                      title="Master Data"
                    >
                      <FolderTree className={`h-5 w-5 transition-colors ${isMasterDataActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-600'}`} />
                    </Link>
                  )}
                </div>
              )}

              {/* Additional Menu Items - Desktop */}
              {additionalMenuItems.filter(item => hasAccess(item.href)).length > 0 && (
              <div className="space-y-1 mt-4 pt-4 border-t border-gray-100">
                {!desktopSidebarCollapsed && (
                  <div className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Menu Tambahan
                  </div>
                )}
                {additionalMenuItems.filter(item => hasAccess(item.href)).map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={`flex items-center ${desktopSidebarCollapsed ? 'justify-center' : ''} px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group  ${isActive
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md scale-[1.02]'
                        : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:translate-x-1'
                        }`}
                      title={desktopSidebarCollapsed ? item.name : ''}
                    >
                      <Icon className={`h-5 w-5 transition-colors ${desktopSidebarCollapsed ? '' : 'mr-3'} ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-blue-600'}`} />
                      {!desktopSidebarCollapsed && item.name}
                    </Link>
                  );
                })}
              </div>
              )}

              {/* Dev Mode Dropdown - Desktop */}
              {isDevMode && !desktopSidebarCollapsed && devNavigationItems.filter(item => hasAccess(item.href)).length > 0 && (
                <div className="space-y-1.5 mt-4 border-t border-gray-200 pt-4">
                  <button
                    onClick={() => setDevModeOpen(!devModeOpen)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isDevModeActive
                      ? 'bg-orange-100 text-orange-700'
                      : 'text-orange-600 hover:bg-orange-50 hover:text-orange-700'
                      }`}
                  >
                    <div className="flex items-center">
                      <Wrench className="mr-3 h-5 w-5" />
                      Dev Mode
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${devModeOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {devModeOpen && (
                    <div className="ml-6 space-y-1">
                      {devNavigationItems.filter(item => hasAccess(item.href)).map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;
                        return (
                          <Link
                            key={item.name}
                            to={item.href}
                            className={`flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isActive
                              ? 'bg-orange-100 text-orange-700'
                              : 'text-orange-600 hover:bg-orange-50 hover:text-orange-700'
                              }`}
                          >
                            <Icon className="mr-3 h-4 w-4" />
                            {item.name}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Dev Mode Icon Only - Collapsed */}
              {isDevMode && desktopSidebarCollapsed && (
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <Link
                    to="/auto-sync"
                    className={`flex items-center justify-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${isDevModeActive
                      ? 'bg-orange-100 text-orange-700'
                      : 'text-orange-600 hover:bg-orange-50 hover:text-orange-700'
                      }`}
                    title="Dev Mode"
                  >
                    <Wrench className="h-5 w-5" />
                  </Link>
                </div>
              )}
            </div>
          </nav>
          {/* Desktop sidebar user profile */}
          <div className="flex-shrink-0 border-t border-gray-200 p-3">
            {!desktopSidebarCollapsed ? (
              <div className="flex items-center gap-3">
                {userAvatar ? (
                  <img src={userAvatar} alt={userName} className="h-9 w-9 rounded-full border-2 border-blue-100 shadow-sm flex-shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
                    {(userName || userEmail || '?')[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-900 truncate">{userName}</p>
                  <p className="text-[10px] text-gray-400 truncate">{userEmail}</p>
                </div>
                <button
                  onClick={signOut}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  title="Logout"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                {userAvatar ? (
                  <img src={userAvatar} alt={userName} className="h-8 w-8 rounded-full border-2 border-blue-100" referrerPolicy="no-referrer" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xs">
                    {(userName || userEmail || '?')[0].toUpperCase()}
                  </div>
                )}
                <button
                  onClick={signOut}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  title="Logout"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className={`transition-all duration-500 relative min-h-screen flex flex-col ${desktopSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72'}`}>
        {/* Top bar - Standardized Global Immersive Header */}
        <div className={`sticky top-0 z-[60] flex h-16 items-center transition-all duration-300 text-white ${scrolled ? 'backdrop-blur-md bg-blue-900/40 shadow-lg border-b border-white/10' : 'bg-transparent border-transparent shadow-none'}`}>
          <div className="flex-1 flex items-center gap-x-4 px-6 sm:gap-x-6 lg:px-12 pointer-events-auto">
            <button
              type="button"
              className="-m-2.5 p-2.5 lg:hidden text-white"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
            <div className="flex-1 text-sm font-black tracking-[0.2em] uppercase animate-in fade-in slide-in-from-left-4 duration-500">
              {getCurrentPageName()}
            </div>

            {isDevMode && (
              <div className="hidden sm:flex items-center px-3 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full">
                <span className="text-[10px] font-black text-orange-400 tracking-widest uppercase">Dev Mode</span>
              </div>
            )}
          </div>
        </div>

        {/* Global Content Area - Standardized for Immersive Banners */}
        <main className="flex-1 transition-all duration-300 -mt-16 pt-0 overflow-x-hidden">
          <div className="h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}