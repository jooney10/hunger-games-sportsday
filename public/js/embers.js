(function initEmbers() {
  const container = document.getElementById('embers');
  if (!container) return;

  const EMBER_COUNT = 30;
  const COLORS = ['#ff7a1a', '#ff3d00', '#ffb347', '#d4af37', '#ffd76a'];

  for (let i = 0; i < EMBER_COUNT; i += 1) {
    const ember = document.createElement('span');
    const size = 2 + Math.random() * 4;
    const left = Math.random() * 100;
    const duration = 8 + Math.random() * 11;
    const delay = Math.random() * 14;
    const drift = (Math.random() - 0.5) * 90;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];

    ember.style.left = `${left}%`;
    ember.style.width = `${size}px`;
    ember.style.height = `${size}px`;
    ember.style.animationDuration = `${duration}s`;
    ember.style.animationDelay = `${delay}s`;
    ember.style.setProperty('--drift', `${drift}px`);
    ember.style.setProperty('--ember-color', color);
    container.appendChild(ember);
  }
})();
