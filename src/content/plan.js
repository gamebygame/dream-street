import {CONFIG, OUTFITS} from '../config.js';

/** @typedef {{id:string, beat:number, outfit:string, hit?:number}} Product */

export const FOUR_HITS = Object.freeze([50,52,54,56]);
/** @type {ReadonlyArray<Product>} */
export const PRODUCTS = Object.freeze([
  {id:'flow-1',beat:18.2,outfit:'jacket'},
  {id:'flow-2',beat:25.1,outfit:'sport'},
  {id:'flow-3',beat:32.4,outfit:'coat'},
  {id:'flow-4',beat:39.7,outfit:'open'},
  {id:'flow-5',beat:45.6,outfit:'coat'},
  ...['jacket','sport','coat','open'].map((outfit,i)=>({id:`four-${i+1}`,beat:FOUR_HITS[i]-CONFIG.contactLead,outfit,hit:FOUR_HITS[i]})),
]);

export const BLOCKS = Object.freeze([
  {id:'office-b',start:-4,end:16,kind:'office',label:'LE JOUR'},
  {id:'fashion-a',start:16,end:30,kind:'fashion',label:'atelier 04',palette:0},
  {id:'fashion-b',start:30,end:35,kind:'fashion',label:'formes',palette:1},
  {id:'wall-gap',start:35,end:36.5,kind:'wall'},
  {id:'fashion-c',start:36.5,end:48,kind:'fashion',label:'LES PASSANTS',palette:2},
  {id:'four-hit',start:48,end:60,kind:'fashion',label:'QUATRE',palette:3,hero:true},
  {id:'office-c',start:60,end:76,kind:'office',label:'MAISON DU JOUR'},
]);

export const mod = (x,n)=>((x%n)+n)%n;
export function phaseAt(beat){
  const b=mod(beat,CONFIG.cycleBeats);
  return b<16?'一个人，两种神态':b<48?'路过一些新衣服':b<60?'四个舞步':b<64?'继续向前': '还是他，仍然跳着舞';
}

/** Enumerate a half-open interval; event identity belongs to a physical street instance. */
export function contactsBetween(from,to){
  if(to<=from) return [];
  const result=[];
  for(let cycle=Math.max(0,Math.floor(from/80));cycle<=Math.floor(to/80);cycle++){
    for(const product of PRODUCTS){
      const beat=cycle*80+product.beat;
      if(beat>from && beat<=to) result.push({...product,beat,id:`${cycle}:${product.id}`,cycle});
    }
  }
  return result;
}

/** Reconstruct from authored data, including seeks, without replaying the full history. */
export function wardrobeAt(beat){
  const cycle=Math.max(0,Math.floor(beat/80));
  const b=mod(Math.max(0,beat),80);
  let product=null;
  for(const p of PRODUCTS) if(p.beat<=b) product=p;
  if(!product) return {outfit:'old',lastContact:null,returnBeat:null};
  const recovery=Math.ceil((product.beat+CONFIG.wardrobeGrace)/2)*2;
  const returned=b>=recovery;
  return {outfit:returned?'old':product.outfit,lastContact:cycle*80+product.beat,returnBeat:cycle*80+recovery};
}

export function sampleScene(beat){
  const wardrobe=wardrobeAt(beat);
  const travelS=Math.max(0,beat)*CONFIG.distancePerBeat;
  return {beat,travelS,walkerAnchorS:travelS,reflectionAnchorS:travelS,wardrobe,
    cycle:Math.floor(beat/80),localBeat:mod(beat,80),phase:phaseAt(beat)};
}

/** Fixed-camera ray / facade-plane intersection, not a world-z proximity guess. */
export function projectToGlass(point,viewDirection,facadeX=CONFIG.facadeX){
  if(Math.abs(viewDirection.x)<1e-8) throw new Error('Camera is parallel to the glass.');
  const t=(facadeX-point.x)/viewDirection.x;
  return {x:facadeX,y:point.y+t*viewDirection.y,z:point.z+t*viewDirection.z};
}

export function displayPosition(contactS,depth,viewDirection){
  return {x:CONFIG.facadeX+depth,
    y:CONFIG.reflectionFloor+depth*viewDirection.y/viewDirection.x,
    z:contactS+depth*viewDirection.z/viewDirection.x};
}

export function validatePlan(){
  const ids=new Set(); let previous=-Infinity;
  for(const p of PRODUCTS){
    if(ids.has(p.id)||p.beat<=previous||!OUTFITS[p.outfit]) throw new Error(`Invalid product ${p.id}`);
    if(p.hit!==undefined && p.beat>=p.hit) throw new Error('Contact must precede its hit.');
    if(!BLOCKS.some(b=>b.kind==='fashion' && p.beat>b.start && p.beat<b.end)) throw new Error(`Product outside glass: ${p.id}`);
    ids.add(p.id);previous=p.beat;
  }
  for(const product of PRODUCTS.filter(p=>p.hit)){
    if(wardrobeAt(product.beat-.001).outfit===product.outfit)throw new Error(`Four-hit contact has no visible change: ${product.id}`);
  }
  return true;
}

export class ContactTracker{
  constructor(beat=0){this.previous=beat;this.total=0;this.recent=[];}
  seek(beat){this.previous=beat;this.recent=[];}
  advance(beat){
    if(beat<this.previous){this.seek(beat);return [];}
    const crossed=contactsBetween(this.previous,beat);
    this.previous=beat; this.total+=crossed.length;
    this.recent=[...this.recent,...crossed].filter(e=>e.beat>=beat-80).slice(-18);
    return crossed;
  }
}
