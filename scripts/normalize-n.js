const fs = require('node:fs');
const path = require('node:path');

const indexPath = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(indexPath, 'utf-8');

let questionCounter = 0;
let replaceCount = 0;

const updatedHtml = html.split('\n').map(line => {
  // Reset counter on new deck headers (assuming markdown headers like "# Deck Name")
  if (line.trim().startsWith('#')) {
    questionCounter = 0;
  }
  
  // Track existing Q numbers to keep the counter accurate
  const qMatch = line.match(/^Q(\d+)\./);
  if (qMatch) {
    questionCounter = parseInt(qMatch[1], 10);
  }

  // Find lines starting with N. or N<n>.
  const nMatch = line.match(/^N(\d*)\./);
  if (nMatch) {
    replaceCount++;
    const num = nMatch[1] || (questionCounter + 1);
    questionCounter = parseInt(num, 10);
    return line.replace(/^N\d*\./, `Q${num}.`);
  }
  
  return line;
}).join('\n');

fs.writeFileSync(indexPath, updatedHtml, 'utf-8');
console.log(`Successfully normalized ${replaceCount} "N." questions to "Q<n>." in index.html.`);