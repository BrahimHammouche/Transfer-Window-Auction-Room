(() => {
  let context = null;
  let enabled = true;
  const championsAnthem = new Audio('/assets/champions-anthem.mp3');
  championsAnthem.preload = 'auto';
  championsAnthem.volume = .58;

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
    gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + delay + 0.015);
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
    gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + delay + .02);
    gain.gain.exponentialRampToValueAtTime(.0001, context.currentTime + delay + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(context.destination);
    source.start(context.currentTime + delay);
  }

  const sounds = {
    unlock,
    toggle() { enabled = !enabled; updateLabel(); if (enabled) tone(660, .08, 'sine', .025); },
    bid() { tone(510, .06, 'square', .022); tone(720, .1, 'sine', .024, .06); },
    sale() { noise(.06, .04); noise(.06, .035, .09); tone(440, .12, 'triangle', .025, .13); },
    whistle() { tone(1700, .08, 'square', .02); tone(1950, .1, 'square', .02, .1); },
    phase() { this.whistle(); tone(587, .18, 'triangle', .028, .15); },
    goal() { tone(392, .1, 'square', .03); tone(523, .12, 'square', .03, .1); tone(784, .32, 'sine', .045, .2); noise(.45, .035, .2); },
    chance() { tone(680, .08, 'triangle', .02); noise(.12, .012, .05); },
    winner() { tone(523, .12, 'triangle', .035); tone(659, .12, 'triangle', .035, .12); tone(784, .16, 'triangle', .04, .24); tone(1046, .34, 'sine', .045, .4); noise(.8, .04, .3); },
    draw() { tone(110, .35, 'sawtooth', .035); tone(147, .35, 'sawtooth', .035, .36); tone(196, .42, 'sawtooth', .045, .73); noise(.18, .025, 1.1); },
    celebration() { this.winner(); noise(1.3, .07, .18); tone(1318, .18, 'square', .035, .55); tone(1568, .45, 'sine', .045, .72); },
    anthem() {
      if (!enabled) return;
      championsAnthem.currentTime = 0;
      championsAnthem.play().catch(() => { tone(196, .7, 'sine', .045); tone(247, .7, 'sine', .04, .22); tone(294, .9, 'triangle', .05, .48); tone(392, 1.1, 'sine', .055, .85); noise(1.5, .035, .5); });
    },
    stopAnthem() { championsAnthem.pause(); championsAnthem.currentTime = 0; },
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
