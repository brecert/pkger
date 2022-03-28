// import all of the modules needed

// restana is tiny and efficient framework for building small micro-services, just like this one
import ana from "restana";

// restana doesn't parse queries by default, connect-query is a middleware that adds this
import query from "connect-query";

// restana doesn't have a way to serve static files by default, serve-static is a middleware that adds this
import serveStatic from "serve-static";

// http-cache-middleware is a middleware that caches a requests and the results, this works well with serve-static to improve performance
// so that the file doesn't always need to be queried
import cache from "http-cache-middleware";

// pnpm's own package requester, npm resolved, and tarball fetcher
// these are used to get information on the packages and to download the packages to be bundled
import createPackageRequester from "@pnpm/package-requester";
import createResolver from "@pnpm/npm-resolver";
import createFetcher from "@pnpm/tarball-fetcher";

// pnpm's read-package-json package extension that promisifies the package
import * as readPackageJson from "@pnpm/read-package-json";

// tempy gets/creates a random temporary folder/directory
import * as tempy from "tempy";

// esbuild is what bundles the packages together
import * as esbuild from "esbuild";

// todo: explain path
import * as path from "path";

// todo: explain fs
import * as fs from "fs";

// small utils that are put in another file as to not clutter this one.
import { parsePackageTag, createQuery } from "./utils.js";

// module types to check when checking if a query is a valid module
const MODULE_TYPES = [
  "module",
  "main",
  "browser",
  "esm",
  "node",
  "commonjs",
  "common-js",
  "commonjs-external",
];

// create a middleware handler that will use the public folder for static files
const staticFiles = serveStatic(path.join("./", "public"), {
  lastModified: false,
  setHeaders: (res, _) => {
    res.setHeader("cache-control", "public, no-cache, max-age=604800");
  },
});

// registry to use when fetching packages
const registry = "https://registry.npmjs.org";
const rawConfig = { registry };

// create an npm resolver, this gets info on the package requests, such as versions and manifest information
const npmResolve = createResolver({
  metaCache: new Map(),
  rawConfig,
  storeDir: ".store",
});

// create an npm fetcher, this downloads the package contents
const npmFetch = createFetcher({
  alwaysAuth: false,
  rawConfig,
  registry,
  strictSsl: false,
});

const storeIndex = {};

// create a package requester that will download files and store them in a store dir, similar to node_modules
const requestPackage = createPackageRequester(npmResolve, npmFetch, {
  networkConcurrency: 1,
  storeDir: ".store",
  storeIndex,
  verifyStoreIntegrity: true,
});

// create the restana server and use the query middleware
const service = ana();
service.use(query());

/**
 * Resolve a package using the package name and tag
 * @param packageName {string}
 * @param tag {string}
 */
async function resolvePackage(packageName, tag) {
  // create a temporary folder to use with pnpm's various downloader and storage functions
  const importerDir = tempy.directory();

  // requests the package from npm and downloads it into the storeDir
  const response = await requestPackage(
    { alias: packageName, pref: tag },
    {
      downloadPriority: 0,
      importerDir,
      lockfileDir: importerDir,
      preferredVersions: {},
      registry,
    }
  );

  // if the response doesn't exist, or if the the download didn't download correctly, throw an error
  if (!response.body || !response.body.inStoreLocation) {
    // todo: better error
    throw new Error("error resolving module");
  }

  // wait for the files to be finished downloading, and for the request to say it's finished before reading the package json
  await response.files();
  await response.finishing();
  // get the location of downloaded files
  const packageDir = path.resolve(response.body.inStoreLocation, "package");
  const packageJson = await readPackageJson.safeReadPackageFromDir(packageDir);

  if (packageJson === undefined) {
    throw new Error("missing package.json");
  }

  return {
    packageDir,
    packageJson,
  };
}

/**
 * Creates a bundle of a package and returns the bundled object
 * @param packageDir {string}
 */
async function bundlePackage(
  packageDir,
  manifest,
  { entryType = "default", filename = "index.js" } = {}
) {
  // if dependencies exist then resolve and download those packages to be bundled too
  if (manifest.dependencies) {
    Object.entries(manifest.dependencies).forEach(([dep, ver]) =>
      resolvePackage(dep, ver)
    );
  }

  const isFile = !filename || fs.existsSync(path.resolve(packageDir, filename));

  const entryFile = isFile
    ? filename
    : entryType !== "default"
    ? manifest[entryType]
    : manifest.module || manifest.main;

  if (entryFile === undefined) {
    throw new Error(`entry module not found: ${entryFile}`);
  }

  const filePath = path.resolve(".bundled", packageDir, entryFile);

  const result = await esbuild
    .build({
      entryPoints: [path.resolve(packageDir, entryFile)],
      nodePaths: [".store"],
      bundle: true,
      format: "esm",
      outfile: filePath,
    })
    .catch((_) => _);

  return fs.readFileSync(filePath, "utf8");
}

/**
 * @param {string} namespacePackage The @namespace/name of the package
 * @param {string} tag The `2.0.0`, `^2.0.0`, `latest`, etc.. version tag
 * @param {object} options Options to use when generating the code
 * @param {string?} options['safe-mode'] If safe-mode is enabled, disabled special bundling and transformation rules that can't normally happen, like importing json files
 * @param {string?} options['--debug'] If debug is enabled, return debug information
 */
async function generateCode(namespacePackage, tag, options, filename) {
  const { packageDir, packageJson } = await resolvePackage(
    namespacePackage,
    tag || "latest"
  );

  const query = new URLSearchParams(options);

  // if the query contains a valid entry type, choose that, otheriwse chose the default entry type
  const entryType = MODULE_TYPES.find((mode) => query.has(mode)) || "default";

  const code = await bundlePackage(packageDir, packageJson, {
    entryType,
    filename,
  });

  if (query.has("--debug")) {
    if (filename === "" || filename === undefined) {
      return packageDir;
    }
    return code;
  }

  return code;
}

// ROUTES

// utility function to redirect from one location to another
const redirect = (res, location) => {
  res.writeHead(302, { Location: location });
  res.send(`redirecting to ${location}`);
};

// utility function to specifically redirect to the cdn from a small list of parameters
const cdnRedirect = async (req, res, alias, tag) => {
  // get the package information to get the latest version/tag because the tag wasn't specified in the url params
  const pkg = await npmResolve({ alias, pref: tag }, { registry });

  // redirect to the more stable cdn with the canonical package name, using the latest version, and maintaining the requests query string
  redirect(
    res,
    `/-/${pkg.manifest.name}@${pkg.latest}/${createQuery(req.query)}`
  );
};

// create shorthand package request routes
service.get("/:packageTag", (req, res) =>
  cdnRedirect(
    req,
    res,
    ...parsePackageTag(req.params.packageTag, { versionRequired: false })
  )
);

service.get("/@:namespace/:packageTag", (req, res) => {
  const [packageName, packageVersion] = parsePackageTag(req.params.packageTag, {
    versionRequired: false,
  });

  cdnRedirect(
    req,
    res,
    `@${req.params.namespace}/${packageName}`,
    packageVersion
  );
});

/**
 * Redirects to a specific file in a package
 */
async function redirectToFile(req, res, namespacePackage, tag, options) {
  const { packageDir, packageJson } = await resolvePackage(
    namespacePackage,
    tag || "latest"
  );

  let entryType =
    MODULE_TYPES.find((m) => m in req.query) ||
    MODULE_TYPES.find((m) => m in packageJson);

  const entryFile = packageJson[entryType] || "index.js";

  redirect(res, `${entryFile}${createQuery(req.query)}`);
}

// create the static cdn routes and send the code
service.get("/-/@:namespace/:packageTag/**", async (req, res) => {
  const [packageName, packageVersion] = parsePackageTag(req.params.packageTag);

  if (req.params["*"].length === 0) {
    return redirectToFile(
      req,
      res,
      `@${req.params.namespace}/${packageName}`,
      packageVersion
    );
  }

  const code = await generateCode(
    `@${req.params.namespace}/${packageName}`,
    packageVersion,
    req.query,
    // anything after :tag is in ["*"], this serves as the filename
    req.params["*"]
  );

  res.send(code);
});

service.get("/-/:packageTag/**", async (req, res) => {
  const [packageName, packageVersion] = parsePackageTag(req.params.packageTag);

  if (req.params["*"].length === 0) {
    return redirectToFile(req, res, packageName, packageVersion);
  }

  const code = await generateCode(
    packageName,
    packageVersion,
    req.query,
    req.params["*"]
  );

  res.send(code);
});

// if the route didn't match anything above, error
service.all("**", (req, res) => res.send("404"));

// use the cache and the static files middleware
service.use(staticFiles);
service.use(cache());

// start the server
service
  .start()
  .then((server) => console.log(`listening on ${server.address().port}`));
