/** @type {import('next').NextConfig} */
// BASE_PATH só é usado para gerar a prévia de uma versão nova numa subpasta do site (ex.: /previa-onda2)
export default { output: 'export', trailingSlash: true, images: { unoptimized: true }, ...(process.env.BASE_PATH ? { basePath: process.env.BASE_PATH } : {}) };
