import { defaultLook, sanitizeLook, type Look } from './look';

export function loadLook(): Look {
  try {
    return sanitizeLook(JSON.parse(localStorage.getItem('suseak-look') ?? ''));
  } catch {
    return defaultLook;
  }
}

export function applyLook(look: Look): void {
  const root = document.documentElement;
  root.dataset.night = look.night ? '1' : '0';
  root.style.setProperty('--blue', look.accent);
  root.style.setProperty('--radius', `${look.radius}px`);
  root.style.fontSize = `${look.type}px`;
  root.style.colorScheme = look.night ? 'dark' : 'light';
}

export function saveLook(look: Look): Look {
  const clean = sanitizeLook(look);
  localStorage.setItem('suseak-look', JSON.stringify(clean));
  applyLook(clean);
  window.dispatchEvent(new Event('suseak-look'));
  return clean;
}
