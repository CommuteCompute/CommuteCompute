#!/bin/sh
# Kindle Paperwhite 5 (11th gen) - Device Configuration
# Commute Compute Firmware v2.0
# Copyright (c) 2026 Angus Bergman - AGPL-3.0

# Device identification
export DEVICE_MODEL="kindle-pw5"
export DEVICE_RESOLUTION="1236x1648"
export DEVICE_PPI="300"
export DEVICE_ORIENTATION="portrait"

# API endpoint parameters (matches server /api/livedash)
export DEVICE_API_PARAM="device=kindle-pw5"

# Display settings
export CC_FULL_REFRESH_INTERVAL=15  # Full refresh every 15 updates
