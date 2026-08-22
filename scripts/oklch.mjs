// sRGB <-> OKLab/OKLCH (Björn Ottosson)
const srgbToLin = u => u <= 0.04045 ? u/12.92 : ((u+0.055)/1.055)**2.4;
const linToSrgb = u => u <= 0.0031308 ? 12.92*u : 1.055*u**(1/2.4) - 0.055;
export const hexToRgb = h => { h=h.replace("#",""); return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255); };
export const rgbToHex = c => "#"+c.map(v=>Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,"0")).join("");

export function hexToOklch(hex) {
  const [r,g,b] = hexToRgb(hex).map(srgbToLin);
  const l = Math.cbrt(0.4122214708*r + 0.5363325363*g + 0.0514459929*b);
  const m = Math.cbrt(0.2119034982*r + 0.6806995451*g + 0.1073969566*b);
  const s = Math.cbrt(0.0883024619*r + 0.2817188376*g + 0.6299787005*b);
  const L = 0.2104542553*l + 0.7936177850*m - 0.0040720468*s;
  const A = 1.9779984951*l - 2.4285922050*m + 0.4505937099*s;
  const B = 0.0259040371*l + 0.7827717662*m - 0.8086757660*s;
  let H = Math.atan2(B,A)*180/Math.PI; if (H<0) H+=360;
  return { L, C: Math.hypot(A,B), H };
}
export function oklchToHex({L,C,H}) {
  const A = C*Math.cos(H*Math.PI/180), B = C*Math.sin(H*Math.PI/180);
  const l=(L+0.3963377774*A+0.2158037573*B)**3;
  const m=(L-0.1055613458*A-0.0638541728*B)**3;
  const s=(L-0.0894841775*A-1.2914855480*B)**3;
  return rgbToHex([
    +4.0767416621*l -3.3077115913*m +0.2309699292*s,
    -1.2684380046*l +2.6097574011*m -0.3413193965*s,
    -0.0041960863*l -0.7034186147*m +1.7076147010*s,
  ].map(linToSrgb));
}
const relLum = hex => { const [r,g,b]=hexToRgb(hex).map(srgbToLin); return 0.2126*r+0.7152*g+0.0722*b; };
export const contrast = (a,b) => { const [x,y]=[relLum(a),relLum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
