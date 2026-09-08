(() => {
  const FORMATIONS = {
    '4-3-3': [['GK',50,90],['LB',17,68],['CB',38,72],['CB',62,72],['RB',83,68],['CM',35,53],['CM',50,48],['CM',65,53],['LW',22,27],['ST',50,20],['RW',78,27]],
    '4-2-3-1': [['GK',50,90],['LB',17,68],['CB',38,72],['CB',62,72],['RB',83,68],['CDM',40,55],['CDM',60,55],['LW',22,35],['CAM',50,39],['RW',78,35],['ST',50,20]],
    '4-4-2': [['GK',50,90],['LB',17,68],['CB',38,72],['CB',62,72],['RB',83,68],['LM',18,48],['CM',40,50],['CM',60,50],['RM',82,48],['ST',42,23],['ST',58,23]],
    '3-5-2': [['GK',50,90],['CB',28,70],['CB',50,74],['CB',72,70],['LWB',13,48],['CM',35,51],['CDM',50,55],['CM',65,51],['RWB',87,48],['ST',42,23],['ST',58,23]],
    '3-4-3': [['GK',50,90],['CB',28,70],['CB',50,74],['CB',72,70],['LM',20,52],['CM',40,54],['CM',60,54],['RM',80,52],['LW',23,27],['ST',50,20],['RW',77,27]],
    '4-1-4-1': [['GK',50,90],['LB',17,68],['CB',38,72],['CB',62,72],['RB',83,68],['CDM',50,60],['LM',18,42],['CM',39,45],['CM',61,45],['RM',82,42],['ST',50,20]]
  };
  const ROLES = ['GK','LB','LWB','CB','RWB','RB','CDM','CM','CAM','LM','RM','LW','RW','CF','SS','ST'];
  const ATTACK_STYLES = ['Balanced','Possession','Direct','Counter-Attack','Wide'];
  const DEFENCE_STYLES = ['Balanced','High Press','Mid Block','Low Block','Counter-Press'];
  // Lightweight club-kit palette for the tactics board. Auction cards keep the real portraits.
  const KIT_BY_PLAYER = {
    lamine_yamal:'barca',pedri:'barca',raphinha:'barca',frenkie_de_jong:'barca',jules_kound:'barca',pau_cubars:'barca',ronald_araujo:'barca',marc_andre_ter_stegen:'barca',gavi:'barca',
    kylian_mbapp:'real',jude_bellingham:'real',thibaut_courtois:'real',federico_valverde:'real',rodrygo:'real',vinicius_junior:'real',aurelien_tchouameni:'real',dani_carvajal:'real',antonio_rudiger:'real',dani_ceballos:'real',
    erling_haaland:'city',rodri:'city',phil_foden:'city',jo_ko_gvardiol:'city',ederson:'city',john_stones:'city',jeremy_doku:'city',savinho:'city',
    ousmane_demb_l:'psg',vitinha:'psg',nuno_mendes:'psg',willian_pacho:'psg',achraf_hakimi:'psg',marquinhos:'psg',jo_o_neves:'psg',bradley_barcola:'psg',kvaratskhelia:'psg',gianluigi_donnarumma:'psg',
    harry_kane:'bayern',michael_olise:'bayern',joshua_kimmich:'bayern',jamal_musiala:'bayern',kim_min_jae:'bayern',alphonso_davies:'bayern',dayot_upamecano:'bayern',leroy_sane:'bayern',leon_goretzka:'bayern',
    virgil_van_dijk:'liverpool',mohamed_salah:'liverpool',alisson:'liverpool',luis_d_az:'liverpool',luis_diaz:'liverpool',alexis_mac_allister:'liverpool',ryan_gravenberch:'liverpool',ibrahima_konate:'liverpool',andrew_robertson:'liverpool',darwin_nunez:'liverpool',
    declan_rice:'arsenal',william_saliba:'arsenal',bukayo_saka:'arsenal',martin_degaard:'arsenal',martin_odegaard:'arsenal',david_raya:'arsenal',gabriel_magalhaes:'arsenal',
    cole_palmer:'chelsea',mois_s_caicedo:'chelsea',moises_caicedo:'chelsea',marc_cucurella:'chelsea',enzo_fern_ndez:'chelsea',enzo_fernandez:'chelsea',
    bruno_fernandes:'united',matthijs_de_ligt:'united',lisandro_martinez:'united',bryan_mbeumo:'united',
    lautaro_mart_nez:'inter',lautaro_martinez:'inter',alessandro_bastoni:'inter',nicolo_barella:'inter',
    mike_maignan:'milan',rafael_leao:'milan',matteo_gabbia:'milan',
    cristian_romero:'spurs',micky_van_de_ven:'spurs',son_heung_min:'spurs',
    bruno_guimar_es:'newcastle',bruno_guimaraes:'newcastle',sandro_tonali:'newcastle',alexander_isak:'newcastle',
    florian_wirtz:'leverkusen',jeremie_frimpong:'leverkusen',alex_grimaldo:'leverkusen',
    robert_lewandowski:'barca',joao_cancelo:'city',kevin_de_bruyne:'city',scott_mctominay:'napoli',viktor_gy_keres:'sporting',victor_osimhen:'galatasaray',karim_benzema:'ittihad',sergej_milinkovic_savic:'hilal',lionel_messi:'miami'
  };
  const KIT_IMAGES = {
    barca:'https://coliseumsports.com/cdn/shop/files/AURORA_HJ4544-456_PHSFH001-3144.png?v=1751307667',
    real:'https://static.wikia.nocookie.net/the-football-database/images/8/83/Real_Madrid_2025-26_home.png/revision/latest?cb=20250908055249',
    city:'https://shop.mancity.com/dw/image/v2/BDWJ_PRD/on/demandware.static/-/Sites-master-catalog-MAN/default/dw844e69f0/images/large/701237106001_pp_01_mcfc.png?sh=400&sm=fit&sw=400',
    bayern:'https://europeansports.com/cdn/shop/files/JJ2137_1_APPAREL_Photography_FrontCenterView_transparent.png?v=1749586910',
    arsenal:'https://soccerpost.com/cdn/shop/files/JI9516_b2b032_pdp.png_clipped_rev_1.png?v=1748628926&width=1440',
    psg:'https://gaming.uefa.com/en/uclfantasy/static-assets/ucl2020/images/player-jersey/52747.png?v=0.38',
    chelsea:'https://soccerpost.com/cdn/shop/files/AURORA_HJ4543-496_PHSFH001-2000_clipped_rev_1.png?v=1747839553',
    inter:'https://futnetshop.com/cdn/shop/files/517f0f459fcb6522.webp?v=1741379853',
    liverpool:'https://classicfootballshirts.co.uk/pub/media/catalog/product/4/0/4068805368998-1_pybhwizkf4vewust.jpg',
    united:'https://gaming.uefa.com/en/uclfantasy/static-assets/ucl2020/images/player-jersey/52682.png?v=0.38',
    milan:'https://gaming.uefa.com/en/uclfantasy/static-assets/ucl2020/images/player-jersey/50058.png?v=0.38',
    spurs:'https://gaming.uefa.com/en/uclfantasy/static-assets/ucl2020/images/player-jersey/1652.png?v=0.38',
    newcastle:'https://gaming.uefa.com/en/uclfantasy/static-assets/ucl2020/images/player-jersey/52921.png?v=0.38',
    leverkusen:'https://gaming.uefa.com/en/uclfantasy/static-assets/ucl2020/images/player-jersey/50109.png?v=0.38',
    napoli:'https://gaming.uefa.com/en/uclfantasy/static-assets/ucl2020/images/player-jersey/50136.png?v=0.38',
    sporting:'https://gaming.uefa.com/en/uclfantasy/static-assets/ucl2020/images/player-jersey/50150.png?v=0.38',
    galatasaray:'https://gaming.uefa.com/en/uclfantasy/static-assets/ucl2020/images/player-jersey/50067.png?v=0.38'
  };
  const GAME = () => window.__game;
  const drafts = new Map();
  const selected = new Map();
  let saveTimer = null;

  const copy = value => JSON.parse(JSON.stringify(value));
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function defaults(value = {}) { return {formation:'4-3-3',attackStyle:'Balanced',defenceStyle:'Balanced',pressing:50,tempo:50,width:50,positions:{},roles:{},...value,positions:{...(value.positions || {})},roles:{...(value.roles || {})}}; }
  function formation(tactics) { return FORMATIONS[tactics.formation] || FORMATIONS['4-3-3']; }
  function playerId(player, index) { return String(player.id ?? player.name ?? index); }
  function draftFor(teamName, team) {
    if (!drafts.has(teamName)) drafts.set(teamName, defaults(copy(team.tactics || {})));
    return drafts.get(teamName);
  }
  function resetPositions(team, tactics) {
    tactics.positions = {}; tactics.roles = {};
    (team.squad || []).forEach((player, index) => {
      const slot = formation(tactics)[index]; if (!slot) return;
      const id = playerId(player, index);
      tactics.positions[id] = {x:slot[1], y:slot[2]}; tactics.roles[id] = slot[0];
    });
  }
  function saveSoon(teamName, tactics) {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => GAME()?.saveTactics?.(copy(tactics)).catch(() => {}), 500);
  }
  function saveNow(tactics) { clearTimeout(saveTimer); return GAME()?.saveTactics?.(copy(tactics)).catch(() => {}); }

  function renderTactics() {
    const room = document.getElementById('room'); if (!room) return;
    let editor = document.getElementById('tacticsEditor');
    if (!editor) { editor = document.createElement('section'); editor.id = 'tacticsEditor'; room.appendChild(editor); }
    const state = GAME()?.getState?.();
    if (!state?.teams || state.phase !== 'tactics') { editor.style.display = 'none'; return; }
    editor.style.display = 'block';
    const names = Object.keys(state.teams); const me = GAME()?.getMe?.();
    let teamName = editor.dataset.team;
    if (!names.includes(teamName)) teamName = names.includes(me) ? me : names[0];
    const team = state.teams[teamName]; const editable = GAME()?.canEditTeam?.(teamName) ?? teamName === me;
    const tactics = draftFor(teamName, team); editor.dataset.team = teamName;
    const selectedId = selected.get(teamName) || '';
    editor.innerHTML = `<div class="tactics-toolbar"><div class="tactics-control"><label>Team</label><select id="tacticsTeam">${names.map(name => `<option value="${escapeHTML(name)}" ${name === teamName ? 'selected' : ''}>${escapeHTML(name)}</option>`).join('')}</select></div><div class="tactics-control"><label>Formation</label><select id="tacticsFormation" ${editable ? '' : 'disabled'}>${Object.keys(FORMATIONS).map(name => `<option value="${name}" ${name === tactics.formation ? 'selected' : ''}>${name}</option>`).join('')}</select></div><div class="tactics-control"><label>Attack</label><select id="tacticsAttack" ${editable ? '' : 'disabled'}>${ATTACK_STYLES.map(name => `<option value="${name}" ${name === tactics.attackStyle ? 'selected' : ''}>${name}</option>`).join('')}</select></div><div class="tactics-control"><label>Defence</label><select id="tacticsDefence" ${editable ? '' : 'disabled'}>${DEFENCE_STYLES.map(name => `<option value="${name}" ${name === tactics.defenceStyle ? 'selected' : ''}>${name}</option>`).join('')}</select></div>${[['Pressing','pressing'],['Tempo','tempo'],['Width','width']].map(([label,key]) => `<div class="tactics-control"><label>${label} <span id="${key}Value" class="tactics-value">${tactics[key]}</span></label><input id="tactics${key[0].toUpperCase() + key.slice(1)}" class="tactics-range" type="range" min="0" max="100" value="${tactics[key]}" ${editable ? '' : 'disabled'}></div>`).join('')}<div class="tactics-actions"><button id="saveTactics" ${editable ? '' : 'disabled'}>${editable ? 'Save tactics' : 'View only'}</button><button id="resetTactics" ${editable ? '' : 'disabled'}>Reset positions</button></div></div><div class="tactics-rolebar"><strong>Selected player:</strong><span id="selectedPlayerName">None</span><select id="selectedRole" ${editable && selectedId ? '' : 'disabled'}><option value="">Choose role</option>${ROLES.map(role => `<option value="${role}">${role}</option>`).join('')}</select></div><div class="tactics-pitch-wrap"><div class="tactics-pitch" id="tacticsPitch"><div class="tactics-line top"></div><div class="tactics-line bottom"></div><div class="tactics-line left"></div><div class="tactics-line right"></div></div></div><div class="tactics-help">Click one player, then click another player to swap their places. Select any formation, then reset positions to apply its shape.</div>`;
    const pitch = editor.querySelector('#tacticsPitch');
    function drawPlayers() {
      pitch.querySelectorAll('.tactic-player').forEach(node => node.remove());
      (team.squad || []).forEach((player, index) => {
        const id = playerId(player, index), slot = formation(tactics)[index] || ['CM',50,50], position = tactics.positions[id] || {x:slot[1],y:slot[2]}, role = tactics.roles[id] || slot[0];
        const kit = KIT_BY_PLAYER[player.id] || '';
        const node = document.createElement('div'); node.className = `tactic-player role-${role.toLowerCase()}${kit ? ` kit-${kit}` : ''}${selected.get(teamName) === id ? ' selected' : ''}`; node.dataset.id = id;
        node.style.left = `${Math.max(5, Math.min(95, position.x))}%`; node.style.top = `${Math.max(7, Math.min(93, position.y))}%`;
        node.innerHTML = `<span class="tp-kit ${KIT_IMAGES[kit] ? 'has-kit-image' : ''}" aria-hidden="true">${KIT_IMAGES[kit] ? `<img src="${KIT_IMAGES[kit]}" alt="" onerror="this.parentElement.classList.remove('has-kit-image');this.remove()">` : ''}</span><span class="tp-name">${escapeHTML(player.name)}</span><span class="tp-role">${escapeHTML(role)} · OVR ${escapeHTML(GAME()?.playerScore?.(player) ?? '')}</span>`;
        pitch.appendChild(node);
      });
    }
    function updateSelection() {
      const id = selected.get(teamName); const player = (team.squad || []).find((item, index) => playerId(item, index) === id);
      editor.querySelector('#selectedPlayerName').textContent = player?.name || 'None'; editor.querySelector('#selectedRole').value = player ? (tactics.roles[id] || '') : '';
    }
    drawPlayers(); updateSelection();
    pitch.querySelectorAll('.tactic-player').forEach(node => node.addEventListener('click', () => {
      if (!editable) return;
      const nextId = node.dataset.id, currentId = selected.get(teamName);
      if (currentId === nextId) { selected.delete(teamName); renderTactics(); return; }
      if (!currentId) { selected.set(teamName, nextId); renderTactics(); return; }
      const firstIndex = (team.squad || []).findIndex((player, index) => playerId(player, index) === currentId);
      const secondIndex = (team.squad || []).findIndex((player, index) => playerId(player, index) === nextId);
      if (firstIndex < 0 || secondIndex < 0) return;
      const firstSlot = formation(tactics)[firstIndex] || ['CM',50,50], secondSlot = formation(tactics)[secondIndex] || ['CM',50,50];
      const firstPosition = tactics.positions[currentId] || {x:firstSlot[1],y:firstSlot[2]};
      const secondPosition = tactics.positions[nextId] || {x:secondSlot[1],y:secondSlot[2]};
      tactics.positions[currentId] = secondPosition; tactics.positions[nextId] = firstPosition;
      selected.delete(teamName); saveSoon(teamName, tactics); renderTactics();
    }));
    editor.querySelector('#tacticsTeam').onchange = event => { editor.dataset.team = event.target.value; renderTactics(); };
    editor.querySelector('#tacticsFormation').onchange = event => { tactics.formation = event.target.value; resetPositions(team, tactics); selected.delete(teamName); saveSoon(teamName,tactics); renderTactics(); };
    [['tacticsAttack','attackStyle'],['tacticsDefence','defenceStyle']].forEach(([id,key]) => editor.querySelector(`#${id}`).onchange = event => { tactics[key] = event.target.value; saveSoon(teamName,tactics); });
    [['Pressing','pressing'],['Tempo','tempo'],['Width','width']].forEach(([label,key]) => editor.querySelector(`#tactics${label}`).oninput = event => { tactics[key] = Number(event.target.value); editor.querySelector(`#${key}Value`).textContent = event.target.value; saveSoon(teamName,tactics); });
    editor.querySelector('#selectedRole').onchange = event => { const id = selected.get(teamName); if (!id) return; tactics.roles[id] = event.target.value; saveSoon(teamName,tactics); renderTactics(); };
    editor.querySelector('#saveTactics').onclick = () => saveNow(tactics);
    editor.querySelector('#resetTactics').onclick = () => { resetPositions(team,tactics); saveNow(tactics); renderTactics(); };
  }
  window.renderTactics = renderTactics;
  window.resetTacticsDrafts = () => { drafts.clear(); selected.clear(); clearTimeout(saveTimer); };
})();
