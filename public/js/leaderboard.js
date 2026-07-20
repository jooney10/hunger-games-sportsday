(function leaderboardApp() {
  const socket = io();

  let districts = [];
  let games = [];

  const tbody = document.getElementById('leaderboard-body');
  const liveStrip = document.getElementById('live-strip');
  const lastUpdated = document.getElementById('last-updated');

  function districtById(id) {
    return districts.find((d) => d.id === id);
  }

  function renderLiveStrip() {
    liveStrip.innerHTML = '';
    const live = games.find((g) => g.status === 'live');
    const ended = games.filter((g) => g.status === 'ended').length;

    if (live) {
      const chip = document.createElement('span');
      chip.className = 'badge badge-live';
      chip.style.fontSize = '1rem';
      chip.style.padding = '0.6rem 1.2rem';
      chip.textContent = `● LIVE: Game ${live.order} — ${live.name}`;
      liveStrip.appendChild(chip);
    } else {
      const chip = document.createElement('span');
      chip.className = 'badge badge-pending';
      chip.style.fontSize = '1rem';
      chip.style.padding = '0.6rem 1.2rem';
      chip.textContent = ended === games.length ? 'All Games Complete' : 'Waiting for next game...';
      liveStrip.appendChild(chip);
    }
  }

  function renderLeaderboard(leaderboard) {
    tbody.innerHTML = '';
    if (leaderboard.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="4" style="text-align:center;color:var(--color-text-dim);">Waiting for tributes to join...</td></tr>';
      return;
    }
    leaderboard.forEach((row) => {
      const pred = districtById(row.overallPrediction);
      const tr = document.createElement('tr');
      tr.className = row.rank === 1 ? 'rank-1' : '';
      tr.innerHTML = `
        <td class="rank-cell">#${row.rank}</td>
        <td>${row.name}</td>
        <td>
          ${pred ? `<span class="prediction-chip" style="--chip-color:${pred.color}">${pred.district} · ${pred.team}</span>` : '—'}
        </td>
        <td class="score-cell">${row.score}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function touchUpdatedTime() {
    const now = new Date();
    lastUpdated.textContent = `Updated ${now.toLocaleTimeString()}`;
  }

  socket.on('state:update', (payload) => {
    games = payload.games;
    renderLiveStrip();
    touchUpdatedTime();
  });

  socket.on('leaderboard:update', (leaderboard) => {
    renderLeaderboard(leaderboard);
    touchUpdatedTime();
  });

  async function init() {
    const [stateRes, leaderboardRes] = await Promise.all([
      fetch('/api/state').then((r) => r.json()),
      fetch('/api/leaderboard').then((r) => r.json()),
    ]);
    districts = stateRes.districts;
    games = stateRes.games;
    renderLiveStrip();
    renderLeaderboard(leaderboardRes);
    touchUpdatedTime();
  }

  init();
})();
