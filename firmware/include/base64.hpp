/**
 * Base64 Decoder for Arduino/ESP32
 * Minimal implementation for decoding base64 BMP data
 */

#ifndef BASE64_HPP
#define BASE64_HPP

#include <stdint.h>
#include <stddef.h>

static const char base64_chars[] = 
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static inline int base64_char_value(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
}

/**
 * Calculate decoded length from base64 string
 */
static inline size_t decode_base64_length(const unsigned char* input, size_t inputLen) {
    if (inputLen == 0) return 0;
    
    size_t padding = 0;
    if (inputLen >= 1 && input[inputLen - 1] == '=') padding++;
    if (inputLen >= 2 && input[inputLen - 2] == '=') padding++;
    
    return (inputLen * 3) / 4 - padding;
}

/**
 * Decode base64 string to binary
 */
static inline size_t decode_base64(const unsigned char* input, size_t inputLen, unsigned char* output) {
    if (inputLen == 0) return 0;
    
    size_t outputLen = 0;
    uint32_t buffer = 0;
    int bits = 0;
    
    for (size_t i = 0; i < inputLen; i++) {
        char c = input[i];
        
        // Skip whitespace
        if (c == '\n' || c == '\r' || c == ' ' || c == '\t') continue;
        
        // Stop at padding
        if (c == '=') break;
        
        int value = base64_char_value(c);
        if (value < 0) continue;  // Invalid char, skip
        
        buffer = (buffer << 6) | value;
        bits += 6;
        
        if (bits >= 8) {
            bits -= 8;
            output[outputLen++] = (buffer >> bits) & 0xFF;
        }
    }
    
    return outputLen;
}

#endif // BASE64_HPP
