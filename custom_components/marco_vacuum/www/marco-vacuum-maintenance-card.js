class MarcoVacuumMaintenanceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config = null;
    this._hass = null;
    this._vacuum = null;
    this._sensor = null;
    this._showForm = false;
    this._busy = false;
    this._signature = null;
    this.shadowRoot.addEventListener("click", e => this._click(e));
    this.shadowRoot.addEventListener("change", e => this._change(e));
    this.shadowRoot.addEventListener("submit", e => this._submit(e));
  }
  setConfig(config) {
    if (!config?.vacuum_entity) throw new Error("Podaj vacuum_entity, np. vacuum.marco");
    this._config = config;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    this._vacuum = hass.states[this._config?.vacuum_entity] || null;
    this._sensor = Object.values(hass.states).find(entity =>
      entity.attributes?.vacuum_entity === this._config?.vacuum_entity &&
      Array.isArray(entity.attributes?.maintenance_history)
    ) || null;
    const signature = JSON.stringify([this._vacuum?.attributes, this._sensor?.attributes?.maintenance_history, this._showForm, this._busy]);
    if (signature !== this._signature) { this._signature = signature; this._render(); }
  }
  getCardSize() { return 8; }
  static getStubConfig() { return {vacuum_entity:"vacuum.marco"}; }
  _a() { return this._vacuum?.attributes || {}; }
  _esc(v) { return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  _percent(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }
  _wearRow(label, key, icon) {
    const value = this._percent(this._a()[key]);
    if (value === null) return "";
    const tone = value <= 20 ? "bad" : value <= 40 ? "warn" : "good";
    const state = value <= 20 ? "Wymiana" : value <= 40 ? "Wkrótce wymiana" : "Dobry stan";
    return `<div class="wear-row">
      <ha-icon icon="${icon}"></ha-icon>
      <div class="wear-main"><div class="wear-label">${label}<b>${value}%</b></div>
      <div class="track"><div class="fill ${tone}" style="width:${value}%"></div></div></div>
      <span class="pill ${tone}">${state}</span>
    </div>`;
  }
  _installed(label, key, icon) {
    const value = this._a()[key];
    if (value === undefined || value === null || value === "") return "";
    const installed = value === true || String(value).toLowerCase() === "installed";
    return `<div class="dock-row"><ha-icon icon="${icon}"></ha-icon><span>${label}</span><span class="pill ${installed?"good":"warn"}">${installed?"Zainstalowany":"Brak"}</span></div>`;
  }
  _history() {
    const records = this._sensor?.attributes?.maintenance_history || [];
    if (!records.length) return '<div class="empty">Brak zapisanych czynności. Możesz dodać pierwszą wymianę lub konserwację.</div>';
    return records.slice(0,5).map(item => {
      const date = item.date ? new Date(item.date).toLocaleString("pl-PL",{dateStyle:"short",timeStyle:"short"}) : "—";
      return `<div class="history-row"><div class="history-date">${this._esc(date)}</div><div class="history-text"><b>${this._esc(item.action)}</b><span>${this._esc(item.item)}${item.note?" · "+this._esc(item.note):""}</span></div></div>`;
    }).join("");
  }
  _render() {
    if (!this.shadowRoot || !this._config) return;
    const a = this._a();
    const wear = [
      this._wearRow("Szczotka główna","main_brush_left","mdi:brush"),
      this._wearRow("Szczotka boczna","side_brush_left","mdi:fan"),
      this._wearRow("Filtr","filter_left","mdi:air-filter"),
      this._wearRow("Środek odkamieniający","scale_inhibitor_left","mdi:flask-outline")
    ].join("");
    const dock = [
      this._installed("Worek na kurz","dust_bag_status","mdi:bag-personal"),
      this._installed("Zbiornik czystej wody","clean_water_tank_status","mdi:water"),
      this._installed("Zbiornik brudnej wody","dirty_water_tank_status","mdi:water-off"),
      this._installed("Detergent","detergent_status","mdi:flask"),
      this._installed("Nakładka mopująca","mop_pad","mdi:water")
    ].join("");
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;color:var(--primary-text-color)}ha-card{padding:16px}
        .header{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px}
        h2{font-size:1.2rem;font-weight:600;margin:0}h3{font-size:1rem;font-weight:600;margin:18px 0 10px}
        .muted{color:var(--secondary-text-color);font-size:.85rem}
        .section{border-top:1px solid var(--divider-color);padding-top:12px;margin-top:14px}
        .wear-row{display:grid;grid-template-columns:26px minmax(0,1fr) auto;align-items:center;gap:10px;margin:13px 0}
        ha-icon{color:var(--secondary-text-color);--mdc-icon-size:21px}
        .wear-main{min-width:0}.wear-label{display:flex;justify-content:space-between;gap:8px;font-size:.9rem;margin-bottom:7px}
        .wear-label b{font-variant-numeric:tabular-nums}
        .track{height:7px;border-radius:8px;background:var(--divider-color);overflow:hidden}
        .fill{height:100%;border-radius:8px}.fill.good{background:var(--success-color)}.fill.warn{background:var(--warning-color)}.fill.bad{background:var(--error-color)}
        .pill{font-size:.75rem;border-radius:20px;padding:5px 8px;white-space:nowrap}
        .pill.good{background:color-mix(in srgb,var(--success-color) 16%,transparent);color:var(--success-color)}
        .pill.warn{background:color-mix(in srgb,var(--warning-color) 16%,transparent);color:var(--warning-color)}
        .pill.bad{background:color-mix(in srgb,var(--error-color) 16%,transparent);color:var(--error-color)}
        .dock-row{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:9px;align-items:center;margin:11px 0;font-size:.9rem}
        .history{background:var(--secondary-background-color);border-radius:12px;padding:12px}
        .history-row{display:grid;grid-template-columns:105px minmax(0,1fr);gap:10px;padding:8px 0;border-bottom:1px solid var(--divider-color)}
        .history-row:last-child{border-bottom:0}.history-date{font-size:.78rem;color:var(--secondary-text-color);font-variant-numeric:tabular-nums}
        .history-text{display:flex;flex-direction:column;gap:2px;font-size:.88rem}.history-text span{font-size:.8rem;color:var(--secondary-text-color)}
        .empty{padding:10px 0;color:var(--secondary-text-color);font-size:.88rem}
        .toolbar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
        button{border:0;border-radius:9px;padding:9px 12px;font:inherit;font-size:.86rem;cursor:pointer;background:var(--secondary-background-color);color:var(--primary-text-color)}
        button.primary{background:var(--primary-color);color:var(--text-primary-color,white)}button:disabled{opacity:.5}
        form{display:grid;gap:9px;margin-top:12px;padding-top:12px;border-top:1px solid var(--divider-color)}
        label{display:grid;gap:5px;font-size:.82rem;color:var(--secondary-text-color)}
        input,select{box-sizing:border-box;width:100%;min-height:40px;padding:8px 10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
        .form-actions{display:flex;gap:8px}
        @media(max-width:430px){.wear-row{grid-template-columns:24px minmax(0,1fr)}.wear-row .pill{grid-column:2;justify-self:start}.history-row{grid-template-columns:88px minmax(0,1fr)}}
      </style>
      <ha-card>
        <div class="header"><h2>Marco – Konserwacja</h2><span class="muted">${this._esc(this._config.vacuum_entity)}</span></div>
        <h3>Stan akcesoriów robota</h3>
        ${wear || '<div class="empty">Robot nie udostępnia danych o zużyciu akcesoriów.</div>'}
        <div class="section"><h3>Stacja dokująca</h3>
          ${dock || '<div class="empty">Brak dostępnych informacji o wyposażeniu stacji.</div>'}
        </div>
        <div class="section">
          <div class="toolbar"><h3 style="margin:0">Historia konserwacji</h3><button data-action="add">${this._showForm?"Zamknij":"＋ Dodaj wpis"}</button></div>
          <div class="history">${this._history()}</div>
          ${this._showForm ? `
            <form id="maintenance-form">
              <label>Element<select name="item" required>
                <option value="Szczotka główna">Szczotka główna</option><option value="Szczotka boczna">Szczotka boczna</option>
                <option value="Filtr">Filtr</option><option value="Kółka">Kółka</option><option value="Czujniki">Czujniki</option>
                <option value="Worek na kurz">Worek na kurz</option><option value="Detergent">Detergent</option>
                <option value="Zbiorniki wody">Zbiorniki wody</option><option value="Nakładka mopująca">Nakładka mopująca</option><option value="Inne">Inne</option>
              </select></label>
              <label>Czynność<select name="action" required><option value="Wymiana">Wymiana</option><option value="Czyszczenie">Czyszczenie</option><option value="Uzupełnienie">Uzupełnienie</option><option value="Kontrola">Kontrola</option><option value="Konserwacja">Konserwacja</option></select></label>
              <label>Notatka (opcjonalnie)<input name="note" maxlength="500" placeholder="np. wymiana po 6 miesiącach"></label>
              <div class="form-actions"><button class="primary" type="submit" ${this._busy?"disabled":""}>Zapisz wpis</button><button type="button" data-action="cancel">Anuluj</button></div>
            </form>` : ""}
        </div>
      </ha-card>`;
  }
  _click(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "add") this._showForm = !this._showForm;
    if (button.dataset.action === "cancel") this._showForm = false;
    this._signature = null;
    this._render();
  }
  _change() {}
  async _submit(event) {
    if (event.target.id !== "maintenance-form") return;
    event.preventDefault();
    if (this._busy || !this._hass) return;
    const data = new FormData(event.target);
    this._busy = true;
    this._render();
    try {
      await this._hass.callService("marco_vacuum","log_maintenance",{
        vacuum_entity:this._config.vacuum_entity,
        item:String(data.get("item")),
        action:String(data.get("action")),
        note:String(data.get("note") || "")
      });
      this._showForm = false;
    } catch (error) {
      console.error("Marco Maintenance: nie udało się zapisać wpisu",error);
    } finally {
      this._busy = false;
      this._signature = null;
      this._render();
    }
  }
}

function registerMarcoVacuumMaintenanceCard() {
  if (!window.customElements.get("marco-vacuum-maintenance-card")) {
    window.customElements.define("marco-vacuum-maintenance-card", MarcoVacuumMaintenanceCard);
  }
  window.customCards = window.customCards || [];
  if (!window.customCards.some(card => card.type === "marco-vacuum-maintenance-card")) {
    window.customCards.push({type: "marco-vacuum-maintenance-card", name: "Marco Vacuum – konserwacja", description: "Zużycie akcesoriów, wyposażenie stacji i historia konserwacji."});
  }
}
const maintenanceRegistry = window.customElements;
if (maintenanceRegistry.get("home-assistant")) {
  registerMarcoVacuumMaintenanceCard();
} else {
  const maintenanceCheck = window.setInterval(() => {
    if (window.customElements !== maintenanceRegistry || window.customElements.get("home-assistant")) {
      window.clearInterval(maintenanceCheck);
      registerMarcoVacuumMaintenanceCard();
    }
  }, 10);
  window.setTimeout(() => {
    window.clearInterval(maintenanceCheck);
    if (!window.customElements.get("marco-vacuum-maintenance-card")) registerMarcoVacuumMaintenanceCard();
  }, 15000);
}