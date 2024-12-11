/**
 * Helper function that trims individual lines in a code block, removing as
 * much space as possible from the beginning of the page while preserving
 * indentation.
 *
 * Typically useful for CDDL and IDL extracts
 *
 * Rules followed:
 * - Always trim the first line
 * - Remove whitespaces from the end of each line
 * - Replace lines that contain spaces with empty lines
 * - Drop same number of leading whitespaces from all other lines
 */
export default function trimSpaces(code) {
    const lines = code.trim().split('\n');
    const toRemove = lines
        .slice(1)
        .filter(line => line.search(/\S/) > -1)
        .reduce(
            (min, line) => Math.min(min, line.search(/\S/)),
            Number.MAX_VALUE);
    return lines
        .map(line => {
            let firstRealChat = line.search(/\S/);
            if (firstRealChat === -1) {
                return '';
            }
            else if (firstRealChat === 0) {
                return line.replace(/\s+$/, '');
            }
            else {
                return line.substring(toRemove).replace(/\s+$/, '');
            }
        })
        .join('\n');
}