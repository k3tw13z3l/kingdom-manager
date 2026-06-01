// scripts/sheets/KingdomSheet.js

const { ActorSheetV2 }                        = foundry.applications.sheets;
const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export class KingdomSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes:  ["kingdom-manager", "kingdom-sheet"],
    position: { width: 980, height: 820 },
    window:   { resizable: true },
    form:     { submitOnChange: true },
    actions: {
      nextTurn:         KingdomSheet._km_nextTurn,
      editImage:        KingdomSheet._km_editImage,
      editHeraldry:     KingdomSheet._km_editHeraldry,
      removeRuler:      KingdomSheet._km_removeRuler,
      addLogEntry:      KingdomSheet._km_addLogEntry,
      removeLogEntry:   KingdomSheet._km_removeLogEntry,
      editItem:         KingdomSheet._km_editItem,
      deleteItem:       KingdomSheet._km_deleteItem,
      toggleBuildCheck: KingdomSheet._km_toggleBuildCheck,
      activateAsset:    KingdomSheet._km_activateAsset,
      adjustTreasury:   KingdomSheet._km_adjustTreasury,
      adjustAtrocity:   KingdomSheet._km_adjustAtrocity,
    }
  };

  static PARTS = {
    body: { template: "modules/kingdom-manager/templates/kingdom-sheet.hbs", scrollable: [""] }
  };

  static CLASS_STATS = {
    military: ["barbarian","fighter","paladin","ranger"],
    wealth:   ["bard","rogue"],
    social:   ["bard","cleric","druid","monk"],
    magic:    ["druid","sorcerer","warlock","wizard"],
  };

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  _onRender(context, options) {
    super._onRender?.(context, options);

    // Apply dark mode — this.element is window-content
    try {
      const dark = game.settings.get("kingdom-manager", "darkMode");
      this.element.classList.toggle("km-dark", dark);
      // Also apply to parent app window so scrollbar area is dark
      if (this.element.parentElement) {
        this.element.parentElement.style.background = dark ? "#1e1e22" : "";
      }
    } catch(e) {}

    const LISTENER_VERSION = 5;
    if (this._listenersAttached === LISTENER_VERSION) return;
    this._listenersAttached = LISTENER_VERSION;

    // Re-render on document/item changes (propagated to all clients by Foundry)
    this._itemUpdateHook = Hooks.on("updateItem",  (item)  => { if (item.parent?.id  === this.document.id) this.render(); });
    this._itemDeleteHook = Hooks.on("deleteItem",  (item)  => { if (item.parent?.id  === this.document.id) this.render(); });
    this._itemCreateHook = Hooks.on("createItem",  (item)  => { if (item.parent?.id  === this.document.id) this.render(); });
    this._actorUpdateHook= Hooks.on("updateActor", (actor) => { if (actor.id         === this.document.id) this.render(); });

    // Attach delegated listeners to the persistent outer window (survives re-renders)
    const win = this.element.parentElement ?? this.element;

    win.addEventListener("click", async (event) => {
      // Province collapse toggle — skip if clicking action buttons
      const provToggle = event.target.closest(".km-prov-toggle");
      if (provToggle && !event.target.closest(".km-prov-actions")) {
        const provId  = provToggle.dataset.provId;
        const body    = win.querySelector(`#provbody-${provId}`);
        const chevron = provToggle.querySelector(".km-prov-chevron");
        if (body) {
          const collapsed = body.classList.toggle("km-collapsed");
          chevron?.classList.toggle("km-prov-chevron-open",   !collapsed);
          chevron?.classList.toggle("km-prov-chevron-closed",  collapsed);
        }
        return;
      }

      // Asset name click → open linked journal
      const assetName = event.target.closest(".km-asset-name[data-journal-id]");
      if (assetName) {
        const journal = game.journal?.get(assetName.dataset.journalId);
        if (journal) journal.sheet.render({ force: true });
        return;
      }

      // Description chevron toggle
      const toggle = event.target.closest(".km-desc-toggle");
      if (toggle) {
        const el = win.querySelector("#" + toggle.dataset.target);
        if (el) { el.classList.toggle("open"); toggle.classList.toggle("open"); }
        return;
      }
      // Ruler portrait/name → open linked actor sheet
      const rulerEl = event.target.closest(".km-rc-portrait, .km-rc-name");
      if (rulerEl) {
        const card  = rulerEl.closest("[data-ruler-id]");
        const ruler = this.document.system.rulers?.find(r => r.id === card?.dataset.rulerId);
        const actor = ruler ? game.actors?.find(a => a.name === ruler.name) : null;
        if (actor) actor.sheet.render({ force: true });
        return;
      }
      // Roll/resolve buttons (spans, not buttons, to bypass Foundry's stopPropagation)
      const kmBtn = event.target.closest("[data-km-action]");
      if (kmBtn) {
        const action = kmBtn.dataset.kmAction;
        if (action === "rollBuildCheck")  await KingdomSheet._km_rollBuildCheck.call(this, event, kmBtn);
        if (action === "resolveObstacle") await KingdomSheet._km_resolveObstacle.call(this, event, kmBtn);
        return;
      }
      // Image picker
      const editEl = event.target.closest("[data-edit]");
      if (editEl && !event.target.closest("[data-action]")) {
        const field   = editEl.dataset.edit;
        const current = field === "img" ? this.document.img : foundry.utils.getProperty(this.document, field);
        new foundry.applications.apps.FilePicker.implementation({
          type: "image", current: current ?? "",
          callback: path => field === "img" ? this.document.update({ img: path }) : this.document.update({ [field]: path })
        }).render(true);
        return;
      }
    });

    // Ruler personal turn checkbox
    win.addEventListener("change", async (event) => {
      const cb = event.target.closest(".km-rc-checkbox input[type=checkbox]");
      if (!cb) return;
      const rulers = foundry.utils.deepClone(this.document.system.rulers);
      const ruler  = rulers.find(r => r.id === cb.dataset.rulerId);
      if (ruler) ruler.personalTurnUsed = cb.checked;
      await this.document.update({ "system.rulers": rulers });
    });
  }

  async _onClose(options) {
    await super._onClose(options);
    if (this._itemUpdateHook)  { Hooks.off("updateItem",  this._itemUpdateHook);  }
    if (this._itemDeleteHook)  { Hooks.off("deleteItem",  this._itemDeleteHook);  }
    if (this._itemCreateHook)  { Hooks.off("createItem",  this._itemCreateHook);  }
    if (this._actorUpdateHook) { Hooks.off("updateActor", this._actorUpdateHook); }
    this._listenersAttached = 0;
  }

  _redirectKeys() {}  // no-op — prevents dnd5e ready hook crash

  // ── Socket-aware update helpers ───────────────────────────────────────────

  async _updateItem(item, updates) {
    if (game.user.isGM) return item.update(updates);
    game.socket.emit("module.kingdom-manager", { action: "updateItem", actorId: this.document.id, itemId: item.id, updates });
  }

  async _updateActor(updates) {
    if (game.user.isGM) return this.document.update(updates);
    game.socket.emit("module.kingdom-manager", { action: "updateActor", actorId: this.document.id, updates });
  }

  async _updateBoth(item, itemUpdates, actorUpdates) {
    if (game.user.isGM) { await item.update(itemUpdates); await this.document.update(actorUpdates); return; }
    game.socket.emit("module.kingdom-manager", { action: "updateBoth", actorId: this.document.id, itemId: item.id, itemUpdates, actorUpdates });
  }

  // ── Context ────────────────────────────────────────────────────────────────

  async _prepareContext(options) {
    const ctx   = await super._prepareContext(options);
    const actor = ctx.actor ?? this.document;
    const sys   = actor.system;
    const items = actor.items?.contents ?? [];

    let state = { ratings: {military:0,wealth:0,social:0,magic:0}, upkeep: {military:0,wealth:0,social:0,magic:0},
                  headroom: {military:0,wealth:0,social:0,magic:0}, buildBonus: {military:0,wealth:0,social:0,magic:0}, provinces: [] };
    try { state = sys.computeState(items); } catch(e) { console.error("KM | computeState error:", e); }
    state.ratingDisplay = buildRatingDisplay(state);

    const isGM   = game.user.isGM;
    const userId = game.userId;
    const myLinkedActors = isGM ? [] : (sys.rulers ?? [])
      .map(r => game.actors?.find(a => a.name === r.name))
      .filter(a => a && (a.ownership[userId] ?? a.ownership.default ?? 0) >= 3);
    const canRoll = isGM || myLinkedActors.length > 0;
    state._canRoll = canRoll;
    state._isGM   = isGM;

    let provinces = [], units = [];
    try { provinces = buildProvinceData(items, state); } catch(e) { console.error("KM | buildProvinceData error:", e); }
    try { units     = buildUnitData(items, state, state.garrisonedUnitIds ?? new Set()); } catch(e) { console.error("KM | buildUnitData error:", e); }

    const rulers = (sys.rulers ?? []).map(r => {
      const linked    = game.actors?.find(a => a.name === r.name);
      const cls       = (r.rulerClass ?? "").toLowerCase().trim();
      const profStats = Object.entries(KingdomSheet.CLASS_STATS).filter(([, c]) => c.includes(cls)).map(([s]) => s);
      return { ...r, actorImg: linked?.img ?? "icons/svg/mystery-man.svg", profStats,
        hasMil: profStats.includes("military"), hasWea: profStats.includes("wealth"),
        hasSoc: profStats.includes("social"),   hasMag: profStats.includes("magic"),
        noneProf: profStats.length === 0, isGM };
    });

    return {
      ...ctx, actor, system: sys, state, provinces, units, rulers,
      atrocityPenalty: sys.atrocity > 0 ? 2 + Math.floor(sys.atrocity / 4) : 0,
      canRoll, isGM,
      showMoveCost: game.settings.get("kingdom-manager", "showMoveCost"),
      turnLog: [...(sys.turn?.log ?? [])].reverse(),
    };
  }

  // ── Drop ──────────────────────────────────────────────────────────────────

  async _onDrop(event) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);

    if (data?.type === "Actor") {
      if (!event.target.closest(".km-rulers") && !event.target.closest(".km-ratings")) return;
      const actor = await Actor.fromDropData(data);
      if (!actor) return;
      const rulers = foundry.utils.deepClone(this.document.system.rulers ?? []);
      rulers.push({
        id: foundry.utils.randomID(), name: actor.name,
        rulerClass: actor.items?.find(i => i.type === "class")?.name ?? actor.system?.details?.class ?? "",
        profBonus:  actor.system?.attributes?.prof ?? 2,
        personalTurnUsed: false,
      });
      return this.document.update({ "system.rulers": rulers });
    }

    if (data?.type !== "Item") return super._onDrop(event);
    const item = await Item.fromDropData(data);
    if (!item) return;
    if (item.type !== "kingdom-manager.asset") return ui.notifications.warn("Only asset items can be added to a kingdom.");

    const assetType  = item.system?.assetType;
    let   provinceId = "";

    if (assetType !== "province") {
      provinceId = event.target.closest("[data-province-id]")?.dataset.provinceId ?? "";
      if (!provinceId) {
        const provs = this.document.items.filter(i => i.type === "kingdom-manager.asset" && i.system.assetType === "province");
        if (provs.length === 1) {
          provinceId = provs[0].id;
        } else if (provs.length > 1) {
          const opts = provs.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
          provinceId = await DialogV2.prompt({
            window:  { title: "Assign to province" },
            content: `<label>Which province?<br><select name="prov" style="width:100%;margin-top:4px;">${opts}</select></label>`,
            ok:      { label: "Assign", callback: (e, btn) => btn.form.elements.prov.value }
          });
          if (!provinceId) return;
        }
      }
    }

    const itemData = item.toObject();
    foundry.utils.setProperty(itemData, "system.provinceId", provinceId);
    if (provinceId) {
      const prov = this.document.items.get(provinceId);
      if (prov) foundry.utils.setProperty(itemData, "system.location", prov.name);
    }
    // Use the item's configured buildBaseDC, falling back to defaults
    const baseDC = (itemData.system.buildBaseDC && itemData.system.buildBaseDC > 0)
      ? itemData.system.buildBaseDC
      : (assetType === "province" ? 10 : 12);
    itemData.system.buildBaseDC = baseDC;

    if (["province","asset","unit"].includes(assetType)) {
      foundry.utils.setProperty(itemData, "system.buildState.active", false);
      const sys    = itemData.system;
      const checks = [];
      for (const [stat, val] of Object.entries(sys.stats ?? {})) {
        if (val === null || val === undefined) continue;
        if (assetType === "province" && stat === "magic") continue;
        const upkeepCost = assetType === "asset" ? (sys.upkeep?.[stat] ?? 0) : 0;
        checks.push({ stat, dc: baseDC + Math.abs(val) + upkeepCost, passed: false });
      }
      if (assetType === "province") {
        const terrain = CONFIG.KingdomManager.TERRAIN_TYPES[sys.terrainType] ?? { magicPotential: 0 };
        if (terrain.magicPotential > 0) checks.push({ stat: "magic", dc: baseDC + terrain.magicPotential, passed: false });
      }
      // Always at least one check — province with no stats gets a base social check
      if (checks.length === 0) checks.push({ stat: "social", dc: baseDC, passed: false });
      foundry.utils.setProperty(itemData, "system.buildState.checks", checks);
    }

    return this.document.createEmbeddedDocuments("Item", [itemData]);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  static async _km_editImage(event, target) {
    new foundry.applications.apps.FilePicker.implementation({
      type: "image", current: this.document.img ?? "",
      callback: path => this.document.update({ img: path })
    }).render(true);
  }

  static async _km_editHeraldry(event, target) {
    new foundry.applications.apps.FilePicker.implementation({
      type: "image", current: this.document.system.heraldry ?? "",
      callback: path => this.document.update({ "system.heraldry": path })
    }).render(true);
  }

  static async _km_nextTurn(event, target) {
    const num    = this.document.system.turn.number;
    const rulers = foundry.utils.deepClone(this.document.system.rulers).map(r => ({ ...r, personalTurnUsed: false }));
    await this.document.update({ "system.turn.number": num + 1, "system.rulers": rulers });
    ui.notifications.info(`Domain turn ${num + 1} has begun.`);
  }

  static async _km_removeRuler(event, target) {
    const rulers = this.document.system.rulers.filter(r => r.id !== target.dataset.rulerId);
    await this.document.update({ "system.rulers": rulers });
  }

  static async _km_addLogEntry(event, target) {
    const text = await DialogV2.prompt({
      window:  { title: "Add Turn Log Entry" },
      content: `<label>Entry<br><input type="text" name="entry" style="width:100%;margin-top:4px;" /></label>`,
      ok:      { label: "Add", callback: (e, btn) => btn.form.elements.entry.value.trim() }
    });
    if (!text) return;
    const log = foundry.utils.deepClone(this.document.system.turn.log ?? []);
    log.push(`[T${this.document.system.turn.number}] ${text}`);
    await this.document.update({ "system.turn.log": log });
  }

  static async _km_removeLogEntry(event, target) {
    const log = foundry.utils.deepClone(this.document.system.turn.log ?? []);
    log.splice(Number(target.dataset.logIndex), 1);
    await this.document.update({ "system.turn.log": log });
  }

  static async _km_editItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (!item) return ui.notifications.warn("Item not found.");
    item.sheet.render({ force: true });
  }

  static async _km_deleteItem(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (!item) return ui.notifications.warn("Item not found.");
    const ok = await DialogV2.confirm({
      window:  { title: `Delete ${item.name}?` },
      content: `<p>Remove <strong>${item.name}</strong> from the kingdom?</p>`,
    });
    if (ok) item.delete();
  }

  static async _km_toggleBuildCheck(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (!item) return;
    const idx    = Number(target.dataset.checkIdx);
    const checks = foundry.utils.deepClone(item.system.buildState.checks);
    checks[idx].passed = !checks[idx].passed;
    if (!checks[idx].passed) checks[idx].dc = Math.max(1, checks[idx].dc - 1);
    const lbl = { military:"Mil", wealth:"Wea", social:"Soc", magic:"Mag" }[checks[idx].stat] ?? checks[idx].stat;
    const log = foundry.utils.deepClone(this.document.system.turn.log ?? []);
    log.push(`[T${this.document.system.turn.number}] ${item.name} ${lbl} — ${checks[idx].passed ? "passed" : `failed (DC→${checks[idx].dc})`}`);
    await item.update({ "system.buildState.checks": checks });
    await this.document.update({ "system.turn.log": log });
  }

  static async _km_activateAsset(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (!item) return;
    await item.update({ "system.buildState.active": true });
    const verb = item.system.assetType === "unit" ? "mustered and ready" : "completed and active";
    const log  = foundry.utils.deepClone(this.document.system.turn.log ?? []);
    log.push(`[T${this.document.system.turn.number}] ${item.name} ${verb}.`);
    await this.document.update({ "system.turn.log": log });
    ui.notifications.info(`${item.name} is now ${verb}.`);
  }

  static async _km_adjustTreasury(event, target) {
    await this.document.update({ "system.treasury": Math.max(0, (this.document.system.treasury ?? 0) + Number(target.dataset.delta)) });
  }

  static async _km_adjustAtrocity(event, target) {
    const val = Math.max(0, (this.document.system.atrocity ?? 0) + Number(target.dataset.delta));
    await this.document.update({ "system.atrocity": val });
    if (Number(target.dataset.delta) > 0)
      ui.notifications.warn(`Atrocity is now ${val}. Upkeep penalty: ${2 + Math.floor(val / 4)} to all stats.`);
  }

  static async _km_rollBuildCheck(event, target) {
    const itemId   = target.dataset.itemId;
    const checkIdx = Number(target.dataset.checkIdx);
    const item     = this.document.items.get(itemId);
    if (!item) return;

    const check = item.system.buildState?.checks?.[checkIdx];
    if (!check) return ui.notifications.error(`Check ${checkIdx} not found on ${item.name}.`);

    // Assets: max 2 build checks per turn
    if (item.system.assetType === "asset") {
      const turnNum    = this.document.system.turn.number;
      const log        = this.document.system.turn.log ?? [];
      const checkVerb2 = "Build check";
      const checksThisTurn = log.filter(e =>
        e.includes(`[T${turnNum}]`) && e.includes(checkVerb2) && e.includes(item.name)
      ).length;
      if (checksThisTurn >= 2) {
        return ui.notifications.warn(`${item.name} has already used 2 build checks this turn.`);
      }
    }

    const { stat, dc } = check;
    const state        = this.document.system.computeState(this.document.items.contents);
    const kingdomBonus = state.buildBonus[stat] ?? 0;
    const statLabel    = { military:"Military", wealth:"Wealth", social:"Social", magic:"Magic" }[stat] ?? stat;
    const checkVerb    = { province:"Claiming check", unit:"Muster check" }[item.system.assetType] ?? "Build check";

    const isGM  = game.user.isGM;
    const userId = game.userId;
    const rulers = this.document.system.rulers ?? [];
    if (!rulers.length) return ui.notifications.warn("No rulers defined.");

    const eligible = isGM ? rulers : rulers.filter(r => {
      const a = game.actors?.find(a => a.name === r.name);
      return a && (a.ownership[userId] ?? a.ownership.default ?? 0) >= 3;
    });
    if (!eligible.length) return ui.notifications.warn("You don't own any eligible rulers.");

    const rulerOpts = eligible.map(r => {
      const cls       = (r.rulerClass ?? "").toLowerCase().trim();
      const profStats = Object.entries(KingdomSheet.CLASS_STATS).filter(([, c]) => c.includes(cls)).map(([s]) => s);
      const profLbl   = profStats.includes(stat) ? ` (Prof +${r.profBonus})` : "";
      return `<option value="${rulers.indexOf(r)}">${r.name} — ${r.rulerClass || "no class"}${profLbl}</option>`;
    }).join("");

    const rulerResult = await DialogV2.prompt({
      window:  { title: `${checkVerb}: ${item.name} — ${statLabel}` },
      content: `<p style="margin-bottom:8px;">DC <strong>${dc}</strong> · Kingdom bonus +<strong>${kingdomBonus}</strong></p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  <label>Ruler<select name="rulerIdx" style="width:100%;margin-top:4px;">${rulerOpts}</select></label>
                  <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
                    <input type="checkbox" name="advantage" style="width:16px;height:16px;" />
                    <span>Help action — another ruler assists (advantage: roll 2d20 take highest)</span>
                  </label>
                </div>`,
      ok: { label: "Roll", callback: (e, btn) => ({
        rulerIdx:  Number(btn.form.elements.rulerIdx.value),
        advantage: btn.form.elements.advantage?.checked ?? false,
      })}
    });
    if (rulerResult === null || rulerResult === undefined) return;
    const rulerIdx  = rulerResult.rulerIdx;
    const advantage = rulerResult.advantage ?? false;

    const ruler     = rulers[rulerIdx];
    const cls       = (ruler.rulerClass ?? "").toLowerCase().trim();
    const profStats = Object.entries(KingdomSheet.CLASS_STATS).filter(([, c]) => c.includes(cls)).map(([s]) => s);
    const profBonus = profStats.includes(stat) ? (ruler.profBonus ?? 2) : 0;

    // Pre-roll treasury
    const treasury = this.document.system.treasury ?? 0;
    let preTreasury = 0;
    if (treasury > 0) {
      const maxPre = Math.min(5, treasury);
      preTreasury = await DialogV2.prompt({
        window:  { title: "Treasury — before roll" },
        content: `<p style="margin-bottom:8px;">Treasury: <strong>${treasury}</strong> · Spend before roll for +1/pt (max ${maxPre})</p>
                  <label>Points to spend<input type="number" name="spend" value="0" min="0" max="${maxPre}" style="width:100%;margin-top:4px;" /></label>`,
        ok: { label: "Confirm", callback: (e, btn) => Math.min(maxPre, Math.max(0, Number(btn.form.elements.spend.value))) }
      }) ?? 0;
    }

    // Roll
    const parts = [];
    if (profBonus)    parts.push(`${profBonus}[prof]`);
    if (kingdomBonus) parts.push(`${kingdomBonus}[kingdom]`);
    if (preTreasury)  parts.push(`${preTreasury}[treasury]`);
    const diceExpr = advantage ? "2d20kh" : "1d20";
    const roll = new Roll(parts.length ? `${diceExpr} + ${parts.join(" + ")}` : diceExpr);
    await roll.evaluate();
    if (preTreasury > 0) await this._updateActor({ "system.treasury": Math.max(0, treasury - preTreasury) });
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }),
      flavor: `${ruler.name} — ${checkVerb}: ${item.name} (${statLabel}) DC ${dc}` });

    let total  = roll.total;
    let passed = total >= dc;

    // Post-roll recovery
    if (!passed) {
      const shortfall   = dc - total;
      const curTreasury = this.document.system.treasury ?? 0;
      const atrocity    = this.document.system.atrocity ?? 0;
      const maxPost     = Math.min(4, curTreasury);
      const recovery = await DialogV2.prompt({
        window:  { title: `Failed by ${shortfall} — recover?` },
        content: `<div style="display:flex;flex-direction:column;gap:10px;">
          <p>Rolled <strong>${total}</strong> vs DC <strong>${dc}</strong> — failed by <strong>${shortfall}</strong>.</p>
          ${curTreasury > 0
            ? `<label>Treasury post-roll (2pts=+1, max 4pts, ${curTreasury} available)<input type="number" name="postTreasury" value="0" min="0" max="${maxPost}" style="width:100%;margin-top:3px;" /></label>`
            : `<p style="color:#888;font-size:12px;">No treasury available.</p>`}
          <label>Atrocity to spend (+1 per pt)<input type="number" name="atrocitySpend" value="0" min="0" max="${shortfall}" style="width:100%;margin-top:3px;" /></label>
        </div>`,
        ok: { label: "Apply", callback: (e, btn) => ({
          postTreasury:  Math.min(maxPost, Math.max(0, Number(btn.form.elements.postTreasury?.value ?? 0))),
          atrocitySpend: Math.max(0, Number(btn.form.elements.atrocitySpend?.value ?? 0)),
        })}
      });
      if (recovery) {
        total  += Math.floor((recovery.postTreasury ?? 0) / 2) + (recovery.atrocitySpend ?? 0);
        passed  = total >= dc;
        if (recovery.postTreasury > 0) await this._updateActor({ "system.treasury": Math.max(0, curTreasury - recovery.postTreasury) });
        if ((recovery.atrocitySpend ?? 0) > 0) {
          await this._updateActor({ "system.atrocity": atrocity + recovery.atrocitySpend });
          ui.notifications.warn(`${recovery.atrocitySpend} Atrocity added.`);
        }
      }
    }

    // Save
    const freshItem = this.document.items.get(itemId);
    if (!freshItem) return;
    const checks = foundry.utils.deepClone(freshItem.system.buildState.checks);
    if (!checks[checkIdx]) return;
    checks[checkIdx].passed = passed;
    if (!passed) checks[checkIdx].dc = Math.max(1, dc - 1);

    const lbl       = { military:"Mil", wealth:"Wea", social:"Social", magic:"Mag" }[stat] ?? stat;
    const profPart  = profBonus > 0 ? `+${profBonus} prof` : "no prof";
    const resultTxt = passed ? `passed (${roll.total} vs DC ${dc})` : `failed (${roll.total} vs DC ${dc}, DC→${checks[checkIdx].dc})`;
    const log = foundry.utils.deepClone(this.document.system.turn.log ?? []);
    log.push(`[T${this.document.system.turn.number}] ${ruler.name} — ${checkVerb}: ${item.name} ${lbl} [${profPart}] — ${resultTxt}`);

    await this._updateBoth(freshItem, { "system.buildState.checks": checks }, { "system.turn.log": log });
    if (passed) ui.notifications.info(`${ruler.name} passed the ${lbl} check!`);
    else        ui.notifications.warn(`${ruler.name} failed. DC reduced to ${checks[checkIdx].dc}.`);
  }

  static async _km_resolveObstacle(event, target) {
    const item = this.document.items.get(target.dataset.itemId);
    if (!item) return;

    const score  = item.system.obstacleScore;
    const dc     = item.system.obstacleDC;
    const stat   = item.system.obstacleStat;
    const state  = this.document.system.computeState(this.document.items.contents);
    const bonus  = state.buildBonus[stat] ?? 0;
    const turn   = this.document.system.turn.number;
    const statLbl= { military:"Military", wealth:"Wealth", social:"Social", magic:"Magic" }[stat] ?? stat;

    const isGM  = game.user.isGM;
    const userId = game.userId;
    const rulers = this.document.system.rulers ?? [];
    const eligible = isGM ? rulers : rulers.filter(r => {
      const a = game.actors?.find(a => a.name === r.name);
      return a && (a.ownership[userId] ?? a.ownership.default ?? 0) >= 3;
    });

    // Units with a matching feature stat can also resolve
    const eligibleUnits = this.document.items.filter(i =>
      i.type === "kingdom-manager.asset"
      && i.system.assetType === "unit"
      && i.system.buildState?.active
      && i.system.unitFeatureStat === stat
    );

    const rulerOpts = [
      ...eligible.map(r => `<option value="ruler-${rulers.indexOf(r)}">${r.name} (ruler)</option>`),
      ...eligibleUnits.map(u => `<option value="unit-${u.id}">${u.name} (+${u.system.unitFeatureBonus ?? 0} feature)</option>`)
    ].join("") || `<option value="none">No eligible roller</option>`;

    const resolveResult = await DialogV2.prompt({
      window:  { title: `Resolve: ${item.name}` },
      content: `<p style="margin-bottom:8px;">DC <strong>${dc}</strong> · ${statLbl} · kingdom bonus +<strong>${bonus}</strong></p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  <label>Who resolves?<select name="sel" style="width:100%;margin-top:4px;">${rulerOpts}</select></label>
                  <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
                    <input type="checkbox" name="advantage" style="width:16px;height:16px;" />
                    <span>Help action — advantage (2d20 take highest)</span>
                  </label>
                </div>`,
      ok: { label: "Roll", callback: (e, btn) => ({
        sel: btn.form.elements.sel.value,
        advantage: btn.form.elements.advantage?.checked ?? false,
      })}
    });
    if (!resolveResult || resolveResult.sel === "none") return;
    const selection     = resolveResult.sel;
    const resolveAdvantage = resolveResult.advantage ?? false;

    // Determine roller and bonus
    let rollerName, rollBonus;
    if (selection.startsWith("unit-")) {
      const unit  = this.document.items.get(selection.replace("unit-", ""));
      rollerName  = unit?.name ?? "Unit";
      rollBonus   = unit?.system.unitFeatureBonus ?? 0;
    } else {
      const idx   = Number(selection.replace("ruler-", ""));
      const ruler = rulers[idx] ?? null;
      rollerName  = ruler?.name ?? "Ruler";
      const cls   = (ruler?.rulerClass ?? "").toLowerCase().trim();
      const profs = Object.entries(KingdomSheet.CLASS_STATS).filter(([, c]) => c.includes(cls)).map(([s]) => s);
      rollBonus   = ruler ? (profs.includes(stat) ? (ruler.profBonus ?? 2) : 0) : 0;
    }

    const parts = [];
    if (rollBonus) parts.push(`${rollBonus}[bonus]`);
    if (bonus)     parts.push(`${bonus}[kingdom]`);
    const diceExpr = resolveAdvantage ? "2d20kh" : "1d20";
    const roll = new Roll(parts.length ? `${diceExpr} + ${parts.join(" + ")}` : diceExpr);
    await roll.evaluate();
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }),
      flavor: `${rollerName} — Resolve: ${item.name} DC ${dc}${resolveAdvantage ? " [advantage]" : ""}` });

    const log = foundry.utils.deepClone(this.document.system.turn.log ?? []);
    if (roll.total >= dc) {
      const redRoll = new Roll("1d4");
      await redRoll.evaluate();
      await redRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.document }),
        flavor: `Score reduction: ${item.name}` });
      const newScore = Math.max(0, score - redRoll.total);
      log.push(`[T${turn}] ${rollerName} resolved ${item.name} (${roll.total} vs DC ${dc}, -${redRoll.total}): score ${score}→${newScore}${newScore === 0 ? " RESOLVED!" : ""}`);
      await this._updateBoth(item, { "system.obstacleScore": newScore }, { "system.turn.log": log });
      if (newScore === 0) ui.notifications.info(`${item.name} has been resolved!`);
      else                ui.notifications.info(`${item.name} score reduced to ${newScore}.`);
    } else {
      log.push(`[T${turn}] ${rollerName} failed to resolve ${item.name} (${roll.total} vs DC ${dc}): score unchanged at ${score}`);
      await this._updateActor({ "system.turn.log": log });
      ui.notifications.warn(`Failed to resolve ${item.name}.`);
    }
  }
}

// ── Module-level helpers ───────────────────────────────────────────────────────

function buildRatingDisplay(state) {
  return ["military","wealth","social","magic"].map(stat => {
    const generated  = state.ratings[stat]    ?? 0;
    const upkeep     = state.upkeep[stat]     ?? 0;
    const headroom   = state.headroom[stat]   ?? 0;
    const buildBonus = state.buildBonus[stat] ?? 0;
    const barPct     = generated > 0 ? Math.min(100, Math.round((upkeep/generated)*100)) : (upkeep > 0 ? 100 : 0);
    return { stat, generated, upkeep, headroom, buildBonus, over: headroom < 0, barPct };
  });
}

function buildProvinceData(items, state) {
  // Build set of blocked asset ids from active obstacles with score > 0
  const blockedIds = new Set();
  for (const i of items) {
    if (i.type === "kingdom-manager.asset" && i.system.assetType === "obstacle"
        && (i.system.obstacleScore ?? 0) > 0 && i.system.blockedAssetId)
      blockedIds.add(i.system.blockedAssetId);
  }

  return state.provinces.map(prov => {
    const devPct   = prov.magicPotential > 0 ? Math.min(100, Math.round((prov.devLoad/prov.magicPotential)*100)) : 0;
    const devClass = devPct >= 100 ? "full" : devPct >= 60 ? "warn" : "safe";

    const labels = { military:"Mil", wealth:"Wea", social:"Soc", magic:"Mag" };
    const assets = (prov.assets ?? []).map(i => {
      const upkeepPills = ["military","wealth","social","magic"]
        .filter(s => (i.system.upkeep?.[s] ?? 0) > 0)
        .map(s => ({ label: labels[s], cost: i.system.upkeep[s] }));
      return {
        id: i.id, name: i.name, system: i.system,
        isGM: state._isGM, canRoll: state._canRoll,
        isBlocked: blockedIds.has(i.id),
        unitSlots: i.system.unitSlots ?? 0,
        journalId: i.system.journalId ?? "",
        upkeepPills,
      };
    });

    // Sum asset stats for collapsed header display
    const assetTotals = { military: 0, wealth: 0, social: 0, magic: 0 };
    for (const a of (prov.assets ?? [])) {
      if (blockedIds.has(a.id)) continue;
      for (const stat of ["military","wealth","social","magic"])
        assetTotals[stat] += a.system.stats[stat] ?? 0;
    }

    const wipAssets = items.filter(i =>
      i.type === "kingdom-manager.asset" && i.system.provinceId === prov.id
      && ["asset","unit"].includes(i.system.assetType) && !i.system.buildState?.active
    ).map(i => ({
      id: i.id, name: i.name, system: i.system,
      isMuster: i.system.assetType === "unit",
      canRoll: state._canRoll, isGM: state._isGM,
      checks: (i.system.buildState?.checks ?? []).map(c => ({ ...c, buildBonus: state.buildBonus[c.stat] ?? 0 }))
    }));

    const claimingProv = prov.item.system.buildState?.active === false ? {
      id: prov.id, name: prov.name, system: prov.item.system, isClaiming: true,
      canRoll: state._canRoll, isGM: state._isGM,
      checks: (prov.item.system.buildState?.checks ?? []).map(c => ({ ...c, buildBonus: state.buildBonus[c.stat] ?? 0 }))
    } : null;

    const obstacles = items.filter(i =>
      i.type === "kingdom-manager.asset" && i.system.provinceId === prov.id && i.system.assetType === "obstacle"
    ).map(i => {
      const blockedAsset = i.system.blockedAssetId
        ? items.find(a => a.id === i.system.blockedAssetId)
        : null;
      return {
        id: i.id, name: i.name, system: i.system,
        dc: i.system.obstacleDC, bonus: state.buildBonus[i.system.obstacleStat] ?? 0,
        stat: i.system.obstacleStat,
        upkeepDrain: blockedAsset ? null : Math.ceil((i.system.obstacleScore ?? 0) / 2),
        blockedAssetName: blockedAsset?.name ?? null,
        isGM: state._isGM, canRoll: state._canRoll,
      };
    });

    return { ...prov, devPct, devClass, assets, wipAssets, obstacles, claimingProv, isGM: state._isGM, canRoll: state._canRoll, assetTotals };
  });
}

function buildUnitData(items, state, garrisonedUnitIds = new Set()) {
  const labels = { military:"Mil", wealth:"Wea", social:"Soc", magic:"Mag" };
  const blockedIds = new Set(
    items.filter(i => i.type === "kingdom-manager.asset" && i.system.assetType === "obstacle"
      && (i.system.obstacleScore ?? 0) > 0 && i.system.blockedAssetId)
    .map(i => i.system.blockedAssetId)
  );
  return items.filter(i =>
    i.type === "kingdom-manager.asset" && i.system.assetType === "unit" && i.system.buildState?.active
  ).map(unit => {
    const stats  = unit.system.stats;
    const offset = (() => {
      const o = { military:0, wealth:0, social:0, magic:0 };
      for (const i of items) {
        if (i.type !== "kingdom-manager.asset" || i.system.provinceId !== unit.system.provinceId || !i.system.buildState?.active) continue;
        for (const s of ["military","wealth","social","magic"]) o[s] += i.system.upkeepOffset?.[s] ?? 0;
      }
      return o;
    })();
    const pills = Object.entries(stats)
      .filter(([, v]) => v !== null && v !== undefined && v !== 0)
      .map(([stat, val]) => ({ stat, label: labels[stat] ?? stat, cost: Math.abs(val), offset: offset[stat] ?? 0 }));
    return {
      id: unit.id, name: unit.name, system: unit.system, pills,
      isOver: Object.values(state.headroom).some(v => v < 0),
      provinceName: unit.system.location || items.find(i => i.id === unit.system.provinceId && i.system.assetType === "province")?.name || "—",
      isGM: state._isGM, canRoll: state._canRoll,
      isBlocked:    blockedIds.has(unit.id),
      isGarrisoned: garrisonedUnitIds.has(unit.id),
      unitType:     unit.system.unitType ?? "army",
      isAgent:      (unit.system.unitType ?? "army") !== "army",
      hasFeature: !!(unit.system.unitFeatureStat),
      featureStat: unit.system.unitFeatureStat ?? "",
      featureBonus: unit.system.unitFeatureBonus ?? 0,
    };
  });
}
