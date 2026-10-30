/* Звукови ефекти, генерирани в реално време с Web Audio API (без звукови файлове). */
(() => {
  "use strict";
  const H = (window.Helios = window.Helios || {});

  // isOn е функция, за да се чете винаги текущата настройка за звук.
  H.makeSfx = (isOn) => {
    let ac = null;
    function tone(freq, dur, type = "square", vol = .04, delay = 0) {
      if (!isOn()) return;
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + .02);
      } catch (e) {}
    }
    return {
      key: () => tone(1800, .02, "square", .012),
      ok: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, "square", .035, i * .08)),
      err: () => { tone(140, .22, "sawtooth", .05); tone(110, .22, "sawtooth", .04, .1); },
      alarm: () => [0, .25, .5].forEach((d) => { tone(880, .15, "square", .05, d); tone(660, .1, "square", .04, d + .15); }),
      type: () => tone(2400 + Math.random() * 400, .008, "square", .006),
      blip: () => tone(900 + Math.random() * 300, .03, "square", .012),
      ach: () => [784, 988, 1319].forEach((f, i) => tone(f, .14, "triangle", .05, i * .07)),
      win: () => [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .3, "triangle", .045, i * .11)),
    };
  };
})();
