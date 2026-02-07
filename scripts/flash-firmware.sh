#!/bin/bash

# Commute Compute System Firmware Flashing Script
# Quick firmware flash without full setup

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         Commute Compute System Firmware Flash Tool                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Check PlatformIO
if ! command -v pio &> /dev/null; then
    echo -e "${RED}❌ PlatformIO not found${NC}"
    echo ""
    echo "Install with:"
    echo "  pip install platformio"
    echo ""
    exit 1
fi

# Check if in firmware directory
if [ ! -f "platformio.ini" ]; then
    # Check if in root directory
    if [ -d "firmware" ]; then
        echo -e "${BLUE}Switching to firmware directory...${NC}"
        cd firmware
    else
        echo -e "${RED}❌ Error: Not in Commute Compute System directory${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}🔍 Detecting devices...${NC}"
echo ""
pio device list

echo ""
echo -e "${BLUE}📦 Building firmware...${NC}"
pio run

echo ""
echo -e "${GREEN}✅ Build successful!${NC}"
echo ""

# Auto-detect port
PORT=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    PORT=$(ls /dev/cu.usbmodem* 2>/dev/null | head -n 1)
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    PORT=$(ls /dev/ttyACM* 2>/dev/null | head -n 1)
fi

if [ ! -z "$PORT" ]; then
    echo -e "${GREEN}✅ Auto-detected port: ${PORT}${NC}"
    read -p "Use this port? (Y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Nn]$ ]]; then
        PORT=""
    fi
fi

if [ -z "$PORT" ]; then
    echo ""
    read -p "Enter port (e.g., /dev/cu.usbmodem14101 or COM3): " PORT
fi

if [ -z "$PORT" ]; then
    echo -e "${RED}❌ No port specified${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}📤 Uploading firmware to ${PORT}...${NC}"
echo ""

pio run --target upload --upload-port $PORT

echo ""
echo -e "${GREEN}✅ Firmware flashed successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Monitoring serial output...${NC}"
echo -e "${YELLOW}Press Ctrl+C to exit${NC}"
echo ""
sleep 2

pio device monitor --port $PORT --baud 115200
