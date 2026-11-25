class MarcoVacuumSchedulesCard extends HTMLElement {
  constructor() {
    super(); this.attachShadow({mode:"open"}); this._hass=null; this._config=null;
    this._sensor=null; this._editing=null; this._draft=null; this._busy=false; this._status=""; this._signature=null; this._mapId="";
    this.shadowRoot.addEventListener("click",e=>this._click(e));
    this.shadowRoot.addEventListener("change",e=>this._change(e));
    this.shadowRoot.addEventListener("submit",e=>this._submit(e));
  }
  setConfig(c){if(!c?.vacuum_entity)throw new Error("Podaj vacuum_entity, np. vacuum.marco");this._config=c;this._render();}
  set hass(h){
    this._hass=h;
    const s=Object.values(h.states).find(x=>x.attributes?.vacuum_entity===this._config?.vacuum_entity&&Array.isArray(x.attributes?.schedules));
    if(s)this._sensor=s;
    const sig=JSON.stringify([this._sensor?.state,this._sensor?.attributes?.schedules,this._sensor?.attributes?.maps]);
    if(sig!==this._signature){this._signature=sig;this._render();}
  }
  _a(){return this._sensor?.attributes||{}}
  _esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  _maps(){return this._a().maps||[]}
  _schedules(){return this._a().schedules||[]}
  _render(){
    if(!this._config)return;
    const maps=this._maps(),list=this._schedules(),g=this._editing||this._draft||{};
    const mapId=String(g.map_id??this._mapId??maps[0]?.map_id??"");
    const map=maps.find(x=>String(x.map_id)===mapId)||maps[0], selected=new Set((g.segments||[]).map(Number));
    const days=["Pon","Wt","Śr","Czw","Pt","Sob","Niedz"];
    this.shadowRoot.innerHTML=`<style>
      :host{display:block;color:var(--primary-text-color)}ha-card{padding:16px}h2{font-size:1.2rem;margin:0 0 12px}h3{font-size:1rem;margin:18px 0 8px}
      .muted,.meta{color:var(--secondary-text-color);font-size:.85rem}.field{display:block;margin:10px 0}.field span{display:block;font-size:.84rem;color:var(--secondary-text-color);margin-bottom:5px}
      input,select{box-sizing:border-box;width:100%;min-height:40px;padding:8px 10px;border:1px solid var(--divider-color);border-radius:8px;background:var(--card-background-color);color:var(--primary-text-color);font:inherit}
      .days,.rooms{display:grid;grid-template-columns:repeat(auto-fit,minmax(75px,1fr));gap:7px}.check{display:flex;align-items:center;gap:6px;padding:8px;border:1px solid var(--divider-color);border-radius:8px;font-size:.88rem}.check input{width:auto;min-height:0}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
      button{border:0;border-radius:8px;padding:9px 12px;background:var(--secondary-background-color);color:var(--primary-text-color);font:inherit;cursor:pointer}
      button.primary{background:var(--primary-color);color:var(--text-primary-color,white)}button.danger{color:var(--error-color)}button:disabled{opacity:.5}
      .item{border-top:1px solid var(--divider-color);padding:12px 0}.itemhead{display:flex;justify-content:space-between;gap:10px}.name{font-weight:600}.status{margin-top:10px;color:var(--secondary-text-color);font-size:.88rem}
      @media(max-width:360px){.grid{grid-template-columns:1fr}}
    </style><ha-card><h2>Harmonogramy Marco</h2>
      <div class="muted">Odkurzacz: ${this._esc(this._config.vacuum_entity)}</div>
      <form id="schedule-form">
        <label class="field"><span>Nazwa harmonogramu</span><input name="name" maxlength="80" required value="${this._esc(g.name||"")}" placeholder="np. Parter – codziennie"></label>
        <label class="field"><span>Mapa</span><select name="map_id">${maps.map(m=>`<option value="${m.map_id}" ${String(m.map_id)===mapId?"selected":""}>${this._esc(m.name)}</option>`).join("")}</select></label>
        <h3>Pomieszczenia</h3><div class="rooms">${(map?.rooms||[]).map(r=>`<label class="check"><input type="checkbox" name="segments" value="${r.id}" ${selected.has(Number(r.id))?"checked":""}><span>${this._esc(r.name)}</span></label>`).join("")}</div>
        <h3>Dni tygodnia</h3><div class="days">${days.map((d,i)=>`<label class="check"><input type="checkbox" name="days" value="${i}" ${(g.days||[0,1,2,3,4,5,6]).includes(i)?"checked":""}><span>${d}</span></label>`).join("")}</div>
        <div class="grid">
          <label class="field"><span>Godzina</span><input name="time" type="time" required value="${this._esc(g.time||"07:00")}"></label>
          <label class="field"><span>Liczba przejazdów</span><select name="repeats">${[1,2,3].map(v=>`<option value="${v}" ${Number(g.repeats??1)===v?"selected":""}>${v}</option>`).join("")}</select></label>
          <label class="field"><span>Moc ssania</span><select name="suction_level">${["Cichy","Standardowy","Mocny","Turbo"].map((v,i)=>`<option value="${i}" ${Number(g.suction_level??1)===i?"selected":""}>${v}</option>`).join("")}</select></label>
          <label class="field"><span>Poziom wody</span><select name="water_volume">${["Niski","Średni","Wysoki"].map((v,i)=>`<option value="${i+1}" ${Number(g.water_volume??2)===i+1?"selected":""}>${v}</option>`).join("")}</select></label>
        </div>
        <label class="check"><input type="checkbox" name="enabled" ${g.enabled===false?"":"checked"}><span>Harmonogram aktywny</span></label>
        <div class="actions"><button class="primary" type="submit" ${this._busy?"disabled":""}>${this._editing?"Zapisz zmiany":"Dodaj harmonogram"}</button>${this._editing?'<button type="button" data-action="cancel">Anuluj</button>':""}</div>
      </form>
      <h3>Zapisane harmonogramy (${list.length})</h3>
      ${list.length?list.map(s=>`<div class="item"><div class="itemhead"><div><div class="name">${this._esc(s.name)} ${s.enabled?"":"(wyłączony)"}</div><div class="meta">${this._esc(s.map_name)} · ${this._esc(s.time)} · ${(s.days||[]).map(d=>days[d]).join(", ")}</div><div class="meta">${this._esc((s.segment_names||[]).join(", "))}</div></div></div><div class="actions"><button data-action="run" data-id="${this._esc(s.id)}">Uruchom teraz</button><button data-action="edit" data-id="${this._esc(s.id)}">Edytuj</button><button class="danger" data-action="delete" data-id="${this._esc(s.id)}">Usuń</button></div></div>`).join(""):'<div class="muted">Brak zapisanych harmonogramów.</div>'}
      <div class="status" role="status">${this._esc(this._status)}</div>
    </ha-card>`;
  }
  _change(e){
    if(e.target.name==="map_id"){
      const f=e.target.form,d=new FormData(f);
      this._draft={
        name:String(d.get("name")||""),map_id:Number(e.target.value),
        segments:[...f.querySelectorAll('input[name="segments"]:checked')].map(x=>Number(x.value)),
        days:[...f.querySelectorAll('input[name="days"]:checked')].map(x=>Number(x.value)),
        time:String(d.get("time")||"07:00"),repeats:Number(d.get("repeats")||1),
        suction_level:Number(d.get("suction_level")||0),water_volume:Number(d.get("water_volume")||1),
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
    try{await this._hass.callService("marco_vacuum",action==="run"?"run_schedule":"delete_schedule",{vacuum_entity:this._config.vacuum_entity,schedule_id:id});this._status=action==="run"?"Wysłano polecenie uruchomienia.":"Harmonogram usunięty.";if(action==="delete"&&this._editing?.id===id)this._editing=null;}
    catch(err){this._status="Błąd: "+(err.message||err);}
    finally{this._busy=false;this._render();}
  }
  async _submit(e){if(e.target.id!=="schedule-form")return;e.preventDefault();if(this._busy)return;const f=e.target,d=new FormData(f);
    const segments=[...f.querySelectorAll('input[name="segments"]:checked')].map(x=>Number(x.value)),days=[...f.querySelectorAll('input[name="days"]:checked')].map(x=>Number(x.value));
    if(!segments.length||!days.length){this._status="Wybierz pomieszczenia i co najmniej jeden dzień.";this._render();return;}
    const payload={vacuum_entity:this._config.vacuum_entity,name:String(d.get("name")).trim(),map_id:Number(d.get("map_id")),segments,days,time:String(d.get("time")),enabled:f.elements.enabled.checked,repeats:Number(d.get("repeats")),suction_level:Number(d.get("suction_level")),water_volume:Number(d.get("water_volume")),...(this._editing?{schedule_id:this._editing.id}:{})};
    this._busy=true;this._status="Zapisywanie…";this._render();
    try{await this._hass.callService("marco_vacuum","save_schedule",payload);this._editing=null;this._draft=null;this._mapId=String(payload.map_id);this._status="Harmonogram zapisany.";}
    catch(err){this._status="Nie udało się zapisać: "+(err.message||err);}
    finally{this._busy=false;this._render();}
  }
}
if(!customElements.get("marco-vacuum-schedules-card"))customElements.define("marco-vacuum-schedules-card",MarcoVacuumSchedulesCard);
window.customCards=window.customCards||[];if(!window.customCards.some(x=>x.type==="marco-vacuum-schedules-card"))window.customCards.push({type:"marco-vacuum-schedules-card",name:"Marco Vacuum – harmonogramy",description:"Harmonogramy sprzątania wybranych pomieszczeń."});
