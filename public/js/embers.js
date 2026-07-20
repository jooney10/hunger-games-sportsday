(function initEmbers() {
  const container = document.getElementById('embers');
  if (!container) return;

  const EMBER_COUNT = 24;
  for (let i = 0; i < EMBER_COUNT; i += 1) {
    const ember = document.createElement('span');
    const left = Math.random() * 100;
    const duration = 8 + Math.random() * 10;
    const delay = Math.random() * 12;
    const drift = (Math.random() - 0.5) * 80;
    ember.style.left = `${left}%`;
    ember.style.animationDuration = `${duration}s`;
    ember.style.animationDelay = `${delay}s`;
    ember.style.setProperty('--drift', `${drift}px`);
    container.appendChild(ember);
  }
})();
