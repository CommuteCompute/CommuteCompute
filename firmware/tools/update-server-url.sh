#!/bin/bash
# Update Server URL and Flash Firmware
# Usage: ./update-server-url.sh https://your-vercel-url.vercel.app

set -e

if [ -z "$1" ]; then
    echo "Usage: ./update-server-url.sh <new-server-url>"
    echo ""
    echo "Example:"
    echo "  ./update-server-url.sh https://commute-compute-abc123.vercel.app"
    echo ""
    exit 1
fi

NEW_URL="$1"

# Remove trailing slash if present
NEW_URL="${NEW_URL%/}"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  UPDATING FIRMWARE SERVER URL                             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "New URL: $NEW_URL"
echo ""

CONFIG_FILE="../include/config.h"
MAIN_FILE="../src/main.cpp"

# Backup files
echo "1. Creating backups..."
cp "$CONFIG_FILE" "${CONFIG_FILE}.backup"
cp "$MAIN_FILE" "${MAIN_FILE}.backup"
echo "   ✓ Backups created"
echo ""

# Update server URL in config.h
echo "2. Updating config.h..."
OLD_URL=$(grep '#define SERVER_URL' "$CONFIG_FILE" | cut -d'"' -f2)
echo "   Old: $OLD_URL"
echo "   New: $NEW_URL"

if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|#define SERVER_URL \".*\"|#define SERVER_URL \"$NEW_URL\"|" "$CONFIG_FILE"
else
    # Linux
    sed -i "s|#define SERVER_URL \".*\"|#define SERVER_URL \"$NEW_URL\"|" "$CONFIG_FILE"
fi
echo "   ✓ config.h updated"
echo ""

# Disable forced dashboard mode in main.cpp
echo "3. Disabling forced dashboard mode..."
if grep -q "bool forceEnableDashboard = true" "$MAIN_FILE"; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's/bool forceEnableDashboard = true/bool forceEnableDashboard = false/' "$MAIN_FILE"
    else
        sed -i 's/bool forceEnableDashboard = true/bool forceEnableDashboard = false/' "$MAIN_FILE"
    fi
    echo "   ✓ Forced mode disabled (now using server setup flags)"
else
    echo "   ℹ  Already disabled or not found"
fi
echo ""

# Verify changes
echo "4. Verifying changes..."
NEW_URL_CHECK=$(grep '#define SERVER_URL' "$CONFIG_FILE" | cut -d'"' -f2)
FORCE_MODE=$(grep "bool forceEnableDashboard" "$MAIN_FILE" | grep -o "true\|false" || echo "not found")

if [ "$NEW_URL_CHECK" = "$NEW_URL" ]; then
    echo "   ✓ URL updated correctly: $NEW_URL_CHECK"
else
    echo "   ✗ URL update failed!"
    exit 1
fi

echo "   ✓ Force mode: $FORCE_MODE"
echo ""

# Build and flash
echo "5. Building and flashing firmware..."
echo ""
cd ..
pio run -t upload

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  FIRMWARE UPDATE COMPLETE                                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Server URL: $NEW_URL"
echo "Force mode: disabled"
echo ""
echo "Next steps:"
echo "  1. Monitor device: python3 tools/live-monitor.py"
echo "  2. Watch for: 'Setup flags: ✓ Addresses, ✓ Transit API, ✓ Journey'"
echo "  3. Device should display live dashboard automatically"
echo ""
echo "Backups saved:"
echo "  - ${CONFIG_FILE}.backup"
echo "  - ${MAIN_FILE}.backup"
echo ""
