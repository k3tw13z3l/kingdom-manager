// scripts/models/KingdomActor.js

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
        number: new fields.NumberField({ initial: 1, integer: true, min: 1 }),
        log:    new fields.ArrayField(new fields.StringField())
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
    const provinces   = {};  // provinceItemId → { item, devLoad, assets, units }
    const ratings     = { military: 0, wealth: 0, social: 0, magic: 0 };
    const upkeep      = { military: 0, wealth: 0, social: 0, magic: 0 };

    // First pass — index provinces
    for (const item of items) {
      if (item.type !== "kingdom-manager.asset") continue;
      const d = item.system;
      if (d.assetType === "province") {
        provinces[item.id] = {
          item,
          devLoad: 0,
          magicPotential: d.magicPotential,
          assets: [],
          units:  [],
        };
        // Province base stats only count once claimed (buildState.active)
        // Unclaimed provinces are being claimed and don't contribute yet
        if (d.buildState?.active !== false) {  // active=true OR undefined (legacy)
          for (const stat of ["military","wealth","social"]) {
            ratings[stat] += d.stats[stat] ?? 0;
          }
        }
        // Province magic is computed after dev load is known
      }
    }

    // Collect blocked asset ids from active obstacles with score > 0
    const blockedIds = new Set();
    // Count available unit slots per province from active assets
    const garrisonedUnitIds = new Set();  // unit ids whose upkeep is covered by a slot
    for (const item of items) {
      if (item.type !== "kingdom-manager.asset") continue;
      if (item.system.assetType !== "obstacle") continue;
      if ((item.system.obstacleScore ?? 0) > 0 && item.system.blockedAssetId)
        blockedIds.add(item.system.blockedAssetId);
    }

    // Build province id → name lookup
    const provinceNameById = {};
    for (const item of items) {
      if (item.type === "kingdom-manager.asset" && item.system.assetType === "province")
        provinceNameById[item.id] = item.name;
    }
    // Helper: get location key for any asset/unit — location text preferred, province name fallback
    const locationKey = (sys) => sys.location || provinceNameById[sys.provinceId] || "";

    // Collect unit slots indexed by location key
    const slotsByLocation = {};  // location name → slots remaining
    for (const item of items) {
      if (item.type !== "kingdom-manager.asset") continue;
      const d = item.system;
      if (d.assetType !== "asset" || !d.buildState?.active || !d.unitSlots) continue;
      const key = locationKey(d);
      if (key) slotsByLocation[key] = (slotsByLocation[key] ?? 0) + d.unitSlots;
    }

    // Second pass — built assets and units
    for (const item of items) {
      if (item.type !== "kingdom-manager.asset") continue;
      const d = item.system;
      if (d.assetType === "province") continue;
      // Blocked assets/units still appear in the province list but don't contribute stats
      const isBlocked = blockedIds.has(item.id);

      const prov = provinces[d.provinceId];

      if (d.isUnit) {
        // Only mustered (active) units draw upkeep (blocked is cosmetic only)
        if (d.buildState?.active) {
          // Check if a slot covers this unit's location
          const key     = locationKey(d);
          const hasSlot = !d.isAgent && key && (slotsByLocation[key] ?? 0) > 0;
          if (hasSlot) {
            slotsByLocation[key]--;
            garrisonedUnitIds.add(item.id);
          } else {
            for (const stat of ["military","wealth","social","magic"]) {
              const cost = Math.abs(d.stats[stat] ?? 0);
              upkeep[stat] += cost;
            }
          }
          if (prov) prov.units.push(item);
        }
      } else if (d.isObstacle) {
        // Obstacle drains ceil(score/2) from ALL four stats ONLY if not blocking a specific asset
        if (!d.blockedAssetId) {
          const drain = Math.ceil((d.obstacleScore ?? 0) / 2);
          for (const stat of ["military","wealth","social","magic"]) {
            upkeep[stat] += drain;
          }
        }
      } else if (d.buildState?.active) {
        // Active built asset contributes stats and upkeep (unless blocked)
        if (!isBlocked) {
          for (const stat of ["military","wealth","social","magic"]) {
            ratings[stat] += d.stats[stat] ?? 0;
          }
          if (d.upkeep) {
            for (const stat of ["military","wealth","social","magic"]) {
              upkeep[stat] += d.upkeep[stat] ?? 0;
            }
          }
          prov && (prov.devLoad += d.devCost ?? 0);
        }
        if (prov) prov.assets.push(item);
      }
    }

    // Compute magic remaining per province, add to kingdom magic rating
    const provinceList = [];
    for (const [id, prov] of Object.entries(provinces)) {
      const magicRemaining = Math.max(0, prov.magicPotential - prov.devLoad);
      ratings.magic += magicRemaining;
      provinceList.push({
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
      });
    }

    // Atrocity upkeep penalty: 2 + floor(atrocity/4) to all stats
    const atrocity = this.parent?.system?.atrocity ?? 0;
    if (atrocity > 0) {
      const penalty = 2 + Math.floor(atrocity / 4);
      for (const stat of ["military","wealth","social","magic"]) {
        upkeep[stat] += penalty;
      }
    }

    // Floor ratings at 0
    for (const stat of ["military","wealth","social","magic"]) {
      ratings[stat] = Math.max(0, ratings[stat]);
    }

    // Build bonus: every 5 rating points = +1
    const buildBonus = {};
    for (const stat of ["military","wealth","social","magic"]) {
      buildBonus[stat] = Math.floor(ratings[stat] / 5);
    }

    // Headroom
    const headroom = {};
    for (const stat of ["military","wealth","social","magic"]) {
      headroom[stat] = ratings[stat] - upkeep[stat];
    }

    return { ratings, upkeep, headroom, buildBonus, provinces: provinceList, garrisonedUnitIds };
  }

  /**
   * Build a flat ratingDisplay array for the ratings template.
   * Called by KingdomSheet._prepareContext after computeState().
   */
  static buildRatingDisplay(state) {
    return ["military","wealth","social","magic"].map(stat => {
      const generated  = state.ratings[stat]    ?? 0;
      const upkeep     = state.upkeep[stat]     ?? 0;
      const headroom   = state.headroom[stat]   ?? 0;
      const buildBonus = state.buildBonus[stat] ?? 0;
      const over       = headroom < 0;
      const barPct     = generated > 0
        ? Math.min(100, Math.round((upkeep / generated) * 100))
        : (upkeep > 0 ? 100 : 0);
      return { stat, generated, upkeep, headroom, buildBonus, over, barPct };
    });
  }

}
