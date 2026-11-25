// ============================================================ 2D WORLD
// Flat painted backdrops + camera + fx for the stick man shorts.
// No 3D, no textures — shapes, gradients and a few noise flecks.
// A backdrop is a function (g, W, H, t) painting in WORLD coordinates
// (1080x1920 design space); the camera transform is applied by main.js.

const nightSky = (g, W, H, moonX = 640, moonY = 420) => {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, "#1b2436"); grd.addColorStop(0.6, "#22304a"); grd.addColorStop(1, "#2c3d55");
  g.fillStyle = grd; g.fillRect(-400, -400, W + 800, H + 800);
  g.fillStyle = "#e8ecf2"; g.globalAlpha = 0.85;
  const stars = [[120, 260], [320, 180], [520, 320], [860, 240], [1010, 380], [220, 560], [760, 610], [980, 140], [60, 420], [430, 700]];
  for (const [x, y] of stars) { g.beginPath(); g.arc(x, y, 2.2, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  g.beginPath(); g.arc(moonX, moonY, 78, 0, 7); g.fillStyle = "#e6e9ee"; g.fill();
  g.beginPath(); g.arc(moonX - 24, moonY - 18, 16, 0, 7); g.fillStyle = "#cdd3dc"; g.fill();
  g.beginPath(); g.arc(moonX + 20, moonY + 30, 11, 0, 7); g.fill();
};

const skyline = (g, W, yBase, seedCol) => {
  const blocks = [[-60, 320, 240, 460], [200, 260, 300, 520], [520, 380, 260, 400], [800, 240, 330, 540], [1150, 340, 260, 440], [1360, 210, 300, 570], [640, 480, 200, 300]];
  for (const [x, y, w, h] of blocks) {
    g.fillStyle = seedCol; g.fillRect(x, yBase - h + (y - 260) * 0.2, w, h + 200);
    g.fillStyle = "#0f1520";
    for (let r = 0; r < Math.floor(h / 90); r++) for (let c = 0; c < Math.floor(w / 70); c++) {
      if ((r * 7 + c * 13) % 5 < 2) { g.globalAlpha = 0.9; g.fillRect(x + 20 + c * 70, yBase - h + (y - 260) * 0.2 + 26 + r * 90, 26, 40); g.globalAlpha = 1; }
    }
  }
};

export const BACKDROPS = {
  // ---------------- night apartment interior (couch + window + moon)
  room(g, W, H, t) {
    g.fillStyle = "#232b38"; g.fillRect(-400, -400, W + 800, H + 800);
    g.fillStyle = "#1c2330"; g.fillRect(-400, 1180, W + 800, 800);        // floor
    g.strokeStyle = "#151b26"; g.lineWidth = 6;
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(-400 + i * 260, 1180); g.lineTo(-200 + i * 300, H + 400); g.stroke(); }
    nightSky(g, 1080, 900, 300, 330); g.fillRect(-400, 830, W + 800, 380); // wall cut below window
    g.fillStyle = "#2a3446"; g.fillRect(-400, 830, W + 800, 360);
    skyline(g, 1080, 830, "#141b28");
    // window frame
    g.strokeStyle = "#39445c"; g.lineWidth = 16;
    g.strokeRect(120, 130, 420, 700); g.strokeRect(120, 130, 420, 700);
    g.beginPath(); g.moveTo(330, 130); g.lineTo(330, 830); g.moveTo(120, 480); g.lineTo(540, 480); g.stroke();
    // couch (left)
    g.fillStyle = "#3d4a63"; g.fillRect(-160, 980, 560, 300);
    g.fillStyle = "#46567290"; g.fillRect(-160, 920, 560, 90);
    g.fillStyle = "#2f3a4e"; g.fillRect(-120, 1250, 120, 130); g.fillRect(220, 1250, 120, 130);
    // lamp glow on the side table
    g.fillStyle = "#5a4a2e"; g.fillRect(700, 1080, 180, 240);
    const lg = g.createRadialGradient(790, 980, 10, 790, 980, 260);
    lg.addColorStop(0, "#f4d98c40"); lg.addColorStop(1, "#f4d98c00");
    g.fillStyle = lg; g.fillRect(530, 740, 520, 620);
    g.fillStyle = "#e8c878"; g.beginPath(); g.arc(790, 1000, 34, 0, 7); g.fill();
    // front door (right)
    g.fillStyle = "#7a5a3a"; g.fillRect(1390, 300, 320, 1250);
    g.strokeStyle = "#5d4429"; g.lineWidth = 10; g.strokeRect(1390, 300, 320, 1250);
    g.fillStyle = "#8a6a45"; g.fillRect(1416, 330, 268, 420); g.fillRect(1416, 800, 268, 400);
    g.fillStyle = "#c9cfd6"; g.beginPath(); g.arc(1450, 760, 26, 0, 7); g.fill();
  },

  // ---------------- door close-up (peephole + handle) for the knock beat
  door(g, W, H, t) {
    g.fillStyle = "#191f2b"; g.fillRect(-400, -400, W + 800, H + 800);
    g.fillStyle = "#7a5a3a"; g.fillRect(180, -200, 760, 2200);
    g.fillStyle = "#8a6a45"; g.fillRect(220, -160, 680, 2120);
    g.strokeStyle = "#5d4429"; g.lineWidth = 8;
    for (let i = 0; i < 4; i++) { g.strokeRect(240 + i * 168, -160, 150, 2120); }
    // light wedge from the hallway lamp
    g.save(); g.globalAlpha = 0.25;
    g.fillStyle = "#f4d98c"; g.beginPath(); g.moveTo(560, -200); g.lineTo(900, -200); g.lineTo(1060, 1000); g.lineTo(300, 1000); g.closePath(); g.fill();
    g.restore();
    // peephole
    g.beginPath(); g.arc(620, 640, 74, 0, 7); g.fillStyle = "#3c3f43"; g.fill();
    g.beginPath(); g.arc(620, 640, 56, 0, 7); g.fillStyle = "#181c22"; g.fill();
    g.beginPath(); g.arc(610, 628, 18, 0, 7); g.fillStyle = "#39516e"; g.fill();
    g.strokeStyle = "#23272e"; g.lineWidth = 14; g.beginPath(); g.arc(620, 640, 74, 0, 7); g.stroke();
    // handle
    g.fillStyle = "#c9cfd6"; g.fillRect(300, 1160, 210, 56);
    g.fillStyle = "#a9b0b8"; g.fillRect(210, 1140, 110, 96);
    g.beginPath(); g.arc(300, 1330, 22, 0, 7); g.fillStyle = "#3c3f43"; g.fill();
  },

  // ---------------- hallway (perspective corridor + door at the end)
  hallway(g, W, H, t, figureX = 720) {
    g.fillStyle = "#171d29"; g.fillRect(-400, -400, W + 800, H + 800);
    // walls converging to the end door
    g.fillStyle = "#232b3a";
    g.beginPath(); g.moveTo(-200, -200); g.lineTo(560, 380); g.lineTo(560, 1520); g.lineTo(-200, 2100); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(1280, -200); g.lineTo(600, 380); g.lineTo(600, 1520); g.lineTo(1280, 2100); g.closePath(); g.fill();
    g.fillStyle = "#1a2130"; g.beginPath(); g.moveTo(560, 380); g.lineTo(600, 380); g.lineTo(600, 1520); g.lineTo(560, 1520); g.closePath(); g.fill();
    g.fillStyle = "#121824"; g.fillRect(-400, 1720, W + 800, 700);
    // end door with light spill
    g.fillStyle = "#0e1420"; g.fillRect(600, 380, 360, 1140);
    g.save(); g.globalAlpha = 0.5; g.fillStyle = "#dfe6ee";
    g.beginPath(); g.moveTo(640, 1500); g.lineTo(660, 700); g.lineTo(700, 700); g.lineTo(740, 1500); g.closePath(); g.fill();
    g.restore();
    // ceiling lamp
    g.fillStyle = "#e8e2cf"; g.beginPath(); g.arc(820, 210, 26, 0, 7); g.fill();
    g.save(); g.globalAlpha = 0.16; g.fillStyle = "#e8e2cf";
    g.beginPath(); g.moveTo(790, 220); g.lineTo(520, 1560); g.lineTo(1120, 1560); g.closePath(); g.fill(); g.restore();
  },

  // ---------------- stairwell
  stairs(g, W, H, t) {
    g.fillStyle = "#2a2622"; g.fillRect(-400, -400, W + 800, H + 800);
    nightSky(g, 1080, 620, 260, 300);
    g.fillStyle = "#38322c"; g.fillRect(-400, 560, W + 800, 500);
    // steps (diagonal run)
    for (let i = 0; i < 9; i++) {
      const x = -120 + i * 150, y = 700 + i * 130;
      g.fillStyle = "#8a8178"; g.fillRect(x, y, 200, 46);
      g.fillStyle = "#6e675f"; g.fillRect(x, y + 46, 200, 90);
    }
    // railing
    g.strokeStyle = "#3c4a52"; g.lineWidth = 18;
    g.beginPath(); g.moveTo(980, 640); g.lineTo(180, 1780); g.stroke();
    for (let i = 0; i < 6; i++) { const x = 900 - i * 128, y = 700 + i * 172; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 60, y + 210); g.stroke(); }
    // wall grime
    g.globalAlpha = 0.12; g.fillStyle = "#000";
    for (let i = 0; i < 14; i++) g.fillRect(80 + i * 67, 90 + (i * 97) % 400, 40, 120);
    g.globalAlpha = 1;
  },

  // ---------------- night street
  street(g, W, H, t) {
    nightSky(g, W, 900, 240, 330);
    skyline(g, W, 880, "#10161f");
    g.fillStyle = "#1a2029"; g.fillRect(-400, 880, W + 800, 1200);
    g.strokeStyle = "#222b38"; g.lineWidth = 6;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-300 + i * 320, 900); g.lineTo(200 + i * 320, H + 400); g.stroke(); }
    // abandoned car silhouette
    g.fillStyle = "#0d1219"; g.fillRect(80, 1120, 420, 190);
    g.beginPath(); g.moveTo(140, 1120); g.lineTo(220, 1000); g.lineTo(360, 1000); g.lineTo(430, 1120); g.closePath(); g.fill();
    g.beginPath(); g.arc(190, 1320, 46, 0, 7); g.fill(); g.beginPath(); g.arc(390, 1320, 46, 0, 7); g.fill();
  },

  // ---------------- rooftop
  rooftop(g, W, H, t) {
    nightSky(g, W, 760, 300, 300);
    skyline(g, W, 760, "#131a26");
    g.fillStyle = "#3a3d42"; g.fillRect(-400, 760, W + 800, 1300);        // roof slab
    g.fillStyle = "#31343a"; g.fillRect(-400, 760, W + 800, 40);
    g.strokeStyle = "#2b2e33"; g.lineWidth = 5;
    for (let i = 0; i < 10; i++) { g.beginPath(); g.moveTo(-300 + i * 220, 800); g.lineTo(100 + i * 220, H + 400); g.stroke(); }
    // parapet
    g.fillStyle = "#44474d"; g.fillRect(-400, 560, W + 800, 220);
    // water tank
    g.fillStyle = "#3d5a75"; g.fillRect(1120, 180, 240, 460);
    g.fillStyle = "#2c4257"; g.fillRect(1120, 180, 60, 460);
    g.fillStyle = "#26292e"; g.fillRect(1080, 620, 320, 60);
  },
};

// ------------------------------------------------------------- fx layers
export const FX = {
  dust(g, W, H, k, col = "#e8dcc4") {
    g.save(); g.globalAlpha = Math.max(0, 1 - k * k) * 0.8;
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2, r = 130 + 220 * k; g.beginPath(); g.ellipse(540 + Math.cos(a) * r, 900 + Math.sin(a) * r * 0.55, 150 + 70 * k, 120 + 60 * k, 0, 0, 7); g.fillStyle = col; g.fill(); }
    g.restore();
  },
  rain(g, W, H, t, k = 1) {
    g.save(); g.globalAlpha = 0.35 * k; g.strokeStyle = "#9fb4cc"; g.lineWidth = 3;
    for (let i = 0; i < 60; i++) {
      const x = ((i * 173 + t * 900) % (W + 200)) - 100, y = ((i * 331 + t * 2200) % (H + 200)) - 100;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 8, y + 34); g.stroke();
    }
    g.restore();
  },
  grain(g, W, H, f) {
    g.save(); g.globalAlpha = 0.05;
    for (let i = 0; i < 130; i++) { const x = ((i * 977 + f * 137) % W), y = ((i * 613 + f * 293) % H); g.fillStyle = i % 2 ? "#ffffff" : "#000000"; g.fillRect(x, y, 2, 2); }
    g.restore();
  },
  vignette(g, W, H) {
    const rg = g.createRadialGradient(W / 2, H * 0.47, H * 0.34, W / 2, H * 0.47, H * 0.95);
    rg.addColorStop(0, "rgba(0,0,0,0)"); rg.addColorStop(1, "rgba(0,0,0,0.42)");
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  },
  flash(g, W, H, k) { g.save(); g.globalAlpha = k; g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H); g.restore(); },
};
