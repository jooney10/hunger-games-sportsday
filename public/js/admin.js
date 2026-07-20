(function adminApp() {
  const socket = io();

  const TOKEN_KEY = 'sportsday_admin_token';

  let districts = [];
  let games = [];
  let token = sessionStorage.getItem(TOKEN_KEY);

  const pinScreen = document.getElementById('pin-screen');
  const controlPanel = document.getElementById('control-panel');
  const pinForm = document.getElementById('pin-form');
  const pinInput = document.getElementById('pin-input');
  const pinError = document.getElementById('pin-error');
  const adminGamesList = document.getElementById('admin-games-list');
  const resetBtn = document.getElementById('reset-btn');

  function showToast(message) {
    const root = document.getElementById('toast-root');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    root.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function unlock() {
    pinScreen.hidden = true;
    controlPanel.hidden = false;
    renderGames();
  }

  function requireReauth() {
    sessionStorage.removeItem(TOKEN_KEY);
    token = null;
    pinScreen.hidden = false;
    controlPanel.hidden = true;
    showToast('Session expired. Please re-enter the PIN.');
  }

  pinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    pinError.hidden = true;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput.value }),
      });
      const data = await res.json();
      if (!res.ok) {
        pinError.textContent = data.error || 'Incorrect PIN.';
        pinError.hidden = false;
        return;
      }
      token = data.token;
      sessionStorage.setItem(TOKEN_KEY, token);
      unlock();
    } catch {
      pinError.textContent = 'Could not reach the server.';
      pinError.hidden = false;
    }
  });

  function sortedGames() {
    return [...games].sort((a, b) => a.order - b.order);
  }

  function nextUpGameId() {
    const next = sortedGames().find((g) => g.status === 'pending');
    return next ? next.id : null;
  }

  function anyInPlay() {
    return games.some((g) => g.status === 'live' || g.status === 'paused');
  }

  function districtOptionsHtml(selected) {
    return districts
      .map(
        (d) =>
          `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${d.district} — ${d.team}</option>`
      )
      .join('');
  }

  function goLive(gameId) {
    socket.emit('admin:goLive', { token, gameId }, (res) => {
      if (!res.ok) {
        if (res.error === 'Not authorized.') return requireReauth();
        showToast(res.error || 'Could not start game.');
      }
    });
  }

  function setPaused(gameId, paused) {
    const event = paused ? 'admin:pauseGame' : 'admin:resumeGame';
    socket.emit(event, { token, gameId }, (res) => {
      if (!res.ok) {
        if (res.error === 'Not authorized.') return requireReauth();
        showToast(res.error || 'Could not change voting state.');
        return;
      }
      showToast(paused ? 'Voting paused — no new picks.' : 'Voting reopened.');
    });
  }

  function endGame(gameId, winnerId) {
    if (!winnerId) {
      showToast('Select a winning district first.');
      return;
    }
    socket.emit('admin:endGame', { token, gameId, winnerId }, (res) => {
      if (!res.ok) {
        if (res.error === 'Not authorized.') return requireReauth();
        showToast(res.error || 'Could not end game.');
      }
    });
  }

  function renderGames() {
    if (controlPanel.hidden) return;
    adminGamesList.innerHTML = '';
    const eligibleId = nextUpGameId();
    const inPlay = anyInPlay();

    sortedGames().forEach((game, index) => {
      const row = document.createElement('div');
      const isInPlay = game.status === 'live' || game.status === 'paused';
      row.className = 'game-row' + (isInPlay ? ' is-live' : '');
      row.style.setProperty('--i', index);

      let badge = '<span class="badge badge-pending">Pending</span>';
      if (game.status === 'live') badge = '<span class="badge badge-live">● Voting Open</span>';
      if (game.status === 'paused') badge = '<span class="badge badge-paused">❚❚ Voting Paused</span>';
      if (game.status === 'ended') badge = '<span class="badge badge-ended">Ended</span>';

      let controls = '';
      if (game.status === 'pending') {
        const eligible = game.id === eligibleId && !inPlay;
        controls = `<button class="btn btn-primary go-live-btn" data-game="${game.id}" ${eligible ? '' : 'disabled'}>Go Live with Game ${game.order}</button>`;
      } else if (isInPlay) {
        const pauseBtn =
          game.status === 'live'
            ? `<button class="btn pause-btn" data-game="${game.id}" data-paused="true">❚❚ Pause Voting</button>`
            : `<button class="btn pause-btn" data-game="${game.id}" data-paused="false">▶ Resume Voting</button>`;
        controls = `
          <div class="winner-select">
            ${pauseBtn}
            <select data-game="${game.id}" class="winner-dropdown">
              <option value="">Select winner…</option>
              ${districtOptionsHtml(null)}
            </select>
            <button class="btn btn-danger end-game-btn" data-game="${game.id}">Select Winner &amp; End Game</button>
          </div>
        `;
      } else if (game.status === 'ended') {
        const w = districts.find((d) => d.id === game.winner);
        controls = `<span class="game-winner">Winner: ${w ? `${w.district} (${w.team})` : '—'}</span>`;
      }

      row.innerHTML = `
        <div class="game-order">${game.order}</div>
        <div class="game-name">${game.name}</div>
        ${badge}
        <div>${controls}</div>
      `;
      adminGamesList.appendChild(row);
    });

    adminGamesList.querySelectorAll('.go-live-btn').forEach((btn) => {
      btn.addEventListener('click', () => goLive(btn.dataset.game));
    });
    adminGamesList.querySelectorAll('.pause-btn').forEach((btn) => {
      btn.addEventListener('click', () => setPaused(btn.dataset.game, btn.dataset.paused === 'true'));
    });
    adminGamesList.querySelectorAll('.end-game-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const gameId = btn.dataset.game;
        const select = adminGamesList.querySelector(`.winner-dropdown[data-game="${gameId}"]`);
        endGame(gameId, select.value);
      });
    });
  }

  resetBtn.addEventListener('click', () => {
    const confirmed = window.confirm(
      'This will permanently wipe all players, votes, and game progress. Continue?'
    );
    if (!confirmed) return;
    socket.emit('admin:reset', { token }, (res) => {
      if (!res.ok) {
        if (res.error === 'Not authorized.') return requireReauth();
        showToast(res.error || 'Could not reset.');
        return;
      }
      showToast('All data has been reset.');
    });
  });

  socket.on('state:update', (payload) => {
    games = payload.games;
    renderGames();
  });

  async function init() {
    const res = await fetch('/api/state');
    const data = await res.json();
    districts = data.districts;
    games = data.games;
    if (token) unlock();
    renderGames();
  }

  init();
})();
