// 디자인 프리뷰 갤러리 로컬 서버 — localhost:4000
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { paths } from './config.js';

const PORT = 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GALLERY_HTML = path.resolve(__dirname, '..', 'gallery-index.html');

/**
 * 갤러리 서버 시작.
 * - GET /                → 갤러리 UI (gallery-index.html)
 * - GET /api/previews    → 현재 프리뷰 목록 JSON
 * - GET /preview/:file   → 개별 프리뷰 HTML 파일 서빙
 * - GET /output/*        → output 폴더 정적 파일 서빙
 */
export function startGalleryServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://localhost:${PORT}`);

      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');

      // GET / → 갤러리 UI
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const html = await fs.readFile(GALLERY_HTML, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }

      // GET /api/previews → 최신 프리뷰 목록
      if (url.pathname === '/api/previews') {
        const previews = await _findLatestPreviews();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(previews));
        return;
      }

      // GET /output/* → 정적 파일 서빙 (프리뷰 HTML)
      if (url.pathname.startsWith('/output/')) {
        const filePath = path.join(paths.root, url.pathname);
        try {
          const content = await fs.readFile(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const mime = ext === '.html' ? 'text/html; charset=utf-8'
            : ext === '.css' ? 'text/css'
            : ext === '.js' ? 'application/javascript'
            : ext === '.json' ? 'application/json'
            : ext === '.svg' ? 'image/svg+xml'
            : 'application/octet-stream';
          res.writeHead(200, { 'Content-Type': mime });
          res.end(content);
        } catch {
          res.writeHead(404);
          res.end('Not found');
        }
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    } catch (e) {
      res.writeHead(500);
      res.end(String(e.message));
    }
  });

  server.listen(PORT, () => {
    console.log(`  🎨 갤러리 서버: http://localhost:${PORT}`);
  });

  return server;
}

/**
 * output/ 에서 가장 최근 프리뷰 폴더를 찾아서 파일 목록 반환.
 * 반환: [{ id: "①", name: "블룸버그 터미널", file: "/output/g-.../previews/preview-01.html", colors: [...] }]
 */
async function _findLatestPreviews() {
  const outputDir = paths.outputDir;
  try {
    // output/g-<id>/ 하위 탐색
    const groups = await fs.readdir(outputDir);
    let latestDir = null;
    let latestTime = 0;

    for (const g of groups) {
      if (!g.startsWith('g-')) continue;
      const gPath = path.join(outputDir, g);
      const months = await fs.readdir(gPath).catch(() => []);
      for (const m of months) {
        const mPath = path.join(gPath, m);
        const slugs = await fs.readdir(mPath).catch(() => []);
        for (const s of slugs) {
          // previews/ 와 fulls/ 둘 다 탐색 — 가장 최근 폴더 사용
          for (const sub of ['fulls', 'previews']) {
            const subPath = path.join(mPath, s, sub);
            try {
              const stat = await fs.stat(subPath);
              if (stat.isDirectory() && stat.mtimeMs > latestTime) {
                latestTime = stat.mtimeMs;
                latestDir = subPath;
              }
            } catch { /* 없으면 다음 */ }
          }
        }
      }
    }

    if (!latestDir) return [];

    const files = await fs.readdir(latestDir);
    const htmlFiles = files.filter(f => f.endsWith('.html')).sort();

    const previews = [];
    for (const f of htmlFiles) {
      const filePath = path.join(latestDir, f);
      const relativePath = '/' + path.relative(paths.root, filePath).replace(/\\/g, '/');

      // HTML에서 <title>과 색상 추출
      const content = await fs.readFile(filePath, 'utf-8');
      const titleMatch = content.match(/<title>([^<]*)<\/title>/i);
      const name = titleMatch ? titleMatch[1] : f.replace('.html', '');

      // CSS 변수나 주요 색상 추출
      const colorMatches = [...content.matchAll(/(?:--[a-z-]+|background|color)\s*:\s*(#[0-9a-fA-F]{3,8})/g)];
      const colors = [...new Set(colorMatches.map(m => m[1]))].slice(0, 4);

      // 파일명에서 ID 추출 (preview-01.html → ①)
      const numMatch = f.match(/(\d+)/);
      const num = numMatch ? parseInt(numMatch[1]) : previews.length + 1;
      const circledNums = ['①','②','③','④','⑤','⑥','⑦','⑧','⑨','⑩'];
      const id = circledNums[num - 1] || `(${num})`;

      previews.push({ id, name, file: relativePath, colors });
    }

    return previews;
  } catch {
    return [];
  }
}
