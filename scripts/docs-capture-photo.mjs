/**
 * Renders the synthetic inspection photo used by the embedded-image screenshot.
 *
 * It is drawn in the page so the screenshot needs no binary fixture and no file
 * chooser: the capture imports the returned data URL as a PNG.
 */
export function inspectionPhotoDataUrl(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 300;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const gradient = context.createLinearGradient(0, 0, 480, 300);
    gradient.addColorStop(0, "#273238");
    gradient.addColorStop(1, "#101719");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 480, 300);
    context.strokeStyle = "rgba(79, 224, 191, 0.18)";
    context.lineWidth = 1;
    for (let x = 0; x <= 480; x += 24) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, 300);
      context.stroke();
    }
    for (let y = 0; y <= 300; y += 24) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(480, y);
      context.stroke();
    }
    context.fillStyle = "#33434a";
    context.fillRect(34, 54, 412, 198);
    context.fillStyle = "#223034";
    context.fillRect(54, 82, 176, 150);
    context.fillStyle = "#b9c9ce";
    context.fillRect(72, 102, 140, 110);
    context.strokeStyle = "#65767c";
    context.lineWidth = 4;
    context.strokeRect(72, 102, 140, 110);
    context.beginPath();
    context.moveTo(142, 102);
    context.lineTo(142, 212);
    context.stroke();
    context.fillStyle = "#4a5a60";
    context.fillRect(258, 128, 164, 104);
    context.fillStyle = "#d9e4e7";
    context.font = "600 18px system-ui, sans-serif";
    context.fillText("Loading dock", 54, 42);
    context.font = "500 13px system-ui, sans-serif";
    context.fillStyle = "#9fb0b5";
    context.fillText("Inspection photo · Northgate", 54, 276);
    context.fillStyle = "#f26d6d";
    context.fillRect(330, 42, 116, 26);
    context.fillStyle = "#1a1111";
    context.font = "700 13px system-ui, sans-serif";
    context.fillText("CHECK", 372, 60);
    return canvas.toDataURL("image/png");
  });
}
