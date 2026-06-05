# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A FoundryVTT v13 module (`kingdom-manager`) for D&D 5e domain-level play, based on *An Echo Resounding*. It adds a `kingdom` Actor type and an `asset` Item type to Foundry. There is no build step — the JS files are plain ES modules loaded directly by Foundry.

## Development workflow

No package.json, no bundler, no test runner. Development means editing the files in place and reloading Foundry to pick up changes. The module is deployed by zipping the repo (excluding `.git`) and installing it in Foundry, or by symlinking this directory into Foundry's `modules/` folder.

To release: replace the `#{VERSION}#`, `#{URL}#`, `#{MANIFEST}#`, and `#{DOWNLOAD}#` placeholders in `module.json` with real values before packaging.

## File layout

```
scripts/
  index.js              — module entry point: registers data models, sheet classes, settings, socket handler
  helpers.js            — Handlebars helpers (math, stat pills, log parsing, etc.)
  models/
    KingdomActor.js     — TypeDataModel for the kingdom actor; computeState() derives all ratings
    AssetItem.js        — TypeDataModel for the asset item; TERRAIN_TYPES, ASSET_TYPES, STATS constants
  sheets/
    KingdomSheet.js     — ActorSheetV2 (ApplicationV2) for the kingdom; all roll logic lives here
    AssetSheet.js       — ItemSheetV2 for assets
templates/
  kingdom-sheet.hbs     — Handlebars template for the kingdom sheet
  asset-sheet.hbs       — Handlebars template for the asset sheet
styles/kingdom.css      — All styles; dark mode toggled via .km-dark class
lang/en.json            — i18n strings
module.json             — Foundry module manifest
```

## Architecture

### Data models (TypeDataModel)

`KingdomActorData` (`models/KingdomActor.js`) stores only persistent fields (motto, heraldry, atrocity, treasury, turn state, rulers array). All derived totals — ratings, upkeep, headroom, buildBonus, province list — are computed on demand by `computeState(items)`, which takes the actor's embedded items as input. Nothing is cached on the actor document itself.

`AssetItemData` (`models/AssetItem.js`) is used for all four asset types (province, asset, unit, obstacle) distinguished by `assetType`. Key field conventions:
- `stats` fields use `null` to mean "not applicable / no check required" (renders as "–" in the sheet), `0` to mean "contributes nothing but still requires a check".
- `buildState.active` is the canonical "is this thing built/claimed/mustered" flag.
- Province magic contribution comes from `terrain.magicPotential` minus the summed `devCost` of active assets in the same province.

### Sheet classes (ApplicationV2)

Both sheets use `HandlebarsApplicationMixin(ActorSheetV2/ItemSheetV2)` (Foundry v13 ApplicationV2 API).

`KingdomSheet` is the complex one:
- `_prepareContext` calls `computeState`, then `buildProvinceData` and `buildUnitData` (module-level functions at the bottom of the file) to assemble the full template context.
- All clickable actions that require a roll go through `_km_rollBuildCheck` or `_km_resolveObstacle`, which handle the full dialog → roll → recovery → save pipeline.
- Event listeners are split: Foundry's `data-action` system handles simple actions declared in `DEFAULT_OPTIONS.actions`; a delegated click listener on the persistent outer window handles everything else (province collapse, journal links, roll buttons). This is because Foundry re-creates the inner DOM on every render, so the delegated listener on the outer window (`this.element.parentElement`) survives re-renders. The `_listenersAttached` boolean guards against re-attachment.
- Foundry item/actor hooks (`updateItem`, `deleteItem`, `createItem`, `updateActor`) are registered in `_onRender` and cleaned up in `_onClose` to trigger re-renders when embedded items change.

### Socket

Players cannot write to the world database directly. All writes from player clients are proxied to the GM via `game.socket.emit("module.kingdom-manager", ...)`. The GM's client listens in the `ready` hook (`index.js`) and performs the actual `item.update` / `actor.update`. Three actions: `updateItem`, `updateActor`, `updateBoth`. The sheet's `_updateItem`, `_updateActor`, and `_updateBoth` helpers choose the right path based on `game.user.isGM`.

### sourcedItems STUB

`dnd5e` defines a `sourcedItems` getter on `Actor5e` that breaks when called on non-dnd5e actor types. `index.js` patches `Actor.prototype.prepareData` to stamp a no-op STUB object directly onto every `kingdom-manager.kingdom` instance, overriding any prototype getter. The `_redirectKeys()` no-op on `KingdomSheet` suppresses a related dnd5e crash on the ready hook.

### Drag-to-sort

`KingdomSheet._attachSortListeners` handles drag-and-drop reordering. Items sort within their group: provinces sort among provinces; assets/units within a province sort among the other items in that province. Uses Foundry's `updateEmbeddedDocuments` batch update with a `sort` field (integer multiples of 100000). The drag payload is the internal `application/x-km-sort` MIME type to distinguish from Foundry's own drag events.

### Roll checks

The roll pipeline in `_km_rollBuildCheck` and `_km_resolveObstacle`:
1. Dialog to choose ruler (domain turn vs personal turn) and optional help-action advantage.
2. Optional pre-roll treasury spend (max 5 pts, +1/pt).
3. Roll `1d20` (or `2d20kh`) plus proficiency plus kingdom build bonus (`floor(rating/5)`).
4. On failure: dialog to spend treasury post-roll (2 pts = +1, max 4 pts) or atrocity (+1/pt, accumulates penalty).
5. Result saved to `buildState.checks[idx].passed`; on failure the DC decreases by 1 for next attempt.
6. All writes go through `_updateBoth` (socket-aware).

Asset build checks are limited to 2 per turn per item, enforced by scanning the turn log.
