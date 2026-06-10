import React, { useRef, useEffect } from 'react';

/**
 * Cosmic Galaxy Travel — Canvas-based starfield with nebula particles.
 * Based on the Cosmic Galaxy Travel animation with 3D projection,
 * radial glow stars, and pulsing nebula particles.
 */
export default function CosmicBackground(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let W: number, H: number;
    let time = 0;

    const NUM_STARS = 400;
    const NUM_PARTICLES = 80;
    const SPEED = 0.75;

    interface Star {
      x: number;
      y: number;
      z: number;
      size: number;
      color: string;
    }

    interface Particle {
      x: number;
      y: number;
      z: number;
      size: number;
      hue: number;
      alpha: number;
      pulse: number;
    }

    const stars: Star[] = [];
    const particles: Particle[] = [];

    function resize() {
      W = canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      H = canvas.height = canvas.offsetHeight * window.devicePixelRatio;
    }

    function initStars() {
      stars.length = 0;
      // Main field stars (center-weighted via perspective)
      for (let i = 0; i < NUM_STARS * 0.6; i++) {
        stars.push({
          x: (Math.random() - 0.5) * 2000,
          y: (Math.random() - 0.5) * 2000,
          z: Math.random() * 2000,
          size: Math.random() * 1.5 + 0.5,
          color: `hsl(${200 + Math.random() * 60}, ${60 + Math.random() * 40}%, ${70 + Math.random() * 30}%)`,
        });
      }
      // Edge stars — spread much wider to fill sides
      for (let i = 0; i < NUM_STARS * 0.4; i++) {
        stars.push({
          x: (Math.random() - 0.5) * 5000,
          y: (Math.random() - 0.5) * 4000,
          z: Math.random() * 1200 + 400,
          size: Math.random() * 1.0 + 0.3,
          color: `hsl(${210 + Math.random() * 40}, ${50 + Math.random() * 30}%, ${60 + Math.random() * 30}%)`,
        });
      }
    }

    function initParticles() {
      particles.length = 0;
      for (let i = 0; i < NUM_PARTICLES; i++) {
        particles.push({
          x: (Math.random() - 0.5) * 1500,
          y: (Math.random() - 0.5) * 1500,
          z: Math.random() * 2000,
          size: Math.random() * 40 + 10,
          hue: Math.random() * 60 + 200,
          alpha: Math.random() * 0.3 + 0.05,
          pulse: Math.random() * Math.PI * 2,
        });
      }
    }

    function project(x: number, y: number, z: number) {
      const fov = 600;
      const scale = fov / (fov + z);
      return {
        sx: x * scale + W / 2,
        sy: y * scale + H / 2,
        scale,
      };
    }

    function drawStar(star: Star) {
      const p = project(star.x, star.y, star.z);
      if (p.scale <= 0 || p.sx < -50 || p.sx > W + 50 || p.sy < -50 || p.sy > H + 50) return;

      const size = star.size * p.scale * 2;
      const alpha = Math.min(1, p.scale * 1.5);

      // Radial glow
      const gradient = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, size * 3);
      gradient.addColorStop(0, `rgba(200, 220, 255, ${alpha * 0.8})`);
      gradient.addColorStop(0.5, `rgba(150, 180, 255, ${alpha * 0.2})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, size * 3, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.fillStyle = star.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, size * 0.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawParticle(particle: Particle) {
      const p = project(particle.x, particle.y, particle.z);
      if (p.scale <= 0) return;

      const size = particle.size * p.scale;
      const pulseAlpha = particle.alpha * (0.5 + 0.5 * Math.sin(time * 0.02 + particle.pulse));

      const gradient = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, size);
      gradient.addColorStop(0, `hsla(${particle.hue}, 80%, 60%, ${pulseAlpha})`);
      gradient.addColorStop(0.4, `hsla(${particle.hue}, 70%, 40%, ${pulseAlpha * 0.5})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, size, 0, Math.PI * 2);
      ctx.fill();
    }

    function animate() {
      time++;

      // Fade trail
      ctx.fillStyle = 'rgba(5, 5, 16, 0.15)';
      ctx.fillRect(0, 0, W, H);

      // Move stars
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.z -= SPEED;
        if (star.z < 1) {
          star.z = 2000;
          // Edge stars (last 40%) respawn wider
          if (i >= NUM_STARS * 0.6) {
            star.x = (Math.random() - 0.5) * 5000;
            star.y = (Math.random() - 0.5) * 4000;
          } else {
            star.x = (Math.random() - 0.5) * 2000;
            star.y = (Math.random() - 0.5) * 2000;
          }
        }
      }

      // Move particles (slower)
      for (const particle of particles) {
        particle.z -= SPEED * 0.6;
        if (particle.z < 1) {
          particle.z = 2000;
          particle.x = (Math.random() - 0.5) * 1500;
          particle.y = (Math.random() - 0.5) * 1500;
        }
      }

      // Sort by depth (back to front) and draw
      const allObjects: { type: string; obj: Star | Particle; z: number }[] = [
        ...particles.map((p) => ({ type: 'particle' as const, obj: p, z: p.z })),
        ...stars.map((s) => ({ type: 'star' as const, obj: s, z: s.z })),
      ];
      allObjects.sort((a, b) => b.z - a.z);

      for (const item of allObjects) {
        if (item.type === 'star') drawStar(item.obj as Star);
        else drawParticle(item.obj as Particle);
      }

      // Center glow
      const centerGlow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 200);
      centerGlow.addColorStop(0, `rgba(100, 120, 255, ${0.03 + 0.02 * Math.sin(time * 0.01)})`);
      centerGlow.addColorStop(0.5, `rgba(80, 50, 180, ${0.02 + 0.01 * Math.sin(time * 0.015)})`);
      centerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, W, H);

      animationId = requestAnimationFrame(animate);
    }

    resize();
    initStars();
    initParticles();

    // Initial fill
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, W, H);

    animate();

    const handleResize = () => {
      resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="cosmic-canvas"
      aria-hidden="true"
    />
  );
}
