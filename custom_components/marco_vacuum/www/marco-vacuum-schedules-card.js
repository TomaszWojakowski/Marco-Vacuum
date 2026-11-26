class MarcoVacuumSchedulesCard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:"open"}); this._hass=null; this._config=null;
    this._sensor=null; this._editing=null; this._draft=null; this._busy=false; this._status=""; this._statusError=false; this._signature=null; this._mapId=""; this._pendingSchedules=new Map();
    this.shadowRoot.addEventListener("click",e=>this._click(e));
    this.shadowRoot.addEventListener("change",e=>this._change(e));
    this.shadowRoot.addEventListener("submit",e=>this._submit(e));
  }
  setConfig(c){if(!c?.vacuum_entity)throw new Error("Podaj vacuum_entity, np. vacuum.marco");this._config=c;this._render();}
  set hass(h){
    this._hass=h;
    const s=Object.values(h.states).find(x=>x.attributes?.vacuum_entity===this._config?.vacuum_entity&&Array.isArray(x.attributes?.schedules));
    if(s){const schedules=[...(s.attributes.schedules||[])];for(const [id,item] of this._pendingSchedules){if(schedules.some(x=>x.id===id))this._pendingSchedules.delete(id);else schedules.push(item);}this._sensor={...s,attributes:{...s.attributes,schedules}};}
    const sig=JSON.stringify([this._sensor?.state,this._sensor?.attributes?.schedules,this._sensor?.attributes?.maps]);
    if(sig!==this._signature){this._signature=sig;this._render();}
  }
  _a(){return this._sensor?.attributes||{}}
  async _refreshSensor(expected={}){
    let sensor=null;
    for(let attempt=0;attempt<8;attempt++){
      const states=await this._hass.callWS({type:"get_states"});
      sensor=states.find(s=>s.attributes?.vacuum_entity===this._config?.vacuum_entity&&Array.isArray(s.attributes?.schedules));
      if(sensor){
        const schedules=sensor.attributes.schedules;
        const scheduleReady=!expected.scheduleId||schedules.some(x=>x.id===expected.scheduleId);
        const deletionReady=!expected.deletedId||!schedules.some(x=>x.id===expected.deletedId);
        if(scheduleReady&&deletionReady)break;
      }
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!sensor)throw new Error("Nie znaleziono encji z harmonogramami Marco Vacuum.");
    this._sensor=sensor;
    this._signature=JSON.stringify([sensor.state,sensor.attributes.schedules,sensor.attributes.maps]);
    return sensor;
  }
  _esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  _maps(){return this._a().maps||[]}
  _schedules(){return this._a().schedules||[]}
  _settingsFields(prefix,v={}) {
    const modes=[[0,"Zamiatanie"],[1,"Mopowanie"],[2,"Zamiatanie i mopowanie"]];
    return '<div class="grid settings-grid"><label class="field"><span>Tryb sprzątania</span><select name="'+prefix+'_cleaning_mode">'+modes.map(([n,l])=>'<option value="'+n+'" '+(Number(v.cleaning_mode??2)===n?"selected":"")+'>'+l+'</option>').join("")+'</select></label><label class="field"><span>Siła ssania</span><select name="'+prefix+'_suction_level">'+["Quiet","Standard","Strong","Turbo"].map((l,i)=>'<option value="'+i+'" '+(Number(v.suction_level??1)===i?"selected":"")+'>'+l+'</option>').join("")+'</select></label><label class="field"><span>Wilgotność mopa (1–32)</span><input type="number" min="1" max="32" name="'+prefix+'_wetness_level" value="'+Number(v.wetness_level??16)+'"></label><label class="field"><span>Powtórzenia</span><select name="'+prefix+'_repeats">'+[1,2,3].map(n=>'<option value="'+n+'" '+(Number(v.repeats??1)===n?"selected":"")+'>'+n+'</option>').join("")+'</select></label></div>';
  }
  _readSettings(data,prefix){
    return {cleaning_mode:Number(data.get(prefix+"_cleaning_mode")??2),suction_level:Number(data.get(prefix+"_suction_level")??1),wetness_level:Number(data.get(prefix+"_wetness_level")??16),repeats:Number(data.get(prefix+"_repeats")??1)};
  }
  _readRoomSettings(form){
    const result={};
    for(const input of form.querySelectorAll('input[name^="room_"],select[name^="room_"]')){
      const m=input.name.match(/^room_(\d+)_(cleaning_mode|suction_level|wetness_level|repeats)$/);
      if(!m)continue;
      result[m[1]]=result[m[1]]||{};result[m[1]][m[2]]=Number(input.value);
    }
    return result;
  }
  _render(){
    if(!this._config)return;
    const maps=this._maps(),list=this._schedules(),g=this._editing||this._draft||{};
    const mapId=String(g.map_id??this._mapId??maps[0]?.map_id??"");
    const map=maps.find(x=>String(x.map_id)===mapId)||maps[0], selected=new Set((g.segments||[]).map(Number));
    const days=["Pon","Wt","Śr","Czw","Pt","Sob","Niedz"];
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;color:var(--primary-text-color)}ha-card{padding:16px}h2{font-size:1.2rem;margin:0 0 12px}h3{font-size:1rem;margin:18px 0 8px}
      .muted,.meta{color:var(--secondary-text-color);font-size:.85rem}.field{display:block;margin:10px 0}.field span{display:block;font-size:.84rem;color:var(--secondary-text-color);margin-bottom:5px}
      input,select{box-sizing:border-box;width:100%;min-width:0;max-width:100%;min-height:40px;padding:8px 10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
      .days{display:grid;grid-template-columns:repeat(auto-fit,minmax(75px,1fr));gap:7px}.rooms{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:7px}.check{display:flex;align-items:center;gap:6px;padding:8px;border:1px solid var(--divider-color);border-radius:8px;font-size:.88rem}.check input{width:auto;min-height:0}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;width:100%;min-width:0;box-sizing:border-box}.grid>.field,.field{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box}.grid input,.grid select{display:block;width:100%;min-width:0;max-width:100%;box-sizing:border-box}.grid input[type="time"]{-webkit-appearance:none;appearance:none;min-inline-size:0;inline-size:100%}.status.error{color:var(--error-color);font-weight:600}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
      button{border:0;border-radius:8px;padding:9px 12px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer}
      button.primary{background:var(--primary-color);color:var(--text-primary-color,white)}button.danger{color:var(--error-color)}button:disabled{opacity:.5}
      .item{border-top:1px solid var(--divider-color);padding:12px 0}.itemhead{display:flex;justify-content:space-between;gap:10px}.name{font-weight:600}.status{margin-top:10px;color:var(--secondary-text-color);font-size:.88rem}.room-settings{border:1px solid var(--divider-color);border-radius:8px;padding:9px 11px;margin:8px 0}.room-settings summary{cursor:pointer;font-weight:600}.settings-grid{padding-top:8px}

    </style><ha-card><h2>Harmonogramy Marco</h2>
      <div class="muted">Odkurzacz: ${this._esc(this._config.vacuum_entity)}</div>
      <form id="schedule-form">
        <label class="field"><span>Nazwa harmonogramu</span><input name="name" maxlength="80" value="${this._esc(g.name||"")}" placeholder="np. Parter – codziennie"></label>
        <label class="field"><span>Mapa</span><select name="map_id">${maps.map(m=>`<option value="${m.map_id}" ${String(m.map_id)===mapId?"selected":""}>${this._esc(m.name)}</option>`).join("")}</select></label>
        <h3>Pomieszczenia</h3><div class="rooms">${(map?.rooms||[]).map(r=>`<label class="check"><input type="checkbox" name="segments" value="${r.id}" ${selected.has(Number(r.id))?"checked":""}><span>${this._esc(r.name)}</span></label>`).join("")}</div>
        <h3>Dni tygodnia</h3><div class="days">${days.map((d,i)=>`<label class="check"><input type="checkbox" name="days" value="${i}" ${(g.days||[0,1,2,3,4,5,6]).includes(i)?"checked":""}><span>${d}</span></label>`).join("")}</div>
        <div class="grid"><label class="field"><span>Godzina</span><input name="time" type="time" required value="${this._esc(g.time||"07:00")}"></label></div>
        <h3>Tryb sprzątania</h3>
        <label class="field"><span>Wariant</span><select name="cleaning_type">
          <option value="custom" ${(g.cleaning_type||"custom")==="custom"?"selected":""}>Niestandardowy</option>
          <option value="cleangenius" ${g.cleaning_type==="cleangenius"?"selected":""}>CleanGenius</option>
        </select></label>
        ${g.cleaning_type==="cleangenius"?(
          '<div class="grid"><label class="field"><span>CleanGenius</span><select name="cleangenius">'+[["routine_cleaning","Routine cleaning"],["deep_cleaning","Deep cleaning"]].map(([v,l])=>'<option value="'+v+'" '+((g.cleangenius||"routine_cleaning")===v?"selected":"")+'>'+l+'</option>').join("")+'</select></label><label class="field"><span>Sposób pracy</span><select name="cleangenius_mode">'+[["vacuum_and_mop","Odkurzanie i mopowanie"],["mop_after_vacuum","Mopowanie po odkurzaniu"]].map(([v,l])=>'<option value="'+v+'" '+((g.cleangenius_mode||"mop_after_vacuum")===v?"selected":"")+'>'+l+'</option>').join("")+'</select></label></div>'
        ):(
          '<label class="field"><span>Ustawienia pomieszczeń</span><select name="settings_mode"><option value="shared" '+((g.settings_mode||"shared")==="shared"?"selected":"")+'>Wszystkie pomieszczenia tak samo</option><option value="individual" '+(g.settings_mode==="individual"?"selected":"")+'>Indywidualnie dla każdego pomieszczenia</option></select></label>'+
          ((g.settings_mode||"shared")==="shared"?this._settingsFields("shared",g.shared_settings||g):'<div class="muted">Rozwiń pokój, aby ustawić jego parametry.</div>'+ (map?.rooms||[]).filter(r=>selected.has(Number(r.id))).map(r=>'<details class="room-settings"><summary>'+this._esc(r.name)+'</summary>'+this._settingsFields("room_"+r.id,(g.room_settings||{})[String(r.id)]||g.shared_settings||{})+'</details>').join(""))
        )}
        <label class="check"><input type="checkbox" name="enabled" ${g.enabled===false?"":"checked"}><span>Harmonogram aktywny</span></label>
        <div class="actions"><button class="primary" type="submit" ${this._busy?"disabled":""}>${this._editing?"Zapisz zmiany":"Dodaj harmonogram"}</button>${this._editing?'<button type="button" data-action="cancel">Anuluj</button>':""}</div>
      </form>
      <h3>Zapisane harmonogramy (${list.length})</h3>
      ${list.length?list.map(s=>`<div class="item"><div class="itemhead"><div><div class="name">${this._esc(s.name)} ${s.enabled?"":"(wyłączony)"}</div><div class="meta">${this._esc(s.map_name)} · ${this._esc(s.time)} · ${(s.days||[]).map(d=>days[d]).join(", ")}</div><div class="meta">${this._esc((s.segment_names||[]).join(", "))}</div></div></div><div class="actions"><button data-action="run" data-id="${this._esc(s.id)}">Uruchom teraz</button><button data-action="edit" data-id="${this._esc(s.id)}">Edytuj</button><button class="danger" data-action="delete" data-id="${this._esc(s.id)}">Usuń</button></div></div>`).join(""):'<div class="muted">Brak zapisanych harmonogramów.</div>'}
      <div class="status ${this._statusError?"error":""}" role="status">${this._esc(this._status)}</div>
    </ha-card>`;
  }
  _change(e){
    if(e.target.name==="settings_mode"||e.target.name==="cleaning_type"){
      const f=e.target.form,d=new FormData(f),cur=this._editing||this._draft||{};
      const draft={...cur,name:String(d.get("name")||""),map_id:Number(d.get("map_id")),segments:[...f.querySelectorAll('input[name="segments"]:checked')].map(x=>Number(x.value)),days:[...f.querySelectorAll('input[name="days"]:checked')].map(x=>Number(x.value)),time:String(d.get("time")||"07:00"),enabled:f.elements.enabled.checked,cleaning_type:String(d.get("cleaning_type")||"custom"),settings_mode:String(d.get("settings_mode")||"shared"),shared_settings:this._readSettings(d,"shared"),room_settings:this._readRoomSettings(f),cleangenius:String(d.get("cleangenius")||"routine_cleaning"),cleangenius_mode:String(d.get("cleangenius_mode")||"mop_after_vacuum")};
      if(draft.settings_mode==="individual"&&!Object.keys(draft.room_settings).length)for(const id of draft.segments)draft.room_settings[String(id)]={...draft.shared_settings};
      if(this._editing)this._editing=draft;else this._draft=draft;this._render();return;
    }
    if(e.target.name==="map_id"){
      const f=e.target.form,d=new FormData(f);
      this._draft={
        name:String(d.get("name")||""),map_id:Number(e.target.value),
        segments:[...f.querySelectorAll('input[name="segments"]:checked')].map(x=>Number(x.value)),
        days:[...f.querySelectorAll('input[name="days"]:checked')].map(x=>Number(x.value)),
        time:String(d.get("time")||"07:00"),repeats:Number(d.get("repeats")||1),
        suction_level:Number(d.get("suction_level")||1),water_volume:Number(d.get("water_volume")||2),cleaning_type:String(d.get("cleaning_type")||"custom"),cleangenius:String(d.get("cleangenius")||"routine_cleaning"),cleangenius_mode:String(d.get("cleangenius_mode")||"mop_after_vacuum"),settings_mode:String(d.get("settings_mode")||"shared"),shared_settings:this._readSettings(d,"shared"),room_settings:this._readRoomSettings(f),
        enabled:f.elements.enabled.checked
      };
      this._mapId=e.target.value;
      this._draft.segments=[];
      if(this._editing){
        this._editing={...this._editing,...this._draft,map_id:Number(e.target.value),segments:[]};
        this._draft=null;
      }
      this._render();
    }
  }
  async _click(e){const b=e.target.closest("button[data-action]");if(!b)return;const id=b.dataset.id,action=b.dataset.action;
    if(action==="cancel"){this._editing=null;this._draft=null;this._mapId="";this._render();return;}
    const s=this._schedules().find(x=>x.id===id);if(!s)return;
    if(action==="edit"){this._editing={...s};this._draft=null;this._mapId=String(s.map_id);this._render();return;}
    if(action==="delete"&&!window.confirm("Usunąć harmonogram „"+s.name+"”?"))return;
    this._busy=true;this._status=action==="run"?"Uruchamianie…":"Usuwanie…";this._render();
    try{await this._hass.callService("marco_vacuum",action==="run"?"run_schedule":"delete_schedule",{vacuum_entity:this._config.vacuum_entity,schedule_id:id});if(action==="delete"){await this._refreshSensor({deletedId:id});this._status="Harmonogram usunięty.";if(this._editing?.id===id)this._editing=null;}else{this._status="Wysłano polecenie uruchomienia.";}}
    catch(err){this._status="Błąd: "+(err.message||err);}
    finally{this._busy=false;this._render();}
  }
  async _submit(e){
    if(e.target.id!=="schedule-form")return;
    e.preventDefault();
    if(this._busy)return;
    const f=e.target,d=new FormData(f);
    const draft={name:String(d.get("name")||""),map_id:Number(d.get("map_id")),segments:[...f.querySelectorAll('input[name="segments"]:checked')].map(x=>Number(x.value)),days:[...f.querySelectorAll('input[name="days"]:checked')].map(x=>Number(x.value)),time:String(d.get("time")||"07:00"),repeats:Number(d.get("repeats")||1),suction_level:Number(d.get("suction_level")||1),water_volume:Number(d.get("water_volume")||2),cleaning_type:String(d.get("cleaning_type")||"custom"),cleangenius:String(d.get("cleangenius")||"routine_cleaning"),cleangenius_mode:String(d.get("cleangenius_mode")||"mop_after_vacuum"),settings_mode:String(d.get("settings_mode")||"shared"),shared_settings:this._readSettings(d,"shared"),room_settings:this._readRoomSettings(f),enabled:f.elements.enabled.checked};
    this._draft=draft;
    const name=draft.name.trim();
    if(!name){this._status="Wpisz nazwę harmonogramu.";this._statusError=true;this._render();return;}
    if(!draft.segments.length||!draft.days.length){this._status="Wybierz pomieszczenia i co najmniej jeden dzień.";this._statusError=true;this._render();return;}
    const payload={vacuum_entity:this._config.vacuum_entity,name,map_id:draft.map_id,segments:draft.segments,days:draft.days,time:draft.time,enabled:draft.enabled,repeats:draft.repeats,suction_level:draft.suction_level,water_volume:draft.water_volume,cleaning_type:draft.cleaning_type,cleangenius:draft.cleangenius,cleangenius_mode:draft.cleangenius_mode,settings_mode:draft.settings_mode,shared_settings:draft.shared_settings,room_settings:draft.room_settings,schedule_id:this._editing?.id||("schedule-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10))};
    this._busy=true;this._status="Zapisywanie…";this._statusError=false;this._render();
    try{
      await this._hass.callService("marco_vacuum","save_schedule",payload);
      const current=this._sensor||{},attrs=current.attributes||{},map=(attrs.maps||[]).find(x=>Number(x.map_id)===payload.map_id);
      const names=(map?.rooms||[]).filter(x=>payload.segments.includes(Number(x.id))).map(x=>x.name);
      const item={id:payload.schedule_id,name:payload.name,enabled:payload.enabled,map_id:payload.map_id,map_name:map?.name||"",segments:payload.segments,segment_names:names,days:payload.days,time:payload.time,repeats:payload.repeats,suction_level:payload.suction_level,water_volume:payload.water_volume,cleaning_type:payload.cleaning_type,cleangenius:payload.cleangenius,cleangenius_mode:payload.cleangenius_mode,settings_mode:payload.settings_mode,shared_settings:payload.shared_settings,room_settings:payload.room_settings};
      this._pendingSchedules.set(item.id,item);
      this._sensor={...current,attributes:{...attrs,schedules:[...(attrs.schedules||[]).filter(x=>x.id!==item.id),item]}};
      this._signature=JSON.stringify([this._sensor.state,this._sensor.attributes.schedules,this._sensor.attributes.maps]);
      this._editing=null;this._draft=null;this._mapId=String(payload.map_id);this._status="Harmonogram zapisany.";this._statusError=false;this._render();
    }catch(err){this._status="Nie udało się zapisać: "+(err.message||err);this._statusError=true;this._render();}
    finally{this._busy=false;const button=this.shadowRoot.querySelector('button[type="submit"]');if(button)button.disabled=false;}
  }}
if(!customElements.get("marco-vacuum-schedules-card"))customElements.define("marco-vacuum-schedules-card",MarcoVacuumSchedulesCard);
window.customCards=window.customCards||[];if(!window.customCards.some(x=>x.type==="marco-vacuum-schedules-card"))window.customCards.push({type:"marco-vacuum-schedules-card",name:"Marco Vacuum – harmonogramy",description:"Harmonogramy sprzątania wybranych pomieszczeń."});
