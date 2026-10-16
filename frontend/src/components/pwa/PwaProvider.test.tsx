import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PwaProvider, { InstallAppButton } from './PwaProvider';

describe('PwaProvider and InstallAppButton', () => {
  const originalNavigator = window.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'navigator', {
      writable: true,
      value: originalNavigator,
    });
  });

  it('displays install button by default in browser and hides it in standalone mode', async () => {
    const { unmount } = render(
      <PwaProvider>
        <InstallAppButton />
        <div>App Content</div>
      </PwaProvider>
    );

    expect(screen.getByText('App Content')).toBeDefined();
    expect(screen.getByLabelText('Installer APMS')).toBeDefined();
    unmount();

    // Mock standalone display mode
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('display-mode: standalone'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(
      <PwaProvider>
        <InstallAppButton />
      </PwaProvider>
    );

    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    });

    expect(screen.queryByLabelText('Installer APMS')).toBeNull();
  });

  it('handles native beforeinstallprompt when available', async () => {
    const user = userEvent.setup();
    render(
      <PwaProvider>
        <InstallAppButton />
      </PwaProvider>
    );

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event('beforeinstallprompt'), {
      prompt: promptMock,
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });

    await act(async () => {
      window.dispatchEvent(installEvent);
    });

    const installBtn = screen.getByLabelText('Installer APMS');
    await user.click(installBtn);
    expect(promptMock).toHaveBeenCalledOnce();
  });

  it('displays browser install instructions when clicked without native prompt', async () => {
    const user = userEvent.setup();
    render(
      <PwaProvider>
        <InstallAppButton />
      </PwaProvider>
    );

    const installBtn = screen.getByLabelText('Installer APMS');
    await user.click(installBtn);

    expect(screen.getByText(/Dans votre navigateur/)).toBeDefined();

    await user.click(screen.getByLabelText('Fermer'));
    expect(screen.queryByText(/Dans votre navigateur/)).toBeNull();
  });

  it('displays iOS help instructions when running on iOS and install button is clicked', async () => {
    Object.defineProperty(window, 'navigator', {
      writable: true,
      value: {
        ...originalNavigator,
        userAgent: 'iPhone; CPU iPhone OS 17_0 like Mac OS X',
        platform: 'iPhone',
        onLine: true,
      },
    });

    const user = userEvent.setup();
    render(
      <PwaProvider>
        <InstallAppButton />
      </PwaProvider>
    );

    await act(async () => {
      await new Promise<void>((resolve) => queueMicrotask(() => resolve()));
    });

    const installBtn = screen.getByLabelText('Installer APMS');
    await user.click(installBtn);
    expect(screen.getByText(/Dans Safari sur iPhone\/iPad/)).toBeDefined();

    await user.click(screen.getByLabelText('Fermer'));
    expect(screen.queryByText(/Dans Safari sur iPhone\/iPad/)).toBeNull();
  });

  it('displays offline warning banner when network is lost', async () => {
    const onLineSpy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    render(
      <PwaProvider>
        <div>Dashboard</div>
      </PwaProvider>
    );

    expect(screen.queryByText(/Connexion perdue/)).toBeNull();

    onLineSpy.mockReturnValue(false);
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByText(/Connexion perdue/)).toBeDefined();

    onLineSpy.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.queryByText(/Connexion perdue/)).toBeNull();
  });
});
