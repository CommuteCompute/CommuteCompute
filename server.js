// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 Angus Bergman
// Part of the Commute Compute System™ — https://gitlab.com/angusbergman/commute-compute-system
// Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE

/**
 * Compatibility shim for deployment platforms
 * This file exists for backwards compatibility with deployment platforms
 * that expect server.js in the root directory.
 *
 * The actual server code is in src/server.js
 */

// Import and run the actual server
import './src/server.js';
