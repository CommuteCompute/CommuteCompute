// Simple test to verify display is working
#include <Arduino.h>
#include <GxEPD2_BW.h>
#include <Fonts/FreeSansBold18pt7b.h>
#include <Fonts/FreeSans12pt7b.h>
#include "config.h"

GxEPD2_BW<GxEPD2_750_T7, GxEPD2_750_T7::HEIGHT> display(
    GxEPD2_750_T7(EPD_CS, EPD_DC, EPD_RST, EPD_BUSY));

void setup() {
    // Initialize display
    SPI.begin(EPD_CLK, -1, EPD_DIN, EPD_CS);
    display.init(115200, true, 2, false);
    display.setRotation(0);

    // Draw test screen
    display.setFullWindow();
    display.firstPage();
    do {
        display.fillScreen(GxEPD_WHITE);

        // Test pattern
        display.setFont(&FreeSansBold18pt7b);
        display.setTextColor(GxEPD_BLACK);
        display.setCursor(50, 100);
        display.print("DISPLAY TEST");

        display.setFont(&FreeSans12pt7b);
        display.setCursor(50, 150);
        display.print("If you see this, display works!");

        display.setCursor(50, 200);
        display.print("Server: your-deployment.vercel.app");

        display.setCursor(50, 250);
        display.print("WiFi connected successfully");

        // Draw some boxes
        display.drawRect(50, 300, 200, 100, GxEPD_BLACK);
        display.fillRect(70, 320, 160, 60, GxEPD_BLACK);

    } while (display.nextPage());

    display.hibernate();
}

void loop() {
    delay(1000);
}
