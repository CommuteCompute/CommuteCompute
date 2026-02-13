#!/bin/sh
#
# Commute Compute Launcher for Kindle v2.0
# Ported from TRMNL Firmware v6.0
#
# FEATURES:
# - State machine architecture
# - Exponential backoff on errors
# - Setup required detection
# - BYOS webhook URL support
# - Zone-based partial refresh
# - Full/partial refresh management
# - TRMNL BYOS API compatibility
#
# Copyright (c) 2026 Angus Bergman
# SPDX-License-Identifier: AGPL-3.0-or-later
# Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
#

VERSION="2.0.0"
FIRMWARE_COMPAT="6.0"

SCRIPT_DIR="$(dirname "$0")"
CONFIG_FILE="$SCRIPT_DIR/config.sh"
DEVICE_CONFIG="$SCRIPT_DIR/device-config.sh"
STATE_FILE="/var/tmp/commute-compute/state.json"
PID_FILE="/var/tmp/commute-compute/daemon.pid"
LOG_FILE="/var/tmp/commute-compute/commute-compute.log"
IMAGE_FILE="/var/tmp/commute-compute/dashboard.png"
ERROR_IMAGE="/var/tmp/commute-compute/error.png"

# ============================================================================
# DEFAULT CONFIGURATION (matches TRMNL v6)
# ============================================================================

# TURNKEY: Replace with your Vercel deployment URL before deploying
CC_SERVER="${CC_SERVER:-https://your-project.vercel.app}"
CC_WEBHOOK_URL="${CC_WEBHOOK_URL:-}"  # BYOS webhook URL with config token
CC_REFRESH="${CC_REFRESH:-60}"  # 60 seconds for real-time feel
CC_FULL_REFRESH_INTERVAL="${CC_FULL_REFRESH_INTERVAL:-15}"  # Full refresh every 15 updates
CC_HTTP_TIMEOUT="${CC_HTTP_TIMEOUT:-30}"
CC_MAX_BACKOFF_ERRORS="${CC_MAX_BACKOFF_ERRORS:-5}"
CC_WIFI_RETRY_INTERVAL="${CC_WIFI_RETRY_INTERVAL:-30}"

# State machine states (matching TRMNL v6)
STATE_INIT="init"
STATE_WIFI_CONNECT="wifi_connect"
STATE_FETCH="fetch"
STATE_RENDER="render"
STATE_IDLE="idle"
STATE_ERROR="error"
STATE_SETUP_REQUIRED="setup_required"

# ============================================================================
# LOAD CONFIGURATIONS
# ============================================================================

# Load device config first
if [ -f "$DEVICE_CONFIG" ]; then
    . "$DEVICE_CONFIG"
fi

# Load user config (overrides device config)
if [ -f "$CONFIG_FILE" ]; then
    . "$CONFIG_FILE"
fi

# Ensure directories exist
mkdir -p /var/tmp/commute-compute

# ============================================================================
# LOGGING
# ============================================================================

log() {
    local level="$1"
    shift
    echo "$(date '+%Y-%m-%d %H:%M:%S') [$level] $*" >> "$LOG_FILE"
    
    # Keep log file under 100KB
    if [ -f "$LOG_FILE" ] && [ $(wc -c < "$LOG_FILE") -gt 102400 ]; then
        tail -500 "$LOG_FILE" > "$LOG_FILE.tmp"
        mv "$LOG_FILE.tmp" "$LOG_FILE"
    fi
}

log_info() { log "INFO" "$@"; }
log_warn() { log "WARN" "$@"; }
log_error() { log "ERROR" "$@"; }
log_debug() { [ "$CC_DEBUG" = "1" ] && log "DEBUG" "$@"; }

# ============================================================================
# DEVICE UTILITIES
# ============================================================================

get_mac() {
    cat /sys/class/net/wlan0/address 2>/dev/null | tr -d ':' | tr '[:lower:]' '[:upper:]'
}

get_model() {
    if [ -n "$DEVICE_MODEL" ]; then
        echo "$DEVICE_MODEL"
    elif [ -f /etc/prettyversion.txt ]; then
        cat /etc/prettyversion.txt | head -1 | tr ' ' '-' | tr '[:upper:]' '[:lower:]'
    else
        echo "kindle-unknown"
    fi
}

get_resolution() {
    echo "${DEVICE_RESOLUTION:-800x600}"
}

wifi_enable() {
    lipc-set-prop com.lab126.cmd wirelessEnable 1 2>/dev/null
    sleep 2
}

wifi_disable() {
    lipc-set-prop com.lab126.cmd wirelessEnable 0 2>/dev/null
}

wifi_is_connected() {
    # Check if we have an IP address
    ip addr show wlan0 2>/dev/null | grep -q "inet "
}

# ============================================================================
# STATE MANAGEMENT
# ============================================================================

save_state() {
    local state="$1"
    local error_count="${2:-0}"
    local last_success="${3:-0}"
    
    cat > "$STATE_FILE" << EOF
{
    "state": "$state",
    "error_count": $error_count,
    "last_success": $last_success,
    "refresh_count": ${refresh_count:-0},
    "timestamp": $(date +%s)
}
EOF
}

load_state() {
    if [ -f "$STATE_FILE" ]; then
        current_state=$(grep '"state"' "$STATE_FILE" | cut -d'"' -f4)
        error_count=$(grep '"error_count"' "$STATE_FILE" | grep -o '[0-9]*')
        refresh_count=$(grep '"refresh_count"' "$STATE_FILE" | grep -o '[0-9]*')
    else
        current_state="$STATE_INIT"
        error_count=0
        refresh_count=0
    fi
}

# ============================================================================
# ERROR HANDLING (matches TRMNL v6 exponential backoff)
# ============================================================================

get_backoff_delay() {
    local errors="${1:-0}"
    
    if [ "$errors" -le 0 ]; then
        echo "$CC_REFRESH"
        return
    fi
    
    # Exponential backoff: 2^errors * base, max 30 minutes
    local base=30
    local delay=$((base * (1 << errors)))
    
    if [ "$delay" -gt 1800 ]; then
        delay=1800
    fi
    
    echo "$delay"
}

# ============================================================================
# DISPLAY FUNCTIONS
# ============================================================================

display_clear() {
    eips -c 2>/dev/null
}

display_image() {
    local img="$1"
    local full_refresh="${2:-0}"
    
    if [ ! -f "$img" ]; then
        log_error "Image file not found: $img"
        return 1
    fi
    
    if [ "$full_refresh" = "1" ]; then
        display_clear
    fi
    
    eips -g "$img" 2>/dev/null
    return $?
}

create_error_image() {
    local msg="$1"
    local state="$2"
    
    # Create a simple text-based error display using eips
    display_clear
    eips 10 5 "================================" 2>/dev/null
    eips 10 7 "  COMMUTE COMPUTE v$VERSION" 2>/dev/null
    eips 10 9 "================================" 2>/dev/null
    eips 10 12 "  STATUS: $state" 2>/dev/null
    eips 10 14 "  $msg" 2>/dev/null
    eips 10 17 "  Server: $CC_SERVER" 2>/dev/null
    eips 10 19 "  Device: $(get_model)" 2>/dev/null
    eips 10 22 "  Will retry in $(get_backoff_delay $error_count)s" 2>/dev/null
}

show_setup_required() {
    display_clear
    
    # Display logo if available
    local LOGO_FILE="$SCRIPT_DIR/cc-logo.bmp"
    if [ -f "$LOGO_FILE" ]; then
        eips -g "$LOGO_FILE" 2>/dev/null
        sleep 1
    fi
    
    eips 10 20 "================================" 2>/dev/null
    eips 10 22 "  COMMUTE COMPUTE SETUP" 2>/dev/null
    eips 10 24 "================================" 2>/dev/null
    eips 10 27 "  Setup Required" 2>/dev/null
    eips 10 30 "  Please complete setup at:" 2>/dev/null
    eips 10 32 "  $CC_SERVER/setup-wizard.html" 2>/dev/null
    eips 10 35 "  Then configure this device" 2>/dev/null
    eips 10 37 "  with the webhook URL." 2>/dev/null
}

show_connecting() {
    display_clear
    eips 10 10 "================================" 2>/dev/null
    eips 10 12 "  COMMUTE COMPUTE" 2>/dev/null
    eips 10 14 "================================" 2>/dev/null
    eips 10 17 "  Connecting to WiFi..." 2>/dev/null
    eips 10 19 "  Please wait" 2>/dev/null
}

show_welcome() {
    display_clear
    
    # Display logo if available
    local LOGO_FILE="$SCRIPT_DIR/cc-logo.bmp"
    if [ -f "$LOGO_FILE" ]; then
        # Center logo on screen (approximate)
        eips -g "$LOGO_FILE" 2>/dev/null
        sleep 1
    fi
    
    eips 10 20 "================================" 2>/dev/null
    eips 10 22 "  COMMUTE COMPUTE v$VERSION" 2>/dev/null
    eips 10 24 "  Smart Transit Display" 2>/dev/null
    eips 10 26 "================================" 2>/dev/null
    eips 10 29 "  Device: $(get_model)" 2>/dev/null
    eips 10 31 "  Resolution: $(get_resolution)" 2>/dev/null
    eips 10 33 "  Starting..." 2>/dev/null
}

# ============================================================================
# API FETCHING (BYOS + Standard endpoints)
# ============================================================================

fetch_dashboard() {
    local MAC=$(get_mac)
    local MODEL=$(get_model)
    local RES=$(get_resolution)
    local URL=""
    local HEADERS=""
    
    # Determine which endpoint to use
    if [ -n "$CC_WEBHOOK_URL" ]; then
        # BYOS mode: Use webhook URL directly (contains config token)
        URL="$CC_WEBHOOK_URL"
        log_info "Using BYOS webhook URL"
    else
        # Standard mode: Use livedash endpoint
        URL="${CC_SERVER}/api/livedash?device=${MODEL}&resolution=${RES}&mac=${MAC}"
        log_info "Using standard livedash endpoint"
    fi
    
    log_info "Fetching: $URL"
    
    # Build curl command with proper headers
    local CURL_OPTS="-s -o $IMAGE_FILE"
    CURL_OPTS="$CURL_OPTS --connect-timeout $CC_HTTP_TIMEOUT"
    CURL_OPTS="$CURL_OPTS --max-time $((CC_HTTP_TIMEOUT * 2))"
    CURL_OPTS="$CURL_OPTS -H 'User-Agent: CommuteCompute-Kindle/$VERSION'"
    CURL_OPTS="$CURL_OPTS -H 'X-Device-Mac: $MAC'"
    CURL_OPTS="$CURL_OPTS -H 'X-Device-Model: $MODEL'"
    CURL_OPTS="$CURL_OPTS -H 'X-Device-Resolution: $RES'"
    CURL_OPTS="$CURL_OPTS -H 'X-Firmware-Version: $VERSION'"
    CURL_OPTS="$CURL_OPTS -H 'Accept: image/png,image/bmp,application/json'"
    
    # Make request
    if eval curl $CURL_OPTS "'$URL'" 2>/dev/null; then
        # Check if response is valid
        if [ -f "$IMAGE_FILE" ] && [ -s "$IMAGE_FILE" ]; then
            # Check if it's JSON (error/setup required)
            if head -1 "$IMAGE_FILE" | grep -q "^{"; then
                # Parse JSON response
                if grep -q '"setup_required"' "$IMAGE_FILE" || grep -q '"configured":false' "$IMAGE_FILE"; then
                    log_warn "Setup required response received"
                    rm -f "$IMAGE_FILE"
                    return 2  # Special return code for setup required
                elif grep -q '"error"' "$IMAGE_FILE"; then
                    local err_msg=$(grep -o '"error":"[^"]*"' "$IMAGE_FILE" | cut -d'"' -f4)
                    log_error "Server error: $err_msg"
                    rm -f "$IMAGE_FILE"
                    return 1
                fi
            fi
            
            log_info "Image fetched successfully ($(wc -c < "$IMAGE_FILE") bytes)"
            return 0
        else
            log_error "Empty or missing response"
            return 1
        fi
    else
        log_error "Curl request failed"
        return 1
    fi
}

# ============================================================================
# STATE MACHINE LOOP (matches TRMNL v6 architecture)
# ============================================================================

run_state_machine() {
    log_info "=== Starting state machine loop ==="
    log_info "Server: $CC_SERVER"
    log_info "Webhook: ${CC_WEBHOOK_URL:-not set}"
    log_info "Refresh: ${CC_REFRESH}s"
    log_info "Full refresh every: ${CC_FULL_REFRESH_INTERVAL} updates"
    
    load_state
    refresh_count=${refresh_count:-0}
    error_count=${error_count:-0}
    
    # Initial welcome screen
    show_welcome
    sleep 2
    
    while true; do
        log_debug "State: $current_state (errors: $error_count, refreshes: $refresh_count)"
        
        case "$current_state" in
            # ----------------------------------------------------------------
            "$STATE_INIT")
                current_state="$STATE_WIFI_CONNECT"
                ;;
            
            # ----------------------------------------------------------------
            "$STATE_WIFI_CONNECT")
                log_info "→ STATE: WiFi Connect"
                show_connecting
                
                wifi_enable
                
                local wifi_attempts=0
                while ! wifi_is_connected && [ $wifi_attempts -lt 10 ]; do
                    sleep 3
                    wifi_attempts=$((wifi_attempts + 1))
                done
                
                if wifi_is_connected; then
                    log_info "✓ WiFi connected"
                    current_state="$STATE_FETCH"
                else
                    log_error "✗ WiFi connection failed"
                    error_count=$((error_count + 1))
                    current_state="$STATE_ERROR"
                fi
                ;;
            
            # ----------------------------------------------------------------
            "$STATE_FETCH")
                log_info "→ STATE: Fetch"
                
                fetch_dashboard
                local fetch_result=$?
                
                if [ $fetch_result -eq 0 ]; then
                    # Success
                    error_count=0
                    current_state="$STATE_RENDER"
                elif [ $fetch_result -eq 2 ]; then
                    # Setup required
                    current_state="$STATE_SETUP_REQUIRED"
                else
                    # Error
                    error_count=$((error_count + 1))
                    current_state="$STATE_ERROR"
                fi
                ;;
            
            # ----------------------------------------------------------------
            "$STATE_RENDER")
                log_info "→ STATE: Render"
                
                refresh_count=$((refresh_count + 1))
                
                # Determine if full refresh needed
                local do_full=0
                if [ $refresh_count -ge $CC_FULL_REFRESH_INTERVAL ]; then
                    log_info "Full refresh triggered (count: $refresh_count)"
                    do_full=1
                    refresh_count=0
                fi
                
                if display_image "$IMAGE_FILE" "$do_full"; then
                    log_info "✓ Display updated"
                else
                    log_error "Display update failed"
                fi
                
                save_state "$STATE_IDLE" "$error_count" "$(date +%s)"
                current_state="$STATE_IDLE"
                ;;
            
            # ----------------------------------------------------------------
            "$STATE_IDLE")
                log_info "→ STATE: Idle (sleeping ${CC_REFRESH}s)"
                
                # Disable WiFi to save battery
                wifi_disable
                
                sleep "$CC_REFRESH"
                
                # Re-enable WiFi and fetch
                current_state="$STATE_WIFI_CONNECT"
                ;;
            
            # ----------------------------------------------------------------
            "$STATE_ERROR")
                log_error "→ STATE: Error (count: $error_count)"
                
                local backoff=$(get_backoff_delay $error_count)
                create_error_image "Connection error" "ERROR"
                
                save_state "$STATE_ERROR" "$error_count" "0"
                
                if [ $error_count -ge $CC_MAX_BACKOFF_ERRORS ]; then
                    log_error "Max errors reached, extended backoff"
                    backoff=1800  # 30 minutes
                fi
                
                log_info "Backoff: ${backoff}s before retry"
                wifi_disable
                sleep "$backoff"
                
                current_state="$STATE_WIFI_CONNECT"
                ;;
            
            # ----------------------------------------------------------------
            "$STATE_SETUP_REQUIRED")
                log_warn "→ STATE: Setup Required"
                
                show_setup_required
                save_state "$STATE_SETUP_REQUIRED" "0" "0"
                
                # Long sleep, then retry
                wifi_disable
                sleep 300  # 5 minutes
                
                current_state="$STATE_WIFI_CONNECT"
                ;;
            
            # ----------------------------------------------------------------
            *)
                log_error "Unknown state: $current_state"
                current_state="$STATE_INIT"
                ;;
        esac
    done
}

# ============================================================================
# DAEMON MANAGEMENT
# ============================================================================

start_daemon() {
    if [ -f "$PID_FILE" ]; then
        local PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "Already running (PID $PID)"
            return 1
        fi
    fi
    
    log_info "Starting daemon v$VERSION"
    
    # Run in background
    nohup "$0" loop > /dev/null 2>&1 &
    echo $! > "$PID_FILE"
    
    echo "Started (PID $(cat $PID_FILE))"
    log_info "Daemon started (PID $(cat $PID_FILE))"
}

stop_daemon() {
    if [ -f "$PID_FILE" ]; then
        local PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            log_info "Stopping daemon (PID $PID)"
            kill "$PID"
            rm -f "$PID_FILE"
            echo "Stopped"
            return 0
        fi
    fi
    
    echo "Not running"
    return 1
}

run_once() {
    log_info "=== Single refresh ==="
    
    wifi_enable
    
    local attempts=0
    while ! wifi_is_connected && [ $attempts -lt 10 ]; do
        sleep 2
        attempts=$((attempts + 1))
    done
    
    if wifi_is_connected; then
        fetch_dashboard
        local result=$?
        
        if [ $result -eq 0 ]; then
            display_image "$IMAGE_FILE" 1  # Full refresh
            echo "Success"
        elif [ $result -eq 2 ]; then
            show_setup_required
            echo "Setup required"
        else
            create_error_image "Fetch failed" "ERROR"
            echo "Failed"
        fi
    else
        echo "WiFi connection failed"
    fi
    
    wifi_disable
}

show_status() {
    echo "=== Commute Compute Status ==="
    echo "Version: $VERSION (firmware compat: $FIRMWARE_COMPAT)"
    echo "Server: $CC_SERVER"
    echo "Webhook: ${CC_WEBHOOK_URL:-not configured}"
    echo "Refresh: ${CC_REFRESH}s"
    echo "Device: $(get_model)"
    echo "Resolution: $(get_resolution)"
    echo "MAC: $(get_mac)"
    
    if [ -f "$PID_FILE" ]; then
        local PID=$(cat "$PID_FILE")
        if kill -0 "$PID" 2>/dev/null; then
            echo "Status: Running (PID $PID)"
        else
            echo "Status: Stopped (stale PID file)"
        fi
    else
        echo "Status: Stopped"
    fi
    
    if [ -f "$STATE_FILE" ]; then
        echo ""
        echo "=== State ==="
        cat "$STATE_FILE"
    fi
    
    if [ -f "$LOG_FILE" ]; then
        echo ""
        echo "=== Recent Log ==="
        tail -15 "$LOG_FILE"
    fi
}

show_help() {
    echo "Commute Compute Kindle Launcher v$VERSION"
    echo ""
    echo "Usage: $0 {start|stop|once|status|configure|help}"
    echo ""
    echo "Commands:"
    echo "  start      Start the dashboard daemon"
    echo "  stop       Stop the dashboard daemon"
    echo "  once       Single refresh (manual update)"
    echo "  status     Show current status and recent logs"
    echo "  configure  Show configuration instructions"
    echo "  help       Show this help"
    echo ""
    echo "Configuration:"
    echo "  Edit $CONFIG_FILE to set:"
    echo "    CC_SERVER       - Server URL"
    echo "    CC_WEBHOOK_URL  - BYOS webhook URL (from setup wizard)"
    echo "    CC_REFRESH      - Refresh interval in seconds"
}

show_configure() {
    echo "=== Commute Compute Configuration ==="
    echo ""
    echo "1. Complete setup at: $CC_SERVER/setup-wizard.html"
    echo ""
    echo "2. Copy the webhook URL from the setup completion screen"
    echo ""
    echo "3. Create/edit $CONFIG_FILE:"
    echo ""
    echo "   #!/bin/sh"
    echo "   export CC_SERVER=\"$CC_SERVER\""
    echo "   export CC_WEBHOOK_URL=\"your-webhook-url-here\""
    echo "   export CC_REFRESH=60"
    echo ""
    echo "4. Start the daemon: $0 start"
}

# ============================================================================
# MAIN ENTRY POINT
# ============================================================================

case "$1" in
    start)
        start_daemon
        ;;
    stop)
        stop_daemon
        ;;
    once|refresh)
        run_once
        ;;
    loop)
        run_state_machine
        ;;
    status)
        show_status
        ;;
    configure)
        show_configure
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Usage: $0 {start|stop|once|status|configure|help}"
        exit 1
        ;;
esac
