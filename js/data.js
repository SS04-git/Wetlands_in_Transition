export const MAPS = [
  { id:'01', title:'The Estuary as a Landscape', sub:'The estuary comes into view as a meeting of river, sea and inhabited ground.', file:'Map 1 - The Estuary as a Landscape.png' },
  { id:'02', title:'Patterns of Wetness and Vegetation', sub:'Water leaves a shifting pattern across the vegetation and exposed ground.', file:'Map 2 - Patterns of Wetness and Vegetation.png' },
  { id:'03', title:'The Estuary Through Time', sub:'A changing shoreline holds traces of many different moments.', file:'Map 3 - The Estuary Through Time.png' },
  { id:'04', title:'The Estuary as a Lived Landscape', sub:'Daily life, settlement and work gather along the water’s edge.', file:'Map 4 - The Estuary as a Lived Landscape.png' },
  { id:'05', title:'The Estuary Between Plan and Ground', sub:'The planned landscape meets the uneven reality of the ground.', file:'Map 5 - The Estuary Between Plan and Ground.png' },
  { id:'06', title:'The Estuary and the Monsoon', sub:'Rainfall connects distant weather to the changing estuary.', file:'Map 6 - The Estuary and the Monsoon.png' },
  { id:'07', title:'Cyclones and Storms', sub:'Storm paths reveal the estuary’s exposure to a restless Arabian Sea.', file:'Map 7 - Cyclones and Storms.png' },
].map(map => ({ ...map, src: `assets/maps/${Number(map.id)}/${map.file}` }));
