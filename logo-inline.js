// Logo VISINT (hibou) — inséré dans la page de connexion et la barre latérale.
(function (){
  const owl = (size) => `
  <svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" aria-label="VISINT">
    <rect width="100" height="100" rx="20" fill="#5D3A9B"/>
    <g transform="translate(0,4)">
      <polygon points="50,15 67,36 33,36" fill="#00AEEF"/>
      <path d="M22 48a28 28 0 0 0 56 0" fill="none" stroke="#00AEEF" stroke-width="5"/>
      <circle cx="37" cy="50" r="12" fill="none" stroke="#7FD8FF" stroke-width="4.5"/>
      <circle cx="63" cy="50" r="12" fill="none" stroke="#7FD8FF" stroke-width="4.5"/>
      <circle cx="37" cy="50" r="5.5" fill="#00AEEF"/>
      <circle cx="63" cy="50" r="5.5" fill="#00AEEF"/>
      <polygon points="50,54 57,61 50,68 43,61" fill="#00AEEF"/>
    </g>
  </svg>`;
  const a = document.getElementById('logoLogin'); if (a) a.innerHTML = owl(76);
  const b = document.getElementById('logoSide'); if (b) b.innerHTML = owl(36);
})();
