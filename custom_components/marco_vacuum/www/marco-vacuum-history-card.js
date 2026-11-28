class MarcoVacuumHistoryCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._config=null;this._hass=null;this._sensor=null;this._historySignature=null;
    this._selected=new Set();this._showSettings=false;
    this._settingsDraft={cleaning_type:"cleangenius",cleangenius:"routine_cleaning",cleangenius_mode:"mop_after_vacuum",shared_settings:{}};
    this._busy=false;this._status="";
    this.shadowRoot.addEventListener("click",e=>this._click(e));
    this.shadowRoot.addEventListener("change",e=>this._change(e));
    this.shadowRoot.addEventListener("submit",e=>this._submit(e));
  }
  connectedCallback(){if(this._config)this._render();}
  disconnectedCallback(){}
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
    this._sensor=sensor;
    const signature=JSON.stringify([sensor.attributes.daily_history_date,sensor.attributes.daily_history,sensor.attributes.maps]);
    if(signature!==this._historySignature){
      this._historySignature=signature;
      this._render();
    }
  }
  getCardSize(){return 8;}
  static getStubConfig(){return {vacuum_entity:"vacuum.marco"};}
  _esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  _maps(){return this._sensor?.attributes?.maps||[];}
  _history(){return this._sensor?.attributes?.daily_history||[];}
  _key(r){return String(r.map_id)+":"+String(r.room_id);}
  _settingsFields(prefix,v={}) {
    const modes=[[0,"Zamiatanie"],[1,"Mopowanie"],[2,"Zamiatanie i mopowanie"]];
    return '<div class="grid settings-grid"><label class="field"><span>Tryb sprzątania</span><select name="'+prefix+'_cleaning_mode">'+modes.map(([n,l])=>'<option value="'+n+'" '+(Number(v.cleaning_mode??2)===n?"selected":"")+'>'+l+'</option>').join("")+'</select></label><label class="field"><span>Siła ssania</span><select name="'+prefix+'_suction_level">'+["Quiet","Standard","Strong","Turbo"].map((l,i)=>'<option value="'+i+'" '+(Number(v.suction_level??1)===i?"selected":"")+'>'+l+'</option>').join("")+'</select></label><label class="field"><span>Trasa sprzątania</span><select name="'+prefix+'_cleaning_route">'+[[1,"Standard"],[2,"Intensywna"],[3,"Głęboka"],[4,"Szybka"]].map(([n,l])=>'<option value="'+n+'" '+(Number(v.cleaning_route??1)===n?"selected":"")+'>'+l+'</option>').join("")+'</select></label><label class="field"><span>Wilgotność mopa (1–32)</span><input type="number" min="1" max="32" name="'+prefix+'_wetness_level" value="'+Number(v.wetness_level??16)+'"></label><label class="field"><span>Powtórzenia</span><select name="'+prefix+'_repeats">'+[1,2,3].map(n=>'<option value="'+n+'" '+(Number(v.repeats??1)===n?"selected":"")+'>'+n+'</option>').join("")+'</select></label></div>';
  }
  _readSettings(data,prefix){
    return {cleaning_mode:Number(data.get(prefix+"_cleaning_mode")??2),suction_level:Number(data.get(prefix+"_suction_level")??1),wetness_level:Number(data.get(prefix+"_wetness_level")??16),cleaning_route:Number(data.get(prefix+"_cleaning_route")??1),repeats:Number(data.get(prefix+"_repeats")??1)};
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
    const draft=this._settingsDraft;
    const settings=this._showSettings?'<form id="settings"><h3>Tryb sprzątania</h3>'+
      '<label class="field"><span>Wariant</span><select name="cleaning_type"><option value="custom" '+((draft.cleaning_type||"custom")==="custom"?"selected":"")+'>Niestandardowy</option><option value="cleangenius" '+(draft.cleaning_type==="cleangenius"?"selected":"")+'>CleanGenius</option></select></label>'+
      (draft.cleaning_type==="cleangenius"?
        '<div class="grid"><label class="field"><span>CleanGenius</span><select name="cleangenius">'+[["routine_cleaning","Routine cleaning"],["deep_cleaning","Deep cleaning"]].map(([v,l])=>'<option value="'+v+'" '+((draft.cleangenius||"routine_cleaning")===v?"selected":"")+'>'+l+'</option>').join("")+'</select></label><label class="field"><span>Sposób pracy</span><select name="cleangenius_mode">'+[["vacuum_and_mop","Odkurzanie i mopowanie"],["mop_after_vacuum","Mopowanie po odkurzaniu"]].map(([v,l])=>'<option value="'+v+'" '+((draft.cleangenius_mode||"mop_after_vacuum")===v?"selected":"")+'>'+l+'</option>').join("")+'</select></label></div>'
      :this._settingsFields("shared",draft.shared_settings||{}))+
      '<div class="note">Zmiany zostaną zastosowane przy następnym uruchomieniu sprzątania.</div><div class="actions"><button type="button" data-action="close-settings">Zamknij</button></div></form>':'';
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
        .status{font-size:.8rem;font-weight:600;margin-left:4px;white-space:nowrap}.ok{color:var(--success-color)}.error{color:var(--error-color)}.unknown{color:var(--secondary-text-color)}
        .summary{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:12px 0}
        .actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
        button{border:0;border-radius:8px;padding:10px 13px;font:inherit;cursor:pointer;background:var(--secondary-background-color);color:var(--primary-text-color)}
        button.primary{background:var(--primary-color);color:var(--text-primary-color,white)}
        button:disabled{opacity:.45;cursor:default}
        .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;min-width:0;box-sizing:border-box}.field{display:block;margin:10px 0;width:100%;min-width:0;max-width:100%;box-sizing:border-box}.field span{display:block;font-size:.84rem;color:var(--secondary-text-color);margin-bottom:5px}.grid input,.grid select{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box}.room-settings{border:1px solid var(--divider-color);border-radius:8px;padding:9px 11px;margin:8px 0}.room-settings summary{cursor:pointer;font-weight:600}.settings-grid{padding-top:8px}
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
              <span class="status ${status==="error"?"error":status==="unknown"?"unknown":"ok"}">${status==="error"?"Błąd":status==="unknown"?"Brak wyniku":"OK"}</span>
            </label>`;
          }).join("")}
        `).join(""):'<div class="empty">Dzisiaj nie odnotowano prób sprzątania żadnego pomieszczenia.</div>'}
        ${this._sensor?`
          <div class="summary"><span class="muted" data-summary>Zaznaczono: ${this._selected.size}${selectedMapIds.size>1?" · wybierz jedno piętro do uruchomienia":""}</span><span class="muted">${failures?failures+" błędów dzisiaj":"Brak błędów dzisiaj"}</span></div>
          <div class="actions">
            <button class="primary" data-action="start" ${this._busy||!this._selected.size||selectedMapIds.size!==1?"disabled":""}>Sprzątaj</button>
            <button data-action="settings" ${this._busy?"disabled":""}>Parametry</button>
            <button data-action="select-failed" ${this._busy||!failures?"disabled":""}>Zaznacz błędne</button>
            <button data-action="refresh" ${this._busy?"disabled":""}>Odśwież</button>
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
    if(e.target.matches('input[type="checkbox"][data-room-key]')){
      const key=e.target.dataset.roomKey;
      if(e.target.checked)this._selected.add(key);else this._selected.delete(key);
      this._render();
      return;
    }
    if(e.target.closest("#settings")){
      const form=e.target.form;
      const changedMode=e.target.name==="cleaning_type";
      const data=new FormData(form),current=this._settingsDraft;
      this._settingsDraft={
        ...current,
        cleaning_type:String(data.get("cleaning_type")||"cleangenius"),
        cleangenius:String(data.get("cleangenius")||current.cleangenius||"routine_cleaning"),
        cleangenius_mode:String(data.get("cleangenius_mode")||current.cleangenius_mode||"mop_after_vacuum"),
        shared_settings:form.querySelector('[name="shared_cleaning_mode"]')?this._readSettings(data,"shared"):(current.shared_settings||{})
      };
      if(changedMode)this._render();
    }
  }
  async _click(e){
    const button=e.target.closest("button[data-action]");if(!button)return;
    const action=button.dataset.action;
    if(action==="settings"){
      if(this._showSettings)this._captureSettings();
      this._showSettings=!this._showSettings;this._render();return;
    }
    if(action==="close-settings"){this._captureSettings();this._showSettings=false;this._render();return;}
    if(action==="select-failed"){
      for(const room of this._history())if(room.last_status==="error")this._selected.add(this._key(room));
      this._render();return;
    }
    if(action==="start"){await this._startCleaning();return;}
    if(action==="refresh"){
      this._busy=true;this._status="Odświeżanie…";this._render();
      try{await this._hass.callService("marco_vacuum","refresh_daily_history",{vacuum_entity:this._config.vacuum_entity});this._status="Historia została odświeżona.";}
      catch(err){this._status="Błąd odświeżania: "+(err.message||err);}
      finally{this._busy=false;this._render();}
    }
  }
  _captureSettings(){
    const form=this.shadowRoot.querySelector("#settings");if(!form)return;
    const data=new FormData(form),current=this._settingsDraft;
    this._settingsDraft={
      ...current,
      cleaning_type:String(data.get("cleaning_type")||"cleangenius"),
      cleangenius:String(data.get("cleangenius")||current.cleangenius||"routine_cleaning"),
      cleangenius_mode:String(data.get("cleangenius_mode")||current.cleangenius_mode||"mop_after_vacuum"),
      shared_settings:form.querySelector('[name="shared_cleaning_mode"]')?this._readSettings(data,"shared"):(current.shared_settings||{})
    };
  }
  async _startCleaning(){
    if(this._busy)return;
    this._captureSettings();
    const mapIds=this._selectedMapIds();
    if(!this._selected.size){this._status="Zaznacz pomieszczenia do sprzątania.";this._render();return;}
    if(mapIds.size!==1){this._status="Wybierz pomieszczenia z jednego piętra.";this._render();return;}
    const mapId=Number([...mapIds][0]);
    const segments=[...this._selected].map(key=>{const [m,id]=key.split(":");return Number(m)===mapId?Number(id):null;}).filter(Number.isFinite);
    const map=this._maps().find(item=>Number(item.map_id)===mapId);
    if(!map||!segments.length){this._status="Nie wybrano prawidłowych pomieszczeń.";this._render();return;}
    const draft=this._settingsDraft,cleaningType=draft.cleaning_type||"cleangenius";
    const sharedSettings=draft.shared_settings||{};
    const payload={
      vacuum_entity:this._config.vacuum_entity,map_id:mapId,segments,
      cleaning_type:cleaningType,
      cleangenius:draft.cleangenius||"routine_cleaning",
      cleangenius_mode:draft.cleangenius_mode||"mop_after_vacuum",
      settings_mode:"shared",
      shared_settings:sharedSettings
    };
    this._busy=true;this._status="Uruchamianie sprzątania…";this._render();
    try{
      await this._hass.callService("marco_vacuum","run_manual_cleaning",payload);
      this._selected.clear();this._showSettings=false;
      this._status="Wysłano polecenie sprzątania.";
    }catch(err){this._status="Nie udało się uruchomić: "+(err.message||err);}
    finally{this._busy=false;this._render();}
  }
  async _submit(e){if(e.target.id==="settings")e.preventDefault();}
}
if(!customElements.get("marco-vacuum-history-card"))customElements.define("marco-vacuum-history-card",MarcoVacuumHistoryCard);
window.customCards=window.customCards||[];
if(!window.customCards.some(x=>x.type==="marco-vacuum-history-card"))window.customCards.push({type:"marco-vacuum-history-card",name:"Marco Vacuum – historia dzienna",description:"Dzisiejsze sprzątania pomieszczeń i ponawianie nieudanych prób."});
