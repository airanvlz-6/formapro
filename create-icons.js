const sharp = require('sharp');

// Icono simple: fondo negro con F naranja bold
const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="80" fill="#0D0D0D"/>
  <rect x="140" y="120" width="240" height="50" rx="10" fill="#FF6B00"/>
  <rect x="140" y="120" width="60" height="280" rx="10" fill="#FF6B00"/>
  <rect x="140" y="231" width="180" height="45" rx="10" fill="#FF6B00"/>
</svg>`);

sharp(svg).resize(512, 512).png().toFile('public/icon-512.png', (err) => {
  if(err) console.error(err);
  else sharp(svg).resize(192, 192).png().toFile('public/icon-192.png', (err2) => {
    if(err2) console.error(err2);
    else console.log('Listo');
  });
});