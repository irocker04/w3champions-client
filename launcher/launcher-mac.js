console.log(process.argv);
if (process.argv[2] === "dev") {
  eval(
    require("fs")
      .readFileSync(__dirname + "/dev-mock.js")
      .toString()
  );
}

const fs = require("fs");
const path = require("path");
const shell = require("electron").shell;
const execSync = require("child_process").execSync;
const crypto = require("crypto");
const electron = require("electron");
const { dialog } = require("electron");
const { spawn, exec } = require("child_process");
const http = require("http");
const https = require("https");

const restClient = clientServer.indexOf("https:") === 0 ? https : http;

const applicationSupport =
  require("os").homedir() + path.sep + "Library/Application Support";
let $workingDir = applicationSupport;
let $war3DocumentsDir =
  applicationSupport +
  path.sep +
  "Blizzard" +
  path.sep +
  "Warcraft III" +
  path.sep;

let $war3MapsDir = $war3DocumentsDir + "Maps" + path.sep;
let $w3cMapsDir =
  $war3DocumentsDir + "Maps" + path.sep + "W3Champions" + path.sep;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, $workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.{app}.
    if (launchWindow) {
      if (launchWindow.isMinimized()) launchWindow.restore();
      launchWindow.focus();
    }
  });
}

async function main() {
  try {
    $workingDir += path.sep + "W3Champions";
    if (!fs.existsSync($workingDir)) {
      showProgress("Creating working directory");
      fs.mkdirSync($workingDir);
    }

    $workingDir += path.sep + "app";
    if (!fs.existsSync($workingDir)) {
      showProgress("Creating app directory");
      fs.mkdirSync($workingDir);
    }

    if (!fs.existsSync($war3DocumentsDir)) {
      throw new Error(
        "Was unable to detect your Warcraft III Maps folder. Searched in: " +
          $war3DocumentsDir
      );
    }

    for (const dir of [$war3MapsDir, $w3cMapsDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
      }
    }

    let bnetPath = "/Applications/Battle.net.app/Contents/MacOS/Battle.net";
    let w3Path =
      "/Applications/Warcraft III/_retail_/x86_64/Warcraft III.app/Contents/MacOS/Warcraft III";

    if (!bnetPath) {
      throw new Error("Was unable to find the Battle.net executable");
    }

    if (!w3Path) {
      throw new Error("Was unable to find the Warcraft III executable");
    }

    w3Path = "/Applications/Warcraft III/_retail_/";

    const w3cDir = w3Path + "webui";

    console.log("detected bnet path: " + bnetPath);
    console.log("detected w3path path: " + w3cDir);
    console.log("detected w3c dir: " + w3cDir);

    while (processRunning("Warcraft III.exe", "Warcraft\\ III")) {
      showProgress(
        "Please close Warcraft III to continue launching W3Champions"
      );
      await sleep(1000);
    }

    showProgress("Checking for W3C map updates");
    await patchingMain();

    showProgress("Checking maps folders");
    if (fs.existsSync(w3Path + "Maps")) {
      const response = dialog.showMessageBox(null, {
        type: "question",
        message:
          "Maps folder detected in Warcraft III installation directory. This leads to joinbugs in W3Champions because of a current Reforged bug. To solve this issue, the folder gets renamed to _Maps until the bug was fixed. Your regular Maps folder stays untouched. Proceed?",
        title: "Joinbug fix required",
        buttons: ["Yes", "Cancel"],
      });
      if (response == 0) {
        fs.renameSync(w3Path + "Maps", w3Path + "_Maps");
      } else {
        app.quit();
      }
    }

    if (!processRunning("Battle.Net.Exe", "Battle.net")) {
      showProgress("Starting Battle.net Application");
      const ls = spawn(bnetPath, [], {
        detached: true,
        stdio: "ignore",
        windowsVerbatimArguments: true,
      });
      ls.unref();
      await sleep(5000);
    }

    while (!processRunning("Battle.Net.Exe", "Battle.net")) {
      showProgress("Waiting for Battle.net to start");
      await sleep(1000);
    }

    showProgress("Activating W3Champions");
    try {
      if (fs.existsSync(w3cDir)) {
        deleteRecursive(w3cDir);
      }
    } catch (e) {}

    fs.mkdirSync(w3cDir);
    fs.writeFileSync(
      w3cDir + path.sep + "index.html",
      '<!DOCTYPE html><html> <head> <meta charset="utf-8"/> <title>Warcraft 3 UI</title> <meta name="viewport" content="width=device-width, minimum-scale=1.0, initial-scale=1.0, minimal-ui"/> <script>window.__DEBUG=new Boolean("").valueOf(); </script> </head> <body> <div id="root"></div><div id="portal"></div><script>var logCalls=[];var w3cClientVersion = 1;console.origLog=console.log;console.log=(...args)=>{logCalls.push(...args);console.origLog("log");console.origLog(...args);}</script> <script src="GlueManager.js"></script><script src="http://w3champions.com/integration/w3champions.js"></script> </body></html>'
    );

    while (!processRunning("Warcraft III.exe", "Warcraft\\ III")) {
      showProgress("Starting Warcraft III");

      const ls = spawn(bnetPath, ["--exec=launch W3"], {
        detached: true,
      });
      ls.stdout.pipe(process.stdout);
      console.log(bnetPath + ' --exec="launch W3"');
      ls.unref();
      await sleep(10000);
    }

    setTimeout(() => {
      launchWindow.hide();
    }, 3000);
    setTimeout(() => {
      deleteRecursive(w3cDir);
      app.quit();
    }, 45000);
  } catch (e) {
    showError(e.message);
    console.trace();
    return;
  }
}

launchWindow.webContents.on("new-window", function (event, url) {
  event.preventDefault();
  shell.openExternal(url);
});

/**********************
 * Patching
 ***********************/
const patchfilePath = clientServer + "patcher/patch.json";
const dowloadBase = clientServer + "patcher/patches/";
let currentPatchHash = "";
let currentVersionInfo = "";
let patchSourcePath = "";
let currentPatchHashPath = "";
let currentVersionFile = "";

async function patchingMain() {
  try {
    patchSourcePath = $w3cMapsDir;
    currentPatchHashPath = $workingDir + path.sep + "patch.hash";

    if (!fs.existsSync(patchSourcePath)) {
      fs.mkdirSync(patchSourcePath);
    }

    if (fs.existsSync(currentPatchHashPath)) {
      currentPatchHash = fs.readFileSync(currentPatchHashPath).toString();
    }

    const isPatchingRequired = await patchingRequired();
    if (!isPatchingRequired) {
      showProgress("No patching required, latest patches loaded");
    }
    if (!isPatchingRequired || (await doPatching())) {
      if (!isPatchingRequired && fs.existsSync(currentVersionFile)) {
        currentVersionInfo = fs.readFileSync(currentVersionFile).toString();
      }
      return true;
    } else {
      throw new Error("unable to patch");
    }
  } catch (e) {
    throw new Error("patching error: " + e);
  }
}

async function patchingRequired() {
  try {
    const patchData = JSON.parse(await getWebContent(patchfilePath));
    return (
      patchData.version != currentPatchHash ||
      currentPatchHash == "" ||
      currentPatchHash == null ||
      currentPatchHash == undefined
    );
  } catch (e) {
    return false;
  }
}

async function doPatching() {
  if (fs.existsSync(currentPatchHashPath)) {
    fs.unlinkSync(currentPatchHashPath);
  }

  const patchData = JSON.parse(await getWebContent(patchfilePath));

  const newPatchHash = patchData.version;
  const hashes = patchData.hashes;

  let currentFiles = {};
  for (const filePath of getFilesRecursive(patchSourcePath)) {
    const hash = await getFileHash(filePath);
    currentFiles[filePath.replace(patchSourcePath, "") + ":" + hash] = filePath;
  }

  let targetFiles = {};
  for (const hashObject of hashes) {
    const targetPath = hashObject.path.replace(/\//g, path.sep);
    targetFiles[targetPath + ":" + hashObject.hash] = {
      url: dowloadBase + hashObject.path,
      path: targetPath,
    };
  }

  // delete all not required files
  const filesToRemove = [];
  for (const key of Object.keys(currentFiles)) {
    if (targetFiles[key] == undefined) {
      filesToRemove.push(currentFiles[key]);
    }
  }

  for (let i = 0; i < filesToRemove.length; i++) {
    showProgress(
      "Cleaning up patch files (" + i + "/" + filesToRemove.length + ")"
    );
    fs.unlinkSync(filesToRemove[i]);
  }

  showProgress("Cleaning up patch folders");
  cleanEmptyFoldersRecursively(patchSourcePath);

  const filesToDownload = [];
  for (const key of Object.keys(targetFiles)) {
    if (currentFiles[key] == undefined) {
      filesToDownload.push(targetFiles[key]);
    }
  }

  for (let i = 0; i < filesToDownload.length; i++) {
    showProgress(
      "Downloading balance patches (" + i + "/" + filesToDownload.length + ")"
    );
    const url = filesToDownload[i].url;
    const relativetargetPath = filesToDownload[i].path;
    const absoluteTargetPath = patchSourcePath + relativetargetPath;
    const absoluteTargetDir = path.dirname(absoluteTargetPath);
    mkDirByPathSync(absoluteTargetDir);
    await getWebContent(url, fs.createWriteStream(absoluteTargetPath));
  }

  currentPatchHash = newPatchHash;
  fs.writeFileSync(currentPatchHashPath, currentPatchHash);
  return true;
}

/**********************
 * IO UTILITY FUNCTIONS
 ***********************/
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function processRunning(win, mac, linux) {
  const plat = process.platform;
  const cmd =
    plat == "win32"
      ? 'tasklist /FI "STATUS eq RUNNING"'
      : plat == "darwin"
      ? "ps -ax | grep " + mac
      : plat == "linux"
      ? "ps -A"
      : "";
  const proc =
    plat == "win32"
      ? win
      : plat == "darwin"
      ? mac.replace("\\", "")
      : plat == "linux"
      ? linux
      : "";

  if (cmd === "" || proc === "") {
    return false;
  }
  return (
    execSync(cmd)
      .toString()
      .replace("grep " + proc, "")
      .toLowerCase()
      .indexOf(proc.toLowerCase()) > -1
  );
}

function getFileHash(targetPath) {
  return new Promise((resolve) => {
    if (!fs.existsSync(targetPath)) {
      resolve("");
    }
    var fd = fs.createReadStream(targetPath);
    var hash = crypto.createHash("sha1");
    hash.setEncoding("base64");

    fd.on("end", function () {
      hash.end();
      resolve(hash.read()); // the desired sha1sum
    });

    // read all file and pipe it (write it) to the hash object
    fd.pipe(hash);
  });
}

function getFilesRecursive(dir) {
  return fs
    .readdirSync(dir)
    .reduce(
      (files, file) =>
        fs.statSync(path.join(dir, file)).isDirectory()
          ? files.concat(getFilesRecursive(path.join(dir, file)))
          : files.concat(path.join(dir, file)),
      []
    );
}

function mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
  const initDir = path.isAbsolute(targetDir) ? path.sep : "";
  const baseDir = isRelativeToScript ? __dirname : ".";

  return targetDir.split(path.sep).reduce((parentDir, childDir) => {
    const curDir = path.resolve(baseDir, parentDir, childDir);

    var exists = true;
    try {
      exists = fs.existsSync(curDir);
    } catch (err) {}

    if (!exists) {
      try {
        fs.mkdirSync(curDir);
      } catch (err) {
        if (err.code === "EEXIST") {
          // curDir already exists!
          return curDir;
        }

        // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
        if (err.code === "ENOENT") {
          // Throw the original parentDir error on curDir `ENOENT` failure.
          throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`);
        }

        const caughtErr = ["EACCES", "EPERM", "EISDIR"].indexOf(err.code) > -1;
        if (!caughtErr || (caughtErr && curDir === path.resolve(targetDir))) {
          throw err; // Throw if it's just the last created dir.
        }
      }
    }
    return curDir;
  }, initDir);
}

function copyFileSync(source, target) {
  var targetFile = target;
  if (fs.existsSync(target)) {
    if (fs.lstatSync(target).isDirectory()) {
      targetFile = path.join(target, path.basename(source));
    }
  }

  fs.writeFileSync(targetFile, fs.readFileSync(source));
}

function copyFolderRecursiveSync(source, target, includeSourceFolder = true) {
  var files = [];
  var targetFolder = includeSourceFolder
    ? path.join(target, path.basename(source))
    : target;
  if (!fs.existsSync(targetFolder)) {
    fs.mkdirSync(targetFolder);
  }

  //copy
  if (fs.lstatSync(source).isDirectory()) {
    files = fs.readdirSync(source);
    files.forEach(function (file) {
      var curSource = path.join(source, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, targetFolder);
      } else {
        copyFileSync(curSource, targetFolder);
      }
    });
  }
}

function deleteRecursive(targetPath) {
  var files = [];
  if (fs.existsSync(targetPath)) {
    if (fs.lstatSync(targetPath).isDirectory()) {
      files = fs.readdirSync(targetPath);
      files.forEach(function (file, index) {
        var curPath = targetPath + path.sep + file;
        if (fs.lstatSync(curPath).isDirectory()) {
          // recurse
          deleteRecursive(curPath);
        } else {
          // delete file
          fs.unlinkSync(curPath);
        }
      });
      fs.rmdirSync(targetPath);
    } else {
      fs.unlinkSync(targetPath);
    }
  }
}

function cleanEmptyFoldersRecursively(folder) {
  var fs = require("fs");
  var path = require("path");

  var isDir = fs.statSync(folder).isDirectory();
  if (!isDir) {
    return;
  }
  var files = fs.readdirSync(folder);
  if (files.length > 0) {
    files.forEach(function (file) {
      var fullPath = path.join(folder, file);
      cleanEmptyFoldersRecursively(fullPath);
    });

    // re-evaluate files; after deleting subfolder
    // we may have parent folder empty now
    files = fs.readdirSync(folder);
  }

  if (files.length == 0) {
    fs.rmdirSync(folder);
    return;
  }
}

/**********************
 * WEB UTILITY FUNCTIONS
 ***********************/

function getWebContent(url, filestream = undefined) {
  return new Promise((resolve, reject) => {
    restClient
      .get(url, (res) => {
        var body = "";

        if (res.statusCode != 200) {
          reject();
        } else if (filestream) {
          res.pipe(filestream);
        } else {
          res.on("data", function (chunk) {
            body += chunk;
          });
        }

        res.on("end", function () {
          if (res.statusCode == 200) {
            resolve(body);
          } else {
            reject();
          }
        });
      })
      .on("error", (e) => {
        reject();
      });
  });
}

function getBinaryWebContent(url) {
  return new Promise((resolve, reject) => {
    restClient
      .get(url, (res) => {
        var data = [];

        if (res.statusCode != 200) {
          reject();
        }

        res
          .on("data", function (chunk) {
            data.push(chunk);
          })
          .on("end", function () {
            if (res.statusCode == 200) {
              var buffer = Buffer.concat(data);
              resolve(buffer);
            } else {
              reject();
            }
          });
      })
      .on("error", (e) => {
        reject();
      });
  });
}

const windowStateKeeper = function (options) {
  const app = electron.app || electron.remote.app;
  const screen = electron.screen || electron.remote.screen;
  let state;
  let winRef;
  let stateChangeTimer;
  const eventHandlingDelay = 100;
  const config = Object.assign(
    {
      file: "window-state.json",
      path: app.getPath("userData"),
      maximize: true,
      fullScreen: true,
    },
    options
  );
  const fullStoreFileName = path.join(config.path, config.file);

  function isNormal(win) {
    return !win.isMaximized() && !win.isMinimized() && !win.isFullScreen();
  }

  function hasBounds() {
    return (
      state &&
      Number.isInteger(state.x) &&
      Number.isInteger(state.y) &&
      Number.isInteger(state.width) &&
      state.width > 0 &&
      Number.isInteger(state.height) &&
      state.height > 0
    );
  }

  function resetStateToDefault() {
    const displayBounds = screen.getPrimaryDisplay().bounds;

    // Reset state to default values on the primary display
    state = {
      width: config.defaultWidth || 800,
      height: config.defaultHeight || 600,
      x: 0,
      y: 0,
      displayBounds,
    };
  }

  function windowWithinBounds(bounds) {
    return (
      state.x >= bounds.x &&
      state.y >= bounds.y &&
      state.x + state.width <= bounds.x + bounds.width &&
      state.y + state.height <= bounds.y + bounds.height
    );
  }

  function ensureWindowVisibleOnSomeDisplay() {
    const visible = screen.getAllDisplays().some((display) => {
      return windowWithinBounds(display.bounds);
    });

    if (!visible) {
      // Window is partially or fully not visible now.
      // Reset it to safe defaults.
      return resetStateToDefault();
    }
  }

  function validateState() {
    const isValid =
      state && (hasBounds() || state.isMaximized || state.isFullScreen);
    if (!isValid) {
      state = null;
      return;
    }

    if (hasBounds() && state.displayBounds) {
      ensureWindowVisibleOnSomeDisplay();
    }
  }

  function updateState(win) {
    win = win || winRef;
    if (!win) {
      return;
    }
    // Don't throw an error when window was closed
    try {
      const winBounds = win.getBounds();
      if (isNormal(win)) {
        state.x = winBounds.x;
        state.y = winBounds.y;
        state.width = winBounds.width;
        state.height = winBounds.height;
      }
      state.isMaximized = win.isMaximized();
      state.isFullScreen = win.isFullScreen();
      state.displayBounds = screen.getDisplayMatching(winBounds).bounds;
    } catch (err) {}
  }

  function saveState(win) {
    // Update window state only if it was provided
    if (win) {
      updateState(win);
    }

    // Save state
    try {
      mkDirByPathSync(path.dirname(fullStoreFileName));
      fs.writeFileSync(fullStoreFileName, JSON.stringify(state));
    } catch (err) {
      // Don't care
      while (true);
    }
  }

  function stateChangeHandler() {
    // Handles both 'resize' and 'move'
    clearTimeout(stateChangeTimer);
    stateChangeTimer = setTimeout(updateState, eventHandlingDelay);
  }

  function closeHandler() {
    updateState();
  }

  function closedHandler() {
    // Unregister listeners and save state
    unmanage();
    saveState();
  }

  function manage(win) {
    if (config.maximize && state.isMaximized) {
      win.maximize();
    }
    if (config.fullScreen && state.isFullScreen) {
      win.setFullScreen(true);
    }
    win.on("resize", stateChangeHandler);
    win.on("move", stateChangeHandler);
    win.on("close", closeHandler);
    win.on("closed", closedHandler);
    winRef = win;
  }

  function unmanage() {
    if (winRef) {
      winRef.removeListener("resize", stateChangeHandler);
      winRef.removeListener("move", stateChangeHandler);
      clearTimeout(stateChangeTimer);
      winRef.removeListener("close", closeHandler);
      winRef.removeListener("closed", closedHandler);
      winRef = null;
    }
  }

  // Load previous state
  try {
    state = JSON.parse(fs.readFileSync(fullStoreFileName));
  } catch (err) {
    // Don't care
  }

  // Check state validity
  validateState();

  // Set state fallback values
  state = Object.assign(
    {
      width: config.defaultWidth || 800,
      height: config.defaultHeight || 600,
    },
    state
  );

  return {
    get x() {
      return state.x;
    },
    get y() {
      return state.y;
    },
    get width() {
      return state.width;
    },
    get height() {
      return state.height;
    },
    get displayBounds() {
      return state.displayBounds;
    },
    get isMaximized() {
      return state.isMaximized;
    },
    get isFullScreen() {
      return state.isFullScreen;
    },
    saveState,
    unmanage,
    manage,
    resetStateToDefault,
  };
};

main();
