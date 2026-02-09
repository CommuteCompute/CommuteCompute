<p align="center">
  <img src="../assets/brand/cc-logo-apple-touch.png" alt="Commute Compute™" width="120">
</p>

# LinkedIn Launch Post - Commute Compute™

**Status:** Draft
**Author:** Angus Bergman
**Target Length:** 1200-1500 words
**Date:** February 2026

---

## Post Content

I'm a lawyer. I just shipped 112,000 lines of code.

No team. No employer mandate. No CS degree. Just 271 source files, 5 intelligence engines, and a conviction that the way we commute in Australia is broken.

--

Today I'm publicly releasing Commute Compute -- an open-source commuter intelligence system that turns a small e-ink display into the only thing you need to look at before walking out the door.

One glance. No phone. No app switching. No notification fatigue.

The display sits on your hallway table or kitchen bench. It shows your entire journey -- every leg, every connection, every delay -- rendered in sharp black and white on an always-on screen. It tells you when to leave, whether your train is delayed, if there's time for coffee, and whether you need an umbrella. It updates every 20 seconds with live data from Australian transit authorities.

That is the entire user experience. Look at the screen. Leave the house.

--

Let me back up.

I practice law. My day job is legal analysis, contract interpretation, regulatory compliance. But legal tech showed me something: the analytical frameworks I use to parse legislation translate directly into systems design. Conditional logic trees. State machines. Edge case handling. Exception flows. These are the same structures whether you're reading the Corporations Act or building a journey calculation engine.

I started Commute Compute because I was tired of checking three different apps every morning. One for train times. One for weather. One for disruptions. And then doing mental arithmetic to figure out if I had time to stop for coffee on the way to the station.

That frustration became a weekend project. The weekend project became a serious engineering effort. The engineering effort became an intellectual property portfolio.

--

Here is what the system actually does.

Five engines run in parallel on every refresh cycle. The CommuteCompute engine pulls real-time GTFS data from transit authorities across Victoria, New South Wales, and Queensland, then calculates multi-modal routes -- walk, tram, train, bus -- with live delay integration. The CoffeeDecision engine determines whether your schedule has enough buffer for a stop, factoring in cafe hours, walking time to the cafe, and whether a delay has eaten your margin. The weather engine pulls Bureau of Meteorology data and makes the umbrella call. The disruption engine detects service suspensions, diversions, and cancellations, then automatically reroutes your journey. And the commute stress scoring engine synthesises all of this into a single assessment of how your morning is shaping up.

The output is a server-rendered 800x480 pixel image, delivered to an e-ink display that draws almost no power. No app store. No account creation. No ongoing subscription. The device fetches an image from your own server -- which runs free on Vercel -- and displays it. The entire system is self-hosted. Your commute data never leaves infrastructure you control.

--

The technical choices were deliberate.

E-ink is not a limitation -- it is the point. A phone screen demands attention. It pulls you in, shows you notifications, tempts you to check email. An e-ink display does one thing: it presents information. You process it in under two seconds and move on with your day. The always-on nature means the information is there when you walk past, not when you remember to open an app. There is no battery anxiety because the device sips power. There is no screen time guilt because it is not a screen in the way we've come to dread.

I built the rendering engine to produce 1-bit bitmap images -- pure black and white, no greyscale -- because that is what e-ink does best. Every pixel is intentional. The typography is legible from one to two metres away. The layout follows a locked specification (CCDash v13.6, if you care about the version history) that defines every pixel boundary, every font size, every status bar variant. This is not a hobby project with rough edges. It is a specification-driven system with formal design documents.

--

The firmware story is its own chapter.

I wrote custom firmware for the ESP32-C3 microcontroller that powers the display hardware. It implements 12 anti-brick safeguards -- rules that prevent the device from ever getting into an unrecoverable state. It uses a state machine architecture, zone-based partial screen refresh to minimise e-ink wear, and deep sleep power management. The device connects to your server and only your server. No cloud dependency. No third-party telemetry.

Zero-config setup happens through Bluetooth provisioning. A user powers on the device, opens a browser, walks through a setup wizard, and has a working display in under ten minutes. Every API key, every address, every preference is encoded into a URL token. There are no environment variables to edit, no configuration files to manage.

--

Now, the timing.

Melbourne's Metro Tunnel opens in 2025-2026. It is the largest public transport infrastructure project in Victoria's history -- a $13 billion investment that fundamentally reshapes how the rail network operates. Five new underground stations. New lines. New interchange patterns. Every commuter who uses the city loop will need to relearn their journey.

Commute Compute is already Metro Tunnel compliant. The system ingests the new GTFS data as it becomes available. While commuters are fumbling with changed timetables and unfamiliar station names, Commute Compute users will glance at their display and see the optimal route -- already calculated, already accounting for the new network topology.

That is a user acquisition window that does not come around often.

--

I chose AGPL-3.0 licensing deliberately. The code is open source -- anyone can read it, learn from it, deploy it for personal use. But the AGPL's copyleft provisions mean that anyone who builds a commercial product on top of this codebase must release their modifications under the same licence. This protects the IP while keeping the project genuinely open.

The trademark portfolio -- Commute Compute, CommuteCompute, CCDash, CC LiveDash, CCFirm -- covers the brand architecture. Open source and strong IP protection are not contradictions. They are complementary strategies.

--

What makes this different from existing transit apps?

No transit app does sleep optimisation -- calculating when you need to wake up based on real-time conditions rather than static timetables. No transit app does commute stress scoring -- a composite metric that tells you at a glance whether your morning is normal, strained, or falling apart. No transit app calculates the actual dollar cost of alternative transit options in real time. And no transit app delivers all of this to a dedicated, always-visible, zero-distraction display.

This is not an app. It is an appliance. That distinction matters.

--

The system supports multiple Australian states with automatic detection -- configure your home and work addresses, and Commute Compute determines which transit authority to query. Victoria uses the Transport Victoria OpenData API. New South Wales uses TfNSW. Queensland uses TransLink. The architecture is designed so adding new states is a configuration exercise, not a rewrite.

--

I built this in evenings and weekends, outside of my legal career. Every line of code, every specification document, every firmware build. The 271 source files and 112,000 lines represent thousands of hours of work by one person who believed the problem was worth solving properly.

If you commute in Melbourne, Sydney, or Brisbane and want to try it, the repository is public.

If you are interested in the intersection of legal thinking and technical execution, or in how open-source IP strategy works in practice, I am happy to talk.

GitLab: [LINK]
Live demo: [LINK]

--

Built in Melbourne. For people who catch trains.

#OpenSource #PublicTransport #Melbourne #IoT #SmartCity

---

## Post Notes

- Total word count: approximately 1,250 words
- The double dashes (--) serve as visual line breaks on LinkedIn
- Replace [LINK] placeholders with actual URLs at time of posting
- The hook ("I'm a lawyer. I just shipped 112,000 lines of code.") lands above the LinkedIn "see more" fold on both mobile and desktop
- No emojis used throughout
- Five hashtags, all relevant, no spam
- No references to external AI tools or providers
- Trademark symbols intentionally omitted from the LinkedIn post body for readability; the IP section establishes the portfolio clearly

---

(c) 2026 Commute Compute(TM) System by Angus Bergman -- AGPL-3.0 Dual License
