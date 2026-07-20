(function leaderboardApp() {
  const socket = io();

  let games = [];

  const tbody = document.getElementById('leaderboard-body');
  const liveStrip = document.getElementById('live-strip');
  const lastUpdated = document.getElementById('last-updated');

  function renderLiveStrip() {
    liveStrip.innerHTML = '';
    const live = games.find((g) => g.status === 'live');
    const paused = games.find((g) => g.status === 'paused');
    const ended = games.filter((g) => g.status === 'ended').length;

    if (live) {
      const chip = document.createElement('span');
      chip.className = 'badge badge-live';
      chip.textContent = `● VOTING OPEN: Game ${live.order} — ${live.name}`;
      liveStrip.appendChild(chip);
    } else if (paused) {
      const chip = document.createElement('span');
      chip.className = 'badge badge-paused';
      chip.textContent = `⚔️ IN PROGRESS: Game ${paused.order} — ${paused.name}`;
      liveStrip.appendChild(chip);
    } else {
      const chip = document.createElement('span');
      chip.className = 'badge badge-pending';
      chip.textContent = ended === games.length ? '🏆 All Games Complete' : 'Waiting for next game…';
      liveStrip.appendChild(chip);
    }
  }

  function rankCell(rank) {
    if (rank <= 3) {
      return `<span class="medal m${rank}">${rank}</span>`;
    }
    return `#${rank}`;
  }

  function renderLeaderboard(leaderboard) {
    tbody.innerHTML = '';
    if (leaderboard.length === 0) {
      tbody.innerHTML =
        '<tr><td colspan="3" style="text-align:center;color:var(--color-text-dim);">Waiting for tributes to join…</td></tr>';
      return;
    }
    leaderboard.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.className = row.rank <= 3 ? `rank-${row.rank}` : '';
      tr.style.setProperty('--i', index);
      tr.innerHTML = `
        <td class="rank-cell">${rankCell(row.rank)}</td>
        <td class="lb-name">${row.name}</td>
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
    games = stateRes.games;
    renderLiveStrip();
    renderLeaderboard(leaderboardRes);
    touchUpdatedTime();
  }

  init();
})();
