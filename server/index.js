/**
 * TruFleetX — Firebase Cloud Functions Entry Point
 *
 * This file is the entry point for Firebase Cloud Functions v2.
 * It wraps the Express.js app as a single Cloud Function named `api`.
 *
 * Firebase Hosting rewrites /api/** → this function (see firebase.json).
 * Local development: run `node server.js` or `npm run dev` directly.
 */

'use strict';

require('dotenv').config();

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

// ── Global defaults for ALL Cloud Functions in this project ─────────────────
setGlobalOptions({
    region: 'asia-south1',    // Mumbai — lowest latency for India
    memory: '512MiB',         // Sufficient for Express + Supabase calls
    timeoutSeconds: 60,       // Max request runtime before auto-terminate
    minInstances: 0,          // Cold-start acceptable; set 1 for zero-latency
});

// ── Import Express app (does NOT start an HTTP server — exports `app`) ──────
const app = require('./server');

// ── Export as Firebase Cloud Function ───────────────────────────────────────
//    Firebase Hosting rewrites:  /api/**  →  this function
exports.api = onRequest(app);
