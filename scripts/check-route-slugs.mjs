#!/usr/bin/env node
/**
 * check-route-slugs — guards the root-level restaurant landing pages
 * (/<restaurantSlug>) against app routes.
 *
 * Parses every absolute `path="/..."` in src/App.jsx and asserts its
 * first segment is listed in src/utils/reservedSlugs.js. Without this,
 * adding e.g. `/offers` to the app would silently collide with a
 * restaurant whose slug is "offers".
 *
 *     node scripts/check-route-slugs.mjs
 *
 * Also asserts the list matches Backend/utils/reservedSlugs.js (which
 * restaurant creation enforces) when the backend is checked out
 * alongside: a slug reserved only on the frontend would hide a real
 * restaurant's landing page.
 *
 * Exits non-zero (listing the offending segments) on failure.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(here, '..', 'src');

const appSource = readFileSync(path.join(srcRoot, 'App.jsx'), 'utf8');
const { RESERVED_SLUGS } = await import(pathToFileURL(path.join(srcRoot, 'utils', 'reservedSlugs.js')).href);

// Only absolute paths matter: nested (relative) paths inherit their
// parent's first segment, which is itself an absolute route.
const pathRe = /\bpath\s*=\s*(?:"([^"]*)"|'([^']*)'|\{\s*["'`]([^"'`]*)["'`]\s*\})/g;
const segments = new Map(); // segment -> first path seen
let match;
while ((match = pathRe.exec(appSource)) !== null) {
    const routePath = match[1] ?? match[2] ?? match[3] ?? '';
    if (!routePath.startsWith('/')) continue;
    const first = routePath.split('/').filter(Boolean)[0];
    // `/` itself, the landing routes (`/:slug`) and the catch-all have no
    // static first segment to reserve.
    if (!first || first.startsWith(':') || first === '*') continue;
    if (!segments.has(first)) segments.set(first, routePath);
}

if (segments.size === 0) {
    console.error('check-route-slugs: no routes found in App.jsx — has the file moved?');
    process.exit(1);
}

const missing = [...segments.entries()].filter(([seg]) => !RESERVED_SLUGS.has(seg.toLowerCase()));
if (missing.length) {
    console.error('check-route-slugs: these App.jsx route segments are not reserved in src/utils/reservedSlugs.js:');
    for (const [seg, p] of missing) console.error(`  - "${seg}"  (from ${p})`);
    console.error('Add them to APP_ROUTE_SEGMENTS so a restaurant slug can never shadow the route.');
    process.exit(1);
}

let backendNote = 'backend list not found — parity skipped';
const backendFile = path.resolve(here, '..', '..', 'Backend', 'utils', 'reservedSlugs.js');
if (existsSync(backendFile)) {
    const backend = createRequire(import.meta.url)(backendFile).RESERVED_SLUGS;
    const onlyFrontend = [...RESERVED_SLUGS].filter(s => !backend.has(s));
    const onlyBackend = [...backend].filter(s => !RESERVED_SLUGS.has(s));
    if (onlyFrontend.length || onlyBackend.length) {
        console.error('check-route-slugs: src/utils/reservedSlugs.js and Backend/utils/reservedSlugs.js differ:');
        if (onlyFrontend.length) console.error(`  only in frontend: ${onlyFrontend.join(', ')}`);
        if (onlyBackend.length) console.error(`  only in backend:  ${onlyBackend.join(', ')}`);
        process.exit(1);
    }
    backendNote = `matches Backend/utils/reservedSlugs.js (${backend.size} slugs)`;
}

console.log(`check-route-slugs: OK — ${segments.size} route segments, all reserved; ${backendNote}.`);
