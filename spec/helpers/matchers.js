(function () {
  const customMatchers = {
    toExportName: (util, customEqualityTesters) => {
      return {
        compare: (actual, expected) => {
          const res = {
            pass: actual && actual.idlNames && actual.idlNames[expected],
          };
          if (res.pass) {
            res.message = 'Expected IDL structure not to export name "' + expected + '"';
          }
          else {
            res.message = 'Expected IDL structure to export name "' + expected + '"';
          }
          return res;
        }
      };
    }
  };

  beforeEach(() => {
    jasmine.addMatchers(customMatchers);
  });
})();