(function playerApp() {
  const socket = io();

  const STORAGE_KEY = 'sportsday_playerId';

  let districts = [];
  let games = [];
  let player = null;
  let voteSelection = null;

  const onboardingEl = document.getElementById('onboarding');
  const arenaEl = document.getElementById('arena');
  const predictionGrid = document.getElementById('prediction-grid');
  const onboardingForm = document.getElementById('onboarding-form');
  const onboardingError = document.getElementById('onboarding-error');
  const nameInput = document.getElementById('player-name');

  const statusTitle = document.getElementById('status-title');
  const statusSub = document.getElementById('status-sub');
  const statusIcon = document.querySelector('#status-card .status-icon');
  const myName = document.getElementById('my-name');
  const myPrediction = document.getElementById('my-prediction');
  const myScore = document.getElementById('my-score');
  const gamesList = document.getElementById('games-list');

  const voteModal = document.getElementById('vote-modal');
  const voteGameName = document.getElementById('vote-game-name');
  const voteGrid = document.getElementById('vote-grid');
  const voteError = document.getElementById('vote-error');

  let onboardingSelection = null;

  function districtById(id) {
    return districts.find((d) => d.id === id);
  }

  function showToast(message) {
    const root = document.getElementById('toast-root');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    root.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  function renderDistrictGrid(container, { selectedId, onSelect }) {
    container.innerHTML = '';
    districts.forEach((d) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'district-card' + (d.id === selectedId ? ' selected' : '');
      card.style.setProperty('--card-color', d.color);
      card.innerHTML = `
        <span class="district-dot"></span>
        <span class="district-name">${d.district}</span>
        <span class="district-team">${d.team}</span>
      `;
      card.addEventListener('click', () => onSelect(d.id));
      container.appendChild(card);
    });
  }

  function renderOnboardingGrid() {
    renderDistrictGrid(predictionGrid, {
      selectedId: onboardingSelection,
      onSelect: (id) => {
        onboardingSelection = id;
        renderOnboardingGrid();
      },
    });
  }

  function sortedGames() {
    return [...games].sort((a, b) => a.order - b.order);
  }

  function findLiveGame() {
    return games.find((g) => g.status === 'live');
  }

  function findNextPendingGame() {
    return sortedGames().find((g) => g.status === 'pending');
  }

  function renderStatus() {
    const live = findLiveGame();
    if (live) {
      const voted = Boolean(player.votes[live.id]);
      statusIcon.textContent = voted ? '✅' : '🔥';
      statusTitle.textContent = voted ? `Vote Locked In!` : `LIVE NOW: ${live.name}`;
      statusSub.textContent = voted
        ? `Watching Game ${live.order}: ${live.name}. Good luck, Tribute.`
        : `Cast your vote for Game ${live.order} now!`;
      return;
    }
    const next = findNextPendingGame();
    if (next) {
      statusIcon.textContent = '⏳';
      statusTitle.textContent = 'Waiting for the Capitol...';
      statusSub.textContent = `Next up: Game ${next.order} — ${next.name}`;
      return;
    }
    statusIcon.textContent = '🏆';
    statusTitle.textContent = 'The Games Have Concluded!';
    statusSub.textContent = 'Check the leaderboard to see the final standings.';
  }

  function renderGamesList() {
    gamesList.innerHTML = '';
    sortedGames().forEach((game) => {
      const row = document.createElement('div');
      row.className = 'game-row' + (game.status === 'live' ? ' is-live' : '');

      let badge = '<span class="badge badge-pending">Pending</span>';
      if (game.status === 'live') badge = '<span class="badge badge-live">● Live</span>';
      if (game.status === 'ended') badge = '<span class="badge badge-ended">Ended</span>';

      let winnerLine = '';
      if (game.status === 'ended' && game.winner) {
        const w = districtById(game.winner);
        winnerLine = `<div class="game-winner">Winner: ${w ? w.team : ''}</div>`;
      } else if (game.status === 'live') {
        const voted = player.votes[game.id];
        winnerLine = voted
          ? `<div class="game-winner">Your vote: ${districtById(voted)?.team ?? ''}</div>`
          : `<div class="game-winner">Vote now above ↑</div>`;
      } else if (player.votes[game.id]) {
        winnerLine = `<div class="game-winner">Your vote: ${districtById(player.votes[game.id])?.team ?? ''}</div>`;
      }

      row.innerHTML = `
        <div class="game-order">${game.order}</div>
        <div><div class="game-name">${game.name}</div>${winnerLine}</div>
        ${badge}
        <div></div>
      `;
      gamesList.appendChild(row);
    });
  }

  function renderArena() {
    myName.textContent = player.name;
    const pred = districtById(player.overallPrediction);
    myPrediction.textContent = pred ? `${pred.district} (${pred.team})` : '—';
    renderStatus();
    renderGamesList();
    maybeShowVoteModal();
  }

  function maybeShowVoteModal() {
    const live = findLiveGame();
    if (live && !player.votes[live.id]) {
      voteSelection = null;
      voteError.hidden = true;
      voteGameName.textContent = `Game ${live.order}: ${live.name}`;
      renderDistrictGrid(voteGrid, {
        selectedId: voteSelection,
        onSelect: (id) => {
          voteSelection = id;
          castVote(live.id);
        },
      });
      voteModal.hidden = false;
    } else {
      voteModal.hidden = true;
    }
  }

  function castVote(gameId) {
    if (!voteSelection) return;
    socket.emit('player:vote', { playerId: player.id, gameId, districtId: voteSelection }, (res) => {
      if (!res.ok) {
        voteError.textContent = res.error || 'Something went wrong.';
        voteError.hidden = false;
        return;
      }
      player.votes[gameId] = voteSelection;
      voteModal.hidden = true;
      const d = districtById(voteSelection);
      showToast(`Tribute vote cast for ${d ? d.district : 'your district'}!`);
      renderArena();
    });
  }

  function enterArena() {
    onboardingEl.hidden = true;
    arenaEl.hidden = false;
    renderArena();
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then(updateMyScore);
  }

  function updateMyScore(leaderboard) {
    if (!player) return;
    const entry = leaderboard.find((row) => row.id === player.id);
    myScore.textContent = entry ? entry.score : 0;
  }

  onboardingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    onboardingError.hidden = true;
    const name = nameInput.value.trim();
    if (!name) {
      onboardingError.textContent = 'Please enter your name.';
      onboardingError.hidden = false;
      return;
    }
    if (!onboardingSelection) {
      onboardingError.textContent = 'Please select your overall prediction.';
      onboardingError.hidden = false;
      return;
    }
    socket.emit(
      'player:register',
      { name, overallPrediction: onboardingSelection },
      (res) => {
        if (!res.ok) {
          onboardingError.textContent = res.error || 'Something went wrong.';
          onboardingError.hidden = false;
          return;
        }
        player = res.player;
        games = res.games;
        localStorage.setItem(STORAGE_KEY, player.id);
        enterArena();
      }
    );
  });

  socket.on('state:update', (payload) => {
    games = payload.games;
    if (player) renderArena();
  });

  socket.on('leaderboard:update', (leaderboard) => {
    updateMyScore(leaderboard);
  });

  async function init() {
    const res = await fetch('/api/state');
    const data = await res.json();
    districts = data.districts;
    games = data.games;
    renderOnboardingGrid();

    const savedId = localStorage.getItem(STORAGE_KEY);
    if (savedId) {
      socket.emit('player:restore', { playerId: savedId }, (res2) => {
        if (res2.ok) {
          player = res2.player;
          games = res2.games;
          enterArena();
        } else {
          localStorage.removeItem(STORAGE_KEY);
          onboardingEl.hidden = false;
        }
      });
    } else {
      onboardingEl.hidden = false;
    }
  }

  init();
})();
