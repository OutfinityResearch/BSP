#!/usr/bin/env node
/**
 * Download large training corpus for BPCM
 * Downloads from multiple sources without external dependencies
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const DATA_DIR = path.join(__dirname, '../data');
const CORPUS_FILE = path.join(DATA_DIR, 'corpus.txt');

// Sources to download from
const SOURCES = [
  {
    name: 'Project Gutenberg - Simple texts',
    urls: [
      'https://www.gutenberg.org/cache/epub/11/pg11.txt',  // Alice in Wonderland
      'https://www.gutenberg.org/cache/epub/1661/pg1661.txt', // Sherlock Holmes
      'https://www.gutenberg.org/cache/epub/84/pg84.txt',  // Frankenstein
      'https://www.gutenberg.org/cache/epub/1342/pg1342.txt', // Pride and Prejudice
      'https://www.gutenberg.org/cache/epub/2701/pg2701.txt', // Moby Dick
      'https://www.gutenberg.org/cache/epub/98/pg98.txt',  // Tale of Two Cities
      'https://www.gutenberg.org/cache/epub/1400/pg1400.txt', // Great Expectations
      'https://www.gutenberg.org/cache/epub/74/pg74.txt',  // Tom Sawyer
      'https://www.gutenberg.org/cache/epub/76/pg76.txt',  // Huckleberry Finn
      'https://www.gutenberg.org/cache/epub/345/pg345.txt', // Dracula
    ]
  }
];

/**
 * Simple HTTPS/HTTP fetch with redirect support
 */
function fetch(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      reject(new Error('Too many redirects'));
      return;
    }

    const protocol = url.startsWith('https') ? https : http;
    
    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'BPCM-Trainer/1.0',
        'Accept': 'text/plain,text/html,*/*',
      },
      timeout: 30000,
    }, (response) => {
      // Handle redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        let redirectUrl = response.headers.location;
        if (!redirectUrl.startsWith('http')) {
          const urlObj = new URL(url);
          redirectUrl = `${urlObj.protocol}//${urlObj.host}${redirectUrl}`;
        }
        resolve(fetch(redirectUrl, maxRedirects - 1));
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(buffer.toString('utf8'));
      });
      response.on('error', reject);
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Clean and process text into sentences
 */
function processText(text) {
  const sentences = [];
  
  // Remove Project Gutenberg header/footer
  const startMarkers = [
    '*** START OF THE PROJECT GUTENBERG',
    '*** START OF THIS PROJECT GUTENBERG',
    '*END*THE SMALL PRINT',
  ];
  const endMarkers = [
    '*** END OF THE PROJECT GUTENBERG',
    '*** END OF THIS PROJECT GUTENBERG',
    'End of the Project Gutenberg',
    'End of Project Gutenberg',
  ];
  
  let content = text;
  
  // Find start
  for (const marker of startMarkers) {
    const idx = content.indexOf(marker);
    if (idx !== -1) {
      const endOfLine = content.indexOf('\n', idx);
      if (endOfLine !== -1) {
        content = content.substring(endOfLine + 1);
      }
      break;
    }
  }
  
  // Find end
  for (const marker of endMarkers) {
    const idx = content.indexOf(marker);
    if (idx !== -1) {
      content = content.substring(0, idx);
      break;
    }
  }
  
  // Split into lines and clean
  const lines = content.split(/\r?\n/);
  let currentSentence = '';
  
  for (const line of lines) {
    // Skip empty lines and chapter headers
    const trimmed = line.trim();
    if (!trimmed) {
      if (currentSentence.length > 20) {
        sentences.push(currentSentence.trim());
        currentSentence = '';
      }
      continue;
    }
    
    // Skip chapter headers, table of contents, etc.
    if (/^(CHAPTER|Chapter|PART|Part|BOOK|Book|CONTENTS|TABLE OF)\s/i.test(trimmed)) {
      continue;
    }
    if (/^[IVXLCDM]+\.?\s*$/i.test(trimmed)) {
      continue;
    }
    if (/^\d+\.?\s*$/.test(trimmed)) {
      continue;
    }
    
    // Add to current sentence
    currentSentence += ' ' + trimmed;
    
    // Check for sentence endings
    const sentenceEnds = currentSentence.match(/[.!?]["']?\s+/g);
    if (sentenceEnds && currentSentence.length > 30) {
      // Split into sentences
      const parts = currentSentence.split(/(?<=[.!?]["']?)\s+/);
      for (const part of parts.slice(0, -1)) {
        const cleaned = cleanSentence(part);
        if (cleaned && cleaned.length >= 20 && cleaned.length <= 500) {
          sentences.push(cleaned);
        }
      }
      currentSentence = parts[parts.length - 1] || '';
    }
  }
  
  // Don't forget the last sentence
  if (currentSentence.length > 20) {
    const cleaned = cleanSentence(currentSentence);
    if (cleaned) {
      sentences.push(cleaned);
    }
  }
  
  return sentences;
}

/**
 * Clean a single sentence
 */
function cleanSentence(sentence) {
  let s = sentence.trim();
  
  // Remove multiple spaces
  s = s.replace(/\s+/g, ' ');
  
  // Remove strange characters
  s = s.replace(/[^\w\s.,!?;:'"()-]/g, '');
  
  // Skip if too short or too long
  if (s.length < 20 || s.length > 500) {
    return null;
  }
  
  // Skip if mostly numbers or special chars
  const letters = s.match(/[a-zA-Z]/g);
  if (!letters || letters.length < s.length * 0.5) {
    return null;
  }
  
  return s;
}

/**
 * Main download function
 */
async function downloadCorpus() {
  console.log('============================================================');
  console.log('BPCM Corpus Downloader');
  console.log('============================================================\n');
  
  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  
  const allSentences = [];
  
  for (const source of SOURCES) {
    console.log(`\nSource: ${source.name}`);
    console.log('-'.repeat(50));
    
    for (const url of source.urls) {
      const bookName = path.basename(url, '.txt');
      process.stdout.write(`  Downloading ${bookName}... `);
      
      try {
        const text = await fetch(url);
        const sentences = processText(text);
        allSentences.push(...sentences);
        console.log(`${sentences.length} sentences`);
      } catch (err) {
        console.log(`FAILED: ${err.message}`);
      }
      
      // Small delay to be nice to servers
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Remove duplicates
  const uniqueSentences = [...new Set(allSentences)];
  
  // Shuffle
  for (let i = uniqueSentences.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [uniqueSentences[i], uniqueSentences[j]] = [uniqueSentences[j], uniqueSentences[i]];
  }
  
  console.log('\n============================================================');
  console.log(`Total sentences collected: ${allSentences.length}`);
  console.log(`Unique sentences: ${uniqueSentences.length}`);
  
  // Write to file
  fs.writeFileSync(CORPUS_FILE, uniqueSentences.join('\n'));
  
  const fileSize = fs.statSync(CORPUS_FILE).size;
  console.log(`Saved to: ${CORPUS_FILE}`);
  console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log('============================================================\n');
  
  return uniqueSentences.length;
}

// Run if called directly
if (require.main === module) {
  downloadCorpus().catch(err => {
    console.error('Download failed:', err);
    process.exit(1);
  });
}

module.exports = { downloadCorpus, processText };
