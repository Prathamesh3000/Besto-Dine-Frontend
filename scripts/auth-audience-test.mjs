// Pure-function checks for the auth audience scheme in src/utils/authStorage.js
// (platform / staff / customer). Run: node scripts/auth-audience-test.mjs
import assert from 'node:assert/strict';
import {
    audienceForPath,
    audienceForUser,
    resolveEntryAudience,
    migrateLegacyPlatformSession,
    loginPathForAudience,
    storageKeysFor,
    isSharedStaffEntryPath,
} from '../src/utils/authStorage.js';

let passed = 0;
const test = (name, fn) => {
    try { fn(); passed += 1; } catch (err) {
        console.error(`FAIL ${name}\n  ${err.message}`);
        process.exitCode = 1;
    }
};

function memoryStorage(init = {}) {
    const m = new Map(Object.entries(init));
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        dump: () => Object.fromEntries(m),
    };
}

test('audienceForPath', () => {
    assert.equal(audienceForPath('/superadmin'), 'platform');
    assert.equal(audienceForPath('/superadmin/restaurants'), 'platform');
    assert.equal(audienceForPath('/superadminx'), 'customer');
    for (const p of ['/admin/dashboard', '/waiter/home', '/chef/dashboard', '/captain', '/kitchen/x']) {
        assert.equal(audienceForPath(p), 'staff', p);
    }
    assert.equal(audienceForPath('/staff-login'), 'staff');
    assert.equal(audienceForPath('/force-change-password'), 'staff');
    for (const p of ['/', '/login', '/customer/home', '/my-cafe', '/administrator', undefined]) {
        assert.equal(audienceForPath(p), 'customer', String(p));
    }
});

test('isSharedStaffEntryPath', () => {
    assert.equal(isSharedStaffEntryPath('/staff-login'), true);
    assert.equal(isSharedStaffEntryPath('/force-change-password'), true);
    assert.equal(isSharedStaffEntryPath('/superadmin'), false);
});

test('audienceForUser', () => {
    assert.equal(audienceForUser({ role: 'superadmin' }), 'platform');
    for (const role of ['admin', 'manager', 'waiter', 'captain', 'chef']) {
        assert.equal(audienceForUser({ role }), 'staff', role);
    }
    assert.equal(audienceForUser({ role: 'customer' }), 'customer');
    assert.equal(audienceForUser(null), null);
});

test('loginPathForAudience / storageKeysFor', () => {
    assert.equal(loginPathForAudience('platform'), '/staff-login');
    assert.equal(loginPathForAudience('staff'), '/staff-login');
    assert.equal(loginPathForAudience('customer'), '/login');
    assert.deepEqual(storageKeysFor('platform'), { token: 'platform_token', user: 'platform_user', refresh: 'platform_refresh_token' });
    assert.deepEqual(storageKeysFor('staff'), { token: 'staff_token', user: 'staff_user', refresh: 'staff_refresh_token' });
    assert.deepEqual(storageKeysFor('customer'), { token: 'token', user: 'user', refresh: 'refresh_token' });
    assert.deepEqual(storageKeysFor('bogus'), storageKeysFor('customer'));
});

test('resolveEntryAudience', () => {
    const empty = memoryStorage();
    assert.equal(resolveEntryAudience('/staff-login', null, empty), 'staff');
    assert.equal(resolveEntryAudience('/staff-login', 'platform', empty), 'platform');
    assert.equal(resolveEntryAudience('/staff-login', 'customer', empty), 'staff');
    const saMustChange = memoryStorage({
        platform_user: JSON.stringify({ _id: 'sa', role: 'superadmin', mustChangePassword: true }),
        staff_user: JSON.stringify({ _id: 'ad', role: 'admin' }),
    });
    assert.equal(resolveEntryAudience('/force-change-password', null, saMustChange), 'platform');
    // Explicit tab audience wins over detection.
    assert.equal(resolveEntryAudience('/force-change-password', 'staff', saMustChange), 'staff');
    // Detection only applies to /force-change-password.
    assert.equal(resolveEntryAudience('/staff-login', null, saMustChange), 'staff');
});

test('migration moves a legacy Super Admin session', () => {
    const s = memoryStorage({
        staff_token: 'T', staff_refresh_token: 'R',
        staff_user: JSON.stringify({ _id: 'sa', role: 'superadmin' }),
        token: 'cust', user: JSON.stringify({ _id: 'c', role: 'customer' }),
    });
    assert.equal(migrateLegacyPlatformSession(s), true);
    const d = s.dump();
    assert.equal(d.platform_token, 'T');
    assert.equal(d.platform_refresh_token, 'R');
    assert.equal(JSON.parse(d.platform_user).role, 'superadmin');
    assert.equal(d.staff_token, undefined);
    assert.equal(d.staff_user, undefined);
    assert.equal(d.staff_refresh_token, undefined);
    assert.equal(d.token, 'cust'); // customer untouched
    assert.equal(migrateLegacyPlatformSession(s), false); // idempotent
});

test('migration leaves tenant staff alone', () => {
    const s = memoryStorage({ staff_token: 'T', staff_user: JSON.stringify({ _id: 'a', role: 'admin' }) });
    assert.equal(migrateLegacyPlatformSession(s), false);
    assert.equal(s.dump().staff_token, 'T');
    assert.equal(s.dump().platform_token, undefined);
});

test('migration keeps an existing platform session', () => {
    const s = memoryStorage({
        staff_token: 'OLD', staff_user: JSON.stringify({ _id: 'sa', role: 'superadmin' }),
        platform_token: 'NEW', platform_user: JSON.stringify({ _id: 'sa2', role: 'superadmin' }),
    });
    assert.equal(migrateLegacyPlatformSession(s), true);
    const d = s.dump();
    assert.equal(d.platform_token, 'NEW');
    assert.equal(JSON.parse(d.platform_user)._id, 'sa2');
    assert.equal(d.staff_token, undefined);
});

test('migration tolerates malformed / empty storage', () => {
    assert.equal(migrateLegacyPlatformSession(memoryStorage()), false);
    assert.equal(migrateLegacyPlatformSession(memoryStorage({ staff_user: '{bad json' })), false);
});

if (process.exitCode) {
    console.error('auth-audience-test: FAILED');
} else {
    console.log(`auth-audience-test: ${passed} checks passed`);
}
