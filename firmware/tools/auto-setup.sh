#!/bin/bash
# Automated Setup Script for CCFirm
# Configures device with test data and API keys

set -e

SERVER_URL="https://your-deployment.vercel.app"
MAC_ADDRESS="AA:BB:CC:DD:EE:FF"

# Test data
HOME_ADDRESS="Melbourne Central Station, Melbourne VIC 3000"
WORK_ADDRESS="Parliament Station, Melbourne VIC 3002"

# API Keys - replace with your own keys
GOOGLE_API_KEY="YOUR_GOOGLE_PLACES_API_KEY"
TRANSPORT_API_KEY="YOUR_TRANSPORT_VICTORIA_API_KEY"

echo "=========================================="
echo "CCFirm Automated Setup"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  Server: $SERVER_URL"
echo "  Device MAC: $MAC_ADDRESS"
echo "  Home: $HOME_ADDRESS"
echo "  Work: $WORK_ADDRESS"
echo ""
echo "=========================================="
echo ""

# Step 1: Register device (or get existing ID)
echo "Step 1: Registering device..."
REGISTER_RESPONSE=$(curl -s -X GET "$SERVER_URL/api/setup" \
  -H "ID: $MAC_ADDRESS" \
  -H "Content-Type: application/json")

FRIENDLY_ID=$(echo "$REGISTER_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('friendly_id', ''))" 2>/dev/null || echo "")
API_KEY=$(echo "$REGISTER_RESPONSE" | python3 -c "import sys, json; data=json.load(sys.stdin); print(data.get('api_key', ''))" 2>/dev/null || echo "")

if [ -z "$FRIENDLY_ID" ] || [ -z "$API_KEY" ]; then
    echo "❌ Registration failed!"
    echo "Response: $REGISTER_RESPONSE"
    exit 1
fi

echo "✅ Device registered!"
echo "   Friendly ID: $FRIENDLY_ID"
echo "   API Key: $API_KEY"
echo ""

# Step 2: Set up addresses
echo "Step 2: Configuring addresses..."
ADDRESS_PAYLOAD=$(cat <<EOF
{
  "journey": {
    "homeAddress": "$HOME_ADDRESS",
    "workAddress": "$WORK_ADDRESS"
  }
}
EOF
)

curl -s -X POST "$SERVER_URL/api/preferences" \
  -H "ID: $FRIENDLY_ID" \
  -H "Access-Token: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$ADDRESS_PAYLOAD" > /dev/null

echo "✅ Addresses configured"
echo ""

# Step 3: Set up API keys
echo "Step 3: Configuring API keys..."
API_PAYLOAD=$(cat <<EOF
{
  "apis": {
    "google": {
      "apiKey": "$GOOGLE_API_KEY"
    },
    "transport": {
      "apiKey": "$TRANSPORT_API_KEY"
    }
  }
}
EOF
)

curl -s -X POST "$SERVER_URL/api/preferences" \
  -H "ID: $FRIENDLY_ID" \
  -H "Access-Token: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$API_PAYLOAD" > /dev/null

echo "✅ API keys configured"
echo ""

# Step 4: Calculate journey
echo "Step 4: Calculating journey route..."
JOURNEY_PAYLOAD=$(cat <<EOF
{
  "homeAddress": "$HOME_ADDRESS",
  "workAddress": "$WORK_ADDRESS"
}
EOF
)

JOURNEY_RESPONSE=$(curl -s -X POST "$SERVER_URL/api/calculate-journey" \
  -H "ID: $FRIENDLY_ID" \
  -H "Access-Token: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$JOURNEY_PAYLOAD")

echo "$JOURNEY_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    if data.get('success'):
        print('✅ Journey calculated successfully!')
        route = data.get('route', {})
        mode1 = route.get('mode1', {})
        if mode1:
            print(f'   Mode 1: {mode1.get(\"mode\", \"?\")} - {mode1.get(\"departure\", \"?\")} → {mode1.get(\"arrival\", \"?\")}')
    else:
        print('⚠️  Journey calculation returned:', data.get('message', 'Unknown error'))
except:
    print('⚠️  Could not parse journey response')
" 2>/dev/null || echo "⚠️  Journey calculation response unclear"

echo ""

# Step 5: Verify setup status
echo "Step 5: Verifying setup status..."
DISPLAY_RESPONSE=$(curl -s -X GET "$SERVER_URL/api/display" \
  -H "ID: $FRIENDLY_ID" \
  -H "Access-Token: $API_KEY" \
  -H "FW-Version: 5.15")

echo "$DISPLAY_RESPONSE" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    setup_addresses = data.get('setup_addresses', False)
    setup_transit_api = data.get('setup_transit_api', False)
    setup_journey = data.get('setup_journey', False)

    print(f'   Addresses: {\"✅\" if setup_addresses else \"❌\"}')
    print(f'   Transit API: {\"✅\" if setup_transit_api else \"❌\"}')
    print(f'   Journey: {\"✅\" if setup_journey else \"❌\"}')
    print('')

    if setup_addresses and setup_transit_api and setup_journey:
        print('🎉 All setup complete!')
        print('   Device will switch to live dashboard on next refresh')
    else:
        print('⚠️  Some setup steps incomplete')
        print('   Device will show unified setup screen')
except Exception as e:
    print(f'Error: {e}')
" 2>/dev/null

echo ""
echo "=========================================="
echo "Setup Summary"
echo "=========================================="
echo "Device ID: $FRIENDLY_ID"
echo "Admin URL: $SERVER_URL/admin"
echo ""
echo "The device will:"
echo "  1. Connect to WiFi (if configured)"
echo "  2. Register with server (already done)"
echo "  3. Display setup screen → live dashboard"
echo ""
echo "Monitor device with:"
echo "  python3 ./firmware/tools/live-monitor.py"
echo "=========================================="
