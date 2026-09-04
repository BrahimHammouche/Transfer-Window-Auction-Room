(() => {
  const GAME = () => window.__game;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));

  function metricBars(metrics) {
    return Object.entries(metrics || {}).map(([label, value]) => `<div class="eval-metric"><span>${esc(label)}</span><b>${Number(value).toFixed(0)}</b><i><em style="width:${Math.max(0, Math.min(100, value))}%"></em></i></div>`).join('');
  }

  function teamCard(name, team) {
    return `<article class="eval-card rank-${team.rank}">
      <div class="eval-card-head"><span class="eval-rank">#${team.rank}</span><div><h3>${esc(name)}</h3><small>${esc(team.formation)} · ${esc(team.attackStyle)} · ${esc(team.defenceStyle)}</small></div><strong>${Number(team.overall).toFixed(1)}</strong></div>
      <div class="eval-stats"><span>OVR <b>${Number(team.averageRating).toFixed(1)}</b></span><span>ATT <b>${Number(team.attackStrength).toFixed(0)}</b></span><span>DEF <b>${Number(team.defenceStrength).toFixed(0)}</b></span><span>PAS <b>${Number(team.passing).toFixed(0)}</b></span></div>
      <div class="eval-metrics">${metricBars(team.metrics)}</div>
      <div class="eval-notes"><p><b>Strengths</b>${(team.strengths || []).map(esc).join(' · ')}</p><p class="risk"><b>Risks</b>${(team.risks || []).map(esc).join(' · ')}</p></div>
    </article>`;
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
    view.innerHTML = `<div class="evaluation-heading"><div><div class="eyebrow">PHASE 3 · SERVER EVALUATION</div><h2>Manager Rankings</h2><p>Scores use squad attributes, assigned roles, formation, tactics, and auction spending.</p></div>${host ? '<button class="btn-primary" id="startTournament">START LIVE TOURNAMENT</button>' : ''}</div><div class="evaluation-grid">${ranking.map(name => teamCard(name, teams[name])).join('')}</div>`;
    view.querySelector('#startTournament')?.addEventListener('click', () => {
      if (confirm('Start the tournament? Team tactics and evaluation will be locked.')) GAME()?.action?.('start_tournament').catch(() => {});
    });
  }

  window.renderEvaluator = renderEvaluator;
  renderEvaluator();
})();
