/**
 * Compatibility shim for deployment platforms
 * This file exists for backwards compatibility with deployment platforms
 * that expect server.js in the root directory.
 *
 * The actual server code is in src/server.js
 */

// Import and run the actual server
import './src/server.js';
