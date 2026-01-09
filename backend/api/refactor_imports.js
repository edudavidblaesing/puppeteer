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
    // const { pool } = require('../db'); -> const { db: { pool } } = require('@social-events/shared');
    // const { pool, query } = require('../db'); -> const { db: { pool, query } } = require('@social-events/shared');
    // Note: Relative path depth might vary.
    content = content.replace(/require\(['"]\.\.\/db['"]\)/g, "require('@social-events/shared').db");

    // Replace AppError imports
    // const { AppError, catchAsync } = require('../utils/AppError'); -> const { AppError, catchAsync } = require('@social-events/shared');
    content = content.replace(/require\(['"]\.\.\/utils\/AppError['"]\)/g, "require('@social-events/shared')");
    content = content.replace(/require\(['"]\.\.\/\.\.\/utils\/AppError['"]\)/g, "require('@social-events/shared')"); // For deeper files if any

    // Replace data services
    // const eventService = require('../services/data/eventService'); 
    // -> const { services: { eventService } } = require('@social-events/shared');
    content = content.replace(/const (\w+) = require\(['"]\.\.\/services\/data\/\w+['"]\);/g, (match, varName) => {
        return `const { services: { ${varName} } } = require('@social-events/shared');`;
    });

    // Replace other services
    // const geocoder = require('../services/geocoder');
    content = content.replace(/const (\w+) = require\(['"]\.\.\/services\/geocoder['"]\);/g, (match, varName) => {
        return `const { services: { ${varName} } } = require('@social-events/shared');`;
    });

    content = content.replace(/const (\w+) = require\(['"]\.\.\/services\/emailService['"]\);/g, (match, varName) => {
        return `const { services: { ${varName} } } = require('@social-events/shared');`;
    });

    if (content !== original) {
        console.log(`Refactoring ${filepath}`);
        fs.writeFileSync(filepath, content);
    }
}

walk(dir, replaceImports);
console.log('Refactoring complete.');
