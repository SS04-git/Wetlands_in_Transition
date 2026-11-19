import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { loadObservations } from './kmlOverlay.js';

const TARGET = { lat: 13.6391, lon: 74.6923 };
const canvas = document.querySelector('#globe');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, .001, 100);
camera.position.set(0, 0, 3.6);
const globe = new THREE.Group();
scene.add(globe);

scene.add(new THREE.HemisphereLight(0xdce8ff, 0x17243a, 1.15));
const sunLight = new THREE.DirectionalLight(0xffffff, 2.2);
sunLight.position.set(-3, 2.5, 4);
scene.add(sunLight);
new GLTFLoader().load('assets/earth.opt.glb', ({ scene: earth }) => {
  // The GLB sphere is centered at the origin and its mesh node has a 1.1276 scale.
  // Counter that scale so the Earth stays aligned with the existing unit-radius cloud shells.
  earth.scale.setScalar(1 / 1.1276455);
  globe.add(earth);
}, undefined, error => console.error('Earth model could not be loaded:', error));

// Multiple transparent cloud shells create depth as the camera enters the atmosphere.
const cloudLayers=[];
for(let i=0;i<5;i++){
  const material=new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,side:THREE.FrontSide,
    uniforms:{uOpacity:{value:0},uLayer:{value:[.44,.52,.58,.49,.4][i]},uThreshold:{value:.49+i*.035},uOffset:{value:new THREE.Vector2()}},
    vertexShader:'varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform float uOpacity; uniform float uLayer; uniform float uThreshold; uniform vec2 uOffset; varying vec3 vP;
      float hash3(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=mix(hash3(i),hash3(i+vec3(1.,0.,0.)),f.x);float b=mix(hash3(i+vec3(0.,1.,0.)),hash3(i+vec3(1.,1.,0.)),f.x);float c=mix(hash3(i+vec3(0.,0.,1.)),hash3(i+vec3(1.,0.,1.)),f.x);float d=mix(hash3(i+vec3(0.,1.,1.)),hash3(i+vec3(1.,1.,1.)),f.x);return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);}
      float fbm3(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=noise3(p)*a;p*=2.03;a*=.5;}return v/.9375;}
      void main(){vec3 p=normalize(vP)*vec3(20.,10.,20.);p.x+=uOffset.x;p.z+=uOffset.y;float broad=fbm3(p);float detail=fbm3(p*2.2+vec3(17.,5.,11.));float field=mix(broad,detail,.24);float body=smoothstep(uThreshold,uThreshold+.16,field);float wisp=smoothstep(uThreshold-.09,uThreshold+.13,field);float cloud=mix(body,wisp,.25);float alpha=cloud*uOpacity*uLayer;gl_FragColor=vec4(mix(vec3(.54,.66,.82),vec3(.98,.99,1.),cloud),alpha);}`
  });
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(1.012+i*.006,96,96),material);
  mesh.renderOrder=10+i;
  globe.add(mesh);
  cloudLayers.push(mesh);
}

// A radial, camera-facing glow fades softly into space instead of forming a hard ring.
const haloCanvas=document.createElement('canvas'); haloCanvas.width=haloCanvas.height=256;
const haloContext=haloCanvas.getContext('2d');
const haloGradient=haloContext.createRadialGradient(128,128,72,128,128,128);
haloGradient.addColorStop(0,'rgba(100,145,255,0)');
haloGradient.addColorStop(.42,'rgba(100,145,255,0)');
haloGradient.addColorStop(.61,'rgba(100,145,255,0.12)');
haloGradient.addColorStop(.76,'rgba(100,145,255,0.07)');
haloGradient.addColorStop(1,'rgba(100,145,255,0)');
haloContext.fillStyle=haloGradient; haloContext.fillRect(0,0,256,256);
const haloTexture=new THREE.CanvasTexture(haloCanvas);
const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:haloTexture,color:0xabc5ff,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:.9}));
halo.scale.set(2.8,2.8,1); halo.position.z=-.12; globe.add(halo);

const starCount=900, stars=new Float32Array(starCount*3), starColors=new Float32Array(starCount*3);
for(let i=0;i<starCount;i++){
  const a=Math.random()*Math.PI*2, z=Math.random()*2-1, r=11+Math.random()*14, s=Math.sqrt(1-z*z);
  stars[i*3]=r*s*Math.cos(a); stars[i*3+1]=r*z; stars[i*3+2]=r*s*Math.sin(a);
  const tint=Math.random();
  starColors[i*3]=.86+tint*.14; starColors[i*3+1]=.89+tint*.11; starColors[i*3+2]=.96+tint*.04;
}
const starGeometry=new THREE.BufferGeometry();
starGeometry.setAttribute('position',new THREE.BufferAttribute(stars,3));
starGeometry.setAttribute('color',new THREE.BufferAttribute(starColors,3));
scene.add(new THREE.Points(starGeometry,new THREE.PointsMaterial({vertexColors:true,size:.034,sizeAttenuation:true,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false})));

function resize(){ renderer.setSize(innerWidth,innerHeight,false); camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize',resize); resize();

const vectorAt=(lat,lon)=>{const phi=(90-lat)*Math.PI/180,theta=(lon+180)*Math.PI/180;return new THREE.Vector3(-Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));};
const targetNormal=vectorAt(TARGET.lat,TARGET.lon);
const targetNorth=vectorAt(TARGET.lat+.01,TARGET.lon).sub(targetNormal.clone().multiplyScalar(vectorAt(TARGET.lat+.01,TARGET.lon).dot(targetNormal))).normalize();
const targetEast=new THREE.Vector3().crossVectors(targetNorth,targetNormal).normalize();
const localFrame=new THREE.Matrix4().makeBasis(targetEast,targetNorth,targetNormal);
const targetOrientation=new THREE.Quaternion().setFromRotationMatrix(localFrame).invert();
const startOrientation=new THREE.Quaternion();
const interpolated=new THREE.Quaternion(), spin=new THREE.Quaternion();
const spinAxis=new THREE.Vector3(0,1,0);
let landingTarget=0,zoomTarget=0;
const ZOOM_SCROLL_VIEWPORTS=1.7;
let flightStarted=false;
function updateScroll(){
  const vh=Math.max(1,innerHeight);
  landingTarget=THREE.MathUtils.clamp(scrollY/vh,0,1);
  zoomTarget=THREE.MathUtils.clamp((scrollY-vh)/(vh*ZOOM_SCROLL_VIEWPORTS),0,1);
  if(scrollY>8&&!flightStarted){ startOrientation.copy(globe.quaternion); flightStarted=true; }
  if(scrollY===0) flightStarted=false;
}
addEventListener('scroll',updateScroll,{passive:true});
updateScroll();
let previous=performance.now();
let landingMotion=0,zoomMotion=0;
const mapPlate=document.querySelector('#map-plate');
const historyBackdrop=document.querySelector('#history-backdrop');
const videoDimmer=document.querySelector('#video-dimmer');
const videoStop=document.querySelector('.video-stop');
const mist=document.querySelector('#mist');
const mistLayers=[...mist.querySelectorAll('.mist-layer')];
const timelineSection=document.querySelector('#timeline-section');
const timelineTrack=document.querySelector('#timeline-track');
const timelineDateTrack=document.querySelector('#timeline-date-track');
const mapOptionsGrid=document.querySelector('#map-options-grid');
const mapViewer=document.querySelector('#map-viewer');
const mapViewerTitle=document.querySelector('#map-viewer-title');
const mapViewerImage=document.querySelector('#map-viewer-image');
const mapViewerSource=document.querySelector('#map-viewer-source');
document.querySelector('#map-viewer-close').addEventListener('click',()=>mapViewer.close());
const MAP_OPTIONS=[
  {number:1,title:'The Estuary as a Landscape',layers:['water','muddy_shallows','bed_ground','land_edge','mangrove_canopy']},
  {number:2,title:'Patterns of Wetness and Vegetation',layers:['water','muddy_shallows','mangrove_canopy','tree_cover']},
  {number:3,title:'The Estuary Through Time',compare:['2011_04_11','2025_02_25'],layers:['water','land_edge','mangrove_canopy']},
  {number:4,title:'The Estuary as a Lived Landscape',layers:['land_edge','boats','cage_farms','buildings','track','tree_cover']},
  {number:5,title:'The Estuary Between Plan and Ground',layers:['water','muddy_shallows','bed_ground','mangrove_canopy','land_edge','boats','cage_farms']},
  {number:6,title:'The Estuary and the Monsoon',compare:['2022_05_07','2025_02_25'],layers:['water','muddy_shallows','bed_ground','mangrove_canopy']},
  {number:7,title:'Cyclones and Storms',layers:['water','muddy_shallows','land_edge'],motif:'storm'}
];
let backdropRevealStarted=false,videoMuted=false,videoPlaying=false,timelineVisible=false;
function showTimeline(visible){
  if(visible===timelineVisible)return;
  timelineVisible=visible;
  gsap.killTweensOf(timelineSection);
  if(visible){timelineSection.style.visibility='visible';gsap.to(timelineSection,{opacity:1,duration:.45,ease:'power1.out'});}
  else{timelineSection.style.opacity='0';timelineSection.style.visibility='hidden';}
}
function revealTimelineOnScroll(){
  if(!videoMuted)return;
  const trigger=ScrollTrigger.getById('atlas-horizontal');
  if(trigger)showTimeline(scrollY>trigger.start+2);
}
addEventListener('scroll',revealTimelineOnScroll,{passive:true});
MAP_OPTIONS.forEach(({number,title})=>{
  const name=`Map ${number} - ${title}.png`;
  const src=`assets/maps/${number}/${encodeURIComponent(name)}`;
  const card=document.createElement('article');
  card.className=`map-option${number===5?' map-option--featured':''}`;
  card.dataset.mapNumber=String(number);
  const preview=document.createElement(number===5?'div':'button');preview.className='map-option-preview';
  if(number!==5)preview.type='button';
  else{preview.setAttribute('role','button');preview.tabIndex=0;}
  const openPreview=()=>{
    mapViewerTitle.textContent=`MAP ${String(number).padStart(2,'0')} / ${title}`;
    mapViewerImage.src=src;mapViewerImage.alt=`Map ${number} — ${title}`;
    mapViewerSource.hidden=number!==5;
    mapViewer.showModal();
  };
  preview.addEventListener('click',openPreview);
  if(number===5)preview.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPreview();}});
  const caption=document.createElement('div');caption.className='map-option-caption';
  const index=document.createElement('span');index.className='map-option-number';index.textContent=String(number).padStart(2,'0');
  const heading=document.createElement('h2');heading.textContent=title;
  caption.append(index,heading);
  card.append(preview,caption);
  if(number===5){
    const note=document.createElement('span');note.className='map-option-note';note.textContent='PLAN / GROUND';
    const source=document.createElement('a');source.className='master-plan-link';source.href='assets/pdf/Master%20Plan.pdf';source.target='_blank';source.rel='noopener';source.textContent='OPEN MASTER PLAN ↗';
    card.append(note,source);
  }
  mapOptionsGrid.append(card);
});
function kmlStudy(item,layerKeys,ghost=false){
  const svg=item.svg.cloneNode(true),allowed=new Set(layerKeys);
  svg.classList.add('map-option-vector');
  if(ghost)svg.classList.add('map-option-vector--ghost');
  [...svg.children].forEach(group=>{if(!allowed.has(group.dataset.layer))group.remove();});
  return svg;
}
function buildLayerAssembly(svg){
  const timeline=gsap.timeline({paused:true});
  let cursor=0;
  [...svg.children].forEach(group=>{
    const paths=[...group.querySelectorAll('.feature-path')];
    paths.forEach(path=>{
      const length=path.getTotalLength(),fill=Number(path.dataset.fill)||0;
      path.style.strokeDasharray=String(length);path.style.strokeDashoffset=String(length);
      if(path.dataset.geometry==='polygon')path.setAttribute('fill-opacity','0');
      timeline.to(path,{strokeDashoffset:0,duration:.42,ease:'none'},cursor);
      if(fill>0&&path.dataset.geometry==='polygon')timeline.to(path,{attr:{'fill-opacity':fill},duration:.3,ease:'power1.out'},cursor+.2);
      cursor+=Math.min(.055,Math.max(.012,length/5000));
    });
    const points=[...group.querySelectorAll('.feature-point')];
    if(points.length){gsap.set(points,{scale:0,opacity:0});timeline.to(points,{scale:1,opacity:1,duration:.28,stagger:.002,ease:'back.out(1.35)'},cursor);cursor+=.2;}
    cursor+=.08;
  });
  return timeline;
}
function addPlanGroundSlider(preview){
  const handle=document.createElement('div');handle.className='plan-ground-handle';handle.tabIndex=0;
  handle.setAttribute('role','slider');handle.setAttribute('aria-label','Compare the Master Plan with the mapped estuary');
  handle.setAttribute('aria-valuemin','20');handle.setAttribute('aria-valuemax','80');handle.setAttribute('aria-valuenow','50');
  preview.append(handle);
  const setSplit=value=>{
    const split=Math.max(20,Math.min(80,value));
    preview.style.setProperty('--plan-split',`${split}%`);handle.setAttribute('aria-valuenow',String(Math.round(split)));
  };
  handle.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();handle.setPointerCapture(event.pointerId);});
  handle.addEventListener('pointermove',event=>{
    if(!handle.hasPointerCapture(event.pointerId))return;
    const rect=preview.getBoundingClientRect();setSplit((event.clientX-rect.left)/rect.width*100);
  });
  handle.addEventListener('pointerup',event=>{event.stopPropagation();if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);});
  handle.addEventListener('click',event=>event.stopPropagation());
  handle.addEventListener('keydown',event=>{
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){
      event.preventDefault();event.stopPropagation();
      const current=Number(handle.getAttribute('aria-valuenow'));
      setSplit(current+(event.key==='ArrowRight'?3:-3));
    }else if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();}
  });
}
loadObservations().then(items=>{
  const byDate=new Map(items.map(item=>[item.id,item]));
  const optionAssemblies=[];
  MAP_OPTIONS.forEach(option=>{
    const card=mapOptionsGrid.querySelector(`[data-map-number="${option.number}"]`);
    const preview=card.querySelector('.map-option-preview');
    if(option.number===5){
      preview.classList.add('map-option-preview--plan');
      const sides=document.createElement('div');sides.className='plan-ground-preview';
      const planSide=document.createElement('div');planSide.className='plan-ground-side plan-ground-side--plan';
      const pdf=document.createElement('iframe');pdf.className='master-plan-outline';pdf.title='Master Plan PDF outline';pdf.loading='lazy';
      pdf.src='assets/pdf/Master%20Plan.pdf#page=1&toolbar=0&navpanes=0&scrollbar=0&view=Fit';
      planSide.append(pdf);
      const groundSide=document.createElement('div');groundSide.className='plan-ground-side plan-ground-side--ground';
      const groundTrace=kmlStudy(byDate.get('2025_02_25'),option.layers);
      groundSide.append(groundTrace);
      sides.append(planSide,groundSide);
      const plan=document.createElement('span');plan.className='plan-ground-label plan-label';plan.textContent='ON THE PLAN';
      const ground=document.createElement('span');ground.className='plan-ground-label ground-label';ground.textContent='ON THE GROUND';
      preview.replaceChildren(sides,plan,ground);
      addPlanGroundSlider(preview);
      optionAssemblies.push({timelines:[buildLayerAssembly(groundTrace)],preview});
      return;
    }
    const art=document.createElement('div');art.className=`map-option-art map-option-art--${option.number}${option.motif==='storm'?' map-option-art--storm':''}`;
    if(option.compare){
      art.append(kmlStudy(byDate.get(option.compare[0]),option.layers,true));
      art.append(kmlStudy(byDate.get(option.compare[1]),option.layers));
    }else art.append(kmlStudy(byDate.get('2025_02_25'),option.layers));
    if(option.motif==='storm'){
      const orbits=document.createElement('div');orbits.className='storm-orbits';
      for(let ring=0;ring<3;ring++){const orbit=document.createElement('i');orbit.style.setProperty('--orbit',String(ring));orbits.append(orbit);}
      art.append(orbits);
    }
    preview.replaceChildren(art);
    const traces=[...art.querySelectorAll('.map-option-vector:not(.map-option-vector--ghost)')];
    optionAssemblies.push({timelines:traces.map(buildLayerAssembly),preview});
  });
  ScrollTrigger.create({trigger:'#map-options',start:'top 82%',once:true,onEnter:()=>{
    optionAssemblies.forEach(({timelines},index)=>gsap.delayedCall(index*.22,()=>timelines.forEach(timeline=>timeline.play())));
  }});
  optionAssemblies.forEach(({timelines,preview})=>{
    const replay=()=>timelines.forEach(timeline=>{if(timeline.progress()>=1)timeline.restart();else timeline.play();});
    preview.addEventListener('pointerenter',replay);
    preview.addEventListener('focusin',replay);
  });
  items.forEach((item,index)=>{
    const [year,month,day]=item.id.split('_');
    const dateLabel=new Date(`${year}-${month}-${day}T00:00:00`).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}).toUpperCase();
    const card=document.createElement('article');card.className='atlas-card';
    card.classList.add(index%2?'atlas-card--low':'atlas-card--high');
    card.setAttribute('aria-label',`Estuary map, ${dateLabel} ${year}`);
    const map=document.createElement('div');map.className='atlas-map';
    map.append(item.svg);
    card.append(map);
    timelineTrack.append(card);
    const marker=document.createElement('div');marker.className=`timeline-date-cell${index%2?' below':''}`;
    const label=document.createElement('span');label.textContent=`${dateLabel} ${year}`;
    marker.append(label,document.createElement('i'));
    timelineDateTrack.append(marker);
    item.card=card;
  });
  const horizontalDistance=()=>Math.max(1,timelineTrack.scrollWidth-innerWidth);
  const travel=gsap.timeline({scrollTrigger:{id:'atlas-horizontal',trigger:timelineSection,start:'top top',end:()=>`+=${horizontalDistance()}`,pin:true,scrub:.35,invalidateOnRefresh:true,anticipatePin:1}});
  travel.to([timelineTrack,timelineDateTrack],{x:()=>-horizontalDistance(),ease:'none'},0).to('.timeline-rail i',{scaleX:1,transformOrigin:'left center',ease:'none'},0);
  ScrollTrigger.refresh();
}).catch(error=>console.error('KML map gallery could not be loaded:',error));
const cloudState={opacity:0,depth:0,drift:0};
gsap.registerPlugin(ScrollTrigger);
const halfFovTangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
const cloudStart=THREE.MathUtils.clamp((1.02*halfFovTangent*3.38-.82)/(.18+1.02*halfFovTangent*1.5),.35,.65);
const cloudTimeline=gsap.timeline({scrollTrigger:{trigger:'.zoom-stop',start:'top top',end:'bottom top',scrub:.65,invalidateOnRefresh:true}});
cloudTimeline
  .to(cloudState,{opacity:.84,depth:.12,drift:.25,duration:.1,ease:'none'},cloudStart)
  .to(cloudState,{opacity:1,depth:.48,drift:1.05,duration:.1,ease:'none'},cloudStart+.1)
  .to(cloudState,{opacity:1,depth:1,drift:2.35,duration:.76-(cloudStart+.2),ease:'none'},cloudStart+.2)
  .to(cloudState,{opacity:0,depth:1.15,drift:3.1,duration:.04,ease:'none'},.96);
function render(now){
  const dt=Math.min(.05,(now-previous)/1000); previous=now;
  const settle=1-Math.exp(-dt*7);
  landingMotion+=(landingTarget-landingMotion)*settle;
  zoomMotion+=(zoomTarget-zoomMotion)*settle;
  const globeActive=landingMotion<.999||zoomMotion<.999||cloudState.opacity>.001;
  if(globeActive){
    const p=THREE.MathUtils.smoothstep(landingMotion,0,1);
    globe.scale.setScalar(.74+.08*landingMotion+.18*zoomMotion);
    cloudLayers.forEach((layer,i)=>{
      const material=layer.material;
      material.uniforms.uOpacity.value=cloudState.opacity;
      material.uniforms.uOffset.value.set(cloudState.drift*(i%2===0?1:-.82)*(i+1)*.012,cloudState.drift*(i%2===0?-.35:.48)*(i+1)*.01);
      layer.scale.setScalar(1+cloudState.depth*(.025+i*.022));
      layer.rotation.y+=dt*(.0015+i*.0006);
    });
    if(landingTarget<.001){
      globe.quaternion.setFromAxisAngle(spinAxis,now*.000075);
    }else{
      interpolated.copy(startOrientation).slerp(targetOrientation,p);
      // The scroll itself drives a quicker multi-turn approach to the Kundapur coast.
      spin.setFromAxisAngle(spinAxis,(1-p)*Math.PI*4);
      globe.quaternion.copy(spin).multiply(interpolated);
    }
    const targetZoom=3.6-(.22*landingMotion)-(1.5*zoomMotion);
    camera.position.z+= (targetZoom-camera.position.z)*(1-Math.exp(-dt*4.2));
  }
  canvas.style.opacity=String(1-.94*zoomMotion);
  // Let the cloud shells clear first, then reveal the vivid 2025 raster.
  const mapReveal=THREE.MathUtils.smoothstep(zoomMotion,.98,1);
  mist.style.opacity=String(cloudState.opacity*.96);
  mist.style.transform=`scale(${1+cloudState.depth*.35})`;
  mistLayers.forEach((layer,i)=>{
    const direction=i%2===0?-1:1;
    const drift=cloudState.drift*(4+i*1.2);
    layer.style.transform=`translate3d(${direction*drift}vw,${(i-2.5)*cloudState.drift*3}vh,0) scale(${1+cloudState.depth*(.2+i*.1)})`;
  });
  mapPlate.style.opacity=String(mapReveal);
  if(mapReveal>.015&&!backdropRevealStarted){
    backdropRevealStarted=true;
    historyBackdrop.muted=true;
    historyBackdrop.loop=false;
    historyBackdrop.pause();
    videoPlaying=false;
    try{historyBackdrop.currentTime=0;}catch{}
  }else if(mapReveal<.002&&backdropRevealStarted){
    backdropRevealStarted=false;
    videoMuted=false;
    historyBackdrop.pause();
    videoPlaying=false;
    try{historyBackdrop.currentTime=0;}catch{}
    gsap.set(videoDimmer,{opacity:0});
    showTimeline(false);
  }
  if(backdropRevealStarted){
    const videoStart=videoStop.getBoundingClientRect().top+scrollY;
    const videoProgress=THREE.MathUtils.clamp((scrollY-videoStart)/Math.max(1,videoStop.offsetHeight),0,1);
    const fade=THREE.MathUtils.smoothstep(videoProgress,.84,1);
    videoDimmer.style.opacity=String(fade*.78);
    const wasVideoMuted=videoMuted;
    videoMuted=videoProgress>=.999;
    if(videoMuted){
      historyBackdrop.pause();
      videoPlaying=false;
    }else if(videoProgress>0&&!videoPlaying){
      if(historyBackdrop.ended){try{historyBackdrop.currentTime=0;}catch{}}
      videoPlaying=true;
      historyBackdrop.play().catch(error=>{
        videoPlaying=false;
        console.warn('Kundapur video could not play:',error);
      });
    }
    if(wasVideoMuted!==videoMuted)revealTimelineOnScroll();
  }
  if(globeActive)renderer.render(scene,camera);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
