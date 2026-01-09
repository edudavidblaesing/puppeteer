const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src');

function walk(dir, callback) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const filepath = path.join(dir, file);
        const stats = fs.statSync(filepath);
        if (stats.isDirectory()) {
            walk(filepath, callback);
        } else if (file.endsWith('.js')) {
            callback(filepath);
        }
    });
}

function replaceImports(filepath) {
    let content = fs.readFileSync(filepath, 'utf8');
    let original = content;

    // Replace db imports
    content = content.replace(/require\(['"]\.\.\/db['"]\)/g, "require('@social-events/shared').db");
    content = content.replace(/require\(['"]\.\/db['"]\)/g, "require('@social-events/shared').db"); // For app.js
    content = content.replace(/require\(['"]\.\.\/\.\.\/db['"]\)/g, "require('@social-events/shared').db");

    // Replace AppError imports
    content = content.replace(/require\(['"]\.\.\/utils\/AppError['"]\)/g, "require('@social-events/shared')");
    content = content.replace(/require\(['"]\.\/utils\/AppError['"]\)/g, "require('@social-events/shared')");

    // Replace data services
    const dataRegex = /const (\w+) = require\(['"]\.\.\/services\/data\/\w+['"]\);/g;
    content = content.replace(dataRegex, (match, varName) => {
        return `const { services: { ${varName} } } = require('@social-events/shared');`;
    });
    // For deeper path (e.g. from utils)
    const deepDataRegex = /const (\w+) = require\(['"]\.\.\/\.\.\/services\/data\/\w+['"]\);/g;
    content = content.replace(deepDataRegex, (match, varName) => {
        return `const { services: { ${varName} } } = require('@social-events/shared');`;
    });

    // Replace other shared services
    content = content.replace(/const (\w+) = require\(['"]\.\.\/services\/geocoder['"]\);/g, (match, varName) => {
        return `const { services: { ${varName} } } = require('@social-events/shared');`;
    });

    // Replace migrations require if any (unlikely in src but check)
    content = content.replace(/require\(['"]\.\.\/migrate['"]\)/g, "require('@social-events/shared')"); // Migrate not exported yet!

    if (content !== original) {
        console.log(`Refactoring ${filepath}`);
        fs.writeFileSync(filepath, content);
    }
}

walk(dir, replaceImports);
console.log('Refactoring scraper imports complete.');
