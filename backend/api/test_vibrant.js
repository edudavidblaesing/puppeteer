try {
    const Vibrant = require('node-vibrant/node');
    console.log('Type of Vibrant:', typeof Vibrant);
    console.log('Keys:', Object.keys(Vibrant));
    console.log('Vibrant.from:', Vibrant.from);
    console.log('Vibrant.default:', Vibrant.default);
} catch (e) {
    console.error(e);
}
