# Virtual Dive Computer Instrument UI — Phase 3

The Phase 3 instrument UI lives in `src/features/diveComputer/ui/`. It is presentation-only and does not own navigation, simulation facts, or lessons.

## Component hierarchy

```text
VirtualDiveComputer
  └── ComputerHousing
       ├── InstrumentDisplay
       ├── PhysicalButton (left)
       └── PhysicalButton (right)
```

`displayLayout.js` selects the LCD presentation for a semantic `screenId`. `geometry.js` owns all proportional sizing constants.

## Geometry contract

- Base instrument: 360 × 344 points
- Instrument aspect ratio: approximately 1.047:1
- Minimum readable width: 286 points
- Maximum width: 420 points
- Base LCD: 292 × 202 points
- LCD aspect ratio: approximately 1.446:1

Width, height, LCD, bezel, type, hardware labels, wells, and buttons share one scale factor. When the available width is below 286 points, a horizontal viewport preserves the minimum instrument size. On tablets, the instrument stops growing at 420 points.

Screen changes select only LCD content. They never alter housing dimensions, bezel thickness, strap placement, or physical-button positions.

## Display hierarchy

The primary dive page reserves the largest field for current depth, followed by NDL. Dive time, maximum depth, and ascent rate remain fixed in the lower information band.

Secondary pages use a stable aligned metric grid for maximum depth, surface interval, CNS, temperature, tissue loading, and configured gas. Menus use compact LCD rows with an inverted selected row rather than mobile controls.

## Special presentations

- Warning: prominent amber or red warning name, current depth, ascent rate, latched warning indicator, and acknowledgement prompt.
- Safety stop: remaining stop time is primary, followed by hold depth and current depth.
- Decompression: stop time and required stop depth are primary, followed by ceiling and current depth.
- Surface/post-dive: surface interval or completed dive time leads the screen.

All values come from `buildVirtualDiveComputerDisplay`. The UI does not calculate warning conditions, NDL, tissues, stops, or navigation.

## Physical buttons

Each front button sits in a molded well and has a minimum effective 44-point hit target through its visible size and hit slop. Pressed state changes depth, border, and shadow treatment. Tap and 650 ms hold gestures dispatch the existing short- and long-press device events.

There are no UI-only screen shortcuts, tabs, or navigation callbacks in the Phase 3 instrument.

## Compatibility

Free practice renders `VirtualDiveComputer`. The guided lesson continues using the transitional lesson-only `components/DiveComputerFace.js`; it was not migrated or visually redesigned in Phase 3.
