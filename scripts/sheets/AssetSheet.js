// scripts/sheets/AssetSheet.js

import { TERRAIN_TYPES, ASSET_TYPES, OBSTACLE_STATS } from "../models/AssetItem.js";

const { ItemSheetV2 }               = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class AssetSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  static DEFAULT_OPTIONS = {
    classes:  ["kingdom-manager", "asset-sheet"],
    position: { width: 480, height: 580 },
    window:   { resizable: true },
    form:     { handler: AssetSheet._onFormChange, submitOnChange: true },
    actions:  { clearJournal: AssetSheet._clearJournal },
  };

  static PARTS = {
    body: { template: "modules/kingdom-manager/templates/asset-sheet.hbs" }
  };

  static async _onFormChange(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);

    // Skip isAgent — handled by direct change listener
    if (data.system !== undefined) delete data.system.isAgent;

    // Parse stat fields — "-" or empty → null, otherwise integer
    if (data.system?.stats) {
      for (const stat of ["military","wealth","social","magic"]) {
        const raw = data.system.stats[stat];
        if (raw === "-" || raw === "" || raw === null || raw === undefined) {
          data.system.stats[stat] = null;
        } else {
          const n = parseInt(raw, 10);
          data.system.stats[stat] = isNaN(n) ? null : n;
        }
      }
    }

    await this.document.update(data);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    // Apply dark mode
    try {
      const dark = game.settings.get("kingdom-manager", "darkMode");
      const bg = dark ? "#1e1e22" : "";
      this.element.classList.toggle("km-dark", dark);
      const wc = this.element.querySelector(".window-content") ?? this.element.closest(".window-content");
      if (wc) wc.style.background = bg;
      this.element.style.background = dark ? "rgb(11, 10, 19)" : "";
    } catch(e) {}

    if (this._assetListenersAttached) return;
    this._assetListenersAttached = true;

    const win = this.element.parentElement ?? this.element;

    // Handle isAgent checkbox specifically — scoped to this sheet only
    win.addEventListener("change", async (event) => {
      const cb = event.target.closest("input[name='system.isAgent']");
      if (!cb) return;
      // Ensure the checkbox belongs to this sheet's element
      if (!this.element?.contains(event.target)) return;
      await this.item.update({ "system.isAgent": cb.checked });
    });

    // Native drop listener for journal entries
    win.addEventListener("dragover", (event) => {
      if (event.dataTransfer?.types?.includes("text/plain")) event.preventDefault();
    });
    win.addEventListener("drop", async (event) => {
      event.preventDefault();
      let data;
      try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch(e) { return; }
      if (data?.type === "JournalEntry") {
        const id = data.uuid?.split(".").pop() ?? data.id;
        if (id) {
          await this.item.update({ "system.journalId": id });
          ui.notifications.info("Journal linked.");
        }
      }
    });

    win.addEventListener("click", async (event) => {
      // Click on journal input → open the journal
      const journalInput = event.target.closest(".km-journal-input");
      if (journalInput && this.item.system.journalId) {
        const journal = game.journal?.get(this.item.system.journalId);
        if (journal) journal.sheet.render({ force: true });
        return;
      }
      const editEl = event.target.closest("[data-edit]");
      if (!editEl || event.target.closest("[data-action]")) return;
      const field   = editEl.dataset.edit;
      const current = field === "img" ? this.document.img : foundry.utils.getProperty(this.document, field);
      new foundry.applications.apps.FilePicker.implementation({
        type: "image", current: current ?? "",
        callback: async path => field === "img"
          ? this.document.update({ img: path })
          : this.document.update({ [field]: path })
      }).render(true);
    });
  }

  async _onClose(options) {
    await super._onClose(options);
    this._assetListenersAttached = false;
  }

  static async _clearJournal(event, target) {
    await this.item.update({ "system.journalId": "" });
  }



  async _prepareContext(options) {
    const ctx        = await super._prepareContext(options);
    const sys        = this.item.system;
    const isProvince = sys.assetType === "province";
    const isUnit     = sys.assetType === "unit";
    const isObstacle = sys.assetType === "obstacle";
    const isAsset    = sys.assetType === "asset";

    const terrainOptions = Object.entries(TERRAIN_TYPES).map(([key, t]) => ({
      value: key,
      label: `${t.label} (move ${t.moveCost}, magic ${t.magicPotential})`
    }));

    const assetTypeOptions = Object.entries(ASSET_TYPES).map(([key, t]) => ({
      value: key, label: t.label
    }));

    const obstacleStatOptions = Object.entries(OBSTACLE_STATS).map(([key, label]) => ({
      value: key, label
    }));

    // For obstacles: list blockable assets/units in same province
    let blockableOptions = [];
    if (isObstacle && this.item.parent) {
      const provinceId = sys.provinceId;
      // Find the province name for location-based matching
      const province = this.item.parent.items?.find(i =>
        i.type === "kingdom-manager.asset" && i.system.assetType === "province" && i.id === provinceId
      );
      const provinceName = province?.name ?? "";

      blockableOptions = (this.item.parent.items?.contents ?? [])
        .filter(i => {
          if (i.type !== "kingdom-manager.asset") return false;
          if (!["asset","unit"].includes(i.system.assetType)) return false;
          if (!i.system.buildState?.active) return false;
          // Match by provinceId OR by location matching province name
          return i.system.provinceId === provinceId
            || (provinceName && i.system.location === provinceName);
        })
        .map(i => ({ value: i.id, label: `${i.name} (${i.system.assetType})` }));
    }

    return {
      ...ctx,
      item:               this.item,
      system:             sys,
      isProvince, isUnit, isObstacle, isAsset,
      terrainOptions,
      assetTypeOptions,
      obstacleStatOptions,
      blockableOptions,
      obstacleDC:         sys.obstacleDC,
      requiredChecks:     sys.requiredChecks,
      journalName:        sys.journalId ? (game.journal?.get(sys.journalId)?.name ?? sys.journalId) : "",
    };
  }
}
