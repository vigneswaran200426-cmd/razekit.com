/**
 * Build-time feature switches.
 *
 * Its own module so that both the API client and the pages can read a switch
 * without importing each other. Every value here is substituted by Vite at
 * build time, which is the point: a switch that is off folds to a constant and
 * takes the code behind it out of the bundle, rather than shipping a feature
 * that is merely hidden behind a runtime check.
 */

/**
 * The Development area — autonomous app, website and game builds.
 *
 * OFF unless a build explicitly turns it on. With it off there is no route, no
 * navigation entry, no page chunk and no API surface in the shipped bundle;
 * /development is simply an address that does not exist.
 *
 * To bring it back: set VITE_DEV_AREA_ENABLED=true and rebuild. The server has
 * its own matching switch, DEV_AREA_ENABLED, and both have to be on.
 */
// __DEV_AREA_VISIBLE__ is substituted by Vite's `define` as a real boolean
// literal (see vite.config.js), which is what lets Rollup eliminate everything
// behind it. Reading import.meta.env here instead does NOT work: Vite rewrites
// that access to a variable, the comparison survives as runtime code, and the
// routes and page chunks ship in the bundle regardless of the flag.
//
// The typeof guard covers plain node, where the network-policy test loads
// api.js, which reaches this module and has no such global. typeof on an
// undeclared identifier is safe and yields "undefined", so off is the reading
// there — and under Vite the whole expression folds to a constant.
export const DEV_AREA_VISIBLE =
  typeof __DEV_AREA_VISIBLE__ === 'boolean' ? __DEV_AREA_VISIBLE__ : false;
