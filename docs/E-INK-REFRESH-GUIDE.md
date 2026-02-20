<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# E-ink Display Refresh Guide

**For Commute Compute(TM) Custom Firmware (CC-FW-7.5.0)**
**System Version:** v4.2.0 (CCDashDesignV15.0)
**Last Updated:** 2026-02-06

---

## Quick Summary

Your e-ink display refreshes **every 60 seconds**, updating only the parts that changed (departure times, alerts, etc.). A full screen refresh happens every **5 minutes** to prevent ghosting.

---

## Why 60 Seconds?

### The Sweet Spot

- **Too fast (< 30s)**: Damages e-ink display, shortens lifespan, increases power draw
- **60 seconds**: Perfect balance -- fresh data without wear
- **Too slow (> 120s)**: Departure times become stale, you might miss your train

### Real-World Example

```
08:45:00 - Display shows: "Next train: 4 minutes"
08:46:00 - Updates to: "Next train: 3 minutes"  <- Partial refresh
08:47:00 - Updates to: "Next train: 2 minutes"  <- Partial refresh
08:48:00 - Updates to: "Next train: 1 minute"   <- Partial refresh
```

---

## How It Works

### Partial Refresh (Every 60 Seconds)

**Only updates these zones:**
1. **Departure Times** -- Train/tram arrival countdowns
2. **Current Time** -- Clock at top of display
3. **Coffee Decision** -- "Yes, grab coffee" or "No, rush!"
4. **Alerts** -- Service disruptions, delays

**Stays the same:**
- Station names
- Layout and borders
- Static text
- Background graphics

### Full Refresh (Every 5 Minutes)

**Why needed?**
- E-ink displays accumulate "ghost" images from partial refreshes
- Full refresh clears all pixels, resetting the display
- Prevents burn-in and maintains image quality

**What happens:**
- Entire screen goes black, then white, then displays new image
- Takes ~2 seconds (vs 0.3 seconds for partial)
- Completely resets pixel states

---

## Refresh Zones

```
+-------------------------------------+
|  TIME & WEATHER (60s refresh)       |  <- Header Zone
+-------------------------------------+
|                                     |
|  TRAIN DEPARTURES (60s refresh)     |  <- Transit Zone
|   Next: 3 min                       |    (Updates most often)
|   Then: 8 min                       |
|                                     |
+-------------------------------------+
|  COFFEE: YES (120s refresh)         |  <- Coffee Zone
+-------------------------------------+
|  Leave by: 08:42 (120s refresh)     |  <- Footer Zone
+-------------------------------------+
```

**Zone Refresh Frequencies:**
- **Transit Zone**: 60 seconds (live departure data)
- **Header Zone**: 60 seconds (time updates)
- **Coffee Zone**: 120 seconds (cafe busyness)
- **Footer Zone**: 120 seconds (journey summary)

---

## Power Requirements

> **USB-C power is recommended for continuous operation.** Battery-powered operation is supported
> but lasts only several days. Deep sleep and configurable refresh intervals are planned
> enhancements to extend battery life in a future firmware release.

### Why Partial Refresh Matters

Even on USB-C power, partial refresh reduces display wear and power draw:

```
Full Refresh: ################....  (100% pixels updated)
Partial:      ####................  ( 20% pixels updated)
              ^
              5x less display wear per cycle
```

---

## Technical Details

### Firmware Settings

**File:** `firmware/include/config.h`

```c
#define PARTIAL_REFRESH_INTERVAL 60000    // 60 seconds
#define FULL_REFRESH_INTERVAL 300000      // 5 minutes
#define SLEEP_BETWEEN_PARTIALS_MS 58000   // Sleep 58s, process 2s
```

**Why 58 seconds sleep?**
- Total cycle: 58s (sleep) + 2s (fetch + update) = 60s
- ESP32 idles during 58s period (battery operation is supported but lasts only several days; USB-C recommended for continuous use)
- Wakes up, fetches data, updates display, repeats

### Server Configuration

**File:** `src/server.js`

```javascript
// /api/config endpoint returns:
{
  partialRefreshMs: 60000,    // Device polls server every 60s
  fullRefreshMs: 300000,      // Full refresh every 5 min
  sleepBetweenMs: 58000       // Sleep between polls
}
```

### Zone Coordinates

**File:** `firmware/include/config.h`

```c
// Time display region
#define TIME_X 20
#define TIME_Y 10
#define TIME_W 135
#define TIME_H 50

// Train departures region
#define TRAIN_X 15
#define TRAIN_Y 105
#define TRAIN_W 200
#define TRAIN_H 60

// Tram departures region
#define TRAM_X 15
#define TRAM_Y 215
#define TRAM_W 200
#define TRAM_H 60

// Coffee decision region
#define COFFEE_X 480
#define COFFEE_Y 10
#define COFFEE_W 310
#define COFFEE_H 30
```

---

## What NOT to Do

### DO NOT Set Refresh Below 60 Seconds

**Consequences:**
- Excessive e-ink wear
- Display lifespan reduced from 5 years to 1 year
- Ghosting artifacts accumulate faster
- Higher power consumption
- No real benefit (transit data does not update faster than 30s)

### DO NOT Disable Partial Refresh

**If you force full refresh every 60s:**
```
Partial refresh:  1 year = 525K refreshes [OK]
Full refresh:     1 year = 525K refreshes [WARNING]
                           ^
                  E-ink rated for only 500K full refreshes!
```

### DO NOT Remove Full Refresh

**Without periodic full refresh:**
- Ghost images accumulate
- Display becomes unreadable after 2-3 hours
- Permanent damage possible

---

## Refresh Cycle Visualization

```
Timeline: 0s ------------------------------------------ 5min

Partial:  [R]...........60s...........[R]...........60s...........[R]

Full:     [FULL]..............................5min................[FULL]

Legend:
[R] = Partial refresh (0.3s, updates changed zones)
[FULL] = Full refresh (2s, resets entire display)
... = Device sleeping (58s between refreshes)
```

---

## User Experience

### What You See

**Smooth Updates:**
```
08:45:00  Next: 4 min -> Next: 3 min -> Next: 2 min -> Next: 1 min
          ^ 60s later   ^ 60s later   ^ 60s later
```

### What You DO NOT See

- No flashing between updates (only changed areas update)
- No black/white flash every time (only every 5 minutes)
- No lag or delay (updates appear instantly)

---

## Troubleshooting

### "My display is not updating every 60 seconds"

**Check:**
1. **WiFi connection**: Device must be connected to fetch data
2. **Server URL**: Verify in preferences
3. **Power**: USB-C recommended for continuous use; battery operation supported but lasts only several days
4. **Serial output**: Connect USB and check for errors

**Debug command:**
```bash
screen /dev/cu.usbmodem* 115200
# Should show: "Partial refresh in 58s..." every cycle
```

### "My display is ghosting/has artifacts"

**Solution:**
1. Force a full refresh: Press device button
2. Check full refresh interval: Should be 300000ms (5 min)
3. If ghosting persists: Increase full refresh frequency

**Firmware change:**
```c
#define FULL_REFRESH_INTERVAL 180000  // 3 minutes instead of 5
```

### "Device not staying powered"

**USB-C power is recommended** for continuous operation. Battery-powered operation is supported but lasts only several days. For always-on use, ensure the device is connected to a USB-C power source.

---

## Further Reading

**E-ink Technology:**
- [Waveshare E-Paper Docs](https://www.waveshare.com/wiki/7.5inch_e-Paper_HAT)
- [E-ink Display Lifespan](https://www.eink.com/tech/detail/Lifespan)

**Firmware Configuration:**
- `firmware/include/config.h` - All refresh settings
- `firmware/src/main.cpp` - Refresh implementation
- `DEVELOPMENT-RULES.md` - Hardcoded requirements

**Server Configuration:**
- `src/server.js` - `/api/config` endpoint
- `src/data/preferences-manager.js` - Default preferences

---

## Summary

**Remember:**
- 60-second partial refresh is **HARDCODED** and **REQUIRED**
- Updates only changed zones (70-80% less wear)
- Full refresh every 5 minutes clears ghosting
- Extends display lifespan from 1 year to 5+ years
- Provides fresh transit data without excessive display wear

**If you change these settings without approval, you WILL:**
- Damage your e-ink display
- Void your warranty
- Increase power consumption unnecessarily
- See worse image quality

**The 60-second refresh is optimised for transit data freshness and display longevity. Do not change it.**

---

**Last Updated:** 2026-02-06
**Applies To:** Commute Compute(TM) v4.2.0+ (CCDashDesignV15.0)
**Firmware Version:** CC-FW-7.5.0

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual License
