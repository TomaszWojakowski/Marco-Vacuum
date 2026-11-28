class MarcoVacuumMaintenanceCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config = null;
    this._hass = null;
    this._vacuum = null;
    this._showConfirm = null;
    this._busy = false;
    this._error = "";
    this._signature = null;
    this.shadowRoot.addEventListener("click", e => this._click(e));
  }
  setConfig(config) {
    if (!config?.vacuum_entity) throw new Error("Podaj vacuum_entity, np. vacuum.marco");
    this._config = config;
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    this._vacuum = hass.states[this._config?.vacuum_entity] || null;
    const consumables = [
      "main_brush_left","main_brush_time_left","side_brush_left","side_brush_time_left",
      "filter_left","filter_time_left","sensor_dirty_left","sensor_dirty_time_left",
      "tank_filter_left","tank_filter_time_left","mop_pad_left","mop_pad_time_left",
      "silver_ion_left","silver_ion_time_left","detergent_left","detergent_time_left",
      "squeegee_left","squeegee_time_left","onboard_dirty_water_tank_left","onboard_dirty_water_tank_time_left",
      "dirty_water_channel_dirty_left","dirty_water_channel_dirty_time_left","deodorizer_left","deodorizer_time_left",
      "wheel_dirty_left","wheel_dirty_time_left","scale_inhibitor_left","scale_inhibitor_time_left",
      "fluffing_roller_dirty_left","fluffing_roller_dirty_time_left","roller_mop_filter_dirty_left",
      "roller_mop_filter_dirty_time_left","water_outlet_filter_dirty_left","water_outlet_filter_dirty_time_left",
      "washboard_cleaning_left","washboard_cleaning_time_left"
    ];
    const resetKeys = [
      "main_brush","side_brush","filter","sensor","tank_filter","mop_pad","silver_ion",
      "detergent","squeegee","onboard_dirty_water_tank","dirty_water_channel","deodorizer",
      "wheel","scale_inhibitor","fluffing_roller","roller_mop_filter","water_outlet_filter","washboard_cleaning"
    ];
    const entityStates = [
      ...consumables.map(key => hass.states[`sensor.${this._vacuumObjectId()}_${key}`]?.state),
      ...resetKeys.map(key => Boolean(hass.states[`button.${this._vacuumObjectId()}_reset_${key}`]))
    ];
    const signature = JSON.stringify([this._vacuum?.attributes, entityStates, this._showConfirm, this._busy, this._error]);
    if (signature !== this._signature) { this._signature = signature; this._render(); }
  }
  getCardSize() { return 8; }
  static getStubConfig() { return {vacuum_entity:"vacuum.marco"}; }
  _a() { return this._vacuum?.attributes || {}; }
  _esc(v) { return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  _vacuumObjectId() { return (this._config?.vacuum_entity || "").split(".")[1] || ""; }
  _sensorState(key) {
    const entityId = `sensor.${this._vacuumObjectId()}_${key}`;
    const entity = this._hass?.states?.[entityId];
    if (entity && !["unknown", "unavailable", ""].includes(entity.state)) return entity;
    const value = this._a()[key];
    return value !== undefined && value !== null ? {state:value, attributes:{}} : null;
  }
  _resetButton(key) {
    const entityId = `button.${this._vacuumObjectId()}_reset_${key}`;
    return this._hass?.states?.[entityId] ? entityId : null;
  }
  _percent(value) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }
  _formatTime(entity) {
    if (!entity) return "";
    const value = Number(entity.state);
    if (!Number.isFinite(value) || value < 0) return "";
    const unit = entity.attributes?.unit_of_measurement || "";
    return `Pozostało: ${value} ${unit}`.trim();
  }
  _wearRow(label, key, icon, resetKey, timeKey) {
    const entity = this._sensorState(key);
    if (!entity) return "";
    const value = this._percent(entity.state);
    const timeEntity = timeKey ? this._sensorState(timeKey) : null;
    const timeText = this._formatTime(timeEntity);
    const resetEntity = resetKey ? this._resetButton(resetKey) : null;
    const tone = value === null ? "neutral" : value <= 20 ? "bad" : value <= 40 ? "warn" : "good";
    const state = value === null ? this._esc(entity.state) : value <= 20 ? "Wymiana" : value <= 40 ? "Wkrótce wymiana" : "Dobry stan";
    const bar = value === null ? "" : `<div class="track"><div class="fill ${tone}" style="width:${value}%"></div></div>`;
    return `<div class="wear-row">
      <ha-icon icon="${icon}"></ha-icon>
      <div class="wear-main">
        <div class="wear-label"><span>${label}</span><b>${value === null ? this._esc(entity.state) : value + "%"}</b></div>
        ${bar}
        ${timeText ? `<div class="time-left">${this._esc(timeText)}</div>` : ""}
      </div>
      <span class="pill ${tone}">${state}</span>
      ${resetEntity ? `<button class="reset" data-action="reset" data-entity="${resetEntity}" data-label="${this._esc(label)}" title="Zresetuj licznik ${this._esc(label)}" aria-label="Zresetuj licznik ${this._esc(label)}"><ha-icon icon="mdi:refresh"></ha-icon></button>` : '<span class="reset-placeholder"></span>'}
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
    const wear = [
      this._wearRow("Szczotka główna","main_brush_left","mdi:brush","main_brush","main_brush_time_left"),
      this._wearRow("Szczotka boczna","side_brush_left","mdi:fan","side_brush","side_brush_time_left"),
      this._wearRow("Filtr","filter_left","mdi:air-filter","filter","filter_time_left"),
      this._wearRow("Czujniki","sensor_dirty_left","mdi:radar","sensor","sensor_dirty_time_left"),
      this._wearRow("Nakładki mopujące","mop_pad_left","mdi:water","mop_pad","mop_pad_time_left"),
      this._wearRow("Wkład srebra jonowego","silver_ion_left","mdi:shimmer","silver_ion","silver_ion_time_left"),
      this._wearRow("Detergent","detergent_left","mdi:flask","detergent","detergent_time_left"),
      this._wearRow("Filtr zbiornika","tank_filter_left","mdi:filter","tank_filter","tank_filter_time_left"),
      this._wearRow("Zbiornik brudnej wody robota","onboard_dirty_water_tank_left","mdi:train-car-tank","onboard_dirty_water_tank","onboard_dirty_water_tank_time_left"),
      this._wearRow("Kanał brudnej wody","dirty_water_channel_dirty_left","mdi:cup","dirty_water_channel","dirty_water_channel_dirty_time_left"),
      this._wearRow("Dezodorant","deodorizer_left","mdi:scent","deodorizer","deodorizer_time_left"),
      this._wearRow("Środek odkamieniający","scale_inhibitor_left","mdi:flask-outline","scale_inhibitor","scale_inhibitor_time_left"),
      this._wearRow("Ściągaczka","squeegee_left","mdi:water-remove","squeegee","squeegee_time_left"),
      this._wearRow("Kółko","wheel_dirty_left","mdi:tire","wheel","wheel_dirty_time_left"),
      this._wearRow("Wałek czyszczący","fluffing_roller_dirty_left","mdi:blinds-open","fluffing_roller","fluffing_roller_dirty_time_left"),
      this._wearRow("Filtr mopa rolkowego","roller_mop_filter_dirty_left","mdi:filter-settings","roller_mop_filter","roller_mop_filter_dirty_time_left"),
      this._wearRow("Filtr wylotu wody","water_outlet_filter_dirty_left","mdi:filter-settings","water_outlet_filter","water_outlet_filter_dirty_time_left"),
      this._wearRow("Czyszczenie stacji myjącej","washboard_cleaning_left","mdi:waterfall","washboard_cleaning","washboard_cleaning_time_left")
    ].join("");
    const dock = [
      this._installed("Worek na kurz","dust_bag_status","mdi:bag-personal"),
      this._installed("Zbiornik czystej wody","clean_water_tank_status","mdi:water"),
      this._installed("Zbiornik brudnej wody","dirty_water_tank_status","mdi:water-off"),
      this._installed("Detergent","detergent_status","mdi:flask"),
      this._installed("Nakładka mopująca","mop_pad","mdi:water")
    ].join("");
    const pending = this._showConfirm;
    this.shadowRoot.innerHTML = `
      <style>
        :host{display:block;color:var(--primary-text-color)}ha-card{padding:16px}
        .header{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px}
        h2{font-size:1.2rem;font-weight:600;margin:0}h3{font-size:1rem;font-weight:600;margin:18px 0 10px}
        .muted{color:var(--secondary-text-color);font-size:.85rem}
        .section{border-top:1px solid var(--divider-color);padding-top:12px;margin-top:14px}
        .wear-row{display:grid;grid-template-columns:26px minmax(0,1fr) auto 34px;align-items:center;gap:10px;margin:14px 0}
        ha-icon{color:var(--secondary-text-color);--mdc-icon-size:21px}
        .wear-main{min-width:0}.wear-label{display:flex;justify-content:space-between;gap:8px;font-size:.9rem;margin-bottom:7px}
        .wear-label b{font-variant-numeric:tabular-nums}
        .track{height:7px;border-radius:8px;background:var(--divider-color);overflow:hidden}
        .fill{height:100%;border-radius:8px}.fill.good{background:var(--success-color)}.fill.warn{background:var(--warning-color)}.fill.bad{background:var(--error-color)}
        .time-left{font-size:.75rem;color:var(--secondary-text-color);margin-top:5px}
        .pill{font-size:.75rem;border-radius:20px;padding:5px 8px;white-space:nowrap}
        .pill.good{background:color-mix(in srgb,var(--success-color) 16%,transparent);color:var(--success-color)}
        .pill.warn{background:color-mix(in srgb,var(--warning-color) 16%,transparent);color:var(--warning-color)}
        .pill.bad{background:color-mix(in srgb,var(--error-color) 16%,transparent);color:var(--error-color)}
        .pill.neutral{background:var(--secondary-background-color);color:var(--secondary-text-color)}
        .reset{width:32px;height:32px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer}
        .reset ha-icon{--mdc-icon-size:18px;color:inherit}.reset-placeholder{width:32px}
        .dock-row{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:9px;align-items:center;margin:11px 0;font-size:.9rem}
        .empty{padding:10px 0;color:var(--secondary-text-color);font-size:.88rem}
        button{font:inherit}button:disabled{opacity:.5}
        .overlay{position:fixed;inset:0;background:#0008;z-index:10;display:grid;place-items:center;padding:20px}
        .dialog{width:min(100%,360px);background:var(--card-background-color);color:var(--primary-text-color);border-radius:14px;padding:20px;box-shadow:var(--ha-dialog-box-shadow,0 8px 28px #0005)}
        .dialog h3{margin:0 0 10px}.dialog p{font-size:.9rem;line-height:1.45;color:var(--secondary-text-color)}
        .dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}
        .dialog-actions button{border:0;border-radius:9px;padding:9px 13px;background:var(--secondary-background-color);color:var(--primary-text-color);cursor:pointer}
        .dialog-actions .primary{background:var(--primary-color);color:var(--text-primary-color,white)}
        .error{font-size:.82rem;color:var(--error-color);margin-top:8px}
        @media(max-width:430px){.wear-row{grid-template-columns:24px minmax(0,1fr) 30px}.wear-row .pill{grid-column:2;justify-self:start}.wear-row .reset{grid-column:3;grid-row:1 / span 2}.reset-placeholder{grid-column:3;grid-row:1 / span 2}}
      </style>
      <ha-card>
        <div class="header"><h2>Marco – Konserwacja</h2><span class="muted">${this._esc(this._config.vacuum_entity)}</span></div>
        <h3>Stan akcesoriów robota</h3>
        ${wear || '<div class="empty">Robot nie udostępnia liczników zużycia akcesoriów.</div>'}
        <div class="section"><h3>Stacja dokująca</h3>
          ${dock || '<div class="empty">Brak dostępnych informacji o wyposażeniu stacji.</div>'}
        </div>
        ${pending ? `
          <div class="overlay">
            <div class="dialog" role="dialog" aria-modal="true">
              <h3>Reset licznika</h3>
              <p>Czy na pewno wykonałeś konserwację elementu: <b>${this._esc(pending.label)}</b>? Spowoduje to zresetowanie licznika w robocie Dreame.</p>
              ${this._error ? `<div class="error">${this._esc(this._error)}</div>` : ""}
              <div class="dialog-actions">
                <button data-action="cancel" ${this._busy?"disabled":""}>Anuluj</button>
                <button class="primary" data-action="confirm" ${this._busy?"disabled":""}>${this._busy?"Wysyłanie…":"Resetuj licznik"}</button>
              </div>
            </div>
          </div>` : ""}
      </ha-card>`;
  }
  _click(event) {
    const button = event.target.closest("button[data-action]");
    if (!button || this._busy) return;
    const action = button.dataset.action;
    if (action === "reset") {
      this._showConfirm = {entity_id:button.dataset.entity,label:button.dataset.label};
      this._error = "";
    } else if (action === "cancel") {
      this._showConfirm = null;
      this._error = "";
    } else if (action === "confirm") {
      this._resetConsumable();
      return;
    }
    this._signature = null;
    this._render();
  }
  async _resetConsumable() {
    if (!this._showConfirm || !this._hass || this._busy) return;
    this._busy = true;
    this._error = "";
    this._signature = null;
    this._render();
    try {
      await this._hass.callService("button","press",{entity_id:this._showConfirm.entity_id});
      this._showConfirm = null;
    } catch (error) {
      console.error("Marco Maintenance: nie udało się zresetować licznika",error);
      this._error = "Nie udało się wysłać resetu do robota. Sprawdź logi Home Assistant.";
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
    window.customCards.push({type:"marco-vacuum-maintenance-card",name:"Marco Vacuum – konserwacja",description:"Liczniki zużycia akcesoriów i przypomnienia konserwacyjne Dreame."});
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
  },10);
  window.setTimeout(() => {
    window.clearInterval(maintenanceCheck);
    if (!window.customElements.get("marco-vacuum-maintenance-card")) registerMarcoVacuumMaintenanceCard();
  },15000);
}