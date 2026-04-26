import * as THREE from "https://esm.sh/three@0.164.1";

export function latLonToVector3(lat, lon, radius) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon + 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

export function makeGlobeTexture() {
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = 2048;
  textureCanvas.height = 1024;
  const ctx = textureCanvas.getContext("2d");

  const ocean = ctx.createLinearGradient(0, 0, 0, textureCanvas.height);
  ocean.addColorStop(0, "#10283b");
  ocean.addColorStop(0.5, "#173a4c");
  ocean.addColorStop(1, "#0b1c2c");
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  ctx.strokeStyle = "rgba(220, 245, 255, 0.12)";
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * textureCanvas.width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, textureCanvas.height);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * textureCanvas.height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(textureCanvas.width, y);
    ctx.stroke();
  }

  drawLand(ctx, [[-11, 35], [20, 34], [34, 45], [32, 62], [18, 70], [-6, 58]]);
  drawLand(ctx, [[34, 35], [72, 28], [124, 48], [147, 62], [110, 74], [52, 67]]);
  drawLand(ctx, [[-168, 15], [-128, 24], [-80, 44], [-52, 58], [-96, 72], [-155, 60]]);
  drawLand(ctx, [[-84, -55], [-48, -35], [-34, -8], [-70, 11], [-82, -16], [-76, -38]]);
  drawLand(ctx, [[-18, -35], [17, -35], [36, -5], [30, 24], [6, 35], [-12, 10]]);
  drawLand(ctx, [[112, -44], [154, -36], [146, -12], [116, -16]]);

  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.fillRect(0, 0, textureCanvas.width, 46);
  ctx.fillRect(0, textureCanvas.height - 54, textureCanvas.width, 54);

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawLand(ctx, coords) {
  ctx.beginPath();
  coords.forEach(([lon, lat], index) => {
    const x = ((lon + 180) / 360) * 2048;
    const y = ((90 - lat) / 180) * 1024;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "#58735d";
  ctx.fill();
  ctx.strokeStyle = "rgba(230, 248, 235, 0.22)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

