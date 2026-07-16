export function initBackgroundEffects({ zIndex = 99, count = 399, clickWords = [] } = {}) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const pointer = { x: null, y: null, max: 20000 };
  const particles = [];

  canvas.style.cssText = `position:fixed;inset:0;z-index:${zIndex};pointer-events:none;`;
  document.body.appendChild(canvas);

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticles() {
    particles.length = 0;
    for (let index = 0; index < count; index += 1) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        xa: Math.random() * 2 - 1,
        ya: Math.random() * 2 - 1,
        max: 6000
      });
    }
  }

  function connect(particle, target) {
    if (target.x === null || target.y === null) return;
    const dx = particle.x - target.x;
    const dy = particle.y - target.y;
    const distance = dx * dx + dy * dy;
    if (distance >= target.max) return;
    if (target === pointer && distance >= target.max / 2) {
      particle.x -= 0.03 * dx;
      particle.y -= 0.03 * dy;
    }
    const opacity = (target.max - distance) / target.max;
    context.beginPath();
    context.lineWidth = opacity / 2;
    context.strokeStyle = `rgba(0,195,255,${opacity + 0.2})`;
    context.moveTo(particle.x, particle.y);
    context.lineTo(target.x, target.y);
    context.stroke();
  }

  function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((particle, particleIndex) => {
      particle.x += particle.xa;
      particle.y += particle.ya;
      if (particle.x > canvas.width || particle.x < 0) particle.xa *= -1;
      if (particle.y > canvas.height || particle.y < 0) particle.ya *= -1;
      context.fillRect(particle.x - 0.5, particle.y - 0.5, 1, 1);
      connect(particle, pointer);
      for (let targetIndex = particleIndex + 1; targetIndex < particles.length; targetIndex += 1) {
        connect(particle, particles[targetIndex]);
      }
    });

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => {
    resize();
    createParticles();
  });
  window.addEventListener('mousemove', (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
  });
  document.documentElement.addEventListener('mouseleave', () => {
    pointer.x = null;
    pointer.y = null;
  });

  if (clickWords.length) {
    let wordIndex = 0;
    document.body.addEventListener('click', (event) => {
      const word = document.createElement('span');
      word.textContent = clickWords[wordIndex];
      wordIndex = (wordIndex + 1) % clickWords.length;
      word.style.cssText = `z-index:9999;top:${event.pageY - 20}px;left:${event.pageX}px;position:absolute;color:goldenrod;pointer-events:none;`;
      document.body.appendChild(word);
      word.animate(
        [
          { transform: 'translateY(0)', opacity: 1 },
          { transform: 'translateY(-160px)', opacity: 0 }
        ],
        { duration: 1000, easing: 'linear' }
      ).finished.finally(() => word.remove());
    });
  }

  resize();
  createParticles();
  requestAnimationFrame(draw);
}
