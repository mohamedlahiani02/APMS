'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface InstallContext { available: boolean; ios: boolean; install: () => Promise<void> }
const Install = createContext<InstallContext>({ available: false, ios: false, install: async () => {} });

export function InstallAppButton() {
  const { available, ios, install } = useContext(Install);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!available) return null;
  return <div className="relative">
    <button type="button" disabled={busy} aria-label="Installer APMS" onClick={async () => {
      if (ios) { setHelp(value => !value); return; }
      setBusy(true); setFailed(false);
      try { await install(); } catch { setFailed(true); } finally { setBusy(false); }
    }} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-sm text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">
      <Download size={16} aria-hidden="true" /><span className="sr-only sm:not-sr-only">Installer APMS</span>
    </button>
    {help && <div role="status" className="absolute right-0 z-50 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-lg">
      Dans Safari, ouvrez le menu Partager, puis choisissez « Sur l’écran d’accueil » et « Ajouter ».
      <button type="button" onClick={() => setHelp(false)} className="mt-2 block underline">Fermer</button>
    </div>}
    {failed && <p role="status" className="text-sm text-red-700">Installation indisponible. Réessayez depuis le menu du navigateur.</p>}
  </div>;
}

export default function PwaProvider({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const updateRequested = useRef(false);

  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)');
    const updateConnection = () => setOffline(!navigator.onLine);
    const updateInstalled = () => setInstalled(mode.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    const beforeInstall = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    queueMicrotask(() => {
      updateConnection(); updateInstalled();
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    });
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    mode.addEventListener('change', updateInstalled);
    return () => {
      window.removeEventListener('online', updateConnection); window.removeEventListener('offline', updateConnection);
      window.removeEventListener('beforeinstallprompt', beforeInstall); window.removeEventListener('appinstalled', onInstalled);
      mode.removeEventListener('change', updateInstalled);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const checkWaiting = () => { if (!disposed && registration?.waiting) setWaiting(registration.waiting); };
    const changed = () => { if (installing?.state === 'installed') checkWaiting(); };
    const found = () => {
      installing?.removeEventListener('statechange', changed);
      installing = registration?.installing ?? null;
      installing?.addEventListener('statechange', changed);
    };
    const controllerChanged = () => { if (updateRequested.current) window.location.reload(); };
    const refresh = () => { if (document.visibilityState === 'visible') void registration?.update().catch(() => {}); };
    navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
    document.addEventListener('visibilitychange', refresh);
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(value => {
      if (disposed) return;
      registration = value; checkWaiting(); found(); registration.addEventListener('updatefound', found);
    }).catch(() => { /* Installation remains optional; the online application still works. */ });
    return () => {
      disposed = true; installing?.removeEventListener('statechange', changed);
      registration?.removeEventListener('updatefound', found);
      navigator.serviceWorker.removeEventListener('controllerchange', controllerChanged);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const install = async () => {
    if (!prompt) return;
    setPrompt(null);
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === 'accepted') setInstalled(true);
  };
  return <Install.Provider value={{ available: !installed && !!(prompt || ios), ios, install }}>
    {children}
    {(offline || waiting) && <aside aria-label="État de l’application" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-800 shadow-lg">
      {offline && <p role="status">Connexion perdue. Les données affichées peuvent être anciennes ; les opérations ne sont pas enregistrées hors connexion.</p>}
      {waiting && !offline && <div className="flex items-center justify-between gap-3"><p role="status">Une nouvelle version d’APMS est disponible.</p><button type="button" className="rounded-lg bg-gray-900 px-3 py-2 text-white" onClick={() => {
        if (window.confirm('Enregistrez votre saisie avant de continuer. Actualiser APMS maintenant ?')) {
          updateRequested.current = true; waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
        }
      }}>Actualiser</button></div>}
    </aside>}
  </Install.Provider>;
}
