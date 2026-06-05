// scripts/index.js — Kingdom Manager module entry point

import { KingdomActorData }                          from "./models/KingdomActor.js";
import { AssetItemData, TERRAIN_TYPES, ASSET_TYPES } from "./models/AssetItem.js";
import { KingdomSheet }                              from "./sheets/KingdomSheet.js";
import { AssetSheet }                                from "./sheets/AssetSheet.js";
import { registerHelpers }                           from "./helpers.js";

const STUB = Object.freeze({
  _redirectKeys() {},
  get() { return null; },
  has() { return false; },
  set() {},
  forEach() {},
});

Hooks.once("init", () => {
  console.log("Kingdom Manager | Initialising");

  registerHelpers();

  Object.assign(CONFIG.Actor.dataModels, { "kingdom-manager.kingdom": KingdomActorData });
  Object.assign(CONFIG.Item.dataModels,  { "kingdom-manager.asset": AssetItemData });
  CONFIG.KingdomManager = { TERRAIN_TYPES, ASSET_TYPES };

  CONFIG.Actor.sheetClasses["kingdom-manager.kingdom"] = {
    "kingdom-manager.KingdomSheet": {
      id: "kingdom-manager.KingdomSheet", cls: KingdomSheet,
      default: true, label: "Kingdom Sheet", canBeDefault: true, canConfigure: true,
    }
  };
  CONFIG.Item.sheetClasses["kingdom-manager.asset"] = {
    "kingdom-manager.AssetSheet": {
      id: "kingdom-manager.AssetSheet", cls: AssetSheet,
      default: true, label: "Asset Sheet", canBeDefault: true, canConfigure: true,
    }
  };

  // Patch Actor.prototype right here in init so it is in place
  // before dnd5e's own init and before setupGame runs.
  // Define sourcedItems on Actor.prototype — dnd5e will override this on Actor5e,
  // but we also patch prepareData to stamp it on instances.


  // Also patch prepareData to stamp STUB on kingdom actor instances directly
  const _origPrepareData = Actor.prototype.prepareData;
  Actor.prototype.prepareData = function() {
    _origPrepareData.call(this);
    if (this.type === "kingdom-manager.kingdom") {
      // Use defineProperty to override even if a getter exists on the prototype
      const desc = Object.getOwnPropertyDescriptor(this, "sourcedItems");
      if (!desc || desc.configurable) {
        Object.defineProperty(this, "sourcedItems", {
          value: STUB, configurable: true, writable: true, enumerable: false
        });
      }
    }
  };

  game.settings.register("kingdom-manager", "darkMode", {
    name:    "Dark mode",
    hint:    "Use a dark colour scheme for the kingdom sheet.",
    scope:   "client",
    config:  true,
    type:    Boolean,
    default: false,
    onChange: (value) => applyDarkMode(value),
  });

  game.settings.register("kingdom-manager", "showMoveCost", {
    name: "Show movement cost on provinces",
    hint: "Display terrain movement cost on each province header.",
    scope: "client", config: true, type: Boolean, default: true
  });
});

Hooks.once("setup", () => {
  console.log("Kingdom Manager | Setup — patching sheet class");

  const _origActorSheet = Actor.prototype._getSheetClass;
  Actor.prototype._getSheetClass = function() {
    if (this.type === "kingdom-manager.kingdom") return KingdomSheet;
    return _origActorSheet.call(this);
  };

  const _origItemSheet = Item.prototype._getSheetClass;
  Item.prototype._getSheetClass = function() {
    if (this.type === "kingdom-manager.asset") return AssetSheet;
    return _origItemSheet.call(this);
  };
});

function applyDarkMode(enabled) {
  // Re-render all open kingdom/asset sheets — _onRender applies the class
  for (const app of Object.values(foundry.applications.instances ?? {})) {
    if (app instanceof KingdomSheet || app instanceof AssetSheet) {
      app.render();
    }
  }
}

Hooks.once("ready", () => {
  game.socket.on("module.kingdom-manager", async (data) => {
    if (!game.user.isGM) return;
    if (data.action === "updateItem") {
      const item = game.actors.get(data.actorId)?.items.get(data.itemId);
      if (item) await item.update(data.updates);
    }
    if (data.action === "updateActor") {
      const actor = game.actors.get(data.actorId);
      if (actor) await actor.update(data.updates);
    }
    if (data.action === "updateBoth") {
      const actor = game.actors.get(data.actorId);
      const item  = actor?.items.get(data.itemId);
      if (item)  await item.update(data.itemUpdates);
      if (actor) await actor.update(data.actorUpdates);
    }
  });
});
