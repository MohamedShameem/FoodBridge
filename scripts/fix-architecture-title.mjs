import sharp from 'sharp';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) throw new Error('Provide an input and output image path.');

const width = 1672;
const titleOverlay = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="82">
    <rect width="${width}" height="82" fill="#fbfaf6"/>
    <text x="836" y="68" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
      font-size="58" font-weight="800" letter-spacing="0" fill="#07463d">FOODBRIDGE SYSTEM ARCHITECTURE</text>
  </svg>
`);

await sharp(inputPath)
  .composite([{ input: titleOverlay, top: 0, left: 0 }])
  .png()
  .toFile(outputPath);
