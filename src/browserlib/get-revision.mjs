export default function () {
  // bikeshed uses 'document-revision'
  // but the documented convention in https://wiki.whatwg.org/wiki/MetaExtensions
  // is just 'revision' per https://github.com/krallin/meta-revision
  const meta = document.querySelector('meta[name="document-revision"], meta[name="revision"]');
  const revision = meta?.content.trim();
  // git commit shas are 40 hexadecimal characters
  if (revision && revision.match(/[0-9a-f]{40}/)) {
    return revision;
  }
  return null;
}
