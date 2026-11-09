import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { SignIn } from './components/SignIn';
import { Files } from './modules/files/Files';
import { Inventory } from './modules/inventory/Inventory';
import { ServiceSheets } from './modules/service-sheets/ServiceSheets';
import { isSupabaseConfigured, supabase } from './lib/supabase/client';
import type { AppRole, ModuleKey, StaffProfile } from './types';

function useStaffSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [accessError, setAccessError] = useState('');

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) { setSession(data.session); setLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user.id) { setProfile(null); setAccessError(''); return; }
    setProfile(null);
    setAccessError('');
    let alive = true;
    void supabase.from('profiles').select('id,display_name,platform_role,is_active,memberships:organization_memberships(organization_id,role,is_active,organizations(name))').eq('id', session.user.id).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      const memberships = (data as StaffProfile | null)?.memberships ?? [];
      if (error || !data?.is_active || (!(data as StaffProfile | null)?.platform_role && !memberships.some((membership) => membership.is_active))) {
        setProfile(null);
        setAccessError('This account is not enabled for the HydraRoll app. Ask an administrator to activate your staff profile.');
      } else {
        setProfile(data as StaffProfile);
        setAccessError('');
      }
    });
    return () => { alive = false; };
  }, [session]);

  return { session, profile, loading, accessError };
}

function LocalPreview() {
  return <Workspace profile={null} userEmail="" cloudMode={false} />;
}

function HostedApp() {
  const { session, profile, loading, accessError } = useStaffSession();
  const client = supabase;
  if (!client) return <LocalPreview />;
  if (loading) return <main className="signin-page"><p>Checking staff access…</p></main>;
  if (!session) return <SignIn client={client} />;
  if (accessError) return <main className="signin-page"><div className="signin-card"><img src="/hr-logo.png" alt="HydraRoll" /><h1>Account access</h1><p className="error-message">{accessError}</p><button className="secondary" onClick={() => void client.auth.signOut()}>Sign out</button></div></main>;
  if (!profile) return <main className="signin-page"><p>Loading staff profile…</p></main>;
  return <HostedFoundation profile={profile} email={session.user.email ?? ''} onSignOut={() => void client.auth.signOut()} />;
}

function HostedFoundation({ profile, email, onSignOut }: { profile: StaffProfile; email: string; onSignOut: () => void }) {
  const role = profile.platform_role ?? profile.memberships.find((membership) => membership.is_active)?.role ?? 'customer_user';
  return <main className="signin-page"><section className="signin-card hosted-foundation"><img src="/hr-logo.png" alt="HydraRoll" /><span className="eyebrow">Signed in · {role.replaceAll('_', ' ')}</span><h1>Hosted foundation ready</h1><p>Your secure sign-in and organisation profile are connected. Hosted service sheets, inventory and files are not enabled yet; this prevents data being saved to this device by mistake.</p><p><strong>{email}</strong></p><button className="secondary" onClick={onSignOut}>Sign out</button></section></main>;
}

function Workspace({ profile, userEmail, cloudMode }: { profile: StaffProfile | null; userEmail: string; cloudMode: boolean }) {
  const [page, setPage] = useState<ModuleKey>('home');
  const [partCount, setPartCount] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const role: AppRole = profile?.platform_role ?? profile?.memberships.find((membership) => membership.is_active)?.role ?? 'internal_manager';
  const internalUser = ['platform_admin', 'internal_manager', 'technician'].includes(role);
  const organizations = profile?.memberships.find((membership) => membership.is_active)?.organizations;
  const organizationName = Array.isArray(organizations) ? organizations[0]?.name : organizations?.name;
  const technicianName = profile?.display_name ?? 'Local technician';

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    const installPrompt = (event: Event) => { event.preventDefault(); setInstallEvent(event as BeforeInstallPromptEvent); };
    window.addEventListener('online', updateOnline); window.addEventListener('offline', updateOnline); window.addEventListener('beforeinstallprompt', installPrompt);
    return () => { window.removeEventListener('online', updateOnline); window.removeEventListener('offline', updateOnline); window.removeEventListener('beforeinstallprompt', installPrompt); };
  }, []);

  useEffect(() => { setPartCount(JSON.parse(localStorage.getItem('hydraroll:inventory:v1') ?? '[]').length); }, [page]);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    setInstallEvent(null);
  }

  async function signOut() { if (supabase) await supabase.auth.signOut(); }

  return <div className="app-shell">
    <header className="app-header"><a className="brand" href="#home" onClick={(event) => { event.preventDefault(); setPage('home'); }}><img src="/hr-logo.png" alt="HydraRoll" /><span className="badge">MANAGEMENT APP</span></a><div className="header-controls"><span className={online ? 'connection online' : 'connection offline'}>{online ? (cloudMode ? 'Online' : 'Local preview') : 'Offline'}</span>{installEvent && <button className="secondary install-button" onClick={() => void install()}>Install app</button>}{cloudMode ? <div className="account-chip"><span>{technicianName}</span><small>{role.replaceAll('_',' ')}{organizationName ? ` · ${organizationName}` : ''}</small><button className="text-button" onClick={() => void signOut()}>Sign out</button></div> : <span className="preview-chip">Local preview</span>}</div></header>
    <main className="app-main"><div className="page-title-row"><div><span className="eyebrow">Workshop & field service</span><h1>{page === 'home' ? 'Management App' : page === 'service' ? 'Service Sheets' : page === 'inventory' ? 'Inventory / Stocks' : 'Files'}</h1></div>{page !== 'home' && <button className="secondary" onClick={() => setPage('home')}>← Menu</button>}</div>
      {!cloudMode && <div className="mode-banner">Local preview mode: data stays in this browser. Supabase accounts, shared database access, and cloud files activate after Hydraroll project credentials are added.</div>}
      {cloudMode && !online && <div className="mode-banner">You are offline. The app shell and saved local draft remain available; cloud sign-in, files, and database changes need a connection. Offline queue sync is a later development stage.</div>}
      {page === 'home' && (internalUser ? <section className="module-landing" aria-label="App modules"><button className="module-tile" onClick={() => setPage('service')}><span className="tile-icon">✓</span><strong>Service Sheets</strong><span>Inspections, repairs, pressure tests, parts, and sign-off.</span><b>Open Service Sheets →</b></button><button className="module-tile" onClick={() => setPage('inventory')}><span className="tile-icon">▤</span><strong>Inventory / Stocks</strong><span>Manage parts and on-hand quantities.</span><b>{partCount} parts · Manage inventory →</b></button><button className="module-tile" onClick={() => setPage('files')}><span className="tile-icon">▣</span><strong>Files</strong><span>Equipment manuals, service photos, reports, and documents.</span><b>Open file storage →</b></button><div className="future-tile"><span className="eyebrow">Expandable modules</span><strong>More tools can be added here</strong><span>Equipment QR records, staff administration, and reporting can join the menu as the app grows.</span></div></section> : <section className="customer-coming"><span className="tile-icon">▣</span><h2>Customer portal</h2><p>Your organisation is signed in. Customer fleet, approved service history, and shared documents will be added in the customer portal milestone.</p><p>No internal inventory or staff records are shown in this account.</p></section>)}
      {page === 'service' && internalUser && <ServiceSheets technicianName={technicianName} role={role} onSaved={() => setPartCount(JSON.parse(localStorage.getItem('hydraroll:inventory:v1') ?? '[]').length)} />}
      {page === 'inventory' && internalUser && <Inventory role={role} onChanged={() => setPartCount(JSON.parse(localStorage.getItem('hydraroll:inventory:v1') ?? '[]').length)} />}
      {page === 'files' && internalUser && <Files role={role} />}
    </main>
    <footer className="app-footer"><span>HydraRoll heavy transport equipment</span><span>{cloudMode ? `Signed in · ${userEmail}` : 'Local preview · not shared between devices'}</span></footer>
  </div>;
}

export default function App() {
  return isSupabaseConfigured ? <HostedApp /> : <LocalPreview />;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}
