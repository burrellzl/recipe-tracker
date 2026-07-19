(function () {
  'use strict';

  const FRACTIONS = [
    [0.125, '⅛'], [0.167, '⅙'], [0.25, '¼'], [0.333, '⅓'],
    [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [0.667, '⅔'],
    [0.75, '¾'], [0.833, '⅚'], [0.875, '⅞']
  ];

  function escapeHTML(value = '') {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatQuantity(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return '';
    if (amount === 0) return '0';

    const whole = Math.floor(amount + 0.001);
    const decimal = amount - whole;
    const fraction = FRACTIONS.find(([number]) => Math.abs(decimal - number) <= 0.025);
    if (fraction) return `${whole || ''}${whole ? ' ' : ''}${fraction[1]}`;
    if (Math.abs(decimal) <= 0.025) return String(whole);
    return amount.toFixed(amount < 10 ? 2 : 1).replace(/\.0+$|0+$/g, '').replace(/\.$/, '');
  }

  function formatCurrency(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number);
  }

  function formatMinutes(value) {
    const minutes = Number(value) || 0;
    if (!minutes) return '0 min';
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return [hours ? `${hours} hr` : '', remainder ? `${remainder} min` : ''].filter(Boolean).join(' ');
  }

  function formatTimer(seconds) {
    const safe = Math.max(0, Math.ceil(Number(seconds) || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const remainder = safe % 60;
    if (hours) return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }

  function debounce(callback, delay = 200) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => callback(...args), delay);
    };
  }

  function makeId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function readCookingProgress(recipeId) {
    try {
      return JSON.parse(localStorage.getItem(`recipe-progress-${recipeId}`)) || { ingredients: [], directions: [] };
    } catch {
      return { ingredients: [], directions: [] };
    }
  }

  function writeCookingProgress(recipeId, progress) {
    localStorage.setItem(`recipe-progress-${recipeId}`, JSON.stringify(progress));
  }

  function compressImage(file, maxDimension = 1600, quality = 0.82) {
    return new Promise((resolve, reject) => {
      if (!file?.type?.startsWith('image/')) {
        reject(new Error('Please choose an image file.'));
        return;
      }
      const image = new Image();
      const url = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('The image could not be prepared for upload.')),
          'image/jpeg',
          quality
        );
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('The selected image could not be opened.'));
      };
      image.src = url;
    });
  }

  function downloadJSON(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.RecipeUtils = Object.freeze({
    escapeHTML,
    formatQuantity,
    formatCurrency,
    formatMinutes,
    formatTimer,
    debounce,
    makeId,
    readCookingProgress,
    writeCookingProgress,
    compressImage,
    downloadJSON
  });
})();
