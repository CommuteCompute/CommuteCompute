#!/bin/bash
#
# Commute Compute Kindle Firmware Packager
# Creates distribution packages for each Kindle model
#
# Usage: ./package-firmware.sh [device]
#        ./package-firmware.sh all
#
# Copyright (c) 2026 Angus Bergman - AGPL-3.0
#

VERSION="2.0.0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
OUTPUT_DIR="$SCRIPT_DIR/dist"

DEVICES="kindle-pw3 kindle-pw4 kindle-pw5 kindle-basic-10 kindle-11"

package_device() {
    local device="$1"
    local device_dir="$SCRIPT_DIR/$device"
    
    if [ ! -d "$device_dir" ]; then
        echo "Error: Device directory not found: $device_dir"
        return 1
    fi
    
    echo "Packaging: $device"
    
    # Create temp directory
    local tmp_dir=$(mktemp -d)
    local pkg_dir="$tmp_dir/commute-compute"
    mkdir -p "$pkg_dir"
    
    # Copy common files
    cp "$SCRIPT_DIR/common/"* "$pkg_dir/"
    
    # Copy device-specific config
    cp "$device_dir/device-config.sh" "$pkg_dir/"
    
    # Ensure scripts are executable
    chmod +x "$pkg_dir/"*.sh
    
    # Create version file
    cat > "$pkg_dir/VERSION" << EOF
Commute Compute Kindle Firmware
Version: $VERSION
Device: $device
Built: $(date -u +"%Y-%m-%d %H:%M:%S UTC")
Firmware Compat: TRMNL v6.0
EOF
    
    # Create tarball
    mkdir -p "$OUTPUT_DIR"
    local tarball="$OUTPUT_DIR/commute-compute-${device}-v${VERSION}.tar.gz"
    tar -czf "$tarball" -C "$tmp_dir" commute-compute
    
    # Cleanup
    rm -rf "$tmp_dir"
    
    echo "  Created: $tarball"
    echo "  Size: $(du -h "$tarball" | cut -f1)"
}

package_all() {
    echo "=== Packaging All Kindle Devices ==="
    echo ""
    
    for device in $DEVICES; do
        package_device "$device"
        echo ""
    done
    
    echo "=== All packages created in $OUTPUT_DIR ==="
    ls -la "$OUTPUT_DIR"
}

show_help() {
    echo "Commute Compute Kindle Firmware Packager v$VERSION"
    echo ""
    echo "Usage: $0 [device|all]"
    echo ""
    echo "Devices:"
    for d in $DEVICES; do
        echo "  $d"
    done
    echo ""
    echo "Examples:"
    echo "  $0 kindle-pw5      # Package for Paperwhite 5"
    echo "  $0 all             # Package all devices"
}

# Main
case "$1" in
    all)
        package_all
        ;;
    kindle-pw3|kindle-pw4|kindle-pw5|kindle-basic-10|kindle-11)
        package_device "$1"
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        echo "Unknown device: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
