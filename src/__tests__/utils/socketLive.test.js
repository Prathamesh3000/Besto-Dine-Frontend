import { describe, it, expect, vi, beforeEach } from 'vitest';

// A guest-fallback socket (no user identity in the handshake) is "connected"
// but receives no staff-room events. isSocketConnected() must not claim the
// realtime feed is live on a staff screen in that state, or the screens drop
// to their slow safety poll and new orders appear minutes late.

const handlers = {};
let authFn = null;
const fakeSocket = {
  connected: false,
  on: (ev, fn) => { handlers[ev] = fn; return fakeSocket; },
  emit: vi.fn(),
  off: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: (_url, opts) => { authFn = opts.auth; return fakeSocket; },
}));

const authState = { token: null, mismatch: false, cookie: false };
vi.mock('../../utils/authStorage', () => ({
  getToken: () => authState.token,
  realToken: (t) => t || null,
  identityMismatch: () => authState.mismatch,
  currentAudience: () => (window.location.pathname.startsWith('/chef') ? 'staff' : 'customer'),
  audienceForPath: (p) => (p.startsWith('/chef') ? 'staff' : 'customer'),
  cookieAuthRequested: () => authState.cookie,
  COOKIE_SESSION: '__cookie__',
  getCookieSessionMeta: () => null,
}));
vi.mock('../../utils/apiOrigin', () => ({ configuredApiUrl: () => 'http://localhost:5000/api/v1' }));
vi.mock('../../utils/guestOrderAccess', () => ({ guestAccessJoinPayload: (r) => r }));

async function handshake() {
  // Run the auth callback exactly as socket.io does for each (re)connect.
  await new Promise((resolve) => authFn(resolve));
  handlers.connect();
}

describe('isSocketConnected on staff vs customer screens', () => {
  let mod;
  beforeEach(async () => {
    vi.resetModules();
    for (const k of Object.keys(handlers)) delete handlers[k];
    authState.token = null; authState.mismatch = false; authState.cookie = false;
    mod = await import('../../utils/socket');
    mod.getSocket();
  });

  it('staff screen + handshake WITH a token → live', async () => {
    window.history.pushState({}, '', '/chef');
    authState.token = 'jwt-staff';
    await handshake();
    expect(mod.isSocketConnected()).toBe(true);
  });

  it('staff screen + handshake WITHOUT identity (guest fallback) → NOT live', async () => {
    window.history.pushState({}, '', '/chef');
    authState.token = null;
    await handshake();
    expect(mod.isSocketConnected()).toBe(false);
  });

  it('staff screen + another tab signed a different account in (identity mismatch) → NOT live', async () => {
    window.history.pushState({}, '', '/chef');
    authState.token = 'jwt-other-account';
    authState.mismatch = true;
    await handshake();
    expect(mod.isSocketConnected()).toBe(false);
  });

  it('staff screen + cookie session → live', async () => {
    window.history.pushState({}, '', '/chef');
    authState.cookie = true;
    await handshake();
    expect(mod.isSocketConnected()).toBe(true);
  });

  it('customer screen + guest handshake → still live (guests legitimately have no token)', async () => {
    window.history.pushState({}, '', '/customer/home');
    authState.token = null;
    await handshake();
    expect(mod.isSocketConnected()).toBe(true);
  });

  it('a disconnected socket is never live', async () => {
    window.history.pushState({}, '', '/chef');
    authState.token = 'jwt-staff';
    await handshake();
    handlers.disconnect();
    expect(mod.isSocketConnected()).toBe(false);
  });
});
