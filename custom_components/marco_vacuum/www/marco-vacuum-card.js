class MarcoVacuumCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config = null; this._hass = null; this._sensor = null;
    this._signature = null; this._editing = null; this._mapId = "";
    this._rooms = new Set(); this._name = ""; this._status = ""; this._busy = false; this._saving = false;
    this.shadowRoot.addEventListener("click", e => this._click(e));
    this.shadowRoot.addEventListener("change", e => this._change(e));
    this.shadowRoot.addEventListener("input", e => { if(e.target.id==="name") this._name=e.target.value; });
    this.shadowRoot.addEventListener("submit", e => this._submit(e));
  }
  setConfig(config) {
    if (!config?.vacuum_entity) throw new Error("Podaj vacuum_entity, np. vacuum.marco");
    this._config=config; this._render();
  }
  set hass(hass) {
    this._hass=hass;
    const found=Object.entries(hass.states).find(([,s]) =>
      s.attributes?.vacuum_entity===this._config?.vacuum_entity &&
      Array.isArray(s.attributes?.maps) && Array.isArray(s.attributes?.groups));
    // Keep the last known-good data if HA briefly omits this entity during
    // a state refresh. A save must never make the existing group list flash empty.
    if(!found)return;
    const nextSensor=found[1];
    const nextGroups=nextSensor.attributes.groups;
    if(this._saving && this._groups().length>0 && nextGroups.length===0)return;
    this._sensor=nextSensor;
    const sig=JSON.stringify([this._sensor.state,this._sensor.attributes.maps,this._sensor.attributes.groups]);
    if(sig!==this._signature){this._signature=sig;this._render();}
  }
  getCardSize(){return 5;}
  static getStubConfig(){return {vacuum_entity:"vacuum.marco"};}
  _esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  _maps(){return this._sensor?.attributes.maps||[];}
  _groups(){return this._sensor?.attributes.groups||[];}
  async _refreshSensor(){
    // Fetch the updated entity state after save_group completes. This avoids
    // waiting for the parent dashboard to push a new hass object to the card.
    const states=await this._hass.callWS({type:"get_states"});
    const sensor=states.find(s=>
      s.attributes?.vacuum_entity===this._config?.vacuum_entity &&
      Array.isArray(s.attributes?.maps) && Array.isArray(s.attributes?.groups));
    if(!sensor)throw new Error("Nie znaleziono encji z danymi grup Marco Vacuum.");
    // save_group cannot legitimately remove all groups. If HA still exposes
    // a transient empty snapshot, retain the last known-good list.
    if(this._saving && this._groups().length>0 && sensor.attributes.groups.length===0)return;
    this._sensor=sensor;
    this._signature=JSON.stringify([sensor.state,sensor.attributes.maps,sensor.attributes.groups]);
  }
  _map(){return this._maps().find(m=>String(m.map_id)===String(this._mapId));}
  _reset(){this._editing=null;this._rooms.clear();this._name="";}
  _render(){
    if(!this.shadowRoot||!this._config)return;
    const maps=this._maps(), groups=this._groups();
    if(!this._mapId&&maps.length)this._mapId=String(maps[0].map_id);
    if(this._mapId&&!maps.some(m=>String(m.map_id)===this._mapId)){this._mapId=maps.length?String(maps[0].map_id):"";this._reset();}
    const rooms=this._map()?.rooms||[], selected=new Set([...this._rooms].map(String));
    this.shadowRoot.innerHTML=`
      <style>
        :host{display:block;color:var(--primary-text-color)}ha-card{padding:16px}
        h2{font-size:1.2rem;font-weight:500;margin:0 0 12px}h3{font-size:1rem;font-weight:500;margin:18px 0 8px}
        .muted,.meta{color:var(--secondary-text-color)}.field{display:block;margin:12px 0}
        .field span{display:block;font-size:.85rem;color:var(--secondary-text-color);margin-bottom:5px}
        input[type=text],select{box-sizing:border-box;width:100%;min-height:42px;padding:8px 10px;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;font:inherit}
        .rooms{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:7px}
        .room{display:flex;align-items:center;gap:8px;padding:9px;border:1px solid var(--divider-color);border-radius:8px;min-height:28px}
        .room input{accent-color:var(--primary-color)}button{border:0;border-radius:8px;padding:9px 13px;font:inherit;cursor:pointer}
        button.primary{background:var(--primary-color);color:var(--text-primary-color,white)}
        button.secondary{background:var(--secondary-background-color);color:var(--primary-text-color)}
        button.danger{color:var(--error-color);background:transparent}button:disabled{opacity:.5;cursor:default}
        .actions,.group-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
        .group{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--divider-color)}
        .group-name{font-weight:500}.meta{font-size:.85rem;margin-top:3px}.group-actions{margin:0;flex-shrink:0}
        .status{min-height:1.3em;margin-top:10px;color:var(--secondary-text-color);font-size:.9rem}
        .empty{padding:12px;border-radius:8px;background:var(--secondary-background-color)}
      </style>
      <ha-card><h2>Grupy pomieszczeń</h2>
      ${!this._sensor ? `<div class="empty">Nie znaleziono danych integracji dla <b>${this._esc(this._config.vacuum_entity)}</b>. Sprawdź konfigurację integracji Marco Vacuum i dostępność map.</div>` : `
        <div class="muted">Odkurzacz: ${this._esc(this._config.vacuum_entity)}</div>
        <form id="form">
          <label class="field"><span>Mapa</span><select id="map" ${maps.length?"":"disabled"}>
            ${maps.map(m=>`<option value="${this._esc(m.map_id)}" ${String(m.map_id)===this._mapId?"selected":""}>${this._esc(m.name)}</option>`).join("")}
          </select></label>
          <label class="field"><span>Nazwa grupy</span><input id="name" type="text" maxlength="80" required placeholder="np. Parter" value="${this._esc(this._name)}"></label>
          <h3>Pomieszczenia</h3>
          ${rooms.length?`<div class="rooms">${rooms.map(r=>`<label class="room"><input type="checkbox" data-room="${this._esc(r.id)}" ${selected.has(String(r.id))?"checked":""}><span>${this._esc(r.name)}</span></label>`).join("")}</div>`:`<div class="muted">Brak pomieszczeń dla wybranej mapy.</div>`}
          <div class="actions"><button class="primary" type="submit" ${this._busy||!rooms.length?"disabled":""}>${this._editing?"Zapisz zmiany":"Dodaj grupę"}</button>
          ${this._editing?`<button class="secondary" type="button" data-action="cancel">Anuluj</button>`:""}</div>
        </form>
        <h3>Zapisane grupy (${groups.length})</h3>
        ${groups.length?groups.map(g=>`<div class="group"><div><div class="group-name">${this._esc(g.name)}</div><div class="meta">${this._esc(g.map_name||"Mapa")} · ${(g.segments||[]).map(r=>this._esc(r.name)).join(", ")}</div></div><div class="group-actions"><button class="secondary" data-action="edit" data-id="${this._esc(g.id)}">Edytuj</button><button class="danger" data-action="delete" data-id="${this._esc(g.id)}">Usuń</button></div></div>`).join(""):`<div class="muted">Nie zapisano jeszcze żadnej grupy.</div>`}
        <div class="status" role="status">${this._esc(this._status)}</div>
      `}</ha-card>`;
  }
  _change(e){
    if(e.target.id==="map"){this._mapId=e.target.value;this._rooms.clear();this._render();}
    if(e.target.matches("input[data-room]")){const id=String(e.target.dataset.room);if(e.target.checked)this._rooms.add(id);else this._rooms.delete(id);}
  }
  _click(e){
    const b=e.target.closest("button[data-action]");if(!b||!this._sensor)return;
    if(b.dataset.action==="cancel"){this._reset();this._render();return;}
    const g=this._groups().find(x=>String(x.id)===b.dataset.id);if(!g)return;
    if(b.dataset.action==="edit"){this._editing=g.id;this._mapId=String(g.map_id);this._rooms=new Set((g.segments||[]).map(r=>String(r.id)));this._name=g.name||"";this._status="";this._render();}
    if(b.dataset.action==="delete"&&window.confirm("Usunąć grupę „"+g.name+"”?"))this._delete(g.id);
  }
  async _submit(e){
    if(e.target.id!=="form")return;e.preventDefault();
    const name=this.shadowRoot.querySelector("#name")?.value.trim()||"",map=this._map(),segments=[...this._rooms].map(Number);
    if(!name||!map||!segments.length){this._status=!name?"Wpisz nazwę grupy.":"Wybierz co najmniej jedno pomieszczenie.";this._render();return;}
    this._busy=true;this._saving=true;this._status="Zapisywanie…";this._render();
    try{
      await this._hass.callService("marco_vacuum","save_group",{vacuum_entity:this._config.vacuum_entity,name,map_id:Number(map.map_id),segments,...(this._editing?{group_id:this._editing}:{})});
      this._reset();
      try{
        await this._refreshSensor();
        this._status="Grupa została zapisana.";
      }catch(err){
        this._status="Grupa została zapisana, ale lista nie odświeżyła się: "+(err.message||err);
      }
    }
    catch(err){this._status="Nie udało się zapisać grupy: "+(err.message||err);}
    finally{this._saving=false;this._busy=false;this._render();}
  }
  async _delete(id){
    this._busy=true;this._status="Usuwanie…";this._render();
    try{await this._hass.callService("marco_vacuum","delete_group",{vacuum_entity:this._config.vacuum_entity,group_id:id});if(String(this._editing)===String(id))this._reset();this._status="Grupa została usunięta.";}
    catch(err){this._status="Nie udało się usunąć grupy: "+(err.message||err);}
    finally{this._busy=false;this._render();}
  }
}

class MarcoVacuumStatusCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config = null; this._hass = null; this._vacuum = null; this._sensor = null;
    this._busy = false; this._signature = null;
    this.shadowRoot.addEventListener("click", (event) => this._handleAction(event));
  }
  setConfig(config) {
    if (!config?.vacuum_entity) throw new Error("Podaj vacuum_entity, np. vacuum.marco");
    this._config = config; this._update();
  }
  set hass(hass) {
    this._hass = hass;
    this._vacuum = hass.states[this._config?.vacuum_entity] || null;
    this._sensor = Object.values(hass.states).find((entity) =>
      entity.attributes?.vacuum_entity === this._config?.vacuum_entity &&
      Array.isArray(entity.attributes?.groups) && Array.isArray(entity.attributes?.maps)
    ) || null;
    const signature = JSON.stringify([this._vacuum?.state,this._vacuum?.attributes,this._sensor?.attributes?.groups,this._busy]);
    if (signature !== this._signature) { this._signature = signature; this._update(); }
  }
  getCardSize() { return 4; }
  static getStubConfig() { return {vacuum_entity:"vacuum.marco"}; }
  _esc(v) { return String(v ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  _a() { return this._vacuum?.attributes || {}; }
  _ids(value) {
    const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[;,\s]+/) : [];
    return values.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
  }
  _status() {
    const a=this._a(), state=String(this._vacuum?.state||"").toLowerCase();
    if (!this._vacuum || ["unavailable","unknown"].includes(state)) return ["Niedostępny","muted","mdi:cloud-alert"];
    if (a.has_error || (a.error && !["no error","none","0"].includes(String(a.error).toLowerCase())) || state==="error") return ["Błąd","error","mdi:alert-circle"];
    if (a.paused || a.cleaning_paused || a.returning_paused || state==="paused") return ["Wstrzymany","warning","mdi:pause-circle"];
    if (a.returning || a.returning_to_empty || a.returning_to_wash || state==="returning") return ["Wraca do stacji","info","mdi:home-import-outline"];
    if (a.washing || a.drying) return ["Obsługa w stacji","info","mdi:robot-vacuum"];
    if (a.running || a.started || a.segment_cleaning || a.zone_cleaning || a.spot_cleaning || ["cleaning","room_cleaning"].includes(state)) return ["Sprząta","success","mdi:robot-vacuum"];
    if (a.docked || a.charging || ["docked","charging"].includes(state)) return [a.charging || state==="charging" ? "Ładuje się" : "W stacji","muted","mdi:battery-charging"];
    return ["Gotowy do pracy","muted","mdi:robot-vacuum"];
  }
  _mapId() { const a=this._a(); return a.selected_map_id ?? a.map_id ?? null; }
  _mapName() {
    const id=this._mapId(), maps=this._sensor?.attributes?.maps||[];
    return maps.find(m=>String(m.map_id)===String(id))?.name || this._a().selected_map || "Nieznana mapa";
  }
  _group() {
    const mapId=this._mapId(), active=this._ids(this._a().active_segments);
    if (mapId==null || !active.length) return null;
    const matches=(this._sensor?.attributes?.groups||[]).filter(g=>{
      const ids=this._ids((g.segments||[]).map(s=>s.id));
      return String(g.map_id)===String(mapId) && ids.length===active.length && ids.every((id,i)=>id===active[i]);
    });
    return matches.length===1 ? matches[0] : null;
  }
  _room() {
    const id=Number(this._a().current_segment);
    if (!Number.isFinite(id)) return null;
    const rooms=this._a().rooms||{};
    const room=(rooms[this._mapName()]||[]).find(r=>Number(r.id)===id);
    if (room?.name) return room.name;
    const map=(this._sensor?.attributes?.maps||[]).find(m=>String(m.map_id)===String(this._mapId()));
    return map?.rooms?.find(r=>Number(r.id)===id)?.name || null;
  }
  _mode() {
    const mode=String(this._a().cleaning_mode||"").toLowerCase();
    return ({"sweeping":"Odkurzanie","mopping":"Mopowanie","sweeping and mopping":"Odkurzanie i mopowanie","mopping after sweeping":"Odkurzanie i mopowanie"})[mode] || this._a().cleaning_mode || "—";
  }
  _update() {
    if (!this.shadowRoot || !this._config) return;
    if (!this._vacuum) { this.shadowRoot.innerHTML=\`<ha-card><div class="empty">Nie znaleziono encji <b>\${this._esc(this._config.vacuum_entity)}</b>.</div></ha-card>\`; return; }
    const a=this._a(), [status,tone,icon]=this._status(), group=this._group(), room=this._room();
    const battery=a.battery ?? a.battery_charge_level, progress=Number(a.cleaning_progress), area=Number(a.cleaned_area), minutes=Number(a.cleaning_time);
    const paused=Boolean(a.paused || a.cleaning_paused || a.returning_paused || this._vacuum.state==="paused");
    const running=Boolean(a.running || a.started || a.segment_cleaning || a.zone_cleaning || a.spot_cleaning);
    const canReturn=!(a.docked || a.charging || a.returning || a.returning_to_empty || a.returning_to_wash);
    this.shadowRoot.innerHTML=\`
      <style>
        :host{display:block;color:var(--primary-text-color)}ha-card{padding:16px}
        .header,.main,.row,.actions{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .header{margin-bottom:12px}.brand{display:flex;align-items:center;gap:8px;font-size:1.05rem;font-weight:600}
        ha-icon{--mdc-icon-size:22px;color:var(--secondary-text-color)}
        .status{display:flex;align-items:center;gap:5px;padding:5px 9px;border-radius:20px;background:var(--secondary-background-color);font-size:.82rem}
        .success{color:var(--success-color)}.warning{color:var(--warning-color)}.error{color:var(--error-color)}.info{color:var(--info-color)}
        .main{margin:5px 0 14px}.place{min-width:0}.place h2{font-size:1.4rem;margin:0 0 4px;font-weight:600}
        .sub,.muted{color:var(--secondary-text-color)}.sub{font-size:.85rem;line-height:1.4}
        .robot{width:58px;height:58px;flex:0 0 58px;border-radius:15px;background:var(--secondary-background-color);display:grid;place-items:center}
        .robot ha-icon{--mdc-icon-size:34px;color:var(--primary-color)}
        .divider{height:1px;background:var(--divider-color);margin:12px 0}
        .progress-head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
        .progress-value{font-size:1.4rem;font-weight:650;font-variant-numeric:tabular-nums}
        .track{height:7px;border-radius:8px;overflow:hidden;background:var(--divider-color)}.fill{height:100%;background:var(--success-color)}
        .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:13px}
        .stat{background:var(--secondary-background-color);border-radius:10px;padding:9px;min-width:0}
        .stat ha-icon{display:block;margin-bottom:5px}.value{font-size:1.05rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
        .label{font-size:.75rem;color:var(--secondary-text-color);margin-top:2px}
        .row{font-size:.88rem;margin:7px 0}.row .muted{font-size:.84rem}
        .actions{justify-content:flex-start;flex-wrap:wrap;margin-top:13px}
        button{border:0;border-radius:9px;padding:9px 12px;font:inherit;font-size:.88rem;cursor:pointer;background:var(--secondary-background-color);color:var(--primary-text-color)}
        button.primary{background:var(--primary-color);color:var(--text-primary-color,white)}button:disabled{opacity:.45;cursor:default}
        button ha-icon{vertical-align:middle;margin-right:4px;--mdc-icon-size:18px;color:inherit}
        .empty{padding:12px;background:var(--secondary-background-color);border-radius:8px}
        @media(max-width:360px){ha-card{padding:12px}.stats{gap:5px}.stat{padding:7px}.value{font-size:.95rem}}
      </style>
      <ha-card>
        <div class="header"><div class="brand"><ha-icon icon="mdi:robot-vacuum"></ha-icon>Marco</div><div class="status \${tone}"><ha-icon icon="\${icon}"></ha-icon>\${this._esc(status)}</div></div>
        <div class="main"><div class="place">
          <h2>\${this._esc(room || group?.name || status)}</h2>
          <div class="sub">\${this._esc(this._mapName())}\${group ? " · Grupa: "+this._esc(group.name) : status==="Sprząta" ? " · Poza zapisaną grupą" : ""}</div>
          \${room && group ? \`<div class="sub">Grupa: \${this._esc(group.name)}</div>\` : ""}
        </div><div class="robot"><ha-icon icon="mdi:robot-vacuum"></ha-icon></div></div>
        \${running || paused ? \`<div class="divider"></div><div class="progress-head"><span class="muted">Postęp sprzątania</span><span class="progress-value">\${Number.isFinite(progress)&&progress>=0?Math.min(100,progress)+"%":"—"}</span></div><div class="track"><div class="fill" style="width:\${Number.isFinite(progress)?Math.max(0,Math.min(100,progress)):0}%"></div></div>\` : ""}
        <div class="stats">
          <div class="stat"><ha-icon icon="mdi:battery"></ha-icon><div class="value">\${Number.isFinite(Number(battery))?Math.round(Number(battery))+"%":"—"}</div><div class="label">Bateria</div></div>
          <div class="stat"><ha-icon icon="mdi:clock-outline"></ha-icon><div class="value">\${Number.isFinite(minutes)&&minutes>0?minutes+" min":"—"}</div><div class="label">Czas pracy</div></div>
          <div class="stat"><ha-icon icon="mdi:texture-box"></ha-icon><div class="value">\${Number.isFinite(area)&&area>0?area+" m²":"—"}</div><div class="label">Posprzątano</div></div>
        </div>
        <div class="divider"></div>
        <div class="row"><span class="muted">Tryb sprzątania</span><b>\${this._esc(this._mode())}</b></div>
        <div class="row"><span class="muted">Moc ssania</span><b>\${this._esc(a.suction_level||a.fan_speed||"—")}</b></div>
        <div class="row"><span class="muted">Błąd</span><b>\${a.has_error?this._esc(a.error||"Wystąpił błąd"):"Brak"}</b></div>
        <div class="actions">
          \${paused?\`<button class="primary" data-action="resume" \${this._busy?"disabled":""}><ha-icon icon="mdi:play"></ha-icon>Wznów</button>\`:running?\`<button class="primary" data-action="pause" \${this._busy?"disabled":""}><ha-icon icon="mdi:pause"></ha-icon>Pauza</button>\`:""}
          <button data-action="return" \${this._busy||!canReturn?"disabled":""}><ha-icon icon="mdi:home-import-outline"></ha-icon>Wróć do stacji</button>
        </div>
      </ha-card>\`;
  }
  async _handleAction(event) {
    const button=event.target.closest("button[data-action]");
    if (!button || !this._hass || this._busy) return;
    const service=button.dataset.action==="pause"?"pause":button.dataset.action==="resume"?"start":"return_to_base";
    this._busy=true; this._update();
    try { await this._hass.callService("vacuum",service,{entity_id:this._config.vacuum_entity}); }
    catch(error) { console.error("Marco Status: nie udało się wykonać polecenia",error); }
    finally { this._busy=false; this._signature=null; this._update(); }
  }
}

// The frontend may replace the native registry with the scoped registry polyfill
// after extra modules start loading. Wait for that replacement before defining
// the card, otherwise the definition can be lost in the old registry.
function registerMarcoVacuumCard() {
  const registry = window.customElements;
  if (!registry.get("marco-vacuum-card")) {
    registry.define("marco-vacuum-card", MarcoVacuumCard);
  }
  if (!registry.get("marco-vacuum-status-card")) {
    registry.define("marco-vacuum-status-card", MarcoVacuumStatusCard);
  }

  window.customCards = window.customCards || [];
  if (!window.customCards.some((card) => card.type === "marco-vacuum-card")) {
    window.customCards.push({
      type: "marco-vacuum-card",
      name: "Marco Vacuum – grupy pomieszczeń",
      description: "Tworzenie, edycja i usuwanie zapisanych grup pomieszczeń.",
    });
  }
  if (!window.customCards.some((card) => card.type === "marco-vacuum-status-card")) {
    window.customCards.push({
      type: "marco-vacuum-status-card",
      name: "Marco Vacuum – status",
      description: "Status, aktywna grupa, postęp i sterowanie odkurzaczem.",
    });
  }
}

const initialCustomElementRegistry = window.customElements;
if (initialCustomElementRegistry.get("home-assistant")) {
  registerMarcoVacuumCard();
} else {
  const registryCheck = window.setInterval(() => {
    if (
      window.customElements !== initialCustomElementRegistry ||
      window.customElements.get("home-assistant")
    ) {
      window.clearInterval(registryCheck);
      registerMarcoVacuumCard();
    }
  }, 10);
  window.setTimeout(() => {
    window.clearInterval(registryCheck);
    if (!window.customElements.get("marco-vacuum-card")) {
      registerMarcoVacuumCard();
    }
  }, 15000);
}
