export default [
  {
    input: 'src/browserlib/reffy.js',
    output: {
      file: 'builds/browser.js',
      format: 'iife',
      banner: '/* File generated with rollup.js, do not edit directly! See source code in src/browserlib */'
    }
  },
  {
    input: 'src/browserlib/canonicalize-url.js',
    output: {
      file: 'builds/canonicalize-url.js',
      format: 'cjs',
      banner: '/* File generated with rollup.js, do not edit directly! See source code in src/browserlib */'
    }
  }
];