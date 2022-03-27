/**
 * Parses a package tag, where a tag follows the format of `name@version`.
 * @param {string} tag The tag to parse.
 * @param {object} params Extra params that can be passed to change how parsing is handled.
 * @param {boolean} params.versionRequired If enabled an error will be thrown if no version is able to be parsed from the tag.
 */
export function parsePackageTag(tag, { versionRequired = true } = {}) {
  const packageNameAndTag = tag.split("@");

  if (packageNameAndTag.length <= versionRequired ? 1 : 0) {
    throw new Error(
      `A a package name and a package tag is required for the cdn.`
    );
  }

  return packageNameAndTag;
}

export function createQuery(query) {
  const map = Object.entries(query).map(([k, v]) => v !== '' ? `${k}=${v}` : `${k}`).join("&")
  if(map.length > 0) {
    return `?${map}`
  } else {
    return ""
  }
}