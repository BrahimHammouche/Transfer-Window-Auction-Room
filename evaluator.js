(() => {
  const GAME = () => window.__game;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

  function metricBars(metrics) {
    return Object.entries(metrics || {}).map(([label, value]) => `<div class="eval-metric"><span>${esc(label)}</span><b>${Number(value).toFixed(0)}</b><i><em style="width:${Math.max(0, Math.min(100, value))}%"></em></i></div>`).join('');
  }

  function teamCard(name, team) {
    const character = GAME()?.getState?.()?.teams?.[name]?.character || 'tactician';
    const portrait = GAME()?.managerAvatar?.(character) || '⚽';
    return `<article class="eval-card rank-${team.rank}">
      <div class="eval-card-head"><span class="eval-rank">#${team.rank}</span><div><h3>${esc(name)}</h3><small>${esc(team.formation)} · ${esc(team.attackStyle)} · ${esc(team.defenceStyle)}</small></div><strong>${Number(team.overall).toFixed(1)}</strong></div>
      <div class="eval-card-art eval-rival-window" aria-hidden="true"><div class="eval-rival-figure"><div class="manager-3d-preview" data-character="${esc(character)}" data-outcome="${team.rank === 1 ? 'winner' : 'lost'}"></div><div class="manager-svg-fallback">${portrait}</div></div><span class="eval-rival-gesture">✦</span><b>${team.rank === 1 ? 'ON TOP' : 'WATCH ME'}</b><i></i><i></i><i></i></div>
      <div class="eval-stats"><span>OVR <b>${Number(team.averageRating).toFixed(1)}</b></span><span>ATT <b>${Number(team.attackStrength).toFixed(0)}</b></span><span>DEF <b>${Number(team.defenceStrength).toFixed(0)}</b></span><span>PAS <b>${Number(team.passing).toFixed(0)}</b></span></div>
      <div class="eval-metrics">${metricBars(team.metrics)}</div>
      <div class="eval-notes"><p><b>Strengths</b>${(team.strengths || []).map(esc).join(' · ')}</p><p class="risk"><b>Risks</b>${(team.risks || []).map(esc).join(' · ')}</p></div>
    </article>`;
  }

  function rivalryStage(ranking) {
    if (ranking.length < 2) return '';
    const teams = GAME()?.getState?.()?.teams || {};
    const left = ranking[0], right = ranking[1];
    const avatar = name => GAME()?.managerAvatar?.(teams[name]?.character || 'tactician') || '⚽';
    const leftCharacter = teams[left]?.character || 'tactician', rightCharacter = teams[right]?.character || 'analyst';
    return `<section class="eval-rivalry-stage" aria-label="Animated 3D manager rivalry window"><div class="rivalry-caption"><span>PHASE 3 · 3D RIVALRY WINDOW</span><b>Face to face</b></div><div class="rivalry-spotlight"></div><div class="rivalry-manager rivalry-manager-left"><div class="rivalry-bubble">YOU CALL THAT A SQUAD?</div><div class="rivalry-laugh">HA!</div><div class="rivalry-3d" data-character="${esc(leftCharacter)}" data-side="left" data-outcome="winner" aria-hidden="true"></div><div class="rivalry-svg-fallback">${avatar(left)}</div><strong>${esc(left)}</strong></div><div class="rivalry-vs">VS</div><div class="rivalry-manager rivalry-manager-right"><div class="rivalry-bubble">KEEP WATCHING.</div><div class="rivalry-laugh">HA!</div><div class="rivalry-3d" data-character="${esc(rightCharacter)}" data-side="right" data-outcome="lost" aria-hidden="true"></div><div class="rivalry-svg-fallback">${avatar(right)}</div><strong>${esc(right)}</strong></div></section>`;
  }

  function renderEvaluator() {
    const room = document.getElementById('room');
    if (!room) return;
    let view = document.getElementById('evaluationView');
    if (!view) {
      view = document.createElement('section');
      view.id = 'evaluationView';
      room.appendChild(view);
    }
    const state = GAME()?.getState?.();
    if (state?.phase !== 'evaluation') {
      view.style.display = 'none';
      return;
    }
    view.style.display = 'block';
    const host = state.host === GAME()?.getMe?.();
    const evaluation = state.evaluation;
    if (!evaluation) {
      view.innerHTML = `<div class="evaluation-empty"><div class="eyebrow">PHASE 3 · TEAM EVALUATION</div><h2>Ready to evaluate the managers</h2><p>The server will score squad quality, positional fit, formation coverage, tactical coherence, attack, defence, balance, and budget efficiency.</p>${host ? '<button class="btn-primary" id="calculateEvaluation">CALCULATE TEAM EVALUATION</button>' : '<span>Waiting for the host to calculate the rankings.</span>'}</div>`;
      view.querySelector('#calculateEvaluation')?.addEventListener('click', () => GAME()?.action?.('calculate_evaluation').catch(() => {}));
      return;
    }
    const teams = evaluation.teams || {};
    const ranking = evaluation.ranking || [];
    window.rivalry3D?.dispose?.(view);
    view.innerHTML = `<div class="evaluation-heading"><div><div class="eyebrow">PHASE 3 · SERVER EVALUATION</div><h2>Manager Rankings</h2><p>Scores use squad attributes, assigned roles, formation, tactics, and auction spending.</p></div>${host ? '<button class="btn-primary" id="startTournament">START LIVE TOURNAMENT</button>' : ''}</div>${rivalryStage(ranking)}<div class="evaluation-grid">${ranking.map(name => teamCard(name, teams[name])).join('')}</div>`;
    requestAnimationFrame(() => window.rivalry3D?.scan?.());
    view.querySelector('#startTournament')?.addEventListener('click', () => {
      GAME()?.confirm?.('Start the live tournament?', 'Team tactics and evaluation will lock for every manager.').then(ok => {
        if (ok) GAME()?.action?.('start_tournament').catch(() => {});
      });
    });
  }

  window.renderEvaluator = renderEvaluator;
  renderEvaluator();
})();
