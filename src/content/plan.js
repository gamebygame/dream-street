import {CONFIG, OUTFITS} from '../config.js';

export const mod = (x,n)=>((x%n)+n)%n;
export const smooth = t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export const FOUR_HITS = Object.freeze([50,52,54,56]);
export const ACCESSORIES = Object.freeze(['scarf','watch','puppet','cup','record','cane','bouquet','rose','umbrella']);
export const THEMES = Object.freeze([
  {id:'daylight',title:'电光 · 脚步里的火花',start:0,end:80},
  {id:'pocket',title:'同行 · 把节奏传下去',start:80,end:144},
  {id:'lyric',title:'花间 · 稍微温柔一些',start:144,end:208},
  {id:'parade',title:'游乐 · 带一点好奇',start:208,end:256},
]);
export const CROSSROADS = Object.freeze([{start:76,end:88,id:'arrive'},{start:128,end:144,id:'farewell'}]);
export const PRODUCTS = Object.freeze([
  {id:'flow-1',beat:18.2,outfit:'jacket'}, {id:'flow-2',beat:25.1,outfit:'sport'},
  {id:'record-1',beat:32.4,accessory:'record'}, {id:'time-1',beat:39.7,accessory:'watch'},
  {id:'flow-5',beat:45.6,outfit:'coat',accessory:'cane'},
  ...['jacket','sport','coat','open'].map((outfit,i)=>({id:'four-'+(i+1),beat:FOUR_HITS[i]-CONFIG.contactLead,outfit,hit:FOUR_HITS[i]})),
  {id:'gateway',beat:74.2,outfit:'jacket',accessory:'record'},
  {id:'pocket-1',beat:91.1,outfit:'sport'}, {id:'pocket-2',beat:100.2,outfit:'jacket'},
  {id:'pocket-record',beat:109.3,accessory:'record'}, {id:'pocket-cane',beat:118.7,accessory:'cane'},
  {id:'flower-1',beat:146.4,outfit:'coat',accessory:'bouquet'}, {id:'rose-1',beat:154.3,accessory:'rose'},
  {id:'parasol-1',beat:165.1,accessory:'umbrella'}, {id:'lyric-coat',beat:179.6,outfit:'open'},
  {id:'flower-2',beat:187.2,accessory:'bouquet'},
  {id:'toy-1',beat:211.4,accessory:'puppet'}, {id:'day-1',beat:220.7,outfit:'jacket'},
  {id:'coffee-1',beat:230.2,accessory:'cup'}, {id:'umbrella-2',beat:242.1,accessory:'umbrella'},
  {id:'day-2',beat:250.4,outfit:'open'},
]);
export const BLOCKS = Object.freeze([
  {id:'office-a',start:0,end:16,kind:'office',label:'LE JOUR'},
  {id:'fashion-a',start:16,end:28,kind:'fashion',label:'atelier 04',palette:0},
  {id:'records-a',start:28,end:35,kind:'records',label:'VINYL & SOUL',palette:0},
  {id:'wall-gap',start:35,end:36.5,kind:'wall'},
  {id:'time-a',start:36.5,end:44,kind:'clocks',label:'HEURES HEUREUSES',palette:1},
  {id:'antiques-a',start:44,end:48,kind:'antiques',label:'OBJETS D’HIER',palette:2},
  {id:'four-hit',start:48,end:60,kind:'fashion',label:'QUATRE',palette:3,hero:true},
  {id:'office-b',start:60,end:72,kind:'office',label:'MAISON DU JOUR'},
  {id:'gateway',start:72,end:76,kind:'records',label:'SIDE A',palette:0,theme:'pocket'},
  {id:'streetwear',start:88,end:106,kind:'fashion',label:'COMMON GROUND',palette:0,theme:'pocket'},
  {id:'records-gifts',start:106,end:114,kind:'records',label:'SIDE B · RECORDS',palette:3,theme:'pocket'},
  {id:'antiques-b',start:114,end:122,kind:'antiques',label:'SECOND HAND',palette:1,theme:'pocket'},
  {id:'office-c',start:122,end:128,kind:'office',label:'PASSAGE'},
  {id:'flowers-a',start:144,end:160,kind:'flowers',label:'LES FLEURS',palette:2,theme:'lyric'},
  {id:'antiques-c',start:160,end:174,kind:'antiques',label:'OMBRES & SOIE',palette:1,theme:'lyric'},
  {id:'fashion-c',start:174,end:184,kind:'fashion',label:'UN DIMANCHE',palette:3,theme:'lyric'},
  {id:'flowers-b',start:184,end:194,kind:'flowers',label:'JARDIN DE POCHE',palette:2,theme:'lyric'},
  {id:'garden-wall',start:194,end:199,kind:'wall'},
  {id:'office-d',start:199,end:208,kind:'office',label:'AU GRAND AIR'},
  {id:'toys-a',start:208,end:218,kind:'toys',label:'LA PETITE PARADE',palette:2,theme:'parade'},
  {id:'fashion-d',start:218,end:226,kind:'fashion',label:'LES PASSANTS',palette:3,theme:'parade'},
  {id:'snacks-a',start:226,end:236,kind:'snacks',label:'CAFÉ DU COIN',palette:0,theme:'parade'},
  {id:'gifts-c',start:236,end:246,kind:'gifts',label:'PETITES MERVEILLES',palette:2,theme:'parade'},
  {id:'fashion-e',start:246,end:256,kind:'fashion',label:'À DEMAIN',palette:3,theme:'parade'},
]);
export function themeAt(beat){
  const b=mod(Math.max(0,beat),CONFIG.cycleBeats);
  return THEMES.find(t=>b>=t.start&&b<t.end);
}
/** Performance chapters overlap; the full reference recording does not restart at these gateways. */
export function themeWeightsAt(beat){
  const b=mod(beat,256),theme=themeAt(beat);
  if(b>=252||b<4&&beat>=256){
    const t=smooth((b>=252?b-252:b+4)/8);
    return [{id:'parade',weight:1-t},{id:'daylight',weight:t}];
  }
  for(const boundary of [80,144,208]){
    if(b>=boundary-4&&b<boundary+4){
      const t=smooth((b-boundary+4)/8);
      return [{id:themeAt(boundary-.01).id,weight:1-t},{id:themeAt(boundary).id,weight:t}];
    }
  }
  return [{id:theme.id,weight:1}];
}
export function crowdPhaseAt(beat){
  const b=mod(beat,CONFIG.cycleBeats);
  return b<64||b>=168?'alone':b<108?'arrive':b<130?'travel':'depart';
}
export function phaseAt(beat){
  const b=mod(beat,CONFIG.cycleBeats),crowd=crowdPhaseAt(beat);
  if(crowd==='arrive')return '有人也听见了';
  if(crowd==='travel')return '各有各的步子，一起向前';
  if(crowd==='depart')return '在下一个路口，各自继续';
  return b<16?'旧大衣里，也装得下舞步':b<48?'路过一些小小的可能':b<60?'四个舞步':
    b<72?'还是他，仍然跳着舞':b<208?'花间 · 稍微温柔一些':'游乐 · 带一点好奇';
}
/** Event IDs belong to street instances, never to frame rate or dance limbs. */
export function contactsBetween(from,to){
  if(to<=from)return [];
  const result=[];
  for(let cycle=Math.max(0,Math.floor(from/CONFIG.cycleBeats));cycle<=Math.floor(to/CONFIG.cycleBeats);cycle++){
    for(const p of PRODUCTS){
      const beat=cycle*CONFIG.cycleBeats+p.beat;
      if(beat>from&&beat<=to)result.push({...p,beat,id:cycle+':'+p.id,cycle,hit:p.hit===undefined?undefined:cycle*CONFIG.cycleBeats+p.hit});
    }
  }
  return result;
}
function accessoryWeightsAt(state,beat){
  const progress=smooth((beat-state.accessoryBeat)/.8),weights={};
  for(const id of ACCESSORIES)weights[id]=(state.fromAccessoryWeights[id]||0)*(1-progress)+(state.accessories.includes(id)?progress:0);
  return weights;
}
function changeAccessories(state,next,beat){
  if(state.accessories.join(',')===next.join(','))return;
  for(const id of next)if(!state.accessories.includes(id))state.accessoryStarts[id]=beat;
  state.fromAccessoryWeights=accessoryWeightsAt(state,beat);state.fromAccessories=state.accessories;state.accessories=next;state.accessoryBeat=beat;
}
function layersAt(state,beat){
  const edge=smooth((beat-state.changeBeat)/state.transitionBeats);
  return [...(edge>0?[{id:state.outfit,from:0,to:edge}]:[]),
    ...state.fromLayers.filter(layer=>layer.to>edge).map(layer=>({...layer,from:Math.max(edge,layer.from)}))];
}
function changeOutfit(state,next,beat,duration){
  state.fromLayers=layersAt(state,beat);state.fromOutfit=state.outfit;state.outfit=next;
  state.changeBeat=beat;state.transitionBeats=duration;
}
function settle(state,until){
  if(state.lastContact===null)return;
  const recovery=Math.ceil((state.lastContact+CONFIG.wardrobeGrace)/2)*2;
  if(until>=recovery&&state.outfit!=='old'){
    changeOutfit(state,'old',recovery,2.2);
  }
  if(until>=recovery)changeAccessories(state,[],recovery);
  state.returnBeat=recovery;
}
/** Adjacent windows suffice for seeks; a loop boundary never resets valid clothing. */
export function wardrobeAt(beat){
  beat=Math.max(0,beat);
  const state={outfit:'old',fromOutfit:'old',fromLayers:[{id:'old',from:0,to:1}],lastContact:null,returnBeat:null,changeBeat:-Infinity,transitionBeats:1,accessories:[],fromAccessories:[],fromAccessoryWeights:{},accessoryStarts:{},accessoryBeat:-Infinity};
  const start=Math.max(0,Math.floor(beat/CONFIG.cycleBeats)-1)*CONFIG.cycleBeats;
  for(const p of contactsBetween(start-1e-6,beat)){
    settle(state,p.beat);
    if(p.outfit&&p.outfit!==state.outfit){
      changeOutfit(state,p.outfit,p.beat,p.hit===undefined?1.8:1.15);
      if(p.outfit==='sport'||p.outfit==='open')changeAccessories(state,state.accessories.filter(a=>a!=='scarf'),p.beat);
    }
    if(p.accessory){
      const next=[p.accessory];
      changeAccessories(state,next,p.beat);
    }
    state.lastContact=p.beat;
  }
  settle(state,beat);
  state.progress=smooth((beat-state.changeBeat)/state.transitionBeats);
  state.transitionAge=beat-state.changeBeat;
  state.layers=layersAt(state,beat);
  state.weights={};for(const layer of state.layers)state.weights[layer.id]=(state.weights[layer.id]||0)+layer.to-layer.from;
  state.accessoryProgress=smooth((beat-state.accessoryBeat)/.8);
  state.accessoryWeights=accessoryWeightsAt(state,beat);
  return state;
}
export function sampleScene(beat){
  const travelS=Math.max(0,beat)*CONFIG.distancePerBeat;
  return {beat,travelS,walkerAnchorS:travelS,reflectionAnchorS:travelS,wardrobe:wardrobeAt(beat),
    cycle:Math.floor(beat/CONFIG.cycleBeats),localBeat:mod(beat,CONFIG.cycleBeats),phase:phaseAt(beat),
    theme:themeAt(beat).id,crowdPhase:crowdPhaseAt(beat)};
}
export function projectToGlass(point,viewDirection,facadeX=CONFIG.facadeX){
  if(Math.abs(viewDirection.x)<1e-8)throw new Error('Camera is parallel to the glass.');
  const t=(facadeX-point.x)/viewDirection.x;
  return {x:facadeX,y:point.y+t*viewDirection.y,z:point.z+t*viewDirection.z};
}
export function displayPosition(contactS,depth,viewDirection){
  return {x:CONFIG.facadeX+depth,y:CONFIG.reflectionFloor+depth*viewDirection.y/viewDirection.x,
    z:contactS+depth*viewDirection.z/viewDirection.x};
}
export function validatePlan(){
  const ids=new Set();let previous=-Infinity;
  for(const p of PRODUCTS){
    if(ids.has(p.id)||p.beat<=previous||p.outfit&&!OUTFITS[p.outfit]||p.accessory&&!ACCESSORIES.includes(p.accessory))throw new Error('Invalid product '+p.id);
    if(p.hit!==undefined&&p.beat>=p.hit)throw new Error('Contact must precede its hit.');
    if(!BLOCKS.some(b=>!['office','wall'].includes(b.kind)&&p.beat>b.start&&p.beat<b.end))throw new Error('Product outside glass: '+p.id);
    if(p.hit&&wardrobeAt(p.beat-.001).outfit===p.outfit)throw new Error('Four-hit contact has no visible change');
    ids.add(p.id);previous=p.beat;
  }
  if(new Set(BLOCKS.filter(b=>b.kind!=='wall').map(b=>b.kind)).size!==9)throw new Error('Nine storefront types required');
  return true;
}
export class ContactTracker{
  constructor(beat=0){this.previous=beat;this.total=0;this.recent=[];}
  seek(beat){this.previous=beat;this.recent=[];}
  advance(beat){
    if(beat<this.previous){this.seek(beat);return [];}
    const crossed=contactsBetween(this.previous,beat);this.previous=beat;this.total+=crossed.length;
    this.recent=[...this.recent,...crossed].filter(e=>e.beat>=beat-CONFIG.cycleBeats).slice(-32);
    return crossed;
  }
}
