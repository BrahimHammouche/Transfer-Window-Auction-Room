(() => {
  const GAME = () => window.__game;
  let replayTimer = null;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
  const stat = (value, digits = 0) => Number(value || 0).toFixed(digits);

  function score(match, side) {
    const regular = match.score?.[side] ?? 0;
    const pens = match.penalties?.[side];
    return `${regular}${pens === undefined || pens === null ? '' : ` <small>(${pens})</small>`}`;
  }

  function reveal(title, team, opponent = '', champion = false) {
    const layer = document.createElement('div');
    layer.className = `tournament-reveal ${champion ? 'champion-reveal' : ''}`;
    layer.innerHTML = `<div class="reveal-card"><small>${champion ? 'ROAD TO GLORY' : 'OFFICIAL FIXTURE DRAW'}</small>${champion ? '<div class="stadium-lights"></div><img class="champions-trophy-art" src="/assets/champions-trophy.png" alt="Champions trophy">' : ''}<h2>${esc(title)}</h2><div class="reveal-team">${esc(team)}</div>${opponent ? `<div class="reveal-versus">VS</div><div class="reveal-team">${esc(opponent)}</div>` : ''}${champion ? '<p class="road-copy">Auction. Knockout nights. One champion.</p>' : ''}</div>`;
    document.body.appendChild(layer);
    (champion ? window.gameSounds?.anthem : window.gameSounds?.draw)?.();
    if (champion) setTimeout(() => window.gameSounds?.celebration?.(), 1200);
    setTimeout(() => layer.remove(), champion ? 4200 : 3200);
  }

  function leaderboard(matches) {
    const table = {};
    matches.filter(match => match.status === 'finished').forEach(match => {
      [match.home, match.away].forEach(name => { if (name) table[name] ??= {wins:0,gf:0,ga:0}; });
      if (!table[match.home] || !table[match.away]) return;
      const home = Number(match.score?.home || 0), away = Number(match.score?.away || 0);
      table[match.home].gf += home; table[match.home].ga += away; table[match.away].gf += away; table[match.away].ga += home;
      if (match.winner) table[match.winner].wins += 1;
    });
    const rows = Object.entries(table).sort((a,b) => b[1].wins - a[1].wins || (b[1].gf-b[1].ga) - (a[1].gf-a[1].ga));
    return `<section class="champion-leaderboard"><div><small>ROAD TO GLORY</small><h3>Final Leaderboard</h3></div>${rows.map(([name, record], index) => `<div class="leaderboard-row"><b>${index + 1}</b><span>${esc(name)}</span><em>${record.wins} W</em><i>${record.gf}-${record.ga}</i></div>`).join('')}</section>`;
  }

  function matchCard(match, host) {
    const finished = match.status === 'finished';
    const ready = match.status === 'ready';
    const live = match.status === 'live';
    return `<article class="match-card ${finished ? 'finished' : ''} ${live ? 'live' : ''}">
      <div class="match-round">${esc(match.round)}</div>
      <div class="match-team ${match.winner === match.home ? 'winner' : ''}"><span>${esc(match.home || 'Home team')}</span><b>${finished || live ? score(match, 'home') : '—'}</b></div>
      <div class="match-team ${match.winner === match.away ? 'winner' : ''}"><span>${esc(match.away || 'Away team')}</span><b>${finished || live ? score(match, 'away') : '—'}</b></div>
      ${ready && host ? `<button class="btn-primary start-live-match" data-match="${esc(match.id)}">START LIVE MATCH</button>` : ''}
      ${live ? `<div class="match-live-now">● LIVE · ${esc(match.currentMinute || 0)}'</div>` : ''}
      ${match.status === 'locked' ? '<div class="match-wait">Awaiting the next match</div>' : ''}
      ${finished ? `<button class="btn-ghost match-details" data-match="${esc(match.id)}">Match report</button><button class="btn-primary watch-live" data-match="${esc(match.id)}">WATCH LIVE REPLAY</button>` : ''}
    </article>`;
  }

  function report(match) {
    const stats = match.stats || {};
    const rows = [['Possession', '%'], ['Shots', ''], ['Shots on target', ''], ['xG', ''], ['Saves', ''], ['Corners', ''], ['Fouls', ''], ['Yellow cards', '']];
    const keys = ['possession', 'shots', 'shotsOnTarget', 'xg', 'saves', 'corners', 'fouls', 'yellowCards'];
    return `<section class="match-report"><div class="report-head"><h3>${esc(match.home)} ${score(match, 'home')} – ${score(match, 'away')} ${esc(match.away)}</h3><span>${esc(match.round)}</span></div>
      <button class="btn-primary watch-live report-live" data-match="${esc(match.id)}">WATCH LIVE REPLAY</button>
      <div class="stat-grid">${rows.map(([label, suffix], index) => `<div>${stat(stats[keys[index]]?.home, keys[index] === 'xg' ? 2 : 0)}${suffix}</div><strong>${label}</strong><div>${stat(stats[keys[index]]?.away, keys[index] === 'xg' ? 2 : 0)}${suffix}</div>`).join('')}</div>
      <div class="event-list">${(match.events || []).map(event => `<div class="match-event"><b>${event.minute}'</b><span>${esc(event.team ? `${event.team} — ` : '')}${esc(event.text)}</span></div>`).join('') || '<div class="match-event">No major events recorded.</div>'}</div>
    </section>`;
  }

  function playerDots(state, match, side, activeNames = []) {
    const players = state.teams?.[match[side]]?.squad || [];
    const layout = [[50,90],[18,72],[38,74],[62,74],[82,72],[25,53],[50,50],[75,53],[20,28],[50,20],[80,28]];
    return players.slice(0, 11).map((player, index) => {
      const [x, y] = layout[index] || [50, 50];
      const adjustedY = side === 'home' ? y : 100 - y;
      return `<div class="live-player ${side} ${activeNames.includes(player.name) ? 'active' : ''}" data-side="${side}" data-name="${esc(player.name)}" style="left:${x}%;top:${adjustedY}%" title="${esc(player.name)}"><span>${esc(player.name)}</span></div>`;
    }).join('');
  }

  function liveReplay(state, match) {
    return `<section class="live-match" id="liveMatch" data-match="${esc(match.id)}">
      <div class="live-head"><div><span class="live-badge">LIVE REPLAY</span><b id="liveMinute">0'</b></div><div class="live-score"><strong>${esc(match.home)}</strong><b id="liveHomeScore">0</b><i>–</i><b id="liveAwayScore">0</b><strong>${esc(match.away)}</strong></div></div>
      <div class="live-pitch" id="livePitch"><div class="pitch-circle"></div><div class="pitch-half"></div>${playerDots(state, match, 'home')}${playerDots(state, match, 'away')}<div class="live-ball" id="liveBall"></div></div>
      <div class="live-controls"><button class="btn-primary" id="replayStart">START LIVE REPLAY</button><button class="btn-ghost" id="replayReset">RESET</button><span id="liveStatus">Press play to follow every key moment.</span></div>
      <div class="live-commentary" id="liveCommentary"><div class="commentary-empty">Kick-off is ready.</div></div>
    </section>`;
  }

  function attackLabel(event) {
    if (!event) return 'Kick-off';
    if (event.type === 'goal') return 'GOAL';
    if (event.type === 'corner') return 'Corner kick';
    if (event.type === 'save') return 'Shot on target';
    if (event.type === 'miss') return 'Dangerous attack';
    return 'Dangerous attack';
  }

  function teamIdentity(state, name) {
    const team = state.teams?.[name] || {};
    return {name: team.displayName || name, logo: team.logo || '', initial: String(team.displayName || name || '?').trim().charAt(0).toUpperCase() || '?'};
  }

  function teamMark(team, side) {
    return team.logo
      ? `<img class="broadcast-crest ${side}" src="${esc(team.logo)}" alt="${esc(team.name)} crest">`
      : `<span class="broadcast-crest ${side} crest-fallback" aria-label="${esc(team.name)}">${esc(team.initial)}</span>`;
  }

  function livePulse(events) {
    const pulse = {home: {attacks: 0, shots: 0}, away: {attacks: 0, shots: 0}};
    events.forEach(event => {
      const side = event.side || 'home';
      if (!pulse[side]) return;
      if (['pass', 'dribble', 'corner', 'save', 'miss', 'goal'].includes(event.type)) pulse[side].attacks += 1;
      if (['save', 'miss', 'goal'].includes(event.type)) pulse[side].shots += 1;
    });
    return pulse;
  }

  function eventIcon(type) {
    return ({goal: 'GOAL', save: 'SAVE', corner: 'CK', miss: 'SHOT', yellow: 'YC', red: 'RC', penalties: 'PEN'}[type] || 'LIVE');
  }

  function momentum(match) {
    const events = match.events || [];
    const values = Array.from({length: 28}, (_, index) => {
      const minute = ((index + 1) / 28) * Math.max(1, match.currentMinute || 1);
      const nearby = events.filter(event => Math.abs((event.minute || 0) - minute) < 5);
      const value = nearby.reduce((total, event) => total + (event.side === 'away' ? -1 : 1) * ({goal: 10, corner: 6, save: 7, miss: 5, dribble: 3, pass: 2}[event.type] || 1), 0);
      return Math.max(-14, Math.min(14, value));
    });
    return `<section class="match-momentum"><h3>Match Momentum</h3><div class="momentum-chart"><div class="momentum-midline"></div>${values.map(value => `<i class="${value >= 0 ? 'home' : 'away'}" style="height:${Math.max(2, Math.abs(value) * 3)}px;${value >= 0 ? 'bottom:50%' : 'top:50%'}"></i>`).join('')}</div><div class="momentum-labels"><span>${esc(match.home)}</span><span>${esc(match.away)}</span></div></section>`;
  }

  function liveDashboard(state, match, host) {
    const events = match.events || [];
    const latest = events[events.length - 1];
    const side = latest?.side || (latest?.team === match.away ? 'away' : 'home');
    const ballX = side === 'away' ? 25 : 75;
    const ballY = latest?.type === 'corner' ? 15 : 48;
    const speed = Number(state.tournament?.liveSpeed || 1);
    const attackTeam = latest?.team || match.home;
    const home = teamIdentity(state, match.home);
    const away = teamIdentity(state, match.away);
    const pulse = livePulse(events);
    const progress = Math.min(100, Math.max(0, Number(match.currentMinute || 0) / 90 * 100));
    return `<section class="live-match broadcast-live" id="liveMatch" data-match="${esc(match.id)}">
      <div class="broadcast-topline"><span><i></i> LIVE FROM THE KNOCKOUT STAGE</span><span>${esc(match.round)} · SERVER SYNC</span></div>
      <header class="broadcast-scoreboard">
        <div class="score-team home-team">${teamMark(home, 'home')}<strong>${esc(home.name)}</strong></div>
        <div class="score-core"><span class="live-badge">LIVE</span><div class="score-numbers"><b>${match.score?.home ?? 0}</b><i>–</i><b>${match.score?.away ?? 0}</b></div><time>${esc(match.currentMinute || 0)}'</time></div>
        <div class="score-team away-team"><strong>${esc(away.name)}</strong>${teamMark(away, 'away')}</div>
      </header>
      <div class="match-progress" aria-label="Match time"><i style="width:${progress}%"></i></div>
      <div class="broadcast-stage">
        <div class="broadcast-pitch"><div class="pitch-lights"></div><div class="broadcast-center-circle"></div><div class="broadcast-halfway"></div><div class="broadcast-box left"></div><div class="broadcast-box right"></div><div class="broadcast-flag top-left"></div><div class="broadcast-flag top-right"></div><div class="broadcast-flag bottom-left"></div><div class="broadcast-flag bottom-right"></div><div class="broadcast-ball" style="left:${ballX}%;top:${ballY}%"></div><div class="attack-overlay ${side}"><span class="event-siren">${eventIcon(latest?.type)}</span><i></i><div><b>${esc(attackTeam)}</b><span>${esc(attackLabel(latest))}</span><small>${esc(latest?.text || 'The match is under way')}</small></div></div><div class="pitch-caption"><span>TRANSFER AUCTION CUP</span><b>${esc(match.round)}</b></div></div>
        <aside class="live-pulse"><div class="pulse-heading"><span>LIVE PULSE</span><b>${events.length} EVENTS</b></div><div class="pulse-row"><span>${esc(home.name)}</span><b>${pulse.home.attacks}</b><i><em style="width:${Math.min(100, pulse.home.attacks * 10)}%"></em></i></div><div class="pulse-row away"><span>${esc(away.name)}</span><b>${pulse.away.attacks}</b><i><em style="width:${Math.min(100, pulse.away.attacks * 10)}%"></em></i></div><div class="pulse-split"><div><b>${pulse.home.shots}</b><span>SHOTS</span></div><div><b>${pulse.away.shots}</b><span>SHOTS</span></div></div><p>Pressure is recalculated with every server event.</p></aside>
      </div>
      ${momentum(match)}
      <div class="live-controls"><span><i class="sync-dot"></i> The match engine is broadcasting every key moment.</span>${host ? `<div class="live-speed"><small>LIVE SPEED</small>${[0.5, 1, 1.5, 2, 3].map(value => `<button class="live-speed-btn ${speed === value ? 'active' : ''}" data-speed="${value}">×${value}</button>`).join('')}</div>` : ''}</div>
      <div class="live-commentary"><div class="commentary-title"><span>COMMENTARY FEED</span><b>NOW</b></div>${[...events].reverse().slice(0, 4).map(event => `<div class="live-event ${esc(event.type || '')}"><b>${event.minute}'</b><i>${eventIcon(event.type)}</i><span>${esc(event.team ? `${event.team} — ` : '')}${esc(event.text)}</span></div>`).join('') || '<div class="commentary-empty">Kick-off. The first key moment is coming...</div>'}</div>
    </section>`;
  }

  function playReplay(state, match) {
    clearInterval(replayTimer);
    const root = document.getElementById('liveMatch');
    if (!root) return;
    const events = [...(match.events || [])].sort((left, right) => left.minute - right.minute);
    const commentary = root.querySelector('#liveCommentary');
    const ball = root.querySelector('#liveBall');
    const minute = root.querySelector('#liveMinute');
    const homeScore = root.querySelector('#liveHomeScore');
    const awayScore = root.querySelector('#liveAwayScore');
    const status = root.querySelector('#liveStatus');
    let index = 0;
    let homeGoals = 0;
    let awayGoals = 0;
    root.querySelector('#replayStart').disabled = true;
    status.textContent = 'The match is live.';

    const showEvent = event => {
      const side = event.side || (event.team === match.away ? 'away' : 'home');
      minute.textContent = `${event.minute}'`;
      if (event.type === 'goal') {
        if (side === 'home') homeGoals += 1;
        if (side === 'away') awayGoals += 1;
        homeScore.textContent = homeGoals;
        awayScore.textContent = awayGoals;
      }
      const attackingHome = side !== 'away';
      const x = attackingHome ? 66 + Math.random() * 22 : 12 + Math.random() * 22;
      const y = event.type === 'corner' ? 8 + Math.random() * 84 : 25 + Math.random() * 50;
      ball.style.left = `${x}%`;
      ball.style.top = `${y}%`;
      root.querySelectorAll('.live-player.active').forEach(element => element.classList.remove('active'));
      [event.player, event.target].filter(Boolean).forEach(name => {
        [...root.querySelectorAll('.live-player')].find(element => element.dataset.name === name)?.classList.add('active');
      });
      const item = document.createElement('div');
      item.className = `live-event ${event.type || ''}`;
      item.innerHTML = `<b>${event.minute}'</b><span>${esc(event.team ? `${event.team} — ` : '')}${esc(event.text)}</span>`;
      commentary.prepend(item);
      if (commentary.children.length > 7) commentary.lastElementChild.remove();
    };

    const tick = () => {
      if (index >= events.length) {
        clearInterval(replayTimer);
        minute.textContent = "FT";
        homeScore.textContent = match.score?.home ?? homeGoals;
        awayScore.textContent = match.score?.away ?? awayGoals;
        status.textContent = match.penalties ? `Full time — decided on penalties (${match.penalties.home}-${match.penalties.away}).` : 'Full time.';
        root.querySelector('#replayStart').disabled = false;
        root.querySelector('#replayStart').textContent = 'PLAY AGAIN';
        return;
      }
      showEvent(events[index]);
      index += 1;
    };
    tick();
    replayTimer = setInterval(tick, 850);
  }

  function renderTournament() {
    let container = document.getElementById('tournamentView');
    const room = document.getElementById('room');
    if (!room) return;
    if (!container) {
      container = document.createElement('section');
      container.id = 'tournamentView';
      room.appendChild(container);
    }
    const state = GAME()?.getState?.();
    if (state?.phase !== 'tournament' || !state.tournament) {
      clearInterval(replayTimer);
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    const host = state.host === GAME()?.getMe?.();
    const matches = state.tournament.matches || [];
    const champion = state.tournament.champion;
    const selected = matches.find(match => match.id === container.dataset.report) || matches.find(match => match.status === 'finished');
    const replay = matches.find(match => match.id === container.dataset.replay);
    const liveMatch = matches.find(match => match.status === 'live');
    if (liveMatch) clearInterval(replayTimer);
    container.innerHTML = `<div class="tournament-heading"><div><div class="eyebrow">PHASE 4 · SERVER SIMULATION</div><h2>League Tournament</h2><p>Every manager plays each opponent once · Seed #${esc(state.tournament.seed)} · results are authoritative and synchronized live.</p></div>${champion ? `<div class="champion">CHAMPION <b>${esc(champion)}</b>${host ? '<button class="btn-primary open-results">VIEW FINAL RESULTS</button>' : ''}</div>` : ''}</div>
      <div class="bracket">${matches.map(match => matchCard(match, host)).join('')}</div>${champion ? leaderboard(matches) : ''}${liveMatch ? liveDashboard(state, liveMatch, host) : replay?.status === 'finished' ? liveReplay(state, replay) : selected?.status === 'finished' ? report(selected) : ''}`;
    const bracket = container.querySelector('.bracket');
    const rounds = [...new Set(matches.map(match => match.round))];
    const cards = [...bracket.children];
    bracket.className = 'bracket bracket-tree';
    bracket.innerHTML = rounds.map(round => `<div class="bracket-round"><h3>${esc(round)}</h3><div class="round-matches"></div></div>`).join('') + '<div class="bracket-trophy">🏆<small>CHAMPION</small></div>';
    matches.forEach((match, index) => bracket.querySelectorAll('.round-matches')[rounds.indexOf(match.round)]?.appendChild(cards[index]));
    bracket.querySelectorAll('.match-team span').forEach(label => {
      const team = state.teams?.[label.textContent];
      if (!team) return;
      const name = team.displayName || label.textContent;
      label.innerHTML = `${team.logo ? `<img class="bracket-logo" src="${esc(team.logo)}" alt="">` : '<i class="bracket-logo placeholder"></i>'}${esc(name)}`;
    });
    const heading = container.querySelector('.tournament-heading h2');
    const description = container.querySelector('.tournament-heading p');
    if (heading) heading.textContent = 'Knockout Tournament';
    if (description) description.textContent = `Single-elimination bracket · Seed #${state.tournament.seed} · results are authoritative and synchronized live.`;
    const drawKey = `${state.tournament.seed}-${matches.length}`;
    if (!champion && container.dataset.drawKey !== drawKey && matches.length) {
      container.dataset.drawKey = drawKey;
      reveal('The draw is in', matches[0].home, matches[0].away);
    }
    if (champion && container.dataset.championKey !== champion) {
      container.dataset.championKey = champion;
      reveal('And the champion is...', champion, '', true);
    }
    container.querySelectorAll('.start-live-match').forEach(button => button.onclick = async () => {
      if (button.disabled) return;
      button.disabled = true;
      try {
        await GAME()?.playTournamentCinematic?.(button.dataset.match);
        await GAME()?.action?.('start_live_match', {name: button.dataset.match});
      } catch (_) {
        button.disabled = false;
      }
    });
    container.querySelector('.open-results')?.addEventListener('click', () => GAME()?.action?.('open_final_results').catch(() => {}));
    container.querySelectorAll('.live-speed-btn').forEach(button => button.onclick = () => GAME()?.action?.('set_live_speed', {amount: Number(button.dataset.speed)}).catch(() => {}));
    container.querySelectorAll('.match-details').forEach(button => button.onclick = () => { clearInterval(replayTimer); delete container.dataset.replay; container.dataset.report = button.dataset.match; renderTournament(); });
    container.querySelectorAll('.watch-live').forEach(button => button.onclick = () => { clearInterval(replayTimer); container.dataset.replay = button.dataset.match; renderTournament(); });
    container.querySelector('#replayStart')?.addEventListener('click', () => playReplay(state, replay));
    container.querySelector('#replayReset')?.addEventListener('click', () => { clearInterval(replayTimer); renderTournament(); });
  }

  window.renderTournament = renderTournament;
  renderTournament();
})();
