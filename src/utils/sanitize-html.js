/**
 * HTML Sanitization Utility
 *
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 *
 * Prevents XSS attacks by escaping user-entered content before HTML rendering.
 * Use for addresses, stop names, and any user-provided text displayed in the UI.
 */

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - Untrusted string to sanitize
 * @returns {string} - Safe string with HTML entities escaped
 */
export function sanitizeHTML(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') str = String(str);
    
    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
        '`': '&#x60;',
        '=': '&#x3D;'
    };
    
    return str.replace(/[&<>"'`=/]/g, char => escapeMap[char]);
}

/**
 * Sanitize an object's string values recursively
 * @param {Object} obj - Object with potentially unsafe string values
 * @returns {Object} - New object with sanitized string values
 */
export function sanitizeObject(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return sanitizeHTML(obj);
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item));
    
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
    }
    return sanitized;
}

/**
 * Client-side sanitization function (for inline use in HTML)
 * Same logic as sanitizeHTML but designed for browser context
 */
export const clientSanitizer = `
function sanitize(str) {
    if (str === null || str === undefined) return '';
    if (typeof str !== 'string') str = String(str);
    const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;','/':'&#x2F;','\`':'&#x60;','=':'&#x3D;'};
    return str.replace(/[&<>"'\`=/]/g, c => map[c]);
}
`;

export default { sanitizeHTML, sanitizeObject, clientSanitizer };
