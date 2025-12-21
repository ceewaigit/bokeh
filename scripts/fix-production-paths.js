const fs = require('fs');
const path = require('path');

function fixHtmlFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Calculate depth from out directory
  const relativePath = path.relative(path.join(__dirname, '../out'), filePath);
  const depth = relativePath.split(path.sep).length - 1;
  const prefix = depth > 0 ? '../'.repeat(depth) : './';
  
  // Fix all absolute paths to be relative
  content = content.replace(/href="\/([^"]*?)"/g, `href="${prefix}$1"`);
  content = content.replace(/src="\/([^"]*?)"/g, `src="${prefix}$1"`);
  
  // Fix _next paths specifically
  content = content.replace(/"\/_next\//g, `"${prefix}_next/`);
  
  // Fix paths in inline scripts (Next.js chunk loading)
  // Replace references to static/chunks with relative paths
  content = content.replace(/"static\/chunks\//g, `"${prefix}_next/static/chunks/`);
  
  // Fix any remaining absolute paths in JavaScript strings
  content = content.replace(/"\/_next\/static\//g, `"${prefix}_next/static/`);
  content = content.replace(/'\/_next\/static\//g, `'${prefix}_next/static/`);
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Fixed paths in: ${path.basename(filePath)} (depth: ${depth}, prefix: ${prefix})`);
}

// Find all HTML files in out directory
function findHtmlFiles(dir) {
  const files = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory() && !item.startsWith('.') && item !== '_next') {
      files.push(...findHtmlFiles(fullPath));
    } else if (item.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

const outDir = path.join(__dirname, '../out');
const htmlFiles = findHtmlFiles(outDir);

console.log(`Found ${htmlFiles.length} HTML files to fix`);
htmlFiles.forEach(fixHtmlFile);
console.log('✅ Path fixing complete');