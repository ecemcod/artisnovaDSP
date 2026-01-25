/**
 * Color extraction utilities for dynamic background colors
 */

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface HSL {
  h: number;
  s: number;
  l: number;
}

/**
 * Extract dominant color from an image URL
 */
export async function extractDominantColor(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve(null);
          return;
        }
        
        // Resize image for faster processing
        const size = 100;
        canvas.width = size;
        canvas.height = size;
        
        ctx.drawImage(img, 0, 0, size, size);
        const imageData = ctx.getImageData(0, 0, size, size);
        
        const dominantColor = getDominantColor(imageData.data);
        const adjustedColor = adjustColorForBackground(dominantColor);
        
        resolve(`rgb(${adjustedColor.r}, ${adjustedColor.g}, ${adjustedColor.b})`);
      } catch (error) {
        console.error('Error extracting color:', error);
        resolve(null);
      }
    };
    
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Get dominant color from image data using color quantization
 */
function getDominantColor(data: Uint8ClampedArray): RGB {
  const colorMap = new Map<string, number>();
  
  // Sample every 4th pixel for performance
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = data[i + 3];
    
    // Skip transparent pixels
    if (alpha < 128) continue;
    
    // Quantize colors to reduce noise
    const qr = Math.round(r / 32) * 32;
    const qg = Math.round(g / 32) * 32;
    const qb = Math.round(b / 32) * 32;
    
    const key = `${qr},${qg},${qb}`;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }
  
  // Find most frequent color
  let maxCount = 0;
  let dominantColor = { r: 64, g: 64, b: 64 }; // Default dark color
  
  for (const [colorKey, count] of colorMap.entries()) {
    if (count > maxCount) {
      maxCount = count;
      const [r, g, b] = colorKey.split(',').map(Number);
      dominantColor = { r, g, b };
    }
  }
  
  return dominantColor;
}

/**
 * Adjust color for background use - ensure it's dark enough for good contrast
 */
function adjustColorForBackground(color: RGB): RGB {
  const hsl = rgbToHsl(color);
  
  // Maximum lightness threshold (30% to ensure dark backgrounds)
  const maxLightness = 0.3;
  
  // If color is too light, reduce lightness while preserving hue and saturation
  if (hsl.l > maxLightness) {
    hsl.l = maxLightness;
  }
  
  // Ensure minimum saturation for visual interest
  if (hsl.s < 0.2) {
    hsl.s = 0.2;
  }
  
  return hslToRgb(hsl);
}

/**
 * Convert RGB to HSL
 */
function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (diff !== 0) {
    s = l > 0.5 ? diff / (2 - max - min) : diff / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / diff + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / diff + 2) / 6;
        break;
      case b:
        h = ((r - g) / diff + 4) / 6;
        break;
    }
  }
  
  return { h, s, l };
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(hsl: HSL): RGB {
  const { h, s, l } = hsl;
  
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  const m = l - c / 2;
  
  let r = 0, g = 0, b = 0;
  
  if (h >= 0 && h < 1/6) {
    r = c; g = x; b = 0;
  } else if (h >= 1/6 && h < 2/6) {
    r = x; g = c; b = 0;
  } else if (h >= 2/6 && h < 3/6) {
    r = 0; g = c; b = x;
  } else if (h >= 3/6 && h < 4/6) {
    r = 0; g = x; b = c;
  } else if (h >= 4/6 && h < 5/6) {
    r = x; g = 0; b = c;
  } else if (h >= 5/6 && h < 1) {
    r = c; g = 0; b = x;
  }
  
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

/**
 * Generate CSS custom properties for dynamic background
 */
export function generateDynamicBackgroundCSS(dominantColor: string): string {
  return `
    --bg-deep: ${dominantColor};
    --bg-panel: ${lightenColor(dominantColor, 0.1)};
    --bg-card: ${lightenColor(dominantColor, 0.15)};
    --border-subtle: ${lightenColor(dominantColor, 0.2)};
    --border-medium: ${lightenColor(dominantColor, 0.3)};
  `;
}

/**
 * Lighten a color by a percentage
 */
function lightenColor(color: string, amount: number): string {
  // Parse RGB color
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!match) return color;
  
  const r = parseInt(match[1]);
  const g = parseInt(match[2]);
  const b = parseInt(match[3]);
  
  // Convert to HSL, increase lightness, convert back
  const hsl = rgbToHsl({ r, g, b });
  hsl.l = Math.min(1, hsl.l + amount);
  
  const rgb = hslToRgb(hsl);
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}