class MarcoVacuumMaintenanceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config = null;
    this._hass = null;
    this._vacuum = null;
    this._signature = null;
  }
  setConfig(config) {
    if (!config?.vacuum_entity) throw new Error("Podaj vacuum_entity, np. vacuum.marco");
    this._config = config;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    this._vacuum = hass.states[this._config?.vacuum_entity] || null;
    const signature = JSON.stringify(this._vacuum?.attributes);
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
        .empty{padding:10px 0;color:var(--secondary-text-color);font-size:.88rem}
        @media(max-width:430px){.wear-row{grid-template-columns:24px minmax(0,1fr)}.wear-row .pill{grid-column:2;justify-self:start}}
      </style>
      <ha-card>
        <div class="header"><h2>Marco – Konserwacja</h2><span class="muted">${this._esc(this._config.vacuum_entity)}</span></div>
        <h3>Stan akcesoriów robota</h3>
        ${wear || '<div class="empty">Robot nie udostępnia danych o zużyciu akcesoriów.</div>'}
        <div class="section"><h3>Stacja dokująca</h3>
          ${dock || '<div class="empty">Brak dostępnych informacji o wyposażeniu stacji.</div>'}
        </div>

      </ha-card>`;
  }

}

function registerMarcoVacuumMaintenanceCard() {
  if (!window.customElements.get("marco-vacuum-maintenance-card")) {
    window.customElements.define("marco-vacuum-maintenance-card", MarcoVacuumMaintenanceCard);
  }
  window.customCards = window.customCards || [];
  if (!window.customCards.some(card => card.type === "marco-vacuum-maintenance-card")) {
    window.customCards.push({type: "marco-vacuum-maintenance-card", name: "Marco Vacuum – konserwacja", description: "Zużycie akcesoriów i wyposażenie stacji."});
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