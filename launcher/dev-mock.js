const origRequire = require;
require = (id) => {
    if (id == "electron") {
        return { shell: undefined, dialog: {
            showMessageBox: () => 0
        } };
    } else {
        return origRequire(id);
    }
}

app = {
    requestSingleInstanceLock: () => true,
    quit: () => { },
    on: () => { }
}

launchWindow = {
    webContents: {
        on: () => { }
    },
    hide: () => {}
}

clientServer = "http://localhost:8080/"
isDevMode = true;

function showProgress(msg) {
    console.log(msg);
}

function showError(msg) {
    console.error(msg);
}