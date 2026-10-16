'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface InstallContext {
  installed: boolean;
  ios: boolean;
  prompt: InstallEvent | null;
  install: () => Promise<boolean>;
}

const Install = createContext<InstallContext>({
  installed: false,
  ios: false,
  prompt: null,
  install: async () => false,
});

export function InstallAppButton() {
  const { installed, ios, prompt, install } = useContext(Install);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  // When running inside the installed standalone PWA, hide the install button
  if (installed) return null;

  const handleClick = async () => {
    if (prompt) {
      setBusy(true);
      try {
        const accepted = await install();
        if (!accepted) setHelp(true);
      } catch {
        setHelp(true);
      } finally {
        setBusy(false);
      }
      return;
    }
    // If native prompt is not available, show browser-specific install guidance
    setHelp((v) => !v);
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        disabled={busy}
        aria-label="Installer APMS"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
      >
        <Download size={14} className="text-gray-500" aria-hidden="true" />
        <span>Installer APMS</span>
      </button>

      {help && (
        <div
          role="status"
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-700 shadow-xl"
        >
          <div className="flex items-center justify-between font-semibold text-gray-900 mb-2">
            <span>Installer l’application APMS</span>
            <button
              type="button"
              onClick={() => setHelp(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Fermer"
            >
              <X size={14} />
            </button>
          </div>
          {ios ? (
            <p className="leading-relaxed">
              Dans Safari sur iPhone/iPad : touchez l’icône <strong>Partager</strong> (carré avec flèche vers le haut), puis faites défiler et sélectionnez <strong>« Sur l’écran d’accueil »</strong> et <strong>« Ajouter »</strong>.
            </p>
          ) : (
            <div className="space-y-1.5 leading-relaxed">
              <p>
                Dans votre navigateur (Chrome / Edge) :
              </p>
              <p>
                • Cliquez sur l’icône <strong>Installer</strong> dans la barre d’adresse (en haut à droite ⊕ ou écran).
              </p>
              <p>
                • Ou ouvrez le menu <strong>⋮ &gt; « Installer APMS »</strong>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PwaProvider({ children }: { children: React.ReactNode }) {
  const [offline, setOffline] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const mode = window.matchMedia('(display-mode: standalone)');
    const updateConnection = () => setOffline(!navigator.onLine);
    const updateInstalled = () =>
      setInstalled(mode.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone);
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };

    queueMicrotask(() => {
      updateConnection();
      updateInstalled();
      setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    });

    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    mode.addEventListener('change', updateInstalled);

    return () => {
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      mode.removeEventListener('change', updateInstalled);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;

    const checkWaiting = () => {
      if (!disposed && registration?.waiting) {
        registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
      }
    };

    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then((value) => {
      if (disposed) return;
      registration = value;
      checkWaiting();
      registration.addEventListener('updatefound', () => {
        const installing = registration?.installing;
        if (installing) {
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed') checkWaiting();
          });
        }
      });
    }).catch(() => {
      // SW is optional; web app operates normally without it
    });

    return () => {
      disposed = true;
    };
  }, []);

  const install = async (): Promise<boolean> => {
    if (!prompt) return false;
    const currentPrompt = prompt;
    setPrompt(null);
    await currentPrompt.prompt();
    const choice = await currentPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
      return true;
    }
    return false;
  };

  return (
    <Install.Provider value={{ installed, ios, prompt, install }}>
      {children}
      {offline && (
        <aside
          aria-label="État de l’application"
          className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-800 shadow-lg"
        >
          <p role="status">
            Connexion perdue. Les données affichées peuvent être anciennes ; les opérations ne sont pas enregistrées hors connexion.
          </p>
        </aside>
      )}
    </Install.Provider>
  );
}
