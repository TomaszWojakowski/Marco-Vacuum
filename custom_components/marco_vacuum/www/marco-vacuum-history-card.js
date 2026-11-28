class MarcoVacuumHistoryCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config=null;this._hass=null;this._sensor=null;this._mapId="";
    this._selected=new Set();this._selectionDate=null;this._showSettings=false;
    this._busy=false;this._status="";this._statusError=false;
    this.shadowRoot.addEventListener("click",e=>this._click(e));
    this.shadowRoot.addEventListener("change",e=>this._change(e));
    this.shadowRoot.addEventListener("submit",e=>this._submit(e));
  }
  setConfig(config){
    if(!config?.vacuum_entity)throw new Error("Podaj vacuum_entity, np. vacuum.marco");
    this._config=config;this._render();
  }
  set hass(hass){
    this._hass=hass;
    const sensor=Object.values(hass.states).find(s=>
      s.attributes?.vacuum_entity===this._config?.vacuum_entity &&
      Array.isArray(s.attributes?.maps) && Array.isArray(s.attributes?.daily_history)
    );
    if(!sensor)return;
    const date=sensor.attributes.daily_history_date||"";
    const changed=!this._sensor||date!==this._selectionDate;
    this._sensor=sensor;
    const maps=this._maps();
    if(!this._mapId&&maps.length)this._mapId=String(maps[0].map_id);
    if(changed){
      this._selectionDate=date;
      this._selected=new Set(this._history().filter(r=>r.last_status==="error").map(r=>this._key(r)));
    }
    this._render();
  }
  getCardSize(){return 6;}
  static getStubConfig(){return {vacuum_entity:"vacuum.marco"};}
  _esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  _maps(){return this._sensor?.attributes?.maps||[];}
  _history(){return this._sensor?.attributes?.daily_history||[];}
  _key(r){return String(r.map_id)+":"+String(r.room_id);}
  _map(){return this._maps().find(m=>String(m.map_id)===this._mapId)||this._maps()[0];}
  _rooms(){
    const map=this._map();if(!map)return [];
    const records=new Map(this._history().filter(r=>String(r.map_id)===String(map.map_id)).map(r=>[String(r.room_id),r]));
    return (map.rooms||[]).map(room=>({ ...room, map_id:map.map_id, map_name:map.name,
      record:records.get(String(room.id))||null }));
  }
  _render(){
    if(!this._config)return;
    const map=this._map(),rooms=this._rooms(),selected=[...this._selected];
    const failures=this._history().filter(r=>r.last_status==="error").length;
    const settings=this._showSettings?'<form id="settings"><h3>Parametry sprzątania</h3><div class="grid">'+
      '<label>Tryb<select name="cleaning_mode"><option value="0">Odkurzanie</option><option value="1">Mopowanie</option><option value="2" selected>Odkurzanie i mopowanie</option></select></label>'+
      '<label>Siła ssania<select name="suction_level"><option value="0">Quiet</option><option value="1" selected>Standard</option><option value="2">Strong</option><option value="3">Turbo</option></select></label>'+
      '<label>Wilgotność mopa<input name="wetness_level" type="number" min="1" max="32" value="16"></label>'+
      '<label>Trasa<select name="cleaning_route"><option value="1" selected>Standard</option><option value="2">Intensywna</option><option value="3">Głęboka</option><option value="4">Szybka</option></select></label>'+
      '<label>Powtórzenia<select name="repeats"><option value="1" selected>1</option><option value="2">2</option><option value="3">3</option></select></label>'+
      '</div><div class="actions"><button class="primary" type="submit" '+(this._busy?"disabled":"")+'>Uruchom sprzątanie</button><button type="button" data-action="cancel-settings">Anuluj</button></div></form>':'';
    this.shadowRoot.innerHTML=`
      <style>
        :host{display:block;color:var(--primary-text-color)}ha-card{padding:16px}
        h2{font-size:1.15rem;font-weight:600;margin:0 0 8px}h3{font-size:1rem;margin:16px 0 8px}
        .muted,.meta{color:var(--secondary-text-color);font-size:.84rem}
        select,input{font:inherit;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px;padding:8px;min-height:40px;box-sizing:border-box}
        .mapselect{width:100%;margin:12px 0}
        .room{display:flex;align-items:center;gap:8px;padding:9px 2px;border-top:1px solid var(--divider-color)}
        .room input{min-height:0;accent-color:var(--primary-color)}
        .roomname{flex:1;min-width:0}.count{font-size:.82rem;color:var(--secondary-text-color);white-space:nowrap}
        .status{font-size:.82rem;font-weight:600;margin-left:5px}.ok{color:var(--success-color)}.error{color:var(--error-color)}
        .summary{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:10px 0}
        .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
        button{border:0;border-radius:8px;padding:10px 13px;font:inherit;cursor:pointer;background:var(--secondary-background-color);color:var(--primary-text-color)}
        button.primary{background:var(--primary-color);color:var(--text-primary-color,white)}
        button:disabled{opacity:.45;cursor:default}
        .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
        .grid label{display:flex;flex-direction:column;gap:5px;font-size:.82rem;color:var(--secondary-text-color)}
        .grid input,.grid select{width:100%}
        .empty{padding:12px;background:var(--secondary-background-color);border-radius:8px}
        .note{font-size:.8rem;color:var(--secondary-text-color);margin-top:8px}
      </style>
      <ha-card>
        <h2>Dzisiejsza historia sprzątania</h2>
        <div class="muted">Odkurzacz: ${this._esc(this._config.vacuum_entity)}</div>
        ${!this._sensor?'<div class="empty">Nie znaleziono danych Marco Vacuum.</div>':`
          <select class="mapselect" id="map">${this._maps().map(m=>`<option value="${m.map_id}" ${String(m.map_id)===String(map?.map_id)?"selected":""}>${this._esc(m.name)}</option>`).join("")}</select>
          ${rooms.length?rooms.map(r=>{
            const checked=this._selected.has(this._key(r)),record=r.record;
            const count=record?.successful_cleanings||0;
            const status=record?.last_status;
            return `<label class="room"><input type="checkbox" data-room="${this._esc(r.id)}" ${checked?"checked":""}>
              <span class="roomname">${this._esc(r.name)}</span>
              <span class="count">${count} ${count===1?"sprzątanie":"sprzątań"}</span>
              ${status?'<span class="status '+(status==="error"?"error":"ok")+'">'+(status==="error"?"Błąd":"OK")+'</span>':""}
            </label>`;
          }).join(""):'<div class="empty">Brak pomieszczeń na tej mapie.</div>'}
          <div class="summary"><span class="muted">Zaznaczono: ${selected.length}</span><span class="muted">${failures?failures+" błędów dzisiaj":"Brak błędów dzisiaj"}</span></div>
          <div class="actions">
            <button class="primary" data-action="start" ${this._busy||!selected.length?"disabled":""}>Sprzątaj</button>
            <button data-action="refresh" ${this._busy?"disabled":""}>Odśwież historię</button>
          </div>
          ${settings}
          <div class="note">Domyślnie zaznaczone są pomieszczenia, których ostatnia próba zakończyła się błędem. Parametry sprzątania nie są porównywane z wcześniejszymi zadaniami.</div>
          <div class="meta" role="status">${this._esc(this._status)}</div>
        `}
      </ha-card>`;
  }
  _change(e){
    if(e.target.id==="map"){this._mapId=e.target.value;this._selected=new Set(this._history().filter(r=>String(r.map_id)===this._mapId&&r.last_status==="error").map(r=>this._key(r)));this._render();}
    if(e.target.matches("input[data-room]")){
      const roomId=String(e.target.dataset.room),key=String(this._map()?.map_id)+":"+roomId;
      if(e.target.checked)this._selected.add(key);else this._selected.delete(key);
      this._render();
    }
  }
  async _click(e){
    const button=e.target.closest("button[data-action]");if(!button)return;
    const action=button.dataset.action;
    if(action==="cancel-settings"){this._showSettings=false;this._render();return;}
    if(action==="start"){
      const map=this._map(),segments=[...this._selected].map(key=>{const [m,id]=key.split(":");return String(m)===String(map?.map_id)?Number(id):null;}).filter(Number.isFinite);
      if(!map||!segments.length){this._status="Zaznacz pomieszczenia z jednej mapy.";this._statusError=true;this._render();return;}
      this._showSettings=true;this._status="";this._render();return;
    }
    if(action==="refresh"){
      this._busy=true;this._status="Odświeżanie…";this._render();
      try{await this._hass.callService("marco_vacuum","refresh_daily_history",{vacuum_entity:this._config.vacuum_entity});this._status="Historia została odświeżona.";}
      catch(err){this._status="Błąd odświeżania: "+(err.message||err);}
      finally{this._busy=false;this._render();}
    }
  }
  async _submit(e){
    if(e.target.id!=="settings")return;e.preventDefault();
    if(this._busy)return;
    const map=this._map(),segments=[...this._selected].map(key=>{const [m,id]=key.split(":");return String(m)===String(map?.map_id)?Number(id):null;}).filter(Number.isFinite);
    if(!map||!segments.length){this._status="Zaznacz pomieszczenia z jednej mapy.";this._render();return;}
    const form=new FormData(e.target),payload={
      vacuum_entity:this._config.vacuum_entity,map_id:Number(map.map_id),segments,
      cleaning_mode:Number(form.get("cleaning_mode")),suction_level:Number(form.get("suction_level")),
      wetness_level:Number(form.get("wetness_level")),cleaning_route:Number(form.get("cleaning_route")),
      repeats:Number(form.get("repeats"))
    };
    this._busy=true;this._status="Uruchamianie sprzątania…";this._render();
    try{
      await this._hass.callService("marco_vacuum","run_manual_cleaning",payload);
      this._status="Wysłano polecenie sprzątania.";
      this._showSettings=false;
    }catch(err){this._status="Nie udało się uruchomić: "+(err.message||err);}
    finally{this._busy=false;this._render();}
  }
}
if(!customElements.get("marco-vacuum-history-card"))customElements.define("marco-vacuum-history-card",MarcoVacuumHistoryCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(x=>x.type==="marco-vacuum-history-card"))window.customCards.push({type:"marco-vacuum-history-card",name:"Marco Vacuum – historia dzienna",description:"Dzisiejsze sprzątania pomieszczeń i ponawianie nieudanych prób."});
