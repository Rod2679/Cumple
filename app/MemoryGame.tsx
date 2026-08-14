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
  palette: {
    sleeve: string;
    skin: string;
    outline: string;
  };
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
  leftElbow?: number;
  rightElbow?: number;
  armsOnTop?: boolean;
  hideArms?: boolean;
  alpha?: number;
};

const BOY_SCALE = 1.075;

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

function createRig(source: HTMLCanvasElement, kind: "boy" | "girl" | "shadow"): CharacterRig {
  const palette = kind === "shadow"
    ? { sleeve: "#09080d", skin: "#0d0c12", outline: "#020205" }
    : kind === "girl"
      ? { sleeve: "#8b2949", skin: "#f3c8c2", outline: "#342027" }
      : { sleeve: "#182326", skin: "#f3c8c2", outline: "#20191b" };

  if (kind !== "girl") {
    return {
      width: 455,
      height: 794,
      palette,
      head: makePart(source, { x: 0, y: 0, width: 455, height: 430 }, { x: 228, y: 420 }),
      torso: makePart(
        source,
        { x: 95, y: 410, width: 265, height: 215 },
        { x: 228, y: 420 },
        [
          { x: 42, y: 0 }, { x: 223, y: 0 }, { x: 245, y: 28 },
          { x: 232, y: 76 }, { x: 224, y: 215 }, { x: 41, y: 215 },
          { x: 33, y: 76 }, { x: 20, y: 28 },
        ],
      ),
      leftArm: makePart(
        source,
        { x: 74, y: 408, width: 96, height: 225 },
        { x: 132, y: 423 },
      ),
      rightArm: makePart(
        source,
        { x: 286, y: 408, width: 96, height: 225 },
        { x: 323, y: 423 },
      ),
      leftLeg: makePart(
        source,
        { x: 116, y: 603, width: 126, height: 191 },
        { x: 176, y: 614 },
        [{ x: 4, y: 0 }, { x: 118, y: 0 }, { x: 112, y: 191 }, { x: 1, y: 191 }],
      ),
      rightLeg: makePart(
        source,
        { x: 218, y: 603, width: 126, height: 191 },
        { x: 279, y: 614 },
        [{ x: 8, y: 0 }, { x: 122, y: 0 }, { x: 125, y: 191 }, { x: 14, y: 191 }],
      ),
    };
  }
  return {
    width: 420,
    height: 744,
    palette,
    head: makePart(source, { x: 0, y: 0, width: 420, height: 398 }, { x: 210, y: 390 }),
    torso: makePart(
      source,
      { x: 103, y: 386, width: 214, height: 186 },
      { x: 210, y: 398 },
      [
        { x: 34, y: 0 }, { x: 180, y: 0 }, { x: 198, y: 24 },
        { x: 177, y: 58 }, { x: 174, y: 186 }, { x: 40, y: 186 },
        { x: 37, y: 58 }, { x: 16, y: 24 },
      ],
    ),
    leftArm: makePart(
      source,
      { x: 69, y: 387, width: 92, height: 205 },
      { x: 124, y: 400 },
    ),
    rightArm: makePart(
      source,
      { x: 259, y: 387, width: 92, height: 205 },
      { x: 296, y: 400 },
    ),
    leftLeg: makePart(
      source,
      { x: 103, y: 532, width: 117, height: 212 },
      { x: 159, y: 544 },
      [{ x: 3, y: 0 }, { x: 111, y: 0 }, { x: 108, y: 212 }, { x: 0, y: 212 }],
    ),
    rightLeg: makePart(
      source,
      { x: 200, y: 532, width: 117, height: 212 },
      { x: 261, y: 544 },
      [{ x: 6, y: 0 }, { x: 114, y: 0 }, { x: 117, y: 212 }, { x: 9, y: 212 }],
    ),
  };
}

function getLayout(width: number, height: number): SceneLayout {
  const portrait = width / height < 0.78;
  const floorY = height * 0.85;
  const shelfWidth = width * (portrait ? 0.245 : 0.215);
  const shelfTop = height * (portrait ? 0.18 : 0.145);
  const shelfHeight = floorY - shelfTop + height * 0.025;
  const characterHeight = clamp(
    Math.min(height * (portrait ? 0.29 : 0.35), width * (portrait ? 0.38 : 0.205)),
    92,
    portrait ? 220 : 260,
  );
  const tableX = width * (portrait ? 0.61 : 0.62);
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
    boyX: width * (portrait ? 0.42 : 0.5),
    shadowX: width * (portrait ? 0.75 : 0.72),
    triggerX: width * (portrait ? 0.33 : 0.38),
  };
}

function drawPapelPicado(ctx: CanvasRenderingContext2D, layout: SceneLayout, time: number) {
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
      const flutter = Math.sin(time * 1.8 + index * 0.83 + row) * bannerH * 0.025;
      const top = y + curve + flutter;
      const bannerColor = colors[(index + row * 2) % colors.length];
      rect(ctx, x + bannerW * 0.06, top + bannerH * 0.06, bannerW, bannerH, "rgba(57,35,38,.16)");
      rect(ctx, x, top, bannerW, bannerH, bannerColor);
      rect(ctx, x + bannerW * 0.48, top, bannerW * 0.05, bannerH, "rgba(255,255,255,.12)");
      rect(ctx, x + bannerW * 0.2, top + bannerH * 0.25, bannerW * 0.16, bannerH * 0.16, "#efdfb9");
      rect(ctx, x + bannerW * 0.64, top + bannerH * 0.25, bannerW * 0.16, bannerH * 0.16, "#efdfb9");
      rect(ctx, x + bannerW * 0.42, top + bannerH * 0.58, bannerW * 0.16, bannerH * 0.18, "#efdfb9");
      rect(ctx, x + bannerW * 0.12, top + bannerH * 0.69, bannerW * 0.12, bannerH * 0.16, "#efdfb9");
      rect(ctx, x + bannerW * 0.76, top + bannerH * 0.69, bannerW * 0.12, bannerH * 0.16, "#efdfb9");
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
  rect(ctx, x + width * 0.04, y + height, width * 0.18, frame * 0.8, "#241511");
  rect(ctx, x + width * 0.78, y + height, width * 0.18, frame * 0.8, "#241511");
  rect(ctx, x - frame * 0.45, y - frame * 0.35, width + frame * 0.9, height + frame * 0.7, "#2a1712");
  rect(ctx, x, y, width, height, "#60371f");
  rect(ctx, x + frame * 0.45, y + frame * 0.45, width - frame * 0.9, frame * 0.32, "#a86939");
  rect(ctx, x + frame, y + frame, width - frame * 2, height - frame * 1.45, "#211718");
  rect(ctx, x + frame * 0.3, y - frame * 0.2, width - frame * 0.6, frame * 0.75, "#87502b");
  rect(ctx, x + frame * 0.8, y - frame * 0.04, width - frame * 1.6, frame * 0.16, "#b1703d");
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
      rect(ctx, cursor + Math.max(1, bookWidth * 0.14), shelfBottom - frame * 0.45 - bookHeight, Math.max(1, bookWidth * 0.12), bookHeight, "rgba(255,255,255,.12)");
      if ((book + shelf) % 3 === 0) {
        rect(ctx, cursor + bookWidth * 0.25, shelfBottom - bookHeight * 0.66, bookWidth * 0.5, Math.max(1, bookHeight * 0.035), "#e1b04c");
      }
      cursor += bookWidth + bookGap;
      book += 1;
    }
  }

  const labelWidth = width * 0.24;
  rect(ctx, x + width / 2 - labelWidth / 2 - 2, y + frame * 0.98, labelWidth + 4, frame * 0.58, "#291815");
  rect(ctx, x + width / 2 - labelWidth / 2, y + frame * 1.04, labelWidth, frame * 0.38, "#c08a3f");
}

function drawFrontRoom(ctx: CanvasRenderingContext2D, layout: SceneLayout, time: number) {
  const { width, height, floorY, shelfTop, shelfWidth, shelfHeight } = layout;
  rect(ctx, 0, 0, width, height, "#efdfb9");
  const ceilingGlow = ctx.createLinearGradient(0, 0, 0, floorY);
  ceilingGlow.addColorStop(0, "rgba(255,250,221,.42)");
  ceilingGlow.addColorStop(0.6, "rgba(255,250,221,0)");
  ceilingGlow.addColorStop(1, "rgba(91,55,39,.07)");
  ctx.fillStyle = ceilingGlow;
  ctx.fillRect(0, 0, width, floorY);
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
  drawPapelPicado(ctx, layout, time);
  drawBookcase(ctx, width * 0.025, shelfTop, shelfWidth, shelfHeight, 1);
  drawBookcase(ctx, width - width * 0.025 - shelfWidth, shelfTop, shelfWidth, shelfHeight, 4);

  const aisleLight = ctx.createRadialGradient(width * 0.53, floorY * 0.48, 0, width * 0.53, floorY * 0.48, width * 0.48);
  aisleLight.addColorStop(0, "rgba(255,244,199,.12)");
  aisleLight.addColorStop(1, "rgba(255,244,199,0)");
  ctx.fillStyle = aisleLight;
  ctx.fillRect(0, 0, width, floorY);
}

function drawTable(ctx: CanvasRenderingContext2D, layout: SceneLayout, shake: number) {
  const width = layout.characterHeight * 0.78;
  const height = layout.floorY - layout.tableTop;
  const shakeAmount = clamp(shake, 0, 1.5);
  const wobble = Math.sin(shake * 15) * layout.characterHeight * 0.012 * shakeAmount;
  const tilt = Math.sin(shake * 12.5) * 0.012 * shakeAmount;
  const topThickness = Math.max(5, layout.characterHeight * 0.055);

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#110b14";
  ctx.beginPath();
  ctx.ellipse(layout.tableX, layout.floorY + 2, width * 0.57, height * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(Math.round(layout.tableX + wobble), Math.round(layout.tableTop));
  ctx.rotate(tilt);

  rect(ctx, -width * 0.29, topThickness, width * 0.065, height * 0.86, "#4a2a1d");
  rect(ctx, width * 0.225, topThickness, width * 0.065, height * 0.86, "#4a2a1d");
  rect(ctx, -width * 0.38, topThickness, width * 0.082, height - topThickness, "#724126");

  ctx.fillStyle = "#5a3220";
  ctx.beginPath();
  ctx.moveTo(width * 0.3, topThickness);
  ctx.lineTo(width * 0.385, topThickness);
  ctx.lineTo(width * 0.45, height * 0.98);
  ctx.lineTo(width * 0.365, height * 0.98);
  ctx.closePath();
  ctx.fill();

  rect(ctx, -width / 2 - 3, -3, width + 6, topThickness + 6, "#2f1a13");
  rect(ctx, -width / 2, 0, width, topThickness, "#714124");
  rect(ctx, -width * 0.44, topThickness * 0.24, width * 0.76, Math.max(1, topThickness * 0.17), "#a26739");
  rect(ctx, -width * 0.16, topThickness * 0.64, width * 0.3, Math.max(1, topThickness * 0.12), "#45251a");
  ctx.restore();
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

function drawArmSegment(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  width: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "square";
  ctx.lineJoin = "miter";
  ctx.beginPath();
  ctx.moveTo(Math.round(fromX), Math.round(fromY));
  ctx.lineTo(Math.round(toX), Math.round(toY));
  ctx.stroke();
}

function drawJointedArm(
  ctx: CanvasRenderingContext2D,
  rig: CharacterRig,
  side: "left" | "right",
  angle: number,
  elbowBend: number,
  offsetX = 0,
  offsetY = 0,
) {
  const part = side === "left" ? rig.leftArm : rig.rightArm;
  const shoulderX = part.pivotX + offsetX;
  const shoulderY = part.pivotY + offsetY;
  const upperLength = part.height * 0.4;
  const forearmLength = part.height * 0.34;
  const wristLength = part.height * 0.075;
  const elbowX = shoulderX + Math.sin(angle) * upperLength;
  const elbowY = shoulderY + Math.cos(angle) * upperLength;
  const forearmAngle = angle + elbowBend;
  const wristX = elbowX + Math.sin(forearmAngle) * forearmLength;
  const wristY = elbowY + Math.cos(forearmAngle) * forearmLength;
  const handX = wristX + Math.sin(forearmAngle) * wristLength;
  const handY = wristY + Math.cos(forearmAngle) * wristLength;
  const upperWidth = part.width * 0.44;
  const forearmWidth = part.width * 0.35;
  const wristWidth = part.width * 0.22;
  const outline = Math.max(3, part.width * 0.095);
  const shoulderWidth = upperWidth * (rig.width > 440 ? 1.2 : 1.06);
  const shoulderHeight = upperWidth * (rig.width > 440 ? 0.86 : 0.78);

  rect(
    ctx,
    shoulderX - shoulderWidth * 0.58,
    shoulderY - shoulderHeight * 0.54,
    shoulderWidth * 1.16,
    shoulderHeight * 1.08,
    rig.palette.outline,
  );
  drawArmSegment(ctx, shoulderX, shoulderY, elbowX, elbowY, upperWidth + outline, rig.palette.outline);
  drawArmSegment(ctx, elbowX, elbowY, wristX, wristY, forearmWidth + outline, rig.palette.outline);
  drawArmSegment(ctx, wristX, wristY, handX, handY, wristWidth + outline * 0.7, rig.palette.outline);
  drawArmSegment(ctx, shoulderX, shoulderY, elbowX, elbowY, upperWidth, rig.palette.sleeve);
  drawArmSegment(ctx, elbowX, elbowY, wristX, wristY, forearmWidth, rig.palette.sleeve);
  drawArmSegment(ctx, wristX, wristY, handX, handY, wristWidth, rig.palette.skin);
  rect(
    ctx,
    shoulderX - shoulderWidth * 0.43,
    shoulderY - shoulderHeight * 0.39,
    shoulderWidth * 0.86,
    shoulderHeight * 0.78,
    rig.palette.sleeve,
  );

  const handSize = part.width * 0.29;
  ctx.fillStyle = rig.palette.outline;
  ctx.fillRect(
    Math.round(handX - handSize * 0.58),
    Math.round(handY - handSize * 0.58),
    Math.round(handSize * 1.16),
    Math.round(handSize * 1.16),
  );
  ctx.fillStyle = rig.palette.skin;
  ctx.fillRect(
    Math.round(handX - handSize * 0.42),
    Math.round(handY - handSize * 0.42),
    Math.round(handSize * 0.84),
    Math.round(handSize * 0.84),
  );
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
  const leftElbow = motion.leftElbow ?? -0.08;
  const rightElbow = motion.rightElbow ?? 0.08;

  ctx.save();
  applyRigTransform(ctx, rig, centerX, footY, height, motion);
  drawPart(ctx, rig.leftLeg, leftLegAngle, motion.leftLegX, motion.leftLegY);
  drawPart(ctx, rig.rightLeg, rightLegAngle, motion.rightLegX, motion.rightLegY);
  if (!motion.hideArms && !motion.armsOnTop) {
    drawJointedArm(ctx, rig, "left", leftArmAngle, leftElbow, motion.leftArmX, motion.leftArmY);
    drawJointedArm(ctx, rig, "right", rightArmAngle, rightElbow, motion.rightArmX, motion.rightArmY);
  }
  ctx.drawImage(rig.torso.image, rig.torso.x, rig.torso.y, rig.torso.width, rig.torso.height);
  drawPart(ctx, rig.head, motion.headTilt ?? 0, motion.headX, motion.headBob);
  if (!motion.hideArms && motion.armsOnTop) {
    drawJointedArm(ctx, rig, "left", leftArmAngle, leftElbow, motion.leftArmX, motion.leftArmY);
    drawJointedArm(ctx, rig, "right", rightArmAngle, rightElbow, motion.rightArmX, motion.rightArmY);
  }
  ctx.restore();
}

function walkMotion(time: number, strength = 1): RigMotion {
  const phase = time * Math.PI * 2;
  const step = Math.sin(phase);
  const contact = Math.abs(Math.sin(phase));
  const leftLift = Math.max(0, -Math.cos(phase)) * 6.5 * strength;
  const rightLift = Math.max(0, Math.cos(phase)) * 6.5 * strength;
  return {
    bob: contact * 2.15 * strength,
    bodyX: step * 0.8 * strength,
    bodyRotation: -step * 0.011 * strength,
    headBob: contact * 1.25 * strength,
    headTilt: step * 0.013 * strength,
    scaleX: 1 + contact * 0.004 * strength,
    scaleY: 1 - contact * 0.008 * strength,
    leftLegAngle: step * 0.085 * strength,
    rightLegAngle: -step * 0.085 * strength,
    leftLegX: -Math.max(0, -Math.cos(phase)) * 2.4 * strength,
    rightLegX: Math.max(0, Math.cos(phase)) * 2.4 * strength,
    leftLegY: -leftLift,
    rightLegY: -rightLift,
    leftArmAngle: -step * 0.1 * strength,
    rightArmAngle: step * 0.1 * strength,
    leftElbow: -0.075 - contact * 0.025,
    rightElbow: 0.075 + contact * 0.025,
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
  const warmth = ctx.createRadialGradient(
    layout.tableX,
    layout.floorY - layout.characterHeight * 0.72,
    0,
    layout.tableX,
    layout.floorY - layout.characterHeight * 0.72,
    layout.characterHeight * 2.4,
  );
  warmth.addColorStop(0, `rgba(255, 209, 119, ${0.085 * amount})`);
  warmth.addColorStop(0.45, `rgba(255, 222, 153, ${0.025 * amount})`);
  warmth.addColorStop(1, "rgba(255, 222, 153, 0)");
  ctx.fillStyle = warmth;
  ctx.fillRect(0, 0, layout.width, layout.height);

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

function drawAtmosphere(
  ctx: CanvasRenderingContext2D,
  layout: SceneLayout,
  time: number,
  intensity = 1,
) {
  const count = layout.width / layout.height < 0.78 ? 10 : 18;
  ctx.save();
  for (let index = 0; index < count; index += 1) {
    const seed = (index * 47) % 101;
    const travel = (time * (0.018 + (index % 4) * 0.004) + seed / 101) % 1;
    const xBase = layout.width * (0.16 + ((index * 37) % 73) / 107);
    const x = xBase + Math.sin(time * 0.55 + index * 1.7) * layout.characterHeight * 0.08;
    const y = lerp(layout.floorY * 0.92, layout.height * 0.2, travel);
    const size = Math.max(1, layout.characterHeight * (0.006 + (index % 3) * 0.002));
    ctx.globalAlpha = (0.08 + (index % 4) * 0.025) * intensity * Math.sin(travel * Math.PI);
    rect(ctx, x, y, size, size, index % 3 === 0 ? "#fff2bd" : "#f2c76f");
  }
  ctx.restore();
}

function drawInstabilityMarks(
  ctx: CanvasRenderingContext2D,
  layout: SceneLayout,
  amount: number,
  time: number,
) {
  const p = clamp(amount, 0, 1);
  if (p <= 0) return;
  const size = layout.characterHeight;
  ctx.save();
  ctx.globalAlpha = 0.3 + p * 0.5;
  ctx.strokeStyle = "#7b3f2e";
  ctx.lineWidth = Math.max(2, size * 0.014);
  ctx.lineCap = "square";
  const pulse = Math.sin(time * 15) * size * 0.018;
  for (const side of [-1, 1]) {
    const x = layout.tableX + side * (size * 0.48 + pulse);
    const y = layout.tableTop + size * 0.22;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * size * 0.07, y - size * 0.045);
    ctx.moveTo(x + side * size * 0.012, y + size * 0.055);
    ctx.lineTo(x + side * size * 0.09, y + size * 0.08);
    ctx.stroke();
  }
  ctx.restore();
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
  const y = layout.floorY - layout.characterHeight * BOY_SCALE * 1.14 + Math.sin(time * 4) * 3;
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
  const transfer = ease(clamp((p - 0.16) / 0.5, 0, 1));
  const stand = ease(clamp((p - 0.5) / 0.45, 0, 1));
  const settle = Math.sin(clamp((p - 0.72) / 0.28, 0, 1) * Math.PI);
  const boyHeight = layout.characterHeight * BOY_SCALE;
  const girlHeight = lerp(layout.characterHeight * 0.92, layout.characterHeight * 0.8, transfer);
  const boyX = layout.tableX - boyHeight * 0.12;
  const boyCrouch = crouchIn * (1 - stand);
  const girlX = lerp(layout.tableX, boyX + boyHeight * 0.255, transfer);
  const girlFoot = lerp(
    layout.tableTop,
    layout.floorY - boyHeight * 0.4,
    transfer,
  ) - Math.sin(transfer * Math.PI) * boyHeight * 0.06 - settle * boyHeight * 0.012;
  const girlMotion: RigMotion = {
    bodyRotation: lerp(-0.03, 0.025, transfer),
    bob: Math.sin(transfer * Math.PI) * boyHeight * 0.035,
    scaleY: lerp(1, 0.96, transfer),
    leftArmAngle: lerp(-1.12, -0.48, transfer),
    rightArmAngle: lerp(1.12, -0.34, transfer),
    leftElbow: lerp(-0.3, -0.16, transfer),
    rightElbow: lerp(0.3, -0.12, transfer),
    leftArmY: transfer * 9,
    rightArmY: transfer * 9,
    leftLegAngle: lerp(0.02, 0.5, transfer),
    rightLegAngle: lerp(-0.02, -0.5, transfer),
    leftLegY: -transfer * 38,
    rightLegY: -transfer * 38,
    headTilt: -0.02 * transfer,
  };
  const boyMotion: RigMotion = {
    bodyY: boyCrouch * boyHeight * 0.08 + settle * boyHeight * 0.012,
    scaleY: 1 - boyCrouch * 0.11,
    scaleX: 1 + boyCrouch * 0.055,
    bodyRotation: lerp(0, 0.018, transfer),
    leftLegAngle: boyCrouch * 0.11,
    rightLegAngle: -boyCrouch * 0.11,
    leftArmAngle: lerp(0, -0.22, transfer),
    rightArmAngle: lerp(0, 0.38, transfer),
    leftElbow: lerp(-0.08, -0.12, transfer),
    rightElbow: lerp(0.08, 0.16, transfer),
    headBob: boyCrouch * 3,
  };

  drawGroundShadow(ctx, boyX, layout.floorY + 2, boyHeight, 0.31);
  drawRig(ctx, rigs.girl, girlX, girlFoot, girlHeight, girlMotion);
  drawRig(ctx, rigs.boy, boyX, layout.floorY, boyHeight, boyMotion);

  if (transfer > 0.42) {
    const grip = ease((transfer - 0.42) / 0.4);
    const handSize = Math.max(5, boyHeight * 0.032);
    const handY = layout.floorY - boyHeight * 0.57;
    ctx.save();
    ctx.globalAlpha = grip;
    for (const handX of [boyX - boyHeight * 0.17, boyX + boyHeight * 0.2]) {
      rect(ctx, handX - handSize * 0.62, handY - handSize * 0.62, handSize * 1.24, handSize * 1.24, rigs.girl.palette.outline);
      rect(ctx, handX - handSize * 0.42, handY - handSize * 0.42, handSize * 0.84, handSize * 0.84, rigs.girl.palette.skin);
    }
    ctx.restore();
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
  const sceneTime = model.phase === "cinematic" ? model.cutsceneTime : model.walkFrame;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;
  drawFrontRoom(ctx, layout, sceneTime);
  drawAtmosphere(ctx, layout, sceneTime, model.phase === "cinematic" ? 1 : 0.65);

  if (model.phase === "intro" || model.phase === "walk") {
    drawTable(ctx, layout, 0);
    if (rigs) {
      const boyHeight = layout.characterHeight * BOY_SCALE;
      drawGroundShadow(ctx, layout.boyX, layout.floorY + 2, boyHeight);
      drawGroundShadow(ctx, layout.shadowX, layout.floorY + 2, layout.characterHeight * 0.98);
      drawGroundShadow(ctx, width * model.playerX, layout.floorY + 2, layout.characterHeight);
      drawRig(ctx, rigs.boy, layout.boyX, layout.floorY, boyHeight, idleMotion(model.walkFrame, 0.8));
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
  const boyHeight = h * BOY_SCALE;
  let girlX = width * 0.38;
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
      leftArmAngle: -2.46 - reachPulse,
      rightArmAngle: 2.62 + reachPulse * 0.7,
      leftElbow: -0.18,
      rightElbow: 0.14,
      headTilt: 0.018,
    };
    shadowMotion = {
      ...idleMotion(t * 0.7 + 0.25, 0.65),
      bodyRotation: 0.018,
      armsOnTop: true,
      leftArmAngle: -2.62 + reachPulse * 0.7,
      rightArmAngle: 2.46 - reachPulse,
      leftElbow: -0.14,
      rightElbow: 0.18,
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
    const release = ease(clamp(p / 0.58, 0, 1));
    girlX = lerp(width * 0.38, layout.tableX - h * 0.14, p);
    girlMotion = walkMotion((t - 4.5) * 1.55, 0.95);
    boyMotion = {
      ...idleMotion(t * 0.45, 0.7),
      armsOnTop: release < 0.72,
      leftArmAngle: lerp(-2.46, 0, release),
      rightArmAngle: lerp(2.62, 0, release),
      leftElbow: lerp(-0.18, -0.08, release),
      rightElbow: lerp(0.14, 0.08, release),
      headTilt: 0.015,
    };
    shadowMotion = {
      ...idleMotion(t * 0.45 + 0.3, 0.7),
      armsOnTop: release < 0.72,
      leftArmAngle: lerp(-2.62, 0, release),
      rightArmAngle: lerp(2.46, 0, release),
      leftElbow: lerp(-0.14, -0.08, release),
      rightElbow: lerp(0.18, 0.08, release),
      headTilt: -0.015,
    };
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
      rightArmAngle: 1.2 + p * 1.12,
      leftArmAngle: -0.9 - p * 0.34,
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
      leftArmAngle: lerp(-1.24, -0.2, p),
      rightArmAngle: lerp(2.32, 0.25, p),
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
      leftArmAngle: lerp(-0.18, -2.68, clamp(p / 0.58, 0, 1)),
      rightArmAngle: lerp(0.18, 2.68, clamp((p - 0.12) / 0.72, 0, 1)),
      leftElbow: lerp(-0.08, -0.16, p),
      rightElbow: lerp(0.08, 0.16, p),
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
      leftArmAngle: lerp(-2.68, -1.12, p),
      rightArmAngle: lerp(2.68, 1.12, p),
      leftElbow: lerp(-0.16, -0.28, p),
      rightElbow: lerp(0.16, 0.28, p),
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
      leftArmAngle: -1.12 - Math.sin(t * 6) * 0.07,
      rightArmAngle: 1.12 + Math.sin(t * 6) * 0.07,
      leftElbow: -0.3,
      rightElbow: 0.3,
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
  drawInstabilityMarks(ctx, layout, tableShake / 1.4, t);

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
      leftArmAngle: lerp(-0.22, 0, p),
      rightArmAngle: lerp(0.38, 0, p),
      leftElbow: lerp(-0.12, -0.08, p),
      rightElbow: lerp(0.16, 0.08, p),
      headTilt: 0.02 * (1 - p),
    };
    girlX = lerp(layout.tableX + h * 0.135, layout.tableX + h * 0.32, p);
    girlFoot = lerp(layout.floorY - h * 0.4, layout.floorY, p);
    girlHeight = lerp(h * 0.8, h, p);
    girlMotion = {
      bodyRotation: lerp(0.025, 0, p),
      leftArmAngle: lerp(-0.48, 0, p),
      rightArmAngle: lerp(-0.34, 0, p),
      leftElbow: lerp(-0.16, -0.08, p),
      rightElbow: lerp(-0.12, 0.08, p),
      leftArmY: lerp(9, 0, p),
      rightArmY: lerp(9, 0, p),
      leftLegAngle: lerp(0.5, 0, p),
      rightLegAngle: lerp(-0.5, 0, p),
      leftLegY: lerp(-38, 0, p),
      rightLegY: lerp(-38, 0, p),
      bob: Math.sin(p * Math.PI) * 2,
      headTilt: lerp(-0.02, 0.015, p),
    };
  }

  if (t >= 27.8 && t < 30.2) {
    boyX = layout.tableX - h * 0.26;
    girlX = layout.tableX + h * 0.3;
    girlFoot = layout.floorY;
    girlHeight = h;
    boyMotion = { ...idleMotion(t * 0.6, 0.65), headTilt: 0.025, bodyRotation: 0.008 };
    girlMotion = { ...idleMotion(t * 0.6 + 0.25, 0.65), headTilt: -0.025, bodyRotation: -0.008 };
    const pulse = 0.75 + Math.sin((t - 27.8) * Math.PI * 2) * 0.25;
    drawSparkle(ctx, layout.tableX + h * 0.02, layout.floorY - h * 0.82, h * 0.1 * pulse);
  }

  if (t >= 30.2) {
    const p = ease((t - 30.2) / 3.1);
    girlX = lerp(layout.tableX + h * 0.3, width * 0.28, p);
    girlFoot = layout.floorY;
    boyX = lerp(layout.tableX - h * 0.26, width * 0.72, p);
    girlMotion = walkMotion((t - 30.2) * 1.65, 1.05);
    boyMotion = walkMotion((t - 30.2) * 1.55 + 0.3, 1.05);
  }

  if (rigs) {
    if (shadowVisible) {
      drawGroundShadow(ctx, shadowX, layout.floorY + 2, h * 0.98, 0.27);
      drawRig(ctx, rigs.shadow, shadowX, layout.floorY, h * 0.98, shadowMotion);
    }
    if (boyVisible) {
      drawGroundShadow(ctx, boyX, layout.floorY + 2, boyHeight, 0.27);
      drawRig(ctx, rigs.boy, boyX, layout.floorY, boyHeight, boyMotion);
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
    playerX: 0.28,
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
    modelRef.current = { ...initialModel(), phase: "walk" };
    keysRef.current.left = false;
    keysRef.current.right = false;
    setPhase("walk");
    playMusicFromCue(false);
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
    if (phase !== "intro") return;
    const revealDuration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1200 : 2900;
    const revealTimer = window.setTimeout(startGame, revealDuration);
    return () => window.clearTimeout(revealTimer);
  }, [phase, startGame]);

  useEffect(() => {
    const boyImage = new Image();
    const girlImage = new Image();
    let loaded = 0;
    let cancelled = false;
    const prepareRigs = () => {
      loaded += 1;
      if (loaded !== 2 || cancelled) return;
      const boyCanvas = createCutout(boyImage, {
        x: 0,
        y: 0,
        width: boyImage.naturalWidth,
        height: boyImage.naturalHeight,
      });
      const girlCanvas = createCutout(girlImage, {
        x: 0,
        y: 0,
        width: girlImage.naturalWidth,
        height: girlImage.naturalHeight,
      });
      rigsRef.current = {
        boy: createRig(boyCanvas, "boy"),
        girl: createRig(girlCanvas, "girl"),
        shadow: createRig(tintCanvas(boyCanvas), "shadow"),
      };
    };

    boyImage.onload = prepareRigs;
    girlImage.onload = prepareRigs;
    boyImage.src = "game-assets/boy-clean-v2.png";
    girlImage.src = "game-assets/girl-clean-v2.png";

    return () => {
      cancelled = true;
      boyImage.onload = null;
      girlImage.onload = null;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const cssWidth = Math.max(1, bounds.width);
      const cssHeight = Math.max(1, bounds.height);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const renderScale = Math.min(pixelRatio, 2560 / cssWidth, 1440 / cssHeight);
      canvas.width = Math.max(320, Math.round(cssWidth * renderScale));
      canvas.height = Math.max(320, Math.round(cssHeight * renderScale));
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
          if (!audio || !musicEnabledRef.current) return;
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

      {phase === "walk" && (
        <div className="scene-status" aria-hidden="true">
          <span className="status-light" />
          ACÉRCATE A ELLOS
        </div>
      )}

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
        <button
          type="button"
          className="start-reveal"
          aria-label="Comenzar ahora"
          onClick={startGame}
        />
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
