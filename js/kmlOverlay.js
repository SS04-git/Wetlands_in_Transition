const KML_NS = 'http://www.opengis.net/kml/2.2';
const WIDTH = 839, HEIGHT = 653;

export const OBSERVATIONS = [
  '2025_02_25','2024_02_17','2022_05_07','2022_03_30','2022_02_03','2021_05_01',
  '2020_12_23','2020_01_03','2019_11_26','2019_01_31','2018_11_12','2017_12_08',
  '2016_01_01','2015_03_11','2014_02_24','2013_02_02','2011_04_11'
].map(id => ({ id, local: id === '2011_04_11' || id === '2025_02_25' }));

export const LAYERS = [
  // Bright class palette designed for the dark, quiet map cards.
  { key:'water',color:'#61D7F1',fill:.43 }, { key:'muddy_shallows',color:'#91ABB3',fill:.48 },
  { key:'bed_ground',color:'#F2D8A4',fill:.48 }, { key:'mangrove_canopy',color:'#51B777',fill:.56 },
  { key:'tree_cover',color:'#B9DE72',fill:.52 }, { key:'track',color:'#EE896D',fill:.64 },
  { key:'land_edge',color:'#E5B35C',fill:0 }, { key:'buildings',color:'#B8C2D0',fill:.94 },
  { key:'cage_farms',color:'#FF545D',fill:.94 }, { key:'boats',match:'boat',color:'#FFD065',fill:.95 }
];

const descendants=(node,name)=>[...node.getElementsByTagNameNS(KML_NS,name)];
const childText=(node,name)=>descendants(node,name)[0]?.textContent?.trim()||'';
function parseCoordinates(text){return text.trim().split(/\s+/).map(pair=>{const [lon,lat]=pair.split(',').map(Number);return{lon,lat};}).filter(p=>Number.isFinite(p.lon)&&Number.isFinite(p.lat));}
function categoryOf(name){const n=name.toLowerCase();return LAYERS.find(layer=>n.includes(layer.match||layer.key))?.key||null;}
function collectFeatures(doc){
  const out=[];
  for(const placemark of descendants(doc,'Placemark')){
    const category=categoryOf(childText(placemark,'name')); if(!category) continue;
    for(const polygon of descendants(placemark,'Polygon')){const rings=descendants(polygon,'LinearRing').map(r=>parseCoordinates(childText(r,'coordinates'))).filter(r=>r.length>2);if(rings.length)out.push({category,type:'polygon',rings});}
    for(const line of descendants(placemark,'LineString')){const points=parseCoordinates(childText(line,'coordinates'));if(points.length>1)out.push({category,type:'line',points});}
    for(const point of descendants(placemark,'Point')){const points=parseCoordinates(childText(point,'coordinates'));if(points.length)out.push({category,type:'point',points:points.slice(0,1)});}
  }
  return out;
}
function svgEl(tag,attrs={}){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el;}
function projectedBounds(features){
  const pts=features.flatMap(f=>f.type==='polygon'?f.rings.flat():f.points),lat0=pts.reduce((sum,p)=>sum+p.lat,0)/pts.length*Math.PI/180;
  const project=p=>({x:p.lon*Math.cos(lat0),y:p.lat});
  const projected=pts.map(project),minX=Math.min(...projected.map(p=>p.x)),maxX=Math.max(...projected.map(p=>p.x)),minY=Math.min(...projected.map(p=>p.y)),maxY=Math.max(...projected.map(p=>p.y));
  const padX=(maxX-minX)*.035,padY=(maxY-minY)*.035;
  return {lat0,minX:minX-padX,maxX:maxX+padX,minY:minY-padY,maxY:maxY+padY};
}
function addFeature(group,f,style,b){
  const scale=Math.min(WIDTH/(b.maxX-b.minX),HEIGHT/(b.maxY-b.minY))*.97;
  const x=p=>WIDTH/2+(p.lon*Math.cos(b.lat0)-(b.minX+b.maxX)/2)*scale;
  const y=p=>HEIGHT/2-((p.lat-(b.minY+b.maxY)/2)*scale);
  if(f.type==='point'){for(const p of f.points)group.append(svgEl('circle',{class:`feature-point class-${f.category}`,cx:x(p),cy:y(p),r:f.category==='boats'||f.category==='cage_farms'?3.4:2.7,fill:style.color,opacity:1,'data-geometry':'point'}));return;}
  const rings=f.type==='polygon'?f.rings:[f.points];const d=rings.map(r=>r.map((p,i)=>`${i?'L':'M'}${x(p).toFixed(2)},${y(p).toFixed(2)}`).join(' ')+(f.type==='polygon'?' Z':'')).join(' ');
  group.append(svgEl('path',{class:`feature-path class-${f.category}`,d,fill:f.type==='polygon'?style.color:'none','fill-opacity':f.type==='polygon'?style.fill:0,stroke:style.color,'stroke-width':f.category==='land_edge'?1.55:1.05,'fill-rule':'evenodd','data-geometry':f.type,'data-fill':style.fill}));
}
async function loadObservation(obs){
  const dir=`assets/sat_images_kml/${obs.id}/`, base=obs.id;
  const names=[`${base}.kml`,...(obs.local?[`${base}_local_elements.kml`]:[])];
  const docs=await Promise.all(names.map(async name=>{const res=await fetch(dir+name);if(!res.ok)throw new Error(`Could not load ${dir+name}`);return new DOMParser().parseFromString(await res.text(),'application/xml');}));
  const features=docs.flatMap(collectFeatures);if(!features.length)throw new Error(`No mapped KML features for ${base}`);
  return {id:base,image:`${dir}${base}.png`,features};
}
function buildObservation(obs,bounds){
  const {features}=obs, svg=svgEl('svg',{class:'date-vector','viewBox':`0 0 ${WIDTH} ${HEIGHT}`,'preserveAspectRatio':'xMidYMid meet','aria-hidden':'true'});
  const groups=[];
  for(const style of LAYERS){const element=svgEl('g',{class:'kml-layer','data-layer':style.key});for(const f of features)if(f.category===style.key)addFeature(element,f,style,bounds);if(element.childElementCount){svg.append(element);groups.push({element,style});}}
  return {...obs,svg,groups};
}
export async function loadObservations(){
  const raw=await Promise.all(OBSERVATIONS.map(loadObservation));
  const allFeatures=raw.flatMap(item=>item.features),bounds=projectedBounds(allFeatures);
  return raw.map(item=>buildObservation(item,bounds));
}
