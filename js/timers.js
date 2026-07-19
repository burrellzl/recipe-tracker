(function () {
  'use strict';

  const STORAGE_KEY = 'recipe-cooking-timers-v1';
  const timers = new Map();
  let audioContext = null;

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      saved.forEach((timer) => timers.set(timer.id, timer));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...timers.values()]));
  }

  function ensureAudio() {
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
    } catch {
      // Audio is optional and some browsers block it.
    }
  }

  function beep() {
    if (!audioContext) return;
    try {
      [0, 0.35, 0.7].forEach((offset) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.12, audioContext.currentTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + offset + 0.22);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start(audioContext.currentTime + offset);
        oscillator.stop(audioContext.currentTime + offset + 0.25);
      });
    } catch {
      // Keep the visual completion state when sound is unavailable.
    }
  }

  function getRemaining(timer) {
    if (!timer) return 0;
    if (timer.status === 'running') return Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    return Math.max(0, timer.remaining);
  }

  function start({ id, seconds, label, recipeId }) {
    ensureAudio();
    const existing = timers.get(id);
    const remaining = existing && existing.status !== 'complete' ? getRemaining(existing) : Number(seconds);
    timers.set(id, {
      id,
      label,
      recipeId,
      duration: Number(seconds),
      remaining,
      endAt: Date.now() + remaining * 1000,
      status: 'running'
    });
    save();
    render();
  }

  function pause(id) {
    const timer = timers.get(id);
    if (!timer || timer.status !== 'running') return;
    timer.remaining = getRemaining(timer);
    timer.status = 'paused';
    delete timer.endAt;
    save();
    render();
  }

  function resume(id) {
    const timer = timers.get(id);
    if (!timer || timer.status !== 'paused') return;
    ensureAudio();
    timer.endAt = Date.now() + timer.remaining * 1000;
    timer.status = 'running';
    save();
    render();
  }

  function reset(id) {
    timers.delete(id);
    save();
    render();
  }

  function tick() {
    let changed = false;
    timers.forEach((timer) => {
      if (timer.status === 'running' && getRemaining(timer) <= 0) {
        timer.remaining = 0;
        timer.status = 'complete';
        delete timer.endAt;
        changed = true;
        beep();
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          try { new Notification('Cooking timer complete', { body: timer.label || 'Your timer is finished.' }); } catch { /* optional */ }
        }
      }
    });
    if (changed) save();
    render();
  }

  function render() {
    document.querySelectorAll('[data-timer-display]').forEach((element) => {
      const timer = timers.get(element.dataset.timerDisplay);
      const fallback = Number(element.dataset.duration || 0);
      element.textContent = RecipeUtils.formatTimer(timer ? getRemaining(timer) : fallback);
      element.closest('.step-timer')?.classList.toggle('timer-complete', timer?.status === 'complete');
    });

    document.querySelectorAll('[data-timer-start]').forEach((button) => {
      const timer = timers.get(button.dataset.timerStart);
      button.hidden = Boolean(timer && timer.status !== 'complete');
    });
    document.querySelectorAll('[data-timer-pause]').forEach((button) => {
      button.hidden = timers.get(button.dataset.timerPause)?.status !== 'running';
    });
    document.querySelectorAll('[data-timer-resume]').forEach((button) => {
      button.hidden = timers.get(button.dataset.timerResume)?.status !== 'paused';
    });

    const tray = document.getElementById('global-timers');
    if (!tray) return;
    const active = [...timers.values()];
    tray.hidden = active.length === 0;
    tray.innerHTML = active.map((timer) => `
      <div class="global-timer ${timer.status === 'complete' ? 'timer-complete' : ''}">
        <a href="#/recipe/${RecipeUtils.escapeHTML(timer.recipeId)}">${RecipeUtils.escapeHTML(timer.label)}</a>
        <strong>${timer.status === 'complete' ? 'Done!' : RecipeUtils.formatTimer(getRemaining(timer))}</strong>
        <button class="icon-button small" type="button" data-global-reset="${RecipeUtils.escapeHTML(timer.id)}" aria-label="Clear timer">×</button>
      </div>
    `).join('');
  }

  function handleClick(event) {
    const startButton = event.target.closest('[data-timer-start]');
    if (startButton) {
      start({
        id: startButton.dataset.timerStart,
        seconds: Number(startButton.dataset.duration),
        label: startButton.dataset.label,
        recipeId: startButton.dataset.recipeId
      });
      return true;
    }
    const pauseButton = event.target.closest('[data-timer-pause]');
    if (pauseButton) { pause(pauseButton.dataset.timerPause); return true; }
    const resumeButton = event.target.closest('[data-timer-resume]');
    if (resumeButton) { resume(resumeButton.dataset.timerResume); return true; }
    const resetButton = event.target.closest('[data-timer-reset], [data-global-reset]');
    if (resetButton) { reset(resetButton.dataset.timerReset || resetButton.dataset.globalReset); return true; }
    return false;
  }

  load();
  setInterval(tick, 500);
  window.RecipeTimers = Object.freeze({ handleClick, render });
})();
