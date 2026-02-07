#!/usr/bin/env python3
"""
CCFirm Auto-Iteration System
Automatically captures display, analyzes layout, modifies firmware, and reflashes
until the dashboard matches expected design.

Usage:
    python3 auto-iterate.py --max-iterations 5
"""

import sys
import os
import time
import json
import argparse
import subprocess
from pathlib import Path
from datetime import datetime

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

try:
    from visual_monitor import DisplayMonitor
except ImportError:
    print("❌ visual_monitor.py not found. Make sure it's in the same directory.")
    sys.exit(1)

# Configuration
FIRMWARE_DIR = Path.home() / "commute-compute" / "firmware"
MAIN_CPP = FIRMWARE_DIR / "src/main.cpp"
ITERATION_LOG = FIRMWARE_DIR / "tools/iteration_log.json"

class AutoIterator:
    def __init__(self):
        self.monitor = DisplayMonitor()
        self.iteration = 0
        self.log = []
        self.load_log()

    def load_log(self):
        """Load previous iteration log"""
        if ITERATION_LOG.exists():
            with open(ITERATION_LOG, 'r') as f:
                self.log = json.load(f)
            print(f"📖 Loaded {len(self.log)} previous iterations")

    def save_log(self):
        """Save iteration log"""
        with open(ITERATION_LOG, 'w') as f:
            json.dump(self.log, f, indent=2)

    def capture_and_analyze(self):
        """Capture current display state and analyze"""
        print("\n" + "="*60)
        print(f"📸 ITERATION {self.iteration}: CAPTURE & ANALYSIS")
        print("="*60)

        # Wait for display to stabilize
        print("⏳ Waiting 3 seconds for display to stabilize...")
        time.sleep(3)

        # Capture
        frame = self.monitor.capture_frame()
        image_path = self.monitor.save_capture(frame, prefix=f"iter{self.iteration:03d}")

        # Analyze
        print("🔍 Analyzing layout...")
        analysis = self.monitor.analyze_layout(image_path)

        # Generate report
        report = self.monitor.generate_report(analysis)
        print(report)

        # Save analysis
        analysis_path = image_path.parent / f"{image_path.stem}_analysis.json"
        with open(analysis_path, 'w') as f:
            json.dump(analysis, f, indent=2)

        return analysis

    def determine_fixes(self, analysis):
        """
        Determine what fixes are needed based on analysis
        Returns list of fixes to apply
        """
        fixes = []

        # QR code issues
        if "qr_code" not in analysis["regions"]:
            fixes.append({
                "type": "qr_code_missing",
                "description": "QR code not detected",
                "action": "Increase QR code scale or move position"
            })
        else:
            qr = analysis["regions"]["qr_code"]
            if qr["area"] < 10000:
                fixes.append({
                    "type": "qr_code_small",
                    "description": "QR code too small",
                    "action": "Increase qrScale parameter"
                })

        # Brightness issues
        if analysis["brightness"] < 100:
            fixes.append({
                "type": "brightness_low",
                "description": "Image too dark",
                "action": "Improve lighting or wait for full refresh"
            })

        # Contrast issues
        if analysis["contrast"] < 30:
            fixes.append({
                "type": "contrast_low",
                "description": "Low contrast - display may not have refreshed",
                "action": "Force full refresh or increase refresh rate"
            })

        # Rotation issues
        for issue in analysis.get("issues", []):
            if "rotation" in issue.lower():
                fixes.append({
                    "type": "text_rotation",
                    "description": issue,
                    "action": "Check font settings and setRotation()"
                })

        # Text density
        text_regions = analysis["regions"].get("text", [])
        if len(text_regions) < 5:
            fixes.append({
                "type": "text_missing",
                "description": "Less text detected than expected",
                "action": "Check if text is rendering or if display needs refresh"
            })

        return fixes

    def apply_fixes(self, fixes):
        """
        Apply firmware fixes based on analysis
        Modifies main.cpp automatically
        """
        if not fixes:
            print("✅ No fixes needed!")
            return True

        print(f"\n🔧 APPLYING {len(fixes)} FIXES")
        print("-"*60)

        applied = []
        for fix in fixes:
            print(f"\n🔨 {fix['type']}: {fix['description']}")
            print(f"   Action: {fix['action']}")

            success = False

            if fix["type"] == "qr_code_small":
                success = self.increase_qr_scale()
            elif fix["type"] == "qr_code_missing":
                success = self.adjust_qr_position()
            elif fix["type"] == "contrast_low":
                success = self.force_full_refresh()

            if success:
                applied.append(fix)
                print(f"   ✅ Applied")
            else:
                print(f"   ⚠️  Manual intervention needed")

        return len(applied) > 0

    def increase_qr_scale(self):
        """Increase QR code scale in firmware"""
        try:
            with open(MAIN_CPP, 'r') as f:
                content = f.read()

            # Find current scale
            import re
            match = re.search(r'int qrScale = (\d+);', content)
            if match:
                current_scale = int(match.group(1))
                new_scale = min(current_scale + 1, 10)  # Max scale 10

                content = content.replace(
                    f'int qrScale = {current_scale};',
                    f'int qrScale = {new_scale};'
                )

                with open(MAIN_CPP, 'w') as f:
                    f.write(content)

                print(f"   Changed qrScale: {current_scale} → {new_scale}")
                return True

        except Exception as e:
            print(f"   ❌ Error: {e}")

        return False

    def adjust_qr_position(self):
        """Adjust QR code position"""
        try:
            with open(MAIN_CPP, 'r') as f:
                content = f.read()

            # Move QR code higher
            import re
            match = re.search(r'int qrY = (\d+);', content)
            if match:
                current_y = int(match.group(1))
                new_y = max(current_y - 20, 60)  # Don't go above header

                content = content.replace(
                    f'int qrY = {current_y};',
                    f'int qrY = {new_y};'
                )

                with open(MAIN_CPP, 'w') as f:
                    f.write(content)

                print(f"   Changed qrY: {current_y} → {new_y}")
                return True

        except Exception as e:
            print(f"   ❌ Error: {e}")

        return False

    def force_full_refresh(self):
        """Force immediate full refresh on next display update"""
        # This would require adding a flag to preferences or config
        print("   ℹ️  Firmware already forces full refresh on first display")
        return False

    def build_and_flash(self):
        """Build firmware and flash to device"""
        print("\n" + "="*60)
        print(f"🔨 ITERATION {self.iteration}: BUILD & FLASH")
        print("="*60)

        os.chdir(FIRMWARE_DIR)

        # Build
        print("🔨 Building firmware...")
        result = subprocess.run(
            ["pio", "run", "-e", "trmnl"],
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            print("❌ Build failed!")
            print(result.stderr)
            return False

        print("✅ Build successful")

        # Flash
        print("📲 Flashing to device...")
        result = subprocess.run(
            ["pio", "run", "-t", "upload", "-e", "trmnl"],
            capture_output=True,
            text=True
        )

        if result.returncode != 0:
            print("❌ Flash failed!")
            print(result.stderr)
            return False

        print("✅ Flashed successfully")

        # Wait for device to boot and display to update
        print("⏳ Waiting 10 seconds for device boot and display update...")
        time.sleep(10)

        return True

    def run_iteration(self):
        """Run a single iteration of the feedback loop"""
        self.iteration += 1

        iteration_data = {
            "iteration": self.iteration,
            "timestamp": datetime.now().isoformat(),
            "status": "started"
        }

        # Capture and analyze
        analysis = self.capture_and_analyze()
        iteration_data["analysis"] = analysis

        # Determine fixes
        fixes = self.determine_fixes(analysis)
        iteration_data["fixes"] = fixes

        print(f"\n📊 ITERATION {self.iteration} SUMMARY:")
        print(f"  Issues found: {len(analysis.get('issues', []))}")
        print(f"  Fixes needed: {len(fixes)}")

        if not fixes:
            print("\n🎉 Perfect! No fixes needed.")
            iteration_data["status"] = "complete_perfect"
            self.log.append(iteration_data)
            self.save_log()
            return "perfect"

        # Apply fixes
        if self.apply_fixes(fixes):
            # Build and flash
            if self.build_and_flash():
                iteration_data["status"] = "complete_improved"
                self.log.append(iteration_data)
                self.save_log()
                return "improved"
            else:
                iteration_data["status"] = "failed_flash"
                self.log.append(iteration_data)
                self.save_log()
                return "failed"
        else:
            iteration_data["status"] = "complete_manual_needed"
            self.log.append(iteration_data)
            self.save_log()
            return "manual"

    def run(self, max_iterations=5):
        """Run auto-iteration loop"""
        print("\n" + "="*70)
        print("🚀 CCFirm AUTO-ITERATION SYSTEM")
        print("="*70)
        print(f"Max iterations: {max_iterations}")
        print(f"Firmware: {MAIN_CPP}")
        print("")
        print("⚠️  IMPORTANT: Position device facing laptop camera")
        print("⚠️  Ensure good lighting on e-ink display")
        print("")

        input("Press ENTER when ready to start...")

        try:
            for i in range(max_iterations):
                result = self.run_iteration()

                if result == "perfect":
                    print("\n🎉🎉🎉 SUCCESS! Display is perfect!")
                    break
                elif result == "failed":
                    print(f"\n❌ Iteration {self.iteration} failed. Stopping.")
                    break
                elif result == "manual":
                    print(f"\n⚠️  Manual intervention needed. Review fixes and continue manually.")
                    break
                elif result == "improved":
                    print(f"\n✅ Iteration {self.iteration} complete. Continuing...")

        except KeyboardInterrupt:
            print("\n\n⏹️  Auto-iteration stopped by user")

        finally:
            self.monitor.cleanup()

        print("\n" + "="*70)
        print(f"📊 FINAL REPORT: Completed {self.iteration} iterations")
        print("="*70)
        print(f"Log saved: {ITERATION_LOG}")
        print(f"Captures saved: {FIRMWARE_DIR / 'captures'}")

def main():
    parser = argparse.ArgumentParser(description="CCFirm Auto-Iteration System")
    parser.add_argument("--max-iterations", type=int, default=5,
                       help="Maximum iterations to run")

    args = parser.parse_args()

    iterator = AutoIterator()
    iterator.run(max_iterations=args.max_iterations)

if __name__ == "__main__":
    main()
