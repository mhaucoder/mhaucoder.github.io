# Copilot Instructions: Vietnamese Lunar New Year Fireworks

## Project Overview

This is a **single-page interactive fireworks simulator** designed for Vietnamese Lunar New Year (Tết) celebrations. Built with vanilla JavaScript and HTML5 Canvas, it features customizable fireworks, countdown timer, and cultural elements like "lì xì" (lucky money) rain.

**Architecture:** Pure client-side with no build process or dependencies beyond CDN resources.

## Core Architecture

### State Management Pattern

The app uses a **custom state store** ([script.js](script.js#L102-L216)) inspired by Redux:

```javascript
store.setState({ paused: false })  // Update state
store.subscribe(renderApp)          // React to changes
```

- State persists to `localStorage` with schema versioning (`schemaVersion: "1.2"`)
- All UI updates flow through `renderApp(state)` subscriber
- Config changes trigger `configDidUpdate()` for global variable updates

### Canvas Architecture

**Dual-canvas system** for performance optimization:
- `trails-canvas`: Long-exposure particle trails (persistent rendering)
- `main-canvas`: Active fireworks particles (cleared each frame)
- Both use `mix-blend-mode: lighten` for additive blending

Managed by `Stage` class (external CDN library, see [index.html](index.html#L199)).

### Device Detection & Quality Settings

Three quality tiers based on hardware detection ([script.js](script.js#L12-L21)):

```javascript
IS_HIGH_END_DEVICE    // ≥8 cores (desktop) or ≥4 cores (mobile)
IS_MOBILE             // ≤640px width
IS_HEADER             // >800px width && <300px height (special mode)
```

Quality impacts: particle density, spark width, frame processing load.

## Key Components

### Shell System (Fireworks Types)

Factory functions return shell configs ([script.js](script.js#L624-L860)):

- **Standard types:** `crysanthemumShell`, `palmShell`, `ringShell`
- **Vietnamese-themed:** `maiBlossomShell`, `peachBlossomShell`, `vietnamFlagShell`
- **Effects:** `crossetteShell`, `strobeShell`, `willowShell`

Each shell config specifies:
- `spreadSize`, `starLife`, `starDensity`, `color`, `glitter`
- Special properties like `pistil`, `crossette`, `maiBlossom`, `vietnamFlag`

### Color System

Predefined palette ([script.js](script.js#L53-L60)):
```javascript
COLOR = { Red, Green, Blue, Purple, Gold, White }
INVISIBLE = "_INVISIBLE_"  // For invisible seed shells
```

Color helpers: `randomColor()`, `randomWarmColor()`, `makePistilColor()`

### Launch Sequences

Automatic show patterns ([script.js](script.js#L1223-L1376)):
- `seqRandomShell()` - Single random firework
- `seqTwoRandom()` - Paired launches
- `seqPyramid()` - 7-shell pyramid pattern
- `showPatterns` - Complex choreographed sequences

**Finale mode:** Rapid-fire small shells when countdown reaches zero.

### Countdown Timer

Lunar New Year countdown ([script.js](script.js#L3300-L3400)):
- Target: Hardcoded `countDownDate` (typically February 1st next year)
- Auto-docking system: Minimizes to corner, expands on click
- Triggers finale mode + lì xì rain at zero

### Lì Xì Rain Feature

Toggle with 'L' key or checkbox ([script.js](script.js#L1660-L1756)):
- Spawns falling SVG lì xì envelopes
- Animation loop via `tickLixiRain()`
- Persists enabled state to `localStorage`

## Development Patterns

### Adding New Firework Types

1. Create shell factory in [script.js](script.js#L624):
   ```javascript
   const myShell = (size = 1) => ({
     shellSize: size,
     spreadSize: 300 + size * 100,
     starLife: 900 + size * 200,
     color: randomColor(),
     // Special effects...
   })
   ```

2. Register in `shellTypes` object ([script.js](script.js#L901))
3. Add label to `shellTypeLabels` in `init()` ([script.js](script.js#L936))
4. Implement effect function if custom behavior needed (e.g., `crossetteEffect`)

### Performance Tuning

Respect quality globals when adding features:
- Use `isLowQuality` / `isNormalQuality` / `isHighQuality` checks
- Reduce particle counts on low quality: `isLowQuality ? 16 : 32`
- Avoid heavy computations in `update()` loop (runs 60fps)

### Localization

All UI text is **Vietnamese** ([index.html](index.html#L1-L204)):
- Button labels, countdown text, settings menu
- Credits reference "Dev.Hajua" and original author Sayn Achhava
- When modifying UI, maintain Vietnamese language

## Configuration

User settings via `store.state.config`:
- `quality`: "1" (low) | "2" (normal) | "3" (high)
- `shell`: "Random" or specific type name
- `size`: "1" to "4" (shell size multiplier)
- `autoLaunch`: Auto-fire shells periodically
- `finale`: High-intensity rapid fire mode
- `skyLighting`: "0" (none) | "1" (dim) | "2" (normal)
- `longExposure`: Persistent trails without fade
- `scaleFactor`: UI scale (0.5 to 1.5)

## Critical Files

- [script.js](script.js): Main application logic (3552 lines, no transpiling)
- [index.html](index.html): Single-page structure, Vietnamese UI
- [style.css](style.css): CSS custom properties, glassmorphism panels
- [assets/](assets/): SVG cursors and lì xì envelope graphics

## Event Handling

Keyboard shortcuts ([script.js](script.js#L1557-L1621)):
- `P`: Pause/play
- `O`: Open settings menu
- `A`: Toggle auto-launch
- `F`: Toggle finale mode
- `L`: Toggle lì xì rain
- `H`: Toggle UI visibility
- Arrow keys: Adjust simulation speed
- Click/tap canvas: Launch shell at pointer position

## Testing & Debugging

- **No build step**: Edit files directly, refresh browser
- **Console logging**: Original code includes debug logs for config loading
- **Device simulation**: Use browser DevTools to test mobile/tablet viewports
- **Performance**: Monitor FPS drop when adding particle-heavy effects

## AI Agent Guidance

When modifying this codebase:
- **Preserve Vietnamese language** in all user-facing text
- **Test on mobile**: Layout is responsive, buttons use touch-friendly sizing
- **Respect quality tiers**: Always check `isLowQuality` before adding expensive features
- **Maintain state flow**: Use `store.setState()`, never mutate state directly
- **Canvas optimization**: Keep `update()` loop lean, batch DOM reads outside render loop
- **Cultural context**: Tết-themed shells (mai, peach blossom, flag) are key features
