(() => {
  const FORMATIONS = {
    "4-3-3": [
      ["GK",50,90],["LB",17,68],["CB",38,72],["CB",62,72],["RB",83,68],
      ["CM",35,53],["CM",50,48],["CM",65,53],
      ["LW",22,27],["ST",50,20],["RW",78,27]
    ],
    "4-2-3-1": [
      ["GK",50,90],["LB",17,68],["CB",38,72],["CB",62,72],["RB",83,68],
      ["CDM",40,55],["CDM",60,55],
      ["LW",22,35],["CAM",50,39],["RW",78,35],["ST",50,20]
    ],
    "4-4-2": [
      ["GK",50,90],["LB",17,68],["CB",38,72],["CB",62,72],["RB",83,68],
      ["LM",18,48],["CM",40,50],["CM",60,50],["RM",82,48],
      ["ST",42,23],["ST",58,23]
    ],
    "3-5-2": [
      ["GK",50,90],["CB",28,70],["CB",50,74],["CB",72,70],
      ["LWB",13,48],["CM",35,51],["CDM",50,55],["CM",65,51],["RWB",87,48],
      ["ST",42,23],["ST",58,23]
    ],
    "3-4-3": [
      ["GK",50,90],["CB",28,70],["CB",50,74],["CB",72,70],
      ["LM",20,52],["CM",40,54],["CM",60,54],["RM",80,52],
      ["LW",23,27],["ST",50,20],["RW",77,27]
    ],
    "4-1-4-1": [
      ["GK",50,90],["LB",17,68],["CB",38,72],["CB",62,72],["RB",83,68],
      ["CDM",50,60],
      ["LM",18,42],["CM",39,45],["CM",61,45],["RM",82,42],
      ["ST",50,20]
    ]
  };

  const ROLES = [
    "GK","LB","LWB","CB","RWB","RB",
    "CDM","CM","CAM","LM","RM",
    "LW","RW","CF","SS","ST"
  ];

  const ATTACK_STYLES = [
    "Balanced",
    "Possession",
    "Direct",
    "Counter-Attack",
    "Wide"
  ];

  const DEFENCE_STYLES = [
    "Balanced",
    "High Press",
    "Mid Block",
    "Low Block",
    "Counter-Press"
  ];

  const GAME = () => window.__game;
  const getState = () => GAME()?.getState?.();
  const save = () => Promise.resolve(GAME()?.saveState?.(getState())).catch(() => {});
  let saveTimer = null;
  const saveSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 350);
  };
  const selectedPlayerByTeam = new Map();

  function ensureTactics(team) {
    if (!team) return;

    team.tactics ??= {
      formation: "4-3-3",
      attackStyle: "Balanced",
      defenceStyle: "Balanced",
      pressing: 50,
      tempo: 50,
      width: 50,
      positions: {},
      roles: {}
    };

    team.tactics.positions ??= {};
    team.tactics.roles ??= {};
  }

  function getFormation(team) {
    return (
      FORMATIONS[team?.tactics?.formation || "4-3-3"] ||
      FORMATIONS["4-3-3"]
    );
  }

  function resetPositions(team) {
    ensureTactics(team);

    team.tactics.positions = {};
    team.tactics.roles = {};

    (team.squad || []).forEach((player, index) => {
      const id = String(
        player.id ??
        player.name ??
        index
      );

      const slot = getFormation(team)[index];

      if (!slot) return;

      team.tactics.positions[id] = {
        x: slot[1],
        y: slot[2]
      };

      team.tactics.roles[id] = slot[0];
    });
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(
      /[&<>"']/g,
      character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[character]
    );
  }

  function getPlayerOVR(player) {
    try {
      if (GAME()?.playerScore) {
        return GAME().playerScore(player);
      }
    } catch (_) {}

    return player.ovr ?? "";
  }

  function renderTactics() {
    const room = document.getElementById("room");

    if (!room) return;

    let editor = document.getElementById("tacticsEditor");

    if (!editor) {
      editor = document.createElement("section");
      editor.id = "tacticsEditor";
      room.appendChild(editor);
    }

    const state = getState();

    if (!state?.teams) {
      editor.innerHTML = "";
      return;
    }

    if (state.phase !== "tactics") {
      editor.style.display = "none";
      return;
    }
    editor.style.display = "block";

    const teamNames = Object.keys(state.teams);

    if (!teamNames.length) {
      editor.innerHTML = "";
      return;
    }

    let selectedTeam = editor.dataset.team;
    const me = GAME()?.getMe?.();

    if (!teamNames.includes(selectedTeam)) {
      selectedTeam = teamNames.includes(me) ? me : teamNames[0];
    }

    const team = state.teams[selectedTeam];
    const editable = GAME()?.canEditTeam?.(selectedTeam) ?? (selectedTeam === me);

    ensureTactics(team);

    editor.dataset.team = selectedTeam;

    editor.innerHTML = `
      <div class="tactics-toolbar">

        <div class="tactics-control">
          <label>Team</label>
          <select id="tacticsTeam">
            ${teamNames.map(name => `
              <option
                value="${escapeHTML(name)}"
                ${name === selectedTeam ? "selected" : ""}
              >
                ${escapeHTML(name)}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="tactics-control">
          <label>Formation</label>
          <select id="tacticsFormation" ${editable ? "" : "disabled"}>
            ${Object.keys(FORMATIONS).map(formation => `
              <option
                value="${formation}"
                ${team.tactics.formation === formation ? "selected" : ""}
              >
                ${formation}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="tactics-control">
          <label>Attack</label>
          <select id="tacticsAttack" ${editable ? "" : "disabled"}>
            ${ATTACK_STYLES.map(style => `
              <option
                value="${style}"
                ${team.tactics.attackStyle === style ? "selected" : ""}
              >
                ${style}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="tactics-control">
          <label>Defence</label>
          <select id="tacticsDefence" ${editable ? "" : "disabled"}>
            ${DEFENCE_STYLES.map(style => `
              <option
                value="${style}"
                ${team.tactics.defenceStyle === style ? "selected" : ""}
              >
                ${style}
              </option>
            `).join("")}
          </select>
        </div>

        <div class="tactics-control">
          <label>
            Pressing
            <span id="pressingValue" class="tactics-value">
              ${team.tactics.pressing}
            </span>
          </label>

          <input
            id="tacticsPressing"
            class="tactics-range"
            type="range"
            min="0"
            max="100"
            value="${team.tactics.pressing}"
            ${editable ? "" : "disabled"}
          >
        </div>

        <div class="tactics-control">
          <label>
            Tempo
            <span id="tempoValue" class="tactics-value">
              ${team.tactics.tempo}
            </span>
          </label>

          <input
            id="tacticsTempo"
            class="tactics-range"
            type="range"
            min="0"
            max="100"
            value="${team.tactics.tempo}"
            ${editable ? "" : "disabled"}
          >
        </div>

        <div class="tactics-control">
          <label>
            Width
            <span id="widthValue" class="tactics-value">
              ${team.tactics.width}
            </span>
          </label>

          <input
            id="tacticsWidth"
            class="tactics-range"
            type="range"
            min="0"
            max="100"
            value="${team.tactics.width}"
            ${editable ? "" : "disabled"}
          >
        </div>

        <div class="tactics-actions">
          <button id="saveTactics" ${editable ? "" : "disabled"}>
            ${editable ? "Save tactics" : "View only"}
          </button>

          <button id="resetTactics" type="button" ${editable ? "" : "disabled"}>
            Reset positions
          </button>
        </div>

      </div>

      <div class="tactics-rolebar">

        <strong>Selected player:</strong>

        <span id="selectedPlayerName">
          None
        </span>

        <select id="selectedRole" disabled>
          <option value="">
            Choose role
          </option>

          ${ROLES.map(role => `
            <option value="${role}">
              ${role}
            </option>
          `).join("")}

        </select>

      </div>

      <div class="tactics-pitch-wrap">

        <div
          class="tactics-pitch"
          id="tacticsPitch"
        >

          <div class="tactics-line top"></div>
          <div class="tactics-line bottom"></div>
          <div class="tactics-line left"></div>
          <div class="tactics-line right"></div>

        </div>

      </div>

      <div class="tactics-help">
        Drag players anywhere on the pitch.
        Click a player to select him and change his role.
        Tactics are saved with the room state.
      </div>
    `;

    const pitch = editor.querySelector("#tacticsPitch");

    let selectedPlayerId =
      selectedPlayerByTeam.get(selectedTeam) ||
      editor.dataset.selectedPlayer ||
      null;

    function syncSelectionUI() {
      const player = (team.squad || []).find((item, index) =>
        String(item.id ?? item.name ?? index) === selectedPlayerId
      );
      const selectedName = editor.querySelector("#selectedPlayerName");
      const roleSelect = editor.querySelector("#selectedRole");
      if (!player) {
        selectedPlayerId = null;
        selectedPlayerByTeam.delete(selectedTeam);
        delete editor.dataset.selectedPlayer;
      }
      selectedName.textContent = player?.name || "None";
      roleSelect.disabled = !player || !editable;
      roleSelect.value = player ? (team.tactics.roles[selectedPlayerId] || "") : "";
    }

    function drawPlayers() {
      pitch
        .querySelectorAll(".tactic-player")
        .forEach(element => element.remove());

      (team.squad || []).forEach((player, index) => {

        const id = String(
          player.id ??
          player.name ??
          index
        );

        const formationSlot =
          getFormation(team)[index] ||
          ["CM", 50, 50];

        const position =
          team.tactics.positions[id] || {
            x: formationSlot[1],
            y: formationSlot[2]
          };

        const role =
          team.tactics.roles[id] ||
          formationSlot[0];

        const element =
          document.createElement("div");

        element.className =
          "tactic-player" +
          (
            selectedPlayerId === id
              ? " selected"
              : ""
          );

        element.dataset.id = id;

        element.style.left =
          `${Math.max(
            5,
            Math.min(95, position.x)
          )}%`;

        element.style.top =
          `${Math.max(
            7,
            Math.min(93, position.y)
          )}%`;

        element.innerHTML = `
          <span class="tp-name">
            ${escapeHTML(player.name)}
          </span>

          <span class="tp-role">
            ${escapeHTML(role)}
          </span>

          <span class="tp-ovr">
            OVR ${escapeHTML(getPlayerOVR(player))}
          </span>
        `;

        pitch.appendChild(element);
      });
    }

    drawPlayers();
    syncSelectionUI();

    pitch
      .querySelectorAll(".tactic-player")
      .forEach(playerElement => {

        playerElement.addEventListener(
          "pointerdown",
          event => {

            if (!editable) return;
            event.preventDefault();

            selectedPlayerId =
              playerElement.dataset.id;

            editor.dataset.selectedPlayer = selectedPlayerId;
            selectedPlayerByTeam.set(selectedTeam, selectedPlayerId);

            drawPlayers();
            syncSelectionUI();

            const activePlayer =
              pitch.querySelector(
                `.tactic-player[data-id="${CSS.escape(
                  selectedPlayerId
                )}"]`
              );

            if (!activePlayer) return;

            const dragStart = {
              x: event.clientX,
              y: event.clientY
            };
            let didDrag = false;

            function movePlayer(moveEvent) {

              if (!didDrag) {
                const movedX = moveEvent.clientX - dragStart.x;
                const movedY = moveEvent.clientY - dragStart.y;
                if (Math.hypot(movedX, movedY) < 6) return;
                didDrag = true;
              }

              const rect =
                pitch.getBoundingClientRect();

              const x =
                Math.max(
                  5,
                  Math.min(
                    95,
                    (
                      (moveEvent.clientX -
                        rect.left) /
                      rect.width
                    ) * 100
                  )
                );

              const y =
                Math.max(
                  7,
                  Math.min(
                    93,
                    (
                      (moveEvent.clientY -
                        rect.top) /
                      rect.height
                    ) * 100
                  )
                );

              activePlayer.style.left =
                `${x}%`;

              activePlayer.style.top =
                `${y}%`;

              team.tactics.positions[
                selectedPlayerId
              ] = {
                x,
                y
              };
            }

            function stopDragging() {

              window.removeEventListener(
                "pointermove",
                movePlayer
              );

              if (didDrag) saveSoon();
            }

            window.addEventListener(
              "pointermove",
              movePlayer
            );

            window.addEventListener(
              "pointerup",
              stopDragging,
              { once: true }
            );
          }
        );
      });

    editor.querySelector(
      "#tacticsTeam"
    ).onchange = event => {

      editor.dataset.team =
        event.target.value;
      delete editor.dataset.selectedPlayer;

      renderTactics();
    };

    editor.querySelector(
      "#tacticsFormation"
    ).onchange = event => {

      team.tactics.formation =
        event.target.value;

      resetPositions(team);

      saveSoon();

      renderTactics();
    };

    editor.querySelector(
      "#tacticsAttack"
    ).onchange = event => {

      team.tactics.attackStyle =
        event.target.value;
      saveSoon();
    };

    editor.querySelector(
      "#tacticsDefence"
    ).onchange = event => {

      team.tactics.defenceStyle =
        event.target.value;
      saveSoon();
    };

    const rangeControls = [
      [
        "tacticsPressing",
        "pressing",
        "pressingValue"
      ],
      [
        "tacticsTempo",
        "tempo",
        "tempoValue"
      ],
      [
        "tacticsWidth",
        "width",
        "widthValue"
      ]
    ];

    rangeControls.forEach(
      ([inputId, stateKey, valueId]) => {

        editor.querySelector(
          "#" + inputId
        ).oninput = event => {

          team.tactics[stateKey] =
            Number(event.target.value);

          editor.querySelector(
            "#" + valueId
          ).textContent =
            event.target.value;
          saveSoon();
        };
      }
    );

    editor.querySelector(
      "#selectedRole"
    ).onchange = event => {

      if (!selectedPlayerId) return;

      team.tactics.roles[
        selectedPlayerId
      ] = event.target.value;

      saveSoon();

      renderTactics();
    };

    editor.querySelector(
      "#saveTactics"
    ).onclick = () => {

      save();

      GAME()?.render?.();
    };

    editor.querySelector(
      "#resetTactics"
    ).onclick = () => {

      resetPositions(team);

      save();

      renderTactics();
    };
  }

  window.renderTactics = renderTactics;

})();
