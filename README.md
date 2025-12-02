# My BitBurner Editor

This project is an external editor for Bitburner, which supports JS, JSX, TS and TSX.

## Get started

### Setup

1. install [NodeJS](https://nodejs.org) v20 or newer
1. navigate to the template inside your console `cd my-bitburner`
1. run `yarn install` in console to install all dependencies
1. run `yarn start` in console to start the RemoteAPI server
1. open Bitburner and navigate to the settings
1. open the tab labeled 'Remote API' and enter the port '12525'
1. press connect

## File Hierarchy

The destination server for scripts is determined by their file hierarchy. The file hierarchy consists of a basepath (default `/servers`), a server name and the script path. For example, a file with the path `servers/home/lib/utils.ts` will be placed on the home server, in the lib folder as utils.js while a file with the path `servers/pserv-1/hack.ts` would be placed on pserv-1 as `hack.js`. If a server does not exist a warning will be printed to the console. Any changes made to scripts inside the server folders will automatically be uploaded to Bitburner.

For more in-depth details and a full list of options have a look at the [plugin](https://github.com/shyguy1412/esbuild-bitburner-plugin) powering this template!

## Features

### esbuild

This template uses [esbuild](https://esbuild.github.io/) to bundle scripts.

### Using React

This template allows usage of the in-game instances of `React` and `ReactDOM` by importing them as ESModules.

```jsx
import React, { useState } from "react";

export function MyComponent() {
  const [count, setCount] = useState(0);

  return (
    <div>
      Count {count}{" "}
      <button onClick={() => setCount(count + 1)}>Add to count</button>
    </div>
  );
}
```

### Developing on multiple servers

Create a new folder with the name of the server you want to develop on in the 'servers' directory to start developing on that server!

### Bidirectional Mirroring

To enable mirroring:

```js
const createContext = async () =>
  await context({
    entryPoints: [
      "servers/**/*.js",
      "servers/**/*.jsx",
      "servers/**/*.ts",
      "servers/**/*.tsx",
    ],
    outbase: "./servers",
    outdir: "./build",
    plugins: [
      BitburnerPlugin({
        port: 12525,
        types: "NetscriptDefinitions.d.ts",
        mirror: {
          "local/path": ["home", "and/or other servers"],
        },
      }),
    ],
    bundle: true,
    format: "esm",
    platform: "browser",
    logLevel: "info",
  });

let ctx = await createContext();
ctx.watch();
```

This will mirror all listed servers for a path to a specified location.
While mirroring, all changes in the game will be synced with the editor and vice versa.

### Automatic Distribution

Specify folders with a list of servers to automatically distribute files to servers:

```js
const createContext = async () =>
  await context({
    entryPoints: [
      "servers/**/*.js",
      "servers/**/*.jsx",
      "servers/**/*.ts",
      "servers/**/*.tsx",
    ],
    outbase: "./servers",
    outdir: "./build",
    plugins: [
      BitburnerPlugin({
        port: 12525,
        types: "NetscriptDefinitions.d.ts",
        distribute: {
          "build/home/dist": ["server-1", "server-2", "server-3"],
        },
      }),
    ],
    bundle: true,
    format: "esm",
    platform: "browser",
    logLevel: "info",
  });

let ctx = await createContext();
ctx.watch();
```

In this example all files that are developed in 'servers/home/dist' will not only be uploaded to 'home' but also 'server-1', 'server-2' and 'server-3'.

### Plugin Extensions

Provide plugin extensions with hooks that trigger before and after certain events. Within hooks that guarantee that the plugin is connected to the game, you also get full access to the remote file API.

Extensions usage:

```js
import { context } from "esbuild";
import { BitburnerPlugin } from "esbuild-bitburner-plugin";

/** @type import('esbuild-bitburner-plugin').PluginExtension*/
const customExtension = {
  setup() {
    console.log("setup");
  }, //Run once on plugin startup

  beforeConnect() {
    console.log("beforeConnect");
  }, //Run once before the game connects
  afterConnect(remoteAPI) {
    console.log("afterConnect");
  }, //Run every time after the game (re)connects

  beforeBuild() {
    console.log("beforeBuild");
  }, //Run before every build process
  afterBuild(remoteAPI) {
    console.log("afterBuild");
  }, //Run after build results have been uploaded into the game
};

const createContext = async () =>
  await context({
    entryPoints: [
      "servers/**/*.js",
      "servers/**/*.jsx",
      "servers/**/*.ts",
      "servers/**/*.tsx",
    ],
    outbase: "./servers",
    outdir: "./build",
    plugins: [
      BitburnerPlugin({
        port: 12525,
        types: "NetscriptDefinitions.d.ts",
        extensions: [customExtension],
      }),
    ],
    bundle: true,
    format: "esm",
    platform: "browser",
    logLevel: "info",
  });

let ctx = await createContext();
ctx.watch();
```

## Remote Debugging

This tool supports remote debugging for both the Steam and the web versions of Bitburner running in a Chrome/Chromium browser.

```js
const createContext = async () =>
  await context({
    entryPoints: [
      "servers/**/*.js",
      "servers/**/*.jsx",
      "servers/**/*.ts",
      "servers/**/*.tsx",
    ],
    outbase: "./servers",
    outdir: "./build",
    plugins: [
      BitburnerPlugin({
        port: 12525,
        types: "NetscriptDefinitions.d.ts",
        remoteDebugging: true,
      }),
    ],
    bundle: true,
    format: "esm",
    platform: "browser",
    logLevel: "info",
  });

const ctx = await createContext();
ctx.watch();
```

### Steam

To enable remote debugging for the Steam version go into the properties for Bitburner (little cogwheel to the right when viewing Bitburner in your library) and add the following launch option `--remote-debugging-port=9222`.

### Chrome/Chromium

To enable remote debugging for the browser, launch it in the commandline:

```sh
<path-to-chrome> --remote-debugging-port=9222
```
