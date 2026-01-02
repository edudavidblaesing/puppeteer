const fs = require('fs');
const path = 'admin/src/components/features/EventForm.tsx';

try {
    let content = fs.readFileSync(path, 'utf8');

    // We are looking for the block BEFORE "const [transitionError"
    // The block looks like:
    // const initialRef = useRef(formData);
    // ...
    // }, [formData, selectedArtists, onDirtyChange]);

    // And there is another identical block later.
    // We want to remove the FIRST one if it appears before transitionError.

    const marker = 'const [transitionError, setTransitionError]';
    const markerIndex = content.indexOf(marker);

    if (markerIndex === -1) {
        console.error('Could not find transitionError marker');
        process.exit(1);
    }

    const preContent = content.substring(0, markerIndex);
    const postContent = content.substring(markerIndex);

    // Regex to match the block
    // const initialRef = useRef\(formData\);[\s\S]*?\}\, \[formData, selectedArtists, onDirtyChange\]\);

    const regex = /const initialRef = useRef\(formData\);[\s\S]*?\}\, \[formData, selectedArtists, onDirtyChange\]\);/g;

    // Check if we have matches in preContent
    const matches = preContent.match(regex);

    if (matches && matches.length > 0) {
        console.log(`Found ${matches.length} matches in pre-content. Removing them.`);
        const newPreContent = preContent.replace(regex, '');
        const newContent = newPreContent + postContent;
        fs.writeFileSync(path, newContent);
        console.log('File updated successfully.');
    } else {
        console.log('No duplicate block found before transitionError marker.');
    }

} catch (err) {
    console.error(err);
    process.exit(1);
}
