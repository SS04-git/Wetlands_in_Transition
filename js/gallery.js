import { MAPS } from './data.js';

const chapters = document.querySelector('#chapters');
const imageMarkup = (map) => `<div class="map-art" aria-label="${map.title}">
  <div class="map-register">K / E <span>FIELD DRAWING&nbsp; ${map.id}</span></div>
  <div class="map-image">
    <img class="map-full" src="${map.src}" alt="${map.title}" loading="lazy">
    <img class="shard shard-a" src="${map.src}" alt="" aria-hidden="true" loading="lazy">
    <img class="shard shard-b" src="${map.src}" alt="" aria-hidden="true" loading="lazy">
    <img class="shard shard-c" src="${map.src}" alt="" aria-hidden="true" loading="lazy">
    <span class="image-wash"></span>
  </div>
  <div class="map-caption"><span>FIG. ${map.id}</span><span>KUNDAPUR&nbsp; / &nbsp;${String(Number(map.id)).padStart(2,'0')} — 07</span></div>
</div>`;

export function initGallery() {
  chapters.innerHTML = MAPS.map((map, index) => `<section class="chapter ${index % 2 ? 'reverse' : ''}" id="map-${map.id}" data-chapter="${index}" aria-labelledby="heading-${map.id}">
    <div class="chapter-copy"><p class="eyebrow">MAP&nbsp; ${map.id}&nbsp; / &nbsp;SEVEN READINGS</p><span class="chapter-rule"></span><h2 id="heading-${map.id}">${map.title}</h2><p class="chapter-sub">${map.sub}</p><a class="next-map" href="#map-${MAPS[(index + 1) % MAPS.length].id}">${index === MAPS.length - 1 ? 'Return to the beginning' : 'Continue through the atlas'} <span>↘</span></a></div>
    ${imageMarkup(map)}
  </section>`).join('');

  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add('assembled');
  }), { threshold: 0.33 });
  document.querySelectorAll('.chapter').forEach(section => observer.observe(section));
}
