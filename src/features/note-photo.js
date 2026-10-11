import { MAX_NOTE_IMAGE_BYTES } from "../../shared/limits.js";
export const defaultPhotoOptions = () => ({
  rotation: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
});
export async function prepareNotePhoto(file, options = defaultPhotoOptions()) {
  if (!file || file.size > 20_000_000)
    throw new Error(
      "Choose a photo up to 20 MB. Export very large photos as JPEG first.",
    );
  if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))
    throw new Error(
      "Choose a JPEG, PNG or WebP photo. HEIC works only if your browser can open it.",
    );
  const url = URL.createObjectURL(file),
    image = new Image();
  try {
    image.src = url;
    await image.decode().catch(() => {
      throw new Error(
        "This browser cannot open that photo. Export it as JPEG or PNG and try again.",
      );
    });
    const w = image.naturalWidth,
      h = image.naturalHeight;
    if (!w || !h || w * h > 48_000_000)
      throw new Error("Choose a smaller image (48 megapixels or less).");
    const crop = {};
    for (const key of ["top", "right", "bottom", "left"]) {
      crop[key] = Number(options[key] || 0);
      if (!Number.isFinite(crop[key]) || crop[key] < 0 || crop[key] > 40)
        throw new Error("Crop edges must be between 0% and 40%.");
    }
    const angle = ((Number(options.rotation) % 360) + 360) % 360;
    if (![0, 90, 180, 270].includes(angle))
      throw new Error("Rotate in quarter turns.");
    const sx = (w * crop.left) / 100,
      sy = (h * crop.top) / 100,
      sw = w * (1 - (crop.left + crop.right) / 100),
      sh = h * (1 - (crop.top + crop.bottom) / 100);
    const rotated = angle === 90 || angle === 270,
      rw = rotated ? sh : sw,
      rh = rotated ? sw : sh;
    for (const longest of [2400, 2000, 1600]) {
      const scale = Math.min(1, longest / Math.max(rw, rh)),
        canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(rw * scale));
      canvas.height = Math.max(1, Math.round(rh * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx)
        throw new Error("Photo processing is unavailable in this browser.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((angle * Math.PI) / 180);
      ctx.drawImage(
        image,
        sx,
        sy,
        sw,
        sh,
        (-sw * scale) / 2,
        (-sh * scale) / 2,
        sw * scale,
        sh * scale,
      );
      for (const quality of [0.9, 0.8, 0.7]) {
        const blob = await new Promise((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", quality),
        );
        if (!blob)
          throw new Error(
            "The photo could not be compressed. Choose another photo.",
          );
        if (blob.size <= MAX_NOTE_IMAGE_BYTES) {
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () =>
              reject(new Error("Could not read the compressed photo."));
            reader.readAsDataURL(blob);
          });
          return {
            blob,
            data: dataUrl.split(",")[1],
            name: file.name.slice(0, 160),
            mimeType: "image/jpeg",
            originalBytes: file.size,
            bytes: blob.size,
            width: canvas.width,
            height: canvas.height,
            options: JSON.stringify(options),
          };
        }
      }
    }
    throw new Error(
      "This photo needs more compression than is safe for handwriting. Crop closer or photograph half the page at a time.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
