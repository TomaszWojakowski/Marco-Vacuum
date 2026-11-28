class MarcoVacuumHistoryCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config=null;this._hass=null;this._sensor=null;
    this._selected=new Set();this._selectionDate=null;this._showSettings=false;
    this._busy=false;this._status="";
    this.shadowRoot.addEventListener("click",e=>this._click(e));
    this.shadowRoot.addEventListener("change",e=>this._change(e));
    this.shadowRoot.addEventListener("submit",e=>this._submit(e));
  }
  connectedCallback(){if(this._sensor){this._selectFailedRooms();this._render();}}
  disconnectedCallback(){this._selectionDate=null;}
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
    const oldSensor=this._sensor;
    const date=sensor.attributes.daily_history_date||"";
    this._sensor=sensor;
    const historyChanged=!oldSensor || oldSensor.attributes.daily_history_updated!==sensor.attributes.daily_history_updated;
    if(date!==this._selectionDate){
      this._selectionDate=date;
      this._selectFailedRooms();
    } else if(historyChanged && !this._userChangedSelection){
      this._selectFailedRooms();
    }
    this._render();
  }
  getCardSize(){return 8;}
  static getStubConfig(){return {vacuum_entity:"vacuum.marco"};}
  _esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  _maps(){return this._sensor?.attributes?.maps||[];}
  _history(){return this._sensor?.attributes?.daily_history||[];}
  _key(r){return String(r.map_id)+":"+String(r.room_id);}
  _selectFailedRooms(){
    this._selected=new Set(this._history().filter(r=>r.last_status==="error").map(r=>this._key(r)));
    this._userChangedSelection=false;
  }
  _countLabel(n){return n===1?"skuteczne sprzątanie":(n%10>=2&&n%10<=4&&(n%100<12||n%100>14))?"skuteczne sprzątania":"skutecznych sprzątań";}
  _roomsByMap(){
    const history=this._history();
    const maps=this._maps();
    return maps.map(map=>{
      const records=new Map(history.filter(r=>String(r.map_id)===String(map.map_id)).map(r=>[String(r.room_id),r]));
      const rooms=(map.rooms||[]).map(room=>({
        ...room,map_id:map.map_id,map_name:map.name,
        record:records.get(String(room.id))||null
      })).filter(room=>room.record);
      return {map,rooms};
    }).filter(group=>group.rooms.length);
  }
  _selectedMapIds(){
    return new Set([...this._selected].map(key=>key.split(":")[0]));
  }
  _updateControls(){
    const summary=this.shadowRoot.querySelector("[data-summary]");
    const start=this.shadowRoot.querySelector('[data-action="start"]');
    const selectedCount=this._selected.size;
    const mapIds=this._selectedMapIds();
    if(summary)summary.textContent="Zaznaczono: "+selectedCount+(mapIds.size>1?" · wybierz jedno piętro do uruchomienia":"");
    if(start)start.disabled=this._busy||selectedCount===0||mapIds.size!==1;
  }
  _render(){
    if(!this._config)return;
    const groups=this._roomsByMap();
    const selectedMapIds=this._selectedMapIds();
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
        .floor{font-size:.82rem;font-weight:700;color:var(--secondary-text-color);letter-spacing:.04em;margin:16px 0 4px}
        .room{display:flex;align-items:center;gap:9px;padding:10px 2px;border-top:1px solid var(--divider-color);cursor:pointer}
        .room input[type=checkbox]{appearance:auto;-webkit-appearance:checkbox;width:20px;height:20px;min-width:20px;min-height:20px;margin:0;padding:0;accent-color:var(--primary-color);cursor:pointer}
        .roomname{flex:1;min-width:0}.count{font-size:.8rem;color:var(--secondary-text-color);white-space:nowrap}
        .status{font-size:.8rem;font-weight:600;margin-left:4px;white-space:nowrap}.ok{color:var(--success-color)}.error{color:var(--error-color)}
        .summary{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:12px 0}
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
        ${!this._sensor?'<div class="empty">Nie znaleziono danych Marco Vacuum.</div>':groups.length?groups.map(group=>`
          <div class="floor">${this._esc(group.map.name)}</div>
          ${group.rooms.map(room=>{
            const key=this._key(room),checked=this._selected.has(key),record=room.record;
            const count=Number(record.successful_cleanings||0);
            const status=record.last_status;
            return `<label class="room">
              <input type="checkbox" data-room-key="${this._esc(key)}" ${checked?"checked":""}>
              <span class="roomname">${this._esc(room.name)}</span>
              <span class="count">${count} ${this._countLabel(count)}</span>
              <span class="status ${status==="error"?"error":"ok"}">${status==="error"?"Błąd":"OK"}</span>
            </label>`;
          }).join("")}
        `).join(""):'<div class="empty">Dzisiaj nie odnotowano prób sprzątania żadnego pomieszczenia.</div>'}
        ${this._sensor?`
          <div class="summary"><span class="muted" data-summary>Zaznaczono: ${this._selected.size}${selectedMapIds.size>1?" · wybierz jedno piętro do uruchomienia":""}</span><span class="muted">${failures?failures+" błędów dzisiaj":"Brak błędów dzisiaj"}</span></div>
          <div class="actions">
            <button class="primary" data-action="start" ${this._busy||!this._selected.size||selectedMapIds.size!==1?"disabled":""}>Sprzątaj zaznaczone</button>
            <button data-action="refresh" ${this._busy?"disabled":""}>Odśwież historię</button>
          </div>
          ${selectedMapIds.size>1?'<div class="note">Zaznaczone są pokoje z różnych pięter. Robot może wykonać jedno zadanie na aktualnie wybranej mapie — odznacz pokoje z pozostałych pięter i uruchom je osobno.</div>':""}
          ${settings}
          <div class="note">Pokazujemy wyłącznie pomieszczenia, w których dzisiaj odnotowano próbę sprzątania. Licznik obejmuje tylko skuteczne sprzątania; status dotyczy ostatniej próby.</div>
          <div class="meta" role="status">${this._esc(this._status)}</div>
        `: ""}
      </ha-card>`;
    this._updateControls();
  }
  _change(e){
    if(!e.target.matches('input[type="checkbox"][data-room-key]'))return;
    const key=e.target.dataset.roomKey;
    if(e.target.checked)this._selected.add(key);else this._selected.delete(key);
    this._userChangedSelection=true;
    this._updateControls();
  }
  async _click(e){
    const button=e.target.closest("button[data-action]");if(!button)return;
    const action=button.dataset.action;
    if(action==="cancel-settings"){this._showSettings=false;this._render();return;}
    if(action==="start"){
      const mapIds=this._selectedMapIds();
      if(mapIds.size!==1){this._status="Wybierz pomieszczenia z jednego piętra.";this._render();return;}
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
    if(e.target.id!=="settings")return;
    e.preventDefault();
    if(this._busy)return;
    const mapIds=this._selectedMapIds();
    if(mapIds.size!==1){this._status="Wybierz pomieszczenia z jednego piętra.";this._render();return;}
    const mapId=Number([...mapIds][0]);
    const segments=[...this._selected].map(key=>{const [m,id]=key.split(":");return Number(m)===mapId?Number(id):null;}).filter(Number.isFinite);
    const map=this._maps().find(item=>Number(item.map_id)===mapId);
    if(!map||!segments.length){this._status="Nie wybrano prawidłowych pomieszczeń.";this._render();return;}
    const form=new FormData(e.target),payload={
      vacuum_entity:this._config.vacuum_entity,map_id:mapId,segments,
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
