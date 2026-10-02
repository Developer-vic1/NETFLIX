async (page) => {
  const context = await page.context().browser().newContext();
  const introPage = await context.newPage();
  const errors = [], results = [];
  introPage.on('pageerror', error => errors.push(error.message));
  const check = (name, pass) => results.push({name, pass: !!pass});
  await introPage.addInitScript(() => {
    const NativeAudio = window.AudioContext;
    window.AudioContext = class extends NativeAudio {
      constructor(...args) {
        super(...args);
        window.__introAudio = this;
        const analyser = this.createAnalyser();
        analyser.fftSize = 256;
        window.__introAnalyser = analyser;
        const createGain = this.createGain.bind(this);
        this.createGain = () => {
          const gain = createGain();
          gain.connect(analyser);
          return gain;
        };
      }
    };
  });
  try {
    await introPage.goto('http://127.0.0.1:4173/#/home');
    await introPage.locator('.cinema-intro').waitFor();
    check('automatic opening lasts 3.6 seconds', await introPage.locator('.cinema-intro').evaluate(node => getComputedStyle(node).animationDuration === '3.6s'));
    check('automatic opening attempts audio', await introPage.evaluate(() => !!window.__introAudio));
    const state = await introPage.evaluate(() => window.__introAudio.state);
    check('blocked autoplay offers enable sound', state === 'running' || await introPage.getByRole('button', {name:'Activar sonido', exact:true}).isVisible());
    await introPage.locator('.intro-n').evaluate(node => {
      const animation = node.getAnimations()[0];
      animation.pause();
      animation.currentTime = 1500;
    });
    check('N stays readable after 1.5 seconds', await introPage.locator('.intro-n').evaluate(node => {
      const style = getComputedStyle(node), matrix = new DOMMatrix(style.transform);
      return Number(style.opacity) > 0.95 && matrix.a < 1.2;
    }));
    await introPage.locator('.intro-sound').click();
    await introPage.waitForFunction(() => window.__introAudio.state === 'running' && window.__introAudio.currentTime > .35);
    check('audio and visual clocks share the same start', await introPage.evaluate(() => {
      const animation = document.querySelector('.intro-n').getAnimations()[0];
      const start = Number(document.querySelector('.cinema-intro').dataset.audioStart);
      window.__introTiming = {visualMs: animation.currentTime, audioMs: (window.__introAudio.currentTime - start) * 1000, start};
      return Math.abs(animation.currentTime - (window.__introAudio.currentTime - start) * 1000) < 100;
    }));
    check('gesture produces a nonzero audio signal', await introPage.evaluate(() => {
      const values = new Float32Array(window.__introAnalyser.fftSize);
      window.__introAnalyser.getFloatTimeDomainData(values);
      return values.some(value => Math.abs(value) > .00001);
    }));
    check('sound replay starts full animation', await introPage.locator('.cinema-intro').evaluate(node => node.style.getPropertyValue('--intro-duration') === '3600ms'));
    const timing = await introPage.evaluate(() => window.__introTiming);
    await introPage.locator('.cinema-intro').waitFor({state:'detached'});
    check('opening finishes and releases content and audio', await introPage.evaluate(() => !document.getElementById('app').inert && window.__introAudio.state === 'closed'));
    await introPage.emulateMedia({reducedMotion:'reduce'});
    await introPage.reload();
    check('reduced motion bypasses animation and sound', await introPage.evaluate(() => !document.querySelector('.cinema-intro') && !window.__introAudio));
    return {total:results.length, passed:results.filter(item=>item.pass).length, failures:results.filter(item=>!item.pass), errors, timing};
  } finally {
    await context.close();
  }
}
