class MarcoVacuumCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config = null; this._hass = null; this._sensor = null;
    this._signature = null; this._editing = null; this._mapId = "";
    this._rooms = new Set(); this._name = ""; this._status = ""; this._busy = false;
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
    this._sensor=found ? found[1] : null;
    const sig=this._sensor ? JSON.stringify([this._sensor.state,this._sensor.attributes.maps,this._sensor.attributes.groups]) : "missing";
    if(sig!==this._signature){this._signature=sig;this._render();}
  }
  getCardSize(){return 5;}
  static getStubConfig(){return {vacuum_entity:"vacuum.marco"};}
  _esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  _maps(){return this._sensor?.attributes.maps||[];}
  _groups(){return this._sensor?.attributes.groups||[];}
  _map(){return this._maps().find(m=>String(m.map_id)===String(this._mapId));}
  _reset(){this._editing=null;this._rooms.clear();this._name="";}
  _render(){
    if(!this.shadowRoot||!this._config)return;
    const maps=this._maps(), groups=this._groups();
    if(!this._mapId&&maps.length)this._mapId=String(maps[0].map_id);
    if(this._mapId&&!maps.some(m=>String(m.map_id)===this._mapId)){this._mapId=maps.length?String(maps[0].map_id):"";this._reset();}
    const rooms=this._map()?.rooms||[], selected=new Set([...this._rooms].map(String));
    this.shadowRoot.innerHTML=\`
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
      \${!this._sensor ? \`<div class="empty">Nie znaleziono danych integracji dla <b>\${this._esc(this._config.vacuum_entity)}</b>. Sprawdź konfigurację integracji Marco Vacuum i dostępność map.</div>\` : \`
        <div class="muted">Odkurzacz: \${this._esc(this._config.vacuum_entity)}</div>
        <form id="form">
          <label class="field"><span>Mapa</span><select id="map" \${maps.length?"":"disabled"}>
            \${maps.map(m=>\`<option value="\${this._esc(m.map_id)}" \${String(m.map_id)===this._mapId?"selected":""}>\${this._esc(m.name)}</option>\`).join("")}
          </select></label>
          <label class="field"><span>Nazwa grupy</span><input id="name" type="text" maxlength="80" required placeholder="np. Parter" value="\${this._esc(this._name)}"></label>
          <h3>Pomieszczenia</h3>
          \${rooms.length?\`<div class="rooms">\${rooms.map(r=>\`<label class="room"><input type="checkbox" data-room="\${this._esc(r.id)}" \${selected.has(String(r.id))?"checked":""}><span>\${this._esc(r.name)}</span></label>\`).join("")}</div>\`:\`<div class="muted">Brak pomieszczeń dla wybranej mapy.</div>\`}
          <div class="actions"><button class="primary" type="submit" \${this._busy||!rooms.length?"disabled":""}>\${this._editing?"Zapisz zmiany":"Dodaj grupę"}</button>
          \${this._editing?\`<button class="secondary" type="button" data-action="cancel">Anuluj</button>\`:""}</div>
        </form>
        <h3>Zapisane grupy (\${groups.length})</h3>
        \${groups.length?groups.map(g=>\`<div class="group"><div><div class="group-name">\${this._esc(g.name)}</div><div class="meta">\${this._esc(g.map_name||"Mapa")} · \${(g.segments||[]).map(r=>this._esc(r.name)).join(", ")}</div></div><div class="group-actions"><button class="secondary" data-action="edit" data-id="\${this._esc(g.id)}">Edytuj</button><button class="danger" data-action="delete" data-id="\${this._esc(g.id)}">Usuń</button></div></div>\`).join(""):\`<div class="muted">Nie zapisano jeszcze żadnej grupy.</div>\`}
        <div class="status" role="status">\${this._esc(this._status)}</div>
      \`}</ha-card>\`;
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
    this._busy=true;this._status="Zapisywanie…";this._render();
    try{await this._hass.callService("marco_vacuum","save_group",{vacuum_entity:this._config.vacuum_entity,name,map_id:Number(map.map_id),segments,...(this._editing?{group_id:this._editing}:{})});this._reset();this._status="Grupa została zapisana.";}
    catch(err){this._status="Nie udało się zapisać grupy: "+(err.message||err);}
    finally{this._busy=false;this._render();}
  }
  async _delete(id){
    this._busy=true;this._status="Usuwanie…";this._render();
    try{await this._hass.callService("marco_vacuum","delete_group",{vacuum_entity:this._config.vacuum_entity,group_id:id});if(String(this._editing)===String(id))this._reset();this._status="Grupa została usunięta.";}
    catch(err){this._status="Nie udało się usunąć grupy: "+(err.message||err);}
    finally{this._busy=false;this._render();}
  }
}
if(!customElements.get("marco-vacuum-card"))customElements.define("marco-vacuum-card",MarcoVacuumCard);
window.customCards=window.customCards||[];
window.customCards.push({type:"marco-vacuum-card",name:"Marco Vacuum – grupy pomieszczeń",description:"Tworzenie, edycja i usuwanie zapisanych grup pomieszczeń."});
