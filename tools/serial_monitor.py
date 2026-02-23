#!/usr/bin/env python3
"""
Standalone Serial Monitor for ESP32-C3 TRMNL device
Runs independently to avoid timeout issues
"""

import os
import serial
import serial.tools.list_ports
import sys
import time
import argparse
import signal
from datetime import datetime

class SerialMonitor:
    def __init__(self, port=None, baud=115200, log_file=None):
        self.port = port
        self.baud = baud
        self.log_file = log_file
        self.serial = None
        self.running = True
        self.crash_patterns = [
            "Guru Meditation",
            "Load access fault",
            "Store access fault",
            "panic",
            "abort()",
            "assert failed",
            "Backtrace:",
            "Exception was unhandled",
            "Rebooting...",
        ]
        self.crash_log = []

    def find_device(self):
        """Auto-detect ESP32 device"""
        ports = serial.tools.list_ports.comports()
        for p in ports:
            if "usbmodem" in p.device or "usbserial" in p.device or "SLAB" in p.description:
                return p.device
        return None

    def connect(self, wait_for_device=True):
        """Connect to serial port with retry"""
        printed_waiting = False
        while self.running:
            try:
                # Always re-scan for device
                self.port = self.find_device()
                if not self.port:
                    if wait_for_device:
                        if not printed_waiting:
                            print("[WAITING] No device found. Plug in ESP32... (Ctrl+C to exit)")
                            printed_waiting = True
                        time.sleep(2)
                        continue
                    else:
                        print("[ERROR] No ESP32 device found. Available ports:")
                        for p in serial.tools.list_ports.comports():
                            print(f"  - {p.device}: {p.description}")
                        return False

                self.serial = serial.Serial(self.port, self.baud, timeout=1)
                print(f"[CONNECTED] {self.port} @ {self.baud} baud")
                return True
            except serial.SerialException as e:
                print(f"[ERROR] Cannot open {self.port}: {e}")
                if wait_for_device:
                    time.sleep(2)
                    continue
                return False
            except KeyboardInterrupt:
                return False
        return False

    def log(self, line):
        """Log a line to file if logging enabled"""
        if self.log_file:
            with open(self.log_file, "a") as f:
                timestamp = datetime.now().strftime("%H:%M:%S.%f")[:-3]
                f.write(f"[{timestamp}] {line}\n")

    def check_crash(self, line):
        """Check if line indicates a crash"""
        for pattern in self.crash_patterns:
            if pattern in line:
                return True
        return False

    def monitor(self):
        """Main monitoring loop"""
        in_crash = False
        crash_lines = []

        print("\n" + "="*60)
        print("SERIAL MONITOR ACTIVE - Press Ctrl+C to exit")
        print("="*60 + "\n")

        while self.running:
            try:
                if self.serial.in_waiting:
                    line = self.serial.readline().decode('utf-8', errors='replace').strip()
                    if line:
                        # Color output based on content
                        if self.check_crash(line):
                            in_crash = True
                            crash_lines = [line]
                            print(f"\033[91m{line}\033[0m")  # Red
                        elif in_crash:
                            crash_lines.append(line)
                            print(f"\033[91m{line}\033[0m")  # Red
                            if "Rebooting" in line or len(crash_lines) > 30:
                                # Save crash report
                                self.save_crash_report(crash_lines)
                                in_crash = False
                        elif "[STATE]" in line:
                            print(f"\033[94m{line}\033[0m")  # Blue
                        elif "[WiFi]" in line or "[BLE]" in line:
                            print(f"\033[92m{line}\033[0m")  # Green
                        elif "[Display]" in line:
                            print(f"\033[93m{line}\033[0m")  # Yellow
                        elif "ERROR" in line or "Error" in line:
                            print(f"\033[91m{line}\033[0m")  # Red
                        else:
                            print(line)

                        self.log(line)
                else:
                    time.sleep(0.01)

            except serial.SerialException as e:
                print(f"\n[DISCONNECTED] {e}")
                self.serial = None
                self.port = None
                if not self.connect(wait_for_device=True):
                    break
            except OSError as e:
                print(f"\n[DISCONNECTED] Device removed: {e}")
                self.serial = None
                self.port = None
                if not self.connect(wait_for_device=True):
                    break
            except KeyboardInterrupt:
                break

    def save_crash_report(self, lines):
        """Save crash report to file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        script_dir = os.path.dirname(os.path.abspath(__file__))
        repo_root = os.path.dirname(script_dir)
        crash_dir = os.path.join(repo_root, "crash_reports")
        filename = os.path.join(crash_dir, f"crash_{timestamp}.txt")

        # Ensure directory exists
        os.makedirs(crash_dir, exist_ok=True)

        with open(filename, "w") as f:
            f.write(f"CRASH REPORT - {datetime.now()}\n")
            f.write("="*60 + "\n\n")
            for line in lines:
                f.write(line + "\n")

        print(f"\n\033[95m[CRASH SAVED] {filename}\033[0m\n")

    def close(self):
        """Clean up"""
        self.running = False
        if self.serial and self.serial.is_open:
            self.serial.close()
        print("\n[CLOSED] Serial monitor stopped")


def main():
    parser = argparse.ArgumentParser(description="ESP32 Serial Monitor")
    parser.add_argument("-p", "--port", help="Serial port (auto-detect if not specified)")
    parser.add_argument("-b", "--baud", type=int, default=115200, help="Baud rate (default: 115200)")
    parser.add_argument("-l", "--log", help="Log file path")
    parser.add_argument("--reset", action="store_true", help="Send reset signal on connect")
    args = parser.parse_args()

    monitor = SerialMonitor(port=args.port, baud=args.baud, log_file=args.log)

    def signal_handler(sig, frame):
        monitor.close()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)

    if monitor.connect(wait_for_device=True):
        if args.reset:
            print("[RESET] Sending DTR pulse...")
            monitor.serial.dtr = False
            time.sleep(0.1)
            monitor.serial.dtr = True
        monitor.monitor()

    monitor.close()


if __name__ == "__main__":
    main()
