const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CONTENT_CREATION_URL = 'https://www.katharinakutscher.com/content-creation';

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);

    protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const stats = fs.statSync(destPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`Downloaded: ${path.basename(destPath)} (${sizeMB} MB)`);
        resolve({ path: destPath, size: stats.size, sizeMB });
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function main() {
  console.log('Launching browser to find videos...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // Set a realistic viewport and user agent
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  console.log(`Navigating to ${CONTENT_CREATION_URL}...`);
  await page.goto(CONTENT_CREATION_URL, { waitUntil: 'networkidle0', timeout: 60000 });

  // Wait a bit for videos to load
  await new Promise(r => setTimeout(r, 3000));

  // Scroll down the page to trigger lazy loading
  console.log('Scrolling page to load all content...');
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 200);
    });
  });

  // Wait for videos to load after scrolling
  await new Promise(r => setTimeout(r, 3000));

  // Find all video sources
  console.log('Extracting video URLs...');
  const videoData = await page.evaluate(() => {
    const videos = [];

    // Find video elements
    document.querySelectorAll('video').forEach((video, index) => {
      const sources = [];

      // Check src attribute
      if (video.src) {
        sources.push(video.src);
      }

      // Check source elements
      video.querySelectorAll('source').forEach(source => {
        if (source.src) {
          sources.push(source.src);
        }
      });

      // Get poster image if available
      const poster = video.poster || null;

      // Try to get a description from nearby text
      let description = '';
      const parent = video.closest('[data-testid]') || video.parentElement;
      if (parent) {
        const textEl = parent.querySelector('h5, p, span');
        if (textEl) {
          description = textEl.textContent.trim();
        }
      }

      if (sources.length > 0) {
        videos.push({
          index,
          sources,
          poster,
          description
        });
      }
    });

    // Also check for Wix video players
    document.querySelectorAll('[data-video-url], [data-src*="video"]').forEach((el, index) => {
      const url = el.dataset.videoUrl || el.dataset.src;
      if (url && url.includes('video')) {
        videos.push({
          index: videos.length,
          sources: [url],
          poster: null,
          description: 'Wix video player'
        });
      }
    });

    return videos;
  });

  console.log(`Found ${videoData.length} videos`);

  // Also check network requests for video files
  const videoUrls = new Set();

  // Get all resources loaded
  const resources = await page.evaluate(() => {
    return performance.getEntriesByType('resource')
      .filter(r => r.name.includes('video') || r.name.includes('.mp4') || r.name.includes('wixstatic'))
      .map(r => r.name);
  });

  resources.forEach(url => {
    if (url.includes('video') || url.includes('.mp4')) {
      videoUrls.add(url);
    }
  });

  // Listen for more network requests and reload
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');

  const capturedUrls = [];
  client.on('Network.responseReceived', (params) => {
    const url = params.response.url;
    if (url.includes('video') && (url.includes('.mp4') || url.includes('wixstatic'))) {
      capturedUrls.push(url);
    }
  });

  // Scroll again and wait
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 1000));
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });

  await new Promise(r => setTimeout(r, 5000));

  console.log('Captured video URLs from network:', capturedUrls.length);
  capturedUrls.forEach(url => videoUrls.add(url));

  // Combine all found videos
  videoData.forEach(v => {
    v.sources.forEach(src => videoUrls.add(src));
  });

  await browser.close();

  // Create videos directory
  const videosDir = path.join(__dirname, 'videos');
  if (!fs.existsSync(videosDir)) {
    fs.mkdirSync(videosDir);
  }

  // Download videos
  const allVideoUrls = Array.from(videoUrls).filter(url =>
    url.includes('.mp4') || url.includes('video')
  );

  console.log(`\nTotal unique video URLs found: ${allVideoUrls.length}`);
  console.log('Video URLs:');
  allVideoUrls.forEach((url, i) => console.log(`  ${i + 1}. ${url.substring(0, 100)}...`));

  // Save URL list for reference
  fs.writeFileSync(
    path.join(videosDir, '_video-urls.json'),
    JSON.stringify({ videoData, allVideoUrls }, null, 2)
  );

  // Download each video
  let totalSize = 0;
  for (let i = 0; i < allVideoUrls.length; i++) {
    const url = allVideoUrls[i];
    const filename = `video-${i + 1}.mp4`;
    const destPath = path.join(videosDir, filename);

    try {
      console.log(`\nDownloading video ${i + 1}/${allVideoUrls.length}...`);
      const result = await downloadFile(url, destPath);
      totalSize += result.size;

      if (result.size > 100 * 1024 * 1024) {
        console.log(`WARNING: ${filename} is over 100MB!`);
      }
    } catch (err) {
      console.log(`Failed to download ${url}: ${err.message}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total videos: ${allVideoUrls.length}`);
  console.log(`Total size: ${(totalSize / (1024 * 1024)).toFixed(2)} MB`);
}

main().catch(console.error);
