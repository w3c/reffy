/**
 * Return the name of a well-known generator that was used to generate the
 * spec, if known.
 *
 * This function expects to run within a browser context.
 *
 * @function
 * @public
 * @param {Window} window
 * @return {Promise} The promise to get a document ready for extraction and
 *   the name of the generator (or null if generator is unknown).
 */
export default function () {
    const generator = window.document.querySelector('meta[name="generator"]');
    if (generator && generator.content.match(/bikeshed/i)) {
        return 'bikeshed';
    }
    else if ((generator && generator.content.match(/respec/i)) ||
            (document.body.id === 'respecDocument') ||
            window.respecConfig ||
            window.eval('typeof respecConfig !== "undefined"')) {
        return 'respec';
    }
    else {
        return null;
    }
}