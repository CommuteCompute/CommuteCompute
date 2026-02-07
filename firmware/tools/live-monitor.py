#!/usr/bin/env python3
"""
CCFirm Live Serial Monitor
Continuously displays serial output from the device
"""

import serial
import sys
import time
from datetime import datetime

SERIAL_PORT = "/dev/cu.usbmodem14101"
BAUD_RATE = 115200

def monitor():
    print("=" * 60)
    print("CCFirm Live Serial Monitor")
    print("=" * 60)
    print(f"Port: {SERIAL_PORT}")
    print(f"Baud: {BAUD_RATE}")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    print()
    print("Waiting for device output...")
    print("Press Ctrl+C to stop")
    print()

    try:
        ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
        time.sleep(0.5)  # Let serial stabilize

        line_count = 0
        last_output = time.time()

        while True:
            try:
                if ser.in_waiting > 0:
                    line = ser.readline()
                    try:
                        decoded = line.decode('utf-8', errors='ignore').strip()
                        if decoded:
                            timestamp = datetime.now().strftime('%H:%M:%S')
                            print(f"[{timestamp}] {decoded}")
                            sys.stdout.flush()
                            line_count += 1
                            last_output = time.time()

                            # Check for crash indicators
                            lower = decoded.lower()
                            if any(word in lower for word in ['panic', 'abort', 'exception', 'guru meditation', 'wdt', 'crash']):
                                print(f"\n{'!' * 60}")
                                print(f"⚠️  CRASH/ERROR DETECTED: {decoded}")
                                print(f"{'!' * 60}\n")

                    except Exception as e:
                        pass
                else:
                    # Check if device has been silent for too long
                    silence_duration = time.time() - last_output
                    if silence_duration > 60 and line_count > 0:
                        print(f"\n⚠️  No output for {int(silence_duration)}s (possible freeze)\n")
                        last_output = time.time()  # Reset to avoid spam

                    time.sleep(0.1)

            except serial.SerialException as e:
                print(f"\n❌ Serial error: {e}")
                print("Waiting 2s before reconnecting...")
                time.sleep(2)
                try:
                    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
                    print("✅ Reconnected")
                except:
                    pass

    except KeyboardInterrupt:
        print("\n\n" + "=" * 60)
        print(f"Monitor stopped - Captured {line_count} lines")
        print("=" * 60)
    except Exception as e:
        print(f"\n❌ Error: {e}")
    finally:
        try:
            ser.close()
        except:
            pass

if __name__ == "__main__":
    monitor()
