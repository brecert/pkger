```
originally made in late 2019
imported from: https://glitch.com/edit/#!/pkger
```

# PKGER
> esbuild as a web service (done poorly)

### About PKGER
> PKGER is web layer over esbuild that outputs esm bundles

PKGER is meant for quick development and prototyping of websites that use ESM modules.

PKGER is not meant to be used for producution at all, if you do want to use PKGER in production please contact me.

### Shorthands
> short, memoriable, and easy to use urls

shorthands will redirect and resolve to more complete and static urls.

If a tag is not provided then it will resolve to the latest version when redirecting.

for example `/@brecert/flakeid` may have a latest version of `2.0.0` so when redirecting it will redirect to `/-/flakeid/2.0.0/dist-web/index.js`.

#### URL Format

- `/:package`
- `/:package@:tag`
- `/@:namespace/:package`
- `/@:namespace/:package@:tag`

#### Examples

- `https://pkger.glitch.me/futoji/`
- `https://pkger.glitch.me/@brecert/flakeid`
- `https://pkger.glitch.me/@brecert/flakeid@^2.0.0`

### Static URLS
> longer, more static urls that are safer to use

static urls are expected to remain the same and should be "safer" use to use, although pkger is not meant for any sort of real use

#### URL Format

- `/-/:package@:tag/**`
- `/-/@:namespace/:package@:tag/**`

#### Examples

- `https://pkger.glitch.me/-/futoji@0.2.1/index.js`
- `https://pkger.glitch.me/-/@brecert/flakeid@2.0.0/dist-web/index.js`

### Entry Selection

> Selects a the entry type to use when bundling.

#### Examples

- `/example-package?main`
- `/example-package?browser`
- `/example-package?esm`
- `/example-package?node`