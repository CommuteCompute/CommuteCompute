/**
 * Commute Compute Logo Drawing Functions
 * Header file for logo display on TRMNL devices
 * 
 * Copyright (c) 2026 Angus Bergman
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Dual-licensed under AGPL-3.0 and commercial terms — see LICENSE
 */

#ifndef CC_LOGO_DRAW_H
#define CC_LOGO_DRAW_H

#include "cc-logo.h"

/**
 * Draw the CC logo at specified position
 * @param x X position (top-left of logo)
 * @param y Y position (top-left of logo)
 */
void drawCCLogo(int x, int y);

/**
 * Draw the CC logo centered horizontally at specified Y position
 * @param y Y position (top of logo)
 * @param screenWidth Width of the screen (default 800)
 */
void drawCCLogoCentered(int y, int screenWidth = 800);

#endif // CC_LOGO_DRAW_H
