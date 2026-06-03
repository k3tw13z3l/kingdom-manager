// scripts/models/AssetItem.js

export const STATS = ["military", "wealth", "social", "magic"];

export const TERRAIN_TYPES = {
  desert:           { label: "Desert",            icon: "fa-sun",        moveCost: 3, magicPotential: 5 },
  glacier:          { label: "Glacier",            icon: "fa-snowflake",  moveCost: 4, magicPotential: 5 },
  forest:           { label: "Forest",             icon: "fa-tree",       moveCost: 3, magicPotential: 6 },
  ancient_forest:   { label: "Ancient Forest",     icon: "fa-tree",       moveCost: 3, magicPotential: 9 },
  hills:            { label: "Hills",              icon: "fa-hiking",     moveCost: 3, magicPotential: 5 },
  light_forest:     { label: "Light Forest",       icon: "fa-leaf",       moveCost: 2, magicPotential: 5 },
  marsh:            { label: "Marsh",              icon: "fa-water",      moveCost: 4, magicPotential: 5 },
  low_mountains:    { label: "Low Mountains",      icon: "fa-mountain",   moveCost: 3, magicPotential: 6 },
  med_mountains:    { label: "Medium Mountains",   icon: "fa-mountain",   moveCost: 5, magicPotential: 7 },
  high_mountains:   { label: "High Mountains",     icon: "fa-mountain",   moveCost: 6, magicPotential: 9 },
  moor:             { label: "Moor / Highland",    icon: "fa-cloud",      moveCost: 2, magicPotential: 5 },
  plains:           { label: "Plains",             icon: "fa-seedling",   moveCost: 1, magicPotential: 4 },
  steppe:           { label: "Steppe",             icon: "fa-wind",       moveCost: 1, magicPotential: 4 },
  swamp:            { label: "Swamp",              icon: "fa-frog",       moveCost: 4, magicPotential: 8 },
  tundra:           { label: "Tundra",             icon: "fa-icicles",    moveCost: 2, magicPotential: 5 },
  river_upstream:   { label: "River (upstream)",   icon: "fa-stream",     moveCost: 2, magicPotential: 0 },
  river_downstream: { label: "River (downstream)", icon: "fa-water",      moveCost: 1, magicPotential: 0 },
  sea:              { label: "Sea",                icon: "fa-anchor",     moveCost: 1, magicPotential: 0 },
  realm:            { label: "Realm",              icon: "fa-crown",      moveCost: 0, magicPotential: 0 },
};

// The three asset types
export const ASSET_TYPES = {
  province: { label: "Province", isUnit: false, hasDevCost: false },
  asset:    { label: "Asset",    isUnit: false, hasDevCost: true  },
  unit:     { label: "Unit",     isUnit: true,  hasDevCost: false },
  obstacle: { label: "Obstacle", isUnit: false, hasDevCost: false },
};

// Which kingdom stat an obstacle checks against
export const OBSTACLE_STATS = {
  military: "Military",
  wealth:   "Wealth",
  social:   "Social",
  magic:    "Magic",
};

export class AssetItemData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      assetType: new fields.StringField({
        initial: "asset",
        choices: Object.keys(ASSET_TYPES)
      }),

      // Which province this asset/unit/obstacle belongs to (item id)
      provinceId: new fields.StringField({ initial: "" }),

      // ── Province-only ──────────────────────────────────────────────────
      terrainType: new fields.StringField({
        initial: "plains",
        choices: Object.keys(TERRAIN_TYPES)
      }),

      // ── Asset & Unit stats ─────────────────────────────────────────────
      // Positive = contributes to kingdom rating
      // Negative = drains kingdom rating (upkeep for units, maintenance for assets)
      stats: new fields.SchemaField({
        military: new fields.NumberField({ initial: null, integer: true, nullable: true }),
        wealth:   new fields.NumberField({ initial: null, integer: true, nullable: true }),
        social:   new fields.NumberField({ initial: null, integer: true, nullable: true }),
        magic:    new fields.NumberField({ initial: null, integer: true, nullable: true }),
      }),

      // Upkeep cost — drains kingdom ratings each turn (like unit upkeep)
      upkeep: new fields.SchemaField({
        military: new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        wealth:   new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        social:   new fields.NumberField({ initial: 0, integer: true, min: 0 }),
        magic:    new fields.NumberField({ initial: 0, integer: true, min: 0 }),
      }),

      // Development cost — how much this asset suppresses province magic potential
      devCost: new fields.NumberField({ initial: 0, integer: true, min: 0 }),

      // Unit slots — number of garrisoned units whose upkeep is covered by this asset
      unitSlots: new fields.NumberField({ initial: 0, integer: true, min: 0 }),

      // Base DC for build/claim/muster checks (provinces default 10, others 12)
      buildBaseDC: new fields.NumberField({ initial: 12, integer: true, min: 1 }),

      // Build progress — for non-province, non-unit, non-obstacle assets
      buildState: new fields.SchemaField({
        active: new fields.BooleanField({ initial: false }),
        checks: new fields.ArrayField(new fields.SchemaField({
          stat:   new fields.StringField({ initial: "military" }),
          dc:     new fields.NumberField({ initial: 12, integer: true }),
          passed: new fields.BooleanField({ initial: false }),
        }))
      }),

      // ── Obstacle-only ──────────────────────────────────────────────────
      obstacleScore:  new fields.NumberField({ initial: 1, integer: true, min: 0, max: 6 }),
      obstacleBaseDC: new fields.NumberField({ initial: 14, integer: true, min: 1 }),
      obstacleStat:   new fields.StringField({ initial: "social", choices: Object.keys(OBSTACLE_STATS) }),
      blockedAssetId: new fields.StringField({ initial: "", nullable: true }),  // item id of blocked asset/unit
      // Log of resolution attempts this turn
      obstacleLog: new fields.ArrayField(new fields.StringField()),

      // ── Unit feature — allows unit to roll obstacle resolve checks ──────────
      // Unit subtype — only "army" can be garrisoned in a barracks (no upkeep)
      unitType: new fields.StringField({ initial: "army", nullable: true }),
      unitFeatureStat:  new fields.StringField({ initial: "", nullable: true }),
      unitFeatureBonus: new fields.NumberField({ initial: 0, integer: true }),

      // ── Shared ────────────────────────────────────────────────────────
      skipChecks:  new fields.BooleanField({ initial: false }),
      journalId:   new fields.StringField({ initial: "", nullable: true }),
      description: new fields.StringField({ initial: "" }),
      location:    new fields.StringField({ initial: "" }),
    };
  }

  // ── Derived helpers ──────────────────────────────────────────────────────

  get terrain() {
    return TERRAIN_TYPES[this.terrainType] ?? TERRAIN_TYPES.plains;
  }

  get magicPotential() {
    if (this.assetType !== "province") return 0;
    return this.terrain.magicPotential;
  }

  get moveCost() { return this.terrain.moveCost; }

  get isUnit() { return this.assetType === "unit"; }
  get isProvince() { return this.assetType === "province"; }
  get isObstacle() { return this.assetType === "obstacle"; }

  get isActive() {
    if (this.assetType === "province") return true;
    if (this.isUnit) return true;
    if (this.isObstacle) return true;
    return this.buildState.active;
  }

  /** DC to resolve this obstacle = 12 + current score */
  get obstacleDC() { return (this.obstacleBaseDC ?? 14) + (this.obstacleScore ?? 0); }

  /** Build check DCs for assets: DC = 12 + abs(stat value) for each non-zero stat */
  get requiredChecks() {
    const base = this.buildBaseDC ?? (this.assetType === "province" ? 10 : 12);
    const checks = Object.entries(this.stats)
      .filter(([stat, v]) => {
        if (this.assetType === "province" && stat === "magic") return false;
        return v !== null;  // null = "-" = ignored; 0 and any number = check needed
      })
      .map(([stat, val]) => ({ stat, value: val, dc: base + Math.abs(val ?? 0) }));

    // Province magic check from terrain
    if (this.assetType === "province" && this.magicPotential > 0) {
      checks.push({ stat: "magic", value: this.magicPotential, dc: base + this.magicPotential });
    }

    return checks;
  }

  static buildBonus(kingdomRating) {
    return Math.floor(kingdomRating / 5);
  }
}
