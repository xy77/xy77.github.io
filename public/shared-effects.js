(function () {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const pointer = { x: null, y: null, max: 20000 };
  const particles = [];
  canvas.style.cssText = 'position:fixed;inset:0;z-index:0;pointer-events:none;';
  document.body.appendChild(canvas);
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  function createParticles() {
    particles.length = 0;
    for (let i = 0; i < 120; i += 1) particles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, xa: Math.random() * 2 - 1, ya: Math.random() * 2 - 1 });
  }
  function connect(particle, target) {
    if (target.x === null || target.y === null) return;
    const dx = particle.x - target.x; const dy = particle.y - target.y; const distance = dx * dx + dy * dy;
    if (distance >= target.max) return;
    const opacity = (target.max - distance) / target.max;
    context.beginPath(); context.lineWidth = opacity / 2; context.strokeStyle = 'rgba(0,195,255,' + (opacity + .2) + ')'; context.moveTo(particle.x, particle.y); context.lineTo(target.x, target.y); context.stroke();
  }
  function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((particle, index) => { particle.x += particle.xa; particle.y += particle.ya; if (particle.x > canvas.width || particle.x < 0) particle.xa *= -1; if (particle.y > canvas.height || particle.y < 0) particle.ya *= -1; context.fillRect(particle.x - .5, particle.y - .5, 1, 1); connect(particle, pointer); for (let i = index + 1; i < particles.length; i += 1) connect(particle, particles[i]); });
    requestAnimationFrame(draw);
  }
  window.addEventListener('resize', () => { resize(); createParticles(); });
  window.addEventListener('mousemove', event => { pointer.x = event.clientX; pointer.y = event.clientY; });
  document.documentElement.addEventListener('mouseleave', () => { pointer.x = null; pointer.y = null; });
  resize(); createParticles(); draw();
}());
