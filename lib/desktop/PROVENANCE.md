# daedalOS source attribution

The geometry and immutable window state modules adapt source from [Dustin Brett's daedalOS](https://github.com/DustinBrett/daedalOS), commit `ed9c7a54cc50a6e9125333743164830ad56779a5`.

- `geometry.ts`: `components/system/Window/functions.ts` (`centerPosition`, `cascadePosition`, and `minMaxSize`). Viewport access is injected, coordinates are clamped, and left/right snapping is added.
- `reducer.ts`: `contexts/process/functions.ts` (`setProcessSettings`, open/close/maximize/minimize updates). Adapted to an ordered window list with explicit focus management and restoration rectangles.

The original MIT license is retained in `LICENSE.daedalOS`. No daedalOS media assets or its BrowserFS backend are included. Session validation and the React hook are new integration code for Stephan's OS.
