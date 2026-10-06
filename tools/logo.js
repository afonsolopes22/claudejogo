// Logo "Cue Legends": taco dourado cruzado atrás de uma bola escura com anel dourado e estrela (sem moldura quadrada)
const star = (cx, cy, ro, ri) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? ri : ro; p.push((cx + Math.cos(a) * r).toFixed(2) + ',' + (cy + Math.sin(a) * r).toFixed(2)); } return p.join(' '); };
const inner = (id) => `
<linearGradient id="${id}c" gradientUnits="userSpaceOnUse" x1="20" y1="80" x2="80" y2="20"><stop offset="0" stop-color="#3a210f"/><stop offset=".3" stop-color="#3a210f"/><stop offset=".31" stop-color="#ffcf3f"/><stop offset=".35" stop-color="#ffcf3f"/><stop offset=".36" stop-color="#e3b878"/><stop offset="1" stop-color="#f6e3b0"/></linearGradient>
<radialGradient id="${id}b" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#6e6e6e"/><stop offset=".65" stop-color="#101010"/><stop offset="1" stop-color="#000"/></radialGradient>
<linearGradient id="${id}r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".5" stop-color="#ffcf3f"/><stop offset="1" stop-color="#b8860b"/></linearGradient>
<polygon points="22.3,82.3 81,21 79,19 17.7,77.7" fill="url(#${id}c)"/>
<circle cx="80.4" cy="19.6" r="2.3" fill="#5ac8ff"/>
<circle cx="50" cy="52" r="26" fill="url(#${id}b)" stroke="url(#${id}r)" stroke-width="2.6"/>
<circle cx="50" cy="52" r="13" fill="#f6f6f2"/>
<polygon points="${star(50, 52.6, 9.2, 3.9)}" fill="#111"/>
<ellipse cx="41" cy="38.5" rx="7" ry="4" fill="#fff" opacity=".35" transform="rotate(-30 41 38.5)"/>`;
module.exports = { inner, svg: (id, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" ${extra}>${inner(id)}</svg>` };
