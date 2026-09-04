// scripts/models/KingdomActor.js

import { STATS } from "./AssetItem.js";

function zeroStats() {
  return { military: 0, wealth: 0, social: 0, magic: 0 };
}

function addStats(target, source, abs = false) {
  for (const stat of STATS) {
    const v = source[stat] ?? 0;
    target[stat] += abs ? Math.abs(v) : v;
  }
}

export class KingdomActorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      motto:    new fields.StringField({ initial: "" }),
      heraldry: new fields.FilePathField({ categories: ["IMAGE"], initial: null, nullable: true, blank: false }),
      atrocity: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      treasury: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      notes: new fields.StringField({ initial: "" }),

      // Domain turn state
      turn: new fields.SchemaField({
        number:          new fields.NumberField({ initial: 1, integer: true, min: 1 }),
        log:             new fields.ArrayField(new fields.StringField()),
        domainTurn1Used: new fields.BooleanField({ initial: false }),
        domainTurn2Used: new fields.BooleanField({ initial: false }),
      }),

      // Rulers: { id, name, class, profBonus, personalTurnUsed }
      rulers: new fields.ArrayField(new fields.SchemaField({
        id:               new fields.StringField({ initial: () => foundry.utils.randomID() }),
        name:             new fields.StringField({ initial: "Ruler" }),
        rulerClass:       new fields.StringField({ initial: "" }),
        profBonus:        new fields.NumberField({ initial: 2, integer: true, min: 0 }),
        personalTurnUsed: new fields.BooleanField({ initial: false })
      }))
    };
  }

  // ---------------------------------------------------------------------------
  // Derived kingdom totals — all computed from owned items
  // ---------------------------------------------------------------------------

  /**
   * Full kingdom state derived from all items on this actor.
   * Returns:
   *   ratings       — { military, wealth, social, magic } from province + built assets
   *   upkeep        — { military, wealth, social, magic } total unit upkeep
   *   headroom      — ratings − upkeep per stat (negative = consequence)
   *   buildBonus    — { military, wealth, social, magic } bonus per 5 rating points
   *   provinces     — array of province summaries with dev load and magic remaining
   */
  computeState(items) {
    const provinces        = this._indexProvinces(items);
    const blockedIds       = this._collectBlockedIds(items);
    const provinceNameById = Object.fromEntries(
      Object.entries(provinces).map(([id, p]) => [id, p.item.name])
    );
    const locationKey = (sys) => sys.location || provinceNameById[sys.provinceId] || "";

    const ratings = zeroStats();
    const upkeep  = zeroStats();

    // Province base stats (active/legacy only)
    for (const { item } of Object.values(provinces)) {
      const d = item.system;
      if (d.buildState?.active !== false) {
        for (const stat of ["military", "wealth", "social"]) ratings[stat] += d.stats[stat] ?? 0;
      }
    }

    // Per-asset remaining slots, keyed by asset item ID
    const assetSlotRemaining = new Map();
    // Garrison assets grouped by location key: locationKey → [{assetId, assetName, slots}]
    const garrisonAssetsByLoc = new Map();
    for (const item of items) {
      if (item.type !== "kingdom-manager.asset") continue;
      const d = item.system;
      if (d.assetType !== "asset" || !d.buildState?.active || !d.unitSlots) continue;
      const key = locationKey(d);
      if (!key) continue;
      if (!garrisonAssetsByLoc.has(key)) garrisonAssetsByLoc.set(key, []);
      garrisonAssetsByLoc.get(key).push({ assetId: item.id, assetName: item.name, slots: d.unitSlots });
      assetSlotRemaining.set(item.id, d.unitSlots);
    }

    // unitId → { assetId, assetName }
    const garrisonedUnitMap = new Map();

    for (const item of items) {
      if (item.type !== "kingdom-manager.asset") continue;
      const d = item.system;
      if (d.assetType === "province") continue;

      const prov = provinces[d.provinceId];

      if (d.isUnit) {
        if (!d.buildState?.active) continue;
        const key      = locationKey(d);
        const eligible = (d.unitType === "army" || d.unitType === "garrison") && !!key;
        if (eligible) {
          const garrisons = garrisonAssetsByLoc.get(key) ?? [];
          let assigned = null;
          // Honour the unit's preferred garrison asset
          if (d.garrisonAssetId) {
            const pref = garrisons.find(g => g.assetId === d.garrisonAssetId && (assetSlotRemaining.get(g.assetId) ?? 0) > 0);
            if (pref) assigned = pref;
          }
          // Fall back to first asset with remaining slots
          if (!assigned) assigned = garrisons.find(g => (assetSlotRemaining.get(g.assetId) ?? 0) > 0);
          if (assigned) {
            assetSlotRemaining.set(assigned.assetId, (assetSlotRemaining.get(assigned.assetId) ?? 0) - 1);
            garrisonedUnitMap.set(item.id, { assetId: assigned.assetId, assetName: assigned.assetName });
          } else {
            addStats(upkeep, d.stats, /* abs */ true);
          }
        } else {
          addStats(upkeep, d.stats, /* abs */ true);
        }
        if (prov) prov.units.push(item);
      } else if (d.isObstacle) {
        // Obstacle drains ceil(score/2) from all stats ONLY if not blocking a specific asset
        if (!d.blockedAssetId) {
          const drain = Math.ceil((d.obstacleScore ?? 0) / 2);
          for (const stat of STATS) upkeep[stat] += drain;
        }
      } else if (d.buildState?.active) {
        if (!blockedIds.has(item.id)) {
          addStats(ratings, d.stats);
          if (d.upkeep) addStats(upkeep, d.upkeep);
          if (prov) prov.devLoad += d.devCost ?? 0;
        }
        if (prov) prov.assets.push(item);
      }
    }

    const provinceList = this._buildProvinceList(provinces, ratings);

    // Atrocity upkeep penalty: 2 + floor(atrocity/4) to all stats
    const atrocity = this.parent?.system?.atrocity ?? 0;
    if (atrocity > 0) {
      const penalty = 2 + Math.floor(atrocity / 4);
      for (const stat of STATS) upkeep[stat] += penalty;
    }

    for (const stat of STATS) ratings[stat] = Math.max(0, ratings[stat]);

    const buildBonus = zeroStats();
    const headroom   = zeroStats();
    for (const stat of STATS) {
      buildBonus[stat] = Math.floor(ratings[stat] / 5);
      headroom[stat]   = ratings[stat] - upkeep[stat];
    }

    const garrisonedUnitIds = new Set(garrisonedUnitMap.keys());
    return { ratings, upkeep, headroom, buildBonus, provinces: provinceList, garrisonedUnitIds, garrisonedUnitMap, garrisonAssetsByLoc };
  }

  _indexProvinces(items) {
    const provinces = {};
    for (const item of items) {
      if (item.type !== "kingdom-manager.asset") continue;
      const d = item.system;
      if (d.assetType !== "province") continue;
      provinces[item.id] = {
        item,
        devLoad:        0,
        magicPotential: d.magicPotential,
        assets:         [],
        units:          [],
      };
    }
    return provinces;
  }

  _collectBlockedIds(items) {
    const blockedIds = new Set();
    for (const item of items) {
      if (item.type !== "kingdom-manager.asset") continue;
      if (item.system.assetType !== "obstacle") continue;
      if ((item.system.obstacleScore ?? 0) > 0 && item.system.blockedAssetId)
        blockedIds.add(item.system.blockedAssetId);
    }
    return blockedIds;
  }

  _collectUnitSlots(items, locationKey) {
    const slotsByLocation = {};
    for (const item of items) {
      if (item.type !== "kingdom-manager.asset") continue;
      const d = item.system;
      if (d.assetType !== "asset" || !d.buildState?.active || !d.unitSlots) continue;
      const key = locationKey(d);
      if (key) slotsByLocation[key] = (slotsByLocation[key] ?? 0) + d.unitSlots;
    }
    return slotsByLocation;
  }

  _buildProvinceList(provinces, ratings) {
    return Object.entries(provinces).sort((a, b) => (a[1].item.sort ?? 0) - (b[1].item.sort ?? 0)).map(([id, prov]) => {
      const magicRemaining = Math.max(0, prov.magicPotential - prov.devLoad);
      if (prov.item.system.buildState?.active !== false) ratings.magic += magicRemaining;
      return {
        id,
        item:           prov.item,
        name:           prov.item.name,
        terrain:        prov.item.system.terrain,
        stats:          prov.item.system.stats,
        magicPotential: prov.magicPotential,
        devLoad:        prov.devLoad,
        magicRemaining,
        assets:         prov.assets,
        units:          prov.units,
      };
    });
  }
}
