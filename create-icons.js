const sharp = require('sharp');

const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0D0D0D"/>
  <path d="M256 40L440 120V280C440 380 256 470 256 470C256 470 72 380 72 280V120L256 40Z" fill="#FF6B00"/>
  <text x="256" y="290" text-anchor="middle" fill="white" font-size="200" font-weight="900" font-family="Arial">F</text>
</svg>`);

sharp(svg).resize(512, 512).png().toFile('public/icon-512.png', () => {
  sharp(svg).resize(192, 192).png().toFile('public/icon-192.png', () => {
    console.log('Listo');
  });
});