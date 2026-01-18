const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const BASE_URL = 'https://www.katharinakutscher.com';

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/about-2', name: 'about' },
  { path: '/marketing', name: 'marketing' },
  { path: '/content-creation', name: 'content-creation' },
  { path: '/modeling', name: 'modeling' },
  { path: '/balanceup', name: 'balanceup' },
  { path: '/thebodyverse', name: 'thebodyverse' },
  { path: '/bibliobag', name: 'bibliobag' },
  { path: '/djloa', name: 'djloa' },
  { path: '/millenium-city', name: 'millenium-city' }
];

const DIRS = {
  html: 'crawled/html',
  images: 'crawled/images',
  screenshots: 'crawled/screenshots',
  styles: 'crawled/styles'
};

// Create output directories
function setupDirectories() {
  Object.values(DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Download an image from URL
function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    if (!url || url.startsWith('data:')) {
      resolve(null);
      return;
    }

    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filepath);

    protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        downloadImage(response.headers.location, filepath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(filepath);
      });
    }).on('error', (err) => {
      fs.unlink(filepath, () => {});
      reject(err);
    });
  });
}

// Extract filename from URL
function getFilenameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let filename = path.basename(urlObj.pathname);

    // Handle Wix image URLs which often have query params
    if (!filename || filename === '' || !filename.includes('.')) {
      // Generate a filename from the URL hash
      const hash = url.split('/').pop().split('?')[0] || Date.now().toString();
      filename = hash.replace(/[^a-zA-Z0-9.-]/g, '_');
      if (!filename.includes('.')) {
        filename += '.jpg'; // Default to jpg
      }
    }

    return filename;
  } catch (e) {
    return `image_${Date.now()}.jpg`;
  }
}

async function crawlPage(browser, pageInfo) {
  console.log(`\nCrawling: ${pageInfo.name} (${pageInfo.path})`);

  const page = await browser.newPage();

  // Set viewport for desktop
  await page.setViewport({ width: 1920, height: 1080 });

  // Set user agent
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // Navigate to page
    await page.goto(`${BASE_URL}${pageInfo.path}`, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait a bit more for any lazy-loaded content
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Scroll down to trigger lazy loading
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
            window.scrollTo(0, 0);
            resolve();
          }
        }, 100);
      });
    });

    // Wait for images to load after scrolling
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Take full page screenshot
    await page.screenshot({
      path: `${DIRS.screenshots}/${pageInfo.name}-desktop.png`,
      fullPage: true
    });
    console.log(`  Screenshot saved: ${pageInfo.name}-desktop.png`);

    // Take mobile screenshot
    await page.setViewport({ width: 390, height: 844 });
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.screenshot({
      path: `${DIRS.screenshots}/${pageInfo.name}-mobile.png`,
      fullPage: true
    });
    console.log(`  Screenshot saved: ${pageInfo.name}-mobile.png`);

    // Reset to desktop viewport
    await page.setViewport({ width: 1920, height: 1080 });

    // Get rendered HTML
    const html = await page.content();
    fs.writeFileSync(`${DIRS.html}/${pageInfo.name}.html`, html);
    console.log(`  HTML saved: ${pageInfo.name}.html`);

    // Extract all image URLs
    const imageUrls = await page.evaluate(() => {
      const images = new Set();

      // Get img src
      document.querySelectorAll('img').forEach(img => {
        if (img.src) images.add(img.src);
        if (img.dataset.src) images.add(img.dataset.src);
      });

      // Get background images
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        const bgImage = style.backgroundImage;
        if (bgImage && bgImage !== 'none') {
          const matches = bgImage.match(/url\(['"]?([^'"()]+)['"]?\)/g);
          if (matches) {
            matches.forEach(match => {
              const url = match.replace(/url\(['"]?/, '').replace(/['"]?\)/, '');
              if (url && !url.startsWith('data:')) {
                images.add(url);
              }
            });
          }
        }
      });

      // Get picture source srcset
      document.querySelectorAll('source').forEach(source => {
        if (source.srcset) {
          source.srcset.split(',').forEach(src => {
            const url = src.trim().split(' ')[0];
            if (url) images.add(url);
          });
        }
      });

      return Array.from(images);
    });

    console.log(`  Found ${imageUrls.length} images`);

    // Extract navigation structure
    const navigation = await page.evaluate(() => {
      const navLinks = [];
      document.querySelectorAll('nav a, header a, [role="navigation"] a').forEach(link => {
        navLinks.push({
          text: link.textContent.trim(),
          href: link.href
        });
      });
      return navLinks;
    });

    // Extract text content
    const textContent = await page.evaluate(() => {
      const content = {};

      // Get all headings
      content.headings = [];
      document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => {
        content.headings.push({
          tag: h.tagName,
          text: h.textContent.trim()
        });
      });

      // Get all paragraphs
      content.paragraphs = [];
      document.querySelectorAll('p').forEach(p => {
        const text = p.textContent.trim();
        if (text) content.paragraphs.push(text);
      });

      // Get all links
      content.links = [];
      document.querySelectorAll('a').forEach(a => {
        content.links.push({
          text: a.textContent.trim(),
          href: a.href
        });
      });

      return content;
    });

    // Extract computed styles for key elements
    const styles = await page.evaluate(() => {
      const extractStyles = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const computed = window.getComputedStyle(el);
        return {
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          padding: computed.padding,
          margin: computed.margin
        };
      };

      return {
        body: extractStyles('body'),
        h1: extractStyles('h1'),
        h2: extractStyles('h2'),
        nav: extractStyles('nav'),
        header: extractStyles('header'),
        footer: extractStyles('footer')
      };
    });

    // Save page data
    const pageData = {
      name: pageInfo.name,
      path: pageInfo.path,
      url: `${BASE_URL}${pageInfo.path}`,
      imageUrls,
      navigation,
      textContent,
      styles
    };

    fs.writeFileSync(
      `${DIRS.styles}/${pageInfo.name}-data.json`,
      JSON.stringify(pageData, null, 2)
    );
    console.log(`  Data saved: ${pageInfo.name}-data.json`);

    return pageData;

  } catch (error) {
    console.error(`  Error crawling ${pageInfo.name}:`, error.message);
    return null;
  } finally {
    await page.close();
  }
}

async function downloadAllImages(allImageUrls) {
  console.log('\n--- Downloading Images ---');

  const downloaded = new Map();
  const failed = [];

  for (const url of allImageUrls) {
    if (downloaded.has(url)) continue;

    const filename = getFilenameFromUrl(url);
    const filepath = path.join(DIRS.images, filename);

    // Skip if already downloaded
    if (fs.existsSync(filepath)) {
      console.log(`  Skipping (exists): ${filename}`);
      downloaded.set(url, filepath);
      continue;
    }

    try {
      console.log(`  Downloading: ${filename}`);
      await downloadImage(url, filepath);
      downloaded.set(url, filepath);
    } catch (error) {
      console.log(`  Failed: ${filename} - ${error.message}`);
      failed.push({ url, error: error.message });
    }

    // Small delay between downloads
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n  Downloaded: ${downloaded.size}, Failed: ${failed.length}`);

  // Save download report
  fs.writeFileSync(
    path.join(DIRS.images, '_download-report.json'),
    JSON.stringify({ downloaded: Array.from(downloaded.entries()), failed }, null, 2)
  );

  return downloaded;
}

async function main() {
  console.log('=== Katharina Kutscher Website Crawler ===\n');

  // Setup directories
  setupDirectories();
  console.log('Created output directories');

  // Launch browser
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const allPageData = [];
    const allImageUrls = new Set();

    // Crawl each page
    for (const pageInfo of PAGES) {
      const pageData = await crawlPage(browser, pageInfo);
      if (pageData) {
        allPageData.push(pageData);
        pageData.imageUrls.forEach(url => allImageUrls.add(url));
      }
    }

    // Download all images
    await downloadAllImages(allImageUrls);

    // Save combined data
    fs.writeFileSync(
      'crawled/site-data.json',
      JSON.stringify({
        crawledAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        pages: allPageData
      }, null, 2)
    );

    console.log('\n=== Crawl Complete ===');
    console.log(`Pages crawled: ${allPageData.length}`);
    console.log(`Images found: ${allImageUrls.size}`);
    console.log('\nOutput saved to ./crawled/');

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
