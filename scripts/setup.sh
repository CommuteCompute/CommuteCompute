#!/bin/bash

# Commute Compute System Setup Script
# Automates first-time setup for new users

set -e  # Exit on error

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       Commute Compute System Setup Script                  ║"
echo "║       Version 2.0.0 (Zero-Config)                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if running in correct directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found${NC}"
    echo "Please run this script from the Commute Compute root directory"
    exit 1
fi

echo -e "${BLUE}🔍 Checking prerequisites...${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    echo "Please install Node.js 18+ from: https://nodejs.org/"
    exit 1
else
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js ${NODE_VERSION}${NC}"
fi

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
else
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✅ npm ${NPM_VERSION}${NC}"
fi

# Check Python (for PlatformIO)
if ! command -v python3 &> /dev/null && ! command -v python &> /dev/null; then
    echo -e "${YELLOW}⚠️  Python not found (optional for firmware)${NC}"
else
    if command -v python3 &> /dev/null; then
        PYTHON_VERSION=$(python3 --version)
    else
        PYTHON_VERSION=$(python --version)
    fi
    echo -e "${GREEN}✅ ${PYTHON_VERSION}${NC}"
fi

# Check PlatformIO (optional)
if command -v pio &> /dev/null; then
    PIO_VERSION=$(pio --version | head -n 1)
    echo -e "${GREEN}✅ ${PIO_VERSION}${NC}"
else
    echo -e "${YELLOW}⚠️  PlatformIO not found (needed for firmware flashing)${NC}"
    echo "   Install with: pip install platformio"
fi

echo ""
echo -e "${BLUE}📦 Installing backend dependencies...${NC}"
npm install --no-audit --no-fund

echo ""
echo -e "${BLUE}🔧 Setting up environment...${NC}"

# Check if .env exists
if [ -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env file already exists${NC}"
    read -p "Overwrite? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing .env file"
    else
        rm .env
        cp .env.example .env
        echo -e "${GREEN}✅ Created new .env from .env.example${NC}"
    fi
else
    cp .env.example .env
    echo -e "${GREEN}✅ Created .env from .env.example${NC}"
fi

echo ""
echo -e "${BLUE}ℹ️  Zero-Config Architecture${NC}"
echo ""
echo "Commute Compute uses Zero-Config architecture:"
echo "  • API keys are configured via the Setup Wizard"
echo "  • Keys are stored in Vercel KV (not environment variables)"
echo "  • No manual .env editing required for production"
echo ""
echo "For local development, you can optionally add keys to .env"
echo ""

read -p "Configure optional local development API keys? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    read -p "Google Places API key (or Enter to skip): " GOOGLE_KEY
    if [ ! -z "$GOOGLE_KEY" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/GOOGLE_PLACES_API_KEY=.*/GOOGLE_PLACES_API_KEY=$GOOGLE_KEY/" .env
        else
            sed -i "s/GOOGLE_PLACES_API_KEY=.*/GOOGLE_PLACES_API_KEY=$GOOGLE_KEY/" .env
        fi
        echo -e "${GREEN}✅ Google Places API key configured${NC}"
    fi

    echo ""
    read -p "Victorian Transport API key (or Enter to skip): " VIC_KEY
    if [ ! -z "$VIC_KEY" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/ODATA_API_KEY=.*/ODATA_API_KEY=$VIC_KEY/" .env
        else
            sed -i "s/ODATA_API_KEY=.*/ODATA_API_KEY=$VIC_KEY/" .env
        fi
        echo -e "${GREEN}✅ Victorian Transport API key configured${NC}"
    fi

    echo ""
    read -p "Redis URL for KV storage (or Enter to skip): " REDIS_KEY
    if [ ! -z "$REDIS_KEY" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s|REDIS_URL=.*|REDIS_URL=$REDIS_KEY|" .env
        else
            sed -i "s|REDIS_URL=.*|REDIS_URL=$REDIS_KEY|" .env
        fi
        echo -e "${GREEN}✅ Redis URL configured${NC}"
    fi
fi

echo ""
echo -e "${BLUE}🧪 Testing server...${NC}"

# Start server in background
npm start &
SERVER_PID=$!
sleep 5

# Test health endpoint
if curl -s http://localhost:3000/api/status > /dev/null; then
    echo -e "${GREEN}✅ Server started successfully${NC}"
    kill $SERVER_PID
else
    echo -e "${RED}❌ Server failed to start${NC}"
    kill $SERVER_PID 2>/dev/null
    exit 1
fi

echo ""
echo -e "${BLUE}📱 Firmware Setup${NC}"
echo ""

if command -v pio &> /dev/null; then
    read -p "Configure firmware now? (y/N): " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        read -p "Enter your server URL (e.g., https://your-app.vercel.app): " SERVER_URL

        if [ ! -z "$SERVER_URL" ]; then
            # Update config.h
            CONFIG_FILE="firmware/include/config.h"
            if [[ "$OSTYPE" == "darwin"* ]]; then
                sed -i '' "s|#define SERVER_URL \".*\"|#define SERVER_URL \"$SERVER_URL\"|" $CONFIG_FILE
            else
                sed -i "s|#define SERVER_URL \".*\"|#define SERVER_URL \"$SERVER_URL\"|" $CONFIG_FILE
            fi
            echo -e "${GREEN}✅ Server URL configured in firmware${NC}"

            echo ""
            echo -e "${BLUE}Building firmware...${NC}"
            cd firmware
            pio run
            echo -e "${GREEN}✅ Firmware built successfully${NC}"

            echo ""
            read -p "Flash to device now? (y/N): " -n 1 -r
            echo

            if [[ $REPLY =~ ^[Yy]$ ]]; then
                echo ""
                echo "Available ports:"
                pio device list
                echo ""
                read -p "Enter port (e.g., /dev/cu.usbmodem14101): " PORT

                if [ ! -z "$PORT" ]; then
                    pio run --target upload --upload-port $PORT
                    echo -e "${GREEN}✅ Firmware flashed successfully${NC}"
                fi
            fi

            cd ..
        fi
    fi
else
    echo -e "${YELLOW}⚠️  PlatformIO not installed - skipping firmware setup${NC}"
    echo "   Install with: pip install platformio"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                  SETUP COMPLETE! 🎉                         ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✅ Backend dependencies installed${NC}"
echo -e "${GREEN}✅ Environment configured${NC}"
echo -e "${GREEN}✅ Server tested${NC}"

if command -v pio &> /dev/null && [ -f "firmware/.pio/build/trmnl/firmware.elf" ]; then
    echo -e "${GREEN}✅ Firmware built${NC}"
fi

echo ""
echo -e "${BLUE}📖 Next Steps:${NC}"
echo ""
echo "1. Start the server:"
echo "   ${YELLOW}npm start${NC}"
echo ""
echo "2. Open Setup Wizard:"
echo "   ${YELLOW}http://localhost:3000/setup-wizard.html${NC}"
echo ""
echo "3. Configure your journey in the wizard:"
echo "   - Enter home & work addresses"
echo "   - Select your transit authority"
echo "   - Add API keys (optional)"
echo "   - Set arrival time"
echo ""
echo "4. For deployment:"
echo "   - See INSTALL.md for Vercel deployment"
echo "   - See firmware/QUICK_START.md for device setup"
echo ""
echo -e "${BLUE}📚 Documentation:${NC}"
echo "   • INSTALL.md - Complete installation guide"
echo "   • SETUP_GUIDE.md - Detailed setup guide"
echo "   • firmware/QUICK_START.md - Firmware quick reference"
echo "   • DEVELOPMENT-RULES.md - Development guidelines"
echo ""
echo "Happy commuting! 🚊☕"
echo ""
