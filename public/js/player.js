(function playerApp() {
  const socket = io();

  const STORAGE_KEY = 'sportsday_playerId';
  const REVEAL_DURATION = 4200;

  let districts = [];
  let games = [];
  let player = null;
  let voteSelection = null;
  let lastGameStatus = {};
  let revealHoldTimer = null;
  let revealFadeTimer = null;

  const bootEl = document.getElementById('boot');
  const bootMsg = document.getElementById('boot-msg');
  const onboardingEl = document.getElementById('onboarding');
  const arenaEl = document.getElementById('arena');
  const predictionGrid = document.getElementById('prediction-grid');
  const onboardingForm = document.getElementById('onboarding-form');
  const onboardingError = document.getElementById('onboarding-error');
  const nameInput = document.getElementById('player-name');

  const statusTitle = document.getElementById('status-title');
  const statusSub = document.getElementById('status-sub');
  const statusIcon = document.getElementById('status-icon');
  const myName = document.getElementById('my-name');
  const myPrediction = document.getElementById('my-prediction');
  const myScore = document.getElementById('my-score');
  const gamesList = document.getElementById('games-list');

  const voteModal = document.getElementById('vote-modal');
  const voteGameName = document.getElementById('vote-game-name');
  const voteGrid = document.getElementById('vote-grid');
  const voteError = document.getElementById('vote-error');

  const winnerReveal = document.getElementById('winner-reveal');
  const wrKicker = document.getElementById('wr-kicker');
  const wrDistrict = document.getElementById('wr-district');
  const wrTeam = document.getElementById('wr-team');
  const wrNote = document.getElementById('wr-note');

  let onboardingSelection = null;

  function districtById(id) {
    return districts.find((d) => d.id === id);
  }

  function hideBoot() {
    if (!bootEl || bootEl.classList.contains('hide')) return;
    bootEl.classList.add('hide');
    setTimeout(() => {
      bootEl.hidden = true;
    }, 500);
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
    districts.forEach((d, index) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'district-card' + (d.id === selectedId ? ' selected' : '');
      card.style.setProperty('--card-color', d.color);
      card.style.setProperty('--i', index);
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

  function findPausedGame() {
    return games.find((g) => g.status === 'paused');
  }

  function findNextPendingGame() {
    return sortedGames().find((g) => g.status === 'pending');
  }

  function renderStatus() {
    const live = findLiveGame();
    if (live) {
      const voted = Boolean(player.votes[live.id]);
      statusIcon.textContent = voted ? '✅' : '🔥';
      statusTitle.textContent = voted ? 'Vote Locked In!' : `Live: ${live.name}`;
      statusSub.textContent = voted
        ? `Watching Game ${live.order}: ${live.name}. Good luck, Tribute.`
        : `Cast your vote for Game ${live.order} now!`;
      return;
    }

    const paused = findPausedGame();
    if (paused) {
      const voted = player.votes[paused.id];
      statusIcon.textContent = '⚔️';
      statusTitle.textContent = 'Game In Progress';
      statusSub.textContent = voted
        ? `Voting is closed. Your pick: ${districtById(voted)?.team ?? ''}. Good luck, Tribute.`
        : 'Voting is closed for this round — the Games are underway.';
      return;
    }
    const next = findNextPendingGame();
    if (next) {
      statusIcon.textContent = '⏳';
      statusTitle.textContent = 'Waiting for the Capitol…';
      statusSub.textContent = `Next up: Game ${next.order} — ${next.name}`;
      return;
    }
    statusIcon.textContent = '🏆';
    statusTitle.textContent = 'The Games Have Concluded!';
    statusSub.textContent = 'Check the leaderboard to see the final standings.';
  }

  function renderGamesList() {
    gamesList.innerHTML = '';
    sortedGames().forEach((game, index) => {
      const row = document.createElement('div');
      row.className = 'game-row' + (game.status === 'live' ? ' is-live' : '');
      row.style.setProperty('--i', index);

      let badge = '<span class="badge badge-pending">Pending</span>';
      if (game.status === 'live') badge = '<span class="badge badge-live">● Live</span>';
      if (game.status === 'paused') badge = '<span class="badge badge-paused">❚❚ Voting Closed</span>';
      if (game.status === 'ended') badge = '<span class="badge badge-ended">Ended</span>';

      let winnerLine = '';
      if (game.status === 'ended' && game.winner) {
        const w = districtById(game.winner);
        const correct = player.votes[game.id] === game.winner;
        winnerLine = `<div class="game-winner">Winner: ${w ? w.team : ''}${correct ? ' · +1 for you ✓' : ''}</div>`;
      } else if (game.status === 'live') {
        const voted = player.votes[game.id];
        winnerLine = voted
          ? `<div class="game-winner">Your vote: ${districtById(voted)?.team ?? ''}</div>`
          : `<div class="game-winner">Vote now above ↑</div>`;
      } else if (game.status === 'paused') {
        const voted = player.votes[game.id];
        winnerLine = voted
          ? `<div class="game-winner">Your vote: ${districtById(voted)?.team ?? ''}</div>`
          : `<div class="game-winner">No vote cast — voting closed</div>`;
      } else if (player.votes[game.id]) {
        winnerLine = `<div class="game-winner">Your vote: ${districtById(player.votes[game.id])?.team ?? ''}</div>`;
      }

      row.innerHTML = `
        <div class="game-order">${game.order}</div>
        <div><div class="game-name">${game.name}</div>${winnerLine}</div>
        ${badge}
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

  function showWinnerReveal(game) {
    const w = districtById(game.winner);
    if (!w) return;
    const myVote = player.votes[game.id];
    winnerReveal.style.setProperty('--wr-color', w.color);
    wrKicker.textContent = `The Victor of Round ${game.order}`;
    wrDistrict.textContent = w.district;
    wrTeam.textContent = w.team;

    if (myVote === game.winner) {
      wrNote.textContent = '✓ The odds were in your favour — +1 point!';
      wrNote.style.color = 'var(--color-success)';
      wrNote.style.borderColor = 'rgba(88, 201, 141, 0.5)';
    } else if (myVote) {
      wrNote.textContent = '✗ The odds were not in your favour.';
      wrNote.style.color = 'var(--color-text-dim)';
      wrNote.style.borderColor = 'var(--color-border)';
    } else {
      wrNote.textContent = 'No vote cast this round.';
      wrNote.style.color = 'var(--color-text-dim)';
      wrNote.style.borderColor = 'var(--color-border)';
    }

    // Both timers must be cleared: a stale fade-out from a previous round
    // would otherwise hide this reveal moments after it appears.
    clearTimeout(revealHoldTimer);
    clearTimeout(revealFadeTimer);

    winnerReveal.classList.remove('leaving');
    winnerReveal.hidden = false;

    revealHoldTimer = setTimeout(() => {
      winnerReveal.classList.add('leaving');
      revealFadeTimer = setTimeout(() => {
        winnerReveal.hidden = true;
      }, 500);
    }, REVEAL_DURATION);
  }

  function detectRevealAndUpdate(newGames) {
    if (player) {
      newGames.forEach((game) => {
        const was = lastGameStatus[game.id];
        if (was && was !== 'ended' && game.status === 'ended' && game.winner) {
          showWinnerReveal(game);
        }
      });
    }
    lastGameStatus = {};
    newGames.forEach((game) => {
      lastGameStatus[game.id] = game.status;
    });
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
    hideBoot();
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
        detectRevealAndUpdate(games);
        localStorage.setItem(STORAGE_KEY, player.id);
        enterArena();
      }
    );
  });

  socket.on('state:update', (payload) => {
    games = payload.games;
    detectRevealAndUpdate(games);
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
    games.forEach((game) => {
      lastGameStatus[game.id] = game.status;
    });
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
          hideBoot();
          onboardingEl.hidden = false;
        }
      });
    } else {
      hideBoot();
      onboardingEl.hidden = false;
    }
  }

  init();
})();
