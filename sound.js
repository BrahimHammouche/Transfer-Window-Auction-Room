(() => {
  let context = null;
  let enabled = true;
  let sfxVolume = .8;
  let musicVolume = .36;
  let musicEnabled = true;
  let musicTimer = null;
  let musicStep = 0;
  let musicPhase = null;
  const championsAnthem = new Audio('/assets/champions-anthem.mp3');
  championsAnthem.preload = 'auto';
  championsAnthem.volume = .58;
  const auctionPurchase = new Audio('/assets/auction-purchase.mp3');
  const auctionNextPlayer = new Audio('/assets/auction-next-player.mp3');
  [auctionPurchase, auctionNextPlayer].forEach(clip => { clip.preload = 'auto'; clip.volume = .7; });
  const PLAYLIST = [
    {title: 'Love Me Again', artist: 'John Newman', src: '/assets/music-love-me-again.mp3'},
    {title: 'The Nights', artist: 'Avicii', src: '/assets/music-the-nights.mp3'},
    {title: 'Pompeii', artist: 'Bastille', src: '/assets/music-pompeii.mp3'},
    {title: 'On Top of the World', artist: 'Imagine Dragons', src: '/assets/music-on-top-of-the-world.mp3'},
    {title: 'Ai Se Eu Te Pego', artist: 'Michel Teló', src: '/assets/music-ai-se-eu-te-pego.mp3'},
    {title: 'Thank You', artist: 'All Tvvins', src: '/assets/music-thank-you.mp3'},
    {title: 'On My Mind', artist: 'Ellie Goulding', src: '/assets/music-on-my-mind.mp3'},
    {title: 'Where Are Ü Now', artist: 'Skrillex & Diplo', src: '/assets/music-where-are-you-now.mp3'},
    {title: 'My Type', artist: 'Saint Motel', src: '/assets/music-my-type.mp3'},
  ];
  const musicPlayer = new Audio();
  musicPlayer.preload = 'auto';
  let trackIndex = 0;
  let roomMusicKey = null;
  let pendingProgress = null;

  function updateLabel() {
    const button = document.getElementById('soundBtn');
    if (button) button.textContent = `Sound: ${enabled ? 'On' : 'Off'}`;
  }

  async function unlock() {
    if (!enabled || !(window.AudioContext || window.webkitAudioContext)) return null;
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') {
      try { await context.resume(); } catch (_) { return null; }
    }
    return context.state === 'running' ? context : null;
  }

  function tone(frequency, duration, type = 'sine', volume = 0.035, delay = 0) {
    if (!enabled) return;
    void unlock();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime + delay);
    gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(volume * sfxVolume, context.currentTime + delay + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(context.currentTime + delay);
    oscillator.stop(context.currentTime + delay + duration + 0.02);
  }

  function noise(duration = .2, volume = .025, delay = 0) {
    if (!enabled) return;
    void unlock();
    if (!context) return;
    const buffer = context.createBuffer(1, Math.max(1, context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = 'bandpass';
    filter.frequency.value = 1300;
    gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
    gain.gain.exponentialRampToValueAtTime(volume * sfxVolume, context.currentTime + delay + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + delay + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(context.currentTime + delay);
  }

  const MUSIC = {
    auction: [110, 0, 165, 220, 0, 165, 247, 220],
    tactics: [196, 247, 294, 247, 220, 294, 247, 196],
    evaluation: [220, 277, 330, 277, 247, 330, 370, 330],
    tournament: [147, 196, 220, 294, 220, 196, 247, 294],
    results: [196, 247, 294, 392, 294, 247, 330, 392],
  };
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; musicPhase = null; }
  function notifyTrack() {
    const track = PLAYLIST[trackIndex];
    window.dispatchEvent(new CustomEvent('gameMusicChange', {detail: {...track, playing: !musicPlayer.paused, currentTime: musicPlayer.currentTime || 0, duration: Number.isFinite(musicPlayer.duration) ? musicPlayer.duration : 0}}));
  }
  function resolveCover(track) {
    if (track.cover || track.coverLoading || track.coverUnavailable) return;
    track.coverLoading = true;
    const query = encodeURIComponent(`${track.artist} ${track.title}`);
    const setAppleCover = data => {
      const exact = (data.results || []).find(item => item.trackName?.toLowerCase() === track.title.toLowerCase() && item.artistName?.toLowerCase().includes(track.artist.split(' & ')[0].toLowerCase()));
      const result = exact || data.results?.[0];
      if (result?.artworkUrl100) track.cover = result.artworkUrl100.replace(/100x100bb\.jpg$/, '600x600bb.jpg');
      return track.cover;
    };
    fetch(`https://itunes.apple.com/search?term=${query}&entity=song&limit=5`)
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(setAppleCover)
      .then(cover => cover || fetch(`https://api.deezer.com/search?q=${query}&limit=5`).then(response => response.ok ? response.json() : Promise.reject()).then(data => {
        const exact = (data.data || []).find(item => item.title?.toLowerCase() === track.title.toLowerCase() && item.artist?.name?.toLowerCase().includes(track.artist.split(' & ')[0].toLowerCase()));
        track.cover = (exact || data.data?.[0])?.album?.cover_xl || null;
      }))
      .catch(() => { track.coverUnavailable = true; })
      .finally(() => { track.coverLoading = false; notifyTrack(); });
  }
  function playTrack(index, restart = false) {
    trackIndex = (index + PLAYLIST.length) % PLAYLIST.length;
    const track = PLAYLIST[trackIndex];
    if (musicPlayer.src !== new URL(track.src, location.origin).href) musicPlayer.src = track.src;
    musicPlayer.volume = musicVolume;
    resolveCover(track);
    if (restart) musicPlayer.currentTime = 0;
    if (musicEnabled && enabled) musicPlayer.play().then(notifyTrack).catch(notifyTrack);
    else notifyTrack();
  }
  musicPlayer.addEventListener('loadedmetadata', () => {
    if (pendingProgress !== null && Number.isFinite(musicPlayer.duration)) {
      musicPlayer.currentTime = pendingProgress * musicPlayer.duration;
      pendingProgress = null;
    }
    notifyTrack();
  });
  ['timeupdate', 'play', 'pause', 'seeking', 'seeked'].forEach(event => musicPlayer.addEventListener(event, notifyTrack));
  musicPlayer.addEventListener('ended', () => playTrack(trackIndex + 1, true));
  function playClip(clip) {
    if (!enabled) return;
    clip.volume = Math.max(0, Math.min(1, sfxVolume));
    clip.currentTime = 0;
    clip.play().catch(() => {});
  }
  function musicTick() {
    if (!musicEnabled || !enabled || !context || context.state !== 'running') return;
    const notes = MUSIC[musicPhase] || MUSIC.auction;
    const note = notes[musicStep++ % notes.length];
    if (!note) return;
    tone(note, .34, musicPhase === 'tournament' ? 'triangle' : 'sine', musicVolume * .055);
    if (musicStep % 4 === 0) tone(note / 2, .18, 'sine', musicVolume * .025, .02);
  }
  function phaseMusic(phase) {
    if (!musicEnabled || musicPhase === phase) return;
    stopMusic(); musicPhase = MUSIC[phase] ? phase : 'auction'; musicStep = 0;
    const phaseTracks = {auction:0,tactics:5,evaluation:2,tournament:1,results:3};
    void unlock().then(active => { if (active) playTrack(phaseTracks[musicPhase] ?? 0); });
  }
  const sounds = {
    unlock,
    toggle() { enabled = !enabled; if (!enabled) { stopMusic(); musicPlayer.pause(); } updateLabel(); if (enabled) tone(660, .08, 'sine', .025); },
    setSfxVolume(value) { sfxVolume = Math.max(0, Math.min(1, Number(value) || 0)); },
    setMusicVolume(value) { musicVolume = Math.max(0, Math.min(1, Number(value) || 0)); championsAnthem.volume = Math.min(.8, musicVolume); musicPlayer.volume = musicVolume; },
    setMusicEnabled(value) { musicEnabled = Boolean(value); if (!musicEnabled) { stopMusic(); musicPlayer.pause(); } },
    toggleMusic() { if (musicPlayer.paused) playTrack(trackIndex); else { musicPlayer.pause(); notifyTrack(); } },
    nextTrack() { playTrack(trackIndex + 1, true); },
    seekMusic(progress) { if (Number.isFinite(musicPlayer.duration)) { musicPlayer.currentTime = Math.max(0, Math.min(musicPlayer.duration, Number(progress) * musicPlayer.duration)); notifyTrack(); } },
    syncRoomMusic(roomMusic) {
      if (!roomMusic) return;
      const track = Math.max(0, Math.min(PLAYLIST.length - 1, Number(roomMusic.track) || 0));
      const progress = Math.max(0, Math.min(1, Number(roomMusic.progress) || 0));
      const key = `${track}:${Boolean(roomMusic.playing)}:${progress}`;
      if (key === roomMusicKey) return;
      roomMusicKey = key;
      trackIndex = track;
      const selected = PLAYLIST[trackIndex];
      if (musicPlayer.src !== new URL(selected.src, location.origin).href) musicPlayer.src = selected.src;
      musicPlayer.volume = musicVolume;
      resolveCover(selected);
      if (Number.isFinite(musicPlayer.duration)) musicPlayer.currentTime = progress * musicPlayer.duration;
      else pendingProgress = progress;
      if (roomMusic.playing && musicEnabled && enabled) musicPlayer.play().catch(notifyTrack);
      else musicPlayer.pause();
      notifyTrack();
    },
    getTrack() { return {...PLAYLIST[trackIndex], playing: !musicPlayer.paused, currentTime: musicPlayer.currentTime || 0, duration: Number.isFinite(musicPlayer.duration) ? musicPlayer.duration : 0}; },
    phaseMusic,
    bid() { tone(510, .06, 'square', .022); tone(720, .1, 'sine', .024, .06); },
    sale() { playClip(auctionPurchase); noise(.06, .04); noise(.06, .035, .09); tone(440, .12, 'triangle', .025, .13); },
    nextPlayer() { playClip(auctionNextPlayer); tone(510, .06, 'square', .018); tone(680, .1, 'sine', .018, .06); },
    whistle() { tone(1700, .08, 'square', .02); tone(1950, .1, 'square', .02, .1); },
    phase() { this.whistle(); tone(587, .18, 'triangle', .028, .15); },
    goal() { tone(392, .1, 'square', .03); tone(523, .12, 'square', .03, .1); tone(784, .32, 'sine', .045, .2); noise(.45, .035, .2); },
    chance() { tone(680, .08, 'triangle', .02); noise(.12, .012, .05); },
    winner() { tone(523, .12, 'triangle', .035); tone(659, .12, 'triangle', .035, .12); tone(784, .16, 'triangle', .04, .24); tone(1046, .34, 'sine', .045, .4); noise(.8, .04, .3); },
    draw() { tone(110, .35, 'sawtooth', .035); tone(147, .35, 'sawtooth', .035, .36); tone(196, .42, 'sawtooth', .045, .73); noise(.18, .025, 1.1); },
    celebration() { this.winner(); noise(1.3, .07, .18); tone(1318, .18, 'square', .035, .55); tone(1568, .45, 'sine', .045, .72); },
    anthem() {
      if (!enabled) return;
      musicPlayer.pause();
      championsAnthem.currentTime = 0;
      championsAnthem.play().catch(() => { tone(196, .7, 'sine', .045); tone(247, .7, 'sine', .04, .22); tone(294, .9, 'triangle', .05, .48); tone(392, 1.1, 'sine', .055, .85); noise(1.5, .035, .5); });
    },
    stopAnthem() { championsAnthem.pause(); championsAnthem.currentTime = 0; stopMusic(); musicPlayer.pause(); },
    async hype() {
      if (!enabled) { enabled = true; updateLabel(); }
      if (!await unlock()) return;
      const button = document.getElementById('hypeBtn');
      if (button) {
        button.textContent = 'Crowd roaring!';
        button.classList.add('hype-active');
        setTimeout(() => { button.textContent = 'Hype'; button.classList.remove('hype-active'); }, 900);
      }
      [
        () => { noise(.55, .09); tone(155, .2, 'sawtooth', .07); tone(210, .24, 'sawtooth', .06, .16); },
        () => { tone(880, .09, 'square', .05); tone(660, .09, 'square', .05, .12); tone(990, .17, 'square', .06, .25); noise(.32, .055, .12); },
        () => { noise(.58, .085); tone(330, .28, 'triangle', .06, .05); tone(494, .24, 'triangle', .05, .25); },
      ][Math.floor(Math.random() * 3)]();
    },
  };

  document.addEventListener('pointerdown', () => { void unlock(); }, {once: true});
  window.gameSounds = sounds;
  updateLabel();
})();
