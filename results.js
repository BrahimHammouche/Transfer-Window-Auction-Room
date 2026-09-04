(() => {
  const GAME = () => window.__game;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

  function launchCelebration(view, results) {
    const key = `${results.champion}-${results.generatedAt}`;
    if (view.dataset.celebration === key) return;
    view.dataset.celebration = key;
    const layer = document.createElement('div');
    layer.className = 'confetti-layer';
    const colors = ['#55C7FF', '#F2C94C', '#9A8CFF', '#63C98B', '#F07B6A'];
    for (let index = 0; index < 72; index += 1) {
      const piece = document.createElement('i');
      piece.style.setProperty('--x', `${Math.random() * 100}%`);
      piece.style.setProperty('--r', `${Math.random() * 540 - 270}deg`);
      piece.style.setProperty('--d', `${1.8 + Math.random() * 1.8}s`);
      piece.style.setProperty('--delay', `${Math.random() * .45}s`);
      piece.style.background = colors[index % colors.length];
      layer.appendChild(piece);
    }
    view.prepend(layer);
    setTimeout(() => layer.remove(), 4500);
  }

  function renderResults() {
    const room = document.getElementById('room');
    if (!room) return;
    let view = document.getElementById('finalResultsView');
    if (!view) {
      view = document.createElement('section');
      view.id = 'finalResultsView';
      room.appendChild(view);
    }
    const state = GAME()?.getState?.();
    const results = state?.results;
    if (state?.phase !== 'results' || !results) {
      view.style.display = 'none';
      return;
    }
    view.style.display = 'block';
    const records = results.records || {};
    const order = Object.keys(records).sort((left, right) => (results.managerScores?.[right] || 0) - (results.managerScores?.[left] || 0));
    const scorer = results.awards?.topScorer;
    view.innerHTML = `<section class="results-hero"><div class="eyebrow">FINAL RESULTS · TOURNAMENT COMPLETE</div><span class="results-crown">★</span><h2>${esc(results.champion || 'Tournament')} Champion</h2><p>${esc(results.champion || '')}</p></section>
      <div class="results-awards"><article><small>BEST MANAGER</small><b>${esc(results.bestManager)}</b><span>${Number(results.bestManagerScore || 0).toFixed(1)} combined score</span></article><article><small>TOP SCORER</small><b>${esc(scorer?.name || 'No scorer')}</b><span>${scorer ? `${scorer.goals} goal${scorer.goals === 1 ? '' : 's'}` : '—'}</span></article><article><small>BEST ATTACK</small><b>${esc(results.awards?.bestAttack || '—')}</b><span>${records[results.awards?.bestAttack]?.goalsFor || 0} goals scored</span></article><article><small>BEST DEFENCE</small><b>${esc(results.awards?.bestDefence || '—')}</b><span>${records[results.awards?.bestDefence]?.goalsAgainst || 0} goals conceded</span></article></div>
      <section class="results-table-wrap"><div class="results-table-head"><h3>Tournament Record</h3><span>Manager score combines evaluation and tournament performance.</span></div><div class="results-table"><div class="results-row labels"><span>Team</span><span>P</span><span>W</span><span>GF</span><span>GA</span><span>xG</span><span>Poss</span><span>Manager</span></div>${order.map((name, index) => { const record = records[name]; return `<div class="results-row ${name === results.champion ? 'champion-row' : ''}"><strong>${index + 1}. ${esc(name)}${name === results.champion ? ' ★' : ''}</strong><span>${record.played}</span><span>${record.wins}</span><span>${record.goalsFor}</span><span>${record.goalsAgainst}</span><span>${Number(record.xg).toFixed(2)}</span><span>${Number(record.averagePossession).toFixed(0)}%</span><b>${Number(results.managerScores?.[name] || 0).toFixed(1)}</b></div>`; }).join('')}</div></section>`;
    launchCelebration(view, results);
  }

  window.renderResults = renderResults;
  renderResults();
})();
