"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GamePhase = "intro" | "walk" | "cinematic" | "end";

type GameModel = {
  phase: GamePhase;
  playerX: number;
  walkFrame: number;
  cutsceneTime: number;
  cutsceneStartedAt: number;
};

type RigPart = {
  image: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  pivotX: number;
  pivotY: number;
};

type CharacterRig = {
  width: number;
  height: number;
  head: RigPart;
  torso: RigPart;
  leftArm: RigPart;
  rightArm: RigPart;
  leftLeg: RigPart;
  rightLeg: RigPart;
};

type RigSet = {
  boy: CharacterRig;
  girl: CharacterRig;
  shadow: CharacterRig;
};

type RigMotion = {
  bob?: number;
  bodyX?: number;
  bodyY?: number;
  bodyRotation?: number;
  headBob?: number;
  headTilt?: number;
  headX?: number;
  scaleX?: number;
  scaleY?: number;
  legSwing?: number;
  armSwing?: number;
  leftLegAngle?: number;
  rightLegAngle?: number;
  leftLegX?: number;
  rightLegX?: number;
  leftLegY?: number;
  rightLegY?: number;
  leftArmAngle?: number;
  rightArmAngle?: number;
  leftArmX?: number;
  rightArmX?: number;
  leftArmY?: number;
  rightArmY?: number;
  armsOnTop?: boolean;
  alpha?: number;
};

type SceneLayout = {
  width: number;
  height: number;
  floorY: number;
  shelfTop: number;
  shelfWidth: number;
  shelfHeight: number;
  characterHeight: number;
  tableX: number;
  tableTop: number;
  boyX: number;
  shadowX: number;
  triggerX: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * clamp(amount, 0, 1);
}

function ease(amount: number) {
  const t = clamp(amount, 0, 1);
  return t * t * (3 - 2 * t);
}

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function createCutout(
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number },
) {
  const canvas = document.createElement("canvas");
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  const imageData = ctx.getImageData(0, 0, crop.width, crop.height);
  const pixels = imageData.data;
  const total = crop.width * crop.height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isBackground = (index: number) => {
    const offset = index * 4;
    const red = pixels[offset];
    const green = pixels[offset + 1];
    const blue = pixels[offset + 2];
    const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
    return red >= 212 && green >= 212 && blue >= 212 && spread <= 18;
  };

  const enqueue = (index: number) => {
    if (index < 0 || index >= total || visited[index] || !isBackground(index)) return;
    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < crop.width; x += 1) {
    enqueue(x);
    enqueue((crop.height - 1) * crop.width + x);
  }
  for (let y = 0; y < crop.height; y += 1) {
    enqueue(y * crop.width);
    enqueue(y * crop.width + crop.width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    pixels[index * 4 + 3] = 0;
    const x = index % crop.width;
    if (x > 0) enqueue(index - 1);
    if (x < crop.width - 1) enqueue(index + 1);
    if (index >= crop.width) enqueue(index - crop.width);
    if (index < total - crop.width) enqueue(index + crop.width);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function cropCanvas(
  source: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  mask?: Array<{ x: number; y: number }>,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
  if (mask && mask.length > 2) {
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = "#000000";
    ctx.beginPath();
    ctx.moveTo(mask[0].x, mask[0].y);
    for (let index = 1; index < mask.length; index += 1) {
      ctx.lineTo(mask[index].x, mask[index].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  return canvas;
}

function tintCanvas(source: HTMLCanvasElement) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < imageData.data.length; index += 4) {
    if (imageData.data[index + 3] === 0) continue;
    imageData.data[index] = 8;
    imageData.data[index + 1] = 7;
    imageData.data[index + 2] = 12;
    imageData.data[index + 3] = Math.min(238, imageData.data[index + 3]);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

function makePart(
  source: HTMLCanvasElement,
  box: { x: number; y: number; width: number; height: number },
  pivot: { x: number; y: number },
  mask?: Array<{ x: number; y: number }>,
): RigPart {
  return {
    image: cropCanvas(source, box.x, box.y, box.width, box.height, mask),
    ...box,
    pivotX: pivot.x,
    pivotY: pivot.y,
  };
}

function createRig(source: HTMLCanvasElement, kind: "boy" | "girl"): CharacterRig {
  if (kind === "boy") {
    return {
      width: 205,
      height: 365,
      head: makePart(source, { x: 0, y: 0, width: 205, height: 196 }, { x: 102, y: 184 }),
      torso: makePart(source, { x: 48, y: 181, width: 111, height: 107 }, { x: 103, y: 190 }),
      leftArm: makePart(
        source,
        { x: 35, y: 184, width: 40, height: 108 },
        { x: 63, y: 194 },
        [{ x: 5, y: 2 }, { x: 32, y: 2 }, { x: 28, y: 106 }, { x: 7, y: 106 }],
      ),
      rightArm: makePart(
        source,
        { x: 131, y: 184, width: 40, height: 108 },
        { x: 143, y: 194 },
        [{ x: 7, y: 2 }, { x: 34, y: 3 }, { x: 32, y: 106 }, { x: 11, y: 106 }],
      ),
      leftLeg: makePart(
        source,
        { x: 51, y: 267, width: 56, height: 98 },
        { x: 84, y: 274 },
        [{ x: 0, y: 0 }, { x: 51, y: 0 }, { x: 50, y: 98 }, { x: 0, y: 98 }],
      ),
      rightLeg: makePart(
        source,
        { x: 99, y: 267, width: 56, height: 98 },
        { x: 122, y: 274 },
        [{ x: 5, y: 0 }, { x: 56, y: 0 }, { x: 56, y: 98 }, { x: 6, y: 98 }],
      ),
    };
  }
  return {
    width: 198,
    height: 360,
    head: makePart(source, { x: 0, y: 0, width: 198, height: 194 }, { x: 99, y: 183 }),
    torso: makePart(source, { x: 49, y: 177, width: 101, height: 103 }, { x: 99, y: 188 }),
    leftArm: makePart(
      source,
      { x: 31, y: 178, width: 42, height: 105 },
      { x: 62, y: 190 },
      [{ x: 5, y: 2 }, { x: 35, y: 2 }, { x: 29, y: 103 }, { x: 7, y: 103 }],
    ),
    rightArm: makePart(
      source,
      { x: 126, y: 178, width: 42, height: 105 },
      { x: 137, y: 190 },
      [{ x: 7, y: 2 }, { x: 37, y: 2 }, { x: 35, y: 103 }, { x: 13, y: 103 }],
    ),
    leftLeg: makePart(
      source,
      { x: 49, y: 258, width: 55, height: 102 },
      { x: 82, y: 266 },
      [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 49, y: 102 }, { x: 0, y: 102 }],
    ),
    rightLeg: makePart(
      source,
      { x: 96, y: 258, width: 55, height: 102 },
      { x: 117, y: 266 },
      [{ x: 4, y: 0 }, { x: 55, y: 0 }, { x: 55, y: 102 }, { x: 5, y: 102 }],
    ),
  };
}

function getLayout(width: number, height: number): SceneLayout {
  const portrait = width / height < 0.78;
  const floorY = height * 0.835;
  const shelfWidth = width * (portrait ? 0.28 : 0.255);
  const shelfTop = height * (portrait ? 0.16 : 0.14);
  const shelfHeight = floorY - shelfTop + height * 0.025;
  const characterHeight = clamp(
    Math.min(height * (portrait ? 0.265 : 0.33), width * (portrait ? 0.35 : 0.19)),
    72,
    168,
  );
  const tableX = width * 0.63;
  return {
    width,
    height,
    floorY,
    shelfTop,
    shelfWidth,
    shelfHeight,
    characterHeight,
    tableX,
    tableTop: floorY - characterHeight * 0.56,
    boyX: width * (portrait ? 0.44 : 0.515),
    shadowX: width * (portrait ? 0.76 : 0.755),
    triggerX: width * (portrait ? 0.34 : 0.405),
  };
}

function drawPapelPicado(ctx: CanvasRenderingContext2D, layout: SceneLayout) {
  const colors = ["#2374ae", "#3e9e59", "#e7ad1f", "#ce3c35", "#e36f22", "#7f42a3"];
  const portrait = layout.width / layout.height < 0.78;
  const rows = portrait ? 2 : 3;
  for (let row = 0; row < rows; row += 1) {
    const y = layout.height * (0.035 + row * 0.07);
    const count = portrait ? 6 : 11;
    const gap = layout.width / count;
    const bannerW = Math.min(gap * 0.58, layout.height * 0.055);
    const bannerH = bannerW * 0.82;
    ctx.strokeStyle = "rgba(70, 46, 36, .6)";
    ctx.lineWidth = Math.max(1, layout.width / 720);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(layout.width / 2, y + layout.height * 0.026, layout.width, y);
    ctx.stroke();
    for (let index = 0; index < count; index += 1) {
      const x = gap * index + gap / 2 - bannerW / 2;
      const curve = Math.sin((index / Math.max(1, count - 1)) * Math.PI) * layout.height * 0.026;
      const top = y + curve;
      rect(ctx, x, top, bannerW, bannerH, colors[(index + row * 2) % colors.length]);
      rect(ctx, x + bannerW * 0.2, top + bannerH * 0.25, bannerW * 0.16, bannerH * 0.16, "#efdfb9");
      rect(ctx, x + bannerW * 0.64, top + bannerH * 0.25, bannerW * 0.16, bannerH * 0.16, "#efdfb9");
      rect(ctx, x + bannerW * 0.42, top + bannerH * 0.58, bannerW * 0.16, bannerH * 0.18, "#efdfb9");
    }
  }
}

function drawBookcase(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  seed: number,
) {
  const frame = Math.max(5, width * 0.052);
  rect(ctx, x - frame * 0.45, y - frame * 0.35, width + frame * 0.9, height + frame * 0.7, "#2a1712");
  rect(ctx, x, y, width, height, "#60371f");
  rect(ctx, x + frame, y + frame, width - frame * 2, height - frame * 1.45, "#211718");
  rect(ctx, x + frame * 0.3, y - frame * 0.2, width - frame * 0.6, frame * 0.75, "#87502b");
  const innerTop = y + frame * 1.4;
  const rowHeight = (height - frame * 2) / 4;
  const bookColors = ["#a83331", "#155a82", "#cf9722", "#5e3d87", "#397749", "#b84c1f", "#704039"];

  for (let shelf = 0; shelf < 4; shelf += 1) {
    const shelfBottom = innerTop + rowHeight * (shelf + 1);
    rect(ctx, x + frame * 0.65, shelfBottom - frame * 0.38, width - frame * 1.3, frame * 0.75, "#8a4e29");
    const available = width - frame * 2.2;
    const bookGap = Math.max(2, width * 0.012);
    let cursor = x + frame * 1.2;
    let book = 0;
    while (cursor < x + frame * 1.2 + available - width * 0.025) {
      const bookWidth = Math.max(4, width * (0.032 + ((book + seed) % 4) * 0.008));
      const bookHeight = rowHeight * (0.55 + ((book * 3 + shelf + seed) % 5) * 0.055);
      const color = bookColors[(book + shelf * 2 + seed) % bookColors.length];
      rect(ctx, cursor, shelfBottom - frame * 0.45 - bookHeight, bookWidth, bookHeight, color);
      if ((book + shelf) % 3 === 0) {
        rect(ctx, cursor + bookWidth * 0.25, shelfBottom - bookHeight * 0.66, bookWidth * 0.5, Math.max(1, bookHeight * 0.035), "#e1b04c");
      }
      cursor += bookWidth + bookGap;
      book += 1;
    }
  }
}

function drawFrontRoom(ctx: CanvasRenderingContext2D, layout: SceneLayout) {
  const { width, height, floorY, shelfTop, shelfWidth, shelfHeight } = layout;
  rect(ctx, 0, 0, width, height, "#efdfb9");
  rect(ctx, 0, floorY - height * 0.018, width, height * 0.025, "#b29b78");
  rect(ctx, 0, floorY, width, height - floorY, "#4d443f");

  const tile = Math.max(18, width * 0.065);
  for (let y = floorY; y < height; y += tile * 0.54) {
    const row = Math.floor((y - floorY) / (tile * 0.54));
    for (let x = row % 2 ? -tile / 2 : 0; x < width; x += tile) {
      rect(ctx, x, y, tile - 2, tile * 0.46, row % 2 ? "#554b45" : "#463d39");
      rect(ctx, x, y, tile - 2, 1, "#70635a");
    }
  }

  const panelWidth = width * 0.24;
  rect(ctx, width / 2 - panelWidth / 2, height * 0.23, panelWidth, height * 0.34, "rgba(207,177,128,.18)");
  rect(ctx, width / 2 - panelWidth / 2, height * 0.23, panelWidth, Math.max(2, width * 0.004), "#d3b786");
  drawPapelPicado(ctx, layout);
  drawBookcase(ctx, width * 0.025, shelfTop, shelfWidth, shelfHeight, 1);
  drawBookcase(ctx, width - width * 0.025 - shelfWidth, shelfTop, shelfWidth, shelfHeight, 4);
}

function drawTable(ctx: CanvasRenderingContext2D, layout: SceneLayout, shake: number) {
  const width = layout.characterHeight * 0.78;
  const height = layout.floorY - layout.tableTop;
  const wobble = Math.sin(shake * 15) * Math.min(layout.characterHeight * 0.02, shake * 2);
  const x = layout.tableX + wobble;
  const topThickness = Math.max(5, layout.characterHeight * 0.055);
  rect(ctx, x - width / 2 - 3, layout.tableTop - 3, width + 6, topThickness + 6, "#2f1a13");
  rect(ctx, x - width / 2, layout.tableTop, width, topThickness, "#714124");
  rect(ctx, x - width * 0.39, layout.tableTop + topThickness, width * 0.075, height - topThickness, "#4b2a1d");
  rect(ctx, x + width * 0.315, layout.tableTop + topThickness, width * 0.075, height - topThickness, "#4b2a1d");
  rect(ctx, x - width * 0.29, layout.tableTop + topThickness, width * 0.06, height * 0.86, "#724126");
  rect(ctx, x + width * 0.23, layout.tableTop + topThickness, width * 0.06, height * 0.86, "#724126");
}

function drawPart(
  ctx: CanvasRenderingContext2D,
  part: RigPart,
  angle: number,
  offsetX = 0,
  offsetY = 0,
) {
  ctx.save();
  ctx.translate(part.pivotX + offsetX, part.pivotY + offsetY);
  ctx.rotate(angle);
  ctx.drawImage(
    part.image,
    part.x - part.pivotX,
    part.y - part.pivotY,
    part.width,
    part.height,
  );
  ctx.restore();
}

function applyRigTransform(
  ctx: CanvasRenderingContext2D,
  rig: CharacterRig,
  centerX: number,
  footY: number,
  height: number,
  motion: RigMotion,
) {
  const scale = height / rig.height;
  ctx.globalAlpha = motion.alpha ?? 1;
  ctx.translate(
    Math.round(centerX + (motion.bodyX ?? 0)),
    Math.round(footY - (motion.bob ?? 0) + (motion.bodyY ?? 0)),
  );
  ctx.rotate(motion.bodyRotation ?? 0);
  ctx.scale(scale * (motion.scaleX ?? 1), scale * (motion.scaleY ?? 1));
  ctx.translate(-rig.width / 2, -rig.height);
  ctx.imageSmoothingEnabled = false;
}

function drawRig(
  ctx: CanvasRenderingContext2D,
  rig: CharacterRig | undefined,
  centerX: number,
  footY: number,
  height: number,
  motion: RigMotion = {},
) {
  if (!rig) return;
  const legSwing = motion.legSwing ?? 0;
  const armSwing = motion.armSwing ?? 0;
  const leftLegAngle = motion.leftLegAngle ?? legSwing;
  const rightLegAngle = motion.rightLegAngle ?? -legSwing;
  const leftArmAngle = motion.leftArmAngle ?? -armSwing;
  const rightArmAngle = motion.rightArmAngle ?? armSwing;

  ctx.save();
  applyRigTransform(ctx, rig, centerX, footY, height, motion);
  drawPart(ctx, rig.leftLeg, leftLegAngle, motion.leftLegX, motion.leftLegY);
  drawPart(ctx, rig.rightLeg, rightLegAngle, motion.rightLegX, motion.rightLegY);
  if (!motion.armsOnTop) {
    drawPart(ctx, rig.leftArm, leftArmAngle, motion.leftArmX, motion.leftArmY);
    drawPart(ctx, rig.rightArm, rightArmAngle, motion.rightArmX, motion.rightArmY);
  }
  ctx.drawImage(rig.torso.image, rig.torso.x, rig.torso.y, rig.torso.width, rig.torso.height);
  drawPart(ctx, rig.head, motion.headTilt ?? 0, motion.headX, motion.headBob);
  if (motion.armsOnTop) {
    drawPart(ctx, rig.leftArm, leftArmAngle, motion.leftArmX, motion.leftArmY);
    drawPart(ctx, rig.rightArm, rightArmAngle, motion.rightArmX, motion.rightArmY);
  }
  ctx.restore();
}

function drawRigArmsOverlay(
  ctx: CanvasRenderingContext2D,
  rig: CharacterRig,
  centerX: number,
  footY: number,
  height: number,
  motion: RigMotion,
) {
  ctx.save();
  applyRigTransform(ctx, rig, centerX, footY, height, motion);
  drawPart(ctx, rig.leftArm, motion.leftArmAngle ?? 0, motion.leftArmX, motion.leftArmY);
  drawPart(ctx, rig.rightArm, motion.rightArmAngle ?? 0, motion.rightArmX, motion.rightArmY);
  ctx.restore();
}

function walkMotion(time: number, strength = 1): RigMotion {
  const phase = time * Math.PI * 2;
  const step = Math.sin(phase);
  const contact = Math.abs(Math.sin(phase));
  const leftLift = Math.max(0, -Math.cos(phase)) * 5.5 * strength;
  const rightLift = Math.max(0, Math.cos(phase)) * 5.5 * strength;
  return {
    bob: contact * 1.8 * strength,
    bodyRotation: -step * 0.018 * strength,
    headBob: contact * 1.5 * strength,
    headTilt: step * 0.02 * strength,
    scaleX: 1 + contact * 0.006 * strength,
    scaleY: 1 - contact * 0.01 * strength,
    leftLegAngle: step * 0.19 * strength,
    rightLegAngle: -step * 0.19 * strength,
    leftLegY: -leftLift,
    rightLegY: -rightLift,
    leftArmAngle: -step * 0.15 * strength,
    rightArmAngle: step * 0.15 * strength,
  };
}

function idleMotion(time: number, strength = 1): RigMotion {
  const breath = Math.sin(time * Math.PI * 2);
  return {
    bob: Math.max(0, breath) * 0.7 * strength,
    headBob: -breath * 0.8 * strength,
    headTilt: Math.sin(time * Math.PI) * 0.008 * strength,
    scaleY: 1 + breath * 0.003 * strength,
  };
}

function drawGroundShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  alpha = 0.25,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#110b14";
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(y), width * 0.34, width * 0.075, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCinematicLighting(
  ctx: CanvasRenderingContext2D,
  layout: SceneLayout,
  intensity: number,
) {
  const amount = clamp(intensity, 0, 1);
  if (amount <= 0) return;
  const glow = ctx.createRadialGradient(
    layout.tableX,
    layout.floorY - layout.characterHeight * 0.62,
    layout.characterHeight * 0.28,
    layout.tableX,
    layout.floorY - layout.characterHeight * 0.62,
    layout.width * 0.72,
  );
  glow.addColorStop(0, "rgba(255, 232, 176, 0)");
  glow.addColorStop(0.58, `rgba(47, 25, 45, ${0.025 * amount})`);
  glow.addColorStop(1, `rgba(17, 9, 20, ${0.19 * amount})`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, layout.width, layout.height);
}

function drawDecorativeStrip(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  targetX: number,
  targetY: number,
  progress: number,
  flutter: number,
  size: number,
) {
  const p = ease(progress);
  const endX = lerp(startX, targetX, p);
  const endY = lerp(startY, targetY, p);
  const colors = ["#e86a22", "#d23d39", "#e8ac20", "#8343a3", "#278255"];
  const sag = size * (0.05 + 0.035 * p);

  ctx.save();
  ctx.strokeStyle = "#694124";
  ctx.lineWidth = Math.max(1, size * 0.012);
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.quadraticCurveTo((startX + endX) / 2, (startY + endY) / 2 + sag, endX, endY);
  ctx.stroke();

  const totalFlags = 9;
  for (let index = 1; index <= totalFlags; index += 1) {
    const u = index / (totalFlags + 1);
    if (u > p + 0.02) continue;
    const x = lerp(startX, targetX, u);
    const y = lerp(startY, targetY, u) + Math.sin(Math.PI * u) * sag;
    const flagW = size * 0.105;
    const flagH = size * (0.13 + Math.sin(flutter * 4 + index) * 0.008);
    ctx.fillStyle = colors[index % colors.length];
    ctx.beginPath();
    ctx.moveTo(x - flagW / 2, y);
    ctx.lineTo(x + flagW / 2, y);
    ctx.lineTo(x + flagW * 0.36, y + flagH);
    ctx.lineTo(x, y + flagH * 0.78);
    ctx.lineTo(x - flagW * 0.36, y + flagH);
    ctx.closePath();
    ctx.fill();
    rect(ctx, x - flagW * 0.09, y + flagH * 0.24, flagW * 0.18, flagH * 0.18, "#f5dfb2");
  }
  ctx.restore();
}

function drawPaperBundle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  openProgress: number,
) {
  const p = clamp(openProgress, 0, 1);
  const colors = ["#e86a22", "#d23d39", "#e8ac20", "#8343a3"];
  for (let index = 0; index < 4; index += 1) {
    const spread = (index - 1.5) * size * 0.06 * p;
    rect(
      ctx,
      x - size * 0.12 + spread,
      y - size * 0.08 - index * size * 0.012,
      size * 0.24,
      size * 0.075,
      colors[index],
    );
  }
  rect(ctx, x - size * 0.025, y - size * 0.12, size * 0.05, size * 0.14, "#6c3c24");
}

function drawSparkle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  rect(ctx, x - size * 0.12, y - size * 0.5, size * 0.24, size, "#f1b82f");
  rect(ctx, x - size * 0.5, y - size * 0.12, size, size * 0.24, "#f1b82f");
  rect(ctx, x - size * 0.17, y - size * 0.17, size * 0.34, size * 0.34, "#fff5d8");
}

function drawTarget(ctx: CanvasRenderingContext2D, layout: SceneLayout, time: number) {
  const y = layout.floorY - layout.characterHeight * 1.14 + Math.sin(time * 4) * 3;
  const size = Math.max(6, layout.characterHeight * 0.08);
  ctx.fillStyle = "#efad25";
  ctx.beginPath();
  ctx.moveTo(layout.boyX - size, y);
  ctx.lineTo(layout.boyX + size, y);
  ctx.lineTo(layout.boyX, y + size);
  ctx.closePath();
  ctx.fill();
}

function drawCarrySequence(
  ctx: CanvasRenderingContext2D,
  rigs: RigSet,
  layout: SceneLayout,
  progress: number,
) {
  const p = clamp(progress, 0, 1);
  const crouchIn = ease(clamp(p / 0.25, 0, 1));
  const transfer = ease(clamp((p - 0.18) / 0.52, 0, 1));
  const stand = ease(clamp((p - 0.68) / 0.32, 0, 1));
  const boyHeight = layout.characterHeight;
  const girlHeight = lerp(layout.characterHeight * 0.92, layout.characterHeight * 0.78, transfer);
  const boyX = layout.tableX - boyHeight * 0.12;
  const boyCrouch = crouchIn * (1 - stand);
  const girlX = lerp(layout.tableX, boyX + boyHeight * 0.12, transfer);
  const girlFoot = lerp(layout.tableTop, layout.floorY - boyHeight * 0.12, transfer);
  const girlMotion: RigMotion = {
    bodyRotation: lerp(-0.03, -0.035, transfer),
    bob: Math.sin(transfer * Math.PI) * boyHeight * 0.035,
    scaleY: lerp(1, 0.96, transfer),
    leftArmAngle: lerp(1.18, -1.12, transfer),
    rightArmAngle: lerp(-1.18, 1.12, transfer),
    leftArmY: transfer * 18,
    rightArmY: transfer * 18,
    leftLegAngle: lerp(0.02, 0.62, transfer),
    rightLegAngle: lerp(-0.02, -0.62, transfer),
    leftLegY: -transfer * 42,
    rightLegY: -transfer * 42,
    headTilt: -0.02 * transfer,
  };
  const boyMotion: RigMotion = {
    bodyY: boyCrouch * boyHeight * 0.08,
    scaleY: 1 - boyCrouch * 0.11,
    scaleX: 1 + boyCrouch * 0.055,
    bodyRotation: lerp(0, 0.025, transfer),
    leftLegAngle: boyCrouch * 0.11,
    rightLegAngle: -boyCrouch * 0.11,
    leftArmAngle: lerp(0, 0.62, transfer),
    rightArmAngle: lerp(0, -0.62, transfer),
    headBob: boyCrouch * 3,
  };

  drawGroundShadow(ctx, boyX, layout.floorY + 2, boyHeight, 0.31);
  drawRig(ctx, rigs.girl, girlX, girlFoot, girlHeight, girlMotion);
  drawRig(ctx, rigs.boy, boyX, layout.floorY, boyHeight, boyMotion);
  if (transfer > 0.38) {
    drawRigArmsOverlay(ctx, rigs.girl, girlX, girlFoot, girlHeight, girlMotion);
  }
}

function drawWorld(
  ctx: CanvasRenderingContext2D,
  model: GameModel,
  rigs: RigSet | null,
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const layout = getLayout(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  drawFrontRoom(ctx, layout);

  if (model.phase === "intro" || model.phase === "walk") {
    drawTable(ctx, layout, 0);
    if (rigs) {
      drawGroundShadow(ctx, layout.boyX, layout.floorY + 2, layout.characterHeight);
      drawGroundShadow(ctx, layout.shadowX, layout.floorY + 2, layout.characterHeight * 0.98);
      drawGroundShadow(ctx, width * model.playerX, layout.floorY + 2, layout.characterHeight);
      drawRig(ctx, rigs.boy, layout.boyX, layout.floorY, layout.characterHeight, idleMotion(model.walkFrame, 0.8));
      drawRig(ctx, rigs.shadow, layout.shadowX, layout.floorY, layout.characterHeight * 0.98, {
        ...idleMotion(model.walkFrame + 0.35, 0.85),
        headTilt: -0.012,
      });
      drawRig(
        ctx,
        rigs.girl,
        width * model.playerX,
        layout.floorY,
        layout.characterHeight,
        model.phase === "walk" ? walkMotion(model.walkFrame) : idleMotion(model.walkFrame, 0.75),
      );
    }
    if (model.phase === "walk") drawTarget(ctx, layout, model.walkFrame);
    return;
  }

  if (model.phase === "end") {
    rect(ctx, 0, 0, width, height, "#050409");
    return;
  }

  const t = model.cutsceneTime;
  const h = layout.characterHeight;
  let girlX = width * 0.43;
  let girlFoot = layout.floorY;
  let girlHeight = h;
  let girlMotion: RigMotion = idleMotion(t * 0.45, 0.75);
  let boyX = layout.boyX;
  let boyMotion: RigMotion = idleMotion(t * 0.48, 0.8);
  let shadowX = layout.shadowX;
  let shadowMotion: RigMotion = idleMotion(t * 0.48 + 0.35, 0.8);
  let shadowVisible = true;
  let girlVisible = true;
  let boyVisible = true;
  let tableShake = 0;
  const firstStripProgress = clamp(t / 4.2, 0, 1);
  const firstStripY = layout.floorY - h * 1.17;
  const secondStripProgress = clamp((t - 9.4) / 4.1, 0, 1);
  const secondStripY = layout.tableTop - h * 1.25;

  if (t < 4.5) {
    const reachPulse = Math.sin(t * Math.PI * 1.35) * 0.07;
    boyMotion = {
      ...idleMotion(t * 0.7, 0.65),
      bodyRotation: -0.018,
      armsOnTop: true,
      leftArmAngle: 2.67 + reachPulse,
      rightArmAngle: -2.56 - reachPulse * 0.7,
      headTilt: 0.018,
    };
    shadowMotion = {
      ...idleMotion(t * 0.7 + 0.25, 0.65),
      bodyRotation: 0.018,
      armsOnTop: true,
      leftArmAngle: 2.54 - reachPulse * 0.7,
      rightArmAngle: -2.68 + reachPulse,
      headTilt: -0.018,
    };
    girlMotion = {
      ...idleMotion(t * 0.42, 0.7),
      headTilt: -0.025 + Math.sin(t * 1.3) * 0.006,
      bodyRotation: -0.008,
    };
  }

  if (t >= 4.5 && t < 6.9) {
    const p = ease((t - 4.5) / 2.4);
    girlX = lerp(width * 0.43, layout.tableX - h * 0.14, p);
    girlMotion = walkMotion((t - 4.5) * 1.55, 0.95);
    boyMotion = { ...idleMotion(t * 0.45, 0.7), headTilt: 0.015 };
    shadowMotion = { ...idleMotion(t * 0.45 + 0.3, 0.7), headTilt: -0.015 };
  }

  if (t >= 6.9 && t < 8.8) {
    const p = ease((t - 6.9) / 1.9);
    const jumpArc = Math.sin(p * Math.PI) * h * 0.16;
    girlX = lerp(layout.tableX - h * 0.14, layout.tableX, p);
    girlFoot = lerp(layout.floorY, layout.tableTop, p) - jumpArc;
    girlHeight = lerp(h, h * 0.92, p);
    girlMotion = {
      bodyRotation: Math.sin(p * Math.PI) * -0.055,
      scaleX: 1 + Math.sin(p * Math.PI) * 0.055,
      scaleY: 1 - Math.sin(p * Math.PI) * 0.07,
      leftLegAngle: Math.sin(p * Math.PI) * 0.28,
      rightLegAngle: -Math.sin(p * Math.PI) * 0.2,
      leftLegY: -Math.sin(p * Math.PI) * 7,
      rightArmAngle: -1.2 - p * 1.25,
      leftArmAngle: 0.9 + p * 0.4,
      headTilt: -0.025,
    };
  }

  if (t >= 8.8 && t < 9.7) {
    const p = ease((t - 8.8) / 0.9);
    girlX = layout.tableX;
    girlFoot = layout.tableTop;
    girlHeight = h * 0.92;
    girlMotion = {
      bodyY: Math.sin(p * Math.PI) * 2,
      scaleX: 1 + (1 - p) * 0.045,
      scaleY: 0.94 + p * 0.06,
      leftArmAngle: lerp(1.3, 0.2, p),
      rightArmAngle: lerp(-2.45, -0.25, p),
      headTilt: lerp(-0.03, 0.015, p),
    };
  }

  if (t >= 9.7 && t < 13.8) {
    const p = ease((t - 9.7) / 4.1);
    const unfold = Math.sin(p * Math.PI);
    girlX = layout.tableX;
    girlFoot = layout.tableTop;
    girlHeight = h * 0.92;
    girlMotion = {
      bob: unfold * 1.5,
      bodyRotation: Math.sin(p * Math.PI * 2) * 0.009,
      armsOnTop: true,
      scaleY: 1 + unfold * 0.018,
      leftArmAngle: lerp(0.18, 2.92, clamp(p / 0.58, 0, 1)),
      rightArmAngle: lerp(-0.18, -2.92, clamp((p - 0.12) / 0.72, 0, 1)),
      leftArmY: -p * 2,
      rightArmY: -p * 2,
      headTilt: Math.sin(p * Math.PI) * -0.025,
    };
  }

  if (t >= 13.8 && t < 16.7) {
    const p = ease((t - 13.8) / 2.9);
    tableShake = p * 1.35;
    girlX = layout.tableX + Math.sin(t * 13) * h * 0.008 * p;
    girlFoot = layout.tableTop;
    girlHeight = h * 0.92;
    girlMotion = {
      bodyY: p * h * 0.028,
      armsOnTop: true,
      bodyRotation: -0.045 * p + Math.sin(t * 8) * 0.012 * p,
      scaleX: 1 + p * 0.045,
      scaleY: 1 - p * 0.065,
      leftLegAngle: p * 0.1,
      rightLegAngle: -p * 0.1,
      leftArmAngle: lerp(2.92, 1.22, p),
      rightArmAngle: lerp(-2.92, -1.22, p),
      headTilt: -0.04 * p,
    };
  }

  if (t >= 16.7 && t < 21.5) {
    tableShake = 1.4;
    girlX = layout.tableX + Math.sin(t * 15) * h * 0.012;
    girlFoot = layout.tableTop;
    girlHeight = h * 0.92;
    girlMotion = {
      bodyRotation: Math.sin(t * 11) * 0.035,
      armsOnTop: true,
      scaleX: 1.035,
      scaleY: 0.95,
      leftLegAngle: 0.11 + Math.sin(t * 7) * 0.035,
      rightLegAngle: -0.11 - Math.sin(t * 7) * 0.035,
      leftArmAngle: 1.25 + Math.sin(t * 6) * 0.08,
      rightArmAngle: -1.25 - Math.sin(t * 6) * 0.08,
      headTilt: Math.sin(t * 9) * 0.028,
    };
  }

  if (t >= 16.2 && t < 19.1) {
    const p = ease((t - 16.2) / 2.9);
    shadowX = lerp(layout.shadowX, width * 0.06, p);
    shadowMotion = walkMotion((t - 16.2) * 2.05, 1.28);
    shadowMotion.bodyRotation = -0.035;
  } else if (t >= 19.1) {
    shadowVisible = false;
  }

  if (t >= 18.7 && t < 21.5) {
    const p = ease((t - 18.7) / 2.8);
    boyX = lerp(layout.boyX, layout.tableX - h * 0.12, p);
    boyMotion = p < 0.82
      ? walkMotion((t - 18.7) * 1.65, 0.95)
      : {
          bodyY: (p - 0.82) * h * 0.1,
          scaleX: 1.025,
          scaleY: 0.96,
          headTilt: 0.02,
          leftArmAngle: 0.24,
          rightArmAngle: -0.24,
        };
  } else if (t >= 16.7) {
    boyMotion = { ...idleMotion(t * 0.55, 0.65), headTilt: 0.026 };
  }

  drawDecorativeStrip(
    ctx,
    layout.boyX - h * 0.28,
    firstStripY,
    layout.shadowX + h * 0.28,
    firstStripY + h * 0.025,
    firstStripProgress,
    t,
    h,
  );

  if (t >= 9.4) {
    drawDecorativeStrip(
      ctx,
      layout.tableX - h * 0.78,
      secondStripY,
      layout.tableX + h * 0.78,
      secondStripY - h * 0.015,
      secondStripProgress,
      t * 1.2,
      h,
    );
    if (t >= 13.45 && t < 14.4) {
      const sparkle = h * (0.07 + Math.sin((t - 13.45) * Math.PI) * 0.035);
      drawSparkle(ctx, layout.tableX + h * 0.78, secondStripY, sparkle);
    }
  }

  drawTable(ctx, layout, tableShake ? tableShake + t : 0);

  if (t >= 8.8 && t < 11.2) {
    const pickup = ease(clamp((t - 8.8) / 1.8, 0, 1));
    drawPaperBundle(
      ctx,
      lerp(layout.tableX + h * 0.25, layout.tableX + h * 0.33, pickup),
      lerp(layout.tableTop - h * 0.035, layout.tableTop - h * 0.58, pickup),
      h,
      pickup,
    );
  }

  if (t >= 21.5 && t < 25.2 && rigs) {
    girlVisible = false;
    boyVisible = false;
    drawCarrySequence(ctx, rigs, layout, (t - 21.5) / 3.7);
  }

  if (t >= 25.2 && t < 27.8) {
    const p = ease((t - 25.2) / 2.6);
    boyX = layout.tableX - h * 0.12;
    boyMotion = {
      bodyY: Math.sin(p * Math.PI) * h * 0.035,
      scaleX: 1 + Math.sin(p * Math.PI) * 0.035,
      scaleY: 1 - Math.sin(p * Math.PI) * 0.065,
      leftArmAngle: lerp(0.62, 0, p),
      rightArmAngle: lerp(-0.62, 0, p),
      headTilt: 0.02 * (1 - p),
    };
    girlX = lerp(layout.tableX, layout.tableX + h * 0.32, p);
    girlFoot = lerp(layout.floorY - h * 0.12, layout.floorY, p);
    girlHeight = lerp(h * 0.78, h, p);
    girlMotion = {
      bodyRotation: lerp(-0.07, 0, p),
      leftArmAngle: lerp(-1.12, 0, p),
      rightArmAngle: lerp(1.12, 0, p),
      leftArmY: lerp(18, 0, p),
      rightArmY: lerp(18, 0, p),
      leftLegAngle: lerp(0.62, 0, p),
      rightLegAngle: lerp(-0.62, 0, p),
      leftLegY: lerp(-42, 0, p),
      rightLegY: lerp(-42, 0, p),
      bob: Math.sin(p * Math.PI) * 2,
      headTilt: lerp(-0.02, 0.015, p),
    };
  }

  if (t >= 27.8 && t < 30.2) {
    boyX = layout.tableX - h * 0.22;
    girlX = layout.tableX + h * 0.28;
    girlFoot = layout.floorY;
    girlHeight = h;
    boyMotion = { ...idleMotion(t * 0.6, 0.65), headTilt: 0.025, bodyRotation: 0.008 };
    girlMotion = { ...idleMotion(t * 0.6 + 0.25, 0.65), headTilt: -0.025, bodyRotation: -0.008 };
    const pulse = 0.75 + Math.sin((t - 27.8) * Math.PI * 2) * 0.25;
    drawSparkle(ctx, layout.tableX + h * 0.02, layout.floorY - h * 0.82, h * 0.1 * pulse);
  }

  if (t >= 30.2) {
    const p = ease((t - 30.2) / 3.1);
    girlX = lerp(layout.tableX + h * 0.28, width * 0.28, p);
    girlFoot = layout.floorY;
    boyX = lerp(layout.tableX - h * 0.22, width * 0.78, p);
    girlMotion = walkMotion((t - 30.2) * 1.65, 1.05);
    boyMotion = walkMotion((t - 30.2) * 1.55 + 0.3, 1.05);
  }

  if (rigs) {
    if (shadowVisible) {
      drawGroundShadow(ctx, shadowX, layout.floorY + 2, h * 0.98, 0.27);
      drawRig(ctx, rigs.shadow, shadowX, layout.floorY, h * 0.98, shadowMotion);
    }
    if (boyVisible) {
      drawGroundShadow(ctx, boyX, layout.floorY + 2, h, 0.27);
      drawRig(ctx, rigs.boy, boyX, layout.floorY, h, boyMotion);
    }
    if (girlVisible) {
      if (girlFoot > layout.floorY - h * 0.2) {
        drawGroundShadow(ctx, girlX, layout.floorY + 2, girlHeight, 0.25);
      }
      drawRig(ctx, rigs.girl, girlX, girlFoot, girlHeight, girlMotion);
    }
  }

  drawCinematicLighting(ctx, layout, ease(clamp(t / 2.2, 0, 1)));

  if (t >= 33.3) {
    const fade = clamp((t - 33.3) / 2.2, 0, 1);
    ctx.fillStyle = `rgba(5, 4, 9, ${fade})`;
    ctx.fillRect(0, 0, width, height);
  }
}

function initialModel(): GameModel {
  return {
    phase: "intro",
    playerX: 0.16,
    walkFrame: 0,
    cutsceneTime: 0,
    cutsceneStartedAt: 0,
  };
}

export default function MemoryGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const rigsRef = useRef<RigSet | null>(null);
  const modelRef = useRef<GameModel>(initialModel());
  const keysRef = useRef({ left: false, right: false });
  const musicEnabledRef = useRef(true);
  const [phase, setPhase] = useState<GamePhase>("intro");
  const [musicEnabled, setMusicEnabled] = useState(true);

  const playMusicFromCue = useCallback((restartFromCue = false) => {
    if (!musicEnabledRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 0.16;
    try {
      if (restartFromCue || audio.currentTime < 112 || audio.currentTime >= 289) {
        audio.currentTime = 113;
      }
    } catch {
      // The browser will apply the cue after metadata becomes available.
    }
    void audio.play().then(() => {
      if (audio.currentTime < 112) audio.currentTime = 113;
    }).catch(() => {
      // The music toggle remains available if the browser needs another gesture.
    });
  }, []);

  const startGame = useCallback(() => {
    const restartMusic = modelRef.current.phase === "end";
    modelRef.current = { ...initialModel(), phase: "walk" };
    keysRef.current.left = false;
    keysRef.current.right = false;
    setPhase("walk");
    playMusicFromCue(restartMusic);
    window.setTimeout(() => canvasRef.current?.focus(), 0);
  }, [playMusicFromCue]);

  const toggleMusic = useCallback(() => {
    const next = !musicEnabledRef.current;
    musicEnabledRef.current = next;
    setMusicEnabled(next);
    const audio = audioRef.current;
    if (!audio) return;
    if (next) {
      audio.volume = 0.16;
      if (audio.currentTime < 112) audio.currentTime = 113;
      void audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const startAutomatically = () => playMusicFromCue(true);
    const unlockPlayback = () => playMusicFromCue(false);

    if (audio.readyState >= 1) startAutomatically();
    else audio.addEventListener("loadedmetadata", startAutomatically, { once: true });

    window.addEventListener("pointerdown", unlockPlayback, { once: true, passive: true });
    window.addEventListener("touchstart", unlockPlayback, { once: true, passive: true });
    window.addEventListener("keydown", unlockPlayback, { once: true });

    return () => {
      audio.removeEventListener("loadedmetadata", startAutomatically);
      window.removeEventListener("pointerdown", unlockPlayback);
      window.removeEventListener("touchstart", unlockPlayback);
      window.removeEventListener("keydown", unlockPlayback);
    };
  }, [playMusicFromCue]);

  useEffect(() => {
    const image = new Image();
    image.src = "game-assets/characters-reference.png";
    image.onload = () => {
      const boyCanvas = createCutout(image, { x: 250, y: 52, width: 205, height: 365 });
      const girlCanvas = createCutout(image, { x: 443, y: 61, width: 198, height: 360 });
      rigsRef.current = {
        boy: createRig(boyCanvas, "boy"),
        girl: createRig(girlCanvas, "girl"),
        shadow: createRig(tintCanvas(boyCanvas), "boy"),
      };
    };
    return () => {
      image.onload = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(1, 760 / Math.max(bounds.width, bounds.height));
      canvas.width = Math.max(320, Math.round(bounds.width * scale));
      canvas.height = Math.max(320, Math.round(bounds.height * scale));
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    let animationFrame = 0;
    let previous = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const model = modelRef.current;

      if (model.phase === "intro") model.walkFrame += dt * 0.35;

      if (model.phase === "walk") {
        const direction = Number(keysRef.current.right) - Number(keysRef.current.left);
        model.walkFrame += dt * (direction === 0 ? 0.35 : 1.65);
        if (direction !== 0) {
          model.playerX = clamp(model.playerX + direction * 0.23 * dt, 0.08, 0.44);
        }
        const layout = getLayout(canvas.width, canvas.height);
        if (model.playerX * canvas.width >= layout.triggerX) {
          model.phase = "cinematic";
          model.cutsceneStartedAt = now;
          model.cutsceneTime = 0;
          keysRef.current.left = false;
          keysRef.current.right = false;
          setPhase("cinematic");
        }
      } else if (model.phase === "cinematic") {
        model.cutsceneTime = (now - model.cutsceneStartedAt) / 1000;
        if (model.cutsceneTime >= 35.7) {
          model.phase = "end";
          setPhase("end");
          audioRef.current?.pause();
        }
      }

      drawWorld(ctx, model, rigsRef.current);
      animationFrame = requestAnimationFrame(loop);
    };

    animationFrame = requestAnimationFrame(loop);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(event.key)) {
        keysRef.current.left = true;
        if (!event.repeat && modelRef.current.phase === "walk") {
          modelRef.current.playerX = clamp(modelRef.current.playerX - 0.035, 0.08, 0.44);
          modelRef.current.walkFrame += 0.22;
        }
        event.preventDefault();
      }
      if (["ArrowRight", "d", "D"].includes(event.key)) {
        keysRef.current.right = true;
        if (!event.repeat && modelRef.current.phase === "walk") {
          modelRef.current.playerX = clamp(modelRef.current.playerX + 0.035, 0.08, 0.44);
          modelRef.current.walkFrame += 0.22;
        }
        event.preventDefault();
      }
      if (["Enter", " "].includes(event.key) && (modelRef.current.phase === "intro" || modelRef.current.phase === "end")) {
        event.preventDefault();
        startGame();
      }
      if (["m", "M"].includes(event.key)) toggleMusic();
    };
    const keyUp = (event: KeyboardEvent) => {
      if (["ArrowLeft", "a", "A"].includes(event.key)) keysRef.current.left = false;
      if (["ArrowRight", "d", "D"].includes(event.key)) keysRef.current.right = false;
    };
    window.addEventListener("keydown", keyDown, { passive: false });
    window.addEventListener("keyup", keyUp);
    return () => {
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
    };
  }, [startGame, toggleMusic]);

  const pressDirection = (direction: "left" | "right", pressed: boolean) => {
    keysRef.current[direction] = pressed;
  };

  const nudgeDirection = (direction: "left" | "right") => {
    if (modelRef.current.phase !== "walk") return;
    modelRef.current.playerX = clamp(
      modelRef.current.playerX + (direction === "left" ? -0.05 : 0.05),
      0.08,
      0.44,
    );
    modelRef.current.walkFrame += 0.28;
  };

  return (
    <main className="game-page">
      <audio
        ref={audioRef}
        src="game-assets/background-music.mp3#t=113"
        preload="auto"
        autoPlay
        playsInline
        onEnded={() => {
          const audio = audioRef.current;
          if (!audio || !musicEnabledRef.current || modelRef.current.phase === "end") return;
          audio.currentTime = 113;
          void audio.play().catch(() => undefined);
        }}
      />

      <canvas
        ref={canvasRef}
        className="game-canvas"
        tabIndex={0}
        aria-label="Juego pixel art frontal con personajes animados. Controlas a la chica y caminas hacia los otros dos personajes."
      />

      <div className={`scene-status scene-status-${phase}`} aria-hidden="true">
        <span className="status-light" />
        {phase === "walk" && "ACÉRCATE A ELLOS"}
        {phase === "cinematic" && "CINEMÁTICA"}
        {phase === "intro" && "TÚ ERES ELLA"}
      </div>

      <button
        type="button"
        className="music-button"
        aria-label={musicEnabled ? "Silenciar música" : "Activar música"}
        aria-pressed={musicEnabled}
        onClick={toggleMusic}
      >
        {musicEnabled ? "♪" : "×"}
      </button>

      {phase === "intro" && (
        <section className="start-overlay" aria-label="Iniciar juego">
          <div className="start-card">
            <span>TÚ ERES ELLA</span>
            <p>Camina hasta los otros dos personajes.</p>
            <button type="button" className="start-button" onClick={startGame}>
              COMENZAR
            </button>
          </div>
        </section>
      )}

      {phase === "end" && (
        <section className="end-overlay" aria-label="Fin del juego">
          <span>FIN</span>
          <button type="button" className="restart-button" onClick={startGame}>
            VOLVER A VER
          </button>
        </section>
      )}

      <div className={`touch-controls ${phase === "walk" ? "is-active" : ""}`} aria-label="Controles del juego">
        <button
          type="button"
          className="move-button"
          aria-label="Caminar a la izquierda"
          disabled={phase !== "walk"}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pressDirection("left", true);
          }}
          onPointerUp={() => pressDirection("left", false)}
          onPointerCancel={() => pressDirection("left", false)}
          onLostPointerCapture={() => pressDirection("left", false)}
          onClick={() => nudgeDirection("left")}
        >
          ←
        </button>

        <div className="keyboard-hint" aria-hidden="true">
          {phase === "walk" ? "A / D  ·  ← / →" : ""}
        </div>

        <button
          type="button"
          className="move-button"
          aria-label="Caminar a la derecha"
          disabled={phase !== "walk"}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pressDirection("right", true);
          }}
          onPointerUp={() => pressDirection("right", false)}
          onPointerCancel={() => pressDirection("right", false)}
          onLostPointerCapture={() => pressDirection("right", false)}
          onClick={() => nudgeDirection("right")}
        >
          →
        </button>
      </div>
    </main>
  );
}
