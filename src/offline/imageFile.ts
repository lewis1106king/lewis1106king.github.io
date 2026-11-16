import { dataUrlPayloadBytes, isFieldImage, isSupportedMapType, type FieldImage } from './model';

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다. 다른 파일을 선택해 주세요.'));
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('이미지 파일을 읽지 못했습니다.'));
    };
    reader.readAsDataURL(file);
  });
}

async function sniffMime(file: File): Promise<FieldImage['mime'] | null> {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'image/webp';
  return null;
}

function declaredMime(type: string): FieldImage['mime'] | null {
  if (type === 'image/jpg' || type === 'image/pjpeg') return 'image/jpeg';
  return isSupportedMapType(type) ? type : null;
}

export function readImageAspectRatio(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const aspectRatio = image.naturalWidth / image.naturalHeight;
      if (!image.naturalWidth || !image.naturalHeight || !Number.isFinite(aspectRatio)) {
        reject(new Error('이미지의 가로·세로 크기를 확인하지 못했습니다.'));
        return;
      }
      resolve(aspectRatio);
    };
    image.onerror = () => reject(new Error('이미지 형식을 확인하지 못했습니다. 다른 파일을 선택해 보세요.'));
    image.src = dataUrl;
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('이미지 형식을 확인하지 못했습니다. 다른 파일을 선택해 보세요.'));
    image.src = url;
  });
}

function imageFromDataUrl(name: string, mime: FieldImage['mime'], dataUrl: string, maxBytes: number): FieldImage | null {
  const bytes = dataUrlPayloadBytes(dataUrl, mime);
  if (bytes === null) return null;
  const image: FieldImage = { name, mime, dataUrl, bytes };
  return isFieldImage(image, maxBytes) ? image : null;
}

/** 용량을 넘으면 긴 변 1600px JPEG로 줄여, 휴대폰 사진도 백업에 들어갈 수 있게 한다. */
export async function prepareImageFile(file: File, maxBytes: number): Promise<FieldImage> {
  const mime = declaredMime(file.type) ?? await sniffMime(file);
  if (!mime) throw new Error('PNG, JPEG, WebP 이미지만 첨부할 수 있습니다.');

  const original = await readAsDataUrl(file);
  const comma = original.indexOf(',');
  const payload = comma >= 0 ? original.slice(comma + 1) : '';
  const rebuilt = `data:${mime};base64,${payload}`;
  const name = file.name.trim() || '이미지';
  const direct = imageFromDataUrl(name, mime, rebuilt, maxBytes);
  if (direct && file.size <= maxBytes) return direct;

  const image = await loadImage(original);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('이미지를 줄이지 못했습니다.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.86;
  let compressed = canvas.toDataURL('image/jpeg', quality);
  let prepared = imageFromDataUrl(name.replace(/\.[^.]+$/, '') + '.jpg', 'image/jpeg', compressed, maxBytes);
  while ((!prepared || prepared.bytes > maxBytes) && quality > 0.46) {
    quality = Number((quality - 0.08).toFixed(2));
    compressed = canvas.toDataURL('image/jpeg', quality);
    prepared = imageFromDataUrl(name.replace(/\.[^.]+$/, '') + '.jpg', 'image/jpeg', compressed, maxBytes);
  }
  if (!prepared) {
    const limit = Math.max(1, Math.round(maxBytes / (1024 * 1024)));
    throw new Error(`이미지가 ${limit}MB 제한 안으로 줄어들지 않습니다. 더 작은 파일을 선택해 주세요.`);
  }
  return prepared;
}
