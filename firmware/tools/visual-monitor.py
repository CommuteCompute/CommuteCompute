#!/usr/bin/env python3
"""
CCFirm Visual Monitor
Captures images of the e-ink display, analyzes layout, and provides feedback
for iterative firmware development.

Usage:
    python3 visual-monitor.py --capture     # Capture single image
    python3 visual-monitor.py --monitor     # Continuous monitoring mode
    python3 visual-monitor.py --analyze IMG.jpg  # Analyze specific image
"""

import cv2
import os
import sys
import time
import json
from datetime import datetime
from pathlib import Path
import argparse
import subprocess
import numpy as np

# Configuration
CAPTURE_DIR = Path.home() / "commute-compute" / "firmware" / "captures"
CAPTURE_DIR.mkdir(exist_ok=True)

EXPECTED_LAYOUT = {
    "header": {"text": "CCFirm SETUP", "region": (0, 0, 800, 60)},
    "qr_code": {"region": (40, 80, 200, 240)},
    "device_info": {"text": "DEVICE INFO", "region": (300, 90, 500, 170)},
    "setup_progress": {"text": "SETUP PROGRESS", "region": (300, 195, 500, 310)},
    "decision_log": {
        "addresses": {"region": (300, 220, 500, 240)},
        "transit_api": {"region": (300, 240, 500, 260)},
        "journey": {"region": (300, 260, 500, 280)}
    },
    "footer": {"region": (0, 420, 800, 480)}
}

class DisplayMonitor:
    def __init__(self):
        self.camera_index = 0
        self.cap = None
        self.frame_count = 0
        self.last_analysis = None

    def init_camera(self):
        """Initialize camera capture"""
        print(f"🎥 Initializing camera {self.camera_index}...")
        self.cap = cv2.VideoCapture(self.camera_index)

        if not self.cap.isOpened():
            print("❌ Failed to open camera. Trying alternate camera...")
            self.camera_index = 1
            self.cap = cv2.VideoCapture(self.camera_index)

        if not self.cap.isOpened():
            raise RuntimeError("❌ No camera available")

        # Set resolution
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

        print("✅ Camera initialized")

    def capture_frame(self):
        """Capture a single frame from camera"""
        if not self.cap or not self.cap.isOpened():
            self.init_camera()

        ret, frame = self.cap.read()
        if not ret:
            raise RuntimeError("❌ Failed to capture frame")

        return frame

    def save_capture(self, frame, prefix="capture"):
        """Save captured frame with timestamp"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = CAPTURE_DIR / f"{prefix}_{timestamp}.jpg"

        cv2.imwrite(str(filename), frame)
        print(f"📸 Saved: {filename}")

        return filename

    def detect_display_region(self, frame):
        """
        Detect the e-ink display region in the frame
        Returns cropped image of just the display
        """
        # Convert to grayscale
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Apply edge detection
        edges = cv2.Canny(gray, 50, 150)

        # Find contours
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Find largest rectangular contour (likely the display)
        display_contour = None
        max_area = 0

        for contour in contours:
            area = cv2.contourArea(contour)
            if area > max_area and area > 10000:  # Minimum size threshold
                # Check if roughly rectangular
                peri = cv2.arcLength(contour, True)
                approx = cv2.approxPolyDP(contour, 0.02 * peri, True)
                if len(approx) == 4:  # Quadrilateral
                    display_contour = contour
                    max_area = area

        if display_contour is not None:
            # Get bounding box
            x, y, w, h = cv2.boundingRect(display_contour)

            # Add padding
            padding = 10
            x = max(0, x - padding)
            y = max(0, y - padding)
            w = min(frame.shape[1] - x, w + 2 * padding)
            h = min(frame.shape[0] - y, h + 2 * padding)

            # Crop to display
            display = frame[y:y+h, x:x+w]

            print(f"✅ Display detected: {w}x{h} at ({x}, {y})")
            return display, (x, y, w, h)

        print("⚠️  No display detected, using full frame")
        return frame, (0, 0, frame.shape[1], frame.shape[0])

    def analyze_layout(self, image_path):
        """
        Analyze captured image for layout issues
        Returns analysis report
        """
        img = cv2.imread(str(image_path))
        if img is None:
            return {"error": "Failed to load image"}

        # Detect display region
        display, bbox = self.detect_display_region(img)

        # Save cropped display
        cropped_path = image_path.parent / f"{image_path.stem}_display.jpg"
        cv2.imwrite(str(cropped_path), display)

        # Analyze regions
        analysis = {
            "timestamp": datetime.now().isoformat(),
            "image": str(image_path),
            "display_cropped": str(cropped_path),
            "display_bbox": bbox,
            "display_size": (display.shape[1], display.shape[0]),
            "regions": {},
            "issues": [],
            "recommendations": []
        }

        # Check brightness/contrast (e-ink specific)
        gray = cv2.cvtColor(display, cv2.COLOR_BGR2GRAY)
        brightness = np.mean(gray)
        contrast = np.std(gray)

        analysis["brightness"] = float(brightness)
        analysis["contrast"] = float(contrast)

        if brightness < 100:
            analysis["issues"].append("Image appears dark - check lighting")
        if contrast < 30:
            analysis["issues"].append("Low contrast - display may not have refreshed")

        # Detect QR code region (dark square)
        qr_region = self.detect_qr_code(display)
        if qr_region:
            analysis["regions"]["qr_code"] = qr_region
            print(f"✅ QR code detected at {qr_region}")
        else:
            analysis["issues"].append("QR code not detected")
            analysis["recommendations"].append("Check QR code positioning and size")

        # Detect text regions
        text_regions = self.detect_text_regions(display)
        analysis["regions"]["text"] = text_regions
        print(f"✅ Detected {len(text_regions)} text regions")

        # Check for rotation issues (text should be horizontal)
        rotation_issue = self.detect_rotation_issues(display)
        if rotation_issue:
            analysis["issues"].append(f"Text rotation issue detected: {rotation_issue}")
            analysis["recommendations"].append("Check setRotation() and font settings")

        self.last_analysis = analysis
        return analysis

    def detect_qr_code(self, image):
        """Detect QR code position"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # QR codes have characteristic patterns
        # Look for dark square regions
        _, binary = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)

        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Find square-ish dark regions
        for contour in contours:
            area = cv2.contourArea(contour)
            if 5000 < area < 50000:  # QR code size range
                x, y, w, h = cv2.boundingRect(contour)
                aspect_ratio = float(w) / h if h > 0 else 0

                # QR codes are square
                if 0.8 < aspect_ratio < 1.2:
                    return {"x": int(x), "y": int(y), "w": int(w), "h": int(h), "area": int(area)}

        return None

    def detect_text_regions(self, image):
        """Detect regions with text"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Use edge detection for text
        edges = cv2.Canny(gray, 50, 150)

        # Dilate to connect text characters
        kernel = np.ones((5, 5), np.uint8)
        dilated = cv2.dilate(edges, kernel, iterations=2)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        text_regions = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area > 100:  # Minimum text region size
                x, y, w, h = cv2.boundingRect(contour)
                text_regions.append({
                    "x": int(x),
                    "y": int(y),
                    "w": int(w),
                    "h": int(h),
                    "area": int(area)
                })

        return text_regions

    def detect_rotation_issues(self, image):
        """Detect if text appears rotated"""
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Use Hough Line Transform to detect dominant line angles
        edges = cv2.Canny(gray, 50, 150, apertureSize=3)
        lines = cv2.HoughLines(edges, 1, np.pi/180, 200)

        if lines is not None:
            angles = []
            for line in lines:
                rho, theta = line[0]
                angle = np.degrees(theta)
                angles.append(angle)

            # Check if dominant angle is not horizontal (0°, 180°)
            avg_angle = np.mean(angles)

            if 80 < avg_angle < 100:
                return "90° clockwise rotation detected"
            elif 260 < avg_angle < 280:
                return "90° counter-clockwise rotation detected"

        return None

    def generate_report(self, analysis):
        """Generate human-readable report"""
        report = []
        report.append("=" * 60)
        report.append("CCFirm DISPLAY ANALYSIS REPORT")
        report.append("=" * 60)
        report.append(f"Timestamp: {analysis['timestamp']}")
        report.append(f"Image: {analysis['image']}")
        report.append(f"Display Size: {analysis['display_size']}")
        report.append(f"Brightness: {analysis['brightness']:.1f} (0-255)")
        report.append(f"Contrast: {analysis['contrast']:.1f}")
        report.append("")

        # Regions
        report.append("DETECTED REGIONS:")
        report.append("-" * 60)

        if "qr_code" in analysis["regions"]:
            qr = analysis["regions"]["qr_code"]
            report.append(f"✅ QR Code: {qr['w']}x{qr['h']} at ({qr['x']}, {qr['y']})")
        else:
            report.append("❌ QR Code: NOT DETECTED")

        text_regions = analysis["regions"].get("text", [])
        report.append(f"✅ Text Regions: {len(text_regions)} detected")

        report.append("")

        # Issues
        if analysis["issues"]:
            report.append("ISSUES FOUND:")
            report.append("-" * 60)
            for issue in analysis["issues"]:
                report.append(f"⚠️  {issue}")
            report.append("")

        # Recommendations
        if analysis["recommendations"]:
            report.append("RECOMMENDATIONS:")
            report.append("-" * 60)
            for rec in analysis["recommendations"]:
                report.append(f"💡 {rec}")
            report.append("")

        report.append("=" * 60)

        return "\n".join(report)

    def monitor_loop(self, interval=5):
        """
        Continuous monitoring loop
        Captures and analyzes display every N seconds
        """
        print(f"🔄 Starting monitoring loop (interval: {interval}s)")
        print("Press Ctrl+C to stop")
        print("")

        try:
            iteration = 0
            while True:
                iteration += 1
                print(f"\n📸 Capture #{iteration} - {datetime.now().strftime('%H:%M:%S')}")

                # Capture frame
                frame = self.capture_frame()

                # Save
                image_path = self.save_capture(frame, prefix=f"monitor_{iteration:03d}")

                # Analyze
                print("🔍 Analyzing...")
                analysis = self.analyze_layout(image_path)

                # Save analysis
                analysis_path = image_path.parent / f"{image_path.stem}_analysis.json"
                with open(analysis_path, 'w') as f:
                    json.dump(analysis, f, indent=2)

                # Print report
                report = self.generate_report(analysis)
                print(report)

                # Save report
                report_path = image_path.parent / f"{image_path.stem}_report.txt"
                with open(report_path, 'w') as f:
                    f.write(report)

                print(f"\n⏳ Waiting {interval}s until next capture...")
                time.sleep(interval)

        except KeyboardInterrupt:
            print("\n\n⏹️  Monitoring stopped by user")
            self.cleanup()

    def cleanup(self):
        """Release camera resources"""
        if self.cap:
            self.cap.release()
            cv2.destroyAllWindows()
            print("✅ Camera released")

def main():
    parser = argparse.ArgumentParser(description="CCFirm Visual Monitor")
    parser.add_argument("--capture", action="store_true", help="Capture single image")
    parser.add_argument("--monitor", action="store_true", help="Continuous monitoring mode")
    parser.add_argument("--analyze", type=str, help="Analyze specific image file")
    parser.add_argument("--interval", type=int, default=5, help="Monitoring interval (seconds)")

    args = parser.parse_args()

    monitor = DisplayMonitor()

    if args.capture:
        # Single capture
        print("📸 Capturing single frame...")
        frame = monitor.capture_frame()
        image_path = monitor.save_capture(frame)

        print("🔍 Analyzing...")
        analysis = monitor.analyze_layout(image_path)

        report = monitor.generate_report(analysis)
        print(report)

        # Save analysis
        analysis_path = image_path.parent / f"{image_path.stem}_analysis.json"
        with open(analysis_path, 'w') as f:
            json.dump(analysis, f, indent=2)

        print(f"\n✅ Analysis saved: {analysis_path}")

        monitor.cleanup()

    elif args.monitor:
        # Continuous monitoring
        monitor.monitor_loop(interval=args.interval)

    elif args.analyze:
        # Analyze existing image
        image_path = Path(args.analyze)
        if not image_path.exists():
            print(f"❌ Image not found: {image_path}")
            sys.exit(1)

        print(f"🔍 Analyzing {image_path}...")
        analysis = monitor.analyze_layout(image_path)

        report = monitor.generate_report(analysis)
        print(report)

    else:
        parser.print_help()

if __name__ == "__main__":
    main()
