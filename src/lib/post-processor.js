#!/usr/bin/env node
/**
 * The post-processor runs post-processing modules against crawl results.
 *
 * There are two types of post-processing modules:
 * 1. Modules that run against the result of crawling an individual spec. Such
 * modules take the spec crawl result as input and typically update it in place
 * 2. Modules that run against an entire crawl result. Such modules take the
 * entire crawl result as input and return whatever structure they would like
 * to return.
 *
 * The post-processor exposes two main functions:
 * - run() to run a post-processing module against crawl results or against a
 * spec crawl result (depending on the module)
 * - save() to save processing results to files
 * 
 * A post-processing module needs to expose the following properties and
 * functions:
 * - dependsOn: list of crawl result info that the module depends on. Values
 * include "css", "dfns", "idl", as well as info that other post-processing
 * modules may generate such as "idlparsed".
 * - input: either "crawl" or "spec". Default is "spec". Tells whether the
 * module operates on a spec crawl result or on the entire crawl result
 * - property: When "input" is "spec", gives the name of the property that
 * will be set in the spec crawl result when the post-processing module runs
 * and of the folder that will contain the spec extracts (unless module has its
 * "save" logic). For modules that run at the crawl level, gives the name of
 * the final extract file that gets created (unless module has its own "save"
 * logic).
 * - run: Async function to call to apply the post-processing module. The
 * function is called with either a spec crawl result of the entire crawl result
 * depending on "input". Second parameter is the crawl options object. The
 * function should return the created structure when "input" is "crawl" and
 * the updated spec crawl result when "input" is "spec". Note the function
 * may update the spec crawl result in place.
 * - save: Function to call to save the results of the post-processing module.
 * The function is called with the returned result of running the
 * post-processing module. Second parameter is the crawl options object. The
 * function is only needed if "save" needs to do specific things that the
 * post-processor cannot do on its own. Function must return the relative path
 * to the file that was saved
 * - extractsPerSeries: A boolean flag that tells the crawler that it should
 * clean up extract afterwards to produce extracts per series instead of
 * extracts per spec. The flag is only meaningful if module runs at the spec
 * level and if "property" is set.
 *
 * @module
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createFolderIfNeeded, shouldSaveToFile } from './util.js';
import csscomplete from '../postprocessing/csscomplete.js';
import cssmerge from '../postprocessing/cssmerge.js';
import events from '../postprocessing/events.js';
import idlnames from '../postprocessing/idlnames.js';
import idlparsed from '../postprocessing/idlparsed.js';
import annotatelinks from '../postprocessing/annotate-links.js';
import patchdfns from '../postprocessing/patch-dfns.js';


/**
 * Core post-processing modules
 */
const modules = {
  csscomplete,
  cssmerge,
  events,
  idlnames,
  idlparsed,
  annotatelinks,
  patchdfns
};


/**
 * Custom post-processing modules
 */
const customModules = {};


/**
 * Loads post-processing modules once and for all
 */
async function loadModules(mods) {
  for (const mod of mods) {
    if (typeof mod === 'string') {
      if (modules[mod]) {
        // Core post-processing module, already loaded
        continue;
      }
      else {
        try {
          customModules[mod] = await import(pathToFileURL(mod));
        }
        catch (err) {
          throw new Error(`Unknown post-processing module "${mod}"`);
        }
        if (!isModuleValid(customModules[mod])) {
          throw new Error(`"${mod}" is not a valid post-processing module`);
        }
      }
    }
    else {
      // Given post-processing moduel should already be a good one
      if (!isModuleValid(customModules[mod])) {
        throw new Error(`Post-processing module given as parameter does not have a "run" function`);
      }
    }
  }
}


/**
 * Returns the post-processing module that match the requested name, or the
 * given parameter if it is a post-processing module already
 *
 * @function
 * @param {String|Object} mod Module name of known post-processing module, or
 *   actual post-processing module.
 * @return {Object} Post-processing module
 */
function getModule(mod) {
  if (typeof mod === 'string') {
    if (modules[mod]) {
      return Object.assign({ name: mod }, modules[mod]);
    }
    else if (customModules[mod]) {
      return Object.assign({ name: mod }, customModules[mod]);
    }
    else {
      throw new Error(`Unknown post-processing module "${mod}"`);
    }
  }
  return mod;
}


/**
 * Returns true if given module object looks like a valid module, false
 * otherwise.
 *
 * @function
 * @param {Object} mod Post-processing module object
 * @return {boolean} True when module looks valid, false otherwise
 */
function isModuleValid(mod) {
  return !!mod && mod.run && (typeof mod.run === 'function');
}


/**
 * Run a post-processing module against some crawl result
 *
 * @function
 * @param {String|Object} mod Module name for known module or the actual
 * module implementation.
 * @param {Object} crawlResult The entire crawl results if module runs at the
 * "crawl" input level, the result of crawling a spec if module runs at the
 * "spec" input level.
 * @param {Object} options Crawl options. See spec crawler for details.
 * @return {Object} Post-processing structure
 */
async function run(mod, crawlResult, options) {
  mod = getModule(mod);

  if (mod.input === 'crawl') {
    if (crawlResult.crawled || !crawlResult.results) {
      // Post-processing module runs at the crawl level and we received
      // a spec crawl result
      return;
    }

    // TODO: make sure that there is at least one spec for which properties
    // listed in "dependsOn" are set. If not, the module cannot run, which
    // typically signals that the crawler was called with incompatible settings.
  }
  else {
    if (!crawlResult.crawled) {
      // Post-processing module runs at the spec level and we received
      // a full crawl result
      return;
    }

    // TODO: check properties listed in "dependsOn". If none is set, no need to
    // run the module (but not an error per se, it may just be that this
    // particular spec does not define relevant info)
  }

  return await mod.run(crawlResult, options); 
}


/**
 * Save post-processing results
 *
 * @function
 * @param {String|Object} mod Module name for known module or the actual
 * module implementation.
 * @param {Object} processResult The post-processing results
 * @param {Object} options Crawl options. See spec crawler for details.
 * @return {String} Relative path to the file created
 */
async function save(mod, processResult, options) {
  mod = getModule(mod);
  processResult = processResult || {};
  options = options || {};

  if (mod.input === 'crawl') {
    if (processResult.shortname) {
      // Post-processing module runs at the crawl level and we received
      // a spec crawl result
      return;
    }
  }
  else {
    if (!processResult.shortname) {
      // Post-processing module runs at the spec level and we received
      // a full crawl result
      return;
    }
  }

  if (!shouldSaveToFile(options)) {
    // Nothing to do if no output folder was given
    return;
  }

  if (mod.save) {
    // For post-processing modules that have some save logic, we'll just let
    // them do whatever they want
    return mod.save(processResult, options);
  }
  else if (!mod.property) {
    // For post-processing modules that don't touch any single property, default
    // save operation is to do nothing.
    return;
  }
  else if (mod.input === 'crawl') {
    // For post-processing modules that apply at the crawl level, default save
    // operation is to create a JSON file in the output folder named after the
    // post-processing module
    const filename = path.join(options.output, `${mod.property}.json`);
    await createFolderIfNeeded(options.output);
    await fs.promises.writeFile(filename, JSON.stringify(processResult, null, 2), 'utf8');
    return `${mod.property}.json`;
  }
  else {
    // For post-processing modules that apply at the spec level, default save
    // operation is to create a JSON extract file named after the spec's
    // shortname under a subfolder named after the post-processing module in the
    // output folder. Contents of the extract are the contents of the property
    // that has the same name as the module (or the name of the module's
    // "property" parameter if defined) in the post-processing result.
    if (!processResult[mod.property]) {
      return;
    }
    const folder = path.join(options.output, mod.property);
    const filename = path.join(folder, `${processResult.shortname}.json`);
    const contents = {
      spec: {
        title: processResult.title,
        url: processResult.crawled
      }
    };
    contents[mod.property] = processResult[mod.property];
    await createFolderIfNeeded(folder);
    await fs.promises.writeFile(filename, JSON.stringify(contents, null, 2), 'utf8');
    processResult[mod.property] = `${mod.property}/${processResult.shortname}.json`;
    return processResult[mod.property];
  }
}


/**
 * Return true if post-processing module generates extracts per spec series
 */
function extractsPerSeries(mod) {
  mod = getModule(mod);
  return (mod.input !== 'crawl') && !!mod.property && !!mod.extractsPerSeries;
}


/**
 * Return true if post-processing module generates extracts per spec series
 */
function dependsOn(mod) {
  mod = getModule(mod);
  return mod.dependsOn;
}

/**
 * Return the name of the property that will be set in the spec crawl result
 * when the post-processing module runs, if any
 */
function getProperty(mod) {
  mod = getModule(mod);
  return mod.property ?? mod.name;
}

function appliesAtLevel(mod, level) {
  mod = getModule(mod);
  const crawlLevel = mod.input === 'crawl';
  return level === 'crawl' ? crawlLevel : !crawlLevel;
}



/**************************************************
Export post-processing functions
**************************************************/
const postProcessor = {
  modules: Object.keys(modules),
  loadModules,
  run, save,
  extractsPerSeries,
  dependsOn,
  getProperty,
  appliesAtLevel
}

export default postProcessor;