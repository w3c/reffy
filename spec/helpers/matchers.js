(function () {
  const customMatchers = {
    toHaveProperty: (util, customEqualityTesters) => {
      return {
        compare: (actual, expected) => {
          const res = {
            pass: actual && actual[expected],
          };
          if (res.pass) {
            res.message = 'Expected object not to have property "' + expected + '"';
          }
          else {
            res.message = 'Expected object to have property "' + expected + '"';
          }
          return res;
        }
      };
    },

    toExportName: (util, customEqualityTesters) => {
      return {
        compare: (actual, expected) => {
          const res = {
            pass: actual && actual.jsNames && actual.idlNames[expected],
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
    },

    toExpose: (util, customEqualityTesters) => {
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