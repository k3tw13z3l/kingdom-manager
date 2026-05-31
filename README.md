# Kingdom Manager

A FoundryVTT v13 module for managing a domain/kingdom in D&D 5e, designed for the homebrew system and based on *An Echo Resounding* by Kevin Crawford.

## Overview

Kingdom Manager adds a custom Actor type (`kingdom`) and Item type (`asset`) to Foundry. A kingdom actor tracks ratings, provinces, assets, units, obstacles, rulers, treasury, and atrocity. Players with ownership of a linked ruler actor can participate in domain turns by rolling checks through the kingdom sheet.

## Installation

1. Download the latest `kingdom-manager.zip` from the releases page.
2. In Foundry, go to Add-on Modules and install from the zip file.
3. Enable the module in your world settings.
4. Create a new Actor and set its type to `Kingdom`.

## Core Concepts

### Ratings

The kingdom has four ratings: Military, Wealth, Social, and Magic. Ratings are calculated each turn from active province land values and asset contributions, minus upkeep from units, assets, and obstacles. Magic is derived from province terrain potential minus development load.

### Provinces

A province is an asset item of type Province. Each province has a terrain type that determines its movement cost and magic potential. Dropping a province item onto the kingdom sheet starts a claiming process with stat-based checks (base DC 10).

### Assets

An asset item of type Asset represents a built structure in a province. Assets contribute stats to kingdom ratings, may have upkeep costs, can provide garrison slots for units, and can suppress province magic potential via their development cost. Building an asset requires passing stat checks (base DC 12 plus the asset's stat values and upkeep costs).

### Units

Units are mustered forces or agents. Warfare units draw upkeep from kingdom ratings each turn. Agents are flagged separately and cannot occupy garrison slots. Units stationed in a province with an asset that has garrison slots (such as a barracks) pay no upkeep for those slots. Units can have a feature stat and bonus that allows them to roll obstacle resolve checks.

### Obstacles

An obstacle represents a problem in a province: unrest, a monster lair, a blighted road. Obstacles either drain all four stats each turn (general type) or disable a specific asset or unit (blocking type). Rulers or eligible units can attempt to resolve an obstacle by rolling against its DC, reducing its score on a success.

### Rulers

Rulers are linked to existing player character actors. Each ruler's class determines which kingdom stats they are proficient in for roll checks. Rulers are added by dragging a character actor onto the kingdom sheet ratings section.

### Treasury and Atrocity

Treasury points can be spent to boost rolls before or after the dice. Spending before a roll gives +1 per point (max 5 points). Spending after a roll gives +1 per 2 points (max 4 points). Atrocity accumulates when rulers spend atrocity points to recover failed rolls. Each point of atrocity above 0 adds an upkeep penalty of 2 plus floor(atrocity / 4) to all four stats.

## Asset Types

| Type | Purpose |
|------|---------|
| Province | A claimed territory with terrain, land values, and magic potential |
| Asset | A built structure that contributes stats, has upkeep, and may provide garrison slots |
| Unit | A mustered force or agent that draws upkeep and can resolve obstacles |
| Obstacle | A problem that drains stats or disables a specific asset or unit |

## Roll Checks

All domain rolls follow the same structure:

1. The GM or an eligible player clicks Roll on a pending check.
2. A dialog asks which ruler (or eligible unit) makes the roll, with optional treasury spend and help action (advantage).
3. The ruler rolls 1d20 plus proficiency (if their class matches the stat) plus the kingdom build bonus (floor(rating / 5)).
4. On failure, the player may spend treasury points or atrocity to recover.
5. The result is saved to the item and logged in the turn log.

The build bonus applies to all four stats: Military (Barbarian, Fighter, Paladin, Ranger), Wealth (Bard, Rogue), Social (Bard, Cleric, Druid, Monk), Magic (Druid, Sorcerer, Warlock, Wizard).

## Player Permissions

Players with Owner permission on a linked ruler actor can open the kingdom sheet (requires at least Observer permission on the kingdom actor) and roll checks for their ruler. They cannot edit assets, delete items, adjust treasury or atrocity, or use GM-only manual check toggles. All player rolls are proxied through the GM client via socket.

## Settings

| Setting | Scope | Description |
|---------|-------|-------------|
| Show movement cost | World | Displays terrain movement cost in province headers |
| Dark mode | Client | Switches kingdom and asset sheets to a dark colour scheme |

## Journal Links

Any asset can be linked to a journal entry by dragging a journal entry onto the Journal field in the asset sheet. Once linked, clicking the asset name in the kingdom sheet opens the journal directly.

## License

This module is released under the MIT License. The rules mechanics are based on *An Echo Resounding* by Kevin Crawford (Sine Nomine Publishing).
